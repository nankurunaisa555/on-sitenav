# On-siteNav

現地で顧客と一緒に見る「周辺施設のファクト・ダッシュボード」。
スマホで開くと現在地周辺（半径800m）の駅・スーパー・病院・学校などを地図と一覧で表示します。

## 技術スタック

- Next.js (App Router) / TypeScript (strict) / Tailwind CSS v4
- 地図: Google Maps JavaScript API（`@vis.gl/react-google-maps`）
- 周辺施設: Google Places API (New) Nearby Search — サーバー側 API Route 経由で呼び出し
- ホスティング: Vercel

## セットアップ

```bash
npm install
cp .env.example .env.local   # 値を入れる
npm run dev
```

### 環境変数

| 変数 | 用途 | 備考 |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ブラウザ側の地図表示 | 公開されるキー。**HTTP リファラー制限**（`on-sitenav.vercel.app/*`, `localhost:3001`）を推奨 |
| `GOOGLE_MAPS_API_KEY` | サーバー側の Places 検索 | 非公開。**API 制限で Places API (New) のみ**を推奨 |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | 任意。Cloud Console の Map ID | 未設定時は `DEMO_MAP_ID` |
| `REINFOLIB_API_KEY` | 任意。国交省「不動産情報ライブラリ」API | 用途地域・学区・人口・価格に必要。[利用申請](https://www.reinfolib.mlit.go.jp/api/request/)（無料） |
| `ESTAT_APP_ID` | 任意。e-Stat API のアプリケーションID | 家賃相場（統計）に必要。[登録](https://www.e-stat.go.jp/api/)（無料・即時） |

同じキーを両方に使っても動きますが、本番では用途別に2つに分けるのが安全です。

### Google Cloud で有効にする API

- Maps JavaScript API
- Places API (New)

## 表示できる情報とデータ元

| 情報 | データ元 | キー |
| --- | --- | --- |
| 周辺施設（駅・バス停・スーパー・病院・学校…）と距離・徒歩分数 | Google Places API (New) | Google |
| 洪水・内水・高潮・津波・土砂災害の該当判定と地図重ね表示 | 国土地理院「重ねるハザードマップ」タイル | 不要 |
| 地震の揺れやすさ（30年確率・表層地盤増幅率・微地形） | 防災科研 J-SHIS API | 不要 |
| 地形分類（自然地形・人工地形）と土地の成り立ち・リスク | 国土地理院 地形分類ベクトルタイル（`landform-codes.json` は同 style.js から抽出） | 不要 |
| 用途地域・建蔽率・容積率・防火地域・高さ制限の目安 | 不動産情報ライブラリ XKT002 / XKT014 | REINFOLIB |
| 小学校区・中学校区 | 不動産情報ライブラリ XKT004 / XKT005 | REINFOLIB |
| 人口（2020/2030/2050 推計・増減率） | 不動産情報ライブラリ XKT013（250mメッシュ） | REINFOLIB |
| 地価公示・地価調査（円/㎡・前年比・最寄駅）近い順 | 不動産情報ライブラリ XPT002 | REINFOLIB |
| 取引事例（町名単位・直近3年の取引価格/成約価格） | 不動産情報ライブラリ XIT001 / XIT002（町名は最寄り施設の住所から判定） | REINFOLIB |
| 液状化傾向（地形区分に基づく液状化発生傾向図） | 不動産情報ライブラリ XKT025 | REINFOLIB |
| 指定緊急避難場所（近い順・対応災害・ルート） | 不動産情報ライブラリ XGT001（国土地理院データ） | REINFOLIB |
| 標高 | 国土地理院 標高API | 不要 |
| 役所（同じ市区町村の本庁）・最寄り図書館（半径外でも） | 不動産情報ライブラリ XKT018 / XKT017（市区町村コードは XKT013 メッシュ → XKT002 → XPT002 で補完） | REINFOLIB |
| 地価公示地点の相続税路線価・高度地区の高さ・利回り・前面道路 | 不動産情報ライブラリ XCT001（鑑定評価書） | REINFOLIB |
| 家賃相場（市区町村別の平均・中央値・階級分布、一戸建/共同住宅別） | e-Stat 令和5年住宅・土地統計調査（112-3-2, 123-3-1） | ESTAT |
| 基準点から最寄り駅・学区の小中学校への徒歩ルート（道なり距離・時間） | Google Routes API（学校位置は不動産情報ライブラリ XKT006） | Google |
| 嫌悪施設（パチンコ・工場・ガソリンスタンド・風俗・ごみ処理・下水処理・火葬場・墓地/霊園・神社/寺・葬儀場・物流・変電所・ガスタンク・畜産）| Google Places Nearby（タイプ）＋ Text Search（13語）＋ **OpenStreetMap Overpass API**（寺社・墓地・変電所などタグで網羅）→ 名称・業種・タグで分類し重複除去。課金単価が高いため嫌悪施設タブのボタンを押したときだけ取得（半径300m） | Google（OSM はキー不要） |
| ストリートビュー（右下 📷＝基準点／施設の吹き出しから、最寄り60m以内のパノラマを全画面表示） | Google Maps JavaScript API（StreetViewPanorama） | Google |
| 駅・バス停の時刻表・始発終電 | 公開 API が無いため Google マップへリンク | — |
| 犯罪発生（窃盗7手口・町丁目別の年間件数）レイヤーと周辺500m集計 | 県警「犯罪オープンデータ」CSV ＋ 国交省「位置参照情報」を事前集計（現在は埼玉県） | 不要 |
| 犯罪発生マップ（公式） | 都道府県警の Web 地図へリンク | — |

ハザード判定は該当ズーム 16 のタイル画像の地点ピクセル色を凡例色と照合して行う（サーバー側 [src/lib/server/hazard.ts](src/lib/server/hazard.ts)）。目安であり、正式な区域は各自治体のハザードマップで確認すること。

### 犯罪オープンデータの更新

```bash
npm run build:crime            # 埼玉県・2024年（既定）
node scripts/build-crime-data.mjs --pref 11 --year 2025
```

県警の CSV と国交省の位置参照情報をダウンロードし、町丁目ごとに集計して `src/data/crime-<県コード>.json` を生成する。他県を追加する場合は `scripts/build-crime-data.mjs` の `PREFS` に CSV の URL を追加し、`src/lib/crime.ts` の `CRIME_PREFS` と `guessPrefCode` に登録する。

### 共有リンク

基準点は URL に `?lat=&lng=` として反映されるので、そのまま共有すれば同じ地点で開ける。

## 構成

```
src/
├── app/
│   ├── layout.tsx            # ルートレイアウト（viewport 設定含む）
│   ├── page.tsx              # キー未設定時の案内 / OnSiteNav を表示
│   ├── globals.css
│   └── api/
│       ├── places/route.ts   # Places API (New) 中継。入力検証・グループ並列検索・10分キャッシュ
│       └── facts/route.ts    # 地点情報（ハザード・地震・用途地域・学区・人口）を並列取得
├── components/
│   ├── OnSiteNav.tsx         # 画面全体の状態管理
│   ├── MapView.tsx           # 地図・ピン・検索範囲の円・現在地マーカー
│   ├── HazardOverlay.tsx     # ハザードタイルを地図に重ねる
│   ├── LayerChips.tsx        # 土地・災害タブ上部のレイヤー ON/OFF チップ
│   ├── BottomSheet.tsx       # 下部シート（スワイプ伸縮・タブ）
│   ├── PlaceList.tsx         # 周辺施設タブ（カテゴリ別一覧。駅・バス停は交通タブへ）
│   ├── FactsPanel.tsx        # 土地・災害タブ / 学区・人口タブ（group で切替）
│   ├── PricePanel.tsx        # 価格タブ（地価公示・取引事例・家賃統計）
│   ├── NimbyPanel.tsx        # 嫌悪施設タブ（オンデマンド探索・種別 ON/OFF）
│   ├── RouteOverlay.tsx      # 徒歩ルートの折れ線と目的地ラベル
│   ├── CrimeOverlay.tsx      # 犯罪発生（町丁目別件数）の円レイヤー
│   ├── LongPress.tsx         # 地図の長押し検出（画面座標→緯度経度）
│   ├── StreetViewModal.tsx   # 全画面ストリートビュー
│   └── CategoryFilter.tsx
├── hooks/
│   ├── useGeolocation.ts / usePlaces.ts / useFacts.ts
├── data/
│   └── crime-11.json         # 埼玉県 犯罪オープンデータ集計（scripts/build-crime-data.mjs で生成）
└── lib/
    ├── categories.ts         # カテゴリ定義（表示順・色・Google types の対応）
    ├── hazard-layers.ts      # ハザードレイヤー定義（タイル URL・色）
    ├── geo.ts / tile.ts      # 距離計算・タイル座標計算
    ├── types.ts / facts-types.ts
    ├── landform-codes.json   # 地形分類コード → 名称・成り立ち・リスク（国土地理院 style.js 由来）
    ├── crime.ts              # 犯罪データの読み込み・色・凡例
    ├── nimby.ts              # 嫌悪施設の種別定義・キーワード分類・検索語
    └── server/               # サーバー専用: hazard.ts（タイル色判定）, jshis.ts, landform.ts, reinfolib.ts, overpass.ts（OSM）ほか
```

## 動作の流れ

1. 起動時に現在地を取得し、その地点で検索（拒否時は東京駅を表示するだけ）
2. 地図を 150m 以上動かすと「地図の中心を基準に検索」ボタンが出る（勝手に再検索して課金しない）。地図を長押しするとその地点に基準点を移して再検索
3. ピンまたは一覧をタップすると相互に連動（地図が寄る / 一覧がスクロール）
4. カテゴリチップで絞り込み

## コスト設計

- Nearby Search は 1 リクエスト最大 20 件のため、カテゴリを 4 グループに分けて並列に呼ぶ（= 1 検索あたり 4 リクエスト）
- rating 等を FieldMask から外し、Pro SKU の範囲に収めている
- サーバー側で約 50m グリッド × 10 分のメモリキャッシュ

## デプロイ

`main` に push すると Vercel が自動ビルド。環境変数を変更したら Redeploy（Build Cache オフ）が必要。
