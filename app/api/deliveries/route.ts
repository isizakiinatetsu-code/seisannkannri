import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, DeliveryInput } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';
import { isMissingColumnError, insertWithMissingColumnFallback } from '@/lib/dbErrors';
import { appendDeliveryToSheet } from '@/lib/gsheetsWrite';
import { IMPL_START_DATE } from '@/lib/constants';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const projectName = searchParams.get('project_name');
    const item = searchParams.get('item');
    const vendor = searchParams.get('vendor');
    const unloadLocation = searchParams.get('unload_location');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const month = searchParams.get('month'); // YYYY-MM

    // excludeDeleted=true で削除済み(deleted=true)を除外。deleted列が無いDBでは
    // その条件を外して再取得する。
    const build = (excludeDeleted: boolean) => {
      let query = supabase.from('deliveries').select('*');
      if (projectName) query = query.ilike('project_name', `%${projectName}%`);
      if (item) query = query.ilike('item', `%${item}%`);
      if (vendor) query = query.ilike('vendor', `%${vendor}%`);
      if (unloadLocation) query = query.ilike('unload_location', `%${unloadLocation}%`);
      if (status) query = query.eq('status', status);
      // 運用開始日(2026-07-01)より前は表示しない。個別に date_from が指定されても、
      // 開始日より前には遡らない（大きい方＝新しい方を下限にする）。
      const floor = dateFrom && dateFrom > IMPL_START_DATE ? dateFrom : IMPL_START_DATE;
      query = query.gte('delivery_date', floor);
      if (dateTo) query = query.lte('delivery_date', dateTo);
      if (month) query = query.like('delivery_date', `${month}%`);
      if (excludeDeleted) query = query.eq('deleted', false);
      return query
        .order('delivery_date', { ascending: true })
        .order('delivery_time', { ascending: true, nullsFirst: false });
    };

    let { data, error } = await build(true);
    if (error && isMissingColumnError(error)) ({ data, error } = await build(false));
    if (error) throw error;
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const body: DeliveryInput & { force?: boolean } = await req.json();

    // 前後の空白は重複判定・保存の両方でズレの原因になるため揃える。
    const trim = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : v);
    const projectName = trim(body.project_name) as string;
    const itemName = trim(body.item) as string;
    const vendorName = trim(body.vendor) as string;
    const spec = trim(body.specification);
    const specEmpty = spec == null || spec === '';

    // 二重登録の警告：同じ「日付＋物件名＋品目＋業者名＋内容・規格」が既にあれば、
    // force指定が無い限り409を返して呼び出し側で確認させる（総務と購買が同じものを
    // それぞれ入力してしまう事故を防ぐ）。
    if (!body.force) {
      // 重複判定は「生きている予定」だけを対象にする。削除済み(deleted=true)は数えない。
      // これをしないと、一度削除した予定と同じ内容を再登録しようとしたときに
      // 「既に登録されています」と誤警告が出てしまう（削除済なのに重複扱い）。
      const buildDup = (excludeDeleted: boolean) => {
        let q = supabase
          .from('deliveries')
          .select('id, status')
          .eq('delivery_date', body.delivery_date)
          .eq('project_name', projectName)
          .eq('item', itemName)
          .eq('vendor', vendorName);
        q = specEmpty ? q.is('specification', null) : q.eq('specification', spec);
        if (excludeDeleted) q = q.not('deleted', 'is', true);
        return q.limit(1).maybeSingle();
      };
      let { data: dup, error: dupError } = await buildDup(true);
      // deleted 列が無い古いDBでは条件を外して再判定する
      if (dupError && isMissingColumnError(dupError)) ({ data: dup, error: dupError } = await buildDup(false));
      if (dupError) throw dupError;
      if (dup) {
        return NextResponse.json({ duplicate: true, existingStatus: dup.status }, { status: 409 });
      }
    }

    const insertPayload: Record<string, unknown> = {
      delivery_date: body.delivery_date,
      delivery_time: body.delivery_time ?? null,
      project_name: projectName,
      item: itemName,
      specification: specEmpty ? null : spec,
      vendor: vendorName,
      unload_location: body.unload_location,
      storage_location: body.storage_location ?? null,
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
      order_number: body.order_number ?? null,
      notes: body.notes ?? null,
      status: body.status ?? '予定',
      delivered_at: body.delivered_at ?? null,
      slip_image_path: body.slip_image_path ?? null,
      created_by: trim(body.created_by) ?? null,
      unloaded_by: trim(body.unloaded_by) ?? null,
      is_partial: body.is_partial ?? false,
    };

    // 後付けの任意列がまだ無いDBでも登録できるよう、“実際に無い列だけ”を外して再試行。
    // （created_by は列があれば必ず保存されるように）
    const { data, error } = await insertWithMissingColumnFallback(insertPayload, async (p) =>
      await supabase.from('deliveries').insert(p).select().single()
    );

    if (error) throw error;

    // アプリで新規追加した予定をスプレッドシートにも新しい行として反映する（best-effort）。
    // 成功したらそのNoを sheet_no として保存し、以後の日程変更・削除も自動で同期されるようにする。
    const row = data as Record<string, unknown>;
    const w = await appendDeliveryToSheet({
      delivery_date: String(row.delivery_date),
      delivery_time: (row.delivery_time as string) ?? null,
      project_name: String(row.project_name),
      item: String(row.item),
      specification: (row.specification as string) ?? null,
      vendor: String(row.vendor),
      unload_location: String(row.unload_location),
      notes: (row.notes as string) ?? null,
    });
    if (w.ok && w.sheetNo) {
      const { data: updated, error: updErr } = await supabase
        .from('deliveries')
        .update({ sheet_no: w.sheetNo })
        .eq('id', row.id)
        .select()
        .maybeSingle();
      if (!updErr && updated) return NextResponse.json(updated, { status: 201 });
      if (updErr) console.warn('sheet_no 保存に失敗:', updErr);
    } else if (!w.ok) {
      console.warn('sheet append failed:', w.reason);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
