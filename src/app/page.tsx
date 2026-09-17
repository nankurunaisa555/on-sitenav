import OnSiteNav from "@/components/OnSiteNav";

export default function Home() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="mb-2 font-bold">セットアップが必要です</p>
          <p>
            環境変数 <code className="rounded bg-white px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            が設定されていません。<code className="rounded bg-white px-1">.env.example</code>{" "}
            を参考に設定してください。
          </p>
        </div>
      </main>
    );
  }

  return <OnSiteNav apiKey={apiKey} />;
}
