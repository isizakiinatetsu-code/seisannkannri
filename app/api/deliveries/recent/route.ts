import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isMissingCreatedByColumn } from '@/lib/dbErrors';

// 追加された予定を新しい順で返す。
// - since 指定あり: その時刻より後に追加された分だけ（新着バナーの件数用）
// - since 指定なし: 直近の追加を最大100件（お知らせ一覧用）
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const since = new URL(req.url).searchParams.get('since');

    const run = (cols: string) => {
      let q = supabase.from('deliveries').select(cols).order('created_at', { ascending: false }).limit(100);
      if (since) q = q.gt('created_at', since);
      return q;
    };

    // created_by 列がまだ無いDBでも動くよう、失敗したら列を外して再取得する。
    let { data, error } = await run('id, delivery_date, project_name, item, created_by, created_at');
    if (error && isMissingCreatedByColumn(error)) {
      ({ data, error } = await run('id, delivery_date, project_name, item, created_at'));
    }
    if (error) throw error;

    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
