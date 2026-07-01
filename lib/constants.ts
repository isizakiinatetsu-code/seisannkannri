export const ITEM_CATEGORIES = [
  '型板',
  '一次加工品',
  '二次部材',
  '副資材',
  '鋼材',
  'スプライス',
  'ブレース',
  'ボルト',
  '支給品',
  '現場用ボルト',
  'ハイベース',
  'その他',
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  '型板': '#dc2626',
  '一次加工品': '#ea580c',
  '二次部材': '#d97706',
  '副資材': '#ca8a04',
  '鋼材': '#16a34a',
  'スプライス': '#0891b2',
  'ブレース': '#2563eb',
  'ボルト': '#7c3aed',
  '現場用ボルト': '#9333ea',
  'ハイベース': '#c026d3',
  '支給材': '#ec4899',
  '支給品': '#4b5563',
  'ロール材': '#84cc16',
  '市中材': '#84cc16',
  '注文材': '#0ea5e9',
  '納入済み': '#9ca3af',
  'その他': '#6b7280',
};

export function getCategoryColor(item: string): string {
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (item.includes(key)) return color;
  }
  return CATEGORY_COLORS['その他'];
}

export const STATUS_COLORS = {
  '予定': '#d97706',
  '納入済み': '#9ca3af',
} as const;
