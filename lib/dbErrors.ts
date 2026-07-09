// created_by 列が未追加のDBかどうかを、エラー内容から判定する。
// （Postgres: 42703 undefined_column / PostgREST: PGRST204、メッセージに列名を含む）
export function isMissingCreatedByColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // SQLコードで判定する（メッセージ部分一致だと、created_by に関する別のエラー
  // ＝NOT NULL制約違反等まで「列が無い」と誤検知して黙って値を落とす恐れがある）。
  // 42703 = Postgres undefined_column / PGRST204 = PostgRESTのスキーマ未検出
  return error.code === '42703' || error.code === 'PGRST204';
}
