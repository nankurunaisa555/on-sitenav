/** 日本の住所文字列を 都道府県 / 市区町村 / 町名 に分解する（Places の formattedAddress 向けの簡易版） */

export const PREF_CODES: Record<string, number> = {
  北海道: 1, 青森県: 2, 岩手県: 3, 宮城県: 4, 秋田県: 5, 山形県: 6, 福島県: 7, 茨城県: 8, 栃木県: 9,
  群馬県: 10, 埼玉県: 11, 千葉県: 12, 東京都: 13, 神奈川県: 14, 新潟県: 15, 富山県: 16, 石川県: 17,
  福井県: 18, 山梨県: 19, 長野県: 20, 岐阜県: 21, 静岡県: 22, 愛知県: 23, 三重県: 24, 滋賀県: 25,
  京都府: 26, 大阪府: 27, 兵庫県: 28, 奈良県: 29, 和歌山県: 30, 鳥取県: 31, 島根県: 32, 岡山県: 33,
  広島県: 34, 山口県: 35, 徳島県: 36, 香川県: 37, 愛媛県: 38, 高知県: 39, 福岡県: 40, 佐賀県: 41,
  長崎県: 42, 熊本県: 43, 大分県: 44, 宮崎県: 45, 鹿児島県: 46, 沖縄県: 47,
};

export type ParsedAddress = {
  pref: string;
  prefCode: number;
  /** 政令市の区まで含む（例: さいたま市南区）。郡は含めない */
  city: string;
  /** 政令市の区（例: 南区）。無ければ null */
  ward: string | null;
  /** 町名（丁目・番地を除く。例: 白幡） */
  town: string;
};

export function parseJapaneseAddress(raw: string): ParsedAddress | null {
  let s = raw.normalize("NFKC").replace(/^日本[、,]?\s*/, "").replace(/^〒?\d{3}-?\d{4}\s*/, "").replace(/\s/g, "");
  const prefMatch = s.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/);
  if (!prefMatch) return null;
  const pref = prefMatch[1]!;
  const prefCode = PREF_CODES[pref];
  if (!prefCode) return null;
  s = s.slice(pref.length);

  // 郡は読み飛ばす（「入間郡三芳町」→「三芳町」）
  s = s.replace(/^.{1,4}?郡(?=.{1,6}?[町村])/, "");

  // 政令市の区: 「さいたま市南区」「横浜市港北区」
  let city: string;
  let ward: string | null = null;
  const seirei = s.match(/^(.{1,6}?市)(.{1,5}?区)/);
  if (seirei) {
    city = seirei[1]! + seirei[2]!;
    ward = seirei[2]!;
    s = s.slice(city.length);
  } else {
    const m = s.match(/^(.{1,8}?[市区町村])/);
    if (!m) return null;
    city = m[1]!;
    s = s.slice(city.length);
  }

  // 町名: 数字・丁目・番地・ハイフンの手前まで。「大字」は落とす
  const town = s
    .replace(/^大字/, "")
    .replace(/[0-9０-９一二三四五六七八九十]+丁目.*$/, "")
    .replace(/[0-9０-９].*$/, "")
    .replace(/[-−ー－].*$/, "")
    .replace(/字.*$/, (m) => (m.length > 6 ? "" : m)) // 「字〇〇」は残す場合もあるが長い枝番は落とす
    .trim();
  if (!town) return null;
  return { pref, prefCode, city, ward, town };
}
