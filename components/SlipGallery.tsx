'use client';
import { useEffect, useMemo, useState } from 'react';
import { normalizeName } from '@/lib/textNormalize';

// 納入伝票ギャラリー。/api/slips から「納入伝票だけ・納入日の新しい順」を取得し、
// 納入日ごとに見出しを付けてサムネイルを並べる。
// - 上部のフィルタ（月・物件・業者・キーワード）で、取得済み一覧を画面側でAND絞り込み
// - 画像サムネイル/ PDF アイコンをタップ → その画像・PDFを新しいタブで開く
// - 「詳細」→ その予定の詳細（親から渡す onOpenDelivery）を開く

interface SlipItem {
  id: number;
  delivery_id: number;
  slip_image_path: string;
  created_at: string;
  delivery_date: string;
  delivery_time: string | null;
  project_name: string;
  item: string;
  specification: string | null;
  vendor: string;
  unload_location: string | null;
  status: string;
}

const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

// YYYY-MM-DD → "M/D（曜）"
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function formatDateHeader(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const [, y, mo, d] = m;
  const wd = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${Number(mo)}/${Number(d)}（${WEEK[wd]}）`;
}

// "YYYY-MM" → "YYYY年M月"
function formatMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${m[1]}年${Number(m[2])}月`;
}

// キーワード照合用に正規化（半角/全角・空白差・大文字小文字を無視）
const norm = (v: string | null | undefined) => normalizeName(v).toLowerCase();

export default function SlipGallery({
  onOpenDelivery,
}: {
  onOpenDelivery: (id: number) => void;
}) {
  const [slips, setSlips] = useState<SlipItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // フィルタ条件
  const [month, setMonth] = useState('');     // "YYYY-MM"（空=すべて）
  const [project, setProject] = useState(''); // 物件名（空=すべて）
  const [vendor, setVendor] = useState('');   // 業者（空=すべて）
  const [keyword, setKeyword] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/slips', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setSlips(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // フィルタの選択肢（取得済みデータから作る）
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of slips ?? []) {
      const m = /^(\d{4})-(\d{2})/.exec(s.delivery_date);
      if (m) set.add(`${m[1]}-${m[2]}`);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a)); // 新しい月順
  }, [slips]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of slips ?? []) if (s.project_name) set.add(s.project_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [slips]);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of slips ?? []) if (s.vendor) set.add(s.vendor);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [slips]);

  // 画面側で AND 絞り込み
  const filtered = useMemo(() => {
    const kw = norm(keyword);
    return (slips ?? []).filter((s) => {
      if (month && !s.delivery_date.startsWith(month)) return false;
      if (project && s.project_name !== project) return false;
      if (vendor && s.vendor !== vendor) return false;
      if (kw) {
        const hay = norm(
          `${s.project_name} ${s.item} ${s.specification ?? ''} ${s.vendor} ${s.unload_location ?? ''}`,
        );
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [slips, month, project, vendor, keyword]);

  // 納入日ごとにまとめる（APIが新しい日順で返すので、その順を保つ）
  const groups = useMemo(() => {
    const map = new Map<string, SlipItem[]>();
    for (const s of filtered) {
      const list = map.get(s.delivery_date);
      if (list) list.push(s);
      else map.set(s.delivery_date, [s]);
    }
    return Array.from(map.entries()); // [ [date, items], ... ] 新しい日順
  }, [filtered]);

  const total = slips?.length ?? 0;
  const shown = filtered.length;
  const hasFilter = !!(month || project || vendor || keyword);
  const clearFilters = () => {
    setMonth('');
    setProject('');
    setVendor('');
    setKeyword('');
  };

  if (loading && !slips) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🧾</div>
          <div className="text-sm">読み込み中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-gray-400 gap-3">
        <div className="text-4xl">⚠️</div>
        <div className="text-sm">読み込みに失敗しました</div>
        <button
          onClick={load}
          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          🔄 再読み込み
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-gray-400 gap-2">
        <div className="text-5xl">🧾</div>
        <div className="font-medium text-base">納入伝票はまだありません</div>
        <div className="text-xs">予定の詳細から伝票を添付すると、ここに並びます</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* フィルタバー（常設） */}
      <div className="flex-shrink-0 border-b bg-white px-3 md:px-5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* キーワード */}
          <div className="relative flex-1 min-w-[160px]">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="キーワード（物件・品目・業者など）"
              className="w-full pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            {keyword && (
              <button
                onClick={() => setKeyword('')}
                aria-label="キーワードをクリア"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                ×
              </button>
            )}
          </div>
          {/* 月 */}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="py-1.5 px-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">月：すべて</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
          {/* 物件 */}
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="py-1.5 px-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 max-w-[46vw] md:max-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">物件：すべて</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {/* 業者 */}
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="py-1.5 px-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 max-w-[46vw] md:max-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">業者：すべて</option>
            {vendorOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          {hasFilter && (
            <button
              onClick={clearFilters}
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              条件をクリア
            </button>
          )}
          <button
            onClick={load}
            className="ml-auto text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            🔄 更新
          </button>
        </div>
        <div className="mt-1.5 text-xs text-gray-500">
          {hasFilter ? (
            <span>
              該当 <span className="font-bold text-gray-700">{shown}</span>枚 / 全{total}枚
            </span>
          ) : (
            <span>納入伝票 {total}枚</span>
          )}
        </div>
      </div>

      {/* 一覧 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {shown === 0 ? (
          <div className="flex flex-col items-center justify-center text-gray-400 gap-2 py-16">
            <div className="text-4xl">🔍</div>
            <div className="text-sm">条件に合う伝票がありません</div>
            <button
              onClick={clearFilters}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              条件をクリア
            </button>
          </div>
        ) : (
          <div className="px-3 md:px-5 py-3">
            {groups.map(([date, items]) => (
              <section key={date} className="mb-5">
                {/* 納入日の見出し */}
                <div className="sticky top-0 z-10 -mx-3 md:-mx-5 px-3 md:px-5 py-1.5 bg-gray-100/95 backdrop-blur border-b border-gray-200 flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">{formatDateHeader(date)}</span>
                  <span className="text-xs text-gray-400">{items.length}枚</span>
                </div>

                {/* サムネイル */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 mt-2">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col"
                    >
                      {/* 画像 / PDF（タップで開く） */}
                      <a
                        href={s.slip_image_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square bg-gray-50 relative"
                        title="開く"
                      >
                        {isPdf(s.slip_image_path) ? (
                          <span className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-1">
                            <span className="text-3xl">📄</span>
                            <span className="text-[10px] font-medium">PDF（タップで開く）</span>
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.slip_image_path}
                            alt={`${s.project_name} の納入伝票`}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </a>

                      {/* 情報＋詳細 */}
                      <div className="px-2 py-1.5 flex-1 flex flex-col gap-0.5">
                        <div className="text-xs font-bold text-gray-800 truncate" title={s.project_name}>
                          {s.project_name}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate" title={s.item}>
                          {s.item}
                          {s.specification ? `・${s.specification}` : ''}
                        </div>
                        <button
                          onClick={() => onOpenDelivery(s.delivery_id)}
                          className="mt-1 text-[11px] font-bold text-blue-600 hover:underline text-left"
                        >
                          詳細を開く →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
