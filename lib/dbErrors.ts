// あとから追加した「無いかもしれない」列。DBにこれらの列がまだ無い環境でも
// 登録・編集が動くよう、列欠落エラー時にはその列だけを外して再試行する。
export const OPTIONAL_COLUMNS = ['created_by', 'is_partial', 'deleted', 'sheet_no', 'unloaded_by'];

// 列が存在しないエラーかどうかをSQLコードで判定する（メッセージ部分一致は誤検知の元）。
// 42703 = Postgres undefined_column / PGRST204 = PostgREST のスキーマ未検出
export function isMissingColumnError(error: { code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204';
}

// 「無い列」の名前を返す。列欠落エラーのときだけ、既知の任意列のうちエラーが
// 指している1つを返す（見つからなければ null）。これで“実際に無い列だけ”を外せる。
// ※以前は列欠落時に created_by まで含め全部外していたため、is_partial だけ無い環境で
//   追加者(created_by)が保存されない不具合があった。
export function missingColumnName(error: { code?: string; message?: string } | null): string | null {
  if (!isMissingColumnError(error)) return null;
  const msg = (error && error.message) || '';
  for (const col of OPTIONAL_COLUMNS) if (msg.includes(col)) return col;
  return null;
}

// payload から、DBに無い任意列だけを外して再試行する。返り値は最終結果。
export async function insertWithMissingColumnFallback<T>(
  payload: Record<string, unknown>,
  run: (p: Record<string, unknown>) => Promise<{ data: T; error: { code?: string; message?: string } | null }>,
): Promise<{ data: T; error: { code?: string; message?: string } | null }> {
  let res = await run(payload);
  let guard = 0;
  while (res.error && guard++ < OPTIONAL_COLUMNS.length + 1) {
    const col = missingColumnName(res.error);
    if (!col || !(col in payload)) break;
    delete payload[col];
    res = await run(payload);
  }
  return res;
}
