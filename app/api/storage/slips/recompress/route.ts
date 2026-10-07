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
    // 再圧縮できるのは画像だけ（発注書などのPDFをJPEGで上書きして壊さない）
    if (!/\.(jpe?g|png|webp)$/i.test(path)) {
      return NextResponse.json({ error: '画像以外は再圧縮できません' }, { status: 400 });
    }
    const supabase = getSupabase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // まず上書きで入れ替える（失敗しても元の画像は残る）。
    const up = () => supabase.storage.from(BUCKET).upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    let { error: upErr } = await up();
    if (upErr) {
      // 容量超過で上書きできないときだけ、元を消して空きを作ってから入れ直す。
      // その入れ直しにも失敗したら元に戻す（画像が消えたままにならないように）。
      const { data: orig } = await supabase.storage.from(BUCKET).download(path);
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) throw rmErr;
      ({ error: upErr } = await up());
      if (upErr) {
        if (orig) await supabase.storage.from(BUCKET).upload(path, Buffer.from(await orig.arrayBuffer()), { contentType: orig.type || 'image/jpeg', upsert: true });
        throw upErr;
      }
    }

    return NextResponse.json({ ok: true, newSize: buffer.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
