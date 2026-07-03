import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, DeliveryInput } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

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

    let query = supabase.from('deliveries').select('*');

    if (projectName) query = query.ilike('project_name', `%${projectName}%`);
    if (item) query = query.ilike('item', `%${item}%`);
    if (vendor) query = query.ilike('vendor', `%${vendor}%`);
    if (unloadLocation) query = query.ilike('unload_location', `%${unloadLocation}%`);
    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('delivery_date', dateFrom);
    if (dateTo) query = query.lte('delivery_date', dateTo);
    if (month) query = query.like('delivery_date', `${month}%`);

    query = query
      .order('delivery_date', { ascending: true })
      .order('delivery_time', { ascending: true, nullsFirst: false });

    const { data, error } = await query;
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
  const denied = requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const body: DeliveryInput & { force?: boolean } = await req.json();

    // 二重登録の警告：同じ「日付＋物件名＋品目＋業者名＋内容・規格」が既にあれば、
    // force指定が無い限り409を返して呼び出し側で確認させる（総務と購買が同じものを
    // それぞれ入力してしまう事故を防ぐ）。
    if (!body.force) {
      let dupQuery = supabase
        .from('deliveries')
        .select('id, status')
        .eq('delivery_date', body.delivery_date)
        .eq('project_name', body.project_name)
        .eq('item', body.item)
        .eq('vendor', body.vendor);
      dupQuery = (body.specification == null || body.specification === '')
        ? dupQuery.is('specification', null)
        : dupQuery.eq('specification', body.specification);
      const { data: dup, error: dupError } = await dupQuery.limit(1).maybeSingle();
      if (dupError) throw dupError;
      if (dup) {
        return NextResponse.json({ duplicate: true, existingStatus: dup.status }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from('deliveries')
      .insert({
        delivery_date: body.delivery_date,
        delivery_time: body.delivery_time ?? null,
        project_name: body.project_name,
        item: body.item,
        specification: body.specification ?? null,
        vendor: body.vendor,
        unload_location: body.unload_location,
        storage_location: body.storage_location ?? null,
        quantity: body.quantity ?? null,
        unit: body.unit ?? null,
        order_number: body.order_number ?? null,
        notes: body.notes ?? null,
        status: body.status ?? '予定',
        delivered_at: body.delivered_at ?? null,
        slip_image_path: body.slip_image_path ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
