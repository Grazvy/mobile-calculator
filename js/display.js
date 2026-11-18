// Canvas LCD in the natural-display style: a row of status indicators above
// one dot matrix that shows the input (top-left, textbook layout), the result
// (bottom-right), menus and error screens. All dots share one size, so the
// gaps between them show as a fine grid, through the text as well.

import { layoutExpr, layoutText, layoutValue } from './layout.js';
import { glyph, smallGlyph } from './font.js';
import { lowerText } from './engine/format.js';

export const COLS = 72; // 12 characters across, the same dot size as the old single line
const LINE = 8; // row pitch of text lines in menus / error screens
const INK = 'rgba(22, 28, 20, 0.92)';
const GHOST = 'rgba(22, 28, 20, 0.07)';
const GRID = 'rgba(22, 28, 20, 0.05)'; // unlit dots: a faint matrix behind the text
// Dot sizes as a share of the dot pitch (1 = no gap, smaller = wider gaps).
const TEXT_DOT = 0.92; // lit dots: letters, digits, bars  <- adjust the letter grid gaps here
const GRID_DOT = 0.84; // unlit dots: the faint background grid

const INDICATORS = [
  ['S', 0.0], ['A', 0.055], ['M', 0.11], ['STO', 0.175], ['RCL', 0.27],
  ['SD', 0.37], ['REG', 0.44], ['D', 0.545], ['R', 0.6], ['G', 0.655],
  ['FIX', 0.725], ['SCI', 0.815],
];

/** Dot bitmap; drawing can be limited to the rows above `limit`. */
class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.limit = rows;
    this.bits = new Uint8Array(cols * rows);
  }
  set(x, y, v = 1) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.limit) this.bits[y * this.cols + x] = v;
  }
  get(x, y) {
    return this.bits[y * this.cols + x];
  }
  draw(ops, ox, oy) {
    for (const o of ops) {
      if (o.g !== undefined) {
        // o.s: small 3×5 glyph (exponents, log base, root index), else 5×7
        const [w, h] = o.s ? [3, 5] : [5, 7];
        const rows = o.s ? smallGlyph(o.g) : glyph(o.g);
        for (let r = 0; r < h; r++) {
          for (let k = 0; k < w; k++) if ((rows[r] >> (w - 1 - k)) & 1) this.set(ox + o.x + k, oy + o.y + r);
        }
      } else if (o.h) {
        for (let x = o.h[0]; x <= o.h[1]; x++) this.set(ox + x, oy + o.y);
      } else {
        this.line(ox + o.l[0], oy + o.l[1], ox + o.l[2], oy + o.l[3]);
      }
    }
  }
  line(x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
  }
}

export class LcdRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sx = 0; // horizontal scroll of the input, in dots
    this.sy = 0; // vertical scroll of the input, in dots
    this.blink = true;
    this.frame = null; // geometry of the last render, for hitTest()
    this.free = false; // true after a manual scroll: the view stops following the cursor
    this.rem = [0, 0]; // sub-dot remainder of manual scrolling
    this.pitch = 1; // dot pitch in CSS pixels, from the last render
    this.range = { x: 0, y: 0 }; // how far the input can scroll, in dots
    this.resize();
  }

  /** Scroll the input by (dx, dy) dots; it stays put until follow() is called. */
  scrollBy(dx, dy) {
    this.free = true;
    const step = (k, d) => {
      this.rem[k] += d;
      const n = Math.trunc(this.rem[k]);
      this.rem[k] -= n;
      return n;
    };
    this.sx = Math.max(0, Math.min(this.range.x, this.sx + step(0, dx)));
    this.sy = Math.max(0, Math.min(this.range.y, this.sy + step(1, dy)));
  }

  /** Go back to keeping the cursor in view (after a key press or tap). */
  follow() {
    this.free = false;
    this.rem = [0, 0];
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
    this.frame = null;
    if (!view.on) return;

    const pad = w * 0.045;
    const inner = w - 2 * pad;

    // --- indicator row ---
    const ih = w * 0.052;
    const iy = w * 0.02;
    ctx.font = `600 ${Math.round(ih * 0.62)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'top';
    for (const [name, x] of INDICATORS) {
      ctx.fillStyle = view.ind[name] ? INK : GHOST;
      ctx.fillText(name, pad + x * inner, iy);
    }
    this.triangle(pad + inner * 0.925, iy + ih * 0.42, ih * 0.42, -1, view.ind.up);
    this.triangle(pad + inner * 0.985, iy + ih * 0.42, ih * 0.42, 1, view.ind.down);

    // --- dot matrix: everything below the indicators ---
    const pitch = inner / COLS;
    this.pitch = pitch;
    const gy = iy + ih + w * 0.012;
    const rows = Math.max(LINE, Math.floor((h - gy - w * 0.025) / pitch));
    this.drawMatrix(view, pad, gy, pitch, rows);
  }

  drawMatrix(view, x0, y0, pitch, rows) {
    const grid = new Grid(COLS, rows);
    let marks = null;

    if (view.lines) {
      // menus and error screens: plain text lines
      view.lines.forEach((line, k) => grid.draw(layoutText(line).ops, 1, 7 + k * LINE));
      this.sx = this.sy = 0;
      this.range = { x: 0, y: 0 };
      if (view.more) marks = { more: true };
    } else {
      const isExpr = Array.isArray(view.expr);
      const lay = isExpr ? layoutExpr(view.expr, view.suffix) : layoutText(view.upper || '');

      // result: right-aligned on the bottom rows; the input gets the rows above it
      const res = view.phase === 'result' && view.lower ? layoutValue(view.lower, COLS - 2) : null;
      // rows above the result are only needed when input and result would overlap
      const overlaps = res && lay.w + 3 > COLS - res.w - 1;
      const avail = overlaps ? rows - (res.asc + res.desc + 2) : rows;

      const cursor = isExpr && view.cursor !== null && view.cursor !== undefined ? view.cursor : null;
      const caret = cursor === null ? null : lay.carets.find((c) => c.index === cursor);
      this.range = {
        x: Math.max(0, lay.w + 7 - COLS),
        y: Math.max(0, lay.asc + lay.desc + 1 - avail),
      };
      if (this.free) {
        // scrolled by hand (wheel / drag): keep that position, only clamp it
      } else if (!caret) {
        this.sx = 0;
        this.sy = 0;
      } else {
        // scroll just enough to keep the cursor visible
        const left = caret.x - 1;
        const right = caret.x + (caret.h === 5 ? 3 : 5);
        if (left - this.sx < 0) this.sx = left;
        if (right - this.sx > COLS - 2) this.sx = right - (COLS - 2);
        const ctop = lay.asc + caret.base - (caret.h + 1);
        const cbot = lay.asc + caret.base + 1;
        if (ctop - this.sy < 0) this.sy = ctop;
        if (cbot - this.sy > avail - 1) this.sy = cbot - (avail - 1);
      }
      this.sx = Math.max(0, Math.min(this.sx, this.range.x));
      this.sy = Math.max(0, Math.min(this.sy, this.range.y));
      const ox = 1 - this.sx;
      const oy = lay.asc - this.sy;
      grid.limit = Math.max(0, avail);
      grid.draw(lay.ops, ox, oy);
      if (caret && this.blink) {
        const cx = ox + caret.x;
        const cy = oy + caret.base;
        // the cursor is as tall (insert) or as wide (overwrite) as the glyphs around it
        if (view.insert) for (let y = cy - caret.h - 1; y <= cy; y++) grid.set(cx - 1, y);
        else for (let x = cx; x < cx + (caret.h === 5 ? 3 : 5); x++) grid.set(x, cy);
      }
      grid.limit = rows;

      if (res) grid.draw(res.ops, COLS - res.w - 1, rows - res.desc - 1);

      marks = {
        left: this.sx > 0,
        right: lay.w + 1 - this.sx > COLS,
        up: this.sy > 0,
        down: lay.asc + lay.desc - this.sy > avail,
        y: Math.min(avail - 4, Math.max(3.5, oy - 3.5)),
      };
      if (isExpr) this.frame = { x0, y0, pitch, ox, oy, carets: lay.carets };
    }

    // every dot, lit or not, has the same size, so the gaps form one fine grid
    const { ctx } = this;
    const gd = pitch * GRID_DOT;
    const td = pitch * TEXT_DOT;
    ctx.fillStyle = GRID;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!grid.get(x, y)) ctx.rect(x0 + x * pitch, y0 + y * pitch, gd, gd);
      }
    }
    ctx.fill();

    // lit dots on top
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid.get(x, y)) ctx.rect(x0 + x * pitch, y0 + y * pitch, td, td);
      }
    }
    ctx.fill();

    if (marks && marks.more) {
      // the menu has further pages (◀▶ / ▲▼)
      this.triangle(x0 + COLS * pitch + pitch * 1.6, y0 + (rows - 1.5) * pitch, pitch * 2, 1, true);
    } else if (marks) {
      const my = y0 + marks.y * pitch;
      if (marks.left) this.arrowMark(x0 - pitch * 1.8, my, pitch, -1);
      if (marks.right) this.arrowMark(x0 + COLS * pitch + pitch * 1.6, my, pitch, 1);
      const cx = x0 + COLS * pitch + pitch * 1.6;
      if (marks.up) this.triangle(cx, y0 + pitch * 1.5, pitch * 2, -1, true);
      if (marks.down) this.triangle(cx, y0 + (rows - 1.5) * pitch, pitch * 2, 1, true);
    }
  }

  /** Cursor index nearest to a tap at client coordinates, or null. */
  hitTest(clientX, clientY) {
    const f = this.frame;
    if (!f || !f.carets.length) return null;
    const r = this.canvas.getBoundingClientRect();
    const gx = (clientX - r.left - f.x0) / f.pitch - f.ox;
    const gy = (clientY - r.top - f.y0) / f.pitch - f.oy;
    let best = null;
    let bestScore = Infinity;
    for (const c of f.carets) {
      const dx = Math.abs(gx - (c.x - 0.5));
      const dy = Math.abs(gy - (c.base - c.h / 2));
      const score = dx + 1.5 * Math.max(0, dy - 3);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best ? best.index : null;
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

  arrowMark(cx, cy, p, dir) {
    const { ctx } = this;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(cx + dir * p * 0.6, cy);
    ctx.lineTo(cx - dir * p * 0.5, cy - p * 1.2);
    ctx.lineTo(cx - dir * p * 0.5, cy + p * 1.2);
    ctx.closePath();
    ctx.fill();
  }
}

/** Plain text of what the LCD shows, for screen readers. */
export function viewText(view) {
  if (!view.on) return 'Off';
  if (view.lines) return view.lines.filter(Boolean).join(', ');
  let lower = view.phase === 'result' && view.lower ? lowerText(view.lower) : '';
  if (view.lower && view.lower.exp) lower = lower.replace(/e(-?\d+)$/, ' times ten to the $1');
  return `${view.upper} ${lower}`.trim();
}
