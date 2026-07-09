import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

const BUCKET = 'slips';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  const { id } = await params;
  const supabase = getSupabase();

  const { data: slip, error: fetchError } = await supabase
    .from('delivery_slips')
    .select('slip_image_path')
    .eq('id', id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });

  // Extract filename from URL and delete from storage
  const url = slip.slip_image_path as string;
  const filename = url.split('/').pop();
  if (filename) {
    await supabase.storage.from(BUCKET).remove([filename]);
  }

  const { error } = await supabase.from('delivery_slips').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
