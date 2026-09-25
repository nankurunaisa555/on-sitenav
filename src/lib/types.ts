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
  /** OSM か Google のどちらかが取れなかった（結果が少ない可能性がある） */
  partial?: boolean;
  /** Yahoo! ローカルサーチ（パチンコ店・ラブホテル）を使ったか。Client ID 未設定なら false */
  yahoo?: boolean;
};

export type PlacesResponse = {
  center: LatLng;
  radiusM: number;
  places: Place[];
  /** 半径に関係なく、距離順に見つけた最寄り駅（重複路線・出入口は除外） */
  nearestStations: Place[];
};

/** /api/places の応答（距離は丸めた地点から。クライアントで測り直す） */
export type PlacesApiResponse = {
  center: LatLng;
  radiusM: number;
  places: Place[];
};

/** /api/stations の応答（丸めた地点から近い順の駅候補） */
export type StationsResponse = {
  center: LatLng;
  stations: Place[];
};

export type PlacesErrorResponse = {
  error: string;
};
