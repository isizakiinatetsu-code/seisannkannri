import { NextRequest, NextResponse } from 'next/server';
import { requireEditRole } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

// daily_contacts が保存できない問題の切り分け用。
// アプリが実際にどのSupabaseプロジェクトへ接続しているか、そのプロジェクトから
// daily_contacts / deliveries が見えるかを直接確認する（推測を排除するため）。
export async function GET(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;

  const rawUrl = process.env.SUPABASE_URL ?? null;
  let host: string | null = null;
  try { host = rawUrl ? new URL(rawUrl).host : null; } catch { /* noop */ }

  const supabase = getSupabase();

  const deliveriesCheck = await supabase.from('deliveries').select('id').limit(1);
  const dailyContactsCheck = await supabase.from('daily_contacts').select('contact_date').limit(1);

  return NextResponse.json({
    接続先プロジェクト: host,
    deliveries: {
      見えるか: !deliveriesCheck.error,
      エラー: deliveriesCheck.error ? { code: deliveriesCheck.error.code, message: deliveriesCheck.error.message } : null,
    },
    daily_contacts: {
      見えるか: !dailyContactsCheck.error,
      エラー: dailyContactsCheck.error ? { code: dailyContactsCheck.error.code, message: dailyContactsCheck.error.message } : null,
    },
  });
}
