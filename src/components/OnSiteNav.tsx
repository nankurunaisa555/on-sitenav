"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import BottomSheet, { type SheetTab } from "./BottomSheet";
import FactsPanel from "./FactsPanel";
import CrimeOverlay from "./CrimeOverlay";
import HazardOverlay from "./HazardOverlay";
import MapView from "./MapView";
import PlaceList from "./PlaceList";
import PricePanel from "./PricePanel";
import NimbyPanel from "./NimbyPanel";
import LongPress from "./LongPress";
import StreetViewModal from "./StreetViewModal";
import MapLegend from "./MapLegend";
import InstallButton from "./InstallButton";
import RouteOverlay from "./RouteOverlay";
import ZoomButtons from "./ZoomButtons";
import { useFacts } from "@/hooks/useFacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePlaces } from "@/hooks/usePlaces";
import { useRoutes, type RouteTarget } from "@/hooks/useRoutes";
import { useTrades } from "@/hooks/useTrades";
import { useNimby } from "@/hooks/useNimby";
import type { HazardKey } from "@/lib/facts-types";
import { DEFAULT_CENTER, distanceMeters, formatDistance } from "@/lib/geo";
import { CRIME_PREFS, guessPrefCode } from "@/lib/crime";
import { LIST_CATEGORY_KEYS } from "@/lib/categories";
import { NIMBY_KINDS, type NimbyKindKey } from "@/lib/nimby";
import type { CategoryKey, LatLng, Place } from "@/lib/types";

const RADIUS_M = 800;
/** 検索中心からこれ以上動いたら「このエリアを検索」を出す */
const MOVED_THRESHOLD_M = 150;

type TabKey = "places" | "land" | "community" | "price" | "nimby";
const TABS: readonly SheetTab<TabKey>[] = [
  { key: "places", label: "周辺施設" },
  { key: "land", label: "土地・災害" },
  { key: "community", label: "交通・学区・人口" },
  { key: "price", label: "価格" },
  { key: "nimby", label: "嫌悪施設" },
];
const ALL_LIST_CATEGORIES = new Set<CategoryKey>(LIST_CATEGORY_KEYS);
const EMPTY_HAZARDS: ReadonlySet<HazardKey> = new Set();
const ALL_NIMBY_KINDS = new Set<NimbyKindKey>(NIMBY_KINDS.map((k) => k.key));

function readLatLngFromUrl(): LatLng | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!q.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** 基準点が現在地か、タップ地点/地図中心かをヘッダーに示す */
function basisLabel(center: LatLng, user: (LatLng & { accuracyM: number }) | null): string {
  if (user && distanceMeters(center, user) < 5) return `基準: 現在地 ±${Math.round(user.accuracyM)}m`;
  return "基準: 指定地点";
}

export default function OnSiteNav({ apiKey }: { apiKey: string }) {
  const geo = useGeolocation();
  const places = usePlaces();
  const facts = useFacts();
  const routing = useRoutes();
  const trades = useTrades();
  const nimby = useNimby();

  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(() => new Set(ALL_LIST_CATEGORIES));
  const [activeKinds, setActiveKinds] = useState<Set<NimbyKindKey>>(() => new Set(ALL_NIMBY_KINDS));
  const [tab, setTab] = useState<TabKey>("places");
  const [hazardLayers, setHazardLayers] = useState<Set<HazardKey>>(new Set());
  /** 地図タップで選んだ、次の検索の基準候補 */
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null);
  /** ストリートビューの表示対象 */
  const [streetView, setStreetView] = useState<{ point: LatLng; title: string | null } | null>(null);
  const openStreetView = useCallback((point: LatLng, title: string | null = null) => {
    setStreetView({ point, title });
  }, []);
  /** 周辺施設ピンの一括表示/非表示。ルート表示時は自動で隠す */
  const [showPins, setShowPins] = useState(true);
  const [showCrime, setShowCrime] = useState(false);
  /** 下のリスト（ボトムシート）の表示/非表示。地図を広く見たいときに隠す */
  const [showSheet, setShowSheet] = useState(true);
  /** シートが地図を覆っている高さ（px）。地図の中心合わせに使う */
  const [sheetHeight, setSheetHeight] = useState(0);
  const handleSheetHeight = useCallback((px: number) => setSheetHeight(px), []);

  const crimePref = useMemo(() => {
    const code = guessPrefCode(searchCenter ?? mapCenter ?? initialCenter ?? DEFAULT_CENTER);
    return code !== null ? CRIME_PREFS[code] ?? null : null;
  }, [searchCenter, mapCenter, initialCenter]);

  const nearestStations = places.data?.nearestStations ?? [];
  // 役所・図書館は国交省データ由来。周辺施設の一覧・ピンにも「最寄り」として混ぜる
  const civicPlaces = useMemo(() => {
    const c = facts.data?.civic;
    if (!c) return [];
    const list = [...(c.cityHall ? [c.cityHall] : []), ...c.libraries];
    return list.map((x) => ({
      id: x.id,
      name: x.name,
      category: (x.kind === "cityhall" ? "government" : "library") as CategoryKey,
      location: x.location,
      address: x.address ?? "",
      distanceM: x.distanceM,
    }));
  }, [facts.data?.civic]);
  /** Places 由来の全件（駅・バス停含む）。交通タブの最寄り判定に使う */
  const rawPlaces = places.data?.places ?? [];
  /** 周辺施設タブの一覧対象（駅・バス停を除き、役所・図書館を足す） */
  const listPlaces = useMemo(
    () =>
      [...rawPlaces.filter((p) => p.category !== "station" && p.category !== "bus"), ...civicPlaces].sort(
        (a, b) => a.distanceM - b.distanceM,
      ),
    [rawPlaces, civicPlaces],
  );
  const nimbyPlaces = useMemo(
    () => (nimby.data ? nimby.data.items.filter((p) => activeKinds.has(p.sub.key as NimbyKindKey)) : []),
    [nimby.data, activeKinds],
  );
  /** 交通・学区・人口タブ用: 駅（半径外の最寄りも）・最寄りバス停2つ・学区の学校・役所・図書館 */
  const communityPlaces = useMemo(() => {
    const out: Place[] = [];
    const ids = new Set<string>();
    const push = (p: Place) => {
      if (ids.has(p.id)) return;
      ids.add(p.id);
      out.push(p);
    };
    for (const s of [...rawPlaces.filter((p) => p.category === "station"), ...nearestStations]) push(s);
    const busKey = (n: string) => n.replace(/[（(].*?[）)]/g, "").replace(/\s.*$/, "").trim();
    const seenBus = new Set<string>();
    for (const b of rawPlaces.filter((p) => p.category === "bus")) {
      const k = busKey(b.name);
      if (seenBus.has(k)) continue;
      seenBus.add(k);
      push(b);
      if (seenBus.size >= 2) break;
    }
    const school = facts.data?.school;
    for (const [info, label] of [
      [school?.elementary, "小学校区"],
      [school?.juniorHigh, "中学校区"],
    ] as const) {
      if (info?.location) {
        push({
          id: `school:${info.code ?? info.name}`,
          name: info.name,
          category: "school",
          location: info.location,
          address: info.address ?? "",
          distanceM: searchCenter ? distanceMeters(searchCenter, info.location) : 0,
          sub: { key: "school", label, emoji: "🏫" },
        });
      }
    }
    for (const c of civicPlaces) push(c);
    return out;
  }, [rawPlaces, nearestStations, facts.data?.school, civicPlaces, searchCenter]);

  /** 土地・災害タブ用: 避難場所 */
  const shelterPlaces = useMemo<Place[]>(
    () =>
      (facts.data?.shelters.shelters ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        category: "shelter",
        location: s.location,
        address: s.address ?? "",
        distanceM: s.distanceM,
        sub: { key: "shelter", label: `避難場所（${s.hazards.join("・")}）`, emoji: "🏃" },
      })),
    [facts.data?.shelters],
  );

  /** 価格タブ用: 地価公示・地価調査の地点（価格ラベル付き） */
  const landPricePlaces = useMemo<Place[]>(
    () =>
      (facts.data?.landPrice.points ?? []).map((p) => ({
        id: `landprice:${p.id}`,
        name: p.address || p.label,
        category: "landprice",
        location: p.location,
        address: [p.kind, p.useCategory, p.zoning].filter(Boolean).join("・"),
        distanceM: p.distanceM,
        sub: { key: "landprice", label: `${p.kind} ${p.pricePerSqm.toLocaleString("ja-JP")}円/㎡`, emoji: "💰" },
        badge: `${(p.pricePerSqm / 10_000).toFixed(1)}万/㎡`,
      })),
    [facts.data?.landPrice],
  );

  /** 地図のピン: 今のタブに関係するものだけ */
  const visiblePlaces = useMemo(() => {
    switch (tab) {
      case "places":
        return listPlaces.filter((p) => activeCategories.has(p.category));
      case "community":
        return communityPlaces;
      case "land":
        return shelterPlaces;
      case "price":
        return landPricePlaces;
      case "nimby":
        return nimbyPlaces;
    }
  }, [tab, listPlaces, activeCategories, communityPlaces, shelterPlaces, landPricePlaces, nimbyPlaces]);

  // 嫌悪施設タブを開いたら自動で探索する（未取得のときだけ）
  useEffect(() => {
    if (tab === "nimby" && searchCenter && !nimby.data && !nimby.loading && !nimby.error) {
      void nimby.toggle(searchCenter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchCenter, nimby.data, nimby.loading, nimby.error]);

  // タブを変えたらピンの選択は解除
  useEffect(() => {
    setSelectedId(null);
  }, [tab]);

  const runSearch = useCallback(
    (center: LatLng) => {
      setSearchCenter(center);
      setSelectedId(null);
      setPickedPoint(null);
      routing.clear(); // 出発点が変わるのでルートは消す
      trades.reset();
      nimby.reset();
      setShowPins(true);
      void places.search(center, RADIUS_M);
      void facts.load(center);
    },
    [places.search, facts.load, routing.clear, trades.reset, nimby.reset],
  );

  // 起動時: URL に ?lat=&lng= があればその地点を基準に（共有リンク用）。
  // 無ければ現在地を取得してそこを検索。取れなければ東京駅を表示だけする
  useEffect(() => {
    let cancelled = false;
    const fromUrl = readLatLngFromUrl();
    if (fromUrl) {
      setInitialCenter(fromUrl);
      runSearch(fromUrl);
      return;
    }
    void geo.locate().then((pos) => {
      if (cancelled) return;
      const center = pos ?? DEFAULT_CENTER;
      setInitialCenter(center);
      if (pos) runSearch(pos);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 基準点が決まったら URL に反映して、そのまま共有できるようにする
  useEffect(() => {
    if (!searchCenter || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", searchCenter.lat.toFixed(6));
    url.searchParams.set("lng", searchCenter.lng.toFixed(6));
    window.history.replaceState(null, "", url);
  }, [searchCenter]);

  // 周辺施設が取れたら、いちばん近い施設の住所から町名を決めて取引事例を引く
  useEffect(() => {
    if (!places.data) return;
    const withAddress = places.data.places.find((p) => /[都道府県]/.test(p.address));
    void trades.load(withAddress?.address ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places.data]);

  const handleLocate = async () => {
    const pos = await geo.locate();
    if (pos) runSearch(pos);
  };

  const toggleCategory = useCallback((key: CategoryKey) => {
    setSelectedId(null);
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleKind = useCallback((key: NimbyKindKey) => {
    setSelectedId(null);
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleRoute = useCallback(
    (target: RouteTarget, label: string, destination: LatLng) => {
      if (!searchCenter) return;
      // ルートを新しく出すときはピンを隠して経路を見やすくする
      if (!routing.routes.has(target)) setShowPins(false);
      void routing.toggle(target, label, searchCenter, destination);
    },
    [searchCenter, routing.toggle, routing.routes],
  );

  const toggleHazard = useCallback((key: HazardKey) => {
    setHazardLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const moved = useMemo(() => {
    if (!mapCenter) return false;
    if (!searchCenter) return true;
    return distanceMeters(mapCenter, searchCenter) > MOVED_THRESHOLD_M;
  }, [mapCenter, searchCenter]);

  const loading = places.loading || facts.loading;

  if (!initialCenter) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500">
        現在地を取得しています…
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} language="ja" region="JP" libraries={["geometry"]}>
      <div className="relative h-dvh w-full overflow-hidden bg-gray-100">
        <MapView
          initialCenter={initialCenter}
          userLocation={geo.position}
          userAccuracyM={geo.position?.accuracyM ?? null}
          searchCenter={searchCenter}
          pickedPoint={pickedPoint}
          onStreetView={openStreetView}
          bottomInsetPx={showSheet ? sheetHeight : 0}
          radiusM={RADIUS_M}
          places={showPins ? visiblePlaces : []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCameraChanged={setMapCenter}
        >
          <LongPress onLongPress={(p) => runSearch(p)} />
          {/* レイヤーは土地・災害タブのときだけ地図に重ねる */}
          <HazardOverlay enabled={tab === "land" ? hazardLayers : EMPTY_HAZARDS} />
          <CrimeOverlay enabled={tab === "land" && showCrime} center={searchCenter ?? mapCenter} />
          <RouteOverlay routes={routing.routes} />
        </MapView>

        <StreetViewModal
          target={streetView?.point ?? null}
          title={streetView?.title ?? null}
          onClose={() => setStreetView(null)}
        />

        {tab === "land" && (hazardLayers.size > 0 || showCrime) && (
          <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+3.5rem)] left-3 max-w-[70vw]">
            <MapLegend hazards={hazardLayers} crime={showCrime} compact />
          </div>
        )}

        {/* 地図上のオーバーレイ UI（上部） */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow backdrop-blur">
            <span className="text-sm font-bold tracking-tight text-gray-900">On-siteNav</span>
            <span className="text-xs text-gray-500">現地ファクト</span>
          </div>
          <InstallButton />
          {moved && mapCenter && !loading && (
            <button
              type="button"
              onClick={() => runSearch(mapCenter)}
              className="pointer-events-auto rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg active:scale-95"
            >
              地図の中心を基準に検索
            </button>
          )}
          {!moved && searchCenter && !loading && (
            <span className="pointer-events-none rounded-full bg-black/55 px-3 py-1 text-[11px] text-white">
              距離は基準点からの直線距離。地図を長押しすると基準点を移して再検索します
            </span>
          )}
          {loading && (
            <span className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-sm text-gray-600 shadow">
              情報を取得中…
            </span>
          )}
          {geo.status === "locating" && (
            <span className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-xs text-gray-600 shadow">
              現在地を測位中…{geo.position ? `（精度 ±${Math.round(geo.position.accuracyM)}m）` : ""}
            </span>
          )}
          {geo.status === "denied" && (
            <span className="pointer-events-auto rounded-full bg-amber-50 px-4 py-2 text-xs text-amber-800 shadow">
              位置情報が許可されていません。地図を長押しして基準点を置いてください
            </span>
          )}
        </div>

        {/* 下部: 拡大縮小 / ピン・レイヤー・リスト・現在地 / ボトムシート */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col">
          <div className="mr-3 mb-2 flex justify-end">
            <ZoomButtons />
          </div>
          <div className="relative mr-3 mb-3 flex items-end justify-end gap-2">
            <button
              type="button"
              disabled={!searchCenter}
              onClick={() => {
                if (searchCenter) openStreetView(searchCenter, "基準点");
              }}
              aria-label="基準点のストリートビューを開く"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg shadow-lg active:scale-95 disabled:opacity-50"
            >
              <span aria-hidden>📷</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPins((v) => !v)}
              aria-pressed={!showPins}
              aria-label={showPins ? "周辺施設のピンを隠す" : "周辺施設のピンを表示"}
              className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-lg active:scale-95 ${
                showPins ? "bg-white text-gray-800" : "bg-gray-900 text-white"
              }`}
            >
              <span aria-hidden>{showPins ? "📍" : "🚫"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSheet((v) => !v)}
              aria-pressed={!showSheet}
              aria-label={showSheet ? "リストを隠す" : "リストを表示"}
              className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-lg active:scale-95 ${
                showSheet ? "bg-white text-gray-800" : "bg-gray-900 text-white"
              }`}
            >
              <span aria-hidden>{showSheet ? "▤" : "▢"}</span>
            </button>
            <button
              type="button"
              onClick={handleLocate}
              disabled={geo.status === "locating"}
              aria-label="現在地へ移動"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-lg active:scale-95 disabled:opacity-60"
            >
              {geo.status === "locating" ? "…" : "◎"}
            </button>
          </div>
          {showSheet && (
          <BottomSheet
            tabs={TABS}
            activeTab={tab}
            onTabChange={setTab}
            onHeightChange={handleSheetHeight}
            meta={
              tab === "places"
                ? places.loading
                  ? "検索中…"
                  : `半径${formatDistance(RADIUS_M)}・${listPlaces.length}件${showPins ? "" : "（ピン非表示）"}`
                : facts.loading
                  ? "取得中…"
                  : searchCenter
                    ? basisLabel(searchCenter, geo.position)
                    : undefined
            }
          >
            {tab === "nimby" ? (
              <NimbyPanel
                data={nimby.data}
                loading={nimby.loading}
                error={nimby.error}
                hasSearch={searchCenter !== null}
                onSearch={() => {
                  if (searchCenter) void nimby.toggle(searchCenter);
                }}
                activeKinds={activeKinds}
                onToggleKind={toggleKind}
                onAllKinds={() => setActiveKinds(new Set(ALL_NIMBY_KINDS))}
                onNoKinds={() => setActiveKinds(new Set())}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : tab === "price" ? (
              <PricePanel
                landPrice={facts.data?.landPrice ?? null}
                factsLoading={facts.loading}
                trades={trades.data}
                tradesLoading={trades.loading}
                tradesError={trades.error}
                hasSearch={searchCenter !== null}
              />
            ) : tab === "places" ? (
              <PlaceList
                places={listPlaces}
                loading={places.loading}
                error={places.error}
                selectedId={selectedId}
                onSelect={setSelectedId}
                active={activeCategories}
                onToggleCategory={toggleCategory}
                onAllCategories={() => setActiveCategories(new Set(ALL_LIST_CATEGORIES))}
                onNoCategories={() => setActiveCategories(new Set())}
              />
            ) : (
              <FactsPanel
                group={tab === "land" ? "land" : "community"}
                facts={facts.data}
                loading={facts.loading}
                error={facts.error}
                places={rawPlaces}
                nearestStations={nearestStations}
                enabledHazards={hazardLayers}
                onToggleHazard={toggleHazard}
                crimeEnabled={showCrime}
                onToggleCrime={() => setShowCrime((v) => !v)}
                onNoHazards={() => {
                  setHazardLayers(new Set());
                  setShowCrime(false);
                }}
                crimeAvailable={crimePref !== null}
                crimeLabel={crimePref ? `犯罪発生 ${crimePref.name}（2024年）` : "犯罪発生（この地域は未対応）"}
                origin={searchCenter}
                routes={routing.routes}
                onToggleRoute={toggleRoute}
              />
            )}
          </BottomSheet>
          )}
        </div>
      </div>
    </APIProvider>
  );
}
