"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  AdvancedMarker,
  Map,
  useMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps";
import { CATEGORY_MAP } from "@/lib/categories";
import type { LatLng, Place } from "@/lib/types";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

type Props = {
  initialCenter: LatLng;
  userLocation: LatLng | null;
  searchCenter: LatLng | null;
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
  searchCenter,
  radiusM,
  places,
  selectedId,
  onSelect,
  onCameraChanged,
  children,
}: Props) {
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
      <PanTo target={places.find((p) => p.id === selectedId)?.location ?? null} />
      <PanTo target={searchCenter} />
      {children}

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
            <CategoryMarker
              emoji={cat?.emoji ?? "📍"}
              color={cat?.color ?? "#6b7280"}
              selected={selected}
            />
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
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        strokeColor: "#0ea5e9",
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
        fillColor: "#0ea5e9",
        fillOpacity: 0.06,
        clickable: false,
      });
    }
    const circle = circleRef.current;
    if (center) {
      circle.setCenter(center);
      circle.setRadius(radiusM);
      circle.setMap(map);
    } else {
      circle.setMap(null);
    }
  }, [map, center, radiusM]);

  useEffect(() => () => circleRef.current?.setMap(null), []);
  return null;
}

/** target が変わったらそこへ滑らかに移動する */
function PanTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && target) map.panTo(target);
  }, [map, target]);
  return null;
}
