import { fetchPlaces } from "./places";

export async function fetchSurroundingFacts(lat: number, lng: number) {
  const places = await fetchPlaces(lat, lng);

  return {
    places,
    landuse: {
      用途地域: "第一種低層住居専用地域", // ダミー
    },
  };
}
