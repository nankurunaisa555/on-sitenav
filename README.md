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
| `REINFOLIB_API_KEY` | 任意。国交省「不動産情報ライブラリ」API | 用途地域・学区・人口に必要。[利用申請](https://www.reinfolib.mlit.go.jp/api/request/)（無料） |

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
| 用途地域・建蔽率・容積率・防火地域・高さ制限の目安 | 不動産情報ライブラリ XKT002 / XKT014 | REINFOLIB |
| 小学校区・中学校区 | 不動産情報ライブラリ XKT004 / XKT005 | REINFOLIB |
| 人口（2020/2030/2050 推計・増減率） | 不動産情報ライブラリ XKT013（250mメッシュ） | REINFOLIB |
| 駅・バス停の時刻表・始発終電 | 公開 API が無いため Google マップへリンク | — |
| 犯罪発生マップ | 都道府県警の Web 地図へリンク | — |

ハザード判定は該当ズーム 16 のタイル画像の地点ピクセル色を凡例色と照合して行う（サーバー側 [src/lib/server/hazard.ts](src/lib/server/hazard.ts)）。目安であり、正式な区域は各自治体のハザードマップで確認すること。

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
│   ├── LayerMenu.tsx         # レイヤー ON/OFF メニュー
│   ├── BottomSheet.tsx       # 下部シート（スワイプ伸縮・タブ）
│   ├── PlaceList.tsx         # 周辺施設タブ（カテゴリ別一覧・時刻表リンク）
│   ├── FactsPanel.tsx        # 土地・災害タブ
│   └── CategoryFilter.tsx
├── hooks/
│   ├── useGeolocation.ts / usePlaces.ts / useFacts.ts
└── lib/
    ├── categories.ts         # カテゴリ定義（表示順・色・Google types の対応）
    ├── hazard-layers.ts      # ハザードレイヤー定義（タイル URL・色）
    ├── geo.ts / tile.ts      # 距離計算・タイル座標計算
    ├── types.ts / facts-types.ts
    └── server/               # サーバー専用: hazard.ts（タイル色判定）, jshis.ts, reinfolib.ts
```

## 動作の流れ

1. 起動時に現在地を取得し、その地点で検索（拒否時は東京駅を表示するだけ）
2. 地図を 150m 以上動かすと「このエリアを検索」ボタンが出る（勝手に再検索して課金しない）
3. ピンまたは一覧をタップすると相互に連動（地図が寄る / 一覧がスクロール）
4. カテゴリチップで絞り込み

## コスト設計

- Nearby Search は 1 リクエスト最大 20 件のため、カテゴリを 4 グループに分けて並列に呼ぶ（= 1 検索あたり 4 リクエスト）
- rating 等を FieldMask から外し、Pro SKU の範囲に収めている
- サーバー側で約 50m グリッド × 10 分のメモリキャッシュ

## デプロイ

`main` に push すると Vercel が自動ビルド。環境変数を変更したら Redeploy（Build Cache オフ）が必要。
