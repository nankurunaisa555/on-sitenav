/**
 * 警察の「犯罪オープンデータ」（窃盗7手口・町丁目単位）を集計し、
 * 国交省「位置参照情報」で町丁目の代表点座標を付けて src/data/crime-<県コード>.json を生成する。
 *
 *   node scripts/build-crime-data.mjs [--pref 11] [--year 2024]
 *
 * 現在は埼玉県（11）の URL 定義のみ。他県を足すときは PREFS に CSV の URL を追加する。
 * 出典: 埼玉県警察 犯罪オープンデータ / 国土交通省 位置参照情報（大字・町丁目レベル）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../src/data");

/** 手口の並び。JSON の counts 配列はこの順 */
export const CRIME_TYPES = [
  "ひったくり",
  "車上ねらい",
  "部品ねらい",
  "自動販売機ねらい",
  "自動車盗",
  "オートバイ盗",
  "自転車盗",
];

const PREFS = {
  11: {
    name: "埼玉県",
    isjZip: "https://nlftp.mlit.go.jp/isj/dls/data/17.0b/11000-17.0b.zip",
    csv: (year) => {
      const base = "https://www.police.pref.saitama.lg.jp/documents/33251";
      return {
        ひったくり: `${base}/saitama_${year}hittakuri.csv`,
        車上ねらい: `${base}/saitama_${year}syazyounerai.csv`,
        部品ねらい: `${base}/saitama_${year}buhinnerai.csv`,
        自動販売機ねらい: `${base}/saitama_${year}zidouhanbaikinerai.csv`,
        自動車盗: `${base}/saitama_${year}zidousyatou.csv`,
        オートバイ盗: `${base}/saitama_${year}ootobaitou.csv`,
        自転車盗: `${base}/saitama_${year}zitensyatou.csv`,
      };
    },
    sourceUrl: "https://www.police.pref.saitama.lg.jp/c0011/kurashi/0pendata2019/opendate-2019.html",
  },
};

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const prefCode = Number(arg("pref", "11"));
const year = Number(arg("year", "2024"));
const pref = PREFS[prefCode];
if (!pref) throw new Error(`県コード ${prefCode} の定義がありません`);

// ---------- 文字コード・CSV ----------
function decode(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder("utf-8").decode(u8.subarray(3));
  // BOM 無しは Shift_JIS とみなす（UTF-8 として不正なら SJIS）
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder("shift_jis").decode(u8);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- 町丁目名の正規化 ----------
const KANJI_NUM = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiToNumber(s) {
  // 一〜九十九 まで（丁目用）
  if (/^\d+$/.test(s)) return Number(s);
  let n = 0;
  const parts = s.split("十");
  if (parts.length === 2) {
    n += (parts[0] === "" ? 1 : KANJI_NUM[parts[0]] ?? 0) * 10;
    n += parts[1] === "" ? 0 : KANJI_NUM[parts[1]] ?? 0;
    return n;
  }
  return [...s].reduce((acc, ch) => acc * 10 + (KANJI_NUM[ch] ?? 0), 0);
}
function normalizeTown(name) {
  return name
    .normalize("NFKC") // 全角数字→半角
    .replace(/[ヶケ]/g, "ケ") // 戸ヶ崎／戸ケ崎
    .replace(/^大字/, "")
    .replace(/\s/g, "")
    .replace(/([〇一二三四五六七八九十\d]+)丁目$/, (_, num) => `${kanjiToNumber(num)}丁目`)
    .replace(/字/g, "")
    .trim();
}
function normalizeCity(name) {
  // 位置参照情報は「入間郡三芳町」、警察は「三芳町」なので郡名を落とす
  return name.normalize("NFKC").replace(/\s/g, "").replace(/^.+?郡(?=.+[町村]$)/, "");
}

// ---------- メイン ----------
async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

console.log(`▶ ${pref.name} ${year}年 犯罪オープンデータを集計します`);

// 1) 位置参照情報（町丁目 → 代表点）
console.log("  位置参照情報を取得中…");
const zip = unzipSync(new Uint8Array(await fetchBuf(pref.isjZip)));
const isjName = Object.keys(zip).find((n) => /\.csv$/i.test(n));
const isjRows = parseCsv(decode(zip[isjName].buffer));
const isjHeader = isjRows[0];
const col = (h) => isjHeader.indexOf(h);
const iCity = col("市区町村名");
const iTown = col("大字町丁目名");
const iLat = col("緯度");
const iLng = col("経度");
/** key = 市区町村|正規化町丁目 */
const isj = new Map();
/** 丁目無しの大字だけで引くためのフォールバック（市区町村|大字名 → 代表点の平均） */
const isjOaza = new Map();
for (const r of isjRows.slice(1)) {
  const city = normalizeCity(r[iCity]);
  const town = normalizeTown(r[iTown]);
  const lat = Number(r[iLat]);
  const lng = Number(r[iLng]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  isj.set(`${city}|${town}`, { lat, lng });
  const oaza = town.replace(/\d+丁目$/, "");
  const k = `${city}|${oaza}`;
  const acc = isjOaza.get(k) ?? { lat: 0, lng: 0, n: 0 };
  acc.lat += lat;
  acc.lng += lng;
  acc.n += 1;
  isjOaza.set(k, acc);
}
console.log(`  町丁目 ${isj.size} 件`);

// 2) 犯罪 CSV を手口ごとに集計
const csvUrls = pref.csv(year);
/** key → { city, town, counts[7], lat, lng } */
const agg = new Map();
const unmatched = new Map();
let total = 0;

for (const [typeIndex, type] of CRIME_TYPES.entries()) {
  const url = csvUrls[type];
  process.stdout.write(`  ${type} … `);
  const rows = parseCsv(decode(await fetchBuf(url)));
  const header = rows[0];
  const iC = header.findIndex((h) => h.startsWith("市区町村（発生地）"));
  const iT = header.findIndex((h) => h.startsWith("町丁目（発生地）"));
  if (iC < 0 || iT < 0) throw new Error(`列が見つかりません: ${url}`);
  let n = 0;
  for (const r of rows.slice(1)) {
    const cityRaw = (r[iC] ?? "").trim();
    const townRaw = (r[iT] ?? "").trim();
    if (!cityRaw) continue;
    const city = normalizeCity(cityRaw);
    const town = normalizeTown(townRaw);
    const key = `${city}|${town}`;
    let pos = isj.get(key);
    if (!pos) {
      // 丁目が無い／一致しない場合は大字の代表点にまとめる
      const oaza = isjOaza.get(`${city}|${town.replace(/\d+丁目$/, "")}`);
      if (oaza) pos = { lat: oaza.lat / oaza.n, lng: oaza.lng / oaza.n };
    }
    if (!pos) {
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
      continue;
    }
    const entry = agg.get(key) ?? { city: cityRaw, town: townRaw, counts: CRIME_TYPES.map(() => 0), ...pos };
    entry.counts[typeIndex] += 1;
    agg.set(key, entry);
    n += 1;
    total += 1;
  }
  console.log(`${n} 件`);
}

const unmatchedTotal = [...unmatched.values()].reduce((a, b) => a + b, 0);
console.log(`  位置不明で除外: ${unmatchedTotal} 件（${unmatched.size} 地名）`);
if (unmatched.size) {
  console.log(
    "   例:",
    [...unmatched.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}×${v}`)
      .join(", "),
  );
}

// 3) 出力（座標は小数5桁、件数配列はそのまま）
const points = [...agg.values()]
  .sort((a, b) => b.counts.reduce((x, y) => x + y, 0) - a.counts.reduce((x, y) => x + y, 0))
  .map((e) => ({
    n: `${e.city} ${e.town}`.trim(),
    lat: Number(e.lat.toFixed(5)),
    lng: Number(e.lng.toFixed(5)),
    c: e.counts,
  }));

const out = {
  prefCode,
  pref: pref.name,
  year,
  types: CRIME_TYPES,
  total,
  matched: total,
  unmatched: unmatchedTotal,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `${pref.name}警察 犯罪オープンデータ（${year}年）／国土交通省 位置参照情報`,
  sourceUrl: pref.sourceUrl,
  points,
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = resolve(OUT_DIR, `crime-${prefCode}.json`);
writeFileSync(outPath, JSON.stringify(out));
console.log(`✔ ${outPath}  地点 ${points.length}, 件数 ${total}`);
