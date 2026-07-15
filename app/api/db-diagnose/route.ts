import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSupabase } from '@/lib/supabase';

// スプレッドシートの各タブのヘッダー・行数を確認する（同期で読み取れない原因切り分け）。
async function inspectSheet() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!spreadsheetId || !keyJson) return { 接続: false, 理由: '環境変数未設定' };
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(title)' });
    const tabs: unknown[] = [];
    for (const s of meta.data.sheets ?? []) {
      const title = s.properties?.title ?? '';
      const head = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A1:Z1` });
      const first = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A2:Z2` });
      const colA = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A:A` });
      tabs.push({
        タブ名: title,
        ヘッダー: head.data.values?.[0] ?? [],
        先頭データ行: first.data.values?.[0] ?? [],
        データ行数: Math.max(0, (colA.data.values?.length ?? 0) - 1),
      });
    }
    return { 接続: true, タブ数: tabs.length, タブ: tabs };
  } catch (e) {
    return { 接続: false, エラー: String(e).slice(0, 200) };
  }
}

// daily_contacts が保存できない問題の切り分け用。
// アプリが実際にどのSupabaseプロジェクトへ接続しているか、そのプロジェクトから
// daily_contacts / deliveries が見えるかを直接確認する（推測を排除するため）。
// ブラウザで直接開いて結果を確認できるよう、ログイン不要にしている。
// 公開しているのは Supabase のホスト名（NEXT_PUBLIC_SUPABASE_URL と同じで既に公開情報）と
// テーブルが見えるかの真偽・エラーコードのみで、秘密情報は含まない。
export async function GET() {
  const hostOf = (u: string | null | undefined) => {
    try { return u ? new URL(u).host : null; } catch { return null; }
  };
  const serviceHost = hostOf(process.env.SUPABASE_URL);
  const publicHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const supabase = getSupabase();

  const deliveriesCheck = await supabase.from('deliveries').select('id').limit(1);
  const dailyContactsCheck = await supabase.from('daily_contacts').select('contact_date').limit(1);

  // 追加者(created_by)・荷下ろし者(unloaded_by)・sheet_no 等の後付け列が、
  // アプリが実際に接続しているプロジェクトに存在するかを1列ずつ確認する。
  // 列が無いと保存時に自動でその列だけ外して登録するため「追加者が表示されない」等の
  // 原因になる（ALTER を別プロジェクトで実行してしまっていると起こる）。
  const columnCheck = async (col: string) => {
    const r = await supabase.from('deliveries').select(col).limit(1);
    return { ある: !r.error, エラー: r.error ? r.error.code : null };
  };
  const [createdBy, unloadedBy, sheetNo, deleted] = await Promise.all([
    columnCheck('created_by'),
    columnCheck('unloaded_by'),
    columnCheck('sheet_no'),
    columnCheck('deleted'),
  ]);

  const sheetInfo = await inspectSheet();

  return NextResponse.json({
    接続先プロジェクト: serviceHost,
    表示用URLのプロジェクト: publicHost,
    URLが一致しているか: serviceHost === publicHost,
    シート: sheetInfo,
    deliveries: {
      見えるか: !deliveriesCheck.error,
      エラー: deliveriesCheck.error ? { code: deliveriesCheck.error.code, message: deliveriesCheck.error.message } : null,
    },
    deliveries列: {
      created_by: createdBy,
      unloaded_by: unloadedBy,
      sheet_no: sheetNo,
      deleted: deleted,
    },
    daily_contacts: {
      見えるか: !dailyContactsCheck.error,
      エラー: dailyContactsCheck.error ? { code: dailyContactsCheck.error.code, message: dailyContactsCheck.error.message } : null,
    },
  });
}
