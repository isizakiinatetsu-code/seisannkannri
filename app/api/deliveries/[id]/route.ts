import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id } = await params;
    const { data, error } = await supabase.from('deliveries').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const { id } = await params;
    const body = await req.json();

    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(body)) {
      if (k === 'id' || k === 'created_at' || k === 'updated_at') continue;
      fields[k] = body[k];
    }

    if (Object.keys(fields).length === 0) {
      const { data: existing, error: existingError } = await supabase.from('deliveries').select('*').eq('id', id).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(existing);
    }

    const { data, error } = await supabase
      .from('deliveries')
      .update(fields)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const { id } = await params;
    const { data, error } = await supabase.from('deliveries').delete().eq('id', id).select().maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
