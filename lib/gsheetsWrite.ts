import { google } from 'googleapis';

// スプレッドシートを「年ごとのタブ（2025 / 2026 ...）」に分けて読み書きする。
// - 各年タブは固定の列レイアウト（CANONICAL_HEADERS）で統一する。
// - 旧「シート1」等（年名でないタブ）のデータは、初回同期で年タブへ移動して空にする。
// - 予定の新規追加・日程変更・削除・納入済み着色は、その予定の納入年のタブに対して行う。
//
// すべて best-effort：失敗しても DB 操作は成功済みなので、呼び出し側は返り値の ok を
// 見てログ/通知するだけにして、本処理は止めない。

// 年タブの固定レイアウト（この順で列を作る）
const H = { NO: 0, DATE: 1, TIME: 2, PROJECT: 3, ITEM: 4, SPEC: 5, VENDOR: 6, UNLOAD: 7, NOTES: 8, DEL: 9 };
export const CANONICAL_HEADERS = ['No', '納入予定日', '納入予定時刻', '物件名', '品目', '内容・規格', '業者名', '降し場所', '備考', '削除'];
const CANONICAL_WIDTH = CANONICAL_HEADERS.length;

export const DELETE_MARK_HEADERS = ['削除', '状態', 'ステータス'];
export const DELETE_MARK_VALUE = '削除';
const NO_HEADERS = ['No', 'No.', 'ＮＯ', 'Ｎｏ', 'ＮＯ．', '管理番号', 'ID', 'id'];

// 納入済みの行の背景色（薄い緑）／解除時（白）
const COLOR_DONE = { red: 0.72, green: 0.88, blue: 0.72 };
const COLOR_NONE = { red: 1, green: 1, blue: 1 };

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

type WriteResult = { ok: boolean; reason?: string };
type SheetInfo = { title: string; sheetId: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sheets = any;

function getClient(): { sheets: Sheets; spreadsheetId: string } | null {
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

export function colLetter(idx: number): string {
  let s = ''; let n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

function headerIndex(header: string[], names: string[]): number {
  for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
  return -1;
}

function isYearTitle(t: string): boolean { return /^\d{4}$/.test(t.trim()); }

// 納入日(YYYY-MM-DD 等)から年(YYYY文字列)を取り出す
export function yearOf(dateStr: string | null | undefined): string {
  const m = /^(\d{4})/.exec(String(dateStr ?? '').trim());
  return m ? m[1] : '';
}

// 日付を "YYYY-MM-DD" に正規化（Googleシリアル値/文字列どちらも解釈）
function normalizeDate(raw: unknown): string {
  if (typeof raw === 'number') {
    const ms = Date.UTC(1899, 11, 30) + raw * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw ?? '').trim();
  if (!s) return '';
  // 「7/27」「7月27日」など“年が無い”表記は、JSが 2001年 と誤解釈してしまう。
  // その場合は当年（運用開始が2026年なので通常は今年）を補って解釈する。
  if (!/\d{4}/.test(s)) {
    const md = s.match(/(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/);
    if (md) {
      const y = new Date().getFullYear();
      const mo = String(Number(md[1])).padStart(2, '0');
      const da = String(Number(md[2])).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

async function listSheets(sheets: Sheets, spreadsheetId: string): Promise<SheetInfo[]> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (meta.data.sheets ?? []).map((s: any) => ({ title: String(s.properties?.title ?? ''), sheetId: Number(s.properties?.sheetId ?? 0) }));
}

async function readTabRows(sheets: Sheets, spreadsheetId: string, title: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A:Z`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return (res.data.values ?? []) as string[][];
}

// あるタブの「No列」の位置を返す。年タブは固定レイアウト(0列目)、旧シートはヘッダー名で探す。
function noIdxFor(title: string, header: string[]): number {
  if (isYearTitle(title)) return H.NO;
  return headerIndex(header, NO_HEADERS);
}

// 納入予定日の列を「7月15日(水)」書式で表示するようにする（idempotent）。
async function applyDateColumnFormat(sheets: Sheets, spreadsheetId: string, sheetId: number): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: H.DATE, endColumnIndex: H.DATE + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'm"月"d"日("ddd")"' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      }],
    },
  });
}

// 年タブが無ければ作成し、固定ヘッダーを書き込む
async function ensureYearTab(sheets: Sheets, spreadsheetId: string, all: SheetInfo[], year: string): Promise<SheetInfo> {
  const found = all.find(s => s.title === year);
  if (found) return found;
  const resp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: year } } }] },
  });
  const props = resp.data.replies?.[0]?.addSheet?.properties;
  const info: SheetInfo = { title: String(props?.title ?? year), sheetId: Number(props?.sheetId ?? 0) };
  all.push(info);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${year}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [CANONICAL_HEADERS] },
  });
  try { await applyDateColumnFormat(sheets, spreadsheetId, info.sheetId); } catch { /* 書式は付かなくても致命的ではない */ }
  return info;
}

// 年タブ用の1行（固定レイアウト）を組み立てる
function buildCanonicalRow(no: string, f: SheetRowFields, del = ''): string[] {
  const row = new Array(CANONICAL_WIDTH).fill('');
  row[H.NO] = no;
  row[H.DATE] = normalizeDate(f.delivery_date);
  row[H.TIME] = f.delivery_time ?? '';
  row[H.PROJECT] = f.project_name ?? '';
  row[H.ITEM] = f.item ?? '';
  row[H.SPEC] = f.specification ?? '';
  row[H.VENDOR] = f.vendor ?? '';
  row[H.UNLOAD] = f.unload_location ?? '';
  row[H.NOTES] = f.notes ?? '';
  row[H.DEL] = del;
  return row;
}

// すべてのタブ（年タブ＋旧シート）を走査し、Noの最大値を求める。
// 旧シートのNoも数えることで、新規採番が旧シートのNoと衝突しないようにする。
async function globalMaxNo(sheets: Sheets, spreadsheetId: string, all: SheetInfo[]): Promise<number> {
  let maxNo = 0;
  for (const s of all) {
    const rows = await readTabRows(sheets, spreadsheetId, s.title);
    if (rows.length < 1) continue;
    const noIdx = noIdxFor(s.title, rows[0] as string[]);
    if (noIdx < 0) continue;
    for (let i = 1; i < rows.length; i++) {
      const v = Number(String(rows[i]?.[noIdx] ?? '').trim());
      if (Number.isFinite(v)) maxNo = Math.max(maxNo, v);
    }
  }
  return maxNo;
}

// Noで全タブ（年タブ＋旧シート）から該当行を探す。旧シートに残っている（まだ年タブへ
// 移行前の）予定も見つけられるようにする＝日程変更・削除・着色が確実に反映される。
async function findRowByNo(sheets: Sheets, spreadsheetId: string, all: SheetInfo[], sheetNo: string):
  Promise<{ tab: SheetInfo; rowNum: number; row: string[]; header: string[]; isYear: boolean } | null> {
  const want = String(sheetNo).trim();
  for (const s of all) {
    const rows = await readTabRows(sheets, spreadsheetId, s.title);
    if (rows.length < 1) continue;
    const header = rows[0] as string[];
    const noIdx = noIdxFor(s.title, header);
    if (noIdx < 0) continue;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i]?.[noIdx] ?? '').trim() === want) {
        return { tab: s, rowNum: i + 1, row: rows[i] as string[], header, isYear: isYearTitle(s.title) };
      }
    }
  }
  return null;
}

// 新規予定を、その納入年のタブの末尾に追加する。Noは全タブ通しで自動採番して返す。
export async function appendDeliveryToSheet(f: SheetRowFields): Promise<WriteResult & { sheetNo?: string }> {
  const client = getClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  const year = yearOf(f.delivery_date);
  if (!year) return { ok: false, reason: 'no-year' };
  try {
    const { sheets, spreadsheetId } = client;
    const all = await listSheets(sheets, spreadsheetId);
    const tab = await ensureYearTab(sheets, spreadsheetId, all, year);
    const nextNo = String((await globalMaxNo(sheets, spreadsheetId, all)) + 1);
    const row = buildCanonicalRow(nextNo, f);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab.title}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return { ok: true, sheetNo: nextNo };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}

// Noで該当行を探し、内容を書き戻す。納入年が変わっていれば正しい年タブへ移動する。
export async function pushDeliveryToSheetByNo(sheetNo: string | null | undefined, f: SheetRowFields): Promise<WriteResult> {
  if (!sheetNo) return { ok: false, reason: 'no-sheet-no' };
  const client = getClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  const targetYear = yearOf(f.delivery_date);
  if (!targetYear) return { ok: false, reason: 'no-year' };
  try {
    const { sheets, spreadsheetId } = client;
    const all = await listSheets(sheets, spreadsheetId);
    const found = await findRowByNo(sheets, spreadsheetId, all, String(sheetNo));
    if (!found) return { ok: false, reason: 'row-not-found' };

    // 旧シート(年名でないタブ)に残っている行は、その場でヘッダー位置に沿って更新する。
    // （年タブへの移動は次回同期の移行処理が、変更後の納入日に応じて正しく行う）
    if (!found.isYear) {
      const h = found.header;
      const set = (names: string[], v: string | null) => {
        const idx = headerIndex(h, names);
        if (idx < 0) return null;
        return { range: `${found.tab.title}!${colLetter(idx)}${found.rowNum}`, values: [[v ?? '']] };
      };
      const updates = [
        set(['納入予定日'], normalizeDate(f.delivery_date)),
        set(['納入予定時刻'], f.delivery_time),
        set(['物件名'], f.project_name),
        set(['品目'], f.item),
        set(['内容・規格'], f.specification),
        set(['業者名'], f.vendor),
        set(['降し場所'], f.unload_location),
        set(['備考'], f.notes),
      ].filter(Boolean) as { range: string; values: string[][] }[];
      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
        });
      }
      return { ok: true };
    }

    const del = String(found.row[H.DEL] ?? '');
    const newRow = buildCanonicalRow(String(sheetNo), f, del);

    if (found.tab.title === targetYear) {
      // 同じ年タブ内 → その場で更新
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${found.tab.title}!A${found.rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });
      return { ok: true };
    }

    // 年が変わった → 正しい年タブへ同じNoで追加し、旧タブの行を空にする
    const tab = await ensureYearTab(sheets, spreadsheetId, all, targetYear);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab.title}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] },
    });
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${found.tab.title}!A${found.rowNum}:Z${found.rowNum}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}

// Noで該当行を探し、「削除」列に印をつける（行は残す）。
export async function markSheetRowDeletedByNo(sheetNo: string | null | undefined): Promise<WriteResult> {
  if (!sheetNo) return { ok: false, reason: 'no-sheet-no' };
  const client = getClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  try {
    const { sheets, spreadsheetId } = client;
    const all = await listSheets(sheets, spreadsheetId);
    const found = await findRowByNo(sheets, spreadsheetId, all, String(sheetNo));
    if (!found) return { ok: false, reason: 'row-not-found' };
    // 年タブは固定のDEL列、旧シートは「削除/状態/ステータス」列を使う（無ければ何もしない）
    const delIdx = found.isYear ? H.DEL : headerIndex(found.header, DELETE_MARK_HEADERS);
    if (delIdx < 0) return { ok: false, reason: 'no-mark-column' };
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${found.tab.title}!${colLetter(delIdx)}${found.rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[DELETE_MARK_VALUE]] },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}

// Noで該当行を探し、納入済みなら薄い緑で着色、解除なら白に戻す。
export async function setSheetRowDeliveredByNo(sheetNo: string | null | undefined, delivered: boolean): Promise<WriteResult> {
  if (!sheetNo) return { ok: false, reason: 'no-sheet-no' };
  const client = getClient();
  if (!client) return { ok: false, reason: 'not-configured' };
  try {
    const { sheets, spreadsheetId } = client;
    const all = await listSheets(sheets, spreadsheetId);
    const found = await findRowByNo(sheets, spreadsheetId, all, String(sheetNo));
    if (!found) return { ok: false, reason: 'row-not-found' };
    const color = delivered ? COLOR_DONE : COLOR_NONE;
    const width = Math.max(found.header.length, CANONICAL_WIDTH);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: found.tab.sheetId,
              startRowIndex: found.rowNum - 1,
              endRowIndex: found.rowNum,
              startColumnIndex: 0,
              endColumnIndex: width,
            },
            cell: { userEnteredFormat: { backgroundColor: color } },
            fields: 'userEnteredFormat.backgroundColor',
          },
        }],
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 160) };
  }
}

// 内容（日付・物件・品目・規格・業者・降し場所・時刻）でシート行を判定するためのキー。
// No紐付けがズレていても、アプリの納入状態と確実に一致させられる（同期時の一括着色用）。
// 内容キーの作り方は同期ルートの keyOf と一致させること。
export function contentKeyOfSheetRow(r: string[]): string {
  const norm = (v: unknown) => String(v ?? '').trim();
  const date = normalizeDate(r[H.DATE]);
  const project = norm(r[H.PROJECT]);
  const item = norm(r[H.ITEM]);
  const spec = norm(r[H.SPEC]);
  const vendor = norm(r[H.VENDOR]) || '未設定';
  const unload = norm(r[H.UNLOAD]) || '未設定';
  const time = norm(r[H.TIME]);
  return JSON.stringify([date, project, item, spec, vendor, unload, time]);
}

// ---- 同期用：年タブを整備し、旧シートを移行し、取り込み候補を集めて返す ----
export interface SheetCandidate {
  no: string;
  dateVal: string; project: string; item: string;
  specVal: string | null; vendorVal: string; unloadVal: string;
  timeVal: string | null; notesVal: string | null;
}
export interface SheetSetup {
  ok: boolean; wrote: boolean; tabs: string[]; migrated: number; numbered: number; collected?: number; moved?: number; reason?: string;
}
// 年タブの読み取り結果（着色で再利用する）
export interface TabRows { sheetId: number; rows: string[][]; }

// 旧シート(年名でないタブ)の1行を、その年タブに移せる形へ読み解く。
// 既存のNo（管理番号）があれば保持する（アプリとの紐付け sheet_no を壊さないため）。
function readLegacyRow(header: string[], r: string[]): { year: string; no: string; del: string; f: SheetRowFields } | null {
  const iNo = headerIndex(header, NO_HEADERS);
  const iMark = headerIndex(header, DELETE_MARK_HEADERS);
  const iDate = header.indexOf('納入予定日');
  const iTime = header.indexOf('納入予定時刻');
  const iProject = header.indexOf('物件名');
  const iItem = header.indexOf('品目');
  const iSpec = header.indexOf('内容・規格');
  const iVendor = header.indexOf('業者名');
  const iUnload = header.indexOf('降し場所');
  const iNotes = header.indexOf('備考');
  const dv = normalizeDate(iDate >= 0 ? r[iDate] : '');
  const pj = iProject >= 0 ? String(r[iProject] ?? '').trim() : '';
  const it = iItem >= 0 ? String(r[iItem] ?? '').trim() : '';
  // 日付と物件名があれば取り込む（品目が未入力でも拾う＝取りこぼし防止）
  if (!dv || !pj) return null;
  const year = yearOf(dv);
  if (!year) return null;
  return {
    year,
    no: iNo >= 0 ? String(r[iNo] ?? '').trim() : '',
    // 旧シートで「削除」印が付いていた行は、印を保持したまま年タブへ移す（復活防止）
    del: iMark >= 0 && String(r[iMark] ?? '').includes('削除') ? DELETE_MARK_VALUE : '',
    f: {
      delivery_date: dv,
      delivery_time: iTime >= 0 ? (String(r[iTime] ?? '').trim() || null) : null,
      project_name: pj,
      item: it,
      specification: iSpec >= 0 ? (String(r[iSpec] ?? '').trim() || null) : null,
      vendor: (iVendor >= 0 ? String(r[iVendor] ?? '').trim() : '') || '未設定',
      unload_location: (iUnload >= 0 ? String(r[iUnload] ?? '').trim() : '') || '未設定',
      notes: iNotes >= 0 ? (String(r[iNotes] ?? '').trim() || null) : null,
    },
  };
}

export async function prepareAndCollectSheet(minDate: string): Promise<{ ok: boolean; candidates: SheetCandidate[]; setup: SheetSetup; reason?: string; tabsData?: TabRows[] }> {
  const setup: SheetSetup = { ok: true, wrote: false, tabs: [], migrated: 0, numbered: 0 };
  const client = getClient();
  if (!client) return { ok: false, candidates: [], setup, reason: 'not-configured' };
  try {
    const { sheets, spreadsheetId } = client;
    const all = await listSheets(sheets, spreadsheetId);

    // 1) 旧シート（年名でない・「納入予定日」ヘッダーを持つタブ）のデータを年タブへ移行
    let nextNo = (await globalMaxNo(sheets, spreadsheetId, all)) + 1;
    for (const legacy of all.filter(s => !isYearTitle(s.title))) {
      const rows = await readTabRows(sheets, spreadsheetId, legacy.title);
      if (rows.length < 2) continue;
      const header = rows[0] as string[];
      if (header.indexOf('納入予定日') < 0) continue; // 予定表でないタブは触らない
      const appendsByYear = new Map<string, string[][]>();
      let dataRowCount = 0;
      for (let i = 1; i < rows.length; i++) {
        const parsed = readLegacyRow(header, rows[i] as string[]);
        if (!parsed) continue;
        dataRowCount++;
        const tab = await ensureYearTab(sheets, spreadsheetId, all, parsed.year);
        const arr = appendsByYear.get(tab.title) ?? [];
        // 既存のNoは保持（アプリとの紐付けを壊さない）。無い行だけ新規採番する。
        const no = parsed.no || String(nextNo++);
        arr.push(buildCanonicalRow(no, parsed.f, parsed.del));
        appendsByYear.set(tab.title, arr);
      }
      if (dataRowCount === 0) continue;
      // 先に年タブへ追加してから、旧シートのデータ行を空にする（消失を防ぐ順序）
      for (const [title, values] of appendsByYear) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${title}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values },
        });
        setup.migrated += values.length;
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${legacy.title}!A2:Z` });
      setup.wrote = true;
    }

    // 2) 年タブを読み、Noが無い行に採番し、取り込み候補を集める
    const candidates: SheetCandidate[] = [];
    // 着色などで読み直さずに再利用するため、読んだ行を保持する。
    const tabsData: TabRows[] = [];
    const yearTabs = all.filter(s => isYearTitle(s.title)).sort((a, b) => a.title.localeCompare(b.title));
    // 日付の年とタブ名が食い違う行（例: 2001タブに2026の予定）を、正しい年タブへ移す。
    const misplaced: { correctYear: string; row: string[]; fromTab: string; rowNum: number }[] = [];
    for (const tab of yearTabs) {
      setup.tabs.push(tab.title);
      // 日付列の表示書式を「7月15日(水)」に統一（idempotent・best-effort）
      try { await applyDateColumnFormat(sheets, spreadsheetId, tab.sheetId); } catch { /* noop */ }
      const rows = await readTabRows(sheets, spreadsheetId, tab.title);
      tabsData.push({ sheetId: tab.sheetId, rows });
      if (rows.length < 1) continue;
      const numberUpdates: { range: string; values: string[][] }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] as string[];
        const dv = normalizeDate(r[H.DATE]);
        const pj = String(r[H.PROJECT] ?? '').trim();
        const it = String(r[H.ITEM] ?? '').trim();
        // 日付と物件名があれば取り込む（品目未入力でも拾う）
        if (!dv || !pj) continue;
        let no = String(r[H.NO] ?? '').trim();
        if (!no) {
          no = String(nextNo++);
          numberUpdates.push({ range: `${tab.title}!${colLetter(H.NO)}${i + 1}`, values: [[no]] });
          setup.numbered++;
        }
        if (dv < minDate) continue;                       // 運用開始日より前は取り込まない
        if (String(r[H.DEL] ?? '').includes('削除')) continue; // 削除印は取り込まない

        const fields: SheetRowFields = {
          delivery_date: dv,
          delivery_time: String(r[H.TIME] ?? '').trim() || null,
          project_name: pj,
          item: it,
          specification: String(r[H.SPEC] ?? '').trim() || null,
          vendor: String(r[H.VENDOR] ?? '').trim() || '未設定',
          unload_location: String(r[H.UNLOAD] ?? '').trim() || '未設定',
          notes: String(r[H.NOTES] ?? '').trim() || null,
        };

        // 年が食い違えば、正しい年タブへ移動対象として記録（取り込み自体は下で行う）
        const correctYear = yearOf(dv);
        if (correctYear && correctYear !== tab.title) {
          misplaced.push({ correctYear, row: buildCanonicalRow(no, fields, String(r[H.DEL] ?? '')), fromTab: tab.title, rowNum: i + 1 });
        }

        candidates.push({
          no, dateVal: dv, project: pj, item: it,
          specVal: fields.specification, vendorVal: fields.vendor, unloadVal: fields.unload_location,
          timeVal: fields.delivery_time, notesVal: fields.notes,
        });
      }
      if (numberUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: numberUpdates },
        });
        setup.wrote = true;
      }
    }

    // 年が食い違う行を正しい年タブへ移動（先に追加→元を空に）
    if (misplaced.length > 0) {
      const byYear = new Map<string, string[][]>();
      for (const m of misplaced) {
        const tab = await ensureYearTab(sheets, spreadsheetId, all, m.correctYear);
        const arr = byYear.get(tab.title) ?? [];
        arr.push(m.row);
        byYear.set(tab.title, arr);
      }
      for (const [title, values] of byYear) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${title}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values },
        });
      }
      // 元タブの行は「値クリア（空行残し）」ではなく行ごと削除する。
      // 行番号がズレないよう各タブ内で下から（降順で）消し、着色用の tabsData も同期して更新する。
      const bySheetId = new Map<number, number[]>();
      for (const m of misplaced) {
        const sid = all.find(s => s.title === m.fromTab)?.sheetId;
        if (sid == null) continue;
        const arr = bySheetId.get(sid) ?? []; arr.push(m.rowNum); bySheetId.set(sid, arr);
      }
      const delRequests: unknown[] = [];
      for (const [sid, rowNums] of bySheetId) {
        rowNums.sort((a, b) => b - a); // 降順
        const td = tabsData.find(t => t.sheetId === sid);
        for (const rn of rowNums) {
          delRequests.push({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } });
          if (td && rn - 1 < td.rows.length) td.rows.splice(rn - 1, 1);
        }
      }
      if (delRequests.length > 0) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: delRequests } });
      }
      setup.moved = misplaced.length;
      setup.wrote = true;
    }

    setup.collected = candidates.length;
    return { ok: true, candidates, setup, tabsData };
  } catch (e) {
    const err = e as { message?: string; errors?: { message?: string }[] };
    setup.ok = false;
    setup.reason = (err?.errors?.[0]?.message || err?.message || String(e)).slice(0, 200);
    return { ok: false, candidates: [], setup, reason: setup.reason };
  }
}

// 同期時に読んだ年タブの行を再利用して着色する（シートを読み直さない＝API呼び出し削減）。
export async function colorTabsData(tabsData: TabRows[], deliveredKeys: string[], presentKeys: string[]): Promise<{ ok: boolean; colored: number; reason?: string }> {
  const delSet = new Set(deliveredKeys);
  const presentSet = new Set(presentKeys);
  if (delSet.size === 0 && presentSet.size === 0) return { ok: true, colored: 0 };
  const client = getClient();
  if (!client) return { ok: false, colored: 0, reason: 'not-configured' };
  const requests: unknown[] = [];
  for (const t of tabsData) {
    for (let i = 1; i < t.rows.length; i++) {
      const r = t.rows[i] as string[];
      if (!r || !normalizeDate(r[H.DATE]) || !String(r[H.PROJECT] ?? '').trim()) continue;
      const key = contentKeyOfSheetRow(r);
      let color: { red: number; green: number; blue: number } | null = null;
      if (delSet.has(key)) color = COLOR_DONE;
      else if (presentSet.has(key)) color = COLOR_NONE;
      if (!color) continue;
      requests.push({
        repeatCell: {
          range: { sheetId: t.sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: CANONICAL_WIDTH },
          cell: { userEnteredFormat: { backgroundColor: color } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });
    }
  }
  if (requests.length === 0) return { ok: true, colored: 0 };
  try {
    const { sheets, spreadsheetId } = client;
    for (let i = 0; i < requests.length; i += 200) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: requests.slice(i, i + 200) } });
    }
    return { ok: true, colored: requests.length };
  } catch (e) {
    return { ok: false, colored: 0, reason: String(e).slice(0, 160) };
  }
}

// 参照互換のため（旧コードが使っていた定数）
export { headerIndex };
