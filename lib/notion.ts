// Notion API の最小クライアント（SDK を使わず fetch だけで実装）。
// Notion の書き込み制限（平均 毎秒3回）を守るため、呼び出し間隔を空け、429 は待って再試行する。

const API = process.env.NOTION_API_BASE || 'https://api.notion.com/v1';
const VERSION = '2025-09-03';

// 連携先のデータソースID。環境変数で差し替え可能（未設定なら初期構築したDBを使う）。
export const NOTION_DS = {
  projects: process.env.NOTION_DS_PROJECTS || '34aaea24-1d7a-4236-8981-cf1dd7787ae7',
  deliveries: process.env.NOTION_DS_DELIVERIES || 'a33db35b-66da-44da-b6eb-e07e98317765',
  overdue: process.env.NOTION_DS_OVERDUE || 'd324fab9-e241-404d-bd78-bcbd5bf24453',
  orders: process.env.NOTION_DS_ORDERS || '23bacc89-b416-4762-ba5d-0ab19e25b624',
};

export function notionEnabled(): boolean {
  return !!process.env.NOTION_TOKEN;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastCall = 0;

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 340 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) throw new Error(`Notion ${res.status}: ${await res.text()}`);
      const ra = Number(res.headers.get('retry-after'));
      await sleep((ra > 0 ? ra : 1 + attempt) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}

// ---- ページ（行） ----
export interface NotionPage { id: string; properties: Record<string, NotionProp> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProp = any;

/** データソースの全ページを取得（ゴミ箱のものは含まない） */
export async function queryAll(ds: string, filter?: unknown): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const r = await call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      'POST', `/data_sources/${ds}/query`,
      { page_size: 100, ...(filter ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}) },
    );
    out.push(...r.results);
    cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

export async function findByNumber(ds: string, prop: string, value: number): Promise<NotionPage | null> {
  const r = await call<{ results: NotionPage[] }>('POST', `/data_sources/${ds}/query`,
    { page_size: 1, filter: { property: prop, number: { equals: value } } });
  return r.results[0] ?? null;
}

export async function findByText(ds: string, prop: string, value: string): Promise<NotionPage | null> {
  const r = await call<{ results: NotionPage[] }>('POST', `/data_sources/${ds}/query`,
    { page_size: 1, filter: { property: prop, rich_text: { equals: value } } });
  return r.results[0] ?? null;
}

/** 既存ページがあれば更新、無ければ作成してページIDを返す */
export async function upsertPage(ds: string, pageId: string | null, properties: Record<string, unknown>): Promise<string> {
  if (pageId) {
    await call('PATCH', `/pages/${pageId}`, { properties });
    return pageId;
  }
  const r = await call<{ id: string }>('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: ds }, properties,
  });
  return r.id;
}

export async function trashPage(pageId: string): Promise<void> {
  await call('PATCH', `/pages/${pageId}`, { in_trash: true });
}

// ---- プロパティの組み立て ----
const clip = (s: string) => (s.length > 1900 ? `${s.slice(0, 1900)}…` : s);
export const P = {
  title: (s: string) => ({ title: [{ text: { content: clip(s || '（無題）') } }] }),
  text: (s: string | null | undefined) => ({ rich_text: s ? [{ text: { content: clip(s) } }] : [] }),
  num: (n: number | null | undefined) => ({ number: n ?? null }),
  date: (d: string | null | undefined) => ({ date: d ? { start: d } : null }),
  select: (name: string) => ({ select: { name } }),
  rel: (ids: string[]) => ({ relation: ids.map(id => ({ id })) }),
};

// ---- プロパティの読み取り ----
export const R = {
  text: (p: NotionProp): string => (p?.rich_text ?? p?.title ?? []).map((t: { plain_text: string }) => t.plain_text).join(''),
  num: (p: NotionProp): number | null => p?.number ?? null,
  date: (p: NotionProp): string | null => p?.date?.start ?? null,
  select: (p: NotionProp): string | null => p?.select?.name ?? null,
};
