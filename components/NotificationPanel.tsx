'use client';
import { useEffect, useState } from 'react';

interface RecentItem {
  id: number;
  delivery_date: string;
  project_name: string;
  item: string;
  created_by: string | null;
  created_at: string;
}

interface Props {
  onClose: () => void;
  onSelect: (id: number) => void;
}

// 追加日時を「MM/DD HH:mm」（日本時間）で表示
function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export default function NotificationPanel({ onClose, onSelect }: Props) {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/deliveries/recent', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] flex flex-col md:shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">🔔 お知らせ（最近追加された予定）</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl font-bold">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">最近追加された予定はありません</div>
          ) : (
            <ul className="divide-y">
              {items.map(it => (
                <li key={it.id}>
                  <button
                    onClick={() => onSelect(it.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 mt-0.5 text-xs font-bold text-white px-2 py-1 rounded-lg" style={{ background: '#0d2c66' }}>
                      {it.delivery_date.slice(5).replace('-', '/')}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-800 truncate">{it.project_name}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {it.item}
                        {it.created_by ? `・追加：${it.created_by}` : ''}
                        <span className="text-gray-400">　（{fmt(it.created_at)} 登録）</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
