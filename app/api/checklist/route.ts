import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { IMPL_START_DATE } from '@/lib/constants';
import { normalizeName } from '@/lib/textNormalize';
import { reconcile, DeliveryLite } from '@/lib/checklist';
import { isMissingColumnError } from '@/lib/dbErrors';

export const maxDuration = 30;

interface Row extends DeliveryLite { project_name: string }

// 生きている納入データを全件ページングで取得（削除済みは除外・1000件打ち切りを回避）。
async function fetchAll(): Promise<Row[]> {
  const supabase = getSupabase();
  const PAGE = 1000;
  const full = 'id, item, specification, notes, vendor, delivery_date, status, project_name, unload_location, deleted';
  const min = 'id, item, specification, notes, vendor, delivery_date, status, project_name, unload_location';
  async function run(excludeDeleted: boolean) {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('deliveries').select(excludeDeleted ? full : min)
        .gte('delivery_date', IMPL_START_DATE)
        .order('delivery_date', { ascending: true }).order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (excludeDeleted) q = q.eq('deleted', false);
      const { data, error } = await q as { data: Row[] | null; error: { code?: string } | null };
      if (error) return { rows, error };
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return { rows, error: null as { code?: string } | null };
  }
  let { rows, error } = await run(true);
  if (error && isMissingColumnError(error)) ({ rows, error } = await run(false));
  if (error) throw error;
  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const project = searchParams.get('project');
    const rows = await fetchAll();

    if (project) {
      const key = normalizeName(project);
      const mine = rows.filter(r => normalizeName(r.project_name) === key);
      return NextResponse.json({ project, count: mine.length, reconciled: reconcile(mine) });
    }

    // 物件ごとにまとめて、組立工ビュー用のサマリ（揃う日・進捗）を返す。
    const groups = new Map<string, { name: string; rows: Row[] }>();
    for (const r of rows) {
      const key = normalizeName(r.project_name);
      if (!key) continue;
      const g = groups.get(key) ?? { name: r.project_name, rows: [] };
      g.rows.push(r);
      groups.set(key, g);
    }
    const board = Array.from(groups.values()).map(g => {
      const total = g.rows.length;
      const done = g.rows.filter(r => r.status === '納入済み').length;
      const pending = g.rows.filter(r => r.status !== '納入済み');
      const allDelivered = total > 0 && pending.length === 0;
      const pool = pending.length ? pending : g.rows;
      const readyDate = pool.reduce((mx, r) => (r.delivery_date > mx ? r.delivery_date : mx), pool[0].delivery_date);
      return { name: g.name, total, done, pending: pending.length, allDelivered, readyDate };
    });
    // 未着(pending多い)を上に、次に揃う日が近い順
    board.sort((a, b) =>
      (a.allDelivered ? 1 : 0) - (b.allDelivered ? 1 : 0) ||
      a.readyDate.localeCompare(b.readyDate) ||
      a.name.localeCompare(b.name, 'ja'));

    const projects = board.map(b => b.name).sort((a, b) => a.localeCompare(b, 'ja'));
    return NextResponse.json({ projects, board });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
