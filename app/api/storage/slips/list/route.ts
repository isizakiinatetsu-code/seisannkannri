import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';

const BUCKET = 'slips';

// slips バケットのファイル一覧（名前・サイズ・公開URL）を返す。一括再圧縮ツール用。
export async function GET(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const supabase = getSupabase();
    const LIMIT = 100;
    type Row = { name: string; size: number | null; url: string };
    const files: Row[] = [];
    for (let offset = 0; ; offset += LIMIT) {
      const { data, error } = await supabase.storage.from(BUCKET).list('', {
        limit: LIMIT, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      const batch = data ?? [];
      for (const f of batch) {
        // フォルダ（idがnull）は除外
        if (!f.name || f.name.endsWith('/')) continue;
        const size = (f.metadata as { size?: number } | null)?.size ?? null;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(f.name);
        files.push({ name: f.name, size, url: pub.publicUrl });
      }
      if (batch.length < LIMIT) break;
    }
    const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
    return NextResponse.json({ count: files.length, totalBytes, files });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
