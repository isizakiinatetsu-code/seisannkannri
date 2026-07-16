'use client';
import { useEffect, useState } from 'react';
import { UNLOAD_CONTACT_GROUPS } from '@/lib/constants';

interface Props {
  date: string;          // 対象日（今日）YYYY-MM-DD
  canEdit: boolean;
  onClose: () => void;
  onSaved: (contact: string | null) => void;
}

const MANUAL = '__manual__';
const OTHER_GROUP = 'その他';

// 各グループの保存値：終日1人なら文字列、午前/午後で分けるなら {am, pm}
type ContactVal = string | { am?: string; pm?: string };

// 保存値(JSON)をパースして { 出荷班, 生産管理, その他 } にする。旧形式(ただの文字列)にも耐える。
export function parseContact(raw: string | null): Record<string, ContactVal> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') return o as Record<string, ContactVal>;
  } catch { /* 旧: 単一文字列 */ }
  return { その他: raw };
}

// 表示用に「出:小野 生:石崎」のように短くまとめる（午前午後が違えば「午前→午後」）
export function formatContact(raw: string | null): string {
  const o = parseContact(raw);
  const parts: string[] = [];
  for (const g of UNLOAD_CONTACT_GROUPS) {
    const v = o[g.group];
    if (!v) continue;
    if (typeof v === 'string') {
      if (v) parts.push(v);
    } else {
      const am = v.am ?? '';
      const pm = v.pm ?? '';
      if (am && pm) parts.push(am === pm ? am : `${am}→${pm}`);
      else if (am) parts.push(`午前${am}`);
      else if (pm) parts.push(`午後${pm}`);
    }
  }
  return parts.join('／');
}

// 表示用（詳細）：グループごとの1行分の文字列
function describeVal(v: ContactVal | undefined): string {
  if (!v) return '（未設定）';
  if (typeof v === 'string') return v || '（未設定）';
  const am = v.am ?? '';
  const pm = v.pm ?? '';
  if (!am && !pm) return '（未設定）';
  if (am && pm && am === pm) return am;
  return `午前：${am || '—'} ／ 午後：${pm || '—'}`;
}

export default function ContactPanel({ date, canEdit, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // key = `${group}|${slot}` (slot: all | am | pm) → 選択値（名前 or MANUAL）
  const [sel, setSel] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({}); // その他の手動入力
  const [split, setSplit] = useState<Record<string, boolean>>({});   // グループごと 午前/午後で分けるか
  const [loaded, setLoaded] = useState<Record<string, ContactVal>>({});
  const [memoByGroup, setMemoByGroup] = useState<Record<string, string>>({}); // 部署ごとの備考

  useEffect(() => {
    fetch(`/api/daily-contact?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const o = parseContact(d?.contact ?? null);
        setLoaded(o);
        const nextSel: Record<string, string> = {};
        const nextManual: Record<string, string> = {};
        const nextSplit: Record<string, boolean> = {};
        for (const g of UNLOAD_CONTACT_GROUPS) {
          const v = o[g.group];
          const isOther = g.group === OTHER_GROUP;
          const put = (slot: string, name: string) => {
            const key = `${g.group}|${slot}`;
            if (isOther && name && !g.names.includes(name)) {
              nextSel[key] = MANUAL; nextManual[key] = name;
            } else {
              nextSel[key] = name;
            }
          };
          if (typeof v === 'string') {
            nextSplit[g.group] = false;
            if (v) put('all', v);
          } else if (v && typeof v === 'object') {
            nextSplit[g.group] = true;
            if (v.am) put('am', v.am);
            if (v.pm) put('pm', v.pm);
          } else {
            nextSplit[g.group] = false;
          }
        }
        setSel(nextSel); setManual(nextManual); setSplit(nextSplit);
        // 備考は部署ごと（旧: 単一文字列だった場合は「その他」に寄せる）
        const rawMemo = o['備考'] as unknown;
        const nextMemo: Record<string, string> = {};
        if (rawMemo && typeof rawMemo === 'object') {
          for (const g of UNLOAD_CONTACT_GROUPS) {
            const m = (rawMemo as Record<string, unknown>)[g.group];
            if (typeof m === 'string' && m) nextMemo[g.group] = m;
          }
        } else if (typeof rawMemo === 'string' && rawMemo) {
          nextMemo[OTHER_GROUP] = rawMemo;
        }
        setMemoByGroup(nextMemo);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  const dispDate = date.slice(5).replace('-', '/');

  const setSlot = (group: string, slot: string, val: string) =>
    setSel(s => ({ ...s, [`${group}|${slot}`]: val }));
  const setManualVal = (group: string, slot: string, val: string) =>
    setManual(m => ({ ...m, [`${group}|${slot}`]: val }));

  // 選択値を解決（MANUAL なら手動入力の中身）
  function resolve(group: string, slot: string): string {
    const key = `${group}|${slot}`;
    const v = sel[key] ?? '';
    if (v === MANUAL) return (manual[key] ?? '').trim();
    return v;
  }

  async function handleSave() {
    const out: Record<string, ContactVal> = {};
    for (const g of UNLOAD_CONTACT_GROUPS) {
      if (split[g.group]) {
        const am = resolve(g.group, 'am');
        const pm = resolve(g.group, 'pm');
        if (am || pm) out[g.group] = { am: am || undefined, pm: pm || undefined };
      } else {
        const all = resolve(g.group, 'all');
        if (all) out[g.group] = all;
      }
    }
    const memoObj: Record<string, string> = {};
    for (const g of UNLOAD_CONTACT_GROUPS) {
      const m = (memoByGroup[g.group] ?? '').trim();
      if (m) memoObj[g.group] = m;
    }
    if (Object.keys(memoObj).length) (out as Record<string, unknown>)['備考'] = memoObj;
    setSaving(true);
    try {
      const res = await fetch('/api/daily-contact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, contact: JSON.stringify(out) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`保存できませんでした。${j.error ?? ''}`);
        return;
      }
      onSaved(Object.keys(out).length ? JSON.stringify(out) : null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // 1つのプルダウン（＋その他の手動入力）
  function SlotSelect({ group, slot, names, isOther }: { group: string; slot: string; names: readonly string[]; isOther: boolean }) {
    const key = `${group}|${slot}`;
    return (
      <div className="flex-1">
        <select
          value={sel[key] ?? ''}
          onChange={e => setSlot(group, slot, e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
        >
          <option value="">（未選択）</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
          {isOther && <option value={MANUAL}>その他（手動入力）…</option>}
        </select>
        {isOther && sel[key] === MANUAL && (
          <input
            type="text"
            value={manual[key] ?? ''}
            onChange={e => setManualVal(group, slot, e.target.value)}
            placeholder="名前を入力"
            className="mt-2 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto md:shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">📞 荷下ろし連絡先</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl font-bold">×</button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            <b>{dispDate}</b> に材料が入ってきたときの連絡先です。必要な分だけ選んでください。<br />
            午前と午後で担当が違う場合は「午前/午後で分ける」をオンにして2人選べます。
          </p>

          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : canEdit ? (
            <>
              {UNLOAD_CONTACT_GROUPS.map(g => {
                const isOther = g.group === OTHER_GROUP;
                const isSplit = !!split[g.group];
                return (
                  <div key={g.group} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-gray-700">{g.group}</label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSplit}
                          onChange={e => setSplit(s => ({ ...s, [g.group]: e.target.checked }))}
                        />
                        午前/午後で分ける
                      </label>
                    </div>
                    {isSplit ? (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">午前</div>
                          <SlotSelect group={g.group} slot="am" names={g.names} isOther={isOther} />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">午後</div>
                          <SlotSelect group={g.group} slot="pm" names={g.names} isOther={isOther} />
                        </div>
                      </div>
                    ) : (
                      <SlotSelect group={g.group} slot="all" names={g.names} isOther={isOther} />
                    )}
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">備考</div>
                      <textarea
                        value={memoByGroup[g.group] ?? ''}
                        onChange={e => setMemoByGroup(m => ({ ...m, [g.group]: e.target.value }))}
                        rows={2}
                        placeholder="連絡事項・注意点など（任意）"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none resize-y"
                      />
                    </div>
                  </div>
                );
              })}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 rounded-xl text-white font-bold text-base"
                style={{ background: '#0d2c66' }}
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </>
          ) : (
            <div className="py-2">
              <div className="text-xs text-gray-500 mb-2 text-center">本日の連絡先</div>
              {UNLOAD_CONTACT_GROUPS.map(g => (
                <div key={g.group} className="py-1.5 border-b border-gray-100">
                  <div className="flex justify-between gap-3">
                    <span className="text-sm text-gray-600 flex-shrink-0">{g.group}</span>
                    <span className="text-sm font-bold text-gray-800 text-right">
                      {describeVal(loaded[g.group])}
                    </span>
                  </div>
                  {memoByGroup[g.group] && (
                    <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">備考：{memoByGroup[g.group]}</div>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-400 mt-3 text-center">※変更は購買課・総務（編集用ログイン）のみ可能です。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
