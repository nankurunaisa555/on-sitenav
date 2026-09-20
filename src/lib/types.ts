export type LatLng = {
  lat: number;
  lng: number;
};

export type CategoryKey =
  | "supermarket"
  | "convenience"
  | "medical"
  | "pharmacy"
  | "school"
  | "childcare"
  | "park"
  | "station"
  | "bus"
  | "restaurant"
  | "bank"
  | "post"
  | "shopping"
  | "government"
  | "library"
  | "nimby"
  | "shelter"
  | "landprice";

export type Place = {
  id: string;
  name: string;
  category: CategoryKey;
  location: LatLng;
  address: string;
  /** 検索中心からの距離（メートル） */
  distanceM: number;
  /** 細分類（嫌悪施設の種別など）。あればピンの絵文字と一覧の表記に使う */
  sub?: { key: string; label: string; emoji: string };
  /** ピンの下に常時出す短いラベル（地価公示の価格など） */
  badge?: string;
};

export type NimbyPlace = Place & { category: "nimby"; sub: NonNullable<Place["sub"]> };

export type NimbyResponse = {
  center: LatLng;
  radiusM: number;
  items: NimbyPlace[];
};

export type PlacesResponse = {
  center: LatLng;
  radiusM: number;
  places: Place[];
  /** 半径に関係なく、距離順に見つけた最寄り駅（重複路線・出入口は除外） */
  nearestStations: Place[];
};

export type PlacesErrorResponse = {
  error: string;
};
