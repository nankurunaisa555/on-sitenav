"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchSurroundingFacts } from "../lib/facts";
import FactCard from "./FactCard";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [facts, setFacts] = useState<any>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        if (!map.current) {
          map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [longitude, latitude],
            zoom: 15,
          });

          new mapboxgl.Marker({ color: "red" })
            .setLngLat([longitude, latitude])
            .addTo(map.current);

          map.current.on("moveend", async () => {
            try {
              const center = map.current!.getCenter();
              const newFacts = await fetchSurroundingFacts(center.lat, center.lng);
              setFacts(newFacts);
            } catch (e) {
              console.error("Facts取得エラー:", e);
            }
          });
        }

        fetchSurroundingFacts(latitude, longitude)
          .then(setFacts)
          .catch((e) => console.error("Facts取得エラー:", e));
      },
      (err) => {
        console.error("位置情報取得エラー:", err);
        // 位置情報が取れなくても東京駅を中心に地図を表示
        if (!map.current && mapContainer.current) {
          map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [139.7671, 35.6812],
            zoom: 14,
          });
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return (
    <div style={{ width: "100%", height: "80vh", minHeight: "500px", position: "relative" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {facts && <FactCard facts={facts} />}
    </div>
  );
}
