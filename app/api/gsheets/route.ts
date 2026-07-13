import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';
import { isMissingColumnError } from '@/lib/dbErrors';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !keyJson) return NextResponse.json({ error: '環境変数未設定' }, { status: 500 });
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A1:Z2' });
    return NextResponse.json({ headers: res.data.values?.[0] ?? [], row2: res.data.values?.[1] ?? [] });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !keyJson) {
      return NextResponse.json({ error: '環境変数が設定されていません' }, { status: 500 });
    }

    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:Z',
      // 日付セルを表示形式(例: 5/1(木))ではなくシリアル値/生値で取得し、
      // 表示形式に依存せず日付を正しく解釈できるようにする。
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const rows = res.data.values ?? [];
    if (rows.length < 2) {
      return NextResponse.json({ error: 'スプレッドシートにデータがありません' }, { status: 400 });
    }

    const header = rows[0];
    console.log('Spreadsheet headers:', JSON.stringify(header));
    const idxDate = header.indexOf('納入予定日');
    const idxTime = header.indexOf('納入予定時刻');
    const idxProject = header.indexOf('物件名');
    const idxItem = header.indexOf('品目');
    const idxSpec = header.indexOf('内容・規格');
    const idxVendor = header.indexOf('業者名');
    const idxUnload = header.indexOf('降し場所');
    const idxNotes = header.indexOf('備考');
    // 「No」列（管理番号）。あれば、これで行を一意に照合して更新／追加する。
    let idxNo = -1;
    for (const h of ['No', 'No.', 'ＮＯ', 'Ｎｏ', 'ＮＯ．', '管理番号', 'ID', 'id']) {
      const i = header.indexOf(h);
      if (i >= 0) { idxNo = i; break; }
    }
    // 「削除」印の列（あれば、その行は取り込まない）
    let idxMark = -1;
    for (const h of ['削除', '状態', 'ステータス']) {
      const i = header.indexOf(h);
      if (i >= 0) { idxMark = i; break; }
    }

    const supabase = getSupabase();

    // 日付を "2026-05-01" 形式に正規化。
    // UNFORMATTED_VALUE では日付セルはGoogleシリアル値(数値)で届くため、それも解釈する。
    function normalizeDate(raw: unknown): string {
      if (typeof raw === 'number') {
        // Googleシリアル値: 1899-12-30 を 0 とした経過日数
        const ms = Date.UTC(1899, 11, 30) + raw * 86400000;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
      }
      const s = String(raw ?? '').trim();
      if (!s) return '';
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      // toISOString はUTC変換のため、JST等では日付が1日ずれる。ローカル成分から組み立てる。
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }

    // 直近3か月の範囲でのみインポート
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const minDate = threeMonthsAgo.toISOString().slice(0, 10);

    let skipped = 0;
    const toInsert: Record<string, unknown>[] = [];

    console.log('Column indices:', { idxDate, idxTime, idxProject, idxItem, idxSpec, idxVendor, idxUnload, idxNotes });

    // スプレッドシートの各行は「1行＝1納入」。フィールドが一致しても別の行なら別の納入。
    // そこで重複判定は「同じ内容の行を二度取り込まない」ためだけに使い、件数で調整する。
    // 例: シートに同内容が2行あってDBに1行なら不足1件だけ追加する（行の取りこぼしゼロ・再同期でも二重登録なし）。
    type Cand = {
      no: string;
      dateVal: string; project: string; item: string;
      specVal: string | null; vendorVal: string; unloadVal: string;
      timeVal: string | null; notesVal: string | null;
    };
    const norm = (v: string | null) => v ?? '';
    const keyOf = (c: { delivery_date: string; project_name: string; item: string; specification: string | null; vendor: string; unload_location: string; delivery_time: string | null; }) =>
      JSON.stringify([c.delivery_date, c.project_name, c.item, norm(c.specification), c.vendor, c.unload_location, norm(c.delivery_time)]);
    // 予定として保存する説明フィールド一式を作る
    const descOf = (c: Cand) => ({
      delivery_date: c.dateVal, delivery_time: c.timeVal, project_name: c.project, item: c.item,
      specification: c.specVal, vendor: c.vendorVal, unload_location: c.unloadVal, notes: c.notesVal,
    });

    // 1) シートの取り込み対象行を集める
    const candidates: Cand[] = [];
    for (const row of rows.slice(1)) {
      const dateVal = normalizeDate(idxDate >= 0 ? row[idxDate] : '');
      const project = idxProject >= 0 ? String(row[idxProject] ?? '').trim() : '';
      const item = idxItem >= 0 ? String(row[idxItem] ?? '').trim() : '';
      if (!dateVal || !project || !item) { skipped++; continue; }
      if (dateVal < minDate) { skipped++; continue; }
      // 「削除」印がついた行は取り込まない
      if (idxMark >= 0 && String(row[idxMark] ?? '').includes('削除')) { skipped++; continue; }
      const vendorVal = (idxVendor >= 0 ? String(row[idxVendor] ?? '').trim() : '') || '未設定';
      const unloadVal = (idxUnload >= 0 ? String(row[idxUnload] ?? '').trim() : '') || '未設定';
      const specVal = idxSpec >= 0 ? String(row[idxSpec] ?? '').trim() || null : null;
      const timeVal = idxTime >= 0 ? String(row[idxTime] ?? '').trim() || null : null;
      const notesVal = idxNotes >= 0 ? String(row[idxNotes] ?? '').trim() || null : null;
      const no = idxNo >= 0 ? String(row[idxNo] ?? '').trim() : '';
      candidates.push({ no, dateVal, project, item, specVal, vendorVal, unloadVal, timeVal, notesVal });
    }

    let updated = 0;
    let withNo = candidates.filter(c => c.no);
    let withoutNo = candidates.filter(c => !c.no);
    const toUpdate: { id: number; fields: Record<string, unknown> }[] = [];

    // 既存行を1回だけ取得（No照合・採用・件数の全てに使う）。
    // sheet_no / deleted 列が無い環境ではそれらを外して取得し、No照合は行わない。
    type ExRow = { id: number; sheet_no?: string | null; deleted?: boolean | null;
      delivery_date: string; delivery_time: string | null; project_name: string; item: string;
      specification: string | null; vendor: string; unload_location: string; notes: string | null; };
    const fullSel = 'id, sheet_no, deleted, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, notes';
    const minSel = 'id, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, notes';
    type SelResult = { data: unknown; error: { code?: string; message?: string } | null };
    let existing: ExRow[] = [];
    {
      let r = await supabase.from('deliveries').select(fullSel).gte('delivery_date', minDate) as SelResult;
      if (r.error && isMissingColumnError(r.error)) {
        // sheet_no / deleted 列が無い → No照合は不可。全行を件数方式へ。
        withoutNo = candidates; withNo = [];
        r = await supabase.from('deliveries').select(minSel).gte('delivery_date', minDate) as SelResult;
      }
      if (r.error) throw r.error;
      existing = (r.data ?? []) as ExRow[];
    }

    const bySheetNo = new Map<string, ExRow>();
    const byContentFree = new Map<string, ExRow[]>(); // 内容キー→sheet_no未設定の行（採用候補）
    const dbCount = new Map<string, number>();
    for (const e of existing) {
      const k = keyOf(e);
      dbCount.set(k, (dbCount.get(k) ?? 0) + 1);
      if (e.sheet_no) bySheetNo.set(String(e.sheet_no), e);
      else { const a = byContentFree.get(k) ?? []; a.push(e); byContentFree.set(k, a); }
    }
    // 採用は「生きている行」を優先（消し済みは後回し）
    for (const arr of byContentFree.values()) arr.sort((a, b) => (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0));

    const changedVs = (ex: ExRow, desc: ReturnType<typeof descOf>) =>
      ex.delivery_date !== desc.delivery_date ||
      (ex.delivery_time ?? null) !== (desc.delivery_time ?? null) ||
      ex.project_name !== desc.project_name || ex.item !== desc.item ||
      (ex.specification ?? null) !== (desc.specification ?? null) ||
      ex.vendor !== desc.vendor || ex.unload_location !== desc.unload_location ||
      (ex.notes ?? null) !== (desc.notes ?? null);

    // 2) 「No」を持つ行：Noで照合。無ければ“同じ内容の既存行”にNoを付けて採用（重複を作らない）。
    const insertedNos = new Set<string>();
    const adoptedIds = new Set<number>();
    for (const c of withNo) {
      const desc = descOf(c);
      const ex = bySheetNo.get(c.no);
      if (ex) {
        // 既にNo紐付け済み → 内容が変わっていれば説明だけ更新（納入済み・伝票・追加者は保持）
        if (changedVs(ex, desc)) toUpdate.push({ id: ex.id, fields: desc });
        continue;
      }
      // 同じ内容で sheet_no 未設定の行（＝アプリで手動追加した等）があれば、それにNoを付けて採用
      const pool = (byContentFree.get(keyOf({ ...desc })) ?? []).filter(r => !adoptedIds.has(r.id));
      if (pool.length > 0) {
        const adopt = pool[0];
        adoptedIds.add(adopt.id);
        // Noを付与（消し済みなら deleted は触らず＝消したものは消したまま。復活させない）
        toUpdate.push({ id: adopt.id, fields: { ...desc, sheet_no: c.no } });
      } else if (!insertedNos.has(c.no)) {
        insertedNos.add(c.no);
        toInsert.push({ ...desc, status: '予定', sheet_no: c.no });
      }
    }

    // 3) 「No」が無い行：同一内容の件数がDBに足りない分だけ追加（削除済みも件数に数える＝復活防止）
    if (withoutNo.length > 0) {
      const groups = new Map<string, Cand[]>();
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
    skipped = candidates.length - imported - updated;

    return NextResponse.json({ imported, updated, skipped });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `エラー: ${e}` }, { status: 500 });
  }
}
