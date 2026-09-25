import { CATEGORIES, classify } from "@/lib/categories";
import { distanceMeters } from "@/lib/geo";
import type { CategoryKey, LatLng, Place } from "@/lib/types";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// rating 等を含めると上位 SKU（Enterprise）課金になるため、Pro SKU の範囲に限定する
const FIELD_MASK = ["places.id", "places.displayName", "places.types", "places.location", "places.formattedAddress"].join(",");

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
};

/** Nearby Search（Pro SKU）1回。1回ごとに課金される（月5,000回まで無料） */
export async function searchNearbyCategories(
  apiKey: string,
  center: LatLng,
  radiusM: number,
  keys: readonly CategoryKey[],
  maxResultCount: number,
): Promise<Place[]> {
  const includedTypes = keys.flatMap((key) => CATEGORIES.find((c) => c.key === key)?.googleTypes ?? []);
  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      includedTypes,
      maxResultCount,
      rankPreference: "DISTANCE",
      languageCode: "ja",
      regionCode: "JP",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { places?: GooglePlace[] };
  return (json.places ?? []).map((raw) => toPlace(raw, center)).filter((p): p is Place => p !== null);
}

/** "日本、〒100-0005 東京都千代田区…" → "東京都千代田区…" */
function tidyAddress(address: string): string {
  return address.replace(/^日本[、,]\s*/, "").replace(/^〒?\d{3}-?\d{4}\s*/, "").trim();
}

function toPlace(raw: GooglePlace, center: LatLng): Place | null {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  const category = classify(raw.types ?? []);
  if (!raw.id || lat === undefined || lng === undefined || !category) return null;
  const location = { lat, lng };
  return {
    id: raw.id,
    name: raw.displayName?.text ?? "名称不明",
    category,
    location,
    address: tidyAddress(raw.formattedAddress ?? ""),
    distanceM: distanceMeters(center, location),
  };
}
