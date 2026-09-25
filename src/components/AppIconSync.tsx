"use client";

import { useEffect } from "react";
import { APP_ICON_EVENT, iconFiles, isAppIconId, loadAppIcon, type AppIconId } from "@/lib/app-icons";

/**
 * 設定で選んだアプリアイコンを、タブのアイコン・ホーム画面追加用の <link> に反映する。
 * <link> はレイアウトのメタデータ（既定のアイコン）が出すものを書き換える。
 * Next.js はメタデータを後から差し込むことがあるので、追加された <link> も見張って書き換える。
 */
function apply(id: AppIconId) {
  const f = iconFiles(id);
  const want: Record<string, string> = {
    icon: f.svg,
    "apple-touch-icon": f.apple,
    manifest: `/manifest.webmanifest?icon=${id}`,
  };
  for (const [rel, href] of Object.entries(want)) {
    document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`).forEach((el) => {
      if (el.getAttribute("href") !== href) el.setAttribute("href", href);
    });
  }
}

export default function AppIconSync() {
  useEffect(() => {
    let current = loadAppIcon();
    apply(current);
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (isAppIconId(id)) {
        current = id;
        apply(id);
      }
    };
    const observer = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLLinkElement))) apply(current);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener(APP_ICON_EVENT, onChange);
    return () => {
      observer.disconnect();
      window.removeEventListener(APP_ICON_EVENT, onChange);
    };
  }, []);
  return null;
}
