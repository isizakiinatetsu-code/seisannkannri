// 物件名・業者名などの表記ゆれを吸収するための正規化。
// - NFKC で全角英数記号→半角、半角カナ→全角 などを統一
// - 連続する空白（全角スペース含む）を1つの半角スペースに
// - 前後の空白を除去
// これにより「佐保小学校」「佐保　小学校」「佐保 小学校」などを同一視できる。
export function normalizeName(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}

// 納入場所/荷下ろし場所の表記を、統一表記（漢数字）へ寄せる。
// 例: 「第1工場」「第１工場」→「第一南」、「第2工場北」→「第二北」、「第3工場(表)」→「第三」、
//     「第2ヤード」→「第二ヤード」。判定できないものはそのまま返す（データ消失を避ける）。
const ARABIC_TO_KANJI: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九' };
export function normalizeUnloadLocation(value: string | null | undefined): string {
  let t = normalizeName(value).replace(/\s/g, '');
  if (!t) return '';
  if (t === '未定' || t === '事務所') return t;
  // 数字を漢数字へ、余分な語（工場・(表)）を除去
  t = t.replace(/[1-9]/g, d => ARABIC_TO_KANJI[d] ?? d);
  t = t.replace(/工場/g, '').replace(/[(（].*?[)）]/g, '');
  // ヤード
  const y = t.match(/^第([一二三四五六])ヤード$/);
  if (y) return `第${y[1]}ヤード`;
  // 第N（＋方角）
  const m = t.match(/^第([一二三四五六])(南|北)?$/);
  if (m) {
    const n = m[1], dir = m[2] ?? '';
    if (n === '一') return '第一南';            // 第一は南のみ（第一北は廃止）
    if (n === '二') return dir ? `第二${dir}` : '第二北';
    if (n === '三') return '第三';
    if (n === '四') return '第四';
  }
  return t; // 判別できない場合は元の（正規化した）文字列を返す
}

// 荷下ろし場所の「決められた並び順」の順位を返す（事務所→第一南→…→未定）。
// システム内で場所を並べるときは localeCompare ではなくこの順位を使う。
// 循環参照を避けるためリストはここに直接持つ（lib/constants の UNLOAD_LOCATIONS と一致させること）。
const UNLOAD_LOCATION_ORDER: readonly string[] = [
  '事務所', '第一南', '第二北', '第二南', '第三', '第四',
  '第一ヤード', '第二ヤード', '第三ヤード', '第四ヤード', '第五ヤード', '第六ヤード', '未定',
];
export function unloadLocationRank(value: string | null | undefined): number {
  const n = normalizeUnloadLocation(value);
  const i = UNLOAD_LOCATION_ORDER.indexOf(n);
  return i >= 0 ? i : UNLOAD_LOCATION_ORDER.length; // 一覧に無いものは末尾
}
