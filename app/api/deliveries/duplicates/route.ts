import { NextResponse } from 'next/server';
import { getSupabase, Delivery } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/dbErrors';
import { selectAll, jstYmd } from '@/lib/selectAll';

// 重複候補を返す。判定キー = 納入予定日＋物件名＋品目＋業者名＋内容・規格。
// （内容・規格が違う別便は別物とみなし、重複扱いしない）
export async function GET() {
  try {
    const supabase = getSupabase();
    // 直近3か月〜今後を対象にする（古すぎる履歴まで拾わない）
    // 「今日」は日本時間で数える（サーバーはUTCのことがある）
    const [y, m] = jstYmd().split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1 - 3, 1));
    const minDate = from.toISOString().slice(0, 7) + '-01';

    // 削除済みは重複に数えない（消した方が残って「まだ重複」と出続けるのを防ぐ）。1000行超も全件取得。
    const fetchAll = (excludeDeleted: boolean) => selectAll<Delivery>((f, t) => {
      let q = supabase.from('deliveries').select('*').gte('delivery_date', minDate);
      if (excludeDeleted) q = q.eq('deleted', false);
      return q.order('delivery_date', { ascending: true }).order('id', { ascending: true }).range(f, t);
    });
    let { data, error } = await fetchAll(true);
    if (error && isMissingColumnError(error)) ({ data, error } = await fetchAll(false));
    if (error) throw error;

    const norm = (v: string | null | undefined) => (v ?? '').trim();
    const groups = new Map<string, Delivery[]>();
    for (const d of (data ?? []) as Delivery[]) {
      const key = [d.delivery_date, norm(d.project_name), norm(d.item), norm(d.vendor), norm(d.specification)].join('|');
      const arr = groups.get(key);
      if (arr) arr.push(d); else groups.set(key, [d]);
    }

    const dupes = [...groups.values()]
      .filter(list => list.length >= 2)
      .map(list => ({
        date: list[0].delivery_date,
        project_name: list[0].project_name,
        item: list[0].item,
        vendor: list[0].vendor,
        specification: list[0].specification,
        count: list.length,
        items: list,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(dupes, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
