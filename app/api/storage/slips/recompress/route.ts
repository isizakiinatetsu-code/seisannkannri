import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

const BUCKET = 'slips';

// 1ファイルを「元を外して → 同じパスに軽い画像を入れ直す」で置き換える。
// 先に remove して空きを作ってから upload するため、容量超過中でも書き込みが通る。
// パス（URL）は変えないので、アプリ側の伝票表示・DB参照はそのまま。
export async function POST(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const path = form.get('path');
    const file = form.get('file') as File | null;
    if (typeof path !== 'string' || !path || !file) {
      return NextResponse.json({ error: 'path と file が必要です' }, { status: 400 });
    }
    // 想定外のパス（区切り・上位移動）は拒否
    if (path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: '不正なパスです' }, { status: 400 });
    }
    const supabase = getSupabase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // 先に元を削除して空きを作る（超過中でも次のuploadが通るように）
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) throw rmErr;
    // 同じパスへ軽い画像を入れ直す
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/jpeg', upsert: true,
    });
    if (upErr) throw upErr;

    return NextResponse.json({ ok: true, newSize: buffer.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
