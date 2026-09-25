"""
産業廃棄物の処理施設（中間処理・解体・破砕・焼却など）の位置データを作る: npm run build:sanpai

公式の「産業廃棄物処分業者名簿」から、処理を行う事業場の所在地を取り出し、
国土地理院の住所検索 API で座標にして src/data/sanpai-11.json に書き出す（現在は埼玉県）。

  - 埼玉県知事許可（Excel）… 産業廃棄物中間処理業者 / 特別管理産業廃棄物中間処理業者
  - さいたま市長許可（PDF）… 産業廃棄物処分業者 / 特別管理産業廃棄物処分業者
    （政令市・中核市は県とは別に許可を出すため別名簿。川口市は名簿に事業場の所在地がなく、
      川越市・越谷市は未対応）

必要: pip install openpyxl pdfplumber
住所検索の結果は scripts/.cache/gsi-geocode.json にキャッシュする（再実行時は問い合わせない）。
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

import openpyxl
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "sanpai-11.json")
CACHE = os.path.join(ROOT, "scripts", ".cache", "gsi-geocode.json")
UA = {"User-Agent": "Mozilla/5.0 (on-sitenav data build)"}

PREF_XLSX = [
    ("https://www.pref.saitama.lg.jp/documents/25934/03_hutusyobunichiran_r7.xlsx", "産業廃棄物中間処理（埼玉県許可）"),
    ("https://www.pref.saitama.lg.jp/documents/25934/04_tokkansyobunichiran_r7.xlsx", "特別管理産業廃棄物中間処理（埼玉県許可）"),
]
SAITAMA_CITY_PDF = [
    ("https://www.city.saitama.lg.jp/001/006/008/002/005/p001249_d/fil/syobun.pdf", "産業廃棄物処分（さいたま市許可）"),
    ("https://www.city.saitama.lg.jp/001/006/008/002/005/p001249_d/fil/tokkan_syobun.pdf", "特別管理産業廃棄物処分（さいたま市許可）"),
]


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def tidy_method(s: str) -> str:
    # PDF の「破 砕」のような字間の空白を詰める
    return re.sub(r"(?<=[^\x00-\x7f]) (?=[^\x00-\x7f])", "", clean(s))


def geocode_query(address: str) -> str:
    """「白岡市下大崎字円明１１番１ 他４筆」→「埼玉県白岡市下大崎字円明１１番１」"""
    a = clean(address)
    a = re.sub(r"[ 　]*[他外]\s*[０-９0-9]+\s*筆.*$", "", a)
    a = re.sub(r"の一部.*$", "", a)
    a = a.replace("番地", "番")
    if not a.startswith("埼玉県"):
        a = "埼玉県" + a
    return a


def load_cache() -> dict:
    try:
        with open(CACHE, encoding="utf-8") as f:
            # 見つからなかったもの（None）は次回また探す
            return {k: v for k, v in json.load(f).items() if v}
    except FileNotFoundError:
        return {}


def save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)


def geocode(q: str, cache: dict) -> dict | None:
    if q in cache:
        return cache[q]
    url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + urllib.parse.quote(q)
    try:
        data = json.loads(fetch(url))
    except Exception as e:  # noqa: BLE001
        print("  geocode error", q, e, file=sys.stderr)
        return None
    time.sleep(0.15)  # 公開 API なので控えめに
    hit = None
    for feat in data:
        title = feat["properties"]["title"]
        lng, lat = feat["geometry"]["coordinates"]
        # 市区町村が一致するものだけ採用（別の町の同名地名を拾わない）
        city = re.match(r"埼玉県(?:.+?郡)?(.+?[市町村])", unicodedata.normalize("NFKC", q))
        if city and city.group(1) not in unicodedata.normalize("NFKC", title):
            continue
        # 位置の精度: 番・号まで一致＝街区、丁目まで＝町丁目、それ以外＝大字（おおよそ）
        if re.search(r"[0-9０-９]+番", title):
            precision = "block"
        elif "丁目" in title:
            precision = "chome"
        else:
            precision = "oaza"
        hit = {"lat": round(lat, 6), "lng": round(lng, 6), "matched": title, "precision": precision}
        break
    cache[q] = hit
    return hit


def from_pref_xlsx(url: str, source: str) -> list[dict]:
    wb = openpyxl.load_workbook(io.BytesIO(fetch(url)), read_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    # 見出しは改行入り（「施設の／種類」）のことがあるので空白を除いて比べる
    head = [re.sub(r"\s", "", str(c) if c is not None else "") for c in rows[0]]
    i_name, i_site, i_method = head.index("業者名称"), head.index("事業場所在地"), head.index("施設の種類")
    out = []
    for r in rows[1:]:
        name, site, method = clean(r[i_name]), clean(r[i_site]), tidy_method(r[i_method])
        if not name or not site or site in ("—", "－", "-", "―"):
            continue
        out.append({"name": name, "site": site, "method": method, "source": source})
    return out


def from_saitama_city_pdf(url: str, source: str) -> list[dict]:
    rows: list[list[str]] = []
    with pdfplumber.open(io.BytesIO(fetch(url))) as pdf:
        for page in pdf.pages:
            for t in page.extract_tables():
                rows += [[clean(c) for c in row] for row in t]
    out: list[dict] = []
    name = town = ""
    current: dict | None = None
    for r in rows:
        if len(r) < 10 or r[3] == "固有番号" or r[4] == "業者名称":
            continue
        if r[4]:  # 新しい業者
            name, town = r[4], ""
            current = None
        if not name:
            continue
        if r[7] in ("—", "－", "-", "―"):  # 移動式など事業場なし
            current = None
            continue
        if r[7] or r[8]:  # 新しい事業場（町丁目が空なら直前と同じ町で別の地番）
            town = r[7] or town
            site = f"さいたま市{town}{r[8]}"
            current = {"name": name, "site": site, "method": tidy_method(r[9]), "source": source}
            out.append(current)
        elif current and r[9]:
            current["method"] += "・" + tidy_method(r[9])
    return out


def main() -> None:
    records: list[dict] = []
    for url, src in PREF_XLSX:
        got = from_pref_xlsx(url, src)
        print(f"{src}: {len(got)} 行")
        records += got
    for url, src in SAITAMA_CITY_PDF:
        got = from_saitama_city_pdf(url, src)
        print(f"{src}: {len(got)} 事業場")
        records += got

    # 同じ業者・同じ事業場は1件にまとめ、処理方法を合わせる
    merged: dict[tuple[str, str], dict] = {}
    for r in records:
        key = (r["name"], geocode_query(r["site"]))
        m = merged.setdefault(key, {"name": r["name"], "site": r["site"], "methods": [], "sources": []})
        for part in re.split(r"[・･、,]", r["method"]):
            part = part.strip()
            if part and part not in m["methods"]:
                m["methods"].append(part)
        if r["source"] not in m["sources"]:
            m["sources"].append(r["source"])

    cache = load_cache()
    items, failed = [], []
    for i, ((name, q), m) in enumerate(merged.items()):
        if i % 50 == 0:
            print(f"  geocoding {i}/{len(merged)}")
            save_cache(cache)
        g = geocode(q, cache)
        if not g:
            # 「字〇〇123番」までだと見つからないことがあるので、大字までに縮めて探し直す（おおよその位置）
            short = re.sub(r"字.*$", "", q)
            if short != q:
                g = geocode(short, cache)
                if g:
                    g = {**g, "precision": "oaza"}
        if not g:
            failed.append(q)
            continue
        items.append(
            {
                "name": name,
                "address": m["site"],
                "methods": m["methods"],
                "source": " / ".join(m["sources"]),
                "lat": g["lat"],
                "lng": g["lng"],
                "precision": g["precision"],
            }
        )
    save_cache(cache)

    items.sort(key=lambda x: (x["lat"], x["lng"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "note": "埼玉県・さいたま市の産業廃棄物処分業者名簿から作成。位置は国土地理院の住所検索による（precision: block=街区, chome=町丁目, oaza=大字でおおよそ）",
                "items": items,
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    prec = {p: sum(1 for x in items if x["precision"] == p) for p in ("block", "chome", "oaza")}
    print(f"wrote {OUT}: {len(items)} 事業場 {prec}  座標にできなかった住所 {len(failed)}")
    for q in failed[:20]:
        print("  未解決:", q)


if __name__ == "__main__":
    main()
