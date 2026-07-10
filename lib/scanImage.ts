// 納入伝票の写真を「スキャンした書類」のように加工する（カラーのまま）。
// OpenCV.js で書類の四隅を自動検出し、切り抜き＋台形補正（パースぺクティブ変換）する。
// 白黒二値化はせず色を保持する。検出に失敗した場合は、カラーのまま軽く補正してフォールバックする。

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

interface OpenCVWindow extends Window {
  cv?: unknown;
}

let opencvPromise: Promise<unknown> | null = null;

// OpenCV.js を一度だけ読み込み、ランタイム準備完了を待つ。
function loadOpenCV(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as OpenCVWindow;
  if (w.cv && (w.cv as { Mat?: unknown }).Mat) return Promise.resolve(w.cv);
  if (opencvPromise) return opencvPromise;

  opencvPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]');
    const onReady = () => {
      const cv = (window as OpenCVWindow).cv as { onRuntimeInitialized?: () => void; Mat?: unknown } | undefined;
      if (!cv) { reject(new Error('opencv load failed')); return; }
      if (cv.Mat) { resolve(cv); return; }
      cv.onRuntimeInitialized = () => resolve(cv);
    };
    if (existing) { onReady(); return; }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.dataset.opencv = '1';
    script.onload = onReady;
    script.onerror = () => reject(new Error('opencv load failed'));
    document.body.appendChild(script);

    // 読み込みが極端に遅い場合のタイムアウト
    setTimeout(() => reject(new Error('opencv load timeout')), 20000);
  });
  return opencvPromise;
}

// 四隅の点を 左上・右上・右下・左下 の順に並べ替える。
function orderCorners(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = [...pts];
  // sum(x+y) 最小=左上, 最大=右下 / diff(x-y) 最小=左下(?), 最大=右上
  const bySum = [...sorted].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const byDiff = [...sorted].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  const bl = byDiff[0];
  const tr = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

// OpenCV を使い、書類を検出して切り抜き・台形補正・二値化した canvas を返す。失敗時は null。
// cv は OpenCV.js（型定義を持たないランタイムロードのモジュール）のため any で受ける。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scanWithOpenCV(cv: any, srcCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const mats: unknown[] = [];
  const track = <T,>(m: T): T => { mats.push(m); return m; };
  try {
    const src = track(cv.imread(srcCanvas));
    const gray = track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 縮小して輪郭検出（高速化・ノイズ低減）
    const maxDim = 1000;
    const scale = Math.min(1, maxDim / Math.max(src.cols, src.rows));
    const small = track(new cv.Mat());
    cv.resize(gray, small, new cv.Size(Math.round(gray.cols * scale), Math.round(gray.rows * scale)));

    const blur = track(new cv.Mat());
    cv.GaussianBlur(small, blur, new cv.Size(5, 5), 0);
    const edges = track(new cv.Mat());
    cv.Canny(blur, edges, 75, 200);
    const dilated = track(new cv.Mat());
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.dilate(edges, dilated, kernel);

    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = small.cols * small.rows;
    let bestQuad: { x: number; y: number }[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * 0.2) { cnt.delete(); continue; }
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && area > bestArea) {
        const quad: { x: number; y: number }[] = [];
        for (let j = 0; j < 4; j++) {
          quad.push({ x: approx.data32S[j * 2] / scale, y: approx.data32S[j * 2 + 1] / scale });
        }
        bestQuad = quad;
        bestArea = area;
      }
      approx.delete();
      cnt.delete();
    }

    if (!bestQuad) return null;

    const [tl, tr, br, bl] = orderCorners(bestQuad);
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const dstW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const dstH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
    if (dstW < 50 || dstH < 50) return null;

    const srcTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]));
    const dstTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstW, 0, dstW, dstH, 0, dstH]));
    const M = track(cv.getPerspectiveTransform(srcTri, dstTri));
    const warped = track(new cv.Mat());
    cv.warpPerspective(src, warped, M, new cv.Size(dstW, dstH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

    // カラーのまま出力する（切り抜き＋傾き補正のみ。白黒二値化はしない）。
    const out = document.createElement('canvas');
    cv.imshow(out, warped);
    return out;
  } catch (e) {
    console.error('OpenCV scan failed', e);
    return null;
  } finally {
    for (const m of mats) {
      try { (m as { delete?: () => void }).delete?.(); } catch { /* noop */ }
    }
  }
}

// フォールバック：カラーのまま、軽くコントラスト・明るさだけ整える（白黒化しない）。
function enhanceColor(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrast = 1.12;
  const brightness = 8;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      data[i + c] = Math.min(255, Math.max(0, (v - 128) * contrast + 128 + brightness));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, fallback: File): Promise<File> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(fallback); return; }
      resolve(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

export function processToScanStyle(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0);

      // まず OpenCV で書類検出＋切り抜き＋補正を試みる
      try {
        const cv = await loadOpenCV();
        const scanned = scanWithOpenCV(cv, canvas);
        if (scanned) {
          resolve(await canvasToFile(scanned, file.name, file));
          return;
        }
      } catch (e) {
        console.warn('OpenCV 利用不可、簡易加工にフォールバック', e);
      }

      // フォールバック：カラーのまま軽く補正
      enhanceColor(canvas);
      resolve(await canvasToFile(canvas, file.name, file));
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = url;
  });
}
