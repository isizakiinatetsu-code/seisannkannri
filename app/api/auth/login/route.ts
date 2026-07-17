import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { signSession, timingSafeEqual } from '@/lib/session';

const MAX_AGE = 60 * 60 * 24 * 30; // 30日

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const editPassword = process.env.EDIT_PASSWORD;
  const viewPassword = process.env.VIEW_PASSWORD;

  let role: 'edit' | 'view' | null = null;
  if (typeof password === 'string') {
    if (editPassword && timingSafeEqual(password, editPassword)) role = 'edit';
    else if (viewPassword && timingSafeEqual(password, viewPassword)) role = 'view';
  }

  if (!role) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 });
  }

  const token = await signSession(role, MAX_AGE);
  const res = NextResponse.json({ role });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
