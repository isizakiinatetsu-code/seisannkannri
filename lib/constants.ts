export const ITEM_CATEGORIES = [
  '型板',
  '一次加工品',
  '二次部材',
  '副資材',
  '鋼材',
  'スプライス',
  'ブレース',
  'ボルト',
  '現場用ボルト',
  'ハイベース',
  '支給材',
  '支給品',
  'ロール材',
  '市中材',
  '注文材',
  'その他',
] as const;

// カード背景（白文字）で使うため、どれも白文字が読める濃さに調整し、
// 色相をできるだけ離して見分けやすくしている。
// 灰色は「納入済み」専用にし、「その他（未分類）」は別の中間色にする。
// 目に優しいよう彩度を抑えた（くすませた）トーンで、かつ色相は離して見分けやすく。
// カード背景（白文字）で使うため、白文字が読める濃さにしている。
export const CATEGORY_COLORS: Record<string, string> = {
  '型板': '#c2453f',        // くすんだ赤
  '一次加工品': '#cf6a3c',   // テラコッタ
  '二次部材': '#9c6b3f',     // タン（焦茶）
  '副資材': '#b08a2e',       // 落ち着いた金
  // 鋼材・ロール材・市中材・注文材は「素材系」として同じ緑にまとめる
  '鋼材': '#3f8f5f',
  'ロール材': '#3f8f5f',
  '市中材': '#3f8f5f',
  '注文材': '#3f8f5f',
  'スプライス': '#3f8c86',   // くすんだティール
  'ブレース': '#4f6fb0',     // くすんだ青
  // ボルト・現場用ボルトは同じ菫色にまとめる
  'ボルト': '#6f5aa8',
  '現場用ボルト': '#6f5aa8',
  'ハイベース': '#a85f9c',   // モーブ（くすんだマゼンタ）
  // 支給材・支給品は同じピンクにまとめる
  '支給材': '#bd6188',
  '支給品': '#bd6188',
  'その他': '#7b8794',       // スレートグレー（未分類）
  '納入済み': '#9ca3af',     // グレー（一覧のドット等・納入済みステータス用）
};

export function getCategoryColor(item: string): string {
  if (!item) return CATEGORY_COLORS['その他'];
  // 完全一致を最優先。次に、より具体的な（長い）キーから部分一致させる。
  // これをしないと「現場用ボルト」が短い「ボルト」に先に一致して誤色になる。
  if (CATEGORY_COLORS[item]) return CATEGORY_COLORS[item];
  const keys = Object.keys(CATEGORY_COLORS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (item.includes(key)) return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS['その他'];
}

export const STATUS_COLORS = {
  '予定': '#d97706',
  '納入済み': '#9ca3af',
} as const;

// 荷下ろし（連絡）担当者の名簿。その日の連絡先を選ぶのに使う。
// 「その他」グループとは別に、手動入力も可能（UI側で対応）。
export const UNLOAD_CONTACT_GROUPS: { group: string; names: string[] }[] = [
  { group: '出荷班', names: ['俵', '小野'] },
  { group: '生産管理', names: ['石崎', '杉本'] },
  { group: 'その他', names: ['山口', '三野', 'ハオ', '服部'] },
];
