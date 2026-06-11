'use client';
import { useState, useRef, useCallback } from 'react';
import { Delivery } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';

type CalViewMode = '月' | '週' | '日';

interface Props {
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
  onDateClick?: (date: string) => void;
}

export default function CalendarView({ deliveries, onSelectDelivery, onDateClick }: Props) {
  const [mode, setMode] = useState<CalViewMode>('月');
  const [current, setCurrent] = useState(new Date());
  const today = new Date();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [sliding, setSliding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function deliveriesForDate(dateStr: string) {
    return deliveries.filter(d => d.delivery_date === dateStr);
  }

  function getPrev(d: Date) {
    const p = new Date(d);
    if (mode === '月') p.setMonth(p.getMonth() - 1);
    else if (mode === '週') p.setDate(p.getDate() - 7);
    else p.setDate(p.getDate() - 1);
    return p;
  }

  function getNext(d: Date) {
    const n = new Date(d);
    if (mode === '月') n.setMonth(n.getMonth() + 1);
    else if (mode === '週') n.setDate(n.getDate() + 7);
    else n.setDate(n.getDate() + 1);
    return n;
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

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setDragX(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // 縦スクロールが主なら無視
    if (!sliding && Math.abs(dy) > Math.abs(dx)) return;
    setSliding(true);
    setDragX(dx);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    touchStartY.current = null;
    setSliding(false);
    setDragX(0);
    if (Math.abs(dx) > 60) navigate(dx < 0 ? 1 : -1);
  }

  function headerLabel() {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    if (mode === '月') return `${y}年${m}月`;
    if (mode === '週') {
      const start = getWeekStart(current);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${y}年${m}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
    }
    return `${y}年${m}月${current.getDate()}日(${['日','月','火','水','木','金','土'][current.getDay()]})`;
  }

  function getWeekStart(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  const w = containerRef.current?.offsetWidth ?? 400;

  function renderPage(date: Date) {
    return (
      <>
        {mode === '月' && <MonthView current={date} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} onDateClick={(d) => { setCurrent(new Date(d)); setMode('日'); onDateClick?.(d); }} fmt={fmt} />}
        {mode === '週' && <WeekView current={date} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} fmt={fmt} getWeekStart={getWeekStart} />}
        {mode === '日' && <DayView current={date} deliveries={deliveriesForDate(fmt(date))} onSelectDelivery={onSelectDelivery} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* コントロールバー */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white border-b flex-shrink-0 flex-wrap gap-y-2">
        <div className="flex gap-1">
          {(['月','週','日'] as CalViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={mode === m
                ? { background: '#0d2c66', color: 'white' }
                : { background: '#f3f4f6', color: '#374151' }
              }
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg">‹</button>
          <button onClick={() => setCurrent(new Date())} className="px-3 py-1 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 font-medium">今日</button>
          <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg">›</button>
        </div>
        <div className="w-full md:w-auto md:ml-2">
          <span className="font-bold text-gray-800 text-sm md:text-base">{headerLabel()}</span>
        </div>
      </div>

      {/* 凡例 */}
      <CategoryLegend />

      {/* カレンダー本体（スワイプエリア） */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 前のページ（左） */}
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ transform: `translateX(${dragX - w}px)`, willChange: 'transform' }}
        >
          {renderPage(getPrev(current))}
        </div>
        {/* 現在ページ */}
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ transform: `translateX(${dragX}px)`, willChange: 'transform' }}
        >
          {renderPage(current)}
        </div>
        {/* 次のページ（右） */}
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ transform: `translateX(${dragX + w}px)`, willChange: 'transform' }}
        >
          {renderPage(getNext(current))}
        </div>
      </div>
    </div>
  );
}

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

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

  return (
    <div className="p-1 md:p-3">
      {/* 曜日ヘッダー */}
      <div className="grid mb-1" style={{gridTemplateColumns: '2fr 2fr 2fr 2fr 2fr 1fr 1fr'}}>
        {dayNames.map((d, i) => (
          <div key={d} className={`text-center text-xs py-1 font-medium ${i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>
      {/* 日付グリッド */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid border-t border-gray-200" style={{gridTemplateColumns: '2fr 2fr 2fr 2fr 2fr 1fr 1fr'}}>
          {week.map((day, di) => {
            if (!day) return <div key={di} className="min-h-[60px] md:min-h-[100px] bg-gray-50/50 min-w-0" />;
            const dateStr = fmt(day);
            const items = deliveriesForDate(dateStr);
            const isToday = dateStr === fmt(today);
            const isSat = di === 5;
            const isSun = di === 6;
            const maxShow = 2;
            return (
              <div
                key={di}
                className="min-h-[60px] md:min-h-[100px] p-0.5 md:p-1 cursor-pointer hover:bg-blue-50 transition-colors border-r border-gray-100 last:border-r-0 overflow-hidden min-w-0"
                onClick={() => onDateClick(dateStr)}
              >
                <div className={`text-xs font-bold mb-0.5 md:mb-1 w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full mx-auto
                  ${isToday ? 'bg-blue-600 text-white' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}
                >
                  {day.getDate()}
                </div>
                {items.slice(0, maxShow).map(item => (
                  <button
                    key={item.id}
                    className="w-full text-left rounded text-white mb-0.5 block overflow-hidden"
                    style={{
                      background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item),
                      fontSize: '10px',
                      padding: '1px 3px',
                    }}
                    onClick={e => { e.stopPropagation(); onSelectDelivery(item); }}
                  >
                    <span className="block truncate">[{item.status === '納入済み' ? '済' : '未'}] {item.project_name}</span>
                  </button>
                ))}
                {items.length > maxShow && (
                  <div className="text-gray-400" style={{ fontSize: '10px' }}>他{items.length - maxShow}件</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
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

  return (
    <div className="divide-y divide-gray-100">
      {days.map((day, i) => {
        const dateStr = fmt(day);
        const items = deliveriesForDate(dateStr);
        const isToday = dateStr === fmt(today);
        const isSat = i === 5;
        const isSun = i === 6;
        return (
          <div key={i} className={`flex gap-3 p-3 ${isSat || isSun ? 'bg-gray-50/70' : 'bg-white'}`}>
            <div className="w-12 flex-shrink-0 text-center">
              <div className={`text-xs font-medium ${isSun ? 'text-red-500' : isSat ? 'text-blue-400' : 'text-gray-500'}`}>{dayNames[i]}</div>
              <div className={`text-lg font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full
                ${isToday ? 'text-white' : isSun ? 'text-red-500' : isSat ? 'text-blue-400' : 'text-gray-800'}`}
                style={isToday ? {background:'#0d2c66'} : {}}
              >
                {day.getDate()}
              </div>
            </div>
            <div className="flex-1 flex flex-wrap gap-1.5 items-start py-1 min-h-[44px]">
              {items.length === 0 && <span className="text-xs text-gray-300 self-center">-</span>}
              {items.map(item => (
                <button
                  key={item.id}
                  className="text-left rounded-lg text-white text-xs px-2 py-1 max-w-full"
                  style={{background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item)}}
                  onClick={() => onSelectDelivery(item)}
                >
                  <span className="block truncate">[{item.status === '納入済み' ? '済' : '未'}] {item.project_name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ current: _current, deliveries, onSelectDelivery }: {
  current: Date;
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
}) {
  const timed = deliveries.filter(d => d.delivery_time && /^\d{2}:\d{2}/.test(d.delivery_time));
  const allDay = deliveries.filter(d => !d.delivery_time || !/^\d{2}:\d{2}/.test(d.delivery_time));

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-2xl mx-auto">
      {allDay.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">終日・時刻未定</div>
          <div className="space-y-2">
            {allDay.map(item => (
              <button
                key={item.id}
                onClick={() => onSelectDelivery(item)}
                className="w-full text-left p-3 rounded-xl text-white flex items-center gap-3"
                style={{ background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item) }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{item.project_name}</div>
                  <div className="text-xs opacity-80">{item.item} · {item.vendor} · {item.unload_location}</div>
                </div>
                <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full flex-shrink-0">{item.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {timed.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">時刻指定</div>
          <div className="space-y-2">
            {[...timed].sort((a, b) => (a.delivery_time ?? '').localeCompare(b.delivery_time ?? '')).map(item => (
              <button
                key={item.id}
                onClick={() => onSelectDelivery(item)}
                className="w-full text-left p-3 rounded-xl text-white flex items-center gap-3"
                style={{ background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item) }}
              >
                <span className="font-mono font-bold text-sm w-12 flex-shrink-0">{item.delivery_time}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{item.project_name}</div>
                  <div className="text-xs opacity-80">{item.item} · {item.vendor}</div>
                </div>
                <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full flex-shrink-0">{item.status}</span>
              </button>
            ))}
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

function CategoryLegend() {
  const items = [
    { label: '型板', color: '#dc2626' },
    { label: '一次加工品', color: '#ea580c' },
    { label: '副資材', color: '#ca8a04' },
    { label: '鋼材', color: '#16a34a' },
    { label: 'スプライス', color: '#0891b2' },
    { label: 'ブレース', color: '#2563eb' },
    { label: 'ボルト', color: '#7c3aed' },
    { label: '支給品', color: '#4b5563' },
    { label: '納入済み', color: '#9ca3af' },
  ];
  return (
    <div className="bg-white border-b px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 flex-shrink-0">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: it.color }} />
          <span className="text-xs text-gray-600">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
