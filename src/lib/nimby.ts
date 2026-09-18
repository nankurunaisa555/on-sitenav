/**
 * 嫌悪施設（いわゆる NIMBY 施設）の種別定義。
 * Google Places のタイプだけでは拾えないものが多いので、名称のキーワードで分類する。
 * 並び順 = 分類の優先順（例: 「清掃工場」は 工場 より先に ごみ処理 として判定）
 */
export type NimbyKindKey =
  | "waste"
  | "sewage"
  | "crematory"
  | "cemetery"
  | "shrine"
  | "funeral"
  | "pachinko"
  | "adult"
  | "gas"
  | "gastank"
  | "substation"
  | "logistics"
  | "livestock"
  | "factory";

export type NimbyKind = {
  key: NimbyKindKey;
  label: string;
  emoji: string;
  /** 名称に対する判定 */
  namePattern: RegExp;
  /** Places のタイプに対する判定（あれば） */
  types?: readonly string[];
  /** 名称にこれが含まれたら除外（誤検出防止） */
  exclude?: RegExp;
};

export const NIMBY_KINDS: readonly NimbyKind[] = [
  {
    key: "waste",
    label: "ごみ処理・清掃工場",
    emoji: "🏭",
    namePattern: /清掃工場|清掃センター|清掃事務所|ごみ処理|ゴミ処理|ごみ焼却|廃棄物処理|廃棄物.*(施設|センター|工場|処分場)|産廃処理|産業廃棄物|リサイクルセンター|クリーンセンター|環境センター|環境事業所|焼却|中間処理|最終処分場|資源化センター|処理センター/,
    exclude: /回収|遺品|不用品|買取|片付け|引越|清掃サービス|ハウスクリーニング|ビルメン|商事$|興産$/,
  },
  {
    key: "sewage",
    label: "下水処理場",
    emoji: "🚰",
    namePattern: /下水|水再生センター|浄化センター|終末処理場|水処理センター|ポンプ場/,
  },
  {
    key: "crematory",
    label: "火葬場",
    emoji: "⚱️",
    namePattern: /火葬|斎場(?!.*(ホール|会館|葬儀社))|やすらぎの郷|聖苑|悠久の郷|浄苑/,
    exclude: /ペット|動物|犬|猫|訪問/,
  },
  {
    key: "cemetery",
    label: "墓地・霊園",
    emoji: "🪦",
    namePattern: /霊園|墓地|墓苑|墓園|共同墓|納骨|樹木葬|永代供養/,
    types: ["cemetery"],
    exclude: /ペット|動物|犬|猫|石材|仏具/,
  },
  {
    key: "shrine",
    label: "神社・寺",
    emoji: "⛩️",
    namePattern: /神社|神宮|八幡|天満宮|大社|稲荷|宮$|寺$|寺院|院$|観音|不動|地蔵|薬師|明神|大師|^.{1,8}寺(?![^\s（(]*(前|通り|橋|駅|バス|店|カフェ|食堂))/,
    exclude: /寺町|寺尾|寺田|寺島|寺前|寺内|寺山|寺下|寺沢|寺崎|寺西|寺本|小学校|中学校|保育|幼稚園|学園|駅|バス|停$|前$|通り|カフェ|食堂|ラーメン|そば|うどん|ホテル|美容|接骨|整骨|歯科|クリニック|医院|病院|薬局|不動産|コンビニ|ペット|動物|マンション|団地|公園|商店|会館|会議|美術|博物|事務所|法律|税理|会計|工業|製作/,
  },
  {
    key: "funeral",
    label: "葬儀場",
    emoji: "🕯️",
    namePattern: /葬儀|葬祭|葬|セレモニー|典礼|メモリアルホール|家族葬|ティア|ベルコ|公益社/,
    types: ["funeral_home"],
    exclude: /冠婚|結婚式場|ブライダル|ペット|動物|犬|猫/,
  },
  {
    key: "pachinko",
    label: "パチンコ店",
    emoji: "🎰",
    namePattern: /パチンコ|ﾊﾟﾁﾞﾝｺ|スロット|ｽﾛｯﾄ|マルハン|ガイア|GAIA|エスパス|キコーナ|ダイナム|DYNAM|D'?station|ニラク|夢屋|玉屋|ベガスベガス|(?:パチ|スロ).*ホール/i,
    exclude: /PUDO|ステーション|運輸|センター（/,
  },
  {
    key: "adult",
    label: "キャバクラ・風俗店",
    emoji: "🍸",
    namePattern: /キャバクラ|キャバ|セクキャバ|風俗|ソープ|ピンサロ|ヘルス|イメクラ|ラウンジ|ガールズバー|ｷﾞｭﾙｽﾞ|スナック|クラブ(?!活動|ハウス|チーム)|club(?!house)|ホストクラブ|おっパブ|デリヘル|エステ.*(メンズ|回春)|大人の|アダルト/i,
    types: ["night_club", "adult_entertainment_store"],
    exclude: /スポーツクラブ|フィットネス|ゴルフ|テニス|カルチャー|子ども|キッズ|学童|老人|シニア|囲碁|将棋|ダンス教室|音楽|ジャズ|ライブハウス|ホテル|カラオケ|ビッグエコー|まねきねこ|JOYSOUND|ジャンカラ|居酒屋|喫茶/i,
  },
  {
    key: "gas",
    label: "ガソリンスタンド",
    emoji: "⛽",
    namePattern: /ガソリン|給油所|ENEOS|エネオス|出光|apollostation|コスモ石油|昭和シェル|Shell|SOLATO|キグナス|太陽石油|セルフ.*SS|\bSS\b/i,
    types: ["gas_station"],
  },
  {
    key: "gastank",
    label: "ガスタンク・ガス施設",
    emoji: "🛢️",
    namePattern: /ガスタンク|ガスホルダー|LPG|LPガス|プロパン|ガス.*(基地|供給所|充填|充てん|整圧所|ガバナ)|ガス製造/,
  },
  {
    key: "substation",
    label: "変電所",
    emoji: "⚡",
    namePattern: /変電所|開閉所|変電設備/,
  },
  {
    key: "logistics",
    label: "大型物流施設",
    emoji: "🚚",
    namePattern: /物流|配送センター|ロジスティクス|ロジスティック|ロジ|流通センター|デポ|営業所.*(運輸|運送|ロジ)|運輸.*(センター|ターミナル)|トラックターミナル|倉庫/,
    exclude: /コンビニ|ヤマト運輸|佐川急便|郵便局|宅急便|宅配|集配|PUDO|ステーション/,
  },
  {
    key: "livestock",
    label: "牧場・畜産",
    emoji: "🐖",
    namePattern: /牧場|養豚|養鶏|畜産|酪農|鶏舎|豚舎|牛舎|養鰻|養殖|孵化場|飼育/,
    exclude: /牧場.*(カフェ|レストラン|アイス|ソフトクリーム|直売|ミルク|バーガー|パン)|観光牧場/,
  },
  {
    key: "factory",
    label: "工場",
    emoji: "🏗️",
    namePattern: /工場|製作所|製造所|プラント|工業所|鉄工|鋳造|メッキ|めっき|塗装工業|化学工業|コンクリート|生コン|アスファルト|製鋼|製紙|製薬工場|印刷工場|加工センター/,
    exclude: /清掃工場|パン工場|ケーキ|豆腐|チョコ|工場見学|カフェ|直売|レストラン|ビール醸造|ワイナリー|コーヒー|チーズ|ミルク|スイーツ|バウム|プリン|ジェラート|アイス|ルミネ|店$|ショップ|キッチン|Kitchen|サービス工場|整備|板金|車検|販売/i,
  },
] as const;

export const NIMBY_KIND_MAP: ReadonlyMap<NimbyKindKey, NimbyKind> = new Map(NIMBY_KINDS.map((k) => [k.key, k]));

/** 名称と Places のタイプから種別を判定する。該当しなければ null */
export function classifyNimby(name: string, types: readonly string[]): NimbyKind | null {
  for (const kind of NIMBY_KINDS) {
    if (kind.exclude?.test(name)) continue;
    if (kind.types?.some((t) => types.includes(t))) return kind;
    if (kind.namePattern.test(name)) return kind;
  }
  return null;
}

/**
 * テキスト検索に投げる語。1クエリ＝1課金なので同義語はまとめる。
 * ガソリンスタンド・墓地・葬儀場・ナイトクラブはタイプ指定の Nearby Search で拾う。
 */
export const NIMBY_TEXT_QUERIES: readonly { query: string; fallback: NimbyKindKey | null }[] = [
  // fallback: 名称から判定できなくても、その語で Google が返した結果を該当とみなす（精度の高い語だけ）
  { query: "パチンコ", fallback: "pachinko" },
  { query: "工場", fallback: null },
  { query: "キャバクラ 風俗", fallback: null },
  { query: "清掃工場 ごみ処理施設", fallback: null },
  { query: "下水処理場 水再生センター", fallback: "sewage" },
  { query: "産業廃棄物 処理", fallback: null },
  { query: "火葬場 斎場", fallback: null },
  { query: "霊園 墓地", fallback: null },
  { query: "神社 寺", fallback: "shrine" },
  { query: "物流センター 配送センター", fallback: null },
  { query: "変電所", fallback: "substation" },
  { query: "ガスタンク LPガス", fallback: "gastank" },
  { query: "牧場 養豚 養鶏", fallback: "livestock" },
];

/** フォールバック適用時でも除外する、明らかに無関係な名称 */
export const NIMBY_GLOBAL_EXCLUDE =
  /駅$|バス停|コンビニ|セブン|ファミリーマート|ローソン|カフェ|喫茶|食堂|ラーメン|居酒屋|ホテル|マンション|アパート|公園|学校|保育|幼稚園|病院|クリニック|歯科|薬局|銭湯|温泉|ジム|PUDO|ステーション|営業所$|小売|スーパー|ドラッグ/;

export const NIMBY_NEARBY_TYPES: readonly string[] = [
  "gas_station",
  "cemetery",
  "funeral_home",
  "night_club",
];
