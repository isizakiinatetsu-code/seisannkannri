import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // 署名付きCookieを検証（偽造・改ざん・期限切れは拒否）
  const role = await verifySession(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== 'edit' && role !== 'view') {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // 静的アセット（画像・アイコン・manifest・テンプレート等）は認証対象外にする。
  // これを除外しないと、未ログイン時にログイン画面のロゴ等まで /login にリダイレクト
  // されて画像が壊れる。
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|xlsx|webmanifest)$).*)',
  ],
};
