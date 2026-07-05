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

    // 楽観ロック用：クライアントが読み込んだ時点の updated_at。
    // これと現在の値が食い違えば「別の人が先に更新した」と判断する。
    const expectedUpdatedAt: string | undefined = body.expected_updated_at;

    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(body)) {
      if (k === 'id' || k === 'created_at' || k === 'updated_at' || k === 'expected_updated_at') continue;
      fields[k] = body[k];
    }

    if (Object.keys(fields).length === 0) {
      const { data: existing, error: existingError } = await supabase.from('deliveries').select('*').eq('id', id).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(existing);
    }

    let updateQuery = supabase.from('deliveries').update(fields).eq('id', id);
    if (expectedUpdatedAt) {
      updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
    }
    const { data, error } = await updateQuery.select().maybeSingle();

    if (error) throw error;
    if (!data) {
      // 更新対象が0件。存在しないのか、競合（updated_atが変わった）のか判別する。
      const { data: current } = await supabase.from('deliveries').select('*').eq('id', id).maybeSingle();
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      // レコードは存在するのに更新できなかった = 別の人が先に更新している
      return NextResponse.json(
        { conflict: true, current, error: '他の人が先にこの予定を更新しました' },
        { status: 409 }
      );
    }
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
