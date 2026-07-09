import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

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
      dateVal: string; project: string; item: string;
      specVal: string | null; vendorVal: string; unloadVal: string;
      timeVal: string | null; notesVal: string | null;
    };
    const norm = (v: string | null) => v ?? '';
    const keyOf = (c: { delivery_date: string; project_name: string; item: string; specification: string | null; vendor: string; unload_location: string; delivery_time: string | null; }) =>
      JSON.stringify([c.delivery_date, c.project_name, c.item, norm(c.specification), c.vendor, c.unload_location, norm(c.delivery_time)]);

    // 1) シートの取り込み対象行を集める
    const candidates: Cand[] = [];
    for (const row of rows.slice(1)) {
      const dateVal = normalizeDate(idxDate >= 0 ? row[idxDate] : '');
      const project = idxProject >= 0 ? String(row[idxProject] ?? '').trim() : '';
      const item = idxItem >= 0 ? String(row[idxItem] ?? '').trim() : '';
      if (!dateVal || !project || !item) { skipped++; continue; }
      if (dateVal < minDate) { skipped++; continue; }
      const vendorVal = (idxVendor >= 0 ? String(row[idxVendor] ?? '').trim() : '') || '未設定';
      const unloadVal = (idxUnload >= 0 ? String(row[idxUnload] ?? '').trim() : '') || '未設定';
      const specVal = idxSpec >= 0 ? String(row[idxSpec] ?? '').trim() || null : null;
      const timeVal = idxTime >= 0 ? String(row[idxTime] ?? '').trim() || null : null;
      const notesVal = idxNotes >= 0 ? String(row[idxNotes] ?? '').trim() || null : null;
      candidates.push({ dateVal, project, item, specVal, vendorVal, unloadVal, timeVal, notesVal });
    }

    // 2) DBの既存件数を同一キーで数える（直近3か月分）
    const { data: existing, error: existingErr } = await supabase
      .from('deliveries')
      .select('delivery_date, project_name, item, specification, vendor, unload_location, delivery_time')
      .gte('delivery_date', minDate);
    if (existingErr) throw existingErr;
    const dbCount = new Map<string, number>();
    for (const e of existing ?? []) {
      const k = keyOf(e as never);
      dbCount.set(k, (dbCount.get(k) ?? 0) + 1);
    }

    // 3) シートを同一キーでグループ化し、DBに足りない件数だけ追加する
    const groups = new Map<string, Cand[]>();
    for (const c of candidates) {
      const k = keyOf({
        delivery_date: c.dateVal, project_name: c.project, item: c.item,
        specification: c.specVal, vendor: c.vendorVal, unload_location: c.unloadVal, delivery_time: c.timeVal,
      });
      const arr = groups.get(k); if (arr) arr.push(c); else groups.set(k, [c]);
    }
    for (const [k, list] of groups) {
      const have = dbCount.get(k) ?? 0;
      const need = list.length - have;
      for (let i = 0; i < need; i++) {
        const c = list[i];
        toInsert.push({
          delivery_date: c.dateVal,
          delivery_time: c.timeVal,
          project_name: c.project,
          item: c.item,
          specification: c.specVal,
          vendor: c.vendorVal,
          unload_location: c.unloadVal,
          notes: c.notesVal,
          status: '予定',
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('deliveries').insert(toInsert);
      if (insertError) throw insertError;
    }
    const imported = toInsert.length;
    skipped = candidates.length - imported;

    return NextResponse.json({ imported, skipped });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `エラー: ${e}` }, { status: 500 });
  }
}
