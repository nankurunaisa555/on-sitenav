"use client";

import { useEffect } from "react";

/** 本番だけサービスワーカーを登録する（開発中は HMR と干渉するので登録しない） */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 登録できなくても通常の Web アプリとして動く */
    });
  }, []);
  return null;
}
