'use client';
import { useState, useEffect } from 'react';
import { Delivery, DeliverySlip } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';

interface Props {
  delivery: Delivery;
  onClose: () => void;
  onMarkDelivered: (id: number) => void;
  onRevertDelivered: (id: number) => void;
  onEdit: (delivery: Delivery) => void;
  onDelete: (id: number) => void;
  onSlipUploaded: (id: number, path: string) => void;
  canEdit: boolean;
}

export default function DeliveryModal({
  delivery,
  onClose,
  onMarkDelivered,
  onRevertDelivered,
  onEdit,
  onDelete,
  onSlipUploaded,
  canEdit,
}: Props) {
  const [slips, setSlips] = useState<DeliverySlip[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingSlips, setLoadingSlips] = useState(true);
  const color = getCategoryColor(delivery.item);

  useEffect(() => {
    fetch(`/api/deliveries/${delivery.id}/slips`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSlips(data); })
      .catch(() => {})
      .finally(() => setLoadingSlips(false));
  }, [delivery.id]);

  async function handleSlipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/deliveries/${delivery.id}/slips`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.id) {
        setSlips(prev => [...prev, data]);
        onSlipUploaded(delivery.id, data.slip_image_path);
      } else {
        alert(data.error ?? 'アップロードに失敗しました');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteSlip(slipId: number) {
    if (!confirm('この伝票を削除しますか？')) return;
    const res = await fetch(`/api/slips/${slipId}`, { method: 'DELETE' });
    if (res.ok) {
      setSlips(prev => prev.filter(s => s.id !== slipId));
    } else {
      alert('削除に失敗しました');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg animate-slide-up max-h-[92vh] md:max-h-[85vh] overflow-y-auto md:shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h2 className="font-bold text-gray-800">納入予定詳細</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <Row label="物件名">
            <span className="font-bold text-gray-900">{delivery.project_name}</span>
          </Row>
          <Row label="品目">
            <span
              className="px-2 py-0.5 rounded-full text-white text-sm font-medium"
              style={{ background: color }}
            >
              {delivery.item}
            </span>
          </Row>
          {delivery.specification && (
            <Row label="内容・規格">
              <span className="text-gray-700">{delivery.specification}</span>
            </Row>
          )}
          <Row label="業者名">
            <span className="text-gray-700">{delivery.vendor}</span>
          </Row>
          <Row label="降し場所">
            <span className="text-gray-700">{delivery.unload_location}</span>
          </Row>
          {delivery.storage_location && (
            <Row label="保管場所">
              <span className="text-gray-700">{delivery.storage_location}</span>
            </Row>
          )}
          <Row label="日程">
            <span className="flex items-center gap-1 text-gray-700">
              <span>📅</span>
              {delivery.delivery_date}
            </span>
          </Row>
          <Row label="時間帯">
            <span className="flex items-center gap-1 text-gray-700">
              <span>🕐</span>
              {delivery.delivery_time ?? '未定'}
            </span>
          </Row>
          {delivery.quantity && (
            <Row label="数量">
              <span className="text-gray-700">{delivery.quantity} {delivery.unit ?? ''}</span>
            </Row>
          )}
          {delivery.order_number && (
            <Row label="発注番号">
              <span className="text-gray-700 font-mono text-sm">{delivery.order_number}</span>
            </Row>
          )}
          {delivery.notes && (
            <Row label="備考">
              <span className="text-gray-700">{delivery.notes}</span>
            </Row>
          )}
          <Row label="ステータス">
            <StatusBadge status={delivery.status} />
          </Row>
          {delivery.status === '納入済み' && delivery.delivered_at && (
            <Row label="納入確認時刻">
              <span className="text-sm text-gray-600">{delivery.delivered_at}</span>
            </Row>
          )}

          {/* Slip images */}
          <div>
            <div className="text-xs text-gray-500 mb-2 font-medium">
              納入伝票 {!loadingSlips && slips.length > 0 && `(${slips.length}枚)`}
            </div>

            {loadingSlips ? (
              <div className="text-sm text-gray-400 text-center py-2">読み込み中...</div>
            ) : (
              <>
                {slips.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {slips.map((slip, i) => (
                      <div key={slip.id} className="relative border rounded-lg overflow-hidden">
                        <a href={slip.slip_image_path} target="_blank" rel="noopener noreferrer">
                          <img
                            src={slip.slip_image_path}
                            alt={`納入伝票 ${i + 1}`}
                            className="w-full max-h-48 object-contain bg-gray-50"
                          />
                        </a>
                        <button
                          onClick={() => handleDeleteSlip(slip.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                          title="削除"
                        >
                          ×
                        </button>
                        <div className="text-xs text-gray-400 px-2 py-1 bg-gray-50">
                          伝票 {i + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label className="border-2 border-dashed border-gray-300 rounded-lg p-3 flex flex-col items-center gap-1 cursor-pointer hover:border-blue-400 transition-colors">
                  <span className="text-2xl">{uploading ? '⏳' : '📎'}</span>
                  <span className="text-sm text-gray-500">
                    {uploading ? 'アップロード中...' : slips.length > 0 ? '伝票を追加 (JPG/PNG/PDF)' : '伝票を添付 (JPG/PNG/PDF)'}
                  </span>
                  <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" className="hidden" onChange={handleSlipUpload} disabled={uploading} />
                </label>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2 border-t sticky bottom-0 bg-white">
          {delivery.status !== '納入済み' ? (
            <button
              onClick={() => { onMarkDelivered(delivery.id); onClose(); }}
              className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
              style={{ background: '#16a34a' }}
            >
              ✓ 納入済みにする
            </button>
          ) : (
            <button
              onClick={() => { if (confirm('納入済みを「予定」に戻しますか？')) { onRevertDelivered(delivery.id); onClose(); } }}
              className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
              style={{ background: '#d97706' }}
            >
              ↩ 予定に戻す
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { onEdit(delivery); onClose(); }}
              className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
              style={{ background: '#2563eb' }}
            >
              ✏️ 編集する
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                if (confirm('この予定を削除しますか？')) {
                  onDelete(delivery.id);
                  onClose();
                }
              }}
              className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
              style={{ background: '#dc2626' }}
            >
              🗑️ 削除する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-sm text-gray-500 w-24 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === '納入済み' ? '#9ca3af' : '#d97706';
  return (
    <span className="px-2 py-0.5 rounded-full text-white text-sm font-medium" style={{ background: color }}>
      {status}
    </span>
  );
}
