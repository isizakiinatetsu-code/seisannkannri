import { NextRequest, NextResponse } from 'next/server';
import { verifySession, type Role } from './session';

export const AUTH_COOKIE = 'inatetsu_role';
export type { Role };

// 署名付きCookieを検証してロールを返す（改ざん・期限切れは null）。
export async function getRoleFromRequest(req: NextRequest): Promise<Role | null> {
  return verifySession(req.cookies.get(AUTH_COOKIE)?.value);
}

export async function requireEditRole(req: NextRequest): Promise<NextResponse | null> {
  const role = await getRoleFromRequest(req);
  if (role !== 'edit') {
    return NextResponse.json({ error: '編集権限がありません（購買課・総務のみ操作できます）' }, { status: 403 });
  }
  return null;
}
