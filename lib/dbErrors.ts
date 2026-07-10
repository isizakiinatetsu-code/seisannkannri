// あとから追加した「無いかもしれない」列。DBにこれらの列がまだ無い環境でも
// 登録・編集が動くよう、列欠落エラー時にはこれらを外して再試行する。
export const OPTIONAL_COLUMNS = ['created_by', 'is_partial'];

// 列が存在しないエラーかどうかをSQLコードで判定する（メッセージ部分一致は誤検知の元）。
// 42703 = Postgres undefined_column / PGRST204 = PostgREST のスキーマ未検出
export function isMissingColumnError(error: { code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204';
}

// payload から後付けの任意列を取り除く（列欠落時の再試行用）。
export function stripOptionalColumns(payload: Record<string, unknown>): void {
  for (const col of OPTIONAL_COLUMNS) delete payload[col];
}
