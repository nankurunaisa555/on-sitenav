"use client";

import type { ReactNode } from "react";
import MapLegend from "../MapLegend";
import { CATEGORY_MAP, CATEGORIES } from "@/lib/categories";
import type { FactsResponse, HazardKey, TradesResponse } from "@/lib/facts-types";
import { formatDistance, walkMinutes } from "@/lib/geo";
import { NIMBY_KINDS } from "@/lib/nimby";
import type { RouteState, RouteTarget } from "@/hooks/useRoutes";
import type { LatLng, Place } from "@/lib/types";
import type { ReportMarker } from "./ReportMap";

export type ReportTabKey = "places" | "land" | "community" | "price" | "nimby";

export type ReportInput = {
  center: LatLng;
  listPlaces: readonly Place[];
  stations: readonly Place[];
  buses: readonly Place[];
  facts: FactsResponse | null;
  trades: TradesResponse | null;
  nimbyItems: readonly Place[] | null;
  hazards: ReadonlySet<HazardKey>;
  /** レポート用に取った徒歩ルート（学校・最寄り駅） */
  routes: ReadonlyMap<RouteTarget, RouteState>;
};

export type ReportSection = {
  key: ReportTabKey;
  title: string;
  lead: string;
  /** 地図の高さ（px）。下の一覧が2段組みに収まるよう、内容の量に応じて決める */
  mapHeight: number;
  markers: ReportMarker[];
  hazards?: ReadonlySet<HazardKey>;
  routes?: ReadonlyMap<RouteTarget, RouteState>;
  body: ReactNode;
  sources: string;
};

/* ---------- 小さな部品 ---------- */

function H({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-2 mb-1 border-l-4 border-blue-600 pl-2 text-[12px] font-bold text-gray-900 [break-after:avoid] first:mt-0">
      {children}
    </h3>
  );
}

function Num({ n, color }: { n: number; color: string }) {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {n}
    </span>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="osn-avoid-break w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr className="bg-gray-100 text-left text-gray-600">
          {head.map((h) => (
            <th key={h} className="border-b border-gray-200 px-1.5 py-1 font-semibold whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 align-top">
            {r.map((c, j) => (
              <td key={j} className="px-1.5 py-0.5">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 行が多い表は左右の段に半分ずつ分ける（1つの表は段をまたがないため） */
function SplitTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (rows.length <= 6) return <Table head={head} rows={rows} />;
  const half = Math.ceil(rows.length / 2);
  return (
    <>
      <Table head={head} rows={rows.slice(0, half)} />
      <div className="h-2" />
      <Table head={head} rows={rows.slice(half)} />
    </>
  );
}

function KV({ items }: { items: { k: string; v: ReactNode; strong?: boolean }[] }) {
  return (
    <div className="osn-avoid-break grid grid-cols-2 gap-1">
      {items.map((it) => (
        <div key={it.k} className="rounded-md bg-gray-50 px-2 py-1">
          <div className="text-[10px] text-gray-500">{it.k}</div>
          <div className={`text-[12px] leading-snug ${it.strong ? "font-bold text-red-700" : "font-semibold text-gray-900"}`}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-gray-50 px-2 py-2 text-[11px] text-gray-500">{children}</p>;
}

const dist = (m: number) => `${formatDistance(m)}・徒歩${walkMinutes(m)}分`;
const yen = (v: number) => `${Math.round(v).toLocaleString("ja-JP")}円`;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const routeText = (r: RouteState | undefined, fallbackM: number) =>
  r?.status === "ok" && r.distanceM !== undefined && r.durationS !== undefined
    ? `徒歩${Math.max(1, Math.round(r.durationS / 60))}分・道なり${formatDistance(r.distanceM)}`
    : `${dist(fallbackM)}（直線）`;

/* ---------- 周辺施設 ---------- */

function placesSection(d: ReportInput): ReportSection {
  const markers: ReportMarker[] = [];
  const rows: ReactNode[][] = [];
  let n = 0;
  for (const cat of CATEGORIES) {
    const list = d.listPlaces.filter((p) => p.category === cat.key);
    if (cat.key === "station" || cat.key === "bus" || cat.key === "nimby" || cat.key === "shelter" || cat.key === "landprice") continue;
    if (list.length === 0) {
      if (cat.googleTypes.length > 0) rows.push(["", `${cat.emoji} ${cat.label}`, "0", <span className="text-gray-400">なし</span>, ""]);
      continue;
    }
    n += 1;
    const first = list[0]!;
    markers.push({ n, location: first.location, color: cat.color });
    rows.push([
      <Num key="n" n={n} color={cat.color} />,
      `${cat.emoji} ${cat.label}`,
      String(list.length),
      <div key="names">
        <div className="font-semibold text-gray-900">{first.name}</div>
        {list.slice(1, 2).map((p) => (
          <div key={p.id} className="text-[10px] text-gray-500">
            {p.name}（{formatDistance(p.distanceM)}）
          </div>
        ))}
      </div>,
      <span key="d" className="whitespace-nowrap">{dist(first.distanceM)}</span>,
    ]);
  }
  return {
    key: "places",
    mapHeight: 400,
    title: "周辺施設",
    lead: "基準点から半径800m以内の施設。地図の番号は各カテゴリでいちばん近い施設です。",
    markers,
    body: (
      <>
        <H>カテゴリ別の件数といちばん近い施設</H>
        <SplitTable head={["", "カテゴリ", "件数", "近い施設", "距離"]} rows={rows} />
      </>
    ),
    sources: "Google Maps Platform（Places API）、国土数値情報（役所・図書館）",
  };
}

/* ---------- 土地・災害 ---------- */

function landSection(d: ReportInput): ReportSection {
  const f = d.facts;
  const markers: ReportMarker[] = [];
  const hazards = d.hazards.size > 0 ? d.hazards : new Set<HazardKey>(["flood"]);
  if (!f) {
    return { key: "land", title: "土地・災害", lead: "", mapHeight: 330, markers, hazards, body: <Empty>データを取得中です。</Empty>, sources: "" };
  }
  const shelters = f.shelters.shelters.slice(0, 3);
  shelters.forEach((s, i) => markers.push({ n: i + 1, location: s.location, color: "#16a34a" }));
  const lf = f.landform;
  return {
    key: "land",
    mapHeight: 330,
    title: "土地・災害",
    lead: "ハザードの判定は基準点の地点について。地図は浸水想定などのレイヤーを重ねて表示しています。",
    markers,
    hazards,
    body: (
      <>
        <div className="mt-1">
          <MapLegend hazards={hazards} crime={false} compact />
        </div>
        <H>災害リスク（この地点）</H>
        <KV
          items={[
            ...f.hazard.items.map((h) => ({
              k: h.label,
              v: h.level ?? (h.uncertain ? "該当（区分不明）" : "該当なし"),
              strong: h.level !== null || h.uncertain,
            })),
            { k: "標高", v: f.elevation.elevationM !== null ? `${f.elevation.elevationM.toFixed(1)}m` : "—" },
          ]}
        />
        <H>地震</H>
        <KV
          items={[
            { k: "30年以内に震度6弱以上", v: pct(f.quake.p30Int55) },
            { k: "30年以内に震度5強以上", v: pct(f.quake.p30Int50) },
            { k: "表層地盤増幅率", v: f.quake.arv !== null ? f.quake.arv.toFixed(2) : "—" },
            { k: "液状化の傾向", v: f.liquefaction.tendency ?? "—" },
          ]}
        />
        <H>地形分類と土地の成り立ち</H>
        <div className="osn-avoid-break space-y-0.5 text-[10.5px] leading-snug text-gray-700">
          {lf.natural ? (
            <p>
              <b className="text-gray-900">{lf.natural.name}</b>：{lf.natural.origin}
              <span className="text-gray-600"> リスク：{lf.natural.risk}</span>
            </p>
          ) : (
            <p>自然地形のデータはありません。</p>
          )}
          {lf.artificial && (
            <p>
              <b className="text-gray-900">人工地形：{lf.artificial.name}</b>
              {lf.artificial.risk ? `（${lf.artificial.risk}）` : ""}
            </p>
          )}
        </div>
        <H>指定緊急避難場所（近い順）</H>
        {shelters.length ? (
          <Table
            head={["", "名称", "対応する災害", "距離"]}
            rows={shelters.map((s, i) => [
              <Num key="n" n={i + 1} color="#16a34a" />,
              s.name,
              s.hazards.join("・"),
              <span key="d" className="whitespace-nowrap">{dist(s.distanceM)}</span>,
            ])}
          />
        ) : (
          <Empty>近くの避難場所のデータはありません。</Empty>
        )}
        <H>用途地域・建築の制限</H>
        <KV
          items={[
            { k: "用途地域", v: f.zoning.useArea ?? "—" },
            { k: "建ぺい率／容積率", v: `${f.zoning.buildingCoverageRatio ?? "—"}／${f.zoning.floorAreaRatio ?? "—"}` },
            { k: "防火指定", v: f.zoning.fireZone ?? "—" },
            { k: "高さ制限の目安", v: f.zoning.heightNote ?? "—" },
          ]}
        />
        {f.crime.available && f.crime.around500m && (
          <>
            <H>犯罪発生（{f.crime.year}年・周辺500mの町丁目の合計）</H>
            <KV
              items={[
                { k: "合計", v: `${f.crime.around500m.total}件` },
                ...f.crime.around500m.byType
                  .filter((t) => t.count > 0)
                  .slice(0, 3)
                  .map((t) => ({ k: t.type, v: `${t.count}件` })),
              ]}
            />
          </>
        )}
      </>
    ),
    sources: "国土地理院（重ねるハザードマップ・地形分類・標高）、防災科研 J-SHIS、国土交通省 不動産情報ライブラリ、県警 犯罪オープンデータ",
  };
}

/* ---------- 交通・学区・人口 ---------- */

function communitySection(d: ReportInput): ReportSection {
  const f = d.facts;
  const markers: ReportMarker[] = [];
  let n = 0;
  const add = (location: LatLng, color: string) => {
    n += 1;
    markers.push({ n, location, color });
    return n;
  };
  const transit: ReactNode[][] = [];
  d.stations.slice(0, 2).forEach((s, i) => {
    const no = add(s.location, "#2563eb");
    transit.push([
      <Num key="n" n={no} color="#2563eb" />,
      `最寄り駅${i + 1}`,
      s.name,
      <span key="d" className="whitespace-nowrap">{i === 0 ? routeText(d.routes.get("station-0"), s.distanceM) : dist(s.distanceM)}</span>,
    ]);
  });
  d.buses.slice(0, 2).forEach((b, i) => {
    const no = add(b.location, "#0ea5e9");
    transit.push([<Num key="n" n={no} color="#0ea5e9" />, `バス停${i + 1}`, b.name, <span key="d" className="whitespace-nowrap">{dist(b.distanceM)}</span>]);
  });
  const schoolRows: ReactNode[][] = [];
  for (const [info, label, key, color] of [
    [f?.school.elementary, "小学校区", "elementary", "#7c3aed"],
    [f?.school.juniorHigh, "中学校区", "juniorHigh", "#a855f7"],
  ] as const) {
    if (!info) continue;
    const no = info.location ? add(info.location, color) : null;
    const straight = info.location ? distanceBetween(d.center, info.location) : null;
    schoolRows.push([
      no ? <Num key="n" n={no} color={color} /> : "",
      label,
      <div key="s">
        <div className="font-semibold text-gray-900">{info.name}</div>
        {info.address && <div className="text-[10px] text-gray-500">{info.address}</div>}
      </div>,
      <span key="d" className="whitespace-nowrap">{straight !== null ? routeText(d.routes.get(key), straight) : "—"}</span>,
    ]);
  }
  const civicRows: ReactNode[][] = [];
  for (const p of d.listPlaces.filter((x) => x.category === "government" || x.category === "library").slice(0, 3)) {
    const cat = CATEGORY_MAP.get(p.category);
    const no = add(p.location, cat?.color ?? "#334155");
    civicRows.push([
      <Num key="n" n={no} color={cat?.color ?? "#334155"} />,
      cat?.label ?? "",
      p.name,
      <span key="d" className="whitespace-nowrap">{dist(p.distanceM)}</span>,
    ]);
  }
  const pop = f?.population;
  const rate = (a: number, b: number) => `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%`;
  return {
    key: "community",
    mapHeight: 470,
    title: "交通・学区・人口",
    lead: "学区は国土数値情報（令和5年度）に基づく目安です。学校と最寄り駅までは道なりの徒歩ルートを表示しています。",
    markers,
    routes: d.routes,
    body: (
      <>
        <H>交通</H>
        {transit.length ? <Table head={["", "区分", "名称", "距離・徒歩"]} rows={transit} /> : <Empty>データがありません。</Empty>}
        <H>学区</H>
        {schoolRows.length ? <Table head={["", "区分", "学校", "道のり"]} rows={schoolRows} /> : <Empty>学区のデータがありません。</Empty>}
        {civicRows.length > 0 && (
          <>
            <H>役所・図書館</H>
            <Table head={["", "区分", "名称", "距離・徒歩"]} rows={civicRows} />
          </>
        )}
        <H>人口（250mメッシュの将来推計）</H>
        {pop?.around500m ? (
          <Table
            head={["範囲", "2020年", "2030年", "2050年", "2020→2030"]}
            rows={[
              [
                "周辺500m",
                `${pop.around500m.y2020.toLocaleString()}人`,
                `${pop.around500m.y2030.toLocaleString()}人`,
                `${pop.around500m.y2050.toLocaleString()}人`,
                rate(pop.around500m.y2020, pop.around500m.y2030),
              ],
              ...(pop.mesh
                ? [
                    [
                      "この地点のメッシュ",
                      `${pop.mesh.y2020.toLocaleString()}人`,
                      `${pop.mesh.y2030.toLocaleString()}人`,
                      `${pop.mesh.y2050.toLocaleString()}人`,
                      rate(pop.mesh.y2020, pop.mesh.y2030),
                    ],
                  ]
                : []),
            ]}
          />
        ) : (
          <Empty>人口のデータがありません。</Empty>
        )}
      </>
    ),
    sources: "Google Maps Platform（Places API・Routes API）、国土交通省 不動産情報ライブラリ（学区・人口・役所・図書館）",
  };
}

function distanceBetween(a: LatLng, b: LatLng): number {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) * k) / 2);
  const y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * 6_371_000;
}

/* ---------- 価格 ---------- */

function priceSection(d: ReportInput): ReportSection {
  const f = d.facts;
  const points = f?.landPrice.points.slice(0, 6) ?? [];
  const markers = points.map((p, i) => ({ n: i + 1, location: p.location, color: "#0f766e" }));
  const t = d.trades;
  const trades = t?.trades.slice(0, 8) ?? [];
  return {
    key: "price",
    mapHeight: 430,
    title: "価格",
    lead: "近くの地価公示・地価調査と、同じ町名の取引事例、市区町村の家賃統計です。",
    markers,
    body: (
      <>
        <H>地価公示・地価調査{f ? `（${f.landPrice.year}年）` : ""}</H>
        {points.length ? (
          <Table
            head={["", "所在地", "価格（㎡）", "前年比", "距離"]}
            rows={points.map((p, i) => [
              <Num key="n" n={i + 1} color="#0f766e" />,
              <div key="a">
                <div className="font-semibold text-gray-900">{p.address}</div>
                <div className="text-[10px] text-gray-500">
                  {p.kind}
                  {p.zoning ? `・${p.zoning}` : ""}
                  {p.appraisal?.routePrice ? `・路線価 ${yen(p.appraisal.routePrice)}/㎡` : ""}
                </div>
              </div>,
              <div key="p" className="whitespace-nowrap">
                <div className="font-semibold">{yen(p.pricePerSqm)}</div>
                <div className="text-[10px] text-gray-500">坪 {yen(p.pricePerSqm * 3.30578)}</div>
              </div>,
              p.changeRate === null ? "—" : `${p.changeRate >= 0 ? "+" : ""}${p.changeRate.toFixed(1)}%`,
              <span key="d" className="whitespace-nowrap">{formatDistance(p.distanceM)}</span>,
            ])}
          />
        ) : (
          <Empty>近くの地価公示・地価調査の地点はありません。</Empty>
        )}
        <H>取引事例{t ? `（${t.city}${t.town}・${t.years[0]}〜${t.years[1]}年）` : ""}</H>
        {trades.length ? (
          <Table
            head={["時期", "種類", "価格", "面積", "㎡単価"]}
            rows={trades.map((x) => [
              <span key="pe" className="whitespace-nowrap">{x.period.replace("第", "").replace("四半期", "Q")}</span>,
              <div key="ty">
                <div>{x.type}</div>
                {(x.buildingYear || x.structure) && (
                  <div className="text-[10px] text-gray-500">{[x.buildingYear, x.structure].filter(Boolean).join("・")}</div>
                )}
              </div>,
              <span key="p" className="whitespace-nowrap">{`${Math.round(x.price / 10_000).toLocaleString()}万円`}</span>,
              x.area ? `${x.area}㎡` : "—",
              x.area ? yen(x.price / x.area) : "—",
            ])}
          />
        ) : (
          <Empty>同じ町名の取引事例は見つかりませんでした。</Empty>
        )}
        {t?.rent.status === "ok" && (
          <>
            <H>家賃（{t.rent.city}・{t.rent.year}年 住宅・土地統計調査）</H>
            <KV
              items={[
                ...(t.rent.median ? [{ k: "借家の家賃 中央値（概算）", v: `${yen(t.rent.median)}/月` }] : []),
                ...t.rent.averages.slice(0, 3).map((a) => ({ k: a.label, v: `${yen(a.yen)}/月` })),
              ]}
            />
          </>
        )}
      </>
    ),
    sources: "国土交通省 不動産情報ライブラリ（地価公示・地価調査・鑑定評価書・取引価格）、総務省 e-Stat",
  };
}

/* ---------- 嫌悪施設 ---------- */

function nimbySection(d: ReportInput): ReportSection {
  const items = d.nimbyItems ?? [];
  const markers: ReportMarker[] = [];
  const rows: ReactNode[][] = [];
  let n = 0;
  for (const kind of NIMBY_KINDS) {
    for (const p of items.filter((x) => x.sub?.key === kind.key)) {
      n += 1;
      markers.push({ n, location: p.location, color: "#991b1b" });
      rows.push([
        <Num key="n" n={n} color="#991b1b" />,
        `${kind.emoji} ${kind.label}`,
        <div key="s">
          <div className="font-semibold text-gray-900">{p.name}</div>
          {p.address && <div className="text-[10px] text-gray-500">{p.address}</div>}
        </div>,
        <span key="d" className="whitespace-nowrap">{dist(p.distanceM)}</span>,
      ]);
    }
  }
  return {
    key: "nimby",
    mapHeight: 430,
    title: "嫌悪施設",
    lead: "基準点から半径300m以内。名称・業種からの自動判定のため誤検出や漏れがあります。現地で必ずご確認ください。",
    markers,
    body: (
      <>
        <H>半径300m以内の候補 {rows.length}件</H>
        {d.nimbyItems === null ? (
          <Empty>探索中です。しばらくお待ちください。</Empty>
        ) : rows.length ? (
          <SplitTable head={["", "種類", "名称・住所", "距離"]} rows={rows} />
        ) : (
          <Empty>半径300m以内に該当する施設は見つかりませんでした。</Empty>
        )}
      </>
    ),
    sources: "Google Maps Platform、Yahoo!オープンローカルプラットフォーム、OpenStreetMap、埼玉県・さいたま市 産業廃棄物処分業者名簿、利用者の登録",
  };
}

export function buildSection(key: ReportTabKey, d: ReportInput): ReportSection {
  switch (key) {
    case "places":
      return placesSection(d);
    case "land":
      return landSection(d);
    case "community":
      return communitySection(d);
    case "price":
      return priceSection(d);
    case "nimby":
      return nimbySection(d);
  }
}
