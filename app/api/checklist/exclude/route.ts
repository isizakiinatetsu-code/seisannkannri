import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { requireEditRole } from '@/lib/auth';
import { normalizeName } from '@/lib/textNormalize';

// 現寸チェック項目の「対象外」を物件ごとにオン/オフする。
// body: { project, itemKey, excluded }  excluded=true で対象外、false で解除。
export async function POST(req: NextRequest) {
  const denied = await requireEditRole(req);
  if (denied) return denied;
  try {
    const { project, itemKey, excluded } = await req.json();
    if (typeof project !== 'string' || typeof itemKey !== 'string' || !project || !itemKey) {
      return NextResponse.json({ error: 'project と itemKey が必要です' }, { status: 400 });
    }
    const key = normalizeName(project);
    const supabase = getSupabase();
    if (excluded) {
      const { error } = await supabase.from('checklist_excluded').upsert({ project_key: key, item_key: itemKey });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('checklist_excluded').delete().eq('project_key', key).eq('item_key', itemKey);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // テーブル未作成の場合は分かりやすく返す
    const msg = String(e);
    const notReady = /checklist_excluded|does not exist|relation .* does not exist|schema cache/i.test(msg);
    return NextResponse.json({ error: notReady ? 'checklist_excluded テーブルが未作成です（schema.sql を1回実行してください）' : msg }, { status: 500 });
  }
}
