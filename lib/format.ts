// 納入確認時刻などの日時を「YYYY/MM/DD HH:mm」（日本時間）で表示する。
// 新しいデータは ISO(UTC) で保存されるが、古いデータは "2026/7/9 10:30:00" の
// ようなロケール文字列で入っていることがあるため、解析できないものはそのまま返す。
export function formatDateTimeJst(value: string | null | undefined): string {
  if (!value) return '';
  // 既に "YYYY/MM/DD ..." 形式（旧データ）はそのまま表示
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000); // UTC→JST
  const p = (n: number) => String(n).padStart(2, '0');
  return `${jst.getUTCFullYear()}/${p(jst.getUTCMonth() + 1)}/${p(jst.getUTCDate())} ${p(jst.getUTCHours())}:${p(jst.getUTCMinutes())}`;
}
