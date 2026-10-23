"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReportMap from "./ReportMap";
import { buildSection, type ReportInput, type ReportTabKey } from "./sections";
import { routeColor, type RouteState, type RouteTarget } from "@/hooks/useRoutes";
import type { RouteResponse } from "@/lib/facts-types";
import type { LatLng } from "@/lib/types";

const TAB_LABELS: Record<ReportTabKey, string> = {
  places: "周辺施設",
  land: "土地・災害",
  community: "交通・学区・人口",
  price: "価格",
  nimby: "嫌悪施設",
};
const ALL: ReportTabKey[] = ["places", "land", "community", "price", "nimby"];
type Choice = ReportTabKey | "all";

type Props = Omit<ReportInput, "routes"> & {
  initialTab: ReportTabKey;
  /** 見出しに出す基準点の住所（町名まで） */
  address: string;
  /** 嫌悪施設が未取得なら取りに行く */
  onNeedNimby: () => void;
  onClose: () => void;
};

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** レポート用の徒歩ルート（学校2つ・最寄り駅1つ）。Routes API の無料枠内（月1万回） */
function useReportRoutes(center: LatLng, targets: { key: RouteTarget; label: string; to: LatLng | null }[], enabled: boolean) {
  const [routes, setRoutes] = useState<ReadonlyMap<RouteTarget, RouteState>>(new Map());
  const sig = targets.map((t) => `${t.key}:${t.to?.lat},${t.to?.lng}`).join("|");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void Promise.all(
      targets
        .filter((t) => t.to)
        .map(async (t): Promise<RouteState | null> => {
          try {
            const res = await fetch(`/api/route?from=${center.lat},${center.lng}&to=${t.to!.lat},${t.to!.lng}`);
            if (!res.ok) return null;
            const r = (await res.json()) as RouteResponse;
            return { target: t.key, label: t.label, destination: t.to!, color: routeColor(t.key), status: "ok", ...r };
          } catch {
            return null;
          }
        }),
    ).then((list) => {
      if (alive) setRoutes(new Map(list.filter((r): r is RouteState => r !== null).map((r) => [r.target, r])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, center.lat, center.lng, sig]);
  return routes;
}

/**
 * タブ別のまとめ（A4）。プレビューを見て「PDFに保存」でブラウザの印刷画面を開く
 * （スマホは「PDFとして保存」、PC は送信先「PDFに保存」）。
 */
export default function ReportView(props: Props) {
  const { center, address, initialTab, onClose, onNeedNimby } = props;
  const [choice, setChoice] = useState<Choice>(initialTab);
  const keys = choice === "all" ? ALL : [choice];
  const [created] = useState(() => new Date());

  // プレビューも印刷と同じ A4 幅（210mm ≒ 794px）で描き、狭い画面では見た目だけ縮小する（transform）。
  // レイアウト上の大きさを変えないのは、印刷時に地図の大きさが変わると描き直しが間に合わず空白になるため
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setScale(Math.min(1, (window.innerWidth - 16) / 794));
    update();
    window.addEventListener("resize", update);
    const el = innerRef.current;
    const ro = el ? new ResizeObserver(() => setInnerH(el.offsetHeight)) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, []);

  const needsCommunity = keys.includes("community");
  const school = props.facts?.school;
  const routes = useReportRoutes(
    center,
    [
      { key: "elementary", label: school?.elementary?.name ?? "小学校", to: school?.elementary?.location ?? null },
      { key: "juniorHigh", label: school?.juniorHigh?.name ?? "中学校", to: school?.juniorHigh?.location ?? null },
      { key: "station-0", label: props.stations[0]?.name ?? "最寄り駅", to: props.stations[0]?.location ?? null },
    ],
    needsCommunity,
  );

  useEffect(() => {
    if (keys.includes("nimby") && props.nimbyItems === null) onNeedNimby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, props.nimbyItems]);

  const sections = useMemo(() => keys.map((k) => buildSection(k, { ...props, routes })), [keys.join(","), props, routes]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 印刷画面を開く。保存されるPDFのファイル名は document.title になる */
  const print = () => {
    const prev = document.title;
    const label = choice === "all" ? "現地ファクト" : TAB_LABELS[choice];
    const d = created;
    document.title = `On-siteNav_${label}_${address.replace(/[\/:*?"<>|\s]/g, "")}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div id="osn-report-root" className="fixed inset-0 z-[60] bg-gray-200">
      <div className="osn-report-scroll h-full overflow-y-auto pb-10">
        {/* 操作バー（印刷しない） */}
        <div className="osn-no-print sticky top-0 z-10 border-b border-gray-300 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-900">PDFレポート</span>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value as Choice)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
              aria-label="レポートにするタブ"
            >
              {ALL.map((k) => (
                <option key={k} value={k}>
                  {TAB_LABELS[k]}
                </option>
              ))}
              <option value="all">すべてのタブ</option>
            </select>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                閉じる
              </button>
              <button type="button" onClick={print} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">
                PDFに保存
              </button>
            </div>
          </div>
          <p className="mx-auto mt-1 max-w-[210mm] text-[11px] text-gray-500">
            「PDFに保存」で印刷画面が開きます。プリンターの選択で「PDFとして保存」を選んでください。
          </p>
        </div>

        <div className="osn-report-outer mx-auto" style={{ width: 794 * scale, height: innerH * scale }}>
        <div ref={innerRef} className="osn-report-inner" style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {sections.map((s) => (
          <article
            key={s.key}
            className="osn-page mt-4 w-[210mm] rounded-md bg-white p-[12mm] text-gray-900 shadow"
          >
            {/* 見出し */}
            <header className="mb-3 flex items-start justify-between gap-3 border-b-2 border-blue-600 pb-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold tracking-wider text-blue-700">On-siteNav 現地ファクトレポート</div>
                <h2 className="text-[20px] leading-tight font-bold">{s.title}</h2>
                <div className="mt-0.5 text-[11px] text-gray-600">
                  基準点：{address || "—"}（{center.lat.toFixed(5)}, {center.lng.toFixed(5)}）
                </div>
              </div>
              <div className="shrink-0 text-right text-[10px] text-gray-500">
                作成 {fmtDate(created)}
                <br />
                https://on-sitenav.vercel.app
              </div>
            </header>
            {s.lead && <p className="mb-2 text-[11px] leading-relaxed text-gray-600">{s.lead}</p>}

            <ReportMap center={center} markers={s.markers} hazards={s.hazards} routes={s.routes} height={215} />

            {s.body}

            <footer className="osn-avoid-break mt-3 border-t border-gray-200 pt-2 text-[9px] leading-relaxed text-gray-500">
              <div>出典：{s.sources}</div>
              <div>
                表示はすべて公開データにもとづく目安です。正式な区域・学区・規制は各自治体の窓口や公式の資料でご確認ください。距離は基準点からの直線距離（「道なり」は徒歩ルート）です。
              </div>
            </footer>
          </article>
        ))}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
