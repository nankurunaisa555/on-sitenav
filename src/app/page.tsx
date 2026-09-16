'use client';

import dynamic from 'next/dynamic';

// 相対パスで読み込み、ブラウザ側でのみ実行（SSRオフ）するように設定
const MapView = dynamic(() => import('../components/MapView'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 bg-gray-100">
      <header className="w-full max-w-5xl py-4 mb-2">
        <h1 className="text-2xl font-bold text-gray-800">On-siteNav</h1>
      </header>
      <div className="w-full max-w-5xl h-[80vh] bg-white rounded-lg shadow">
        <MapView />
      </div>
    </main>
  );
}
