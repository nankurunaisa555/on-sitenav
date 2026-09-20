"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * ブラウザがインストール可能と判断したとき（Android Chrome/Brave など）だけ出る「アプリとして追加」ボタン。
 * iOS Safari は beforeinstallprompt が無いので、共有メニューの案内を出す。
 */
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setHidden(true));
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      try {
        setIosHint(sessionStorage.getItem("onsitenav.iosHint") !== "1");
      } catch {
        setIosHint(true);
      }
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          if (outcome === "accepted") setHidden(true);
          setDeferred(null);
        }}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-blue-700 shadow backdrop-blur active:scale-95"
      >
        <span aria-hidden>⤓</span> ホーム画面にアプリを追加
      </button>
    );
  }

  if (iosHint) {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-gray-700 shadow backdrop-blur">
        <span>共有 ⎙ →「ホーム画面に追加」でアプリになります</span>
        <button
          type="button"
          aria-label="閉じる"
          onClick={() => {
            setIosHint(false);
            try {
              sessionStorage.setItem("onsitenav.iosHint", "1");
            } catch {}
          }}
          className="text-gray-400"
        >
          ✕
        </button>
      </div>
    );
  }
  return null;
}
