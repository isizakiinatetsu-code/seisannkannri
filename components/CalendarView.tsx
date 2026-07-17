'use client';
import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { Delivery } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';

type CalViewMode = '月' | '週' | '日';

interface Props {
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
  onDateClick?: (date: string) => void;
  // 表示中の月が変わったら親へ通知（親はこの前後3か月だけ取得する）
  onVisibleMonthChange?: (d: Date) => void;
  canEdit?: boolean;
}

export default function CalendarView({ deliveries, onSelectDelivery, onDateClick, onVisibleMonthChange, canEdit = false }: Props) {
  const [mode, setMode] = useState<CalViewMode>('月');
  const [current, setCurrent] = useState(new Date());
  const today = new Date();

  // 表示中の月が変わったら親に知らせる（データ取得範囲の更新用）
  useEffect(() => {
    onVisibleMonthChange?.(current);
  }, [current, onVisibleMonthChange]);
  const containerRef = useRef<HTMLDivElement>(null);

  // スワイプ判定用（横移動アニメーションはせず、指を離した時に瞬時に月を入れ替える。
  // 予約管理アプリと同じ挙動で、継ぎ目・揺れ・線が原理的に出ないようにする）
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function deliveriesForDate(dateStr: string) {
    return deliveries.filter(d => d.delivery_date === dateStr);
  }

  const navigate = useCallback((delta: number) => {
    setCurrent(d => {
      const n = new Date(d);
      if (mode === '月') n.setMonth(n.getMonth() + delta);
      else if (mode === '週') n.setDate(n.getDate() + delta * 7);
      else n.setDate(n.getDate() + delta);
      return n;
    });
  }, [mode]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // 横方向に十分動き、かつ縦移動より明確に大きい場合のみ月を切り替える
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    navigate(dx < 0 ? 1 : -1);
  }

  function headerLabel() {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    if (mode === '月') return `${y}年${m}月`;
    if (mode === '週') {
      const start = getWeekStart(current);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
    }
    return `${y}年${m}月${current.getDate()}日(${['日','月','火','水','木','金','土'][current.getDay()]})`;
  }

  function getWeekStart(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  function renderPage(date: Date) {
    return (
      <>
        {mode === '月' && <MonthView current={date} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} onDateClick={(d) => { setCurrent(new Date(d)); setMode('日'); onDateClick?.(d); }} fmt={fmt} />}
        {mode === '週' && <WeekView current={date} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} fmt={fmt} getWeekStart={getWeekStart} />}
        {mode === '日' && <DayView current={date} deliveries={deliveriesForDate(fmt(date))} onSelectDelivery={onSelectDelivery} canEdit={canEdit} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* コントロールバー：1行に収める */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-white border-b flex-shrink-0">
        <div className="flex gap-1">
          {(['月','週','日'] as CalViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-2.5 py-1 rounded-lg text-sm font-medium transition-colors"
              style={mode === m
                ? { background: '#0d2c66', color: 'white' }
                : { background: '#f3f4f6', color: '#374151' }
              }
            >
              {m}
            </button>
          ))}
        </div>
        <span className="font-bold text-gray-800 text-sm ml-2 flex-1">{headerLabel()}</span>
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 text-lg">‹</button>
        <button onClick={() => setCurrent(new Date())} className="px-2 py-1 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 font-medium">今日</button>
        <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 text-lg">›</button>
      </div>

      {/* 凡例 */}
      <CategoryLegend />

      {/* 曜日ヘッダー（固定）：スワイプで動かさず常に同じ位置に保つ */}
      {mode === '月' && <WeekdayHeader />}

      {/* カレンダー本体：スワイプで月を瞬時に切り替える（横移動アニメーションなし） */}
      <div
        ref={containerRef}
        className={`flex-1 relative bg-white ${mode === '日' ? 'overflow-y-auto' : 'overflow-hidden'}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {renderPage(current)}
      </div>
    </div>
  );
}

// 祝日セット (YYYY-MM-DD)
const HOLIDAYS = new Set([
  // 2025
  '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24',
  '2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05',
  '2025-05-06','2025-07-21','2025-08-11','2025-09-15','2025-09-23',
  '2025-10-13','2025-11-03','2025-11-23','2025-11-24',
  // 2026
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23',
  '2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05',
  '2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23',
]);

function MonthView({ current, deliveriesForDate, today, onSelectDelivery, onDateClick, fmt }: {
  current: Date;
  deliveriesForDate: (d: string) => Delivery[];
  today: Date;
  onSelectDelivery: (d: Delivery) => void;
  onDateClick: (d: string) => void;
  fmt: (d: Date) => string;
}) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  // セルには「他月の日付（グレー表示）」か「当月の日付」かを区別して保持する
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ date: new Date(year, month, 1 - (startOffset - i)), inMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let nextMonthDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextMonthDay), inMonth: false });
    nextMonthDay++;
  }

  const weeks: { date: Date; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // CSS Grid の minmax(0,1fr) はSafari実機で小数px丸めの誤差が最終行に
  // まとまり、最終週だけ明らかに低くなる場合があったため、実測したコンテナ
  // 高さをJSで6等分し、各行に整数pxの高さを明示指定する（端数は最終行に
  // 加算し、最終行が他より小さくなることがないようにする）。
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setRowHeight(Math.floor(el.clientHeight / 6));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 日付丸数字（高さ約28px）を除いた残りの高さに、予定1件あたり約15pxとして
  // 何件表示できるかを実測のrowHeightから算出する（固定値だと行高が低い時に
  // 「他n件」自体がはみ出して見切れてしまうため）
  const DATE_HEADER_H = 28;
  const ITEM_ROW_H = 15;
  const availableH = rowHeight == null ? null : rowHeight - DATE_HEADER_H;
  const maxFit = availableH == null ? 3 : Math.max(0, Math.floor(availableH / ITEM_ROW_H));

  return (
    <div className="flex flex-col h-full">
      {/* 曜日ヘッダーは親側で固定表示するためここには置かない */}
      <div ref={gridRef} className="flex-1 min-h-0 flex flex-col">
      {weeks.map((week, wi) => (
        <div
          key={wi}
          className="grid border-t border-gray-200 overflow-hidden flex-shrink-0"
          style={{
            gridTemplateColumns: '2fr 2fr 2fr 2fr 2fr 1fr 1fr',
            height: rowHeight == null ? `${100 / 6}%` : (wi === 5 ? gridRef.current!.clientHeight - rowHeight * 5 : rowHeight),
          }}
        >
          {week.map((cell, di) => {
            // 空セルも含め全セルに同じ右罫線を引き、均一なマス目にする
            const baseCellClass = 'border-r border-gray-200 last:border-r-0 overflow-hidden min-w-0';
            const { date: day, inMonth } = cell;
            if (!inMonth) {
              // 当月外の日付は他カレンダーアプリと同様にグレーの数字だけ表示する
              return (
                <div key={di} className={`${baseCellClass} bg-gray-50/50 p-0.5`}>
                  <div className="text-sm font-bold mb-0.5 w-6 h-6 flex items-center justify-center rounded-full mx-auto text-gray-300">
                    {day.getDate()}
                  </div>
                </div>
              );
            }
            const dateStr = fmt(day);
            const items = deliveriesForDate(dateStr);
            const isToday = dateStr === fmt(today);
            const isSat = di === 5;
            const isSun = di === 6;
            const isHoliday = HOLIDAYS.has(dateStr);
            // 行の高さが固定(JS実測)のため、件数表示(他n件)が入る分だけ
            // 表示件数を減らし、はみ出してoverflow-hiddenで見切れないようにする。
            // 全件がぴったり収まる場合は「他n件」自体を表示しないので減らさない。
            const maxShow = items.length <= maxFit ? items.length : Math.max(0, maxFit - 1);
            return (
              <div
                key={di}
                className={`${baseCellClass} p-0.5 cursor-pointer hover:bg-blue-50 transition-colors`}
                onClick={() => onDateClick(dateStr)}
              >
                <div className={`text-sm font-bold mb-0.5 w-6 h-6 flex items-center justify-center rounded-full mx-auto
                  ${isToday ? 'bg-blue-600 text-white' : (isSun || isHoliday) ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}
                >
                  {day.getDate()}
                </div>
                {items.slice(0, maxShow).map(item => (
                  <button
                    key={item.id}
                    className="w-full text-left mb-0.5 flex items-center gap-0.5 overflow-hidden"
                    style={{ fontSize: '11px' }}
                    onClick={e => { e.stopPropagation(); onSelectDelivery(item); }}
                  >
                    {/* 品目カラーの●（納入済みは灰色） */}
                    <span
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: 7, height: 7,
                        background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item),
                      }}
                    />
                    {/* 物件名（納入済みは打ち消し線＋薄グレー） */}
                    <span
                      className="truncate leading-tight"
                      style={{
                        color: item.status === '納入済み' ? '#9ca3af' : '#1f2937',
                        textDecoration: item.status === '納入済み' ? 'line-through' : 'none',
                      }}
                    >
                      {item.status !== '納入済み' && item.is_partial && <span title="一部納入（全納ではありません）">⚠️</span>}{item.project_name}
                    </span>
                  </button>
                ))}
                {items.length > maxShow && (
                  <div className="text-gray-400" style={{ fontSize: '11px' }}>他{items.length - maxShow}件</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}

function WeekView({ current, deliveriesForDate, today, onSelectDelivery, fmt, getWeekStart }: {
  current: Date;
  deliveriesForDate: (d: string) => Delivery[];
  today: Date;
  onSelectDelivery: (d: Delivery) => void;
  fmt: (d: Date) => string;
  getWeekStart: (d: Date) => Date;
}) {
  const weekStart = getWeekStart(current);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

  // 土日は予定がある時だけ表示する（無い週は隠して平日に高さを回す）。
  const rows = days
    .map((day, i) => {
      const dateStr = fmt(day);
      const items = deliveriesForDate(dateStr);
      const isSat = i === 5;
      const isSun = i === 6;
      const show = (!isSat && !isSun) || items.length > 0;
      return { day, i, dateStr, items, isSat, isSun, show };
    })
    .filter(r => r.show);

  return (
    // 表示する曜日数でgridを厳密に等分（内容量に関わらず均等な行高にする）
    <div className="h-full" style={{ display: 'grid', gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(({ day, i, dateStr, items, isSat, isSun }) => {
        const isToday = dateStr === fmt(today);
        const isHoliday = HOLIDAYS.has(dateStr);
        return (
          <div key={i} className={`flex gap-2 px-2 py-1 border-t border-gray-100 min-h-0 overflow-hidden ${isSat || isSun ? 'bg-gray-50/70' : 'bg-white'}`}>
            <div className="w-10 flex-shrink-0 text-center">
              <div className={`text-xs font-medium ${(isSun || isHoliday) ? 'text-red-500' : isSat ? 'text-blue-400' : 'text-gray-500'}`}>{dayNames[i]}</div>
              <div className={`text-base font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'text-white' : (isSun || isHoliday) ? 'text-red-500' : isSat ? 'text-blue-400' : 'text-gray-800'}`}
                style={isToday ? {background:'#0d2c66'} : {}}
              >
                {day.getDate()}
              </div>
            </div>
            <div className="flex-1 flex flex-wrap gap-1 content-start overflow-hidden">
              {items.length === 0 && <span className="text-xs text-gray-300 self-center">-</span>}
              {items.map(item => (
                <button
                  key={item.id}
                  className="flex items-center gap-1 text-left text-xs max-w-full overflow-hidden"
                  onClick={() => onSelectDelivery(item)}
                >
                  <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item) }} />
                  <span className="truncate" style={{ color: item.status === '納入済み' ? '#9ca3af' : '#1f2937', textDecoration: item.status === '納入済み' ? 'line-through' : 'none' }}>
                    {item.status !== '納入済み' && item.is_partial && <span title="一部納入">⚠️</span>}{item.project_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type DaySortMode = 'project' | 'item' | 'vendor' | 'unloader' | 'unload' | 'time' | 'status';
const DAY_SORT_OPTIONS: { value: DaySortMode; label: string }[] = [
  { value: 'project', label: '物件名順' },
  { value: 'item', label: '品目順' },
  { value: 'vendor', label: '業者名順' },
  { value: 'unloader', label: '荷下ろし者順' },
  { value: 'unload', label: '降し場所順' },
  { value: 'time', label: '時刻順' },
  { value: 'status', label: '未納入→納入済み' },
];

function DayView({ current, deliveries, onSelectDelivery, canEdit = false }: {
  current: Date;
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
  canEdit?: boolean;
}) {
  const [sortMode, setSortMode] = useState<DaySortMode>('project');
  const [savingImg, setSavingImg] = useState(false);

  const cmp = (a: Delivery, b: Delivery): number => {
    const s = (v: string | null | undefined) => (v ?? '');
    const byProjectItem = a.project_name.localeCompare(b.project_name, 'ja') || a.item.localeCompare(b.item, 'ja');
    switch (sortMode) {
      case 'project': return byProjectItem || a.id - b.id;
      case 'item': return a.item.localeCompare(b.item, 'ja') || byProjectItem || a.id - b.id;
      case 'vendor': return s(a.vendor).localeCompare(s(b.vendor), 'ja') || byProjectItem || a.id - b.id;
      case 'unloader': return s(a.unloaded_by).localeCompare(s(b.unloaded_by), 'ja') || byProjectItem || a.id - b.id;
      case 'unload': return s(a.unload_location).localeCompare(s(b.unload_location), 'ja') || byProjectItem || a.id - b.id;
      case 'time': return s(a.delivery_time).localeCompare(s(b.delivery_time)) || byProjectItem || a.id - b.id;
      case 'status': return (a.status === '納入済み' ? 1 : 0) - (b.status === '納入済み' ? 1 : 0) || byProjectItem || a.id - b.id;
      default: return byProjectItem || a.id - b.id;
    }
  };

  const timed = deliveries.filter(d => d.delivery_time && /^\d{2}:\d{2}/.test(d.delivery_time)).sort(cmp);
  const allDay = deliveries.filter(d => !d.delivery_time || !/^\d{2}:\d{2}/.test(d.delivery_time)).sort(cmp);

  async function handleSaveImage() {
    setSavingImg(true);
    try { await saveDayAsImage(current, allDay, timed); }
    catch (e) { console.error(e); alert('画像の作成に失敗しました'); }
    finally { setSavingImg(false); }
  }

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-2xl mx-auto">
      {deliveries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-500">並び替え</label>
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as DaySortMode)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 outline-none bg-white"
          >
            {DAY_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canEdit && (
            <button
              onClick={handleSaveImage}
              disabled={savingImg}
              className="ml-auto text-sm px-3 py-1.5 rounded-lg text-white font-bold disabled:opacity-50"
              style={{ background: '#0d2c66' }}
            >
              {savingImg ? '作成中...' : '📷 画像で保存'}
            </button>
          )}
        </div>
      )}
      {allDay.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">終日・時刻未定</div>
          <div className="space-y-2">
            {allDay.map(item => {
              const done = item.status === '納入済み';
              return (
              <button
                key={item.id}
                onClick={() => onSelectDelivery(item)}
                className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 ${done ? 'bg-gray-100 border border-gray-200' : 'text-white'}`}
                style={done ? undefined : { background: getCategoryColor(item.item) }}
              >
                {done && <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#16a34a' }}>✓</span>}
                <div className="flex-1 min-w-0 leading-tight">
                  <div className={`font-bold text-lg truncate ${done ? 'text-gray-500 line-through' : ''}`}>{item.project_name}</div>
                  {item.specification && <div className={`text-sm truncate ${done ? 'text-gray-400' : 'opacity-95'}`}>{item.specification}</div>}
                  <div className={`text-sm truncate ${done ? 'text-gray-400' : 'opacity-90'}`}>{item.item} · {item.vendor} · {item.unload_location}{item.created_by ? ` · 🧑‍💼${item.created_by}` : ''}</div>
                  {item.unloaded_by && <div className={`text-sm truncate font-semibold ${done ? 'text-gray-400' : 'opacity-95'}`}>🧑‍🔧 荷下ろし者：{item.unloaded_by}</div>}
                </div>
                <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 font-bold ${done || (!done && item.is_partial) ? 'text-white' : 'bg-white/20 font-medium'}`} style={done ? { background: '#16a34a' } : (item.is_partial ? { background: '#dc2626' } : undefined)}>{done ? '✓ 納入済み' : (item.is_partial ? '⚠️ 一部納入' : item.status)}</span>
              </button>
              );
            })}
          </div>
        </div>
      )}
      {timed.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">時刻指定</div>
          <div className="space-y-2">
            {timed.map(item => {
              const done = item.status === '納入済み';
              return (
              <button
                key={item.id}
                onClick={() => onSelectDelivery(item)}
                className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 ${done ? 'bg-gray-100 border border-gray-200' : 'text-white'}`}
                style={done ? undefined : { background: getCategoryColor(item.item) }}
              >
                <span className={`font-mono font-bold text-base w-12 flex-shrink-0 ${done ? 'text-gray-400' : ''}`}>{item.delivery_time}</span>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className={`font-bold text-lg truncate ${done ? 'text-gray-500 line-through' : ''}`}>{item.project_name}</div>
                  {item.specification && <div className={`text-sm truncate ${done ? 'text-gray-400' : 'opacity-95'}`}>{item.specification}</div>}
                  <div className={`text-sm truncate ${done ? 'text-gray-400' : 'opacity-90'}`}>{item.item} · {item.vendor}{item.created_by ? ` · 🧑‍💼${item.created_by}` : ''}</div>
                  {item.unloaded_by && <div className={`text-sm truncate font-semibold ${done ? 'text-gray-400' : 'opacity-95'}`}>🧑‍🔧 荷下ろし者：{item.unloaded_by}</div>}
                </div>
                <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 font-bold ${done || (!done && item.is_partial) ? 'text-white' : 'bg-white/20 font-medium'}`} style={done ? { background: '#16a34a' } : (item.is_partial ? { background: '#dc2626' } : undefined)}>{done ? '✓ 納入済み' : (item.is_partial ? '⚠️ 一部納入' : item.status)}</span>
              </button>
              );
            })}
          </div>
        </div>
      )}
      {deliveries.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-medium">この日の納入予定はありません</div>
        </div>
      )}
    </div>
  );
}

function WeekdayHeader() {
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
  return (
    <div className="grid flex-shrink-0 bg-white border-b" style={{ gridTemplateColumns: '2fr 2fr 2fr 2fr 2fr 1fr 1fr' }}>
      {dayNames.map((d, i) => (
        <div key={d} className={`text-center text-sm py-1.5 font-semibold border-r border-gray-200 last:border-r-0 ${i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-600'}`}>
          {d}
        </div>
      ))}
    </div>
  );
}

function CategoryLegend() {
  // 画面の縦を節約するため、凡例は折りたたみ式（初期は閉じてカレンダーを広く使う）。
  const [open, setOpen] = useState(false);
  // 納入済みは打ち消し線で分かるため凡例からは省く。ボルト系は1つに統合。
  const items = [
    { label: '型板', color: '#c2453f' },
    { label: '一次加工品', color: '#cf6a3c' },
    { label: '二次部材', color: '#9c6b3f' },
    { label: '副資材', color: '#b08a2e' },
    { label: '鋼材/ロール/市中/注文', color: '#3f8f5f' },
    { label: 'スプライス', color: '#3f8c86' },
    { label: 'ブレース', color: '#4f6fb0' },
    { label: 'ボルト', color: '#6f5aa8' },
    { label: 'ハイベース', color: '#a85f9c' },
    { label: '支給材/支給品', color: '#bd6188' },
    { label: 'その他(未分類)', color: '#7b8794' },
  ];
  return (
    <div className="bg-white border-b flex-shrink-0">
      {/* スマホのみ折りたたみトグル。PC/iPad(md以上)は画面が広いので常時表示 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden w-full flex items-center gap-1 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
      >
        <span>🎨 色の凡例</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`px-3 pb-2 md:pt-2 flex-wrap gap-x-3 gap-y-1.5 ${open ? 'flex' : 'hidden'} md:flex`}>
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: it.color }} />
            <span className="text-xs font-medium text-gray-700">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 日表示の予定を1枚の画像(PNG)に描き出して保存する。
// 予定が多くて画面に収まらなくても、全件を1枚の画像にできる（社内掲示用）。
async function saveDayAsImage(current: Date, allDay: Delivery[], timed: Delivery[]) {
  const scale = 2;
  const W = 900, pad = 20, rowGap = 10, secH = 30, headH = 66;
  const rowHeightOf = (it: Delivery) => (it.unloaded_by ? 92 : 74);
  const sections: { label: string; items: Delivery[] }[] = [];
  if (allDay.length) sections.push({ label: '終日・時刻未定', items: allDay });
  if (timed.length) sections.push({ label: '時刻指定', items: timed });
  const total = allDay.length + timed.length;

  let H = headH + pad;
  for (const sec of sections) { H += secH; for (const it of sec.items) H += rowHeightOf(it) + rowGap; }
  H += pad;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-2d-context');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const clip = (text: string, maxW: number) => {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const dateLabel = `${current.getFullYear()}年${current.getMonth() + 1}月${current.getDate()}日（${days[current.getDay()]}）`;
  const done = allDay.concat(timed).filter(d => d.status === '納入済み').length;
  ctx.fillStyle = '#0d2c66'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText(dateLabel, pad, pad + 24);
  ctx.fillStyle = '#6b7280'; ctx.font = '15px sans-serif';
  ctx.fillText(`納入予定 ${total}件（納入済み ${done}件）`, pad, pad + 48);

  let y = headH + pad;
  const rowW = W - pad * 2;
  for (const sec of sections) {
    ctx.fillStyle = '#6b7280'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(sec.label, pad, y + 18); y += secH;
    for (const it of sec.items) {
      const isDone = it.status === '納入済み';
      const h = rowHeightOf(it) - 0;
      const bg = isDone ? '#f3f4f6' : getCategoryColor(it.item);
      rr(pad, y, rowW, h, 12); ctx.fillStyle = bg; ctx.fill();
      const tcol = isDone ? '#6b7280' : '#ffffff';
      const time = it.delivery_time && /^\d{2}:\d{2}/.test(it.delivery_time) ? it.delivery_time + '  ' : '';
      ctx.fillStyle = tcol;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(clip(`${time}${it.project_name}`, rowW - 130), pad + 16, y + 28);
      ctx.font = '15px sans-serif';
      const line2 = [it.specification, [it.item, it.vendor, it.unload_location].filter(Boolean).join('・')].filter(Boolean).join('　');
      ctx.fillText(clip(line2, rowW - 130), pad + 16, y + 50);
      if (it.unloaded_by) {
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(clip(`🧑‍🔧 荷下ろし者：${it.unloaded_by}`, rowW - 130), pad + 16, y + 72);
      }
      // ステータスのラベル（右上）
      const st = isDone ? '✓ 納入済み' : (it.is_partial ? '⚠️ 一部納入' : '予定');
      ctx.font = 'bold 14px sans-serif';
      const stW = ctx.measureText(st).width + 20;
      rr(pad + rowW - stW - 12, y + 12, stW, 24, 12);
      ctx.fillStyle = isDone ? '#16a34a' : (it.is_partial ? '#dc2626' : 'rgba(255,255,255,0.25)');
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(st, pad + rowW - stW - 2, y + 28);
      y += h + rowGap;
    }
  }

  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('toBlob-failed');
  const ymd = `${current.getFullYear()}${String(current.getMonth() + 1).padStart(2, '0')}${String(current.getDate()).padStart(2, '0')}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `納入予定_${ymd}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
