// Natural-display layout: turns a token buffer (with template markers) into
// drawing operations on a dot grid plus one caret position per cursor gap.
// DOM-free so the calculator (▲▼ navigation) and tests can use it too.
//
// Coordinates are in dots. Every box is measured from its left edge (x = 0)
// and its baseline (y = 0, y grows downwards). A 5×7 glyph occupies rows
// -7..-1 and columns 0..4; items in a row are separated by one blank column.

import { DIGITS, SLOTS, TEMPLATE_START, tokenText } from './engine/tokens.js';

const GLYPH_W = 5;
const GLYPH_H = 7;
const BAR = -4; // fraction bar row, level with the middle of a glyph
export const PLACEHOLDER = '□';

// ---------- token tree ----------

/** Split tokens into rows of items; templates hold one row per slot. */
export function tree(tokens) {
  let i = 0;
  function row(start) {
    const items = [];
    while (i < tokens.length && tokens[i] !== 'tSep' && tokens[i] !== 'tEnd') {
      const t = tokens[i];
      if (TEMPLATE_START.has(t)) {
        const s = i++;
        const slots = [];
        for (let k = 0; k < SLOTS[t]; k++) {
          slots.push(row(i));
          if (i < tokens.length) i++; // consume tSep / tEnd
        }
        items.push({ kind: 'tpl', t, start: s, end: i - 1, slots });
      } else {
        items.push({ kind: 'tok', t, start: i });
        i++;
      }
    }
    return { items, start, end: i };
  }
  const root = row(0);
  root.end = tokens.length;
  return root;
}

// ---------- boxes ----------
// box: { w, asc, desc, ops: [...], carets: [...] }
// ops: { g: char, x, y } (y = top row) | { h: [x0, x1], y } | { l: [x0, y0, x1, y1] }
// carets: { index, x, base, depth }  (cursor sits just left of column x, on baseline
//         `base`; depth = number of enclosing templates)

function shift(box, dx, dy, ops, carets) {
  for (const o of box.ops) {
    if (o.g !== undefined) ops.push({ g: o.g, x: o.x + dx, y: o.y + dy });
    else if (o.h) ops.push({ h: [o.h[0] + dx, o.h[1] + dx], y: o.y + dy });
    else ops.push({ l: [o.l[0] + dx, o.l[1] + dy, o.l[2] + dx, o.l[3] + dy] });
  }
  for (const c of box.carets) carets.push({ index: c.index, x: c.x + dx, base: c.base + dy, depth: c.depth });
}

function textBox(str, advance = GLYPH_W + 1) {
  const chars = Array.from(str);
  const ops = chars.map((g, k) => ({ g, x: k * advance, y: -GLYPH_H }));
  const w = chars.length ? (chars.length - 1) * advance + GLYPH_W : 0;
  return { w, asc: GLYPH_H, desc: 0, ops, carets: [] };
}

/** Lay boxes side by side with a one-dot gap. */
function hcat(boxes) {
  const ops = [];
  const carets = [];
  let x = 0;
  let asc = GLYPH_H;
  let desc = 0;
  const xs = [];
  boxes.forEach((b, k) => {
    if (k) x += 1;
    xs.push(x);
    shift(b, x, 0, ops, carets);
    x += b.w;
    asc = Math.max(asc, b.asc);
    desc = Math.max(desc, b.desc);
  });
  return { w: x, asc, desc, ops, carets, xs };
}

function rowBox(row, placeholder) {
  if (!row.items.length) {
    const b = placeholder ? textBox(PLACEHOLDER) : { w: 0, asc: GLYPH_H, desc: 0, ops: [], carets: [] };
    b.carets = [{ index: row.end, x: 0, base: 0, depth: 0 }];
    return b;
  }
  const boxes = row.items.map(itemBox);
  stretchBrackets(row.items, boxes);
  const b = hcat(boxes);
  row.items.forEach((it, k) => b.carets.push({ index: it.start, x: b.xs[k], base: 0, depth: 0 }));
  b.carets.push({ index: row.end, x: b.w + 1, base: 0, depth: 0 });
  return b;
}

const isTok = (it, t) => it.kind === 'tok' && it.t === t;

/** Bracket drawn as tall as `asc`/`desc`; side 'l' or 'r'. */
function parenBox(asc, desc, side) {
  const top = -asc;
  const bot = desc - 1;
  const X = (x) => (side === 'l' ? x : 2 - x);
  const ops = [
    { l: [X(2), top, X(1), top + 1] },
    { l: [X(0), top + 2, X(0), bot - 2] },
    { l: [X(1), bot - 1, X(2), bot] },
  ];
  return { w: 3, asc, desc, ops, carets: [] };
}

/** Make "(" ... ")" as tall as what they enclose (an unclosed "(" runs to the end of the row). */
function stretchBrackets(items, boxes) {
  const open = [];
  const pairs = [];
  items.forEach((it, k) => {
    if (isTok(it, 'lp')) open.push(k);
    else if (isTok(it, 'rp') && open.length) pairs.push([open.pop(), k]);
  });
  while (open.length) pairs.push([open.pop(), null]);
  // innermost pairs come first, so outer brackets see the already-stretched inner ones
  for (const [a, b] of pairs) {
    const end = b === null ? boxes.length : b;
    let asc = GLYPH_H;
    let desc = 0;
    for (let k = a + 1; k < end; k++) {
      asc = Math.max(asc, boxes[k].asc);
      desc = Math.max(desc, boxes[k].desc);
    }
    if (asc === GLYPH_H && desc === 0) continue;
    boxes[a] = parenBox(asc + 1, desc + 1, 'l');
    if (b !== null) boxes[b] = parenBox(asc + 1, desc + 1, 'r');
  }
}

function bracketed(arg) {
  const tall = arg.asc > GLYPH_H || arg.desc > 0;
  const l = tall ? parenBox(arg.asc + 1, arg.desc + 1, 'l') : textBox('(');
  const r = tall ? parenBox(arg.asc + 1, arg.desc + 1, 'r') : textBox(')');
  return hcat([l, arg, r]);
}

/** |arg| with bars as tall as the contents. */
function absBox(arg) {
  const top = -arg.asc;
  const bot = arg.desc - 1;
  const ops = [{ l: [0, top, 0, bot] }, { l: [arg.w + 3, top, arg.w + 3, bot] }];
  const carets = [];
  shift(arg, 2, 0, ops, carets);
  return { w: arg.w + 4, asc: arg.asc, desc: arg.desc, ops, carets };
}

/** Subscript (log base): top of the box three rows above the baseline. */
function subBox(b) {
  const ops = [];
  const carets = [];
  const base = b.asc - 3;
  shift(b, 0, base, ops, carets);
  return { w: b.w, asc: GLYPH_H, desc: base + b.desc, ops, carets };
}

function fracBox(num, den) {
  const inner = Math.max(num.w, den.w);
  const w = inner + 2;
  const ops = [{ h: [0, w - 1], y: BAR }];
  const carets = [];
  const numBase = BAR - 1 - num.desc;
  const denBase = BAR + 2 + den.asc;
  shift(num, 1 + Math.floor((inner - num.w) / 2), numBase, ops, carets);
  shift(den, 1 + Math.floor((inner - den.w) / 2), denBase, ops, carets);
  return { w, asc: -(numBase - num.asc), desc: denBase + den.desc, ops, carets };
}

/** Radical sign + overbar around `arg`, optionally with a raised index. */
function rootBox(arg, index) {
  const ops = [];
  const carets = [];
  const top = -arg.asc - 2;
  const b = arg.desc - 1;
  let x0 = 0;
  let asc = arg.asc + 2;
  if (index) {
    const idxBase = b - 3 - index.desc;
    shift(index, 0, idxBase, ops, carets);
    asc = Math.max(asc, -(idxBase - index.asc));
    x0 = Math.max(0, index.w - 2);
  }
  ops.push({ l: [x0, b - 2, x0 + 2, b] });
  ops.push({ l: [x0 + 3, top, x0 + 3, b] });
  ops.push({ h: [x0 + 3, x0 + 5 + arg.w], y: top });
  shift(arg, x0 + 5, 0, ops, carets);
  return { w: x0 + 6 + arg.w, asc, desc: Math.max(arg.desc, 0), ops, carets };
}

/** Exponent raised so its bottom row sits just above the glyph middle. */
function supBox(exp) {
  const ops = [];
  const carets = [];
  const base = BAR - exp.desc;
  shift(exp, 0, base, ops, carets);
  return { w: exp.w, asc: Math.max(GLYPH_H, -(base - exp.asc)), desc: 0, ops, carets };
}

function itemBox(it) {
  if (it.kind === 'tok') return textBox(tokenText(it.t));
  const s = it.slots.map((r) => rowBox(r, true));
  for (const box of s) for (const c of box.carets) c.depth++;
  switch (it.t) {
    case 'tFrac':
      return fracBox(s[0], s[1]);
    case 'tMixed':
      return hcat([s[0], fracBox(s[1], s[2])]);
    case 'tSqrt':
      return rootBox(s[0]);
    case 'tCbrt':
      return rootBox(s[0], textBox('3'));
    case 'tRoot':
      return rootBox(s[1], s[0]);
    case 'tPow':
      return supBox(s[0]);
    case 'tTenx':
      return hcat([textBox('10'), supBox(s[0])]);
    case 'tEx':
      return hcat([textBox('e'), supBox(s[0])]);
    case 'tAbs':
      return absBox(s[0]);
    case 'tLogb':
      return hcat([textBox('log'), subBox(s[0]), bracketed(s[1])]);
  }
  return textBox('?');
}

/**
 * Layout of an expression, with an optional plain-text suffix (e.g. "=" or "M+").
 * Returns { w, asc, desc, ops, carets } where carets has exactly one entry per
 * cursor index 0..tokens.length.
 */
export function layoutExpr(tokens, suffix = '') {
  const b = rowBox(tree(tokens), false);
  if (!suffix) return b;
  const s = textBox(suffix);
  const gap = tokens.length ? 1 : 0;
  shift(s, b.w + gap, 0, b.ops, []);
  b.w += gap + s.w;
  return b;
}

/** Layout of plain text; `advance` is the column pitch per character. */
export function layoutText(str, advance) {
  return textBox(str, advance);
}

/** Layout of a fraction result { neg, w, n, d } (w = whole part, or null). */
export function layoutFraction({ neg, w, n, d }) {
  const parts = [];
  if (neg) parts.push(textBox('-'));
  if (w) parts.push(textBox(w));
  parts.push(fracBox(textBox(n), textBox(d)));
  return hcat(parts);
}

/**
 * Layout of a result as produced by formatLower(): a stacked fraction, a
 * sexagesimal value (2°30′36″) or a decimal with an optional ×10^n exponent.
 */
export function layoutValue(v, maxW = Infinity) {
  const full = valueBox(v);
  if (full.w <= maxW || v.frac || !v.exp) return full;
  // too wide for the screen: round the mantissa to fewer digits until it fits
  const mant = v.cells.map((c) => c.ch + (c.dp ? '.' : '')).join('');
  const digits = mant.replace(/\D/g, '').length;
  for (let p = digits - 1; p >= 1; p--) {
    const s = Number(mant).toPrecision(p);
    const cells = Array.from(s.replace('.', '')).map((ch, k) => ({ ch, dp: s.indexOf('.') === k + 1 }));
    const box = valueBox({ ...v, cells });
    if (box.w <= maxW) return box;
  }
  return full;
}

function valueBox(v) {
  if (v.frac) return layoutFraction({ ...v.frac, neg: v.neg });
  let mant = (v.neg ? '-' : '') + v.cells.map((c) => c.ch + (c.dp ? '.' : '')).join('');
  if (mant.includes('°')) {
    let k = 0;
    mant = mant.replace(/°/g, () => (k++ === 0 ? '°' : '′'));
    if (k > 1) mant += '″';
  } else if (mant.endsWith('.')) mant = mant.slice(0, -1);
  if (!v.exp) return textBox(mant);
  const e = (v.exp.neg ? '-' : '') + String(Number(v.exp.digits));
  return hcat([textBox(mant), textBox('×10'), supBox(textBox(e))]);
}

// ---------- linear text (tests, screen readers) ----------

function rowText(row) {
  return row.items.map(itemText).join('');
}

function grouped(row) {
  const s = rowText(row);
  const atomic = row.items.length <= 1 || row.items.every((it) => it.kind === 'tok' && (DIGITS.has(it.t) || it.t === '.'));
  return atomic ? s : `(${s})`;
}

function itemText(it) {
  if (it.kind === 'tok') return tokenText(it.t);
  const s = it.slots.map(grouped);
  switch (it.t) {
    case 'tFrac':
      return `${s[0]}/${s[1]}`;
    case 'tMixed':
      return `${s[0]} ${s[1]}/${s[2]}`;
    case 'tSqrt':
      return `√${s[0]}`;
    case 'tCbrt':
      return `³√${s[0]}`;
    case 'tRoot':
      return `${s[0]}ˣ√${s[1]}`;
    case 'tPow':
      return `^${s[0]}`;
    case 'tTenx':
      return `10^${s[0]}`;
    case 'tEx':
      return `e^${s[0]}`;
    case 'tAbs':
      return `Abs(${rowText(it.slots[0])})`;
    case 'tLogb':
      return `log_${s[0]}(${rowText(it.slots[1])})`;
  }
  return '?';
}

/** Readable one-line text for a token buffer. */
export function linearText(tokens) {
  return rowText(tree(tokens));
}
