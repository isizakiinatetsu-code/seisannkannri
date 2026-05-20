'use client';
import { useState, useEffect, useCallback } from 'react';
import { Delivery } from '@/lib/db';
import CalendarView from '@/components/CalendarView';
import ListView from '@/components/ListView';
import OcrTab from '@/components/OcrTab';
import DeliveryModal from '@/components/DeliveryModal';
import DeliveryForm from '@/components/DeliveryForm';
import SearchPanel from '@/components/SearchPanel';

type Tab = 'calendar' | 'list' | 'ocr';

interface SearchFilters {
  project_name: string;
  item: string;
  vendor: string;
  unload_location: string;
  date_from: string;
  date_to: string;
  status: string;
}

const emptyFilters: SearchFilters = {
  project_name: '',
  item: '',
  vendor: '',
  unload_location: '',
  date_from: '',
  date_to: '',
  status: '',
};

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [editDelivery, setEditDelivery] = useState<Delivery | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDefaultDate, setAddDefaultDate] = useState<string | undefined>();
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);

  const buildQuery = useCallback((f: SearchFilters) => {
    const params = new URLSearchParams();
    if (f.project_name) params.set('project_name', f.project_name);
    if (f.item) params.set('item', f.item);
    if (f.vendor) params.set('vendor', f.vendor);
    if (f.unload_location) params.set('unload_location', f.unload_location);
    if (f.date_from) params.set('date_from', f.date_from);
    if (f.date_to) params.set('date_to', f.date_to);
    if (f.status) params.set('status', f.status);
    return params.toString();
  }, []);

  const fetchDeliveries = useCallback(async (f: SearchFilters) => {
    try {
      const q = buildQuery(f);
      const res = await fetch(`/api/deliveries${q ? `?${q}` : ''}`);
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchDeliveries(filters);
  }, [filters, fetchDeliveries]);

  async function handleMarkDelivered(id: number) {
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '納入済み', delivered_at: now }),
    });
    fetchDeliveries(filters);
  }

  async function handleDelete(id: number) {
    await fetch(`/api/deliveries/${id}`, { method: 'DELETE' });
    fetchDeliveries(filters);
  }

  async function handleAdd(data: Partial<Delivery>) {
    await fetch('/api/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, status: '予定' }),
    });
    setShowAddForm(false);
    fetchDeliveries(filters);
  }

  async function handleEdit(data: Partial<Delivery>) {
    if (!editDelivery) return;
    await fetch(`/api/deliveries/${editDelivery.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditDelivery(null);
    fetchDeliveries(filters);
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) {
        setImportMsg(`❌ ${data.error}`);
      } else {
        setImportMsg(`✅ ${data.imported}件インポート完了 (スキップ: ${data.skipped}件)`);
        fetchDeliveries(filters);
      }
    } catch {
      setImportMsg('❌ インポートに失敗しました');
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(''), 6000);
    }
  }

  function handleSlipUploaded(id: number, path: string) {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, slip_image_path: path } : d));
    if (selectedDelivery?.id === id) {
      setSelectedDelivery(prev => prev ? { ...prev, slip_image_path: path } : null);
    }
  }

  const hasFilters = Object.values(filters).some(v => v !== '');

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ===== サイドバー（PC用）===== */}
      <aside className="hidden md:flex flex-col w-56 lg:w-64 flex-shrink-0 text-white" style={{ background: '#1a2744' }}>
        {/* ロゴ */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <span className="text-2xl">📦</span>
          <div>
            <div className="font-bold text-sm leading-tight">納入予定管理</div>
            <div className="text-xs text-white/50">Delivery Management</div>
          </div>
        </div>

        {/* ナビ */}
        <nav className="flex-1 p-3 space-y-1">
          <SideNavButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon="📅" label="カレンダー" />
          <SideNavButton active={tab === 'list'} onClick={() => setTab('list')} icon="📋" label="一覧・検索" />
          <SideNavButton active={tab === 'ocr'} onClick={() => setTab('ocr')} icon="📸" label="OCR照合" />
        </nav>

        {/* アクションボタン */}
        <div className="p-3 space-y-2 border-t border-white/10">
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer text-sm font-medium w-full border border-white/30 hover:bg-white/10 transition-colors">
            <span>{importing ? '⏳' : '📊'}</span>
            <span>Excel インポート</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} disabled={importing} />
          </label>
          <button
            onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold w-full transition-colors"
            style={{ background: '#3b6fd4' }}
          >
            ＋ 予定を追加
          </button>
        </div>

        {/* 件数表示 */}
        <div className="px-4 py-3 text-xs text-white/40 text-center">
          {deliveries.length}件のデータ
        </div>
      </aside>

      {/* ===== メインコンテンツ ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* モバイル用ヘッダー */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 text-white flex-shrink-0 z-10" style={{ background: '#1a2744' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <h1 className="font-bold text-base">納入予定管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-medium border border-white/30 hover:bg-white/10 transition-colors">
              {importing ? '⏳' : '📊'} Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} disabled={importing} />
            </label>
            <button
              onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white/20 hover:bg-white/30 transition-colors border border-white/30"
            >
              ＋ 追加
            </button>
          </div>
        </header>

        {/* PC用ページタイトルバー */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 bg-white border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{tab === 'calendar' ? '📅' : tab === 'list' ? '📋' : '📸'}</span>
            <h2 className="font-bold text-gray-800">
              {tab === 'calendar' ? 'カレンダー' : tab === 'list' ? '一覧・検索' : 'OCR照合'}
            </h2>
            {tab === 'list' && <span className="text-sm text-gray-400">{deliveries.length}件</span>}
          </div>
          {tab === 'list' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearch(s => !s)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                🔍 {showSearch ? '検索を閉じる' : '絞り込み検索'}
              </button>
              {hasFilters && (
                <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">
                  クリア
                </button>
              )}
            </div>
          )}
        </div>

        {/* インポートメッセージ */}
        {importMsg && (
          <div className={`px-4 py-2 text-sm font-medium text-center flex-shrink-0 ${importMsg.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {importMsg}
          </div>
        )}

        {/* モバイル用タブ下の検索バー */}
        {tab === 'list' && (
          <div className="md:hidden bg-white border-b px-4 py-2 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              🔍 {showSearch ? '閉じる' : '検索'}
            </button>
            <span className="text-sm text-gray-500">{deliveries.length}件</span>
            {hasFilters && (
              <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">
                クリア
              </button>
            )}
          </div>
        )}

        {/* コンテンツエリア */}
        <main className="flex-1 overflow-hidden flex min-h-0">
          {/* メインビュー */}
          <div className="flex-1 overflow-hidden flex flex-col relative min-w-0">
            {loading ? (
              <div className="flex items-center justify-center flex-1">
                <div className="text-gray-400 text-center">
                  <div className="text-4xl mb-3 animate-pulse">📦</div>
                  <div className="text-sm">読み込み中...</div>
                </div>
              </div>
            ) : (
              <>
                {tab === 'calendar' && (
                  <CalendarView
                    deliveries={deliveries}
                    onSelectDelivery={setSelectedDelivery}
                    onDateClick={(date) => setAddDefaultDate(date)}
                  />
                )}
                {tab === 'list' && (
                  <ListView
                    deliveries={deliveries}
                    onSelectDelivery={setSelectedDelivery}
                  />
                )}
                {tab === 'ocr' && <OcrTab />}
              </>
            )}

            {/* モバイル: 検索パネルオーバーレイ */}
            {tab === 'list' && showSearch && (
              <>
                <div className="absolute inset-0 bg-black/20 z-20 md:hidden" onClick={() => setShowSearch(false)} />
                <div className="absolute inset-x-0 top-0 z-30 px-3 pt-3 max-h-full overflow-y-auto pb-4 md:hidden">
                  <SearchPanel filters={filters} onChange={setFilters} onClose={() => setShowSearch(false)} total={deliveries.length} />
                </div>
              </>
            )}
          </div>

          {/* PC: 検索パネルをサイドに表示 */}
          {tab === 'list' && showSearch && (
            <div className="hidden md:block w-72 lg:w-80 flex-shrink-0 border-l bg-gray-50 overflow-y-auto p-3">
              <SearchPanel filters={filters} onChange={setFilters} onClose={() => setShowSearch(false)} total={deliveries.length} />
            </div>
          )}
        </main>

        {/* モバイル用ボトムナビ */}
        <nav className="md:hidden flex bg-white border-t flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <BottomTabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon="📅" label="カレンダー" />
          <BottomTabButton active={tab === 'list'} onClick={() => setTab('list')} icon="📋" label="一覧" />
          <BottomTabButton active={tab === 'ocr'} onClick={() => setTab('ocr')} icon="📸" label="OCR照合" />
        </nav>
      </div>

      {/* ===== モーダル ===== */}
      {selectedDelivery && (
        <DeliveryModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onMarkDelivered={handleMarkDelivered}
          onEdit={(d) => { setEditDelivery(d); setSelectedDelivery(null); }}
          onDelete={handleDelete}
          onSlipUploaded={handleSlipUploaded}
        />
      )}
      {showAddForm && (
        <DeliveryForm
          defaultDate={addDefaultDate}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      {editDelivery && (
        <DeliveryForm
          initial={editDelivery}
          onSave={handleEdit}
          onCancel={() => setEditDelivery(null)}
        />
      )}
    </div>
  );
}

/* PC サイドバーボタン */
function SideNavButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      style={active
        ? { background: 'rgba(255,255,255,0.15)', color: 'white' }
        : { color: 'rgba(255,255,255,0.6)' }
      }
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
    </button>
  );
}

/* モバイル ボトムタブボタン */
function BottomTabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors relative"
      style={{ color: active ? '#1a2744' : '#9ca3af' }}
    >
      <span className="text-xl mb-0.5">{icon}</span>
      <span>{label}</span>
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: '#1a2744' }} />
      )}
    </button>
  );
}
