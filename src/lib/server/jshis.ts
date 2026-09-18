import type { QuakeSection } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

/**
 * 防災科研 J-SHIS（地震ハザードステーション）の地点情報 API。
 * - 確率論的地震動予測地図: 30年以内に各震度以上となる確率
 * - 表層地盤: 増幅率 ARV と微地形区分
 */
const PSHM_URL = "https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson";
const SSTRCT_URL = "https://www.j-shis.bosai.go.jp/map/api/sstrct/V4/meshinfo.geojson";

type FeatureCollection = { features?: { properties?: Record<string, string> }[] };

async function fetchProps(base: string, center: LatLng): Promise<Record<string, string> | null> {
  const url = `${base}?position=${center.lng},${center.lat}&epsg=4326`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) throw new Error(`J-SHIS ${res.status}`);
  const json = (await res.json()) as FeatureCollection;
  return json.features?.[0]?.properties ?? null;
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function jshisUrl(center: LatLng): string {
  return `https://www.j-shis.bosai.go.jp/map/?lat=${center.lat}&lon=${center.lng}&zoom=15`;
}

export async function fetchQuake(center: LatLng): Promise<QuakeSection> {
  const [pshm, sstrct] = await Promise.all([fetchProps(PSHM_URL, center), fetchProps(SSTRCT_URL, center)]);
  return {
    status: "ok",
    p30Int55: num(pshm?.T30_I55_PS),
    p30Int50: num(pshm?.T30_I50_PS),
    arv: num(sstrct?.ARV),
    landform: sstrct?.JNAME ?? null,
    sourceUrl: jshisUrl(center),
  };
}
