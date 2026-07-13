import { google } from 'googleapis';

// スプレッドシートへ書き戻す（アプリでの変更をシートにも反映するため）。
// 読み取り専用ではなく編集スコープを使う。サービスアカウントがシートの
// 「編集者」になっている必要がある（共有設定で付与）。
//
// すべて best-effort：失敗しても DB 操作は成功済みなので、呼び出し側は
// 返り値の ok を見てログ/通知するだけにして、本処理は止めない。

export interface SheetRowFields {
  delivery_date: string;
  delivery_time: string | null;
  project_name: string;
  item: string;
  specification: string | null;
  vendor: string;
  unload_location: string;
  notes: string | null;
}

function getSheetsClient() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!spreadsheetId || !keyJson) return null;
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // 読み書き
  });
  return { sheets: google.sheets({ version: 'v4', auth }), spreadsheetId };
}

// サービスアカウントのメールアドレス（共有設定で編集者に追加してもらうため）
export function getServiceAccountEmail(): string | null {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  try { return JSON.parse(keyJson).client_email ?? null; } catch { return null; }
}

function headerIndex(header: string[], names: string[]): number {
  for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
  return -1;
}

const NO_HEADERS = ['No', 'No.', 'ＮＯ', 'Ｎｏ', 'ＮＯ．', '管理番号', 'ID', 'id'];
// 削除の印を書く列（どれかがあれば使う）
export const DELETE_MARK_HEADERS = ['削除', '状態', 'ステータス'];
export const DELETE_MARK_VALUE = '削除';

export function colLetter(idx: number): string {
  let s = ''; let n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

type WriteResult = { ok: boolean; reason?: string };

// No（管理番号）で該当行を探し、内容を書き戻す。
export async function pushDeliveryToSheetByNo(sheetNo: string | null | undefined, f: SheetRowFields): Promise<WriteResult> {
  if (!sheetNo) return { ok: false, reason: 'no-sheet-no' };
  const client = getSheetsClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  try {
    const { sheets, spreadsheetId } = client;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A:Z' });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return { ok: false, reason: 'empty' };
    const header = rows[0] as string[];
    const idxNo = headerIndex(header, NO_HEADERS);
    if (idxNo < 0) return { ok: false, reason: 'no-No-column' };
    const idxDate = header.indexOf('納入予定日');
    const idxTime = header.indexOf('納入予定時刻');
    const idxProject = header.indexOf('物件名');
    const idxItem = header.indexOf('品目');
    const idxSpec = header.indexOf('内容・規格');
    const idxVendor = header.indexOf('業者名');
    const idxUnload = header.indexOf('降し場所');
    const idxNotes = header.indexOf('備考');

    let rowNum = -1; // 1始まりのシート行番号
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idxNo] ?? '').trim() === String(sheetNo).trim()) { rowNum = i + 1; break; }
    }
    if (rowNum < 0) return { ok: false, reason: 'row-not-found' };

    const row = (rows[rowNum - 1] as string[]).slice();
    const setCell = (i: number, v: string | null) => {
      if (i < 0) return;
      while (row.length <= i) row.push('');
      row[i] = v ?? '';
    };
    setCell(idxDate, f.delivery_date);
    setCell(idxTime, f.delivery_time);
    setCell(idxProject, f.project_name);
    setCell(idxItem, f.item);
    setCell(idxSpec, f.specification);
    setCell(idxVendor, f.vendor);
    setCell(idxUnload, f.unload_location);
    setCell(idxNotes, f.notes);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}

// アプリで削除したとき、シートの該当行の「削除」列に印をつける（行は残す）。
// 削除用の列（削除/状態/ステータス）が無い場合は何もしない（No紐付けでアプリ側は復活しない）。
export async function markSheetRowDeletedByNo(sheetNo: string | null | undefined): Promise<WriteResult> {
  if (!sheetNo) return { ok: false, reason: 'no-sheet-no' };
  const client = getSheetsClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  try {
    const { sheets, spreadsheetId } = client;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A:Z' });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return { ok: false, reason: 'empty' };
    const header = rows[0] as string[];
    const idxNo = headerIndex(header, NO_HEADERS);
    if (idxNo < 0) return { ok: false, reason: 'no-No-column' };
    const idxMark = headerIndex(header, DELETE_MARK_HEADERS);
    if (idxMark < 0) return { ok: false, reason: 'no-mark-column' };
    let rowNum = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idxNo] ?? '').trim() === String(sheetNo).trim()) { rowNum = i + 1; break; }
    }
    if (rowNum < 0) return { ok: false, reason: 'row-not-found' };
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${colLetter(idxMark)}${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[DELETE_MARK_VALUE]] },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}
