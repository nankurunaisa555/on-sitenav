import type { ElevationSection } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

/** 国土地理院 標高 API（キー不要） */
const URL = "https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php";

export async function fetchElevation(center: LatLng): Promise<ElevationSection> {
  const res = await fetch(`${URL}?lon=${center.lng}&lat=${center.lat}&outtype=JSON`, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) throw new Error(`GSI elevation ${res.status}`);
  const json = (await res.json()) as { elevation?: number | string; hsrc?: string };
  const n = Number(json.elevation);
  return {
    status: "ok",
    elevationM: Number.isFinite(n) ? n : null,
    source: json.hsrc ?? null,
  };
}
