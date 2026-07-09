import { NextRequest, NextResponse } from 'next/server';
import { getRoleFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  return NextResponse.json({ role: await getRoleFromRequest(req) });
}
