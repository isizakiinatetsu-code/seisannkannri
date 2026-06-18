import { google } from 'googleapis';
import { Readable } from 'stream';

// Google Drive の【納入管理】フォルダへ画像をアップロードする。
//
// サービスアカウントはマイドライブに保存容量を持たないため使えない（Google仕様）。
// そのため、石崎さん個人のGoogleアカウントへの OAuth2 委任（リフレッシュトークン）で
// 認証し、そのアカウントのマイドライブ上のフォルダに保存する。
//
// 必要な環境変数:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GOOGLE_DRIVE_FOLDER_ID
//
// ベストエフォート：環境変数が未設定、または失敗してもエラーを投げず null を返す。
// 伝票本体の保存（Supabase）は Drive 連携の成否に左右されない。

export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    // 未設定なら何もしない（Drive 連携オフ）
    return null;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
    });

    return res.data.id ?? null;
  } catch (e) {
    console.error('Google Drive upload failed', e);
    return null;
  }
}
