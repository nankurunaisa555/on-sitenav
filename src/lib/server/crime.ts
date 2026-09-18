import { CRIME_PREFS, crimeTotal, guessPrefCode, type CrimeDataset, type CrimePoint } from "@/lib/crime";
import type { CrimeSection } from "@/lib/facts-types";
import { distanceMeters } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/** 近隣として列挙する町丁目代表点の最大距離・件数 */
const NEARBY_M = 600;
const NEARBY_COUNT = 4;
const AROUND_M = 500;

const cache = new Map<number, Promise<CrimeDataset>>();
function loadDataset(code: number): Promise<CrimeDataset> | null {
  const def = CRIME_PREFS[code];
  if (!def) return null;
  let p = cache.get(code);
  if (!p) {
    p = def.load();
    cache.set(code, p);
  }
  return p;
}

function byType(ds: CrimeDataset, counts: number[]) {
  return ds.types
    .map((type, i) => ({ type, count: counts[i] ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export async function fetchCrime(center: LatLng): Promise<CrimeSection> {
  const code = guessPrefCode(center);
  const loader = code !== null ? loadDataset(code) : null;
  if (!loader) {
    return { status: "ok", available: false, pref: null, year: null, nearby: [], around500m: null, sourceUrl: null };
  }
  const ds = await loader;

  const nearby: { pt: CrimePoint; d: number }[] = [];
  const around: CrimePoint[] = [];
  for (const pt of ds.points) {
    // 粗い矩形で足切りしてから正確に測る
    if (Math.abs(pt.lat - center.lat) > 0.01 || Math.abs(pt.lng - center.lng) > 0.012) continue;
    const d = distanceMeters(center, pt);
    if (d <= AROUND_M) around.push(pt);
    if (d <= NEARBY_M) nearby.push({ pt, d });
  }
  nearby.sort((a, b) => a.d - b.d);

  const sum = ds.types.map((_, i) => around.reduce((acc, pt) => acc + (pt.c[i] ?? 0), 0));

  return {
    status: "ok",
    available: true,
    pref: ds.pref,
    year: ds.year,
    nearby: nearby.slice(0, NEARBY_COUNT).map(({ pt, d }) => ({
      name: pt.n,
      distanceM: Math.round(d),
      total: crimeTotal(pt),
      byType: byType(ds, pt.c),
    })),
    around500m: around.length
      ? { total: sum.reduce((a, b) => a + b, 0), byType: byType(ds, sum), townCount: around.length }
      : null,
    sourceUrl: ds.sourceUrl,
  };
}
