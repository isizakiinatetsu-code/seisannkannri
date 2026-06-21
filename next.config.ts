import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    // iOSのホーム画面追加(standalone PWA)は通常のSafariタブと別のキャッシュを持ち、
    // HTMLドキュメント自体を古いまま保持し続けることがあるため、ページ本体だけは
    // 常に再検証させる（_next/staticのハッシュ付き静的アセットは対象外のまま長期
    // キャッシュを維持し、パフォーマンスへの影響を避ける）。
    return [
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/login',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
