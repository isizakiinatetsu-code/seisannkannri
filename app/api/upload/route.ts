import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const BUCKET = 'slips';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    if (!['jpg', 'jpeg', 'png', 'pdf', 'webp'].includes(ext)) {
      return NextResponse.json({ error: '対応形式: JPG, PNG, PDF, WEBP' }, { status: 400 });
    }

    const supabase = getSupabase();
    const filename = `slip_${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: file.type || undefined, upsert: false });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    return NextResponse.json({ path: data.publicUrl, filename });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
