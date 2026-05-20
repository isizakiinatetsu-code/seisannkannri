'use client';
import { useState } from 'react';

export default function OcrTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    if (f && f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.path) {
        setResult(`✅ アップロード完了: ${data.filename}\n保存先: ${data.path}`);
      } else {
        setResult(`❌ エラー: ${data.error}`);
      }
    } catch {
      setResult('❌ アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      if (f.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(f));
      } else {
        setPreview(null);
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📸</span>
          <div>
            <h2 className="font-bold text-gray-800">OCR 納入伝票照合</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              納入伝票を撮影またはアップロードして登録できます。
              JPG / PNG / PDF 形式に対応。
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <label
          className="block border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {preview ? (
            <img src={preview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
          ) : (
            <div className="space-y-2">
              <div className="text-4xl">📄</div>
              <div className="text-sm text-gray-600 font-medium">タップして伝票を撮影・選択</div>
              <div className="text-xs text-gray-400">JPG / PNG / PDF 対応 ・ カメラ撮影もOK</div>
            </div>
          )}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,.webp"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {file && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-2">
            <span>📎</span>
            <span className="flex-1 truncate">{file.name}</span>
            <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}

        {result && (
          <div className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${result.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-40"
          style={{ background: '#1a2744' }}
        >
          {uploading ? '⏳ アップロード中...' : '📤 伝票をアップロード'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <h3 className="font-bold text-gray-700 mb-2">使い方</h3>
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>納入伝票を写真撮影またはスキャンしてください</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>上のエリアにファイルをドロップまたはタップして選択</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>「アップロード」ボタンで伝票を保存</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>各納入予定詳細からも伝票を添付できます</li>
        </ol>
      </div>
    </div>
  );
}
