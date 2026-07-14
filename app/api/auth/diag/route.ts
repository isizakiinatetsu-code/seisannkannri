import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// 障害切り分け用の診断API。proxy.ts が /api/auth を認証免除にしているためここに置く。
// 秘密情報は返さない：接続先プロジェクトIDの先頭5文字と、テーブル/列がAPIから
// 見えているか（スキーマキャッシュの状態）だけを返す。
export async function GET() {
  const url = process.env.SUPABASE_URL ?? '';
  const host = url.replace(/^https?:\/\//, '').split('.')[0] ?? '';
  const out: Record<string, unknown> = {
    supabaseProject: host ? `${host.slice(0, 5)}***` : '(未設定)',
  };
  try {
    const supabase = getSupabase();
    const t = await supabase.from('daily_contacts').select('contact_date').limit(1);
    out.daily_contacts = t.error
      ? { ok: false, code: t.error.code, message: t.error.message?.slice(0, 160) }
      : { ok: true };
    const c = await supabase.from('deliveries').select('unloaded_by').limit(1);
    out.deliveries_unloaded_by = c.error
      ? { ok: false, code: c.error.code, message: c.error.message?.slice(0, 160) }
      : { ok: true };
  } catch (e) {
    out.exception = String(e).slice(0, 200);
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
