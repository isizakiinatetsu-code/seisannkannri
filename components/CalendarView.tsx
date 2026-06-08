'use client';
import { useState } from 'react';
import { Delivery } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';

type CalViewMode = '月' | '週' | '日' | '一覧';

interface Props {
  deliveries: Delivery[];
  onSelectDelivery: (d: Delivery) => void;
  onDateClick?: (date: string) => void;
}

export default function CalendarView({ deliveries, onSelectDelivery, onDateClick }: Props) {
  const [mode, setMode] = useState<CalViewMode>('月');
  const [current, setCurrent] = useState(new Date());
  const today = new Date();

  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function deliveriesForDate(dateStr: string) {
    return deliveries.filter(d => d.delivery_date === dateStr);
  }

  function navigate(delta: number) {
    const d = new Date(current);
    if (mode === '月') d.setMonth(d.getMonth() + delta);
    else if (mode === '週') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    setCurrent(d);
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* コントロールバー */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white border-b flex-shrink-0 flex-wrap gap-y-2">
        <div className="flex gap-1">
          {(['月','週','日','一覧'] as CalViewMode[]).map(m => (
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

      {/* カレンダー本体 */}
      <div className="flex-1 overflow-y-auto">
        {mode === '月' && <MonthView current={current} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} onDateClick={(d) => { setCurrent(new Date(d)); setMode('日'); onDateClick?.(d); }} fmt={fmt} />}
        {mode === '週' && <WeekView current={current} deliveriesForDate={deliveriesForDate} today={today} onSelectDelivery={onSelectDelivery} fmt={fmt} getWeekStart={getWeekStart} />}
        {mode === '日' && <DayView current={current} deliveries={deliveriesForDate(fmt(current))} onSelectDelivery={onSelectDelivery} />}
        {mode === '一覧' && <AllListView deliveries={deliveries} onSelectDelivery={onSelectDelivery} />}
      </div>

      {/* 凡例 */}
      <CategoryLegend />
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
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d, i) => (
          <div key={d} className={`text-center text-xs py-1 font-medium ${i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>
      {/* 日付グリッド */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-gray-200">
          {week.map((day, di) => {
            if (!day) return <div key={di} className="min-h-[60px] md:min-h-[100px] bg-gray-50/50" />;
            const dateStr = fmt(day);
            const items = deliveriesForDate(dateStr);
            const isToday = dateStr === fmt(today);
            const isSat = di === 5;
            const isSun = di === 6;
            const maxShow = 2;
            return (
              <div
                key={di}
                className="min-h-[60px] md:min-h-[100px] p-0.5 md:p-1 cursor-pointer hover:bg-blue-50 transition-colors border-r border-gray-100 last:border-r-0"
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
    <div className="p-2">
      <div className="grid grid-cols-7 border-b border-gray-200 mb-1">
        {days.map((day, i) => {
          const isToday = fmt(day) === fmt(today);
          const isSat = i === 5;
          const isSun = i === 6;
          return (
            <div key={i} className="text-center py-2">
              <div className={`text-xs ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-500'}`}>{dayNames[i]}</div>
              <div className={`text-sm font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-blue-600 text-white' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[120px]">
        {days.map((day, i) => {
          const items = deliveriesForDate(fmt(day));
          return (
            <div key={i} className="p-0.5 border-r border-gray-100 last:border-r-0">
              {items.map(item => (
                <button
                  key={item.id}
                  className="w-full text-left rounded-sm text-white mb-0.5 block"
                  style={{
                    background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item),
                    fontSize: '10px',
                    padding: '2px 4px',
                  }}
                  onClick={() => onSelectDelivery(item)}
                >
                  <span className="block truncate">[{item.status === '納入済み' ? '済' : '未'}] {item.project_name}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ current, deliveries, onSelectDelivery }: {
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

function AllListView({ deliveries, onSelectDelivery }: { deliveries: Delivery[]; onSelectDelivery: (d: Delivery) => void }) {
  const grouped: Record<string, Delivery[]> = {};
  for (const d of deliveries) {
    if (!grouped[d.delivery_date]) grouped[d.delivery_date] = [];
    grouped[d.delivery_date].push(d);
  }
  const dates = Object.keys(grouped).sort();

  return (
    <div className="space-y-1 p-2 md:p-4">
      {dates.map(date => {
        const items = grouped[date];
        const delivered = items.filter(i => i.status === '納入済み').length;
        return (
          <div key={date}>
            <div className="sticky top-0 px-3 py-2 text-sm font-bold text-white flex justify-between items-center rounded-t-lg z-10" style={{ background: '#0d2c66' }}>
              <span>{formatDateLabel(date)}</span>
              <span className="text-xs font-normal opacity-70">{delivered}/{items.length}件 納入済み</span>
            </div>
            <div className="bg-white rounded-b-lg shadow-sm divide-y divide-gray-100 mb-3">
              {items.map(item => (
                <button key={item.id} onClick={() => onSelectDelivery(item)} className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: item.status === '納入済み' ? '#9ca3af' : getCategoryColor(item.item) }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm">{item.project_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">🕐 {item.delivery_time ?? '未定'} · {item.vendor} · {item.unload_location}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: getCategoryColor(item.item) }}>{item.item}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: item.status === '納入済み' ? '#9ca3af' : '#d97706' }}>{item.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {dates.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-medium">データがありません</div>
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
    <div className="bg-white border-t px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 flex-shrink-0">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: it.color }} />
          <span className="text-xs text-gray-600">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}
