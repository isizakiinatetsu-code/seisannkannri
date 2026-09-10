'use client';
import { useEffect, useRef, useState } from 'react';

interface FileRow { name: string; size: number | null; url: string }

const MAX_EDGE = 1800;
const QUALITY = 0.82;
const SKIP_UNDER = 400 * 1024; // これより小さい画像は圧縮しない

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Blob（画像）を長辺1800px・JPEG0.82に圧縮。PDFや圧縮しても小さくならないものは null。
function compressImage(blob: Blob, name: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (name.toLowerCase().endsWith('.pdf') || blob.type === 'application/pdf') { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const long = Math.max(img.width, img.height);
      const scale = long > MAX_EDGE ? MAX_EDGE / long : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b), 'image/jpeg', QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function SlipCompressPage() {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [errors, setErrors] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);

  useEffect(() => {
    fetch('/api/storage/slips/list', { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? 'list failed'); return r.json(); })
      .then(d => setFiles(d.files))
      .catch(e => setLoadError(String(e)));
  }, []);

  const totalBytes = files ? files.reduce((s, f) => s + (f.size ?? 0), 0) : 0;

  async function run(limit?: number) {
    if (!files || running) return;
    stopRef.current = false;
    setRunning(true);
    setDone(0); setSaved(0); setSkipped(0); setErrors(0); setLog([]);
    const target = typeof limit === 'number' ? files.slice(0, limit) : files;
    let localSaved = 0, localSkip = 0, localErr = 0;
    for (let i = 0; i < target.length; i++) {
      if (stopRef.current) { setLog(l => [`⏹ 中断しました（${i}/${target.length}）`, ...l]); break; }
      const f = target[i];
      try {
        const origRes = await fetch(f.url, { cache: 'no-store' });
        const origBlob = await origRes.blob();
        const origSize = f.size ?? origBlob.size;
        if (origSize < SKIP_UNDER) { localSkip++; setSkipped(localSkip); setDone(i + 1); continue; }
        const comp = await compressImage(origBlob, f.name);
        if (!comp || comp.size >= origSize * 0.95) { localSkip++; setSkipped(localSkip); setDone(i + 1); continue; }
        const fd = new FormData();
        fd.append('path', f.name);
        fd.append('file', new File([comp], f.name, { type: 'image/jpeg' }));
        const res = await fetch('/api/storage/slips/recompress', { method: 'POST', body: fd });
        if (!res.ok) throw new Error((await res.json()).error ?? 'recompress failed');
        localSaved += (origSize - comp.size);
        setSaved(localSaved);
        setLog(l => [`✓ ${f.name}: ${fmtMB(origSize)} → ${fmtMB(comp.size)}`, ...l].slice(0, 30));
      } catch (e) {
        localErr++; setErrors(localErr);
        setLog(l => [`⚠ ${f.name}: ${String(e).slice(0, 80)}`, ...l].slice(0, 30));
      }
      setDone(i + 1);
      await new Promise(r => setTimeout(r, 60)); // サーバー負荷をならす
    }
    setRunning(false);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d2c66' }}>伝票画像の一括圧縮（容量削減）</h1>
      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
        既存の伝票画像を<b>1枚も削除せず</b>、その場で軽い画像に置き換えます（表示・URLは変わりません）。
        Supabase Storage の空き容量を確保するためのツールです。まず<b>10枚でお試し</b>→問題なければ<b>全部</b>を実行してください。
      </p>

      {loadError && <p style={{ color: '#dc2626' }}>一覧の取得に失敗：{loadError}（編集権限でログインしているか確認してください）</p>}

      {files && (
        <div style={{ background: '#f6f8fb', border: '1px solid #dde3ec', borderRadius: 12, padding: 14, margin: '14px 0' }}>
          <div style={{ fontSize: 14 }}>対象ファイル：<b>{files.length}</b> 枚 ／ 現在の合計：<b>{fmtMB(totalBytes)}</b></div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 14, flexWrap: 'wrap' }}>
            <span>処理：<b>{done}</b>/{files.length}</span>
            <span style={{ color: '#16a34a' }}>削減：<b>{fmtMB(saved)}</b></span>
            <span style={{ color: '#64748b' }}>スキップ：{skipped}</span>
            <span style={{ color: '#dc2626' }}>エラー：{errors}</span>
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${files.length ? (done / files.length) * 100 : 0}%`, background: '#16a34a' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => run(10)} disabled={!files || running}
          style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #0d2c66', background: '#fff', color: '#0d2c66', fontWeight: 700, cursor: 'pointer' }}>
          まず10枚だけ試す
        </button>
        <button onClick={() => run()} disabled={!files || running}
          style={{ padding: '10px 16px', borderRadius: 10, border: 0, background: '#0d2c66', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: (!files || running) ? 0.5 : 1 }}>
          全部を圧縮する（{files?.length ?? 0}枚）
        </button>
        {running && (
          <button onClick={() => { stopRef.current = true; }}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>
            中断
          </button>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: '#475569', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      <p style={{ marginTop: 18, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
        ※ ブラウザで縮小し、サーバー経由で同じ場所へ入れ直します。処理中はこのタブを開いたままにしてください。
        伝票はGoogle Driveにもバックアップがあります。終わったら Supabase の Storage 使用量が下がっているか確認してください。
      </p>
    </div>
  );
}
