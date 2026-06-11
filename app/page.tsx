'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Delivery } from '@/lib/supabase';
import CalendarView from '@/components/CalendarView';
import ListView from '@/components/ListView';
import DeliveryModal from '@/components/DeliveryModal';
import DeliveryForm from '@/components/DeliveryForm';
import SearchPanel from '@/components/SearchPanel';

type Tab = 'calendar' | 'list';

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
  const [gsSyncing, setGsSyncing] = useState(false);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function handleRevertDelivered(id: number) {
    await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '予定', delivered_at: null }),
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

  async function handleGsSync() {
    setGsSyncing(true);
    setImportMsg('');
    try {
      const res = await fetch('/api/gsheets', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setImportMsg(`❌ ${data.error}`);
      } else {
        setImportMsg(`✅ Sheets同期完了: ${data.imported}件追加 (重複スキップ: ${data.skipped}件)`);
        fetchDeliveries(filters);
      }
    } catch {
      setImportMsg('❌ 同期に失敗しました');
    } finally {
      setGsSyncing(false);
      setTimeout(() => setImportMsg(''), 6000);
    }
  }

  function handleSlipUploaded(id: number, path: string) {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, slip_image_path: path } : d));
    if (selectedDelivery?.id === id) {
      setSelectedDelivery(prev => prev ? { ...prev, slip_image_path: path } : null);
    }
  }

  const vendorOptions = useMemo(() =>
    [...new Set(deliveries.map(d => d.vendor).filter(Boolean))].sort() as string[],
    [deliveries]
  );
  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    return deliveries
      .slice()
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
      .map(d => d.project_name)
      .filter(p => { if (seen.has(p)) return false; seen.add(p); return true; });
  }, [deliveries]);

  const hasFilters = Object.values(filters).some(v => v !== '');

  const tabItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'calendar', icon: '📅', label: 'カレンダー' },
    { id: 'list',     icon: '🔍', label: '検索' },
  ];

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ============ PC: 左サイドバー (lg以上) ============ */}
      <aside className="hidden lg:flex flex-col w-60 xl:w-64 flex-shrink-0 text-white" style={{ background: '#0d2c66' }}>
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/INATETSU_M(4c).jpg" alt="INATETSU" className="w-8 h-8 object-contain rounded bg-white p-0.5" />
          <div>
            <div className="font-bold text-sm leading-tight">納入予定管理</div>
            <div className="text-xs text-white/50">Delivery Management</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabItems.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={tab === t.id
                ? { background: 'rgba(255,255,255,0.15)', color: 'white' }
                : { color: 'rgba(255,255,255,0.6)' }
              }
            >
              <span className="text-lg">{t.icon}</span>
              <span>{t.label}</span>
              {tab === t.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
            </button>
          ))}
        </nav>
        <div className="p-3 space-y-2 border-t border-white/10">
          <button
            onClick={handleGsSync}
            disabled={gsSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full border border-white/30 hover:bg-white/10 transition-colors"
          >
            <span>{gsSyncing ? '⏳' : '🔄'}</span>
            <span>{gsSyncing ? '同期中...' : 'Sheets 同期'}</span>
          </button>
          <button
            onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold w-full transition-colors"
            style={{ background: '#f5c000', color: '#0d2c66' }}
          >
            ＋ 予定を追加
          </button>
        </div>
        <div className="px-4 py-3 text-xs text-white/40 text-center">{deliveries.length}件のデータ</div>
      </aside>

      {/* ============ メインエリア ============ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ---- スマホ用ヘッダー (md未満) ---- */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 text-white flex-shrink-0" style={{ background: '#0d2c66' }}>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/INATETSU_M(4c).jpg" alt="INATETSU" className="w-7 h-7 object-contain rounded bg-white p-0.5" />
            <h1 className="font-bold text-base">納入予定管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white/20 hover:bg-white/30 border border-white/30"
            >
              ＋ 追加
            </button>
          </div>
        </header>

        {/* ---- iPad用 上部タブバー (md以上 lg未満) ---- */}
        <header className="hidden md:flex lg:hidden items-center text-white flex-shrink-0 px-4 gap-2" style={{ background: '#0d2c66' }}>
          <div className="flex items-center gap-2 py-3 mr-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/INATETSU_M(4c).jpg" alt="INATETSU" className="w-7 h-7 object-contain rounded bg-white p-0.5" />
            <span className="font-bold text-sm whitespace-nowrap">納入予定管理</span>
          </div>
          {/* タブ */}
          <div className="flex flex-1 gap-1">
            {tabItems.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
                style={tab === t.id
                  ? { borderColor: 'white', color: 'white' }
                  : { borderColor: 'transparent', color: 'rgba(255,255,255,0.6)' }
                }
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          {/* アクションボタン */}
          <div className="flex items-center gap-2 py-2">
            <button
              onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-white/20 hover:bg-white/30 border border-white/30 whitespace-nowrap"
            >
              ＋ 追加
            </button>
          </div>
        </header>

        {/* ---- PC用ページタイトルバー (lg以上) ---- */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-white border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{tabItems.find(t => t.id === tab)?.icon}</span>
            <h2 className="font-bold text-gray-800">{tabItems.find(t => t.id === tab)?.label}</h2>
            {tab === 'list' && <span className="text-sm text-gray-400">{deliveries.length}件</span>}
          </div>
          {tab === 'list' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearch(s => !s)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                🔍 {showSearch ? '閉じる' : '絞り込み検索'}
              </button>
              {hasFilters && (
                <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">クリア</button>
              )}
            </div>
          )}
        </div>

        {/* ---- iPad用 一覧タブの検索バー ---- */}
        {tab === 'list' && (
          <div className="hidden md:flex lg:hidden bg-white border-b px-4 py-2 items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              🔍 {showSearch ? '閉じる' : '絞り込み検索'}
            </button>
            <span className="text-sm text-gray-500">{deliveries.length}件</span>
            {hasFilters && <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">クリア</button>}
          </div>
        )}

        {/* ---- スマホ用 一覧タブの検索バー ---- */}
        {tab === 'list' && (
          <div className="md:hidden bg-white border-b px-4 py-2 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              🔍 {showSearch ? '閉じる' : '検索'}
            </button>
            <span className="text-sm text-gray-500">{deliveries.length}件</span>
            {hasFilters && <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">クリア</button>}
          </div>
        )}

        {/* インポートメッセージ */}
        {importMsg && (
          <div className={`px-4 py-2 text-sm font-medium text-center flex-shrink-0 ${importMsg.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {importMsg}
          </div>
        )}

        {/* ---- コンテンツ本体 ---- */}
        <main className="flex-1 overflow-hidden flex min-h-0 pb-16 md:pb-0">
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
                  hasFilters
                    ? <ListView deliveries={deliveries} onSelectDelivery={setSelectedDelivery} />
                    : <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                        <div className="text-5xl">🔍</div>
                        <div className="font-medium text-base">検索条件を選択してください</div>
                        <button
                          onClick={() => setShowSearch(true)}
                          className="mt-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm"
                          style={{ background: '#0d2c66' }}
                        >
                          絞り込み検索を開く
                        </button>
                      </div>
                )}
              </>
            )}

            {/* スマホ・iPad: 検索パネルオーバーレイ */}
            {tab === 'list' && showSearch && (
              <>
                <div className="absolute inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setShowSearch(false)} />
                <div className="absolute inset-x-0 top-0 z-30 px-3 pt-3 max-h-full overflow-y-auto pb-4 lg:hidden">
                  <SearchPanel filters={filters} onChange={setFilters} onClose={() => setShowSearch(false)} total={deliveries.length} vendors={vendorOptions} projects={projectOptions} />
                </div>
              </>
            )}
          </div>

          {/* PC: 検索パネルをサイド表示 */}
          {tab === 'list' && showSearch && (
            <div className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-l bg-gray-50 overflow-y-auto p-3">
              <SearchPanel filters={filters} onChange={setFilters} onClose={() => setShowSearch(false)} total={deliveries.length} vendors={vendorOptions} projects={projectOptions} />
            </div>
          )}
        </main>

        {/* ---- スマホ用 ボトムナビ (md未満) ---- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
          {tabItems.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
              style={tab === t.id ? {color: '#0d2c66'} : {color: '#9ca3af'}}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-xs font-medium">{t.label}</span>
              {tab === t.id && <div className="w-4 h-0.5 rounded-full" style={{background:'#0d2c66'}} />}
            </button>
          ))}
        </nav>
      </div>

      {/* ============ モーダル ============ */}
      {selectedDelivery && (
        <DeliveryModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onMarkDelivered={handleMarkDelivered}
          onRevertDelivered={handleRevertDelivered}
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
          vendors={vendorOptions}
          projects={projectOptions}
        />
      )}
      {editDelivery && (
        <DeliveryForm
          initial={editDelivery}
          onSave={handleEdit}
          onCancel={() => setEditDelivery(null)}
          vendors={vendorOptions}
          projects={projectOptions}
        />
      )}
    </div>
  );
}
