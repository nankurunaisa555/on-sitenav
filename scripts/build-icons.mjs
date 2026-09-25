// アプリアイコン（3案）を SVG 定義から生成する: npm run build:icons
// 出力:
//   public/icons/<案>/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, icon.svg
//   public/icons/*.png と src/app/icon.svg … 既定の案（blue）のコピー（既存のインストールとの互換用）
// 案の一覧（id・名前）は src/lib/app-icons.ts と揃えること
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SIZE = 1024;
const DEFAULT_ID = "blue";

/** iOS 風スーパー楕円（角の丸みが連続的に変わる squircle）のパス */
function squirclePath(size, n = 4.6, steps = 256) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = r + Math.sign(c) * r * Math.abs(c) ** (2 / n);
    const y = r + Math.sign(s) * r * Math.abs(s) ** (2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** 位置ピン（中心に穴）。cx,cy は丸い頭の中心、r は頭の半径 */
function pinPath(cx, cy, r, tipY, hole) {
  const k = r * 0.56;
  return `M${cx} ${cy - r} C ${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy}
    C ${cx - r} ${cy + r * 0.68} ${cx - r * 0.12} ${tipY - r * 0.1} ${cx - r * 0.035} ${tipY - r * 0.02}
    C ${cx - r * 0.017} ${tipY + r * 0.01} ${cx + r * 0.017} ${tipY + r * 0.01} ${cx + r * 0.035} ${tipY - r * 0.02}
    C ${cx + r * 0.12} ${tipY - r * 0.1} ${cx + r} ${cy + r * 0.68} ${cx + r} ${cy}
    C ${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} Z
    M${cx} ${cy - hole} A ${hole} ${hole} 0 1 1 ${cx} ${cy + hole} A ${hole} ${hole} 0 1 1 ${cx} ${cy - hole} Z`;
}

/**
 * 案ごとの中身。defs（グラデーション等）と、背景・図柄の SVG 断片を返す。
 * 図柄は 1024 四方の座標で描き、マスク用（全面塗り）では OS に切り落とされないよう少し縮める。
 */
const VARIANTS = {
  // 案A: 青のグラデーションに白いピン（これまでのアイコン）
  blue: {
    name: "ブルー・ピン",
    defs: `
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3D7BFF"/><stop offset="1" stop-color="#1436B8"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.28" cy="0.12" r="0.75">
        <stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E9F0FF"/>
      </linearGradient>
      <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0A1F6E" flood-opacity="0.35"/>
      </filter>`,
    background: `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/><rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>`,
    art: `
      <ellipse cx="512" cy="812" rx="150" ry="34" fill="url(#shadow)"/>
      <path fill="url(#pin)" fill-rule="evenodd" filter="url(#drop)" d="${pinPath(512, 430, 230, 796, 88)}"/>`,
  },

  // 案B: Apple のマップ風。明るい地図（公園・道路・川）の上に赤いピン
  map: {
    name: "マップ",
    defs: `
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FBFAF6"/><stop offset="1" stop-color="#EEEBE3"/>
      </linearGradient>
      <linearGradient id="park" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#B9E4B0"/><stop offset="1" stop-color="#9BD690"/>
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#9ED3F5"/><stop offset="1" stop-color="#7FC2EE"/>
      </linearGradient>
      <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FF6259"/><stop offset="1" stop-color="#E5261B"/>
      </linearGradient>
      <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#7A1A12" flood-opacity="0.35"/>
      </filter>`,
    background: `
      <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
      <path d="M-40 150 C 180 120 260 250 420 230 S 700 90 1070 140 L1070 -40 L-40 -40 Z" fill="url(#park)"/>
      <path d="M-40 820 C 200 760 330 900 560 860 S 860 720 1070 760 L1070 1070 L-40 1070 Z" fill="url(#water)"/>
      <path d="M-40 560 L1070 420" stroke="#fff" stroke-width="64" stroke-linecap="round"/>
      <path d="M-40 560 L1070 420" stroke="#F6C85F" stroke-width="30" stroke-linecap="round"/>
      <path d="M300 -40 L420 1070" stroke="#fff" stroke-width="44"/>
      <path d="M760 -40 L700 1070" stroke="#fff" stroke-width="36"/>`,
    art: `
      <ellipse cx="560" cy="742" rx="120" ry="28" fill="url(#shadow)"/>
      <path fill="url(#pin)" fill-rule="evenodd" filter="url(#drop)" d="${pinPath(560, 420, 200, 730, 0.001)}"/>
      <circle cx="560" cy="420" r="78" fill="#fff"/>`,
  },

  // 案C: ダークに、白い家と足元の位置の輪（現地・住まい）。アクセントは青緑
  home: {
    name: "ナイト・ホーム",
    defs: `
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2B3444"/><stop offset="1" stop-color="#0E131C"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.78" r="0.55">
        <stop offset="0" stop-color="#30D1C6" stop-opacity="0.35"/><stop offset="1" stop-color="#30D1C6" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="house" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DCE6F2"/>
      </linearGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5EF0D8"/><stop offset="1" stop-color="#1FB5E8"/>
      </linearGradient>
      <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/>
      </filter>`,
    background: `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/><rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>`,
    art: `
      <ellipse cx="512" cy="760" rx="300" ry="78" fill="none" stroke="url(#ring)" stroke-width="16" opacity="0.45"/>
      <ellipse cx="512" cy="760" rx="190" ry="48" fill="none" stroke="url(#ring)" stroke-width="18" opacity="0.8"/>
      <ellipse cx="512" cy="760" rx="46" ry="14" fill="url(#ring)"/>
      <path filter="url(#drop)" fill="url(#house)" fill-rule="evenodd" d="
        M512 214 C 527 214 541 220 552 230 L 776 430 C 800 452 786 492 752 492 L 724 492 L 724 668
        C 724 698 700 722 670 722 L 354 722 C 324 722 300 698 300 668 L 300 492 L 272 492
        C 238 492 224 452 248 430 L 472 230 C 483 220 497 214 512 214 Z
        M458 722 L 458 590 C 458 570 474 554 494 554 L 530 554 C 550 554 566 570 566 590 L 566 722 Z"/>`,
  },
};

function iconSvg(id, shape) {
  const v = VARIANTS[id];
  const clip = shape === "squircle" ? squirclePath(SIZE) : `M0 0 H${SIZE} V${SIZE} H0 Z`;
  const scale = shape === "square" ? 0.86 : 1;
  const c = SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs><clipPath id="c"><path d="${clip}"/></clipPath>${v.defs}</defs>
  <g clip-path="url(#c)">${v.background}
    <g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">${v.art}</g>
  </g>
</svg>`;
}

async function render(svg, px, out) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(px, px).png().toFile(out);
}

for (const id of Object.keys(VARIANTS)) {
  const dir = `public/icons/${id}`;
  mkdirSync(dir, { recursive: true });
  await render(iconSvg(id, "squircle"), 192, `${dir}/icon-192.png`);
  await render(iconSvg(id, "squircle"), 512, `${dir}/icon-512.png`);
  await render(iconSvg(id, "square"), 512, `${dir}/icon-maskable-512.png`);
  await render(iconSvg(id, "square"), 180, `${dir}/apple-touch-icon.png`);
  writeFileSync(`${dir}/icon.svg`, iconSvg(id, "squircle"));
  console.log("wrote", dir, `(${VARIANTS[id].name})`);
}

// 既定の案をルートにも置く（manifest の既定・以前のインストールとの互換）
await render(iconSvg(DEFAULT_ID, "squircle"), 192, "public/icons/icon-192.png");
await render(iconSvg(DEFAULT_ID, "squircle"), 512, "public/icons/icon-512.png");
await render(iconSvg(DEFAULT_ID, "square"), 512, "public/icons/icon-maskable-512.png");
await render(iconSvg(DEFAULT_ID, "square"), 180, "public/icons/apple-touch-icon.png");
writeFileSync("src/app/icon.svg", iconSvg(DEFAULT_ID, "squircle"));
console.log("wrote default icons");
