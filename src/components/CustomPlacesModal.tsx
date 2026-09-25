"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APP_ICONS,
  iconFiles,
  loadAppIcon,
  saveAppIcon,
  type AppIconId,
} from "@/lib/app-icons";
import { LIST_CATEGORIES } from "@/lib/categories";
import {
  newCustomId,
  parseCustomPlaces,
  type CustomPlace,
} from "@/lib/custom-places";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { NIMBY_KINDS } from "@/lib/nimby";
import type { LatLng } from "@/lib/types";

type Props = {
  items: readonly CustomPlace[];
  basis: LatLng | null;
  saveFailed: boolean;
  onAdd: (p: CustomPlace) => void;
  onRemove: (id: string) => void;
  onImport: (list: CustomPlace[]) => number;
  onClose: () => void;
};

type LocationMode = "basis" | "search";

/** 「種類」の選択肢。value は target:kind */
const KIND_OPTIONS = [
  {
    group: "嫌悪施設",
    target: "nimby" as const,
    options: NIMBY_KINDS.map((k) => ({
      key: k.key,
      label: `${k.emoji} ${k.label}`,
    })),
  },
  {
    group: "周辺施設",
    target: "places" as const,
    options: LIST_CATEGORIES.map((c) => ({
      key: c.key,
      label: `${c.emoji} ${c.label}`,
    })),
  },
];

function kindLabel(p: CustomPlace): string {
  const all =
    p.target === "nimby"
      ? NIMBY_KINDS.map((k) => ({
          key: k.key as string,
          label: `${k.emoji} ${k.label}`,
        }))
      : LIST_CATEGORIES.map((c) => ({
          key: c.key as string,
          label: `${c.emoji} ${c.label}`,
        }));
  return all.find((o) => o.key === p.kind)?.label ?? p.kind;
}

/**
 * 施設の登録（設定）。地図データから自動で出ない施設を、このブラウザに登録する。
 * 場所は「基準点の位置」（地図を長押しして合わせる）か「Google マップのリンク／住所」から決める。
 */
export default function CustomPlacesModal({
  items,
  basis,
  saveFailed,
  onAdd,
  onRemove,
  onImport,
  onClose,
}: Props) {
  const [section, setSection] = useState<"places" | "icon">("places");
  const [kindValue, setKindValue] = useState("nimby:pachinko");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<LocationMode>("search");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{
    location: LatLng;
    label: string;
    address: string;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const location = mode === "basis" ? basis : (found?.location ?? null);
  const canSave = name.trim().length > 0 && location !== null;

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        basis
          ? distanceMeters(basis, a.location) -
            distanceMeters(basis, b.location)
          : b.createdAt.localeCompare(a.createdAt),
      ),
    [items, basis],
  );

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    setFound(null);
    try {
      const res = await fetch(`/api/locate?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as {
        lat?: number;
        lng?: number;
        name?: string;
        address?: string;
        matched?: string;
        error?: string;
      };
      if (!res.ok || json.lat === undefined || json.lng === undefined)
        throw new Error(json.error ?? "位置が見つかりませんでした");
      setFound({
        location: { lat: json.lat, lng: json.lng },
        label:
          json.matched ??
          json.name ??
          `${json.lat.toFixed(5)}, ${json.lng.toFixed(5)}`,
        address: json.address ?? "",
      });
      if (json.name && !name.trim()) setName(json.name);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "位置を調べられませんでした",
      );
    } finally {
      setSearching(false);
    }
  };

  const save = () => {
    if (!canSave || !location) return;
    const [target, kind] = kindValue.split(":") as [
      CustomPlace["target"],
      CustomPlace["kind"],
    ];
    onAdd({
      id: newCustomId(),
      target,
      kind,
      name: name.trim(),
      address: mode === "search" ? (found?.address ?? "") : "",
      location,
      createdAt: new Date().toISOString(),
    });
    setName("");
    setQuery("");
    setFound(null);
    setMessage(`「${name.trim()}」を登録しました`);
  };

  const exportFile = () => {
    const blob = new Blob(
      [JSON.stringify({ app: "On-siteNav", version: 1, items }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `onsitenav-登録施設-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const n = onImport(parseCustomPlaces(await file.text()));
      setMessage(`${n}件を読み込みました`);
    } catch {
      setMessage(
        "ファイルを読み込めませんでした（書き出したファイルを選んでください）",
      );
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-label="設定"
    >
      <div className="scroll-visible flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">設定</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-gray-600 active:bg-gray-100"
          >
            閉じる
          </button>
        </div>
        <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-0.5 text-sm font-medium">
          {(
            [
              ["places", "施設の登録"],
              ["icon", "アプリアイコン"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSection(k)}
              className={`flex-1 rounded-md px-2 py-1.5 ${section === k ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === "icon" ? (
          <AppIconPicker />
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-gray-500">
              地図データから自動で出ない施設を登録すると、周辺施設・嫌悪施設タブの一覧と地図に「★登録」として出ます。
              登録はこのブラウザにだけ保存されます（別の端末へは下の「書き出し」「読み込み」で移せます）。
            </p>

            <div className="space-y-3 rounded-xl border border-gray-200 p-3">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-gray-700">
                  種類
                </span>
                <select
                  value={kindValue}
                  onChange={(e) => setKindValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                >
                  {KIND_OPTIONS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o.key} value={`${g.target}:${o.key}`}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div className="text-sm">
                <span className="mb-1 block font-semibold text-gray-700">
                  場所
                </span>
                <div className="mb-2 flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
                  {(
                    [
                      ["search", "リンク・住所"],
                      ["basis", "今の基準点"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`flex-1 rounded-md px-2 py-1.5 ${mode === m ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mode === "search" ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void search()}
                        placeholder="https://maps.app.goo.gl/… または 住所"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void search()}
                        disabled={searching || !query.trim()}
                        className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                      >
                        {searching ? "…" : "調べる"}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      Google
                      マップで施設を開き「共有」→「リンクをコピー」したものを貼ると、位置と名前が入ります。
                    </p>
                    {found && (
                      <p className="mt-1 text-xs text-emerald-700">
                        📍 {found.label}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">
                    {basis
                      ? `基準点（${basis.lat.toFixed(5)}, ${basis.lng.toFixed(5)}）に登録します。先に地図を長押しして、基準点を施設の位置に合わせてください。`
                      : "基準点がありません。地図を長押しして施設の位置に基準点を置いてください。"}
                  </p>
                )}
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-gray-700">
                  名前
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: SLOTスマートガーデン武蔵浦和331"
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                登録する
              </button>
              {message && <p className="text-xs text-gray-700">{message}</p>}
              {saveFailed && (
                <p className="text-xs text-red-600">
                  このブラウザに保存できませんでした（プライベートモードなど）。閉じると登録が消えます。
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">
                  登録した施設 {items.length}件
                </h3>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={exportFile}
                    disabled={items.length === 0}
                    className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
                  >
                    書き出し
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    読み込み
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
              {sorted.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  まだ登録はありません
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {sorted.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {p.name}
                        </div>
                        <div className="truncate text-[11px] text-gray-500">
                          {p.target === "nimby" ? "嫌悪施設" : "周辺施設"}・
                          {kindLabel(p)}
                          {basis
                            ? `・基準点から${formatDistance(distanceMeters(basis, p.location))}`
                            : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `「${p.name}」の登録を削除しますか？`,
                            )
                          )
                            onRemove(p.id);
                        }}
                        className="shrink-0 rounded border border-red-200 px-2 py-1 text-xs text-red-600"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** アプリアイコンの選択。選んだものはタブのアイコンと、これからホーム画面に追加するときのアイコンになる */
function AppIconPicker() {
  const [current, setCurrent] = useState<AppIconId | null>(null);
  useEffect(() => setCurrent(loadAppIcon()), []);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {APP_ICONS.map((icon) => {
          const selected = current === icon.id;
          return (
            <button
              key={icon.id}
              type="button"
              onClick={() => {
                saveAppIcon(icon.id);
                setCurrent(icon.id);
              }}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition ${
                selected
                  ? "border-blue-600 bg-blue-50"
                  : "border-transparent active:bg-gray-50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iconFiles(icon.id).png192}
                alt=""
                width={72}
                height={72}
                className="h-18 w-18 drop-shadow-md"
              />
              <span className="text-xs font-semibold text-gray-900">
                {icon.name}
              </span>
              <span className="text-[10px] leading-tight text-gray-500">
                {icon.description}
              </span>
              <span
                className={`text-[11px] font-bold ${selected ? "text-blue-600" : "text-transparent"}`}
              >
                ✓ 使用中
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
        <p>
          選んだアイコンは、ブラウザのタブと、これから「ホーム画面に追加」するときのアイコンになります（このブラウザに保存）。
        </p>
        <p>
          すでにホーム画面にあるアイコンは、追加したときのままです。変えるには、ホーム画面のアイコンを削除してから、
          もう一度「ホーム画面にアプリを追加」してください（Android
          では時間がたつと自動で変わることもあります）。
        </p>
      </div>
    </div>
  );
}
