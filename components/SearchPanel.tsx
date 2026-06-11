'use client';

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
}

const ITEM_CATEGORIES = [
  'すべて', '型板', '一次加工品', '二次部材', '副資材', '鋼材',
  'スプライス', 'ブレース', 'ボルト', '支給品', '現場用ボルト', 'ハイベース', 'その他',
];

export default function SearchPanel({ filters, onChange, onClose, total, vendors = [], projects = [], unloadLocations = [] }: Props) {
  const set = (key: keyof SearchFilters) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => onChange({ ...filters, [key]: e.target.value });

  function handleClear() {
    onChange({ project_name: '', item: '', vendor: '', unload_location: '', date_from: '', date_to: '', status: '' });
  }


  const hasFilters = Object.values(filters).some(v => v !== '');

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
        <select value={filters.project_name} onChange={set('project_name')} className="input">
          <option value="">すべて</option>
          {projects.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">品目カテゴリ</label>
        <select value={filters.item} onChange={set('item')} className="input">
          {ITEM_CATEGORIES.map(c => (
            <option key={c} value={c === 'すべて' ? '' : c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">業者名</label>
        <select value={filters.vendor} onChange={set('vendor')} className="input">
          <option value="">すべて</option>
          {vendors.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">降し場所</label>
        <select value={filters.unload_location} onChange={set('unload_location')} className="input">
          <option value="">すべて</option>
          {unloadLocations.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">日付（開始）</label>
          <input type="date" value={filters.date_from} onChange={set('date_from')} className="input" />
        </div>
        <div className="flex-1">
          <label className="label">日付（終了）</label>
          <input type="date" value={filters.date_to} onChange={set('date_to')} className="input" />
        </div>
      </div>

      <div>
        <label className="label">ステータス</label>
        <select value={filters.status} onChange={set('status')} className="input">
          <option value="">すべて</option>
          <option value="予定">予定</option>
          <option value="納入済み">納入済み</option>
        </select>
      </div>

      {hasFilters && (
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
