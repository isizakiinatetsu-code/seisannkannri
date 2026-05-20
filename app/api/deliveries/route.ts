import { NextRequest, NextResponse } from 'next/server';
import { getDB, DeliveryInput } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDB();
    const { searchParams } = new URL(req.url);
    const projectName = searchParams.get('project_name');
    const item = searchParams.get('item');
    const vendor = searchParams.get('vendor');
    const unloadLocation = searchParams.get('unload_location');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const month = searchParams.get('month'); // YYYY-MM

    let query = 'SELECT * FROM deliveries WHERE 1=1';
    const params: (string | number)[] = [];

    if (projectName) {
      query += ' AND project_name LIKE ?';
      params.push(`%${projectName}%`);
    }
    if (item) {
      query += ' AND item LIKE ?';
      params.push(`%${item}%`);
    }
    if (vendor) {
      query += ' AND vendor LIKE ?';
      params.push(`%${vendor}%`);
    }
    if (unloadLocation) {
      query += ' AND unload_location LIKE ?';
      params.push(`%${unloadLocation}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (dateFrom) {
      query += ' AND delivery_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND delivery_date <= ?';
      params.push(dateTo);
    }
    if (month) {
      query += ' AND delivery_date LIKE ?';
      params.push(`${month}%`);
    }

    query += ' ORDER BY delivery_date ASC, delivery_time ASC NULLS LAST';

    const rows = db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDB();
    const body: DeliveryInput = await req.json();

    const stmt = db.prepare(`
      INSERT INTO deliveries
        (delivery_date, delivery_time, project_name, item, specification,
         vendor, unload_location, storage_location, quantity, unit,
         order_number, notes, status, delivered_at, slip_image_path)
      VALUES
        (@delivery_date, @delivery_time, @project_name, @item, @specification,
         @vendor, @unload_location, @storage_location, @quantity, @unit,
         @order_number, @notes, @status, @delivered_at, @slip_image_path)
    `);

    const result = stmt.run({
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
    });

    const newRow = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(newRow, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
