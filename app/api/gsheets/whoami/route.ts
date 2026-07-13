import { NextRequest, NextResponse } from 'next/server';
import { requireEditRole } from '@/lib/auth';
import { getServiceAccountEmail } from '@/lib/gsheetsWrite';

// 書き戻し用に、スプレッドシートを共有すべきサービスアカウントのメールを返す。
export async function GET(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  const email = getServiceAccountEmail();
  return NextResponse.json({
    service_account_email: email,
    note: email
      ? 'このメールアドレスを、対象スプレッドシートの「共有」で編集者として追加してください。'
      : 'GOOGLE_SERVICE_ACCOUNT_KEY が未設定です。',
  });
}
