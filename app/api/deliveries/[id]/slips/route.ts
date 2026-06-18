import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';
import { uploadToDrive } from '@/lib/googleDrive';

const BUCKET = 'slips';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('delivery_slips')
    .select('*')
    .eq('delivery_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireEditRole(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    if (!['jpg', 'jpeg', 'png', 'pdf', 'webp'].includes(ext)) {
      return NextResponse.json({ error: '対応形式: JPG, PNG, PDF, WEBP' }, { status: 400 });
    }

    const supabase = getSupabase();
    const filename = `slip_${id}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: file.type || undefined, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    const { data, error: insertError } = await supabase
      .from('delivery_slips')
      .insert({ delivery_id: Number(id), slip_image_path: urlData.publicUrl })
      .select()
      .single();
    if (insertError) throw insertError;

    // ベストエフォートで Google Drive の【納入管理】フォルダにも保存する。
    // Claude Cowork などから検索・参照できるようにするための経路。失敗しても伝票保存は成功扱い。
    try {
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('project_name, item, delivery_date')
        .eq('id', id)
        .maybeSingle();
      const datePart = delivery?.delivery_date ?? new Date().toISOString().slice(0, 10);
      const projectPart = (delivery?.project_name ?? '物件未設定').replace(/[\\/:*?"<>|]/g, '_');
      const itemPart = (delivery?.item ?? '').replace(/[\\/:*?"<>|]/g, '_');
      const driveName = `${datePart}_${projectPart}_${itemPart}_伝票${id}_${Date.now()}.${ext}`;
      await uploadToDrive(buffer, driveName, file.type || 'image/jpeg');
    } catch (driveErr) {
      console.error('Drive 連携でエラー（無視して続行）', driveErr);
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `Upload failed: ${e}` }, { status: 500 });
  }
}
