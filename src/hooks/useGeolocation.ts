"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/types";

export type GeolocationStatus =
  | "idle"
  | "locating"
  | "ok"
  | "denied"
  | "unavailable";

export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>("idle");

  const locate = useCallback((): Promise<LatLng | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return Promise.resolve(null);
    }
    setStatus("locating");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(next);
          setStatus("ok");
          resolve(next);
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  }, []);

  return { position, status, locate };
}
