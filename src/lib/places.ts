export async function fetchPlaces(lat: number, lng: number) {
  try {
    // サーバー側（/api/places）を経由してデータを安全に取得
    const res = await fetch(`/api/places?lat=${lat}&lng=${lng}`);

    if (!res.ok) {
      console.error(`Places API エラー (${res.status})`);
      return [];
    }

    const data = await res.json();
    return data.places || [];
  } catch (e) {
    console.error("fetchPlaces エラー:", e);
    return [];
  }
}
