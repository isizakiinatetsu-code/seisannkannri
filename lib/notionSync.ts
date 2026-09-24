// 納入管理システム → Notion の片方向同期。
// ・システム側が正。Notion の「担当」「対応済み」「対応メモ」「確認済み」は利用者の入力欄なので上書きしない。
// ・同期は何度実行しても同じ結果になる（途中で時間切れになっても、次回の実行で続きから進む）。
import { getSupabase } from '@/lib/supabase';
import { IMPL_START_DATE } from '@/lib/constants';
import { normalizeName } from '@/lib/textNormalize';
import { isMissingColumnError } from '@/lib/dbErrors';
import { reconcile, DeliveryLite } from '@/lib/checklist';
import {
  NOTION_DS as DS, notionEnabled, queryAll, findByNumber, findByText,
  upsertPage, trashPage, P, R, NotionPage,
} from '@/lib/notion';

interface Row {
  id: number; delivery_date: string; delivery_time: string | null; project_name: string;
  item: string; specification: string | null; vendor: string; unload_location: string | null;
  notes: string | null; status: string; is_partial: boolean | null; deleted: boolean | null;
  updated_at: string;
}

const COLS = 'id, delivery_date, delivery_time, project_name, item, specification, vendor, unload_location, notes, status, is_partial, updated_at';

/** 日本時間の今日 YYYY-MM-DD（サーバーがUTCでも正しく出す） */
function jstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
const daysLate = (date: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400_000);

const stateLabel = (r: Row) =>
  r.deleted ? '削除' : r.status === '納入済み' ? '納入済み' : r.is_partial ? '一部納入' : '予定';
const isOverdue = (r: Row, today: string) => !r.deleted && r.status !== '納入済み' && r.delivery_date < today;
const overdueKind = (r: Row) => (r.is_partial ? '一部納入' : '未納入');
const nowIso = () => new Date().toISOString();

async function fetchRows(filterId?: number): Promise<Row[]> {
  const supabase = getSupabase();
  const PAGE = 1000;
  async function run(withDeleted: boolean) {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('deliveries').select(withDeleted ? `${COLS}, deleted` : COLS);
      q = filterId != null ? q.eq('id', filterId) : q.gte('delivery_date', IMPL_START_DATE);
      const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1) as
        { data: Row[] | null; error: { code?: string } | null };
      if (error) return { rows, error };
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }
    return { rows, error: null };
  }
  let { rows, error } = await run(true);
  if (error && isMissingColumnError(error)) ({ rows, error } = await run(false));
  if (error) throw error;
  return rows;
}

// ---- 各DBのプロパティ ----
function deliveryProps(r: Row, projectPageId: string | null) {
  return {
    件名: P.title(`${r.project_name} ${r.item}`),
    システムID: P.num(r.id),
    納入日: P.date(r.delivery_date),
    時刻: P.text(r.delivery_time),
    物件: P.rel(projectPageId ? [projectPageId] : []),
    物件名: P.text(r.project_name),
    品目: P.text(r.item),
    '内容・規格': P.text(r.specification),
    業者: P.text(r.vendor),
    降し場所: P.text(r.unload_location),
    状態: P.select(stateLabel(r)),
    備考: P.text(r.notes),
    システム更新: P.text(r.updated_at),
    最終同期: P.date(nowIso()),
  };
}
function overdueProps(r: Row, projectPageId: string | null, today: string) {
  return {
    件名: P.title(`${r.project_name} ${r.item}`),
    システムID: P.num(r.id),
    納入予定日: P.date(r.delivery_date),
    超過日数: P.num(daysLate(r.delivery_date, today)),
    区分: P.select(overdueKind(r)),
    物件: P.rel(projectPageId ? [projectPageId] : []),
    品目: P.text([r.item, r.specification].filter(Boolean).join('・')),
    業者: P.text(r.vendor),
    最終同期: P.date(nowIso()),
  };
}

async function ensureProject(name: string): Promise<string | null> {
  const key = normalizeName(name);
  if (!key) return null;
  const found = await findByText(DS.projects, '物件キー', key);
  if (found) return found.id;
  return upsertPage(DS.projects, null, { 物件名: P.title(name), 物件キー: P.text(key), 最終同期: P.date(nowIso()) });
}

// =====================================================================
// 即時反映：1件の予定が登録・変更・削除されたときに呼ぶ
// =====================================================================
export async function pushDeliveryToNotion(id: number): Promise<void> {
  if (!notionEnabled()) return;
  try {
    const [r] = await fetchRows(id);
    const page = await findByNumber(DS.deliveries, 'システムID', id);
    const ov = await findByNumber(DS.overdue, 'システムID', id);
    if (!r || r.deleted) {
      if (page) await trashPage(page.id);
      if (ov) await trashPage(ov.id);
      return;
    }
    const proj = await ensureProject(r.project_name);
    await upsertPage(DS.deliveries, page?.id ?? null, deliveryProps(r, proj));
    const today = jstToday();
    if (isOverdue(r, today)) {
      await upsertPage(DS.overdue, ov?.id ?? null, overdueProps(r, proj, today));
    } else if (ov && R.select(ov.properties['区分']) !== '解消（納入済み）') {
      await upsertPage(DS.overdue, ov.id, { 区分: P.select('解消（納入済み）'), 最終同期: P.date(nowIso()) });
    }
  } catch (e) {
    console.error('[notion] 即時反映に失敗', id, e);
  }
}

// =====================================================================
// 一括同期：定期実行・手動ボタンから呼ぶ。budgetMs を超えたら途中で返し、次回続きから。
// =====================================================================
export interface SyncResult {
  done: boolean;
  phase: string;
  written: number;
  counts: { projects: number; deliveries: number; overdue: number; orders: number };
}

export async function runNotionSync(budgetMs = 8000): Promise<SyncResult> {
  if (!notionEnabled()) throw new Error('NOTION_TOKEN が設定されていません');
  const start = Date.now();
  let written = 0;
  // 読み込みだけで時間を使い切っても前に進めるよう、1回の呼び出しで最低3件は書き込む
  // （これが無いと、データが多いとき書き込み0件のまま「途中」を返し続けて終わらない）。
  const over = () => written >= 3 && Date.now() - start > budgetMs;
  const counts = { projects: 0, deliveries: 0, overdue: 0, orders: 0 };
  const partial = (phase: string): SyncResult => ({ done: false, phase, written, counts });

  const rows = await fetchRows();
  const live = rows.filter(r => !r.deleted);
  const today = jstToday();

  // ---- 物件 ----
  const groups = new Map<string, { name: string; rows: Row[] }>();
  for (const r of live) {
    const key = normalizeName(r.project_name);
    if (!key) continue;
    const g = groups.get(key) ?? { name: r.project_name, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  counts.projects = groups.size;
  const projPages = new Map<string, NotionPage>();
  for (const p of await queryAll(DS.projects)) projPages.set(R.text(p.properties['物件キー']), p);
  const projId = (name: string) => projPages.get(normalizeName(name))?.id ?? null;

  for (const [key, g] of groups) {
    const total = g.rows.length;
    const done = g.rows.filter(r => r.status === '納入済み').length;
    const pending = g.rows.filter(r => r.status !== '納入済み');
    const pool = pending.length ? pending : g.rows;
    const ready = pool.reduce((mx, r) => (r.delivery_date > mx ? r.delivery_date : mx), pool[0].delivery_date);
    const page = projPages.get(key);
    const same = page
      && R.num(page.properties['納入件数']) === total
      && R.num(page.properties['納入済み']) === done
      && R.num(page.properties['未納入']) === pending.length
      && R.date(page.properties['揃う予定日']) === ready
      && R.text(page.properties['物件名']) === g.name;
    if (same) continue;
    if (over()) return partial('物件');
    const id = await upsertPage(DS.projects, page?.id ?? null, {
      物件名: P.title(g.name), 物件キー: P.text(key), 納入件数: P.num(total), 納入済み: P.num(done),
      未納入: P.num(pending.length), 揃う予定日: P.date(ready), 最終同期: P.date(nowIso()),
    });
    if (!page) projPages.set(key, { id, properties: { 物件キー: { rich_text: [{ plain_text: key }] } } });
    written++;
  }

  // ---- 納入予定 ----
  counts.deliveries = live.length;
  const dPages = new Map<number, NotionPage>();
  for (const p of await queryAll(DS.deliveries)) {
    const id = R.num(p.properties['システムID']);
    if (id != null) dPages.set(id, p);
  }
  for (const r of rows) {
    const page = dPages.get(r.id);
    if (r.deleted) {
      if (!page) continue;
      if (over()) return partial('納入予定');
      await trashPage(page.id); written++;
      continue;
    }
    if (page && R.text(page.properties['システム更新']) === r.updated_at) continue;
    if (over()) return partial('納入予定');
    await upsertPage(DS.deliveries, page?.id ?? null, deliveryProps(r, projId(r.project_name)));
    written++;
  }

  // ---- 要対応（納入遅れ） ----
  const ovPages = new Map<number, NotionPage>();
  for (const p of await queryAll(DS.overdue)) {
    const id = R.num(p.properties['システムID']);
    if (id != null) ovPages.set(id, p);
  }
  const overdueRows = live.filter(r => isOverdue(r, today));
  counts.overdue = overdueRows.length;
  const overdueIds = new Set(overdueRows.map(r => r.id));
  for (const r of overdueRows) {
    const page = ovPages.get(r.id);
    const same = page
      && R.select(page.properties['区分']) === overdueKind(r)
      && R.num(page.properties['超過日数']) === daysLate(r.delivery_date, today)
      && R.date(page.properties['納入予定日']) === r.delivery_date;
    if (same) continue;
    if (over()) return partial('要対応');
    await upsertPage(DS.overdue, page?.id ?? null, overdueProps(r, projId(r.project_name), today));
    written++;
  }
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const [id, page] of ovPages) {
    if (overdueIds.has(id)) continue;
    const r = byId.get(id);
    if (!r || r.deleted) {
      if (over()) return partial('要対応');
      await trashPage(page.id); written++;
    } else if (R.select(page.properties['区分']) !== '解消（納入済み）') {
      if (over()) return partial('要対応');
      await upsertPage(DS.overdue, page.id, { 区分: P.select('解消（納入済み）'), 最終同期: P.date(nowIso()) });
      written++;
    }
  }

  // ---- 発注忘れ候補（現寸チェックの未手配） ----
  const excluded = new Map<string, Set<string>>();
  try {
    const { data, error } = await getSupabase().from('checklist_excluded').select('project_key, item_key');
    if (!error) for (const d of (data ?? []) as { project_key: string; item_key: string }[]) {
      const s = excluded.get(d.project_key) ?? new Set<string>();
      s.add(d.item_key);
      excluded.set(d.project_key, s);
    }
  } catch { /* テーブル未作成なら除外なし */ }
  const oPages = new Map<string, NotionPage>();
  for (const p of await queryAll(DS.orders)) oPages.set(R.text(p.properties['物件キー']), p);

  for (const [key, g] of groups) {
    // 新規作成は進行中（未納入が残っている）物件だけ。既に Notion にある物件は、
    // 全部納入済みになった後も未手配（発注忘れ）が残り得るので引き続き更新する。
    if (!g.rows.some(r => r.status !== '納入済み') && !oPages.has(key)) continue;
    const rec = reconcile(g.rows as unknown as DeliveryLite[], excluded.get(key));
    const items: string[] = [];
    for (const sec of rec.sections) for (const gr of sec.groups) for (const it of gr.items)
      if (it.status === 'none') items.push(`・${sec.section}／${gr.group}／${it.label}`);
    counts.orders += items.length ? 1 : 0;
    const text = items.join('\n');
    const state = items.length ? '未手配あり' : '解消';
    const page = oPages.get(key);
    if (!page && !items.length) continue;
    const same = page
      && R.num(page.properties['未手配件数']) === items.length
      && R.text(page.properties['未手配項目']) === (text.length > 1900 ? `${text.slice(0, 1900)}…` : text)
      && R.select(page.properties['状態']) === state;
    if (same) continue;
    if (over()) return partial('発注忘れ候補');
    await upsertPage(DS.orders, page?.id ?? null, {
      件名: P.title(`${g.name} 発注忘れ候補`), 物件キー: P.text(key), 物件: P.rel(projId(g.name) ? [projId(g.name)!] : []),
      未手配件数: P.num(items.length), 未手配項目: P.text(text), 状態: P.select(state), 最終同期: P.date(nowIso()),
    });
    written++;
  }

  return { done: true, phase: '完了', written, counts };
}
