// 物件名・業者名などの表記ゆれを吸収するための正規化。
// - NFKC で全角英数記号→半角、半角カナ→全角 などを統一
// - 連続する空白（全角スペース含む）を1つの半角スペースに
// - 前後の空白を除去
// これにより「佐保小学校」「佐保　小学校」「佐保 小学校」などを同一視できる。
export function normalizeName(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}
