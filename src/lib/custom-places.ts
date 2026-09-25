import type { NimbyKindKey } from "@/lib/nimby";
import type { CategoryKey, LatLng } from "@/lib/types";

/**
 * 利用者が自分で登録する施設（地図データから自動で出ないもの）。
 * このブラウザの localStorage にだけ保存する（他の端末には出ない。書き出し・読み込みで移せる）。
 */
export type CustomPlace = {
  id: string;
  /** 周辺施設タブに出すか、嫌悪施設タブに出すか */
  target: "places" | "nimby";
  /** target=places なら周辺施設のカテゴリ、nimby なら嫌悪施設の種類 */
  kind: CategoryKey | NimbyKindKey;
  name: string;
  address: string;
  location: LatLng;
  note?: string;
  createdAt: string;
};

const STORAGE_KEY = "onsitenav.customPlaces.v1";

function isCustomPlace(x: unknown): x is CustomPlace {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  const loc = p.location as Record<string, unknown> | undefined;
  return (
    typeof p.id === "string" &&
    (p.target === "places" || p.target === "nimby") &&
    typeof p.kind === "string" &&
    typeof p.name === "string" &&
    typeof loc?.lat === "number" &&
    typeof loc?.lng === "number"
  );
}

/** 読み込み。保存領域が使えない環境（プライベートモード等）では空 */
export function loadCustomPlaces(): CustomPlace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseCustomPlaces(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPlaces(list: readonly CustomPlace[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** 書き出したファイル（または保存値）を読む。形式の合わないものは捨てる */
export function parseCustomPlaces(text: string): CustomPlace[] {
  const json = JSON.parse(text) as unknown;
  const arr = Array.isArray(json) ? json : (json as { items?: unknown }).items;
  if (!Array.isArray(arr)) return [];
  return arr.filter(isCustomPlace).map((p) => ({ ...p, address: p.address ?? "" }));
}

export function newCustomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
