"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import 'mapbox-gl/dist/mapbox-gl.css'; // Mapboxのスタイル崩れ防止
import { fetchSurroundingFacts } from "../lib/facts"; // 相対パスに変更
import FactCard from "./FactCard";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [facts, setFacts] = useState<any>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [longitude, latitude],
        zoom: 15,
      });

      new mapboxgl.Marker({ color: "red" })
        .setLngLat([longitude, latitude])
        .addTo(map.current!);

      const initialFacts = await fetchSurroundingFacts(latitude, longitude);
      setFacts(initialFacts);

      map.current!.on("moveend", async () => {
        const center = map.current!.getCenter();
        const newFacts = await fetchSurroundingFacts(center.lat, center.lng);
        setFacts(newFacts);
      });
    });
  }, []);

  return (
    <div className="w-full h-[80vh] rounded-lg overflow-hidden relative">
      <div ref={mapContainer} className="w-full h-full" />
      {facts && <FactCard facts={facts} />}
    </div>
  );
}
