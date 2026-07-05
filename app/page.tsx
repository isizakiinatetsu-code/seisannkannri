'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Delivery } from '@/lib/supabase';
import CalendarView from '@/components/CalendarView';
import ListView from '@/components/ListView';
import DeliveryModal from '@/components/DeliveryModal';
import DuplicateCheck from '@/components/DuplicateCheck';
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
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [addDefaultDate, setAddDefaultDate] = useState<string | undefined>();
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  // 検索パネルの入力中(未検索)フラグ。trueの間は古い検索結果を表示せず、
  // 検索ボタンを押すまで結果が変わらないことが分かるようにする。
  const [searchDirty, setSearchDirty] = useState(false);
  // スマホ: 検索ボタンを押したらパネルを閉じて結果を画面いっぱいに表示する
  // （パネルの下にスクロールしないと結果が見えない状態を解消するため）
  const [mobileSearchOpen, setMobileSearchOpen] = useState(true);
  const [importMsg, setImportMsg] = useState('');
  const [gsSyncing, setGsSyncing] = useState(false);
  const [role, setRole] = useState<'edit' | 'view' | null>(null);
  // カレンダーで表示中の月（この前後3か月だけ取得するために使う）
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const canEdit = role === 'edit';

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setRole(d.role)).catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  // CSV書き出し。<a href>で直接遷移するとスマホ（特にホーム画面追加のPWA）では
  // アプリ画面から離れて戻れなくなるため、Blobでダウンロードして画面はそのまま保つ。
  async function handleExport() {
    try {
      const res = await fetch('/api/deliveries/export');
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `nouhin_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('書き出しに失敗しました。通信環境を確認してもう一度お試しください。');
    }
  }

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

  // 検索条件が1つでも指定されているか（指定時は全期間、未指定時はカレンダー周辺3か月だけ取得）
  const hasActiveFilters = useMemo(() => Object.values(filters).some(v => v !== ''), [filters]);

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 実際に取得するクエリ。検索中は条件そのまま、そうでなければ
  // 表示中の月の前後（前月・当月・翌月）だけに絞って軽くする。
  const effectiveQuery = useMemo(() => {
    if (hasActiveFilters) return buildQuery(filters);
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const from = new Date(y, m - 1, 1);      // 前月1日
    const to = new Date(y, m + 2, 0);        // 翌月末日
    const p = new URLSearchParams();
    p.set('date_from', ymd(from));
    p.set('date_to', ymd(to));
    return p.toString();
  }, [hasActiveFilters, filters, calendarMonth, buildQuery]);

  // 月スワイプ・30秒間隔・フォーカス復帰が同時に走ると、遅れて返った古い応答が
  // 新しい一覧を上書きしてしまう。リクエスト番号で最新の応答だけを採用する。
  const fetchSeqRef = useRef(0);
  const fetchDeliveries = useCallback(async (query: string) => {
    const seq = ++fetchSeqRef.current;
    try {
      // 常に最新を取得（ブラウザ/モバイルのHTTPキャッシュで古い一覧が返るのを防ぐ）
      const res = await fetch(`/api/deliveries${query ? `?${query}` : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (seq !== fetchSeqRef.current) return; // より新しい取得が始まっていれば破棄
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      if (seq === fetchSeqRef.current) setDeliveries([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, []);

  // 今日の予定サマリー（表示中の月に関係なく、常に「今日」の件数を出すため専用取得）
  const [todayItems, setTodayItems] = useState<Delivery[]>([]);
  const fetchToday = useCallback(async () => {
    const t = ymd(new Date());
    try {
      const res = await fetch(`/api/deliveries?date_from=${t}&date_to=${t}`, { cache: 'no-store' });
      const data = await res.json();
      setTodayItems(Array.isArray(data) ? data : []);
    } catch { /* サマリーは失敗しても本体表示に影響させない */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDeliveries(effectiveQuery);
    fetchToday();
  }, [effectiveQuery, fetchDeliveries]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // 自動更新：アプリ再表示/フォーカス時と、30秒ごとに最新化する。
  // これにより「アプリを閉じ直さないと反映されない」「他の人の変更が見えない」を解消。
  useEffect(() => {
    const refetch = () => { fetchDeliveries(effectiveQuery); fetchToday(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refetch);
    const timer = setInterval(refetch, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refetch);
      clearInterval(timer);
    };
  }, [effectiveQuery, fetchDeliveries, fetchToday]);

  const todaySummary = useMemo(() => {
    const total = todayItems.length;
    const done = todayItems.filter(d => d.status === '納入済み').length;
    return { total, done, pending: total - done };
  }, [todayItems]);

  // 対象IDの updated_at を現在の表示状態から探す（楽観ロック用）。
  function findUpdatedAt(id: number): string | undefined {
    const d = deliveries.find(x => x.id === id) ?? todayItems.find(x => x.id === id);
    return d?.updated_at;
  }

  // 保存系の共通後処理：失敗・競合時はメッセージを出して最新状態に戻す（楽観更新の巻き戻し）。
  async function finalizeMutation(res: Response, failMsg: string) {
    if (res.status === 409) {
      // 楽観ロックの競合：他の人が先に更新していた
      alert('⚠️ 他の人が先にこの予定を更新していました。\n画面を最新の内容に更新します。あなたの操作は反映されていません。もう一度ご確認ください。');
    } else if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error ?? ''; } catch { /* noop */ }
      alert(`${failMsg}${detail ? `\n（${detail}）` : ''}`);
    }
    fetchDeliveries(effectiveQuery);
    fetchToday();
  }

  async function handleMarkDelivered(id: number) {
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    // 即時反映：先に画面を更新してから保存する
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: '納入済み', delivered_at: now } : d));
    const res = await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '納入済み', delivered_at: now, expected_updated_at: findUpdatedAt(id) }),
    });
    await finalizeMutation(res, '「納入済み」への変更を保存できませんでした。');
  }

  async function handleRevertDelivered(id: number) {
    // 即時反映
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: '予定', delivered_at: null } : d));
    const res = await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '予定', delivered_at: null, expected_updated_at: findUpdatedAt(id) }),
    });
    await finalizeMutation(res, '「予定に戻す」を保存できませんでした。');
  }

  async function handleAdd(data: Partial<Delivery>) {
    const res = await fetch('/api/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, status: '予定' }),
    });
    // 二重登録の警告：同じ内容が既にある場合は確認してから登録する
    let finalRes = res;
    if (res.status === 409) {
      const ok = confirm('⚠️ 同じ内容の予定が既に登録されています。\n（日付・物件名・品目・業者・内容規格が同じ）\n\n他の人が既に入力しているかもしれません。それでも追加しますか？');
      if (!ok) return; // フォームは開いたまま
      finalRes = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, status: '予定', force: true }),
      });
    }
    setShowAddForm(false);
    await finalizeMutation(finalRes, '予定の登録に失敗しました。もう一度お試しください。');
  }

  async function handleEdit(data: Partial<Delivery>) {
    if (!editDelivery) return;
    const id = editDelivery.id;
    const expectedUpdatedAt = editDelivery.updated_at;
    // 即時反映：編集内容を先に画面へ反映
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, ...data } as Delivery : d));
    const res = await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, expected_updated_at: expectedUpdatedAt }),
    });
    setEditDelivery(null);
    await finalizeMutation(res, '編集内容を保存できませんでした。');
  }

  async function handleDelete(id: number) {
    // 即時反映：先に画面から消す
    setDeliveries(prev => prev.filter(d => d.id !== id));
    setEditDelivery(null);
    const res = await fetch(`/api/deliveries/${id}`, { method: 'DELETE' });
    await finalizeMutation(res, '削除できませんでした。');
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
        fetchDeliveries(effectiveQuery);
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
  const unloadLocationOptions = useMemo(() =>
    // 「事務所」はデータに無くても常に候補へ含める
    [...new Set(['事務所', ...deliveries.map(d => d.unload_location).filter(Boolean)])].sort() as string[],
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
    <div className="flex h-dvh bg-gray-100 overflow-hidden">

      {/* ============ PC: 左サイドバー (lg以上) ============ */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 flex-shrink-0 text-white" style={{ background: '#0d2c66' }}>
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/inatetsu-logo.jpg" alt="INATETSU" className="w-8 h-8 object-contain rounded bg-white p-0.5" />
          <div>
            <div className="font-bold text-xs leading-tight whitespace-nowrap">INATETSU納入管理カレンダー</div>
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
          {canEdit && (
            <button
              onClick={handleGsSync}
              disabled={gsSyncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full border border-white/30 hover:bg-white/10 transition-colors"
            >
              <span>{gsSyncing ? '⏳' : '🔄'}</span>
              <span>{gsSyncing ? '同期中...' : 'Sheets 同期'}</span>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowDuplicates(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full border border-white/30 hover:bg-white/10 transition-colors"
            >
              <span>🔁</span>
              <span>重複チェック</span>
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full border border-white/30 hover:bg-white/10 transition-colors"
          >
            <span>📥</span>
            <span>Excel/CSVで書き出し</span>
          </button>
          {canEdit && (
            <button
              onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold w-full transition-colors"
              style={{ background: '#f5c000', color: '#0d2c66' }}
            >
              ＋ 予定を追加
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium w-full text-white/50 hover:text-white/80 transition-colors"
          >
            ログアウト
          </button>
        </div>
        <div className="px-4 py-1 text-xs text-white/40 text-center">
          {role === 'view' ? '閲覧のみ' : '編集可'}　|　{deliveries.length}件のデータ
        </div>
      </aside>

      {/* ============ メインエリア ============ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ---- スマホ用ヘッダー (md未満) ---- */}
        <header className="md:hidden flex items-center justify-between gap-2 px-3 py-3 text-white flex-shrink-0" style={{ background: '#0d2c66' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/inatetsu-logo.jpg" alt="INATETSU" className="w-7 h-7 object-contain rounded bg-white p-0.5 flex-shrink-0" />
            <h1 className="font-bold text-sm truncate">INATETSU納入カレンダー</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleExport}
              aria-label="Excel/CSVで書き出し"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-base bg-white/20 hover:bg-white/30 border border-white/30"
            >
              📥
            </button>
            {canEdit && (
              <button
                onClick={() => setShowDuplicates(true)}
                aria-label="重複チェック"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-base bg-white/20 hover:bg-white/30 border border-white/30"
              >
                🔁
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
                aria-label="予定を追加"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-xl font-bold border border-white/40"
                style={{ background: '#f5c000', color: '#0d2c66' }}
              >
                ＋
              </button>
            )}
          </div>
        </header>

        {/* ---- iPad用 上部タブバー (md以上 lg未満) ---- */}
        <header className="hidden md:flex lg:hidden items-center text-white flex-shrink-0 px-4 gap-2" style={{ background: '#0d2c66' }}>
          <div className="flex items-center gap-2 py-3 mr-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/inatetsu-logo.jpg" alt="INATETSU" className="w-7 h-7 object-contain rounded bg-white p-0.5" />
            <span className="font-bold text-sm whitespace-nowrap">INATETSU納入管理カレンダー</span>
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
            {canEdit && (
              <button
                onClick={() => { setShowAddForm(true); setAddDefaultDate(undefined); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-white/20 hover:bg-white/30 border border-white/30 whitespace-nowrap"
              >
                ＋ 追加
              </button>
            )}
          </div>
        </header>

        {/* ---- PC用ページタイトルバー (lg以上) ---- */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 bg-white border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{tabItems.find(t => t.id === tab)?.icon}</span>
            <h2 className="font-bold text-gray-800">{tabItems.find(t => t.id === tab)?.label}</h2>
            {tab === 'list' && <span className="text-sm text-gray-400">{deliveries.length}件</span>}
          </div>
          {tab === 'list' && hasFilters && (
            <button onClick={() => setFilters(emptyFilters)} className="text-xs text-blue-600 hover:underline">条件をクリア</button>
          )}
        </div>

        {/* スマホ用 検索タブは検索パネルを常時上部に表示するため個別バー不要。
            PC/iPadは検索パネルを右側に常時表示するため、ここに切替バーは不要。 */}

        {/* インポートメッセージ */}
        {importMsg && (
          <div className={`px-4 py-2 text-sm font-medium text-center flex-shrink-0 ${importMsg.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {importMsg}
          </div>
        )}

        {/* 今日の予定サマリー */}
        <div className="flex-shrink-0 px-4 py-1.5 bg-white border-b flex items-center gap-2 flex-wrap">
          <span className="text-sm">📅</span>
          <span className="text-sm font-bold text-gray-800">今日の納入</span>
          {todaySummary.total === 0 ? (
            <span className="text-sm text-gray-400">予定はありません</span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm">
              <span className="font-bold text-gray-800">{todaySummary.total}件</span>
              <span className="px-2 py-0.5 rounded-full text-white text-xs font-medium" style={{ background: '#d97706' }}>未納入 {todaySummary.pending}</span>
              <span className="px-2 py-0.5 rounded-full text-white text-xs font-medium" style={{ background: '#16a34a' }}>納入済み {todaySummary.done}</span>
            </span>
          )}
        </div>

        {/* ---- コンテンツ本体 ---- */}
        {/* ホーム画面追加(standalone PWA)時はホームインジケータ分のsafe-area-inset-bottomが
            加わり、固定フッターナビの実際の高さがpb-16(64px)より高くなる。その差分を
            考慮しないとフッターがカレンダー最終行に重なって見える（Safariタブでは
            safe-area-inset-bottomが0のため発生しない）ため、ここでも同じ分だけ確保する。 */}
        <main className="flex-1 overflow-hidden flex min-h-0 pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">
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
                    onVisibleMonthChange={setCalendarMonth}
                  />
                )}
                {/* PC/iPad: 検索結果（検索パネルは右側に常時表示） */}
                {tab === 'list' && (
                  <div className="hidden md:flex flex-1 flex-col overflow-y-auto min-h-0">
                    {searchDirty
                      ? <div className="flex-1" />
                      : hasFilters
                      ? <ListView deliveries={deliveries} onSelectDelivery={setSelectedDelivery} />
                      : <div className="flex flex-1 flex-col items-center justify-center text-gray-400 gap-2">
                          <div className="text-5xl">🔍</div>
                          <div className="font-medium text-base">右の条件で絞り込んでください</div>
                        </div>
                    }
                  </div>
                )}
              </>
            )}

            {/* スマホ: 検索ボタンを押すとパネルを閉じて結果を画面いっぱいに表示する
                （検索ボタンを押した後にスクロールしないと結果が見えない状態を解消） */}
            {tab === 'list' && mobileSearchOpen && (
              <div className="md:hidden flex-1 min-h-0 overflow-y-auto">
                <div className="px-3 pt-3 pb-2">
                  <SearchPanel
                    filters={filters}
                    onChange={setFilters}
                    onClose={() => hasFilters ? setMobileSearchOpen(false) : setTab('calendar')}
                    onSearch={() => setMobileSearchOpen(false)}
                    total={deliveries.length}
                    vendors={vendorOptions}
                    projects={projectOptions}
                    unloadLocations={unloadLocationOptions}
                    onDirtyChange={setSearchDirty}
                  />
                </div>
              </div>
            )}
            {tab === 'list' && !mobileSearchOpen && (
              <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-y-auto">
                <div className="px-3 pt-3 pb-2 flex-shrink-0">
                  <button
                    onClick={() => setMobileSearchOpen(true)}
                    className="w-full py-2 text-sm font-medium rounded-xl border border-gray-300 text-gray-600 bg-white"
                  >
                    🔍 検索条件を変更
                  </button>
                </div>
                {hasFilters
                  ? <ListView deliveries={deliveries} onSelectDelivery={setSelectedDelivery} />
                  : <div className="flex flex-1 flex-col items-center justify-center text-gray-400 gap-3">
                      <div className="text-5xl">🔍</div>
                      <div className="font-medium text-base">検索条件を選択してください</div>
                    </div>
                }
              </div>
            )}
          </div>

          {/* PC/iPad: 検索パネルを右側に常時表示（押して開く操作を不要にする） */}
          {tab === 'list' && (
            <div className="hidden md:block w-72 lg:w-80 xl:w-96 flex-shrink-0 border-l bg-gray-50 overflow-y-auto p-3">
              <SearchPanel filters={filters} onChange={setFilters} onClose={() => setTab('calendar')} total={deliveries.length} vendors={vendorOptions} projects={projectOptions} unloadLocations={unloadLocationOptions} onDirtyChange={setSearchDirty} />
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
          onSlipUploaded={handleSlipUploaded}
          canEdit={canEdit}
        />
      )}
      {canEdit && showAddForm && (
        <DeliveryForm
          defaultDate={addDefaultDate}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          vendors={vendorOptions}
          projects={projectOptions}
          unloadLocations={unloadLocationOptions}
        />
      )}
      {canEdit && editDelivery && (
        <DeliveryForm
          initial={editDelivery}
          onSave={handleEdit}
          onCancel={() => setEditDelivery(null)}
          onDelete={handleDelete}
          vendors={vendorOptions}
          projects={projectOptions}
          unloadLocations={unloadLocationOptions}
        />
      )}
      {canEdit && showDuplicates && (
        <DuplicateCheck
          onClose={() => setShowDuplicates(false)}
          onSelectDelivery={setSelectedDelivery}
        />
      )}
    </div>
  );
}
