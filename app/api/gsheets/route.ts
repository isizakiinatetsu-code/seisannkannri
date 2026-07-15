import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';
import { isMissingColumnError } from '@/lib/dbErrors';
import { prepareAndCollectSheet, SheetCandidate, applyColorsByContent } from '@/lib/gsheetsWrite';
import { IMPL_START_DATE } from '@/lib/constants';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !keyJson) return NextResponse.json({ error: '環境変数未設定' }, { status: 500 });
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(title)' });
    const tabs = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '');
    return NextResponse.json({ tabs });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();

    // 運用開始日(2026-07-01)以降のみインポート（それより前の過去データは取り込まない）
    const minDate = IMPL_START_DATE;

    // スプレッドシートを年タブ(2025/2026...)に整備・移行し、取り込み候補を集める。
    const prep = await prepareAndCollectSheet(minDate);
    const sheetSetup = prep.setup;
    if (!prep.ok) {
      return NextResponse.json({ error: `シート整備に失敗しました：${prep.reason ?? ''}（サービスアカウントに編集者権限があるか確認してください）`, sheetSetup }, { status: 500 });
    }
    const candidates = prep.candidates;

    // 各行は「1行＝1納入」。同内容でも別行なら別の納入。重複判定は「同じ内容の行を
    // 二度取り込まない」ためだけに使い、件数で調整する。
    const norm = (v: string | null) => v ?? '';
    const keyOf = (c: { delivery_date: string; project_name: string; item: string; specification: string | null; vendor: string; unload_location: string; delivery_time: string | null; }) =>
      JSON.stringify([c.delivery_date, c.project_name, c.item, norm(c.specification), c.vendor, c.unload_location, norm(c.delivery_time)]);
    const descOf = (c: SheetCandidate) => ({
      delivery_date: c.dateVal, delivery_time: c.timeVal, project_name: c.project, item: c.item,
      specification: c.specVal, vendor: c.vendorVal, unload_location: c.unloadVal, notes: c.notesVal,
    });

    const toInsert: Record<string, unknown>[] = [];
    let updated = 0;
    let withNo = candidates.filter(c => c.no);
    let withoutNo = candidates.filter(c => !c.no);
    const toUpdate: { id: number; fields: Record<string, unknown> }[] = [];

    // 既存行を1回だけ取得（No照合・採用・件数の全てに使う）。
    type ExRow = { id: number; sheet_no?: string | null; deleted?: boolean | null; status?: string;
      delivery_date: string; delivery_time: string | null; project_name: string; item: string;
      specification: string | null; vendor: string; unload_location: string; notes: string | null; };
    const fullSel = 'id, sheet_no, deleted, status, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, notes';
    const minSel = 'id, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, notes';
    type SelResult = { data: unknown; error: { code?: string; message?: string } | null };
    let existing: ExRow[] = [];
    {
      let r = await supabase.from('deliveries').select(fullSel).gte('delivery_date', minDate) as SelResult;
      if (r.error && isMissingColumnError(r.error)) {
        withoutNo = candidates; withNo = [];
        r = await supabase.from('deliveries').select(minSel).gte('delivery_date', minDate) as SelResult;
      }
      if (r.error) throw r.error;
      existing = (r.data ?? []) as ExRow[];
    }

    const bySheetNo = new Map<string, ExRow>();
    const byContentFree = new Map<string, ExRow[]>();
    const dbCount = new Map<string, number>();
    for (const e of existing) {
      const k = keyOf(e);
      dbCount.set(k, (dbCount.get(k) ?? 0) + 1);
      if (e.sheet_no) bySheetNo.set(String(e.sheet_no), e);
      else { const a = byContentFree.get(k) ?? []; a.push(e); byContentFree.set(k, a); }
    }
    for (const arr of byContentFree.values()) arr.sort((a, b) => (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0));

    const changedVs = (ex: ExRow, desc: ReturnType<typeof descOf>) =>
      ex.delivery_date !== desc.delivery_date ||
      (ex.delivery_time ?? null) !== (desc.delivery_time ?? null) ||
      ex.project_name !== desc.project_name || ex.item !== desc.item ||
      (ex.specification ?? null) !== (desc.specification ?? null) ||
      ex.vendor !== desc.vendor || ex.unload_location !== desc.unload_location ||
      (ex.notes ?? null) !== (desc.notes ?? null);

    // 2) 「No」を持つ行：Noで照合。無ければ“同じ内容の既存行”にNoを付けて採用。
    const insertedNos = new Set<string>();
    const adoptedIds = new Set<number>();
    for (const c of withNo) {
      const desc = descOf(c);
      const ex = bySheetNo.get(c.no);
      if (ex) {
        // シートに（削除印なしで）存在する行なので、DB側が削除済みでも復活させて表示する。
        const fields: Record<string, unknown> = changedVs(ex, desc) ? { ...desc } : {};
        if (ex.deleted) fields.deleted = false;
        if (Object.keys(fields).length > 0) toUpdate.push({ id: ex.id, fields });
        continue;
      }
      const pool = (byContentFree.get(keyOf({ ...desc })) ?? []).filter(r => !adoptedIds.has(r.id));
      if (pool.length > 0) {
        const adopt = pool[0];
        adoptedIds.add(adopt.id);
        // シートに（削除印なしで）存在する行なので、DB側が削除済みでも復活させて表示する。
        toUpdate.push({ id: adopt.id, fields: { ...desc, sheet_no: c.no, deleted: false } });
      } else if (!insertedNos.has(c.no)) {
        insertedNos.add(c.no);
        toInsert.push({ ...desc, status: '予定', sheet_no: c.no });
      }
    }

    // 3) 「No」が無い行：同一内容の件数がDBに足りない分だけ追加。
    if (withoutNo.length > 0) {
      const groups = new Map<string, SheetCandidate[]>();
      for (const c of withoutNo) {
        const k = keyOf({ ...descOf(c) });
        const arr = groups.get(k); if (arr) arr.push(c); else groups.set(k, [c]);
      }
      for (const [k, list] of groups) {
        const have = dbCount.get(k) ?? 0;
        const need = list.length - have;
        for (let i = 0; i < need; i++) toInsert.push({ ...descOf(list[i]), status: '予定' });
      }
    }

    // 4) 更新を適用（編集の反映）
    for (const u of toUpdate) {
      const { error: upErr } = await supabase.from('deliveries').update(u.fields).eq('id', u.id);
      if (upErr) throw upErr;
      updated++;
    }

    // 5) 追加を適用（sheet_no 列が無ければ外して再挿入）
    if (toInsert.length > 0) {
      let { error: insertError } = await supabase.from('deliveries').insert(toInsert);
      if (insertError && isMissingColumnError(insertError)) {
        const stripped = toInsert.map(r => { const c = { ...r }; delete c.sheet_no; return c; });
        ({ error: insertError } = await supabase.from('deliveries').insert(stripped));
      }
      if (insertError) throw insertError;
    }
    const imported = toInsert.length;
    const skipped = candidates.length - imported - updated;

    // 現在「納入済み」の予定をシート上でまとめて着色する（過去分も含めて一括反映）。
    // No紐付けのズレに影響されないよう、内容（日付・物件・品目…）でシート行を判定する。
    let colored = 0;
    try {
      const deliveredKeys: string[] = [];
      const presentKeys: string[] = [];
      for (const e of existing) {
        if (e.deleted) continue;
        const k = keyOf(e);
        if (e.status === '納入済み') deliveredKeys.push(k);
        else presentKeys.push(k);
      }
      const cr = await applyColorsByContent(deliveredKeys, presentKeys);
      colored = cr.colored;
    } catch { /* 着色は best-effort */ }

    return NextResponse.json({ imported, updated, skipped, colored, sheetSetup });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `エラー: ${e}` }, { status: 500 });
  }
}
