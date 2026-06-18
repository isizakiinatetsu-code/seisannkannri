import { google } from 'googleapis';
import { Readable } from 'stream';

// Google Drive の【納入管理】フォルダへ画像をアップロードする。
// スプレッドシート連携と同じサービスアカウント（GOOGLE_SERVICE_ACCOUNT_KEY）を使う。
// 保存先フォルダは GOOGLE_DRIVE_FOLDER_ID で指定する（共有ドライブ推奨）。
//
// ベストエフォート：環境変数が未設定、または失敗してもエラーを投げず null を返す。
// 伝票本体の保存（Supabase）は Drive 連携の成否に左右されない。

export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!keyJson || !folderId) {
    // 未設定なら何もしない（Drive 連携オフ）
    return null;
  }

  try {
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    return res.data.id ?? null;
  } catch (e) {
    console.error('Google Drive upload failed', e);
    return null;
  }
}
