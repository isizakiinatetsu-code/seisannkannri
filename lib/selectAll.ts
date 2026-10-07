// Supabase(PostgREST) は1回の取得が最大1000行で黙って打ち切られる。
// 1000行を超え得る一覧は、この関数でページを分けて全件を取得する。
// build(from, to) には、並び順が一意になるよう最後に .order('id') を付けたクエリを返すこと。
type PageResult<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<PageResult<T> & { data: T[] }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { data: rows, error: null };
  }
}

/** 日本時間の今日 YYYY-MM-DD（サーバーがUTCでも正しく出す） */
export function jstYmd(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
