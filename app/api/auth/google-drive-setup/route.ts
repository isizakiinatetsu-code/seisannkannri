import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireEditRole } from '@/lib/auth';

// Google Drive OAuth のリフレッシュトークンを一度だけ取得するための補助エンドポイント。
//
// 使い方:
// 1. GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET を設定した状態でこのURLにGETアクセス
//    すると、Googleの認証画面へリダイレクトされる。
// 2. ログイン・許可すると ?code=... 付きでこのURLに戻ってくる。
// 3. リフレッシュトークンが画面に表示されるので、GOOGLE_OAUTH_REFRESH_TOKEN に登録する。
//
// セットアップ後はこのファイルを削除して構わない（残しても害はない。requireEditRole で保護済み）。

function getRedirectUri(req: NextRequest): string {
  return new URL('/api/auth/google-drive-setup', req.url).toString();
}

export async function GET(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET が未設定です' },
      { status: 500 },
    );
  }

  const redirectUri = getRedirectUri(req);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
    });
    return NextResponse.redirect(authUrl);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>Drive連携セットアップ</title>
      <style>body{font-family:sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.8}
      code{background:#1f2937;color:#f9fafb;padding:8px 12px;border-radius:6px;display:block;word-break:break-all;margin:10px 0}
      .ok{color:#16a34a;font-weight:bold}</style></head><body>
      <h2 class="ok">✅ 認証に成功しました</h2>
      <p>下のリフレッシュトークンを、Vercel の環境変数 <b>GOOGLE_OAUTH_REFRESH_TOKEN</b> にコピーして登録してください。</p>
      <code>${tokens.refresh_token ?? '（取得できませんでした。再度このURLを開き直してください）'}</code>
      <p>登録後、Vercelで Redeploy すれば連携が完了します。</p>
      </body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
