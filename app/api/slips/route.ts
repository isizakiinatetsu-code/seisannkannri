import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { selectAll } from '@/lib/selectAll';

// 納入伝票ギャラリー用の一覧API。
// delivery_slips（予定ごとの添付）を deliveries と結合して、
// 伝票を物件・納入日の情報つきで返す。
//
// 注意:
// - 発注書(PDF)と納入伝票は同じ delivery_slips 表に入っており、
//   ファイル名の頭（/order_ か /slip_）でしか区別できない。ここでは
//   DeliveryModal と同じ判定で「発注書」を除外し、納入伝票だけを返す。
// - 並びは「納入日の新しい順」。同じ日の中では添付が新しい順。

// URL末尾が /order_... なら発注書。DeliveryModal の isOrderFile と同じ判定。
const isOrderFile = (url: string) => /\/order_[^/]*$/.test(url);

interface EmbeddedDelivery {
  id: number;
  delivery_date: string;
  delivery_time: string | null;
  project_name: string;
  item: string;
  specification: string | null;
  vendor: string;
  unload_location: string | null;
  status: string;
  deleted?: boolean | null;
}

interface SlipRow {
  id: number;
  delivery_id: number;
  slip_image_path: string;
  created_at: string;
  deliveries: EmbeddedDelivery | null;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = getSupabase();

    const columns =
      'id, delivery_id, slip_image_path, created_at, ' +
      'deliveries ( id, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, status, deleted )';

    // selectAll はページングのため一意な並び（最後に id）を求める。
    // 埋め込み select の型は PostgREST 側で緩くなるため、取得結果は SlipRow として扱う。
    type Page = { data: SlipRow[] | null; error: { code?: string; message?: string } | null };
    const { data, error } = await selectAll<SlipRow>((from, to) =>
      supabase
        .from('delivery_slips')
        .select(columns)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<Page>,
    );
    if (error) throw error;

    const slips = (data ?? [])
      // 発注書を除外し、納入伝票だけを残す
      .filter((s) => !isOrderFile(s.slip_image_path))
      // 紐づく予定が無い/削除済みのものは出さない
      .filter((s) => s.deliveries && s.deliveries.deleted !== true)
      .map((s) => {
        const d = s.deliveries as EmbeddedDelivery;
        return {
          id: s.id,
          delivery_id: s.delivery_id,
          slip_image_path: s.slip_image_path,
          created_at: s.created_at,
          delivery_date: d.delivery_date,
          delivery_time: d.delivery_time,
          project_name: d.project_name,
          item: d.item,
          specification: d.specification,
          vendor: d.vendor,
          unload_location: d.unload_location,
          status: d.status,
        };
      });

    // 納入日の新しい順。同じ日は添付が新しい順（created_at 降順）。
    slips.sort(
      (a, b) =>
        b.delivery_date.localeCompare(a.delivery_date) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id - a.id,
    );

    return NextResponse.json(slips, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
