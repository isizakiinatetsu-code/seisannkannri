'use client';
import { Delivery } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';

interface Props {
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
}

export default function ListView({ deliveries, onSelectDelivery }: Props) {
  // Group by date
  const grouped: Record<string, Delivery[]> = {};
  for (const d of deliveries) {
    if (!grouped[d.delivery_date]) grouped[d.delivery_date] = [];
    grouped[d.delivery_date].push(d);
  }
  const dates = Object.keys(grouped).sort();

  return (
    // スクロールは呼び出し元のコンテナに任せるため、ここでは高さ制約を持たない
    <div>
      {dates.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-medium">上の検索条件で絞り込んでください</div>
        </div>
      )}

      {dates.map(date => {
        const items = grouped[date];
        const delivered = items.filter(i => i.status === '納入済み').length;
        return (
          <div key={date} className="mb-3">
            <div className="sticky top-0 px-4 py-2 flex justify-between items-center z-10" style={{ background: '#0d2c66' }}>
              <span className="text-white font-bold text-sm">{formatDateLabel(date)}</span>
              <span className="text-xs text-white/70">{delivered}/{items.length}件 納入済み</span>
            </div>
            <div className="bg-white divide-y divide-gray-100">
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelectDelivery(item)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-blue-50 transition-colors ${item.status === '納入済み' ? 'bg-gray-50 opacity-60' : ''}`}
                >
                  {/* Color bar */}
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item) }}
                  />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-bold text-sm leading-snug ${item.status === '納入済み' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.project_name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ background: getCategoryColor(item.item) }}
                        >
                          {item.item}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ background: item.status === '納入済み' ? '#9ca3af' : '#d97706' }}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                    {item.specification && (
                      <div className="text-xs text-gray-600 mt-0.5">{item.specification}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-0.5">
                        🕐 {item.delivery_time ?? '未定'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        🏭 {item.unload_location}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        🏢 {item.vendor}
                      </span>
                    </div>
                    {item.status === '納入済み' && item.delivered_at && (
                      <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        ✓ {item.delivered_at} 納入確認
                      </div>
                    )}
                    {item.slip_image_path && (
                      <div className="text-xs text-blue-500 mt-1">📎 伝票あり</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  // "2026-07-01" をローカル日付として解釈する（new Date(文字列)はUTC扱いになり
  // タイムゾーンによって曜日・日付が1日ずれるため、成分から組み立てる）。
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1, day ?? 1);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}
