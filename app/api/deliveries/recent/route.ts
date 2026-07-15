import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/dbErrors';

// 追加された予定を返す。
// - since 指定あり: その時刻より後に追加された分だけ（新着バナーの件数用・作成日時の新しい順）
// - since 指定なし: お知らせ一覧用。date_from〜date_to（当日含め4日間分）の納入予定を
//   納入日の早い順で返す。
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const params = new URL(req.url).searchParams;
    const since = params.get('since');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');

    const run = (cols: string, excludeDeleted: boolean) => {
      let q = supabase.from('deliveries').select(cols);
      if (since) {
        // 新着バナー用：追加時刻の新しい順
        q = q.gt('created_at', since).order('created_at', { ascending: false }).limit(100);
      } else {
        // お知らせ一覧用：指定期間（当日含め4日間）の予定を納入日の早い順で
        if (dateFrom) q = q.gte('delivery_date', dateFrom);
        if (dateTo) q = q.lte('delivery_date', dateTo);
        q = q.order('delivery_date', { ascending: true }).order('delivery_time', { ascending: true, nullsFirst: false }).limit(200);
      }
      if (excludeDeleted) q = q.eq('deleted', false);
      return q;
    };

    // created_by / deleted 列がまだ無いDBでも動くよう、失敗したら外して再取得する。
    let { data, error } = await run('id, delivery_date, project_name, item, created_by, created_at', true);
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await run('id, delivery_date, project_name, item, created_at', false));
    }
    if (error) throw error;

    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
