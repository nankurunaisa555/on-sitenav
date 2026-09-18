"use client";

import { useState } from "react";
import type { LandPriceSection, RentStats, Trade, TradesResponse } from "@/lib/facts-types";
import { formatDistance } from "@/lib/geo";

type Props = {
  landPrice: LandPriceSection | null;
  factsLoading: boolean;
  trades: TradesResponse | null;
  tradesLoading: boolean;
  tradesError: string | null;
  hasSearch: boolean;
};

const TSUBO_SQM = 3.30579;
const REINFOLIB_URL = "https://www.reinfolib.mlit.go.jp/";

/** 「価格」タブ: 地価公示・地価調査と、町名単位の取引事例 */
export default function PricePanel({ landPrice, factsLoading, trades, tradesLoading, tradesError, hasSearch }: Props) {
  return (
    <div className="scroll-visible min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)]">
      {!hasSearch && (
        <p className="my-8 text-center text-sm text-gray-500">
          「このエリアを検索」を押すと、地図中心の価格情報を表示します
        </p>
      )}
      {hasSearch && (
        <div className="space-y-4 pb-4">
          <LandPriceCard section={landPrice} loading={factsLoading} />
          <TradesCard trades={trades} loading={tradesLoading} error={tradesError} />
          {trades && <RentCard rent={trades.rent} />}
          <p className="text-[11px] leading-snug text-gray-400">
            出典: 国土交通省「
            <a href={REINFOLIB_URL} target="_blank" rel="noopener noreferrer" className="underline">
              不動産情報ライブラリ
            </a>
            」（地価公示・都道府県地価調査、不動産取引価格情報・成約価格情報）
          </p>
        </div>
      )}
    </div>
  );
}

function yen(n: number): string {
  return n.toLocaleString("ja-JP");
}

/** 万円表記（1億以上は億万円） */
function manYen(n: number): string {
  const man = Math.round(n / 10_000);
  if (man >= 10_000) {
    const oku = Math.floor(man / 10_000);
    const rest = man % 10_000;
    return rest ? `${oku}億${yen(rest)}万円` : `${oku}億円`;
  }
  return `${yen(man)}万円`;
}

function LandPriceCard({ section, loading }: { section: LandPriceSection | null; loading: boolean }) {
  return (
    <section className="rounded-xl border border-gray-100 p-3">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">地価公示・地価調査{section ? `（${section.year}年）` : ""}</h3>
        <span className="text-[11px] text-gray-500">基準点から近い順</span>
      </header>
      {!section && loading && <p className="py-3 text-sm text-gray-500">取得中…</p>}
      {section?.status === "unavailable" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">不動産情報ライブラリの API キーが未設定です</p>
      )}
      {section?.status === "error" && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">データ元に接続できませんでした</p>}
      {section?.status === "ok" && section.points.length === 0 && (
        <p className="py-2 text-sm text-gray-400">1.5km 以内に地価公示・地価調査の地点がありません</p>
      )}
      {section?.status === "ok" && section.points.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {section.points.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                  {p.address || p.label}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{formatDistance(p.distanceM)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-base font-semibold tabular-nums text-gray-900">{yen(p.pricePerSqm)}円/㎡</span>
                <span className="text-xs text-gray-600">（{yen(Math.round(p.pricePerSqm * TSUBO_SQM))}円/坪）</span>
                {p.changeRate !== null && (
                  <span className={`text-xs font-semibold ${p.changeRate < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    前年比 {p.changeRate > 0 ? "+" : ""}
                    {p.changeRate.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {[p.kind, p.useCategory, p.zoning, p.nearestStation && `${p.nearestStation}駅 ${p.stationDistance ?? ""}`]
                  .filter(Boolean)
                  .join("・")}
              </p>
              {p.appraisal && <AppraisalRows a={p.appraisal} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 鑑定評価書由来の補足（路線価・高さ制限・利回りなど） */
function AppraisalRows({ a }: { a: import("@/lib/facts-types").Appraisal }) {
  const items: { k: string; v: string }[] = [];
  if (a.routePrice) items.push({ k: `相続税路線価${a.routePriceYear ? `(${a.routePriceYear})` : ""}`, v: `${yen(a.routePrice)}円/㎡` });
  if (a.heightLimit) items.push({ k: "高度地区", v: a.heightLimit });
  if (a.baseCoverageRatio && a.baseFloorAreaRatio)
    items.push({ k: "基準建蔽/容積", v: `${a.baseCoverageRatio}% / ${a.baseFloorAreaRatio}%` });
  if (a.comparablePrice) items.push({ k: "比準価格", v: `${yen(a.comparablePrice)}円/㎡` });
  if (a.incomePrice) items.push({ k: "収益価格", v: `${yen(a.incomePrice)}円/㎡` });
  if (a.capRate) items.push({ k: "還元利回り", v: `${a.capRate}%` });
  if (a.frontRoad) items.push({ k: "前面道路", v: a.frontRoad });
  if (items.length === 0) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-gray-50 px-2 py-1.5 text-xs">
      {items.map((it) => (
        <div key={it.k} className="contents">
          <dt className="text-gray-500">{it.k}</dt>
          <dd className="text-right font-medium tabular-nums text-gray-800">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

const TYPE_ORDER = ["中古マンション等", "宅地(土地と建物)", "宅地(土地)", "農地", "林地"];

function TradesCard({ trades, loading, error }: { trades: TradesResponse | null; loading: boolean; error: string | null }) {
  const [showAll, setShowAll] = useState(false);

  const groups = trades
    ? TYPE_ORDER.map((type) => ({ type, items: trades.trades.filter((t) => t.type === type) })).filter(
        (g) => g.items.length > 0,
      )
    : [];

  return (
    <section className="rounded-xl border border-gray-100 p-3">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">
          取引事例{trades ? `：${trades.city} ${trades.town}` : ""}
        </h3>
        {trades && (
          <span className="shrink-0 text-[11px] text-gray-500">
            {trades.years[0]}〜{trades.years[1]}年・{trades.totalInTown}件
          </span>
        )}
      </header>
      {loading && !trades && <p className="py-3 text-sm text-gray-500">取得中…</p>}
      {error && !trades && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{error}</p>}
      {trades && trades.trades.length === 0 && (
        <p className="py-2 text-sm text-gray-400">この町名の取引事例は公開されていません</p>
      )}
      {groups.map((g) => {
        const items = showAll ? g.items : g.items.slice(0, 5);
        return (
          <div key={g.type} className="mt-2">
            <h4 className="flex items-baseline justify-between text-xs font-semibold text-gray-600">
              <span>{g.type}</span>
              <span className="font-normal text-gray-400">{g.items.length}件</span>
            </h4>
            <ul className="divide-y divide-gray-100">
              {items.map((t, i) => (
                <TradeRow key={`${g.type}-${i}`} trade={t} />
              ))}
            </ul>
          </div>
        );
      })}
      {trades && trades.trades.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-700"
        >
          {showAll ? "件数を減らす" : "もっと見る"}
        </button>
      )}
      {trades && (
        <p className="mt-2 text-[11px] leading-snug text-gray-400">
          「成約価格情報」は不動産流通機構の成約データ、「不動産取引価格情報」は登記情報をもとにしたアンケート。町名単位で位置は公開されていません。
        </p>
      )}
    </section>
  );
}

const ESTAT_URL = "https://www.e-stat.go.jp/";

/** 家賃相場（住宅・土地統計調査、市区町村別） */
function RentCard({ rent }: { rent: RentStats }) {
  const total = rent.bins.reduce((a, b) => a + b.households, 0);
  const maxShare = Math.max(0, ...rent.bins.map((b) => (total ? b.households / total : 0)));
  return (
    <section className="rounded-xl border border-gray-100 p-3">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">家賃相場（統計）：{rent.city}</h3>
        <span className="shrink-0 text-[11px] text-gray-500">住宅・土地統計調査 {rent.year}年</span>
      </header>
      {rent.status === "unavailable" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-800">
          e-Stat の appId（環境変数 <code className="rounded bg-white px-1">ESTAT_APP_ID</code>）が未設定のため表示できません。
        </p>
      )}
      {rent.status === "error" && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">e-Stat に接続できませんでした</p>}
      {rent.status === "ok" && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {rent.median !== null && (
              <span>
                <span className="text-xs text-gray-500">中央値（概算） </span>
                <span className="text-base font-semibold tabular-nums text-gray-900">{yen(rent.median)}円/月</span>
              </span>
            )}
            {rent.averages.map((a) => (
              <span key={a.label}>
                <span className="text-xs text-gray-500">{a.label} </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">{yen(a.yen)}円/月</span>
              </span>
            ))}
          </div>
          {rent.bins.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {rent.bins.map((b) => {
                const share = total ? b.households / total : 0;
                return (
                  <li key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate text-gray-600">{b.label}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-gray-100">
                      <span
                        className="block h-full rounded-sm bg-sky-500"
                        style={{ width: `${maxShare ? (share / maxShare) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-gray-700">{(share * 100).toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-snug text-gray-400">
            借家に住む世帯の家賃分布（市区町村全体・住宅の広さや築年を問わない統計値）。出典:{" "}
            <a href={ESTAT_URL} target="_blank" rel="noopener noreferrer" className="underline">
              e-Stat
            </a>
            「令和5年住宅・土地統計調査」
          </p>
        </>
      )}
    </section>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isCondo = trade.type === "中古マンション等";
  const areaText = isCondo
    ? trade.area && `専有${trade.area}㎡`
    : [trade.area && `土地${trade.area}㎡`, trade.totalFloorArea && `延床${trade.totalFloorArea}㎡`].filter(Boolean).join("・");
  const unit =
    trade.area && trade.area > 0 ? `${yen(Math.round(trade.price / (trade.area / TSUBO_SQM) / 10_000))}万円/坪` : null;
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-gray-900">{manYen(trade.price)}</span>
        <span className="shrink-0 text-xs text-gray-500">{trade.period.replace("第", "").replace("四半期", "Q")}</span>
      </div>
      <p className="truncate text-xs text-gray-600">
        {[areaText, unit && `${unit}`, trade.buildingYear && `築${trade.buildingYear}`, trade.floorPlan, trade.structure]
          .filter(Boolean)
          .join("・")}
      </p>
      <p className="truncate text-[11px] text-gray-400">
        {[trade.category === "成約価格情報" ? "成約" : "取引", trade.zoning, trade.purpose].filter(Boolean).join("・")}
      </p>
    </li>
  );
}
