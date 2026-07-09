// created_by 列が未追加のDBかどうかを、エラー内容から判定する。
// （Postgres: 42703 undefined_column / PostgREST: PGRST204、メッセージに列名を含む）
export function isMissingCreatedByColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return typeof error.message === 'string' && error.message.includes('created_by');
}
