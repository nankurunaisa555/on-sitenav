"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import BottomSheet, { type SheetTab } from "./BottomSheet";
import FactsPanel from "./FactsPanel";
import CrimeOverlay from "./CrimeOverlay";
import HazardOverlay from "./HazardOverlay";
import LayerMenu from "./LayerMenu";
import MapView from "./MapView";
import PlaceList from "./PlaceList";
import RouteOverlay from "./RouteOverlay";
import ZoomButtons from "./ZoomButtons";
import { useFacts } from "@/hooks/useFacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePlaces } from "@/hooks/usePlaces";
import { useRoutes, type RouteTarget } from "@/hooks/useRoutes";
import type { HazardKey } from "@/lib/facts-types";
import { DEFAULT_CENTER, distanceMeters, formatDistance } from "@/lib/geo";
import { CRIME_PREFS, guessPrefCode } from "@/lib/crime";
import type { CategoryKey, LatLng } from "@/lib/types";

const RADIUS_M = 800;
/** 検索中心からこれ以上動いたら「このエリアを検索」を出す */
const MOVED_THRESHOLD_M = 150;

type TabKey = "places" | "land" | "community";
const TABS: readonly SheetTab<TabKey>[] = [
  { key: "places", label: "周辺施設" },
  { key: "land", label: "土地・災害" },
  { key: "community", label: "学区・人口" },
];

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

  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());
  const [tab, setTab] = useState<TabKey>("places");
  const [hazardLayers, setHazardLayers] = useState<Set<HazardKey>>(new Set());
  /** 地図タップで選んだ、次の検索の基準候補 */
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null);
  /** 周辺施設ピンの一括表示/非表示。ルート表示時は自動で隠す */
  const [showPins, setShowPins] = useState(true);
  const [showCrime, setShowCrime] = useState(false);
  /** 下のリスト（ボトムシート）の表示/非表示。地図を広く見たいときに隠す */
  const [showSheet, setShowSheet] = useState(true);

  const crimePref = useMemo(() => {
    const code = guessPrefCode(searchCenter ?? mapCenter ?? initialCenter ?? DEFAULT_CENTER);
    return code !== null ? CRIME_PREFS[code] ?? null : null;
  }, [searchCenter, mapCenter, initialCenter]);

  const allPlaces = places.data?.places ?? [];
  const nearestStations = places.data?.nearestStations ?? [];
  const visiblePlaces = useMemo(() => {
    const filtered =
      activeCategories.size === 0
        ? allPlaces
        : allPlaces.filter((p) => activeCategories.has(p.category));
    // 半径外の最寄り駅も地図には出す（一覧には出さない）
    if (activeCategories.size === 0 || activeCategories.has("station")) {
      const ids = new Set(filtered.map((p) => p.id));
      return [...filtered, ...nearestStations.filter((s) => !ids.has(s.id))];
    }
    return filtered;
  }, [allPlaces, nearestStations, activeCategories]);

  const runSearch = useCallback(
    (center: LatLng) => {
      setSearchCenter(center);
      setSelectedId(null);
      setPickedPoint(null);
      routing.clear(); // 出発点が変わるのでルートは消す
      setShowPins(true);
      void places.search(center, RADIUS_M);
      void facts.load(center);
    },
    [places.search, facts.load, routing.clear],
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
    <APIProvider apiKey={apiKey} language="ja" region="JP">
      <div className="relative h-dvh w-full overflow-hidden bg-gray-100">
        <MapView
          initialCenter={initialCenter}
          userLocation={geo.position}
          userAccuracyM={geo.position?.accuracyM ?? null}
          searchCenter={searchCenter}
          pickedPoint={pickedPoint}
          onPickPoint={setPickedPoint}
          radiusM={RADIUS_M}
          places={showPins ? visiblePlaces : []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCameraChanged={setMapCenter}
        >
          <HazardOverlay enabled={hazardLayers} />
          <CrimeOverlay enabled={showCrime} center={searchCenter ?? mapCenter} />
          <RouteOverlay routes={routing.routes} />
        </MapView>

        {/* 地図上のオーバーレイ UI（上部） */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow backdrop-blur">
            <span className="text-sm font-bold tracking-tight text-gray-900">On-siteNav</span>
            <span className="text-xs text-gray-500">現地ファクト</span>
          </div>
          {pickedPoint && !loading ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500 pl-4 pr-1.5 py-1.5 text-sm font-medium text-white shadow-lg">
              <button type="button" onClick={() => runSearch(pickedPoint)} className="active:opacity-80">
                📍 タップした地点を基準に検索
              </button>
              <button
                type="button"
                onClick={() => setPickedPoint(null)}
                aria-label="選択を解除"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs"
              >
                ✕
              </button>
            </div>
          ) : (
            moved &&
            mapCenter &&
            !loading && (
              <button
                type="button"
                onClick={() => runSearch(mapCenter)}
                className="pointer-events-auto rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg active:scale-95"
              >
                地図の中心を基準に検索
              </button>
            )
          )}
          {!pickedPoint && !moved && searchCenter && !loading && (
            <span className="pointer-events-none rounded-full bg-black/55 px-3 py-1 text-[11px] text-white">
              距離は「基準点」からの直線距離。地図をタップすると基準点を変えられます
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
              位置情報が許可されていません。地図をタップして基準点を選んでください
            </span>
          )}
        </div>

        {/* 下部: 拡大縮小 / ピン・レイヤー・リスト・現在地 / ボトムシート */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col">
          <div className="mr-3 mb-2 flex justify-end">
            <ZoomButtons />
          </div>
          <div className="mr-3 mb-3 flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPins((v) => !v)}
              aria-pressed={!showPins}
              aria-label={showPins ? "周辺施設のピンを隠す" : "周辺施設のピンを表示"}
              className={`pointer-events-auto flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-lg active:scale-95 ${
                showPins ? "bg-white text-gray-800" : "bg-gray-900 text-white"
              }`}
            >
              <span aria-hidden>{showPins ? "📍" : "🚫"}</span>
              ピン
            </button>
            <LayerMenu
              enabled={hazardLayers}
              onToggle={toggleHazard}
              crimeEnabled={showCrime}
              onToggleCrime={() => setShowCrime((v) => !v)}
              crimeAvailable={crimePref !== null}
              crimeLabel={crimePref ? `犯罪発生 ${crimePref.name}（2024年）` : "犯罪発生（この地域は未対応）"}
            />
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
            meta={
              tab === "places"
                ? places.loading
                  ? "検索中…"
                  : `半径${formatDistance(RADIUS_M)}・${allPlaces.length}件${showPins ? "" : "（ピン非表示）"}`
                : facts.loading
                  ? "取得中…"
                  : searchCenter
                    ? basisLabel(searchCenter, geo.position)
                    : undefined
            }
          >
            {tab === "places" ? (
              <PlaceList
                places={allPlaces}
                loading={places.loading}
                error={places.error}
                selectedId={selectedId}
                onSelect={setSelectedId}
                active={activeCategories}
                onToggleCategory={toggleCategory}
                onResetCategory={() => setActiveCategories(new Set())}
              />
            ) : (
              <FactsPanel
                group={tab}
                facts={facts.data}
                loading={facts.loading}
                error={facts.error}
                places={allPlaces}
                nearestStations={nearestStations}
                enabledHazards={hazardLayers}
                onToggleHazard={toggleHazard}
                crimeEnabled={showCrime}
                onToggleCrime={() => setShowCrime((v) => !v)}
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
