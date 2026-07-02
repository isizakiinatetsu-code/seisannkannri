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
  const denied = requireEditRole(req);
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

    // 過去に "/" 形式で保存された不正日付レコードを削除（一度きりの修復）
    const { data: badRecords } = await supabase
      .from('deliveries')
      .select('id')
      .like('delivery_date', '%/%');
    if (badRecords && badRecords.length > 0) {
      const badIds = badRecords.map((r: { id: number }) => r.id);
      await supabase.from('deliveries').delete().in('id', badIds);
      console.log(`Deleted ${badIds.length} records with malformed dates`);
    }

    // 直近3か月の範囲でのみインポート
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const minDate = threeMonthsAgo.toISOString().slice(0, 10);

    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const toInsert: Record<string, unknown>[] = [];

    console.log('Column indices:', { idxDate, idxTime, idxProject, idxItem, idxSpec, idxVendor, idxUnload, idxNotes });

    for (const row of rows.slice(1)) {
      const dateVal = normalizeDate(idxDate >= 0 ? row[idxDate] : '');
      const project = idxProject >= 0 ? String(row[idxProject] ?? '').trim() : '';
      const item = idxItem >= 0 ? String(row[idxItem] ?? '').trim() : '';
      if (!dateVal || !project || !item) { skipped++; continue; }
      // 直近3か月より古いデータはスキップ
      if (dateVal < minDate) { skipped++; continue; }

      const vendorRaw = idxVendor >= 0 ? String(row[idxVendor] ?? '').trim() : '';
      const unloadRaw = idxUnload >= 0 ? String(row[idxUnload] ?? '').trim() : '';
      const vendorVal = vendorRaw || '未設定';
      const unloadVal = unloadRaw || '未設定';
      const specVal = idxSpec >= 0 ? String(row[idxSpec] ?? '').trim() || null : null;
      const timeVal = idxTime >= 0 ? String(row[idxTime] ?? '').trim() || null : null;
      const notesVal = idxNotes >= 0 ? String(row[idxNotes] ?? '').trim() || null : null;

      // 重複判定は「日付＋物件名＋品目＋業者名＋内容・規格」で行う。
      // 同じ日・同じ物件・同じ品目でも、業者や規格（便）が違えば別の納入として取り込む。
      // （以前は日付＋物件名＋品目だけで判定していたため、同日同品目の別便が
      //   重複扱いで取り込まれずに漏れていた）
      let dupQuery = supabase
        .from('deliveries')
        .select('id')
        .eq('delivery_date', dateVal)
        .eq('project_name', project)
        .eq('item', item)
        .eq('vendor', vendorVal);
      dupQuery = specVal === null ? dupQuery.is('specification', null) : dupQuery.eq('specification', specVal);
      const { data: dup, error: dupError } = await dupQuery.limit(1).maybeSingle();
      if (dupError) throw dupError;
      if (dup) {
        skipped++;
        continue;
      }

      toInsert.push({
        delivery_date: dateVal,
        delivery_time: timeVal,
        project_name: project,
        item,
        specification: specVal,
        vendor: vendorVal,
        unload_location: unloadVal,
        notes: notesVal,
        status: '予定',
      });
      imported++;
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('deliveries').insert(toInsert);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ imported, updated, skipped });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `エラー: ${e}` }, { status: 500 });
  }
}
