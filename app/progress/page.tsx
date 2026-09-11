'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { Reconciled } from '@/lib/checklist';

interface BoardItem { name: string; total: number; done: number; pending: number; allDelivered: boolean; readyDate: string }

const md = (d: string | null) => { if (!d) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };
const LS_KEY = 'progress_selected_projects';

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProgressPage() {
  const [view, setView] = useState<'k' | 'g'>('k');
  const [projects, setProjects] = useState<string[]>([]);
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [sel, setSel] = useState('');
  const [rec, setRec] = useState<Reconciled | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);
  const [err, setErr] = useState('');
  const [chosen, setChosen] = useState<string[] | null>(null); // 表示対象の物件（null=未設定）
  const [picker, setPicker] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [exBusy, setExBusy] = useState(false);

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(d => setCanEdit(d.role === 'edit')).catch(() => {}); }, []);

  useEffect(() => {
    try { const s = localStorage.getItem(LS_KEY); if (s) setChosen(JSON.parse(s)); } catch { /* noop */ }
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

  async function toggleEx(key: string, excluded: boolean) {
    if (!sel || exBusy) return;
    setExBusy(true);
    try {
      const res = await fetch('/api/checklist/exclude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: sel, itemKey: key, excluded }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? '更新に失敗しました'); return; }
      loadRec(sel);
    } finally { setExBusy(false); }
  }

  // 表示する物件：選択済みならそれ、未設定なら「完了していない物件」だけ（＝終わった物件は隠す）
  const chosenSet = useMemo(() => (chosen ? new Set(chosen) : null), [chosen]);
  const visible = useMemo(() =>
    chosenSet ? board.filter(b => chosenSet.has(b.name)) : board.filter(b => !b.allDelivered),
    [board, chosenSet]);

  function saveChosen(list: string[]) {
    setChosen(list);
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* noop */ }
  }

  function exportBoardCSV() {
    const rows: (string | number)[][] = [['物件名', '揃う予定日', '納入済み', '全件', '未着', '状態']];
    for (const b of visible) rows.push([b.name, md(b.readyDate), b.done, b.total, b.pending, b.allDelivered ? '全て納入済み' : (b.done === 0 ? '未着' : `あと${b.pending}件`)]);
    downloadCSV(`物件別進捗_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  function exportChecklistCSV() {
    if (!rec) return;
    const rows: (string | number)[][] = [['物件', sel], [], ['セクション', '分類', '項目', '状態', '業者・日付']];
    const jp = (s: string) => s === 'done' ? '納入済み' : s === 'ordered' ? '発注済み' : '未手配';
    for (const sec of rec.sections) for (const g of sec.groups) for (const it of g.items) rows.push([sec.section, g.group, it.label, jp(it.status), it.info]);
    if (rec.unmatched.length) { rows.push([], ['未分類（テンプレ外）']); for (const u of rec.unmatched) rows.push(['未分類', u.item, u.specification ?? '', u.status, `${u.vendor}・${md(u.delivery_date)}`]); }
    downloadCSV(`現寸チェック_${sel}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="pg">
      <style>{css}</style>
      <header className="top no-print">
        <div className="brand">現</div>
        <div>
          <h1>物件別 進捗</h1>
          <p className="sub">納入データを現寸チェックへ自動反映（フェーズ1・自動集計）</p>
        </div>
        <Link href="/" className="back">← カレンダーへ</Link>
      </header>

      <div className="persp no-print">
        <button aria-pressed={view === 'k'} onClick={() => setView('k')}><span className="t">🔧 組立工ビュー</span><span className="d">登録済みの納入予定の進捗（未手配は要確認）</span></button>
        <button aria-pressed={view === 'g'} onClick={() => setView('g')}><span className="t">📐 原寸班ビュー</span><span className="d">発注・納入の反映状況を物件別に</span></button>
      </div>

      {err && <p className="err">取得に失敗しました：{err}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {!loading && view === 'k' && (
        <>
          <div className="toolbar no-print">
            <button className="tbtn" onClick={() => setPicker(true)}>表示する物件を選ぶ（{visible.length}/{board.length}）</button>
            <button className="tbtn" onClick={exportBoardCSV}>📥 CSV</button>
            <button className="tbtn" onClick={() => window.print()}>🖨 PDF / 印刷</button>
            <span className="hint">{chosenSet ? '選択した物件のみ表示中' : '登録分が全て納入済みの物件は自動で非表示'}</span>
          </div>
          <p className="warn no-print">⚠ 「納入済み」は<b>システムに登録済みの納入予定</b>に対する進捗です。<b>未手配（未発注）の項目は含みません</b>。加工を始めてよいかは、原寸班ビューで<b>未手配</b>が残っていないかを必ず確認してください。</p>
          <div className="kgrid">
            {visible.length === 0 && <p className="muted">表示する物件がありません。「表示する物件を選ぶ」から選んでください。</p>}
            {visible.map(b => {
              const cls = b.allDelivered ? 'b' : (b.done === 0 ? 'i' : 'w');
              const rate = b.total ? Math.round(b.done / b.total * 100) : 0;
              return (
                <button key={b.name} className="kcard" onClick={() => { setSel(b.name); setView('g'); }}>
                  <div className={`kdate ${cls}`}>
                    <div className="d2">{md(b.readyDate)}</div>
                    <div className="m2">{b.allDelivered ? '最終納入' : '揃う予定'}</div>
                  </div>
                  <div className="kbody">
                    <div className="p">{b.name}</div>
                    <div className="s">登録分 納入済み <b>{b.done}</b> / {b.total} 件{b.pending ? `（未着 ${b.pending}）` : ''}</div>
                    <div className="bar"><span style={{ width: `${rate}%` }} className={b.allDelivered ? 'fb' : 'fw'} /></div>
                    <span className={`tag ${b.allDelivered ? 'tg-b' : (b.done === 0 ? 'tg-i' : 'tg-w')}`}>
                      {b.allDelivered ? '登録分は納入済み（未手配は要確認）' : (b.done === 0 ? '○ 未着' : `◐ あと ${b.pending} 件`)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {!loading && view === 'g' && (
        <div>
          <div className="gbar no-print">
            <label className="lb" htmlFor="prjsel">物件を選ぶ</label>
            <select id="prjsel" value={sel} onChange={e => setSel(e.target.value)}>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="tbtn" onClick={exportChecklistCSV}>📥 CSV</button>
            <button className="tbtn" onClick={() => window.print()}>🖨 PDF / 印刷</button>
          </div>
          <div className="printtitle print-only">現寸チェック台帳 ／ {sel}</div>

          {loadingRec && <p className="muted">読み込み中…</p>}
          {rec && !loadingRec && (
            <>
              <div className="tiles t5">
                <Tile n={rec.summary.done} l="納入済み" c="var(--good)" />
                <Tile n={rec.summary.ordered} l="発注済み（予定）" c="var(--warn)" />
                <Tile n={rec.summary.none} l="未手配（発注忘れ候補）" c="var(--crit)" />
                <Tile n={rec.summary.na} l="対象外" c="var(--na)" />
                <Tile n={rec.ready.date ? md(rec.ready.date) : '—'} l={rec.ready.allDelivered ? '最終納入（登録分）' : '揃う予定'} c="var(--navy)" />
              </div>
              {rec.parts.length > 0 && (
                <section className="parts">
                  <div className="phead">部位別「流せる日」<span className="psub">全部そろうのを待たず、部位ごとに加工・組立へ流せる日</span></div>
                  <div className="pgrid">
                    {rec.parts.map(p => (
                      <div className={`pcard ${p.status}`} key={p.part}>
                        <div className="pname">{p.part}</div>
                        <div className="pdate">{p.status === 'blocked' ? '未確定' : md(p.readyDate)}</div>
                        <div className="pmsg">
                          {p.status === 'ready' ? '✓ 揃い済み・流せます'
                            : p.status === 'waiting' ? `この日から流せる（待ち ${p.ordered}）`
                              : `⚠ 未発注 ${p.none} 件`}
                        </div>
                        <div className="pcnt">納入済 {p.done} / {p.total}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <p className="note no-print">この物件で<b>使わない項目は「対象外」</b>にできます{canEdit ? '（各行の「対象外」ボタン）' : ''}。対象外を除いた<b>「未手配」＝発注忘れの候補</b>です。{!canEdit && '（対象外の設定は編集権限のみ）'}</p>

              {rec.sections.map(sec => (
                <section className="sec" key={sec.section}>
                  <h2>{sec.section}<span className="c">納入済 {sec.done} / 発注済 {sec.ordered} / 未手配 {sec.none}</span></h2>
                  {sec.groups.map(g => (
                    <div key={g.group}>
                      <div className="grp">▸ {g.group}</div>
                      {g.items.map((it) => (
                        <div className={`it ${it.status}`} key={it.key}>
                          <span className={`box ${it.status}`}>{it.status === 'done' ? '✓' : it.status === 'ordered' ? '▲' : ''}</span>
                          <span className="labi">{it.label}</span>
                          <span className={`st ${it.status}`}>
                            {it.status === 'done' ? '✓ 納入済み' : it.status === 'ordered' ? '▲ 発注済み' : it.status === 'na' ? '対象外' : '未手配'}
                            {it.info && <span className="sub">{it.info}</span>}
                          </span>
                          {canEdit && it.status === 'none' && <button className="exbtn no-print" disabled={exBusy} onClick={() => toggleEx(it.key, true)}>対象外</button>}
                          {canEdit && it.status === 'na' && <button className="exbtn undo no-print" disabled={exBusy} onClick={() => toggleEx(it.key, false)}>戻す</button>}
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

      {picker && (
        <ProjectPicker board={board} initial={chosen ?? board.filter(b => !b.allDelivered).map(b => b.name)}
          onClose={() => setPicker(false)} onSave={(l) => { saveChosen(l); setPicker(false); }} />
      )}
    </div>
  );
}

function Tile({ n, l, c }: { n: number | string; l: string; c: string }) {
  return <div className="tile"><div className="n" style={{ color: c }}>{n}</div><div className="tl">{l}</div></div>;
}

function ProjectPicker({ board, initial, onClose, onSave }: { board: BoardItem[]; initial: string[]; onClose: () => void; onSave: (l: string[]) => void }) {
  const [set, setSet] = useState<Set<string>>(new Set(initial));
  const toggle = (name: string) => setSet(s => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="mhead"><b>表示する物件を選ぶ</b><button onClick={onClose} className="x">×</button></div>
        <p className="mnote">チェックした物件だけを進捗一覧に表示します。完了した物件や、支給材だけ・応援分など不要な物件は外せます。</p>
        <div className="mrow"><button className="tbtn" onClick={() => setSet(new Set(board.filter(b => !b.allDelivered).map(b => b.name)))}>進行中のみ</button>
          <button className="tbtn" onClick={() => setSet(new Set(board.map(b => b.name)))}>すべて</button>
          <button className="tbtn" onClick={() => setSet(new Set())}>クリア</button></div>
        <div className="mlist">
          {board.map(b => (
            <label key={b.name} className="mitem">
              <input type="checkbox" checked={set.has(b.name)} onChange={() => toggle(b.name)} />
              <span className="mname">{b.name}</span>
              <span className={`mtag ${b.allDelivered ? 'done' : ''}`}>{b.allDelivered ? '完了' : `あと${b.pending}`}</span>
            </label>
          ))}
        </div>
        <button className="save" onClick={() => onSave([...set])}>この{set.size}件を表示する</button>
      </div>
    </div>
  );
}

const css = `
:root{--navy:#0d2c66;--bg:#eceff5;--surface:#fff;--surface-2:#f5f7fb;--line:#dce2ec;--ink:#16233b;--ink-2:#586a86;--ink-3:#8b99b0;--good:#15803d;--good-bg:#e5f4ea;--warn:#b45309;--warn-bg:#fbf0dd;--crit:#c2321f;--na:#9aa6ba;--na-bg:#eef1f6;--shadow:0 1px 2px rgba(16,35,59,.05),0 8px 22px rgba(16,35,59,.07);}
.pg{height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--bg);color:var(--ink);font-family:"Noto Sans JP","Hiragino Sans",system-ui,sans-serif;}
.pg>*{max-width:1360px;margin-left:auto;margin-right:auto;}
.pg{padding:16px clamp(12px,3vw,28px) 56px;}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.brand{width:34px;height:34px;border-radius:9px;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:800;flex-shrink:0;}
h1{font-size:1.3rem;margin:0;} .sub{font-size:.82rem;color:var(--ink-2);margin:2px 0 0;}
.back{margin-left:auto;font-size:.85rem;color:var(--navy);text-decoration:none;font-weight:700;}
.persp{display:flex;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:5px;box-shadow:var(--shadow);margin-bottom:14px;}
.persp button{flex:1;border:0;background:none;color:var(--ink-2);font:inherit;cursor:pointer;padding:10px 12px;border-radius:9px;text-align:left;}
.persp .t{font-weight:800;font-size:.95rem;display:block;} .persp .d{font-size:.72rem;color:var(--ink-3);}
.persp button[aria-pressed=true]{background:var(--navy);color:#fff;} .persp button[aria-pressed=true] .d{color:rgba(255,255,255,.8);}
.muted{color:var(--ink-3);font-size:.9rem;} .err{color:var(--crit);}
.toolbar,.gbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
.tbtn{font:inherit;font-size:.82rem;font-weight:700;color:var(--navy);background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 12px;cursor:pointer;box-shadow:var(--shadow);}
.hint{font-size:.76rem;color:var(--ink-3);margin-left:auto;}
.kgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start;}
.kcard{display:flex;gap:13px;align-items:center;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:14px;cursor:pointer;}
.kcard.ready{border-color:color-mix(in srgb,var(--good) 45%,var(--line));}
.kdate{flex-shrink:0;width:86px;text-align:center;border-radius:12px;padding:9px 6px;background:var(--surface-2);border:1px solid var(--line);}
.kdate .d2{font-size:1.35rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;} .kdate .m2{font-size:.68rem;color:var(--ink-2);margin-top:3px;}
.kdate.g{background:var(--good-bg);border-color:transparent;} .kdate.g .d2,.kdate.g .m2{color:var(--good);}
.kdate.b{background:#e7edfb;border-color:transparent;} .kdate.b .d2,.kdate.b .m2{color:var(--navy);}
.kdate.i{background:var(--na-bg);border-color:transparent;} .kdate.i .d2,.kdate.i .m2{color:var(--ink-3);}
.warn{font-size:.8rem;color:var(--warn);background:var(--warn-bg);border:1px solid color-mix(in srgb,var(--warn) 28%,transparent);border-radius:10px;padding:10px 13px;margin:0 0 12px;line-height:1.7;} .warn b{color:var(--ink);}
.kbody{min-width:0;} .kbody .p{font-size:1rem;font-weight:800;} .kbody .s{font-size:.79rem;color:var(--ink-2);margin-top:3px;}
.bar{height:7px;border-radius:999px;background:var(--na-bg);overflow:hidden;margin-top:8px;} .bar span{display:block;height:100%;border-radius:999px;} .fg{background:var(--good);} .fw{background:linear-gradient(90deg,var(--good),var(--warn));} .fb{background:var(--navy);}
.tag{display:inline-block;font-size:.72rem;font-weight:800;padding:3px 9px;border-radius:999px;margin-top:8px;}
.tg-g{color:var(--good);background:var(--good-bg);} .tg-w{color:var(--warn);background:var(--warn-bg);} .tg-i{color:var(--ink-2);background:var(--na-bg);} .tg-b{color:var(--navy);background:#e7edfb;}
.lb{font-size:.72rem;color:var(--ink-2);font-weight:700;}
#prjsel{font:inherit;font-size:.95rem;font-weight:700;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 12px;box-shadow:var(--shadow);max-width:100%;}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}
@media(max-width:560px){.tiles{grid-template-columns:repeat(2,1fr);}}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 13px;box-shadow:var(--shadow);}
.tile .n{font-size:1.4rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;} .tile .tl{font-size:.72rem;color:var(--ink-2);margin-top:2px;}
.note{font-size:.78rem;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin:0 0 14px;} .note b{color:var(--ink);}
.parts{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:13px 14px;margin-bottom:12px;}
.phead{font-size:.92rem;font-weight:800;margin-bottom:10px;} .psub{font-size:.73rem;font-weight:400;color:var(--ink-3);margin-left:8px;}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;}
.pcard{border:1px solid var(--line);border-radius:11px;padding:10px 11px;background:var(--surface-2);}
.pcard .pname{font-size:.8rem;font-weight:800;color:var(--ink-2);}
.pcard .pdate{font-size:1.3rem;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;}
.pcard .pmsg{font-size:.71rem;font-weight:700;margin-top:2px;} .pcard .pcnt{font-size:.7rem;color:var(--ink-3);margin-top:3px;}
.pcard.ready{background:var(--good-bg);border-color:transparent;} .pcard.ready .pdate,.pcard.ready .pmsg,.pcard.ready .pname{color:var(--good);}
.pcard.waiting{background:var(--warn-bg);border-color:transparent;} .pcard.waiting .pdate,.pcard.waiting .pmsg{color:var(--warn);}
.pcard.blocked{background:#fbe9e6;border-color:transparent;} .pcard.blocked .pdate,.pcard.blocked .pmsg{color:var(--crit);}
.sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:12px;}
.sec>h2{margin:0;font-size:.82rem;font-weight:800;letter-spacing:.1em;color:#fff;background:var(--navy);padding:9px 16px;display:flex;justify-content:space-between;align-items:center;}
.sec>h2 .c{font-size:.72rem;font-weight:700;opacity:.9;}
.grp{font-size:.72rem;font-weight:700;color:var(--ink-2);background:var(--surface-2);padding:5px 16px;border-top:1px solid var(--line);}
.it{display:grid;grid-template-columns:22px 1fr auto auto;gap:10px;align-items:center;padding:7px 16px;border-top:1px solid var(--line);}
.box{width:19px;height:19px;border-radius:5px;border:2px solid var(--na);display:grid;place-items:center;font-size:11px;font-weight:800;}
.box.done{background:var(--good);border-color:var(--good);color:#fff;} .box.ordered{border-color:var(--warn);color:var(--warn);} .box.n,.box.none,.box.na{border-color:var(--line);background:var(--na-bg);}
.labi{font-size:.88rem;font-weight:500;} .labi small{display:block;font-size:.72rem;color:var(--ink-3);}
.st{font-size:.76rem;font-weight:800;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;} .st .sub{display:block;font-size:.7rem;font-weight:400;color:var(--ink-3);}
.st.done{color:var(--good);} .st.ordered{color:var(--warn);} .st.none{color:var(--crit);} .st.na{color:var(--na);} .it.none .labi{color:var(--ink);} .it.na .labi{color:var(--na);text-decoration:line-through;text-decoration-thickness:1px;}
.exbtn{font:inherit;font-size:.7rem;font-weight:700;color:var(--na);background:var(--na-bg);border:1px solid var(--line);border-radius:7px;padding:3px 9px;cursor:pointer;white-space:nowrap;} .exbtn.undo{color:var(--navy);background:#e7edfb;} .exbtn:disabled{opacity:.5;}
.tiles.t5{grid-template-columns:repeat(5,1fr);} @media(max-width:720px){.tiles.t5{grid-template-columns:repeat(2,1fr);}}
.print-only{display:none;}
/* モーダル */
.modal{position:fixed;inset:0;background:rgba(10,18,32,.5);display:flex;align-items:flex-end;justify-content:center;z-index:50;}
@media(min-width:640px){.modal{align-items:center;}}
.sheet{background:var(--surface);width:100%;max-width:520px;max-height:88vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:16px;}
@media(min-width:640px){.sheet{border-radius:16px;}}
.mhead{display:flex;justify-content:space-between;align-items:center;} .mhead b{font-size:1rem;} .x{border:0;background:none;font-size:1.4rem;cursor:pointer;color:var(--ink-3);}
.mnote{font-size:.78rem;color:var(--ink-2);margin:4px 0 10px;}
.mrow{display:flex;gap:8px;margin-bottom:8px;}
.mlist{border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.mitem{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--line);font-size:.9rem;} .mitem:first-child{border-top:0;}
.mname{flex:1;} .mtag{font-size:.72rem;font-weight:700;color:var(--warn);background:var(--warn-bg);padding:2px 8px;border-radius:999px;} .mtag.done{color:var(--good);background:var(--good-bg);}
.save{margin-top:12px;width:100%;border:0;background:var(--navy);color:#fff;font:inherit;font-weight:800;padding:11px;border-radius:11px;cursor:pointer;}
@media print{
  /* グローバルの html,body{height:100%;overflow:hidden} を印刷時だけ解除し、全ページ出す */
  html,body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;}
  .no-print{display:none!important;} .print-only{display:block;}
  .pg{height:auto!important;max-height:none!important;overflow:visible!important;background:#fff;padding:0;}
  .pg>*{max-width:none;}
  .sec,.tile,.kcard{box-shadow:none;break-inside:avoid;}
  .it,.grp{break-inside:avoid;}
  .printtitle{font-size:1.1rem;font-weight:800;margin:0 0 10px;}
}
`;
