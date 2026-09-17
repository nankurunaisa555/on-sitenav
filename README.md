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

同じキーを両方に使っても動きますが、本番では用途別に2つに分けるのが安全です。

### Google Cloud で有効にする API

- Maps JavaScript API
- Places API (New)

## 構成

```
src/
├── app/
│   ├── layout.tsx            # ルートレイアウト（viewport 設定含む）
│   ├── page.tsx              # キー未設定時の案内 / OnSiteNav を表示
│   ├── globals.css
│   └── api/places/route.ts   # Places API (New) 中継。入力検証・グループ並列検索・10分キャッシュ
├── components/
│   ├── OnSiteNav.tsx         # 画面全体の状態管理（現在地・検索中心・選択中の施設）
│   ├── MapView.tsx           # 地図・ピン・検索範囲の円・現在地マーカー
│   ├── PlacePanel.tsx        # 画面下部のボトムシート（カテゴリ別一覧）
│   └── CategoryFilter.tsx    # カテゴリ絞り込みチップ
├── hooks/
│   ├── useGeolocation.ts
│   └── usePlaces.ts
└── lib/
    ├── categories.ts         # カテゴリ定義（表示順・色・Google types の対応）
    ├── geo.ts                # 距離計算・徒歩分数・表示フォーマット
    └── types.ts
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
