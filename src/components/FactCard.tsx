export default function FactCard({ facts }: { facts: any }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 p-6 rounded-t-3xl shadow-2xl max-h-[45vh] overflow-y-auto">
      
      <section className="mb-6">
        <h2 className="text-xl font-bold text-blue-600 mb-3">生活・環境（周辺施設）</h2>
        <div className="space-y-2 text-lg leading-relaxed">
          {facts.places?.map((p: any) => (
            <p key={p.name}>
              {p.category}：{p.name}
            </p>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-green-600 mb-3">用途地域</h2>
        <p className="text-lg leading-relaxed">
          {facts.landuse?.用途地域 ?? "—"}
        </p>
      </section>

    </div>
  );
}
