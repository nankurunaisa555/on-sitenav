"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCustomPlaces, saveCustomPlaces, type CustomPlace } from "@/lib/custom-places";

/** 利用者が登録した施設（このブラウザに保存） */
export function useCustomPlaces() {
  const [items, setItems] = useState<CustomPlace[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);

  // localStorage はブラウザでだけ読めるので、描画後に読み込む
  useEffect(() => {
    setItems(loadCustomPlaces());
  }, []);

  const commit = useCallback((next: CustomPlace[]) => {
    setItems(next);
    setSaveFailed(!saveCustomPlaces(next));
  }, []);

  const add = useCallback((p: CustomPlace) => commit([...loadCustomPlaces(), p]), [commit]);
  const remove = useCallback((id: string) => commit(loadCustomPlaces().filter((p) => p.id !== id)), [commit]);
  /** 読み込んだファイルを合流（同じ ID は上書き） */
  const importMany = useCallback(
    (list: CustomPlace[]) => {
      const byId = new Map(loadCustomPlaces().map((p) => [p.id, p]));
      for (const p of list) byId.set(p.id, p);
      commit([...byId.values()]);
      return list.length;
    },
    [commit],
  );

  return { items, add, remove, importMany, saveFailed };
}
