import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';

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
      range: 'A:Z',
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

    // 日付を "2026/5/1" → "2026-05-01" に正規化
    function normalizeDate(raw: string): string {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      return d.toISOString().slice(0, 10);
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
      const dateVal = normalizeDate(idxDate >= 0 ? (row[idxDate] ?? '').trim() : '');
      const project = idxProject >= 0 ? (row[idxProject] ?? '').trim() : '';
      const item = idxItem >= 0 ? (row[idxItem] ?? '').trim() : '';
      if (!dateVal || !project || !item) { skipped++; continue; }
      // 直近3か月より古いデータはスキップ
      if (dateVal < minDate) { skipped++; continue; }

      const vendorRaw = idxVendor >= 0 ? (row[idxVendor] ?? '').trim() : '';
      const unloadRaw = idxUnload >= 0 ? (row[idxUnload] ?? '').trim() : '';
      const vendorVal = vendorRaw || '未設定';
      const unloadVal = unloadRaw || '未設定';
      const specVal = idxSpec >= 0 ? (row[idxSpec] ?? '').trim() || null : null;
      const timeVal = idxTime >= 0 ? (row[idxTime] ?? '').trim() || null : null;
      const notesVal = idxNotes >= 0 ? (row[idxNotes] ?? '').trim() || null : null;

      const { data: dup, error: dupError } = await supabase
        .from('deliveries')
        .select('id, vendor, unload_location')
        .eq('delivery_date', dateVal)
        .eq('project_name', project)
        .eq('item', item)
        .limit(1)
        .maybeSingle();
      if (dupError) throw dupError;
      if (dup) {
        // 業者名・降し場所が「未設定」で、スプレッドシートに実値がある場合は更新する
        const needsUpdate = (dup.vendor === '未設定' && vendorVal !== '未設定') ||
                            (dup.unload_location === '未設定' && unloadVal !== '未設定');
        if (needsUpdate) {
          const { error: updateError } = await supabase.from('deliveries').update({
            vendor: vendorVal,
            unload_location: unloadVal,
            specification: specVal,
            delivery_time: timeVal,
          }).eq('id', dup.id);
          if (updateError) {
            console.error('Update error for id', dup.id, updateError);
          } else {
            updated++;
            console.log(`Updated id=${dup.id}: vendor="${vendorVal}", unload="${unloadVal}"`);
          }
        }
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
