'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Reconciled } from '@/lib/checklist';

interface BoardItem { name: string; total: number; done: number; pending: number; allDelivered: boolean; readyDate: string }

const md = (d: string | null) => { if (!d) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };

export default function ProgressPage() {
  const [view, setView] = useState<'k' | 'g'>('k');
  const [projects, setProjects] = useState<string[]>([]);
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [sel, setSel] = useState('');
  const [rec, setRec] = useState<Reconciled | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/checklist', { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? '取得に失敗'); return r.json(); })
      .then(d => { setProjects(d.projects ?? []); setBoard(d.board ?? []); if (d.projects?.[0]) setSel(d.projects[0]); })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadRec = useCallback((p: string) => {
    if (!p) return;
    setLoadingRec(true);
    fetch(`/api/checklist?project=${encodeURIComponent(p)}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setRec(d.reconciled ?? null))
      .catch(() => setRec(null)).finally(() => setLoadingRec(false));
  }, []);

  useEffect(() => { if (view === 'g' && sel) loadRec(sel); }, [view, sel, loadRec]);

  return (
    <div className="pg">
      <style>{css}</style>
      <header className="top">
        <div className="brand">現</div>
        <div>
          <h1>物件別 進捗</h1>
          <p className="sub">納入データを現寸チェックへ自動反映（フェーズ1・自動集計）</p>
        </div>
        <Link href="/" className="back">← カレンダーへ</Link>
      </header>

      <div className="persp">
        <button aria-pressed={view === 'k'} onClick={() => setView('k')}><span className="t">🔧 組立工ビュー</span><span className="d">いつ全部揃う＝組立できる日</span></button>
        <button aria-pressed={view === 'g'} onClick={() => setView('g')}><span className="t">📐 原寸班ビュー</span><span className="d">発注・納入の反映状況を物件別に</span></button>
      </div>

      {err && <p className="err">取得に失敗しました：{err}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {!loading && view === 'k' && (
        <div className="kgrid">
          {board.length === 0 && <p className="muted">対象の物件がありません。</p>}
          {board.map(b => {
            const cls = b.allDelivered ? 'g' : (b.done === 0 ? 'i' : 'w');
            const rate = b.total ? Math.round(b.done / b.total * 100) : 0;
            return (
              <button key={b.name} className={`kcard ${b.allDelivered ? 'ready' : ''}`} onClick={() => { setSel(b.name); setView('g'); }}>
                <div className={`kdate ${cls}`}>
                  <div className="d2">{b.allDelivered ? md(b.readyDate) : md(b.readyDate)}</div>
                  <div className="m2">{b.allDelivered ? '揃いました' : '揃う予定'}</div>
                </div>
                <div className="kbody">
                  <div className="p">{b.name}</div>
                  <div className="s">納入済み <b>{b.done}</b> / {b.total} 件{b.pending ? `（未着 ${b.pending}）` : ''}</div>
                  <div className="bar"><span style={{ width: `${rate}%` }} className={b.allDelivered ? 'fg' : 'fw'} /></div>
                  <span className={`tag ${b.allDelivered ? 'tg-g' : (b.done === 0 ? 'tg-i' : 'tg-w')}`}>
                    {b.allDelivered ? '● 全て納入済み' : (b.done === 0 ? '○ 未着' : `◐ あと ${b.pending} 件`)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && view === 'g' && (
        <div>
          <div className="gbar">
            <label className="lb" htmlFor="prjsel">物件を選ぶ</label>
            <select id="prjsel" value={sel} onChange={e => setSel(e.target.value)}>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {loadingRec && <p className="muted">読み込み中…</p>}
          {rec && !loadingRec && (
            <>
              <div className="tiles">
                <Tile n={rec.summary.done} l="納入済み" c="var(--good)" />
                <Tile n={rec.summary.ordered} l="発注済み（予定）" c="var(--warn)" />
                <Tile n={rec.summary.none} l="未手配" c="var(--na)" />
                <Tile n={rec.ready.date ? md(rec.ready.date) : '—'} l={rec.ready.allDelivered ? '揃いました' : '揃う予定'} c="var(--navy)" />
              </div>
              <p className="note">「未手配」＝この物件の納入データに一致が無い項目です。<b>本当に発注忘れか、対象外か</b>の区別（手動での消し込み）は次フェーズで対応します。</p>

              {rec.sections.map(sec => (
                <section className="sec" key={sec.section}>
                  <h2>{sec.section}<span className="c">納入済 {sec.done} / 発注済 {sec.ordered} / 未手配 {sec.none}</span></h2>
                  {sec.groups.map(g => (
                    <div key={g.group}>
                      <div className="grp">▸ {g.group}</div>
                      {g.items.map((it, i) => (
                        <div className={`it ${it.status}`} key={i}>
                          <span className={`box ${it.status}`}>{it.status === 'done' ? '✓' : it.status === 'ordered' ? '▲' : ''}</span>
                          <span className="labi">{it.label}</span>
                          <span className={`st ${it.status}`}>
                            {it.status === 'done' ? '✓ 納入済み' : it.status === 'ordered' ? '▲ 発注済み' : '未手配'}
                            {it.info && <span className="sub">{it.info}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              ))}

              {rec.unmatched.length > 0 && (
                <section className="sec">
                  <h2>未分類（テンプレ外の納入）<span className="c">{rec.unmatched.length} 件</span></h2>
                  {rec.unmatched.map((u, i) => (
                    <div className="it" key={i}>
                      <span className="box n" />
                      <span className="labi">{u.item}<small>{u.specification ?? ''}</small></span>
                      <span className="st">{u.status === '納入済み' ? '✓ 納入' : '予定'} {md(u.delivery_date)}<span className="sub">{u.vendor}</span></span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ n, l, c }: { n: number | string; l: string; c: string }) {
  return <div className="tile"><div className="n" style={{ color: c }}>{n}</div><div className="tl">{l}</div></div>;
}

const css = `
:root{--navy:#0d2c66;--bg:#eceff5;--surface:#fff;--surface-2:#f5f7fb;--line:#dce2ec;--ink:#16233b;--ink-2:#586a86;--ink-3:#8b99b0;--good:#15803d;--good-bg:#e5f4ea;--warn:#b45309;--warn-bg:#fbf0dd;--na:#9aa6ba;--na-bg:#eef1f6;--shadow:0 1px 2px rgba(16,35,59,.05),0 8px 22px rgba(16,35,59,.07);}
.pg{max-width:1000px;margin:0 auto;padding:20px 16px 64px;font-family:"Noto Sans JP","Hiragino Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.brand{width:34px;height:34px;border-radius:9px;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:800;flex-shrink:0;}
h1{font-size:1.3rem;margin:0;} .sub{font-size:.82rem;color:var(--ink-2);margin:2px 0 0;}
.back{margin-left:auto;font-size:.82rem;color:var(--navy);text-decoration:none;font-weight:700;}
.persp{display:flex;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:5px;box-shadow:var(--shadow);margin-bottom:16px;}
.persp button{flex:1;border:0;background:none;color:var(--ink-2);font:inherit;cursor:pointer;padding:10px 12px;border-radius:9px;text-align:left;}
.persp .t{font-weight:800;font-size:.95rem;display:block;} .persp .d{font-size:.72rem;color:var(--ink-3);}
.persp button[aria-pressed=true]{background:var(--navy);color:#fff;} .persp button[aria-pressed=true] .d{color:rgba(255,255,255,.8);}
.muted{color:var(--ink-3);font-size:.9rem;} .err{color:var(--crit,#c2321f);}
.kgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
@media(max-width:640px){.kgrid{grid-template-columns:1fr;}}
.kcard{display:flex;gap:13px;align-items:center;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:15px;cursor:pointer;}
.kcard.ready{border-color:color-mix(in srgb,var(--good) 45%,var(--line));}
.kdate{flex-shrink:0;width:92px;text-align:center;border-radius:12px;padding:9px 6px;background:var(--surface-2);border:1px solid var(--line);}
.kdate .d2{font-size:1.4rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;} .kdate .m2{font-size:.7rem;color:var(--ink-2);margin-top:3px;}
.kdate.g{background:var(--good-bg);border-color:transparent;} .kdate.g .d2,.kdate.g .m2{color:var(--good);}
.kdate.i{background:var(--na-bg);border-color:transparent;} .kdate.i .d2,.kdate.i .m2{color:var(--ink-3);}
.kbody{min-width:0;} .kbody .p{font-size:1.02rem;font-weight:800;} .kbody .s{font-size:.8rem;color:var(--ink-2);margin-top:3px;}
.bar{height:7px;border-radius:999px;background:var(--na-bg);overflow:hidden;margin-top:8px;} .bar span{display:block;height:100%;border-radius:999px;} .fg{background:var(--good);} .fw{background:linear-gradient(90deg,var(--good),var(--warn));}
.tag{display:inline-block;font-size:.72rem;font-weight:800;padding:3px 9px;border-radius:999px;margin-top:8px;}
.tg-g{color:var(--good);background:var(--good-bg);} .tg-w{color:var(--warn);background:var(--warn-bg);} .tg-i{color:var(--ink-2);background:var(--na-bg);}
.gbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.lb{font-size:.72rem;color:var(--ink-2);font-weight:700;}
#prjsel{font:inherit;font-size:.95rem;font-weight:700;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 12px;box-shadow:var(--shadow);max-width:100%;}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}
@media(max-width:640px){.tiles{grid-template-columns:repeat(2,1fr);}}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 13px;box-shadow:var(--shadow);}
.tile .n{font-size:1.4rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;} .tile .tl{font-size:.72rem;color:var(--ink-2);margin-top:2px;}
.note{font-size:.78rem;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin:0 0 14px;} .note b{color:var(--ink);}
.sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:12px;}
.sec>h2{margin:0;font-size:.82rem;font-weight:800;letter-spacing:.1em;color:#fff;background:var(--navy);padding:9px 16px;display:flex;justify-content:space-between;align-items:center;}
.sec>h2 .c{font-size:.72rem;font-weight:700;opacity:.9;}
.grp{font-size:.72rem;font-weight:700;color:var(--ink-2);background:var(--surface-2);padding:5px 16px;border-top:1px solid var(--line);}
.it{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:7px 16px;border-top:1px solid var(--line);}
.box{width:19px;height:19px;border-radius:5px;border:2px solid var(--na);display:grid;place-items:center;font-size:11px;font-weight:800;}
.box.done{background:var(--good);border-color:var(--good);color:#fff;} .box.ordered{border-color:var(--warn);color:var(--warn);} .box.n,.box.none{border-color:var(--line);background:var(--na-bg);}
.labi{font-size:.88rem;font-weight:500;} .labi small{display:block;font-size:.72rem;color:var(--ink-3);}
.st{font-size:.76rem;font-weight:800;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;} .st .sub{display:block;font-size:.7rem;font-weight:400;color:var(--ink-3);}
.st.done{color:var(--good);} .st.ordered{color:var(--warn);} .st.none{color:var(--na);} .it.none .labi{color:var(--ink-3);}
`;
