"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import BottomSheet, { type SheetTab } from "./BottomSheet";
import FactsPanel from "./FactsPanel";
import HazardOverlay from "./HazardOverlay";
import LayerMenu from "./LayerMenu";
import MapView from "./MapView";
import PlaceList from "./PlaceList";
import { useFacts } from "@/hooks/useFacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePlaces } from "@/hooks/usePlaces";
import type { HazardKey } from "@/lib/facts-types";
import { DEFAULT_CENTER, distanceMeters, formatDistance } from "@/lib/geo";
import type { CategoryKey, LatLng } from "@/lib/types";

const RADIUS_M = 800;
/** 検索中心からこれ以上動いたら「このエリアを検索」を出す */
const MOVED_THRESHOLD_M = 150;

type TabKey = "places" | "facts";
const TABS: readonly SheetTab<TabKey>[] = [
  { key: "places", label: "周辺施設" },
  { key: "facts", label: "土地・災害" },
];

/** 基準点が現在地か、タップ地点/地図中心かをヘッダーに示す */
function basisLabel(center: LatLng, user: (LatLng & { accuracyM: number }) | null): string {
  if (user && distanceMeters(center, user) < 5) return `基準: 現在地 ±${Math.round(user.accuracyM)}m`;
  return "基準: 指定地点";
}

export default function OnSiteNav({ apiKey }: { apiKey: string }) {
  const geo = useGeolocation();
  const places = usePlaces();
  const facts = useFacts();

  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());
  const [tab, setTab] = useState<TabKey>("places");
  const [hazardLayers, setHazardLayers] = useState<Set<HazardKey>>(new Set());
  /** 地図タップで選んだ、次の検索の基準候補 */
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null);

  const allPlaces = places.data?.places ?? [];
  const visiblePlaces = useMemo(
    () =>
      activeCategories.size === 0
        ? allPlaces
        : allPlaces.filter((p) => activeCategories.has(p.category)),
    [allPlaces, activeCategories],
  );

  const runSearch = useCallback(
    (center: LatLng) => {
      setSearchCenter(center);
      setSelectedId(null);
      setPickedPoint(null);
      void places.search(center, RADIUS_M);
      void facts.load(center);
    },
    [places.search, facts.load],
  );

  // 起動時: 現在地を取得してそこを検索。取れなければ東京駅を表示だけする
  useEffect(() => {
    let cancelled = false;
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
          places={visiblePlaces}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCameraChanged={setMapCenter}
        >
          <HazardOverlay enabled={hazardLayers} />
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

        {/* 下部: レイヤー切替 + 現在地ボタン + ボトムシート */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col">
          <div className="mr-3 mb-3 flex items-end justify-end gap-2">
            <LayerMenu enabled={hazardLayers} onToggle={toggleHazard} />
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
          <BottomSheet
            tabs={TABS}
            activeTab={tab}
            onTabChange={setTab}
            meta={
              tab === "places"
                ? places.loading
                  ? "検索中…"
                  : `半径${formatDistance(RADIUS_M)}・${allPlaces.length}件`
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
                facts={facts.data}
                loading={facts.loading}
                error={facts.error}
                places={allPlaces}
                enabledHazards={hazardLayers}
                onToggleHazard={toggleHazard}
              />
            )}
          </BottomSheet>
        </div>
      </div>
    </APIProvider>
  );
}
