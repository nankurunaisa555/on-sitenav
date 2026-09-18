"use client";

import type { ReactNode } from "react";
import type { CivicPlace, FactsResponse, HazardKey, LandformInfo, SchoolInfo, SectionStatus } from "@/lib/facts-types";
import type { RouteState, RouteTarget } from "@/hooks/useRoutes";
import { HAZARD_LAYER_MAP } from "@/lib/hazard-layers";
import { formatDistance, walkMinutes } from "@/lib/geo";
import type { LatLng, Place } from "@/lib/types";

const REINFOLIB_APPLY_URL = "https://www.reinfolib.mlit.go.jp/api/request/";

/** land = 土地・災害タブ, community = 学区・人口タブ */
export type FactsGroup = "land" | "community";

type Props = {
  group: FactsGroup;
  facts: FactsResponse | null;
  loading: boolean;
  error: string | null;
  places: Place[];
  /** 半径に関係なく見つけた最寄り駅（近い順） */
  nearestStations: Place[];
  enabledHazards: ReadonlySet<HazardKey>;
  onToggleHazard: (key: HazardKey) => void;
  crimeEnabled: boolean;
  onToggleCrime: () => void;
  /** ルートの出発点（基準点） */
  origin: LatLng | null;
  routes: ReadonlyMap<RouteTarget, RouteState>;
  onToggleRoute: (target: RouteTarget, label: string, destination: LatLng) => void;
};

export default function FactsPanel({
  group,
  facts,
  loading,
  error,
  places,
  nearestStations,
  enabledHazards,
  onToggleHazard,
  crimeEnabled,
  onToggleCrime,
  origin,
  routes,
  onToggleRoute,
}: Props) {
  // 最寄りバス停: 同名（上り/下り）はまとめて、近い順に2つ
  const nearestBuses: Place[] = [];
  for (const p of places) {
    if (p.category !== "bus") continue;
    const key = p.name.replace(/[（(].*?[）)]/g, "").replace(/\s.*$/, "").trim();
    if (nearestBuses.some((b) => b.name.replace(/[（(].*?[）)]/g, "").replace(/\s.*$/, "").trim() === key)) continue;
    nearestBuses.push(p);
    if (nearestBuses.length >= 2) break;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]">
      {error && <p className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!facts && loading && <p className="my-8 text-center text-sm text-gray-500">地点情報を取得中…</p>}
      {!facts && !loading && !error && (
        <p className="my-8 text-center text-sm text-gray-500">
          「このエリアを検索」を押すと、地図中心の地点情報を表示します
        </p>
      )}

      {facts && group === "land" && (
        <div className={`space-y-4 pb-4 ${loading ? "opacity-60" : ""}`}>
          {/* 災害リスク */}
          <Section title="災害リスク（この地点）" status={facts.hazard.status} source={facts.hazard.sourceUrl} sourceLabel="重ねるハザードマップ">
            <Row label="標高">
              {facts.elevation.elevationM !== null ? (
                <>
                  <Strong>{facts.elevation.elevationM.toFixed(1)}m</Strong>
                  {facts.elevation.source && (
                    <span className="ml-1 text-xs text-gray-500">
                      （{facts.elevation.source.replace(/[（）()]/g, "")}）
                    </span>
                  )}
                </>
              ) : (
                <Na />
              )}
            </Row>
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
            {facts.liquefaction.status === "ok" && (
              <Row label="液状化傾向">
                {facts.liquefaction.tendency ? (
                  <>
                    <Strong>{facts.liquefaction.tendency}</Strong>
                    {facts.liquefaction.landform && (
                      <span className="ml-1 text-xs text-gray-500">（{facts.liquefaction.landform}）</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-gray-400">対象外（データなし）</span>
                )}
              </Row>
            )}
          </Section>

          {/* 避難場所 */}
          <Section title="指定緊急避難場所（近い順）" status={facts.shelters.status}>
            {facts.shelters.shelters.length === 0 && (
              <p className="py-2 text-sm text-gray-400">近くに避難場所のデータがありません</p>
            )}
            {facts.shelters.shelters.map((s, i) => (
              <div key={s.id} className={i > 0 ? "mt-1 border-t border-gray-100 pt-1" : ""}>
                <Row label={`避難場所 ${i + 1}`}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="ml-2 text-gray-600">
                    {formatDistance(s.distanceM)}・徒歩{walkMinutes(s.distanceM)}分
                  </span>
                  {s.hazards.length > 0 && (
                    <span className="block text-xs text-gray-500">対応: {s.hazards.join("・")}</span>
                  )}
                </Row>
                <RouteButton
                  target={`shelter-${i}`}
                  label={s.name}
                  destination={s.location}
                  origin={origin}
                  routes={routes}
                  onToggleRoute={onToggleRoute}
                />
              </div>
            ))}
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              出典: 国土地理院「指定緊急避難場所データ」。災害種別ごとに指定が異なるため「対応」を確認してください。
            </p>
          </Section>

          {/* 地形分類 */}
          <Section
            title="地形分類・土地の成り立ち"
            status={facts.landform.status}
            source={facts.landform.sourceUrl}
            sourceLabel="地理院地図"
          >
            {facts.landform.natural ? (
              <LandformCard label="自然地形" info={facts.landform.natural} />
            ) : (
              <Row label="自然地形">
                <Na />
              </Row>
            )}
            {facts.landform.artificial && (
              <LandformCard label="人工地形（改変）" info={facts.landform.artificial} />
            )}
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              出典: 国土地理院「地形分類（自然地形・人工地形）」ベクトルタイル提供実験
            </p>
          </Section>

          {/* 犯罪発生 */}
          <Section
            title={`犯罪発生（窃盗7手口${facts.crime.year ? `・${facts.crime.year}年` : ""}）`}
            status={facts.crime.status}
            source={facts.crime.sourceUrl ?? undefined}
            sourceLabel={facts.crime.pref ? `${facts.crime.pref}警察` : undefined}
          >
            {!facts.crime.available ? (
              <p className="text-xs leading-relaxed text-gray-500">
                この地域の犯罪オープンデータは未整備です（現在は埼玉県のみ対応）。
                県警の犯罪発生マップは下の「その他の確認先」から開けます。
              </p>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">町丁目ごとの年間件数</span>
                  <button
                    type="button"
                    onClick={onToggleCrime}
                    aria-pressed={crimeEnabled}
                    className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                      crimeEnabled ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {crimeEnabled ? "地図に表示中" : "地図に表示"}
                  </button>
                </div>
                {facts.crime.around500m ? (
                  <CrimeRows
                    label={`周辺500m 合計（${facts.crime.around500m.townCount}町丁目）`}
                    total={facts.crime.around500m.total}
                    byType={facts.crime.around500m.byType}
                    emphasis
                  />
                ) : (
                  <Row label="周辺500m">
                    <span className="text-sm text-gray-400">発生記録なし</span>
                  </Row>
                )}
                {facts.crime.nearby.length > 0 && (
                  <div className="mt-1 border-t border-gray-100 pt-1">
                    <p className="pt-1 text-[11px] font-semibold text-gray-500">近くの町丁目（代表点までの距離）</p>
                    {facts.crime.nearby.map((t) => (
                      <CrimeRows
                        key={t.name}
                        label={`${t.name.replace(/^.*?[市区町村]\s/, "")}（${formatDistance(t.distanceM)}）`}
                        total={t.total}
                        byType={t.byType}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[11px] leading-snug text-gray-400">
                  ひったくり・車上ねらい・部品ねらい・自販機ねらい・自動車盗・オートバイ盗・自転車盗の認知件数。町丁目の代表点に集約した目安です。
                </p>
              </>
            )}
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

      {facts && group === "community" && (
        <div className={`space-y-4 pb-4 ${loading ? "opacity-60" : ""}`}>
          {/* 学区 */}
          <Section title="学区" status={facts.school.status}>
            <SchoolRow
              label="小学校"
              school={facts.school.elementary}
              target="elementary"
              origin={origin}
              routes={routes}
              onToggleRoute={onToggleRoute}
            />
            <SchoolRow
              label="中学校"
              school={facts.school.juniorHigh}
              target="juniorHigh"
              origin={origin}
              routes={routes}
              onToggleRoute={onToggleRoute}
            />
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              学区は国土数値情報（令和5年度）に基づく目安です。最新の指定は自治体にご確認ください。
            </p>
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
            {nearestStations.length === 0 && (
              <Row label="最寄り駅">
                <span className="text-sm text-gray-400">5km 以内に駅が見つかりません</span>
              </Row>
            )}
            {nearestStations.map((st, i) => (
              <div key={st.id} className={i > 0 ? "mt-1 border-t border-gray-100 pt-1" : ""}>
                <Row label={`最寄り駅 ${i + 1}`}>
                  <TransitValue place={st} />
                </Row>
                <RouteButton
                  target={`station-${i}`}
                  label={st.name}
                  destination={st.location}
                  origin={origin}
                  routes={routes}
                  onToggleRoute={onToggleRoute}
                />
              </div>
            ))}
            {nearestBuses.length === 0 && (
              <Row label="最寄りバス停">
                <span className="text-sm text-gray-400">半径内に見つかりません</span>
              </Row>
            )}
            {nearestBuses.map((b, i) => (
              <div key={b.id} className="mt-1 border-t border-gray-100 pt-1">
                <Row label={`最寄りバス停 ${i + 1}`}>
                  <TransitValue place={b} />
                </Row>
                <RouteButton
                  target={`bus-${i}`}
                  label={b.name}
                  destination={b.location}
                  origin={origin}
                  routes={routes}
                  onToggleRoute={onToggleRoute}
                />
              </div>
            ))}
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              始発・終電や時刻表は各駅・バス停の「時刻表」リンク（Google マップ）で確認できます。
            </p>
          </Section>

          {/* 公共施設（半径外でも最寄り） */}
          <Section title="役所・図書館（最寄り）" status={facts.civic.status}>
            {facts.civic.cityHall ? (
              <CivicRow
                label={facts.civic.cityHall.sameCity ? "役所（同じ市区町村）" : "役所（最寄り）"}
                place={facts.civic.cityHall}
                target="cityhall"
                origin={origin}
                routes={routes}
                onToggleRoute={onToggleRoute}
              />
            ) : (
              <Row label="役所">
                <Na />
              </Row>
            )}
            {facts.civic.libraries.map((lib, i) => (
              <CivicRow
                key={lib.id}
                label={`図書館 ${i + 1}`}
                place={lib}
                target={`library-${i}`}
                origin={origin}
                routes={routes}
                onToggleRoute={onToggleRoute}
              />
            ))}
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              出典: 国土数値情報「市区町村役場等」「図書館」。役所は基準点の市区町村（政令市は区）の本庁舎。
            </p>
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

function CrimeRows({
  label,
  total,
  byType,
  emphasis = false,
}: {
  label: string;
  total: number;
  byType: { type: string; count: number }[];
  emphasis?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`min-w-0 truncate text-sm ${emphasis ? "font-semibold text-gray-900" : "text-gray-700"}`}>{label}</span>
        <span className={`shrink-0 font-semibold text-gray-900 ${emphasis ? "text-base" : "text-sm"}`}>
          {total}件<span className="ml-0.5 text-xs font-normal text-gray-500">/年</span>
        </span>
      </div>
      {byType.length > 0 && (
        <p className="mt-0.5 text-xs text-gray-500">
          {byType.map((r) => `${r.type} ${r.count}`).join("・")}
        </p>
      )}
    </div>
  );
}

function LandformCard({ label, info }: { label: string; info: LandformInfo }) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-900"
        >
          <span
            className="h-3 w-3 rounded-sm border border-black/10"
            style={{ backgroundColor: info.color ?? "#e5e7eb" }}
          />
          {info.name}
        </span>
      </div>
      {info.origin && (
        <p className="text-xs leading-relaxed text-gray-700">
          <span className="font-semibold text-gray-500">成り立ち: </span>
          {info.origin}
        </p>
      )}
      {info.risk && (
        <p className="mt-1 text-xs leading-relaxed text-gray-700">
          <span className="font-semibold text-gray-500">リスク: </span>
          {info.risk}
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

function CivicRow({
  label,
  place,
  target,
  origin,
  routes,
  onToggleRoute,
}: {
  label: string;
  place: CivicPlace;
  target: RouteTarget;
  origin: LatLng | null;
  routes: ReadonlyMap<RouteTarget, RouteState>;
  onToggleRoute: (target: RouteTarget, label: string, destination: LatLng) => void;
}) {
  return (
    <div className="mt-1 border-t border-gray-100 pt-1 first:mt-0 first:border-t-0 first:pt-0">
      <Row label={label}>
        <span className="font-semibold">{place.name}</span>
        <span className="ml-2 text-gray-600">
          {formatDistance(place.distanceM)}・徒歩{walkMinutes(place.distanceM)}分
        </span>
        {place.address && <span className="block truncate text-xs text-gray-500">{place.address}</span>}
      </Row>
      <RouteButton
        target={target}
        label={place.name}
        destination={place.location}
        origin={origin}
        routes={routes}
        onToggleRoute={onToggleRoute}
      />
    </div>
  );
}

function SchoolRow({
  label,
  school,
  target,
  origin,
  routes,
  onToggleRoute,
}: {
  label: string;
  school: SchoolInfo | null;
  target: RouteTarget;
  origin: LatLng | null;
  routes: ReadonlyMap<RouteTarget, RouteState>;
  onToggleRoute: (target: RouteTarget, label: string, destination: LatLng) => void;
}) {
  return (
    <>
      <Row label={label}>
        {school ? (
          <>
            <Strong>{school.name}</Strong>
            {school.address && (
              <span className="block truncate text-xs text-gray-500">{school.address}</span>
            )}
          </>
        ) : (
          <Na />
        )}
      </Row>
      {school?.location && (
        <RouteButton
          target={target}
          label={school.name}
          destination={school.location}
          origin={origin}
          routes={routes}
          onToggleRoute={onToggleRoute}
        />
      )}
    </>
  );
}

/** 基準点からの徒歩ルートの ON/OFF と結果（道なり距離・時間） */
function RouteButton({
  target,
  label,
  destination,
  origin,
  routes,
  onToggleRoute,
}: {
  target: RouteTarget;
  label: string;
  destination: LatLng;
  origin: LatLng | null;
  routes: ReadonlyMap<RouteTarget, RouteState>;
  onToggleRoute: (target: RouteTarget, label: string, destination: LatLng) => void;
}) {
  const route = routes.get(target);
  const on = Boolean(route);
  const gmaps = origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=walking`
    : null;

  return (
    <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
      {route?.status === "ok" && route.distanceM !== undefined && route.durationS !== undefined && (
        <span className="text-sm font-semibold" style={{ color: route.color }}>
          徒歩{Math.max(1, Math.round(route.durationS / 60))}分・道なり{formatDistance(route.distanceM)}
        </span>
      )}
      {route?.status === "error" && <span className="text-xs text-red-600">{route.error}</span>}
      <button
        type="button"
        disabled={!origin}
        onClick={() => onToggleRoute(target, label, destination)}
        aria-pressed={on}
        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-40 ${
          on ? "border-transparent text-white" : "border-gray-200 text-gray-700"
        }`}
        style={on ? { backgroundColor: route?.color } : undefined}
      >
        {route?.status === "loading" ? "取得中…" : on ? "ルートを消す" : "ルートを表示"}
      </button>
      {gmaps && (
        <a
          href={gmaps}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-sky-700"
          aria-label={`${label}への徒歩ルートを Google マップで開く`}
        >
          Google マップ ↗
        </a>
      )}
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
