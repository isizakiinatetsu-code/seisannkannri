import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const editPassword = process.env.EDIT_PASSWORD;
  const viewPassword = process.env.VIEW_PASSWORD;

  let role: 'edit' | 'view' | null = null;
  if (editPassword && password === editPassword) role = 'edit';
  else if (viewPassword && password === viewPassword) role = 'view';

  if (!role) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 });
  }

  const res = NextResponse.json({ role });
  res.cookies.set(AUTH_COOKIE, role, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
