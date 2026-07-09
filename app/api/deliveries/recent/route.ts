import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// 指定時刻(since)より後に「追加」された予定を返す（アプリ内の新着お知らせ用）。
// created_at の新しい順、最大50件。
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const since = new URL(req.url).searchParams.get('since');
    if (!since) return NextResponse.json([]);

    const { data, error } = await supabase
      .from('deliveries')
      .select('id, delivery_date, project_name, item, created_by, created_at')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
