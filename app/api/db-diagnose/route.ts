import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// daily_contacts が保存できない問題の切り分け用。
// アプリが実際にどのSupabaseプロジェクトへ接続しているか、そのプロジェクトから
// daily_contacts / deliveries が見えるかを直接確認する（推測を排除するため）。
// ブラウザで直接開いて結果を確認できるよう、ログイン不要にしている。
// 公開しているのは Supabase のホスト名（NEXT_PUBLIC_SUPABASE_URL と同じで既に公開情報）と
// テーブルが見えるかの真偽・エラーコードのみで、秘密情報は含まない。
export async function GET() {
  const hostOf = (u: string | null | undefined) => {
    try { return u ? new URL(u).host : null; } catch { return null; }
  };
  const serviceHost = hostOf(process.env.SUPABASE_URL);
  const publicHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const supabase = getSupabase();

  const deliveriesCheck = await supabase.from('deliveries').select('id').limit(1);
  const dailyContactsCheck = await supabase.from('daily_contacts').select('contact_date').limit(1);

  return NextResponse.json({
    接続先プロジェクト: serviceHost,
    表示用URLのプロジェクト: publicHost,
    URLが一致しているか: serviceHost === publicHost,
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
