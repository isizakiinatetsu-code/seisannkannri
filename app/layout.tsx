import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '納入管理システム',
  description: '材料入荷予定・納入管理システム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
