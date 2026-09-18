"use client";

import type { ReactNode } from "react";
import type { FactsResponse, HazardKey, SectionStatus } from "@/lib/facts-types";
import { HAZARD_LAYER_MAP } from "@/lib/hazard-layers";
import { formatDistance, walkMinutes } from "@/lib/geo";
import type { Place } from "@/lib/types";

const REINFOLIB_APPLY_URL = "https://www.reinfolib.mlit.go.jp/api/request/";

type Props = {
  facts: FactsResponse | null;
  loading: boolean;
  error: string | null;
  places: Place[];
  enabledHazards: ReadonlySet<HazardKey>;
  onToggleHazard: (key: HazardKey) => void;
};

export default function FactsPanel({
  facts,
  loading,
  error,
  places,
  enabledHazards,
  onToggleHazard,
}: Props) {
  const nearestStation = places.find((p) => p.category === "station") ?? null;
  const nearestBus = places.find((p) => p.category === "bus") ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]">
      {error && <p className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!facts && loading && <p className="my-8 text-center text-sm text-gray-500">地点情報を取得中…</p>}
      {!facts && !loading && !error && (
        <p className="my-8 text-center text-sm text-gray-500">
          「このエリアを検索」を押すと、地図中心の地点情報を表示します
        </p>
      )}

      {facts && (
        <div className={`space-y-4 pb-4 ${loading ? "opacity-60" : ""}`}>
          {/* 災害リスク */}
          <Section title="災害リスク（この地点）" status={facts.hazard.status} source={facts.hazard.sourceUrl} sourceLabel="重ねるハザードマップ">
            <ul className="divide-y divide-gray-100">
              {facts.hazard.items.map((h) => {
                const def = HAZARD_LAYER_MAP.get(h.key);
                const on = enabledHazards.has(h.key);
                return (
                  <li key={h.key} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 text-sm font-medium text-gray-700">{h.label}</span>
                    <span className="min-w-0 flex-1">
                      {h.level ? (
                        <span
                          className="inline-block rounded-md px-2 py-0.5 text-sm font-semibold text-white"
                          style={{ backgroundColor: def?.color ?? "#374151" }}
                        >
                          {h.level}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">該当なし</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleHazard(h.key)}
                      aria-pressed={on}
                      className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                        on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {on ? "地図に表示中" : "地図に表示"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* 地震 */}
          <Section title="地震の揺れやすさ" status={facts.quake.status} source={facts.quake.sourceUrl} sourceLabel="J-SHIS（防災科研）">
            <Row label="30年以内に震度6弱以上">
              {facts.quake.p30Int55 !== null ? <Strong>{percent(facts.quake.p30Int55)}</Strong> : <Na />}
            </Row>
            <Row label="30年以内に震度5強以上">
              {facts.quake.p30Int50 !== null ? <Strong>{percent(facts.quake.p30Int50)}</Strong> : <Na />}
            </Row>
            <Row label="表層地盤増幅率">
              {facts.quake.arv !== null ? (
                <>
                  <Strong>{facts.quake.arv.toFixed(2)}</Strong>
                  <span className="ml-2 text-xs text-gray-500">{arvLabel(facts.quake.arv)}</span>
                </>
              ) : (
                <Na />
              )}
            </Row>
            <Row label="微地形区分">{facts.quake.landform ?? <Na />}</Row>
          </Section>

          {/* 都市計画 */}
          <Section title="用途地域・高さ制限" status={facts.zoning.status}>
            <Row label="用途地域">{facts.zoning.useArea ? <Strong>{facts.zoning.useArea}</Strong> : <Na />}</Row>
            <Row label="建蔽率 / 容積率">
              {facts.zoning.buildingCoverageRatio || facts.zoning.floorAreaRatio ? (
                <Strong>
                  {facts.zoning.buildingCoverageRatio ?? "—"}% / {facts.zoning.floorAreaRatio ?? "—"}%
                </Strong>
              ) : (
                <Na />
              )}
            </Row>
            <Row label="防火・準防火">{facts.zoning.fireZone ?? <span className="text-sm text-gray-400">指定なし</span>}</Row>
            {facts.zoning.heightNote && (
              <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs leading-relaxed text-gray-600">
                高さ制限の目安: {facts.zoning.heightNote}
              </p>
            )}
          </Section>

          {/* 学区 */}
          <Section title="学区" status={facts.school.status}>
            <Row label="小学校">{facts.school.elementary ? <Strong>{facts.school.elementary}</Strong> : <Na />}</Row>
            <Row label="中学校">{facts.school.juniorHigh ? <Strong>{facts.school.juniorHigh}</Strong> : <Na />}</Row>
          </Section>

          {/* 人口 */}
          <Section title="人口（250mメッシュ将来推計）" status={facts.population.status}>
            {facts.population.around500m ? (
              <PopulationRows
                label="周辺500m"
                y2020={facts.population.around500m.y2020}
                y2030={facts.population.around500m.y2030}
                y2050={facts.population.around500m.y2050}
              />
            ) : (
              <Row label="周辺500m">
                <Na />
              </Row>
            )}
            {facts.population.mesh && (
              <PopulationRows
                label="この地点のメッシュ"
                y2020={facts.population.mesh.y2020}
                y2030={facts.population.mesh.y2030}
                y2050={facts.population.mesh.y2050}
              />
            )}
          </Section>

          {/* 交通 */}
          <Section title="交通" status="ok">
            <Row label="最寄り駅">
              {nearestStation ? (
                <TransitValue place={nearestStation} />
              ) : (
                <span className="text-sm text-gray-400">半径内に見つかりません</span>
              )}
            </Row>
            <Row label="最寄りバス停">
              {nearestBus ? (
                <TransitValue place={nearestBus} />
              ) : (
                <span className="text-sm text-gray-400">半径内に見つかりません</span>
              )}
            </Row>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              始発・終電や時刻表は各駅・バス停の「時刻表」リンク（Google マップ）で確認できます。
            </p>
          </Section>

          {/* 外部リンク */}
          <Section title="その他の確認先" status="ok">
            <ul className="space-y-1">
              {facts.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-sky-700 underline underline-offset-2"
                  >
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

// ---------- 小さな部品 ----------

function Section({
  title,
  status,
  source,
  sourceLabel,
  children,
}: {
  title: string;
  status: SectionStatus;
  source?: string;
  sourceLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-100 p-3">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {source && (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] text-sky-700 underline underline-offset-2"
          >
            {sourceLabel ?? "出典"} ↗
          </a>
        )}
      </header>
      {status === "unavailable" ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-800">
          国土交通省「不動産情報ライブラリ」の API キーが未設定のため表示できません。
          <a href={REINFOLIB_APPLY_URL} target="_blank" rel="noopener noreferrer" className="ml-1 underline">
            API 利用申請 ↗
          </a>
          （無料）後、環境変数 <code className="rounded bg-white px-1">REINFOLIB_API_KEY</code> を設定してください。
        </p>
      ) : status === "error" ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">データ元に接続できませんでした</p>
      ) : (
        children
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sm text-gray-600">{label}</span>
      <span className="min-w-0 text-right text-sm text-gray-900">{children}</span>
    </div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold">{children}</span>;
}

function Na() {
  return <span className="text-sm text-gray-400">データなし</span>;
}

function percent(p: number): string {
  const v = p * 100;
  return v >= 10 ? `${v.toFixed(0)}%` : v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`;
}

/** 表層地盤増幅率の目安（J-SHIS の凡例区分に沿う） */
function arvLabel(arv: number): string {
  if (arv < 1.0) return "揺れにくい";
  if (arv < 1.4) return "標準的";
  if (arv < 1.6) return "やや揺れやすい";
  if (arv < 2.0) return "揺れやすい";
  return "非常に揺れやすい";
}

function PopulationRows({
  label,
  y2020,
  y2030,
  y2050,
}: {
  label: string;
  y2020: number;
  y2030: number;
  y2050: number;
}) {
  const rate = y2020 > 0 ? ((y2030 - y2020) / y2020) * 100 : null;
  return (
    <div className="py-1.5">
      <p className="mb-1 text-xs font-semibold text-gray-500">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="2020年" value={y2020.toLocaleString("ja-JP")} />
        <Stat label="2030年" value={y2030.toLocaleString("ja-JP")} />
        <Stat label="2050年" value={y2050.toLocaleString("ja-JP")} />
      </div>
      {rate !== null && (
        <p className="mt-1 text-right text-xs text-gray-600">
          2020→2030 増減率 <span className={`font-semibold ${rate < 0 ? "text-red-600" : "text-emerald-700"}`}>{rate > 0 ? "+" : ""}{rate.toFixed(1)}%</span>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 py-1.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-gray-900">{value}人</p>
    </div>
  );
}

function TransitValue({ place }: { place: Place }) {
  return (
    <>
      <span className="font-semibold">{place.name}</span>
      <span className="ml-2 text-gray-600">
        {formatDistance(place.distanceM)}・徒歩{walkMinutes(place.distanceM)}分
      </span>
    </>
  );
}
