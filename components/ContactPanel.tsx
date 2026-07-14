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

// 保存値（JSON）をパースして { 出荷班, 生産管理, その他 } にする。旧形式(ただの文字列)にも耐える。
export function parseContact(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') return o as Record<string, string>;
  } catch { /* 旧: 単一文字列 */ }
  return { その他: raw };
}

// 表示用に「出:小野 生:石崎 他:山口」のように短くまとめる
export function formatContact(raw: string | null): string {
  const o = parseContact(raw);
  const parts = UNLOAD_CONTACT_GROUPS.map(g => o[g.group]).filter(Boolean);
  return parts.join('／');
}

export default function ContactPanel({ date, canEdit, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({}); // group -> name
  const [otherManual, setOtherManual] = useState('');

  useEffect(() => {
    fetch(`/api/daily-contact?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const o = parseContact(d?.contact ?? null);
        setValues(o);
        const otherNames = UNLOAD_CONTACT_GROUPS.find(g => g.group === OTHER_GROUP)?.names ?? [];
        if (o[OTHER_GROUP] && !otherNames.includes(o[OTHER_GROUP])) setOtherManual(o[OTHER_GROUP]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  const dispDate = date.slice(5).replace('-', '/');

  function setGroup(group: string, val: string) {
    setValues(v => ({ ...v, [group]: val }));
  }

  async function handleSave() {
    const out: Record<string, string> = {};
    for (const g of UNLOAD_CONTACT_GROUPS) {
      let v = values[g.group] ?? '';
      if (g.group === OTHER_GROUP && v === MANUAL) v = otherManual.trim();
      if (v && v !== MANUAL) out[g.group] = v;
    }
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
            <b>{dispDate}</b> に材料が入ってきたときの連絡先です。必要な分だけ選んでください。
          </p>

          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : canEdit ? (
            <>
              {UNLOAD_CONTACT_GROUPS.map(g => (
                <div key={g.group}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{g.group}</label>
                  <select
                    value={values[g.group] ?? ''}
                    onChange={e => setGroup(g.group, e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
                  >
                    <option value="">（未選択）</option>
                    {g.names.map(n => <option key={n} value={n}>{n}</option>)}
                    {g.group === OTHER_GROUP && <option value={MANUAL}>その他（手動入力）…</option>}
                  </select>
                  {g.group === OTHER_GROUP && values[OTHER_GROUP] === MANUAL && (
                    <input
                      type="text"
                      value={otherManual}
                      onChange={e => setOtherManual(e.target.value)}
                      placeholder="名前を入力"
                      className="mt-2 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
                    />
                  )}
                </div>
              ))}
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
                <div key={g.group} className="flex justify-between py-1.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">{g.group}</span>
                  <span className="text-sm font-bold text-gray-800">
                    {(values[g.group] === MANUAL ? otherManual : values[g.group]) || '（未設定）'}
                  </span>
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
