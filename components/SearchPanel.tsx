'use client';
import { useState, useEffect } from 'react';
import { ITEM_CATEGORIES as BASE_ITEM_CATEGORIES } from '@/lib/constants';

interface SearchFilters {
  project_name: string;
  item: string;
  vendor: string;
  unload_location: string;
  date_from: string;
  date_to: string;
  status: string;
}

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onClose: () => void;
  total: number;
  vendors?: string[];
  projects?: string[];
  unloadLocations?: string[];
  // 入力中(未検索)かどうかを呼び出し元に伝える。呼び出し元はこれを使って、
  // 古い検索結果を「条件を変えたばかりでまだ検索していない」ことが分かるように隠す。
  onDirtyChange?: (dirty: boolean) => void;
  // 検索ボタンが押された瞬間に呼ばれる（onChangeとは別に、呼び出し元がパネルを
  // 閉じて結果を画面いっぱいに表示するタイミングとして使う）。
  onSearch?: () => void;
}

// 検索は先頭に「すべて」を足す（品目リスト本体は lib/constants と共通化して分岐を防ぐ）
const ITEM_CATEGORIES = ['すべて', ...BASE_ITEM_CATEGORIES];

export default function SearchPanel({ filters, onChange, onClose, total, vendors = [], projects = [], unloadLocations = [], onDirtyChange, onSearch }: Props) {
  // 検索ボタンを押すまでは入力内容を確定しない（draft）。確定済みの検索条件は親から渡される filters。
  const [draft, setDraft] = useState<SearchFilters>(filters);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const hasDraftFilters = Object.values(draft).some(v => v !== '');
  const isDirty = JSON.stringify(draft) !== JSON.stringify(filters);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const set = (key: keyof SearchFilters) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setDraft(d => ({ ...d, [key]: e.target.value }));

  function handleSearch() {
    onChange(draft);
    onSearch?.();
  }

  function handleClear() {
    const cleared = { project_name: '', item: '', vendor: '', unload_location: '', date_from: '', date_to: '', status: '' };
    setDraft(cleared);
    onChange(cleared);
  }

  return (
    <div className="bg-white border rounded-2xl shadow-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-blue-600 font-normal">{total}件</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded-lg hover:bg-gray-100">
          閉じる
        </button>
      </div>

      <div>
        <label className="label">物件名</label>
        <select value={draft.project_name} onChange={set('project_name')} className="input">
          <option value="">すべて</option>
          {projects.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">品目カテゴリ</label>
        <select value={draft.item} onChange={set('item')} className="input">
          {ITEM_CATEGORIES.map(c => (
            <option key={c} value={c === 'すべて' ? '' : c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">業者名</label>
        <select value={draft.vendor} onChange={set('vendor')} className="input">
          <option value="">すべて</option>
          {vendors.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">降し場所</label>
        <select value={draft.unload_location} onChange={set('unload_location')} className="input">
          <option value="">すべて</option>
          {unloadLocations.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">日付（開始）</label>
        <input type="date" value={draft.date_from} onChange={set('date_from')} className="input" />
      </div>
      <div>
        <label className="label">日付（終了）</label>
        <input type="date" value={draft.date_to} onChange={set('date_to')} className="input" />
      </div>

      <div>
        <label className="label">ステータス</label>
        <select value={draft.status} onChange={set('status')} className="input">
          <option value="">すべて</option>
          <option value="予定">予定</option>
          <option value="納入済み">納入済み</option>
        </select>
      </div>

      <button
        onClick={handleSearch}
        className="w-full py-2.5 text-sm text-white font-bold rounded-xl"
        style={{ background: '#0d2c66' }}
      >
        検索
      </button>

      {(hasDraftFilters || isDirty) && (
        <button onClick={handleClear} className="w-full py-2 text-sm text-gray-500 border border-gray-300 rounded-xl hover:bg-gray-50">
          フィルターをクリア
        </button>
      )}

      <style jsx>{`
        .label { display: block; font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 4px; }
        .input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; }
        .input:focus { border-color: #2f8fcf; }
      `}</style>
    </div>
  );
}
