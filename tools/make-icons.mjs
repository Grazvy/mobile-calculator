// Generates the PWA icons (PNG + SVG) without external dependencies.
// Run once with `npm run icons`; the outputs in icons/ are committed.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Shapes in a 0..1 unit square: [x, y, w, h, radius, color]
function shapes(full) {
  const s = [];
  if (full) s.push([0, 0, 1, 1, 0, '#2c2e33']);
  else s.push([0.04, 0.04, 0.92, 0.92, 0.2, '#2c2e33']);
  const m = full ? 0.2 : 0.14; // inset so maskable icons survive cropping
  const W = 1 - 2 * m;
  s.push([m, m, W, W * 0.32, 0.03, '#c3ccb0']);
  // "7-seg" digits on the LCD
  for (let k = 0; k < 3; k++) s.push([m + W * (0.52 + k * 0.15), m + W * 0.1, W * 0.1, W * 0.14, 0.01, '#20251c']);
  const top = m + W * 0.42;
  const cols = 4, rows = 3;
  const gap = W * 0.06;
  const kw = (W - gap * (cols - 1)) / cols;
  const kh = (W * 0.58 - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = c === 3 ? (r === 0 ? '#d4643c' : '#5a5d65') : '#5a5d65';
      s.push([m + c * (kw + gap), top + r * (kh + gap), kw, kh, 0.025, color]);
    }
  }
  return s;
}

function inRounded(x, y, [rx, ry, rw, rh, r]) {
  if (x < rx || y < ry || x > rx + rw || y > ry + rh) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + rw - r);
  const cy = Math.min(Math.max(y, ry + r), ry + rh - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, full) {
  const px = Buffer.alloc(size * size * 4);
  const list = shapes(full);
  const SS = 4; // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          let col = null;
          for (const sh of list) if (inRounded(u, v, sh)) col = sh[5];
          if (col) {
            const [cr, cg, cb] = hex(col);
            r += cr; g += cg; b += cb; a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cover = a / 255;
      px[i] = cover ? r / cover : 0;
      px[i + 1] = cover ? g / cover : 0;
      px[i + 2] = cover ? b / cover : 0;
      px[i + 3] = a / n;
    }
  }
  return png(size, px);
}

function svg() {
  const parts = shapes(false).map(([x, y, w, h, r, c]) =>
    `<rect x="${(x * 100).toFixed(2)}" y="${(y * 100).toFixed(2)}" width="${(w * 100).toFixed(2)}" height="${(h * 100).toFixed(2)}" rx="${(r * 100).toFixed(2)}" fill="${c}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join('')}</svg>\n`;
}

writeFileSync('icons/icon-192.png', render(192, false));
writeFileSync('icons/icon-512.png', render(512, false));
writeFileSync('icons/maskable-512.png', render(512, true));
writeFileSync('icons/apple-touch-icon.png', render(180, true));
writeFileSync('icons/icon.svg', svg());
console.log('icons written');
