// アプリアイコンを 1 つの SVG 定義から生成する: npm run build:icons
// 出力: public/icons/*.png, src/app/icon.svg（favicon）
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SIZE = 1024;

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

/**
 * アイコン本体。
 * - 背景: 深い青→鮮やかな青の縦グラデーション ＋ 左上のやわらかい光
 * - 図柄: 白い位置ピン（中心に穴）、下に薄い足元の影。Apple のアプリ風に要素は 1 つだけ
 * @param {"squircle"|"square"} shape   squircle: 角が透明（Chrome 等）、square: 全面塗り（マスク用・iOS 用）
 */
function iconSvg(shape) {
  const clip = shape === "squircle" ? squirclePath(SIZE) : `M0 0 H${SIZE} V${SIZE} H0 Z`;
  // マスク用は OS が外側 10% を切り落とすので、図柄を少し小さめに
  const scale = shape === "square" ? 0.86 : 1;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const g = `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <clipPath id="c"><path d="${clip}"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3D7BFF"/>
      <stop offset="1" stop-color="#1436B8"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.12" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#E9F0FF"/>
    </linearGradient>
    <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0A1F6E" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g clip-path="url(#c)">
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
    <g transform="${g}">
      <!-- 足元の影 -->
      <ellipse cx="512" cy="812" rx="150" ry="34" fill="url(#shadow)"/>
      <!-- ピン（中心に穴、evenodd） -->
      <path fill="url(#pin)" fill-rule="evenodd" filter="url(#drop)"
        d="M512 200 C 383 200 282 301 282 430 C 282 585 484 774 504 792 C 508 796 516 796 520 792 C 540 774 742 585 742 430 C 742 301 641 200 512 200 Z
           M512 342 A 88 88 0 1 1 512 518 A 88 88 0 1 1 512 342 Z"/>
    </g>
  </g>
</svg>`;
}

mkdirSync("public/icons", { recursive: true });
const squircle = Buffer.from(iconSvg("squircle"));
const square = Buffer.from(iconSvg("square"));

const jobs = [
  ["public/icons/icon-192.png", squircle, 192],
  ["public/icons/icon-512.png", squircle, 512],
  ["public/icons/icon-maskable-512.png", square, 512],
  ["public/icons/apple-touch-icon.png", square, 180],
];
for (const [out, src, px] of jobs) {
  await sharp(src, { density: 300 }).resize(px, px).png().toFile(out);
  console.log("wrote", out);
}
// favicon（Next.js の app/icon.svg 規約）
writeFileSync("src/app/icon.svg", iconSvg("squircle"));
console.log("wrote src/app/icon.svg");
