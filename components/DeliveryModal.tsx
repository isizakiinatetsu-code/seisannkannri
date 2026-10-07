'use client';
import { useState, useEffect } from 'react';
import { Delivery, DeliverySlip } from '@/lib/supabase';
import { getCategoryColor } from '@/lib/constants';
import { processToScanStyle } from '@/lib/scanImage';
import { formatDateTimeJst } from '@/lib/format';

interface Props {
  delivery: Delivery;
  onClose: () => void;
  onMarkDelivered: (id: number) => void;
  onMarkPartial?: (id: number) => void;
  onRevertDelivered: (id: number) => void;
  onEdit: (delivery: Delivery) => void;
  onSlipUploaded: (id: number, path: string) => void;
  canEdit: boolean;
}

export default function DeliveryModal({
  delivery,
  onClose,
  onMarkDelivered,
  onMarkPartial,
  onRevertDelivered,
  onEdit,
  onSlipUploaded,
  canEdit,
}: Props) {
  const [slips, setSlips] = useState<DeliverySlip[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loadingSlips, setLoadingSlips] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [uploadingOrder, setUploadingOrder] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const color = getCategoryColor(delivery.item);
  // 発注書（工場の人が納入内容を確認するためのPDF）と納入伝票は同じ表に入っており、ファイル名の頭で区別する。
  const orders = slips.filter(isOrderFile);
  const receipts = slips.filter(sl => !isOrderFile(sl));

  useEffect(() => {
    fetch(`/api/deliveries/${delivery.id}/slips`, { cache: 'no-store' })
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
      setScanning(true);
      const processedFile = await processToScanStyle(file);
      setScanning(false);
      const fd = new FormData();
      fd.append('file', processedFile);
      const res = await fetch(`/api/deliveries/${delivery.id}/slips`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.id) {
        setSlips(prev => [...prev, data]);
        onSlipUploaded(delivery.id, data.slip_image_path);
      } else {
        alert(data.error ?? 'アップロードに失敗しました');
      }
    } catch {
      alert('アップロードに失敗しました。通信環境を確認するか、別の画像でお試しください。');
    } finally {
      setUploading(false);
      setScanning(false);
    }
  }

  async function handleOrderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!/\.pdf$/i.test(file.name)) { alert('発注書はPDFを選んでください'); return; }
    setUploadingOrder(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'order');
      const res = await fetch(`/api/deliveries/${delivery.id}/slips`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.id) setSlips(prev => [...prev, data]);
      else alert(data.error ?? 'アップロードに失敗しました');
    } catch {
      alert('アップロードに失敗しました。通信環境を確認してください。');
    } finally {
      setUploadingOrder(false);
    }
  }

  async function handleDownloadPdf() {
    // PDFの伝票は画像として埋め込めないので、画像の伝票だけをまとめる
    const images = receipts.filter(sl => !isPdfFile(sl));
    if (images.length === 0) { alert('画像の伝票がありません（PDFの伝票はそのまま開いて保存してください）'); return; }
    setGeneratingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      for (let i = 0; i < images.length; i++) {
        if (i > 0) doc.addPage();
        const slip = images[i];
        const dataUrl = await imageUrlToDataUrl(slip.slip_image_path);
        const { width, height } = await getImageSize(dataUrl);
        const margin = 10;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2 - 10;
        const ratio = Math.min(maxW / width, maxH / height);
        const w = width * ratio;
        const h = height * ratio;
        const x = (pageW - w) / 2;
        doc.setFontSize(11);
        doc.text(`${delivery.project_name} / ${delivery.item}（伝票 ${i + 1}/${images.length}）`, margin, 8);
        doc.addImage(dataUrl, 'JPEG', x, margin + 4, w, h);
      }

      doc.save(`納入伝票_${delivery.project_name}_${delivery.delivery_date}.pdf`);
    } catch (e) {
      console.error(e);
      alert('PDFの生成に失敗しました');
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleDeleteSlip(slipId: number, label = 'この伝票') {
    if (!confirm(`${label}を削除しますか？`)) return;
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
          {delivery.unloaded_by && (
            <Row label="荷下ろし者">
              <span className="text-gray-700">{delivery.unloaded_by}</span>
            </Row>
          )}
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
            <span className="flex items-center gap-2">
              <StatusBadge status={delivery.status} />
              {delivery.status !== '納入済み' && delivery.is_partial && (
                <span className="text-xs px-2 py-0.5 rounded-full text-white font-bold" style={{ background: '#dc2626' }}>
                  ⚠️ 一部納入（全納ではありません）
                </span>
              )}
            </span>
          </Row>
          {delivery.status === '納入済み' && delivery.delivered_at && (
            <Row label="納入確認時刻">
              <span className="text-sm text-gray-600">{formatDateTimeJst(delivery.delivered_at)}</span>
            </Row>
          )}
          <Row label="追加者">
            {delivery.created_by
              ? <span className="text-gray-700">🧑‍💼 {delivery.created_by}</span>
              : <span className="text-gray-400">未登録（「編集する」から設定できます）</span>}
          </Row>

          {/* 発注書（PDF）：工場の人が納入内容を把握するためのもの */}
          {(orders.length > 0 || canEdit) && !loadingSlips && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <div className="text-xs font-bold text-blue-900 mb-2">
                📄 発注書 {orders.length > 0 && `(${orders.length}件)`}
                <span className="font-normal text-blue-900/60 ml-1">納入内容の確認用</span>
              </div>
              {orders.length > 0 && (
                <div className="space-y-2 mb-2">
                  {orders.map((o, i) => (
                    <div key={o.id} className="bg-white border border-blue-100 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <span className="text-xl">📄</span>
                        <span className="flex-1 text-sm font-medium text-gray-800">発注書 {i + 1}</span>
                        <button
                          onClick={() => setPreviewId(previewId === o.id ? null : o.id)}
                          className="hidden md:inline-block text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                          {previewId === o.id ? '閉じる' : 'ここで見る'}
                        </button>
                        <a
                          href={o.slip_image_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                          style={{ background: '#0d2c66' }}
                        >
                          開く
                        </a>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteSlip(o.id, 'この発注書')}
                            className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                            title="削除"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {previewId === o.id && (
                        <iframe src={o.slip_image_path} title={`発注書 ${i + 1}`} className="w-full h-[60vh] border-t" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canEdit && (
                <label className="border-2 border-dashed border-blue-300 rounded-lg p-2.5 flex items-center justify-center gap-2 cursor-pointer hover:border-blue-500 bg-white transition-colors">
                  <span className="text-lg">{uploadingOrder ? '⏳' : '📎'}</span>
                  <span className="text-sm text-blue-900/80">
                    {uploadingOrder ? 'アップロード中...' : orders.length > 0 ? '発注書を追加 (PDF)' : '発注書を添付 (PDF)'}
                  </span>
                  <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleOrderUpload} disabled={uploadingOrder} />
                </label>
              )}
            </div>
          )}

          {/* Slip images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500 font-medium">
                納入伝票 {!loadingSlips && receipts.length > 0 && `(${receipts.length}枚)`}
              </div>
              {!loadingSlips && receipts.some(sl => !isPdfFile(sl)) && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={generatingPdf}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {generatingPdf ? '生成中...' : '📄 PDFで保存'}
                </button>
              )}
            </div>

            {loadingSlips ? (
              <div className="text-sm text-gray-400 text-center py-2">読み込み中...</div>
            ) : (
              <>
                {receipts.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {receipts.map((slip, i) => (
                      <div key={slip.id} className="relative border rounded-lg overflow-hidden">
                        <a href={slip.slip_image_path} target="_blank" rel="noopener noreferrer">
                          {isPdfFile(slip) ? (
                            <div className="flex items-center gap-2 px-3 py-4 bg-gray-50 text-sm text-gray-700">
                              <span className="text-2xl">📄</span>PDFの伝票（タップで開く）
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slip.slip_image_path}
                              alt={`納入伝票 ${i + 1}`}
                              className="w-full max-h-48 object-contain bg-gray-50"
                            />
                          )}
                        </a>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteSlip(slip.id)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                            title="削除"
                          >
                            ×
                          </button>
                        )}
                        <div className="text-xs text-gray-400 px-2 py-1 bg-gray-50">
                          伝票 {i + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canEdit && (
                  <label className="border-2 border-dashed border-gray-300 rounded-lg p-3 flex flex-col items-center gap-1 cursor-pointer hover:border-blue-400 transition-colors">
                    <span className="text-2xl">{uploading ? '⏳' : '📎'}</span>
                    <span className="text-sm text-gray-500">
                      {scanning ? 'スキャン処理中...' : uploading ? 'アップロード中...' : receipts.length > 0 ? '伝票を追加 (JPG/PNG/PDF)' : '伝票を添付 (JPG/PNG/PDF)'}
                    </span>
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" className="hidden" onChange={handleSlipUpload} disabled={uploading} />
                  </label>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2 border-t sticky bottom-0 bg-white">
          {canEdit && (
            delivery.status !== '納入済み' ? (
              <>
                <button
                  onClick={() => { onMarkDelivered(delivery.id); onClose(); }}
                  className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
                  style={{ background: '#16a34a' }}
                >
                  ✓ 納入済みにする（全納）
                </button>
                {onMarkPartial && !delivery.is_partial && (
                  <button
                    onClick={() => { onMarkPartial(delivery.id); onClose(); }}
                    className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
                    style={{ background: '#dc2626' }}
                  >
                    ⚠️ 一部納入にする（まだ全部届いていない）
                  </button>
                )}
                {onMarkPartial && delivery.is_partial && (
                  <button
                    onClick={() => { onRevertDelivered(delivery.id); onClose(); }}
                    className="w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 border-2"
                    style={{ borderColor: '#d97706', color: '#d97706' }}
                  >
                    ↩ 「一部納入」を解除して通常の予定に戻す
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => { if (confirm('納入済みを「予定」に戻しますか？')) { onRevertDelivered(delivery.id); onClose(); } }}
                className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2"
                style={{ background: '#d97706' }}
              >
                ↩ 予定に戻す
              </button>
            )
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
        </div>
      </div>
    </div>
  );
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('画像を読み込めませんでした')); // 無いと「生成中...」のまま止まる
    img.src = dataUrl;
  });
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

function isOrderFile(sl: DeliverySlip): boolean {
  return /\/order_[^/]*$/.test(sl.slip_image_path);
}
function isPdfFile(sl: DeliverySlip): boolean {
  return /\.pdf(\?|$)/i.test(sl.slip_image_path);
}
