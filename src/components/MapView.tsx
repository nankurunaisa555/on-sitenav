"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  AdvancedMarker,
  Map,
  useMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps";
import { CATEGORY_MAP } from "@/lib/categories";
import { distanceMeters, formatDistance } from "@/lib/geo";
import type { LatLng, Place } from "@/lib/types";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

type Props = {
  initialCenter: LatLng;
  userLocation: LatLng | null;
  /** 現在地の測位精度（m）。精度円を描く */
  userAccuracyM: number | null;
  searchCenter: LatLng | null;
  /** 地図タップで選んだ候補地点（現在は未使用だが互換のため残す） */
  pickedPoint: LatLng | null;
  /** 施設の吹き出しから「ストリートビュー」を開く */
  onStreetView: (p: LatLng, title: string) => void;
  /** 下部シートが地図を覆っている高さ（px）。中心合わせをこの分だけ上にずらす */
  bottomInsetPx: number;
  radiusM: number;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCameraChanged: (center: LatLng) => void;
  /** 地図コンテキスト内に置く追加要素（オーバーレイなど） */
  children?: ReactNode;
};

export default function MapView({
  initialCenter,
  userLocation,
  userAccuracyM,
  searchCenter,
  pickedPoint,
  onStreetView,
  bottomInsetPx,
  radiusM,
  places,
  selectedId,
  onSelect,
  onCameraChanged,
  children,
}: Props) {
  // 基準点が現在地そのものなら、青い現在地マーカーに任せて「基準点」ピンは出さない
  const showBasisPin =
    searchCenter && !(userLocation && distanceMeters(searchCenter, userLocation) < 5);

  return (
    <Map
      mapId={MAP_ID}
      defaultCenter={initialCenter}
      defaultZoom={16}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl={false}
      clickableIcons={false}
      onClick={() => onSelect(null)}
      onCameraChanged={(e: MapCameraChangedEvent) => onCameraChanged(e.detail.center)}
      className="h-full w-full"
    >
      <SearchRadius center={searchCenter} radiusM={radiusM} />
      <AccuracyCircle center={userLocation} radiusM={userAccuracyM} />
      <PanTo target={places.find((p) => p.id === selectedId)?.location ?? null} bottomInsetPx={bottomInsetPx} />
      <PanTo target={searchCenter} bottomInsetPx={bottomInsetPx} />
      {children}

      {showBasisPin && searchCenter && (
        <AdvancedMarker position={searchCenter} zIndex={1001} title="検索の基準点">
          <div className="flex flex-col items-center">
            <div className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
              基準点
            </div>
            <div className="-mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-gray-900" />
            <div className="mt-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-900 shadow" />
          </div>
        </AdvancedMarker>
      )}

      {pickedPoint && (
        <AdvancedMarker position={pickedPoint} zIndex={1002} title="選択中の地点">
          <div className="flex flex-col items-center">
            <div className="h-7 w-7 rounded-full border-[3px] border-white bg-amber-500 shadow-lg" />
            <div className="-mt-px h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-amber-500" />
          </div>
        </AdvancedMarker>
      )}

      {userLocation && (
        <AdvancedMarker position={userLocation} zIndex={1000} title="現在地">
          <div className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow" />
          </div>
        </AdvancedMarker>
      )}

      {places.map((place) => {
        const cat = CATEGORY_MAP.get(place.category);
        const selected = place.id === selectedId;
        return (
          <AdvancedMarker
            key={place.id}
            position={place.location}
            title={place.name}
            zIndex={selected ? 999 : undefined}
            onClick={() => onSelect(selected ? null : place.id)}
          >
            <div className="flex flex-col items-center">
              {selected && (
                <div className="mb-1 max-w-[220px] rounded-lg bg-gray-900/90 px-2.5 py-1.5 text-white shadow-lg">
                  <div className="truncate text-xs font-semibold">
                    {place.sub ? `${place.sub.emoji} ${place.sub.label}：` : ""}
                    {place.name}
                  </div>
                  <div className="text-[10px] text-white/80">
                    基準点から {formatDistance(place.distanceM)}
                    {place.address ? `・${place.address.replace(/^.*?[都道府県]/, "").slice(0, 24)}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStreetView(place.location, place.name);
                    }}
                    className="mt-1 w-full rounded-md bg-white/15 px-2 py-1 text-[11px] font-medium text-white active:bg-white/25"
                  >
                    📷 ストリートビュー
                  </button>
                </div>
              )}
              <CategoryMarker
                emoji={place.sub?.emoji ?? cat?.emoji ?? "📍"}
                color={cat?.color ?? "#6b7280"}
                selected={selected}
              />
            </div>
          </AdvancedMarker>
        );
      })}
    </Map>
  );
}

/** カテゴリ色の丸に絵文字を載せたマーカー。下端が座標に来るように配置する */
function CategoryMarker({
  emoji,
  color,
  selected,
}: {
  emoji: string;
  color: string;
  selected: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center transition-transform duration-150 ${
        selected ? "scale-125" : ""
      }`}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-base shadow-md"
        style={{ backgroundColor: color, boxShadow: selected ? `0 0 0 3px ${color}66, 0 2px 6px rgba(0,0,0,.3)` : undefined }}
      >
        <span className="leading-none">{emoji}</span>
      </div>
      <div
        className="-mt-px h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent"
        style={{ borderTopColor: color }}
      />
    </div>
  );
}

/** 検索範囲の円。react-google-maps に Circle が無いので生 API で描く */
function SearchRadius({ center, radiusM }: { center: LatLng | null; radiusM: number }) {
  return (
    <MapCircle
      center={center}
      radiusM={radiusM}
      options={{ strokeColor: "#0ea5e9", strokeOpacity: 0.6, strokeWeight: 1.5, fillColor: "#0ea5e9", fillOpacity: 0.06 }}
    />
  );
}

/** 現在地の測位精度を示す円 */
function AccuracyCircle({ center, radiusM }: { center: LatLng | null; radiusM: number | null }) {
  // 精度が良すぎる/悪すぎる場合は描いても意味が薄いので範囲を絞る
  const show = center && radiusM !== null && radiusM >= 15 && radiusM <= 2000;
  return (
    <MapCircle
      center={show ? center : null}
      radiusM={radiusM ?? 0}
      options={{ strokeColor: "#0284c7", strokeOpacity: 0.35, strokeWeight: 1, fillColor: "#38bdf8", fillOpacity: 0.12 }}
    />
  );
}

function MapCircle({
  center,
  radiusM,
  options,
}: {
  center: LatLng | null;
  radiusM: number;
  options: google.maps.CircleOptions;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({ ...options, clickable: false });
    }
    const circle = circleRef.current;
    if (center) {
      circle.setCenter(center);
      circle.setRadius(radiusM);
      circle.setMap(map);
    } else {
      circle.setMap(null);
    }
    // options は初回生成時のみ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center, radiusM]);

  useEffect(() => () => circleRef.current?.setMap(null), []);
  return null;
}

/**
 * target が変わったらそこへ滑らかに移動する。
 * 下部シートに隠れていない部分の中心に来るよう、シートの高さの半分だけ地図をずらす。
 */
function PanTo({ target, bottomInsetPx }: { target: LatLng | null; bottomInsetPx: number }) {
  const map = useMap();
  const insetRef = useRef(bottomInsetPx);
  insetRef.current = bottomInsetPx;
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    // シートの高さは初回描画の直後に確定するので、少し待ってから最新値でずらす
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      const offset = insetRef.current / 2;
      if (offset > 0) map.panBy(0, offset);
    };
    const timer = setTimeout(apply, 80);
    const idle = map.addListener("idle", () => {
      // 地図がまだ描画されていなかった場合（非表示タブなど）は最初の idle で適用
      if (!applied) {
        clearTimeout(timer);
        apply();
      }
      idle.remove();
    });
    return () => {
      clearTimeout(timer);
      idle.remove();
    };
  }, [map, target]);
  return null;
}
