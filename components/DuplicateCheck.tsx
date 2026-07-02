'use client';
import { useEffect, useState } from 'react';
import { Delivery } from '@/lib/supabase';

interface DupGroup {
  date: string;
  project_name: string;
  item: string;
  vendor: string;
  specification: string | null;
  count: number;
  items: Delivery[];
}

interface Props {
  onClose: () => void;
  onSelectDelivery: (d: Delivery) => void;
}

export default function DuplicateCheck({ onClose, onSelectDelivery }: Props) {
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/deliveries/duplicates', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setGroups(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto md:shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔁</span>
            <h2 className="font-bold text-gray-800">重複チェック</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        <div className="p-4">
          <p className="text-xs text-gray-500 mb-3">
            同じ「日付・物件・品目・業者・内容規格」の予定が2件以上あるものを表示します（直近3か月〜）。
            <br />内容・規格が違う別便は重複として扱いません。
          </p>

          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">読み込み中...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <div className="text-4xl mb-2">✅</div>
              <div className="font-medium">重複はありません</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-bold text-red-600">{groups.length} 組の重複候補</div>
              {groups.map((g, gi) => (
                <div key={gi} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-bold text-gray-800">{g.project_name}</span>
                    <span className="text-gray-500"> ・ {g.item}{g.specification ? `（${g.specification}）` : ''}</span>
                    <div className="text-xs text-gray-500 mt-0.5">{g.date} ・ {g.vendor} ・ <span className="text-red-600 font-medium">{g.count}件</span></div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {g.items.map(it => (
                      <button
                        key={it.id}
                        onClick={() => { onSelectDelivery(it); onClose(); }}
                        className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-blue-50"
                      >
                        <div className="text-xs text-gray-600 min-w-0">
                          <span className="text-gray-400">降し場所：</span>{it.unload_location}
                        </div>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white font-medium flex-shrink-0"
                          style={{ background: it.status === '納入済み' ? '#16a34a' : '#d97706' }}
                        >
                          {it.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500">
                整理するには、各行をタップ →「編集する」→ 最下部の「この予定を削除する」。
                <br />※スプレッドシートと一致する方を消すと次の同期で復活するため、手動で足した方を消してください。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
