'use client';
import { useState } from 'react';
import { Delivery } from '@/lib/supabase';
import { ITEM_CATEGORIES } from '@/lib/constants';

const LOCATIONS = [
  '第1工場', '第2工場南（表）', '第2工場北（裏）', '第3工場', '第4工場',
  '第3工場（宅急便）', '事務所', '事務所前',
];

const TIME_OPTIONS = [
  '午前中', '午後', '9:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
];

interface Props {
  initial?: Partial<Delivery>;
  defaultDate?: string;
  onSave: (data: Partial<Delivery>) => void;
  onCancel: () => void;
  vendors?: string[];
  projects?: string[];
}

export default function DeliveryForm({ initial, defaultDate, onSave, onCancel, vendors = [], projects = [] }: Props) {
  const [form, setForm] = useState({
    delivery_date: initial?.delivery_date ?? defaultDate ?? new Date().toISOString().split('T')[0],
    delivery_time: initial?.delivery_time ?? '',
    project_name: initial?.project_name ?? '',
    item: initial?.item ?? '',
    specification: initial?.specification ?? '',
    vendor: initial?.vendor ?? '',
    is_postal: (initial?.notes?.startsWith('[配送]') || initial?.notes?.startsWith('[郵送]')) ?? false,
    unload_location: initial?.unload_location ?? '',
    storage_location: initial?.storage_location ?? '',
    quantity: initial?.quantity?.toString() ?? '',
    unit: initial?.unit ?? '',
    order_number: initial?.order_number ?? '',
    notes: (initial?.notes?.startsWith('[配送] ') || initial?.notes?.startsWith('[郵送] ')) ? initial.notes.slice(5) : (initial?.notes ?? ''),
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const setPostal = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, is_postal: e.target.checked }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.delivery_date || !form.project_name || !form.item || !form.vendor || !form.unload_location) {
      alert('★必須項目をすべて入力してください');
      return;
    }
    const notesValue = form.is_postal
      ? `[配送] ${form.notes}`.trimEnd()
      : form.notes || null;
    onSave({
      delivery_date: form.delivery_date,
      delivery_time: form.delivery_time || null,
      project_name: form.project_name,
      item: form.item,
      specification: form.specification || null,
      vendor: form.vendor,
      unload_location: form.unload_location,
      storage_location: form.storage_location || null,
      quantity: form.quantity ? parseFloat(form.quantity) : null,
      unit: form.unit || null,
      order_number: form.order_number || null,
      notes: notesValue,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg animate-slide-up max-h-[95vh] md:max-h-[90vh] flex flex-col md:shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-gray-800 text-lg">
            {initial?.id ? '✏️ 予定を編集' : '➕ 納入予定を追加'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl font-bold">×</button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 space-y-3 flex-1">
          <FormRow label="★ 納入予定日">
            <input type="date" value={form.delivery_date} onChange={set('delivery_date')} required className="input" />
          </FormRow>

          <FormRow label="　 納入予定時刻">
            <select value={form.delivery_time} onChange={set('delivery_time')} className="input">
              <option value="">未定</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormRow>

          <FormRow label="★ 物件名">
            <input list="project-list" type="text" value={form.project_name} onChange={set('project_name')} placeholder="物件名を入力または選択" required className="input" />
            <datalist id="project-list">
              {projects.map(p => <option key={p} value={p} />)}
            </datalist>
          </FormRow>

          <FormRow label="★ 品目">
            <select value={form.item} onChange={set('item')} required className="input">
              <option value="">品目を選択...</option>
              {ITEM_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="★ 内容・規格">
            <input type="text" value={form.specification} onChange={set('specification')} placeholder="H-500x200 等" className="input" />
          </FormRow>

          <FormRow label="★ 業者名">
            <select value={form.vendor} onChange={set('vendor')} required className="input">
              <option value="">業者名を選択...</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              <option value="その他">その他</option>
            </select>
          </FormRow>

          <div className="flex items-center gap-3 py-2">
            <label className="text-xs font-medium text-gray-600">配送</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.is_postal} onChange={setPostal} className="sr-only peer" />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          <FormRow label="★ 降し場所">
            <select value={form.unload_location} onChange={set('unload_location')} required className="input">
              <option value="">場所を選択...</option>
              {LOCATIONS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
              <option value="その他">その他</option>
            </select>
          </FormRow>
        </form>

        <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-white">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold">
            キャンセル
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl text-white font-bold"
            style={{ background: '#0d2c66' }}
          >
            {initial?.id ? '更新する' : '登録する'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: #2f8fcf;
          box-shadow: 0 0 0 2px rgba(59, 111, 212, 0.15);
        }
      `}</style>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
