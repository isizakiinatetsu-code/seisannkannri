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
export const CATEGORY_COLORS: Record<string, string> = {
  '型板': '#dc2626',        // 赤
  '一次加工品': '#f97316',   // 橙
  '二次部材': '#b45309',     // 焦茶
  '副資材': '#ca8a04',       // 金
  '鋼材': '#15803d',         // 緑
  'ロール材': '#65a30d',     // 黄緑（白文字が読める濃さ）
  '市中材': '#65a30d',       // ロール材と同じ
  'スプライス': '#0d9488',   // ティール
  '注文材': '#0284c7',       // 空色
  'ブレース': '#2563eb',     // 青
  'ボルト': '#6d28d9',       // 菫
  '現場用ボルト': '#9333ea', // 紫
  'ハイベース': '#c026d3',   // マゼンタ
  '支給材': '#db2777',       // ピンク
  '支給品': '#7c2d12',       // 赤茶（灰色をやめて区別）
  'その他': '#64748b',       // スレート（未分類。灰色より青みで区別）
  '納入済み': '#9ca3af',     // グレー（納入済みステータス専用）
};

export function getCategoryColor(item: string): string {
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
