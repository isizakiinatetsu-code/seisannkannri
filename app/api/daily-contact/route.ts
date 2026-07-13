import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

// テーブルが未作成のDBでも落ちないよう判定する
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST205');
}

// その日の荷下ろし連絡先を取得
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const date = new URL(req.url).searchParams.get('date');
    if (!date) return NextResponse.json({ date: null, contact: null });
    const { data, error } = await supabase
      .from('daily_contacts')
      .select('contact')
      .eq('contact_date', date)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ date, contact: null, tableMissing: true });
      throw error;
    }
    return NextResponse.json({ date, contact: data?.contact ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// その日の荷下ろし連絡先を設定（編集権限が必要）
export async function PUT(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const date: string = body.date;
    const contact: string | null = (typeof body.contact === 'string' ? body.contact.trim() : '') || null;
    if (!date) return NextResponse.json({ error: '日付がありません' }, { status: 400 });
    const { error } = await supabase
      .from('daily_contacts')
      .upsert({ contact_date: date, contact, updated_at: new Date().toISOString() }, { onConflict: 'contact_date' });
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: 'daily_contacts テーブルが未作成です（SQLの実行が必要）' }, { status: 400 });
      }
      throw error;
    }
    return NextResponse.json({ date, contact });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
