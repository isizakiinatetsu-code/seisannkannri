import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE = 'inatetsu_role';
export type Role = 'edit' | 'view';

export function getRoleFromRequest(req: NextRequest): Role | null {
  const value = req.cookies.get(AUTH_COOKIE)?.value;
  return value === 'edit' || value === 'view' ? value : null;
}

export function requireEditRole(req: NextRequest): NextResponse | null {
  const role = getRoleFromRequest(req);
  if (role !== 'edit') {
    return NextResponse.json({ error: '編集権限がありません（購買課・総務のみ操作できます）' }, { status: 403 });
  }
  return null;
}
