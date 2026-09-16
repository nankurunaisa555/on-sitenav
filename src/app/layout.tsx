import type { Metadata } from 'next';
import './globals.css'; // ← ★ここを有効にしました！

export const metadata: Metadata = {
  title: 'On-siteNav',
  description: 'Site Navigation App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
