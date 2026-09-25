/**
 * 選べるアプリアイコン。画像は scripts/build-icons.mjs が public/icons/<id>/ に作る（id を揃えること）。
 * 選択はこのブラウザの localStorage に保存し、タブのアイコン・ホーム画面に追加するときのアイコンに使う。
 */
export const APP_ICONS = [
  { id: "blue", name: "ブルー・ピン", description: "青のグラデーションに白いピン" },
  { id: "map", name: "マップ", description: "明るい地図に赤いピン" },
  { id: "home", name: "ナイト・ホーム", description: "ダークに白い家と現在地の輪" },
] as const;

export type AppIconId = (typeof APP_ICONS)[number]["id"];
export const DEFAULT_APP_ICON: AppIconId = "blue";
const STORAGE_KEY = "onsitenav.appIcon";
/** 選択が変わったことを同じページ内に知らせるイベント */
export const APP_ICON_EVENT = "onsitenav:app-icon";

export function isAppIconId(v: unknown): v is AppIconId {
  return APP_ICONS.some((i) => i.id === v);
}

export function iconFiles(id: AppIconId) {
  const dir = `/icons/${id}`;
  return {
    svg: `${dir}/icon.svg`,
    png192: `${dir}/icon-192.png`,
    png512: `${dir}/icon-512.png`,
    maskable: `${dir}/icon-maskable-512.png`,
    apple: `${dir}/apple-touch-icon.png`,
  };
}

export function loadAppIcon(): AppIconId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isAppIconId(v) ? v : DEFAULT_APP_ICON;
  } catch {
    return DEFAULT_APP_ICON;
  }
}

export function saveAppIcon(id: AppIconId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* 保存できなくても、このページを開いている間は反映される */
  }
  window.dispatchEvent(new CustomEvent(APP_ICON_EVENT, { detail: id }));
}
