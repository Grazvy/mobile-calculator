// Formats values for the 10-digit 7-segment lower line.
// A lower-line view is { neg, cells: [{ch, dp}], exp: null | {neg, digits} }.

import { Fraction } from './fraction.js';
import { round15, toNum } from './evaluate.js';

const MAX_DIGITS = 10;
const isF = (v) => v instanceof Fraction;
const stripZeros = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
const digitCount = (s) => s.replace(/[^0-9]/g, '').length;
const intDigits = (a) => (a >= 1 ? Math.floor(Math.log10(a)) + 1 : 1);

function sci(a, sig, strip) {
  const [m, e] = a.toExponential(sig - 1).split('e');
  return { mant: strip ? stripZeros(m) : m, exp: parseInt(e, 10) };
}

function fixed(a, decimals) {
  let d = Math.max(0, decimals);
  let s = a.toFixed(d);
  while (digitCount(s) > MAX_DIGITS && d > 0) s = a.toFixed(--d);
  return s;
}

/** Decimal formatting for Norm 1/2, Fix n and Sci n. Returns {mant, exp}. */
export function decimalParts(a, fmt) {
  if (fmt.type === 'Sci') return sci(a, fmt.n || 10, false);
  if (a === 0) return { mant: fmt.type === 'Fix' ? (0).toFixed(fmt.n) : '0', exp: null };
  if (fmt.type === 'Fix') {
    if (a >= 1e10) return sci(a, 10, true);
    const s = fixed(a, Math.min(fmt.n, MAX_DIGITS - intDigits(a)));
    if (parseFloat(s) >= 1e10) return sci(a, 10, true);
    return { mant: s, exp: null };
  }
  const lo = fmt.n === 2 ? 1e-9 : 1e-2;
  if (a >= 1e10 || a < lo) return sci(a, 10, true);
  const s = fixed(a, MAX_DIGITS - intDigits(a));
  if (parseFloat(s) >= 1e10) return sci(a, 10, true);
  return { mant: stripZeros(s), exp: null };
}

/** Engineering notation: exponent a multiple of 3, shifted by `shift` steps of 3. */
export function engParts(a, shift) {
  if (a === 0) return { mant: '0', exp: 0 };
  const e10 = parseInt(a.toExponential(9).split('e')[1], 10);
  const exp = e10 - (((e10 % 3) + 3) % 3) - 3 * shift;
  if (Math.abs(exp) > 99) return null;
  const m = round15(a / Math.pow(10, exp));
  const id = intDigits(m);
  if (id > MAX_DIGITS) return null;
  const s = stripZeros(fixed(m, MAX_DIGITS - id));
  if (m < 1 && /^0\.0*$/.test(s)) return null; // mantissa would vanish
  return { mant: s, exp };
}

function cellsFrom(str, { trailingPoint }) {
  const cells = [];
  for (const ch of str) {
    if (ch === '.') {
      if (cells.length) cells[cells.length - 1].dp = true;
      else cells.push({ ch: '0', dp: true });
    } else cells.push({ ch, dp: false });
  }
  if (trailingPoint && !str.includes('.') && cells.length) cells[cells.length - 1].dp = true;
  return cells;
}

function expView(exp) {
  if (exp === null || exp === undefined) return null;
  return { neg: exp < 0, digits: String(Math.abs(exp)).padStart(2, '0') };
}

/** Exact Fraction for a value, or a close rational approximation of a float. */
export function rationalOf(value) {
  if (isF(value)) return value;
  const x = round15(value);
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return Number.isSafeInteger(x) ? Fraction.of(x) : null;
  const neg = x < 0;
  const a0 = Math.abs(x);
  // continued fraction expansion
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  let y = a0;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(y);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 1e10) return null;
    if (Math.abs(h1 / k1 - a0) <= 1e-14 * Math.max(1, a0)) {
      return new Fraction(BigInt(neg ? -h1 : h1), BigInt(k1));
    }
    const r = y - a;
    if (r < 1e-15) break;
    y = 1 / r;
  }
  return null;
}

/** "w⌟n⌟d" (mixed) or "n⌟d" (improper); null when it is an integer or does not fit. */
export function fractionString(f, improper) {
  if (!f || f.d === 1n) return null;
  const neg = f.n < 0n;
  const n = neg ? -f.n : f.n;
  const s = improper || n < f.d ? `${n}⌟${f.d}` : `${n / f.d}⌟${n % f.d}⌟${f.d}`;
  return s.length > MAX_DIGITS ? null : { neg, s };
}

/** Fraction digits for the stacked dot-matrix result: { neg, w (whole or null), n, d }. */
export function fractionParts(f, improper) {
  const fs = fractionString(f, improper);
  if (!fs) return null;
  const [a, b, c] = fs.s.split('⌟');
  return c === undefined ? { neg: fs.neg, w: null, n: a, d: b } : { neg: fs.neg, w: a, n: b, d: c };
}

/** Sexagesimal string "d°m°s.ss"; null when the value is too large to show. */
export function dmsString(x) {
  const neg = x < 0;
  const a = Math.abs(round15(x));
  if (a >= 1e7) return null;
  for (let dec = 6; dec >= 0; dec--) {
    const unit = 3600 * 10 ** dec;
    const total = Math.round(a * unit);
    const d = Math.floor(total / unit);
    let rem = total - d * unit;
    const m = Math.floor(rem / (60 * 10 ** dec));
    rem -= m * 60 * 10 ** dec;
    const s = stripZeros((rem / 10 ** dec).toFixed(dec));
    const str = `${d}°${m}°${s}`;
    if (digitCount(str) + 2 <= MAX_DIGITS) return { neg, s: str };
  }
  return null;
}

/**
 * Lower-line view for a value.
 * disp: { mode: 'dec'|'frac'|'dms'|'eng', engShift, improper }
 */
export function formatLower(value, disp, fmt) {
  const x = round15(toNum(value));
  if (disp.mode === 'frac') {
    // drawn as a stacked fraction on the dot matrix; the 7-segment line stays blank
    const frac = fractionParts(rationalOf(value), disp.improper);
    if (frac) return { neg: frac.neg, cells: [], exp: null, frac };
  }
  if (disp.mode === 'dms') {
    const ds = dmsString(x);
    if (ds) return { neg: ds.neg && x !== 0, cells: cellsFrom(ds.s, { trailingPoint: false }), exp: null };
  }
  let parts = null;
  if (disp.mode === 'eng') parts = engParts(Math.abs(x), disp.engShift || 0);
  if (!parts) parts = decimalParts(Math.abs(x), fmt);
  return {
    neg: x < 0,
    cells: cellsFrom(parts.mant, { trailingPoint: true }),
    exp: expView(parts.exp),
  };
}

/** Plain-text rendering of a lower-line view (for tests and accessibility). */
export function lowerText(view) {
  if (!view) return '';
  let s = view.neg ? '-' : '';
  if (view.frac) return s + (view.frac.w ? `${view.frac.w} ` : '') + `${view.frac.n}/${view.frac.d}`;
  for (const c of view.cells) s += c.ch + (c.dp ? '.' : '');
  if (view.exp) s += `e${view.exp.neg ? '-' : ''}${view.exp.digits}`;
  return s;
}
