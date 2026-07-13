'use client';
import { useEffect, useMemo, useState } from 'react';
import { UNLOAD_CONTACT_GROUPS } from '@/lib/constants';

interface Props {
  date: string;          // 対象日（今日）YYYY-MM-DD
  canEdit: boolean;
  onClose: () => void;
  onSaved: (contact: string | null) => void;
}

const MANUAL = '__manual__';

export default function ContactPanel({ date, canEdit, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [manual, setManual] = useState('');

  const rosterNames = useMemo(() => UNLOAD_CONTACT_GROUPS.flatMap(g => g.names), []);

  useEffect(() => {
    fetch(`/api/daily-contact?date=${date}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const c: string | null = d?.contact ?? null;
        setContact(c);
        if (c && rosterNames.includes(c)) { setSelected(c); setManual(''); }
        else if (c) { setSelected(MANUAL); setManual(c); }
        else { setSelected(''); setManual(''); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date, rosterNames]);

  const dispDate = date.slice(5).replace('-', '/');

  async function handleSave() {
    const value = selected === MANUAL ? manual.trim() : selected;
    setSaving(true);
    try {
      const res = await fetch('/api/daily-contact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, contact: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`保存できませんでした。${j.error ?? ''}`);
        return;
      }
      onSaved(value || null);
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
            <b>{dispDate}</b> に材料が入ってきたときの連絡先（担当者）です。
          </p>

          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : canEdit ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">担当者を選択</label>
                <select
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
                >
                  <option value="">（未設定）</option>
                  {UNLOAD_CONTACT_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.names.map(n => <option key={n} value={n}>{n}</option>)}
                    </optgroup>
                  ))}
                  <option value={MANUAL}>その他（手動入力）…</option>
                </select>
              </div>
              {selected === MANUAL && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">名前を入力</label>
                  <input
                    type="text"
                    value={manual}
                    onChange={e => setManual(e.target.value)}
                    placeholder="担当者名"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base outline-none"
                  />
                </div>
              )}
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
            <div className="py-4 text-center">
              <div className="text-xs text-gray-500 mb-1">本日の連絡先</div>
              <div className="text-2xl font-bold text-gray-800">{contact || '（未設定）'}</div>
              <p className="text-xs text-gray-400 mt-3">※変更は購買課・総務（編集用ログイン）のみ可能です。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
