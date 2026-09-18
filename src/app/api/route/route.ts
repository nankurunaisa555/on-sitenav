import { NextResponse } from "next/server";
import type { RouteResponse } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Google Routes API（徒歩）の中継。
 * https://developers.google.com/maps/documentation/routes/compute_route_directions
 */
const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { expires: number; data: RouteResponse }>();

function parseLatLng(raw: string | null): LatLng | null {
  if (!raw) return null;
  const [latS, lngS] = raw.split(",");
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Google の encoded polyline を緯度経度列に戻す */
function decodePolyline(encoded: string): LatLng[] {
  const path: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === "lat") lat += delta;
      else lng += delta;
    }
    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}

type RoutesApiResponse = {
  routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = parseLatLng(searchParams.get("from"));
  const to = parseLatLng(searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "from と to（lat,lng）は必須です" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "サーバー環境変数 GOOGLE_MAPS_API_KEY が未設定です" }, { status: 500 });
  }

  const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "WALK",
        languageCode: "ja",
        units: "METRIC",
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as RoutesApiResponse & { error?: { message?: string; status?: string } };
    if (!res.ok) {
      console.error("[api/route] Routes API", res.status, JSON.stringify(json.error ?? json).slice(0, 300));
      const disabled = json.error?.status === "PERMISSION_DENIED";
      return NextResponse.json(
        { error: disabled ? "Routes API が Google Cloud で有効になっていません" : "ルートを取得できませんでした" },
        { status: 502 },
      );
    }
    const route = json.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!route || !encoded) {
      return NextResponse.json({ error: "ルートが見つかりませんでした" }, { status: 404 });
    }
    const data: RouteResponse = {
      distanceM: route.distanceMeters ?? 0,
      durationS: Number.parseInt((route.duration ?? "0s").replace("s", ""), 10) || 0,
      path: decodePolyline(encoded),
    };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    console.error("[api/route]", err);
    return NextResponse.json({ error: "ルートの取得に失敗しました" }, { status: 502 });
  }
}
