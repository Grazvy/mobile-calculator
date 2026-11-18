// Canvas LCD: status indicators, a 12-character 5×7 dot-matrix line and a
// 10-digit 7-segment line with a 2-digit exponent. No fonts or images needed.

import { glyph } from './font.js';

const COLS = 12;
const INK = 'rgba(22, 28, 20, 0.92)';
const GHOST = 'rgba(22, 28, 20, 0.045)';

const INDICATORS = [
  ['S', 0.0], ['A', 0.055], ['M', 0.11], ['STO', 0.175], ['RCL', 0.27],
  ['SD', 0.37], ['REG', 0.44], ['D', 0.545], ['R', 0.6], ['G', 0.655],
  ['FIX', 0.725], ['SCI', 0.815],
];

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd',
  6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
  '⌟': 'cd', '°': 'abfg',
};

export class LcdRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scroll = 0;
    this.blink = true;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(view) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!view.on) return;

    const pad = w * 0.045;
    const inner = w - 2 * pad;

    // --- indicator row ---
    const ih = h * 0.13;
    const iy = h * 0.05;
    ctx.font = `600 ${Math.round(ih * 0.62)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'top';
    for (const [name, x] of INDICATORS) {
      ctx.fillStyle = view.ind[name] ? INK : GHOST;
      ctx.fillText(name, pad + x * inner, iy);
    }
    this.triangle(pad + inner * 0.925, iy + ih * 0.42, ih * 0.42, -1, view.ind.up);
    this.triangle(pad + inner * 0.985, iy + ih * 0.42, ih * 0.42, 1, view.ind.down);

    // --- dot-matrix line ---
    const pitch = inner / (COLS * 6 - 1);
    const dot = pitch * 0.84;
    const uy = iy + ih + h * 0.04;
    this.drawMatrix(view, pad, uy, pitch, dot);

    // --- 7-segment line ---
    const top = uy + pitch * 8.6 + h * 0.035;
    const bottom = h - h * 0.07;
    this.drawSegments(view.lower, pad, top, inner, bottom - top);
  }

  triangle(cx, cy, size, dir, on) {
    const { ctx } = this;
    ctx.fillStyle = on ? INK : GHOST;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.6, cy - (dir * size) / 2);
    ctx.lineTo(cx + size * 0.6, cy - (dir * size) / 2);
    ctx.lineTo(cx, cy + (dir * size) / 2);
    ctx.closePath();
    ctx.fill();
  }

  drawMatrix(view, x0, y0, pitch, dot) {
    const { ctx } = this;
    const chars = Array.from(view.upper || '');
    const cursor = view.cursor;
    if (cursor === null || cursor === undefined) this.scroll = 0;
    else {
      if (cursor < this.scroll) this.scroll = cursor;
      if (cursor > this.scroll + COLS - 1) this.scroll = cursor - COLS + 1;
      this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, chars.length + 1 - COLS)));
    }
    const showCursor = cursor !== null && cursor !== undefined && this.blink;
    for (let c = 0; c < COLS; c++) {
      const idx = this.scroll + c;
      const isCursor = showCursor && idx === cursor;
      const rows = isCursor && view.insert ? glyph('█') : glyph(chars[idx] ?? ' ');
      const cx = x0 + c * 6 * pitch;
      for (let r = 0; r < 7; r++) {
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = (rows[r] >> (4 - k)) & 1 ? INK : GHOST;
          ctx.fillRect(cx + k * pitch, y0 + r * pitch, dot, dot);
        }
      }
      // underline cursor row
      if (isCursor && !view.insert) {
        ctx.fillStyle = INK;
        ctx.fillRect(cx, y0 + 7.6 * pitch, 4 * pitch + dot, dot * 0.9);
      }
    }
    // more text to the left / right
    ctx.fillStyle = INK;
    if (this.scroll > 0) this.arrowMark(x0 - pitch * 1.6, y0 + 3.5 * pitch, pitch, -1);
    if (chars.length > this.scroll + COLS) this.arrowMark(x0 + (COLS * 6 - 1) * pitch + pitch * 1.6, y0 + 3.5 * pitch, pitch, 1);
  }

  arrowMark(cx, cy, p, dir) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(cx + dir * p * 0.6, cy);
    ctx.lineTo(cx - dir * p * 0.5, cy - p * 1.2);
    ctx.lineTo(cx - dir * p * 0.5, cy + p * 1.2);
    ctx.closePath();
    ctx.fill();
  }

  drawSegments(lower, x0, y0, width, height) {
    const signW = width * 0.06;
    const expW = width * 0.18;
    const cellW = (width - signW - expW) / 10;
    const dw = cellW * 0.74;
    const dh = Math.min(height, dw * 1.85);
    const top = y0 + (height - dh) / 2;
    const cells = lower ? lower.cells : [];
    const offset = 10 - cells.length;

    // sign
    const t = dw * 0.17;
    this.bar(x0 + signW * 0.1, top + dh / 2, signW * 0.75, t, lower && lower.neg);

    for (let i = 0; i < 10; i++) {
      const cell = i >= offset ? cells[i - offset] : null;
      this.digit(x0 + signW + i * cellW, top, dw, dh, cell ? cell.ch : null, cell ? cell.dp : false);
    }

    // exponent: "×10" label + sign + 2 small digits, raised
    const ex = x0 + signW + 10 * cellW + cellW * 0.05;
    const edw = dw * 0.55;
    const edh = dh * 0.55;
    const exp = lower && lower.exp;
    const { ctx } = this;
    ctx.fillStyle = exp ? INK : GHOST;
    ctx.font = `600 ${Math.round(dh * 0.24)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('×10', ex + cellW * 0.3, top + dh);
    const ew = expW - cellW * 0.05;
    const minusX = ex + ew * 0.02;
    this.bar(minusX, top + edh / 2, edw * 0.7, t * 0.6, exp && exp.neg);
    const d0 = ex + ew - 2 * (edw * 1.22);
    for (let k = 0; k < 2; k++) {
      this.digit(d0 + k * edw * 1.22, top, edw, edh, exp ? exp.digits[k] : null, false, 0.6);
    }
  }

  bar(x, y, len, t, on) {
    const { ctx } = this;
    ctx.fillStyle = on ? INK : GHOST;
    this.hseg(x, x + len, y, t);
    ctx.fill();
  }

  hseg(x1, x2, y, t) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 + t / 2, y - t / 2);
    ctx.lineTo(x2 - t / 2, y - t / 2);
    ctx.lineTo(x2, y);
    ctx.lineTo(x2 - t / 2, y + t / 2);
    ctx.lineTo(x1 + t / 2, y + t / 2);
    ctx.closePath();
  }

  digit(x, y, w, h, ch, dp, scale = 1) {
    const { ctx } = this;
    const t = w * 0.17 * (scale < 1 ? 1.15 : 1);
    const g = t * 0.18;
    const slant = 0.09 * h;
    const on = new Set(ch === null ? '' : SEGMENTS[ch] ?? '');
    // skewed coordinates: shift x right as we go up
    const P = (px, py) => [x + px + slant * (1 - py / h), y + py];
    const L = t / 2;
    const R = w - t / 2;
    const T = t / 2;
    const M = h / 2;
    const B = h - t / 2;
    const segs = {
      a: ['h', L + g, R - g, T],
      g: ['h', L + g, R - g, M],
      d: ['h', L + g, R - g, B],
      f: ['v', L, T + g, M - g],
      b: ['v', R, T + g, M - g],
      e: ['v', L, M + g, B - g],
      c: ['v', R, M + g, B - g],
    };
    for (const [name, s] of Object.entries(segs)) {
      ctx.fillStyle = on.has(name) ? INK : GHOST;
      ctx.beginPath();
      let pts;
      if (s[0] === 'h') {
        const [, x1, x2, yy] = s;
        pts = [[x1, yy], [x1 + t / 2, yy - t / 2], [x2 - t / 2, yy - t / 2], [x2, yy], [x2 - t / 2, yy + t / 2], [x1 + t / 2, yy + t / 2]];
      } else {
        const [, xx, y1, y2] = s;
        pts = [[xx, y1], [xx + t / 2, y1 + t / 2], [xx + t / 2, y2 - t / 2], [xx, y2], [xx - t / 2, y2 - t / 2], [xx - t / 2, y1 + t / 2]];
      }
      pts.forEach(([px, py], k) => {
        const [qx, qy] = P(px, py);
        if (k) ctx.lineTo(qx, qy);
        else ctx.moveTo(qx, qy);
      });
      ctx.closePath();
      ctx.fill();
    }
    if (scale === 1) {
      ctx.fillStyle = dp ? INK : GHOST;
      const [qx, qy] = P(w + t * 0.35, h - t * 0.9);
      ctx.fillRect(qx, qy, t * 0.95, t * 0.95);
    }
  }
}

/** Plain text of what the LCD shows, for screen readers. */
export function viewText(view) {
  if (!view.on) return 'Off';
  let lower = '';
  if (view.lower) {
    lower = (view.lower.neg ? '-' : '') + view.lower.cells.map((c) => c.ch + (c.dp ? '.' : '')).join('');
    if (view.lower.exp) lower += ` times ten to the ${view.lower.exp.neg ? '-' : ''}${view.lower.exp.digits}`;
  }
  return `${view.upper} ${lower}`.trim();
}
