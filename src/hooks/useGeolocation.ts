"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/types";

export type GeolocationStatus =
  | "idle"
  | "locating"
  | "ok"
  | "denied"
  | "unavailable";

export type GeoFix = LatLng & {
  /** 測位精度（m, 95%信頼半径） */
  accuracyM: number;
};

/** この精度に達したら測位を打ち切る */
const GOOD_ACCURACY_M = 30;
/** 良い精度が得られなくても、この時間で最良の測位結果を採用する */
const SETTLE_MS = 8_000;
/** 最初の測位すら得られない場合のタイムアウト */
const HARD_TIMEOUT_MS = 15_000;

/**
 * 現在地を取得する。初回測位は Wi-Fi 由来で数百 m ずれることがあるため、
 * watchPosition で精度が十分になるまで（または一定時間）待ってから確定する。
 */
export function useGeolocation() {
  const [position, setPosition] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>("idle");

  const locate = useCallback((): Promise<GeoFix | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return Promise.resolve(null);
    }
    setStatus("locating");

    return new Promise((resolve) => {
      let best: GeoFix | null = null;
      let watchId: number | null = null;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;
      let done = false;

      const finish = (fix: GeoFix | null, next: GeolocationStatus) => {
        if (done) return;
        done = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (settleTimer) clearTimeout(settleTimer);
        clearTimeout(hardTimer);
        if (fix) setPosition(fix);
        setStatus(next);
        resolve(fix);
      };

      const hardTimer = setTimeout(() => finish(best, best ? "ok" : "unavailable"), HARD_TIMEOUT_MS);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const fix: GeoFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          };
          if (!best || fix.accuracyM < best.accuracyM) {
            best = fix;
            setPosition(fix); // 途中経過も地図に反映する
          }
          if (fix.accuracyM <= GOOD_ACCURACY_M) {
            finish(best, "ok");
            return;
          }
          // 最初の測位が来た時点から一定時間だけ精度向上を待つ
          if (!settleTimer) settleTimer = setTimeout(() => finish(best, "ok"), SETTLE_MS);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) finish(null, "denied");
          else if (!best) finish(null, "unavailable");
        },
        { enableHighAccuracy: true, timeout: HARD_TIMEOUT_MS, maximumAge: 0 },
      );
    });
  }, []);

  return { position, status, locate };
}
