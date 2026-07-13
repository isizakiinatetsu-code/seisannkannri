import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !keyJson) return NextResponse.json({ error: '環境変数未設定' }, { status: 500 });
    const credentials = JSON.parse(keyJson);
    const serviceAccountEmail: string | null = credentials.client_email ?? null;
    // 読み書きスコープで接続（書き込みできるか確認するため）
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A1:Z5' });

    // ---- 書き込みテスト：A1 の値を A1 に書き戻す（内容は変わらない no-op）----
    let writeOk = false;
    let writeError: string | null = null;
    try {
      const a1 = res.data.values?.[0]?.[0] ?? '納入予定日';
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: 'A1', valueInputOption: 'RAW', requestBody: { values: [[a1]] },
      });
      writeOk = true;
    } catch (e) {
      const err = e as { errors?: { message?: string }[]; message?: string; code?: number };
      writeError = (err?.errors?.[0]?.message || err?.message || String(e)).slice(0, 300);
    }
    const rows = res.data.values ?? [];
    const header = rows[0] ?? [];

    const idxDate = header.indexOf('納入予定日');
    const idxVendor = header.indexOf('業者名');
    const idxProject = header.indexOf('物件名');
    const idxItem = header.indexOf('品目');

    // 業者名が空白を含む形で存在するか探す
    const vendorColSearch = header.map((h: string, i: number) => ({ col: i, letter: String.fromCharCode(65 + i), header: h, charCodes: [...h].map(c => c.charCodeAt(0)) }))
      .filter((x: { col: number; letter: string; header: string; charCodes: number[] }) => x.header.includes('業者') || x.header.includes('vendor'));

    return NextResponse.json({
      サービスアカウント: serviceAccountEmail,
      書き込みできるか: writeOk,
      書き込みエラー: writeError,
      No列がある: header.includes('No'),
      totalColumns: header.length,
      header,
      indices: { idxDate, idxVendor, idxProject, idxItem },
      vendorColSearch,
      rows: rows.slice(1, 5).map((r: string[]) => ({
        date: r[idxDate] ?? null,
        project: r[idxProject] ?? null,
        item: r[idxItem] ?? null,
        vendor: r[idxVendor] ?? null,
        raw: r,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
