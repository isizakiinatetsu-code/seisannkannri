import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDB();
    const { id } = await params;
    const row = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDB();
    const { id } = await params;
    const body = await req.json();

    const existing = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const fields = Object.keys(body)
      .filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
      .map(k => `${k} = @${k}`)
      .join(', ');

    if (!fields) return NextResponse.json(existing);

    db.prepare(`
      UPDATE deliveries SET ${fields}, updated_at = datetime('now', 'localtime') WHERE id = @id
    `).run({ ...body, id });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDB();
    const { id } = await params;
    const result = db.prepare('DELETE FROM deliveries WHERE id = ?').run(id);
    if (result.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
