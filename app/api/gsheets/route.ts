import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';

export async function POST() {
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
      range: 'A:H',
    });

    const rows = res.data.values ?? [];
    if (rows.length < 2) {
      return NextResponse.json({ error: 'スプレッドシートにデータがありません' }, { status: 400 });
    }

    const header = rows[0];
    const idxDate = header.indexOf('納入予定日');
    const idxTime = header.indexOf('納入予定時刻');
    const idxProject = header.indexOf('物件名');
    const idxItem = header.indexOf('品目');
    const idxSpec = header.indexOf('内容・規格');
    const idxVendor = header.indexOf('業者名');
    const idxUnload = header.indexOf('降し場所');
    const idxNotes = header.indexOf('備考');

    const supabase = getSupabase();

    // 直近3か月の範囲でのみインポート
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const minDate = threeMonthsAgo.toISOString().slice(0, 10);

    let imported = 0;
    let skipped = 0;
    const toInsert: Record<string, unknown>[] = [];

    for (const row of rows.slice(1)) {
      const dateVal = idxDate >= 0 ? (row[idxDate] ?? '').trim() : '';
      const project = idxProject >= 0 ? (row[idxProject] ?? '').trim() : '';
      const item = idxItem >= 0 ? (row[idxItem] ?? '').trim() : '';
      if (!dateVal || !project || !item) { skipped++; continue; }
      // 直近3か月より古いデータはスキップ
      if (dateVal < minDate) { skipped++; continue; }

      const { data: dup, error: dupError } = await supabase
        .from('deliveries')
        .select('id')
        .eq('delivery_date', dateVal)
        .eq('project_name', project)
        .eq('item', item)
        .limit(1)
        .maybeSingle();
      if (dupError) throw dupError;
      if (dup) { skipped++; continue; }

      toInsert.push({
        delivery_date: dateVal,
        delivery_time: idxTime >= 0 ? (row[idxTime] ?? null) || null : null,
        project_name: project,
        item,
        specification: idxSpec >= 0 ? (row[idxSpec] ?? null) || null : null,
        vendor: (idxVendor >= 0 ? row[idxVendor] : '') || '未設定',
        unload_location: (idxUnload >= 0 ? row[idxUnload] : '') || '未設定',
        notes: idxNotes >= 0 ? (row[idxNotes] ?? null) || null : null,
        status: '予定',
      });
      imported++;
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('deliveries').insert(toInsert);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ imported, skipped });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `エラー: ${e}` }, { status: 500 });
  }
}
