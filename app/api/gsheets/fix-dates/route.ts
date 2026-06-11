import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// 日付形式が "2026/6/16" のような不正なレコードを削除し、件数を返す
export async function POST() {
  try {
    const supabase = getSupabase();

    // delivery_date に "/" が含まれるレコードを取得
    const { data: bad, error: fetchErr } = await supabase
      .from('deliveries')
      .select('id, delivery_date, project_name, item')
      .like('delivery_date', '%/%');
    if (fetchErr) throw fetchErr;

    if (!bad || bad.length === 0) {
      return NextResponse.json({ deleted: 0, message: '不正な日付形式のレコードはありませんでした' });
    }

    const ids = bad.map((r: { id: number }) => r.id);
    const { error: delErr } = await supabase.from('deliveries').delete().in('id', ids);
    if (delErr) throw delErr;

    return NextResponse.json({ deleted: ids.length, samples: bad.slice(0, 5) });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
