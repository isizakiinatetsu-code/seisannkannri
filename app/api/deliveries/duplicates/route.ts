import { NextResponse } from 'next/server';
import { getSupabase, Delivery } from '@/lib/supabase';

// 重複候補を返す。判定キー = 納入予定日＋物件名＋品目＋業者名＋内容・規格。
// （内容・規格が違う別便は別物とみなし、重複扱いしない）
export async function GET() {
  try {
    const supabase = getSupabase();
    // 直近3か月〜今後を対象にする（古すぎる履歴まで拾わない）
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const minDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .gte('delivery_date', minDate)
      .order('delivery_date', { ascending: true });
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
