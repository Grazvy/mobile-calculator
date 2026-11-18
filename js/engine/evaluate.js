// Evaluates a parsed expression tree. Values are either exact Fractions
// (kept while only rational operations are used) or JS numbers.

import { Fraction, icbrt, isqrt } from './fraction.js';
import { CalcError } from './tokens.js';
import { regEstimate, statValue, StatError } from './stats.js';

const LIMIT = 1e100;
const isF = (v) => v instanceof Fraction;
export const toNum = (v) => (isF(v) ? v.toNumber() : v);
const ZERO = Fraction.of(0);

const HALF_TURN = { D: 180, R: Math.PI, G: 200 };

/** Round to the 15 significant digits kept internally. */
export function round15(x) {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(15));
}

function mathErr(pos) {
  return new CalcError('Math', pos);
}

/** Range-check a value; collapse oversized fractions to floats. */
function check(v, pos) {
  if (isF(v)) {
    if (v.size() <= 60) {
      if (!(Math.abs(v.toNumber()) < LIMIT)) throw mathErr(pos);
      return v;
    }
    v = v.toNumber();
  }
  if (!Number.isFinite(v) || Math.abs(v) >= LIMIT) throw mathErr(pos);
  if (Math.abs(v) < 1e-99) return 0;
  return v;
}

const isIntVal = (v) => (isF(v) ? v.isInteger() : Number.isInteger(round15(v)));

function toRad(x, angle) {
  return angle === 'R' ? x : (x * Math.PI) / HALF_TURN[angle];
}

function fromRad(r, angle) {
  return angle === 'R' ? r : (r * HALF_TURN[angle]) / Math.PI;
}

/** Angle in half-turns reduced to [0, 2), snapped to exact quarter turns. */
function halfTurns(x, angle, pos) {
  const limit = angle === 'D' ? 9e9 : angle === 'G' ? 1e10 : 5e7 * Math.PI;
  if (Math.abs(x) >= limit) throw mathErr(pos);
  let t = angle === 'R' ? x / Math.PI : (x % (2 * HALF_TURN[angle])) / HALF_TURN[angle];
  t %= 2;
  if (t < 0) t += 2;
  const q = Math.round(t * 2) / 2;
  if (Math.abs(t - q) < (angle === 'R' ? 1e-14 : 1e-15)) t = q % 2;
  return t;
}

function trig(fn, x, angle, pos) {
  const t = halfTurns(x, angle, pos);
  const onAxis = t === 0 || t === 1;
  const offAxis = t === 0.5 || t === 1.5;
  switch (fn) {
    case 'sin': return onAxis ? 0 : Math.sin(t * Math.PI);
    case 'cos': return offAxis ? 0 : Math.cos(t * Math.PI);
    default:
      if (offAxis) throw mathErr(pos);
      return onAxis ? 0 : Math.tan(t * Math.PI);
  }
}

function factorial(v, pos) {
  if (!isIntVal(v)) throw mathErr(pos);
  const n = Math.round(toNum(v));
  if (n < 0 || n > 69) throw mathErr(pos);
  let r = 1n;
  for (let k = 2n; k <= BigInt(n); k++) r *= k;
  return new Fraction(r);
}

function permComb(a, b, comb, pos) {
  if (!isIntVal(a) || !isIntVal(b)) throw mathErr(pos);
  const n = Math.round(toNum(a));
  let r = Math.round(toNum(b));
  if (n < 0 || r < 0 || r > n || n >= 1e10) throw mathErr(pos);
  if (comb && r > n - r) r = n - r;
  const big = 10n ** 100n;
  let res = 1n;
  for (let k = 0; k < r; k++) {
    res *= BigInt(n - k);
    if (comb) res /= BigInt(k + 1);
    if (res >= big) throw mathErr(pos);
  }
  return new Fraction(res);
}

function powNum(x, y, yExact, pos) {
  if (x === 0) {
    if (y <= 0) throw mathErr(pos);
    return 0;
  }
  if (x > 0 || Number.isInteger(y)) return Math.pow(x, y);
  // negative base with a fractional exponent: only odd-denominator rationals are real
  if (isF(yExact) && yExact.d % 2n === 1n) {
    const r = Math.pow(-x, y);
    return yExact.n % 2n === 0n ? r : -r;
  }
  const inv = 1 / y;
  const k = Math.round(inv);
  if (Math.abs(inv - k) < 1e-12 && Math.abs(k) % 2 === 1) return -Math.pow(-x, y);
  throw mathErr(pos);
}

function power(a, b, pos) {
  if (isF(a) && isF(b) && b.isInteger()) {
    const k = b.n;
    if (a.isZero() && k <= 0n) throw mathErr(pos);
    const absK = k < 0n ? -k : k;
    if (absK <= 400n && BigInt(a.size()) * absK <= 400n) return a.pow(k);
  }
  return powNum(toNum(a), toNum(b), b, pos);
}

function root(index, x, pos) {
  const n = toNum(index);
  const v = toNum(x);
  if (n === 0) throw mathErr(pos);
  if (isF(index) && isF(x) && index.isInteger() && (index.n === 2n || index.n === 3n)) {
    const exact = index.n === 2n ? exactSqrt(x) : exactCbrt(x);
    if (exact) return exact;
  }
  if (v < 0) {
    if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return -Math.pow(-v, 1 / n);
    throw mathErr(pos);
  }
  return Math.pow(v, 1 / n);
}

function exactSqrt(f) {
  if (!isF(f) || f.n < 0n || f.size() > 60) return null;
  const a = isqrt(f.n);
  const b = isqrt(f.d);
  return a * a === f.n && b * b === f.d ? new Fraction(a, b) : null;
}

function exactCbrt(f) {
  if (!isF(f) || f.size() > 60) return null;
  const neg = f.n < 0n;
  const n = neg ? -f.n : f.n;
  const a = icbrt(n);
  const b = icbrt(f.d);
  if (a * a * a !== n || b * b * b !== f.d) return null;
  return new Fraction(neg ? -a : a, b);
}

/** Round a value the way Rnd does: to the current display format. */
export function roundToFormat(x, fmt) {
  if (x === 0) return 0;
  if (fmt.type === 'Fix') return Number(x.toFixed(fmt.n));
  if (fmt.type === 'Sci') return Number(x.toPrecision(fmt.n || 10));
  return Number(x.toPrecision(10));
}

const arith = {
  add: (a, b) => (isF(a) && isF(b) ? a.add(b) : toNum(a) + toNum(b)),
  sub: (a, b) => (isF(a) && isF(b) ? a.sub(b) : toNum(a) - toNum(b)),
  mul: (a, b) => (isF(a) && isF(b) ? a.mul(b) : toNum(a) * toNum(b)),
};

/**
 * @param tree  parse() result
 * @param ctx   { angle, fmt, vars, ans, random, mode, sd, reg, flags }
 *              flags is filled with { frac, dms, decimal } describing the input.
 */
export function evaluate(tree, ctx) {
  const flags = ctx.flags || (ctx.flags = {});
  const stat = (fn, pos) => {
    if (ctx.mode !== 'SD' && ctx.mode !== 'REG') throw new CalcError('Syntax', pos);
    try {
      return fn(ctx.mode === 'SD' ? ctx.sd : ctx.reg);
    } catch (e) {
      if (e instanceof StatError) throw mathErr(pos);
      throw e;
    }
  };

  function ev(node) {
    const pos = node.pos;
    switch (node.type) {
      case 'num':
        if (node.decimal) flags.decimal = true;
        return check(node.value, pos);

      case 'atom': {
        const name = node.name;
        if (name === 'pi') return Math.PI;
        if (name === 'ans') return ctx.ans ?? ZERO;
        if (name === 'ran') return new Fraction(BigInt(Math.floor(ctx.random() * 1000)), 1000n);
        if (name[0] === 'v' && name.length === 2) return ctx.vars[name[1]] ?? ZERO;
        return check(stat((d) => statValue(name, d), pos), pos);
      }

      case 'bin': {
        const a = ev(node.a);
        const b = ev(node.b);
        switch (node.op) {
          case 'add':
          case 'sub':
          case 'mul':
            return check(arith[node.op](a, b), pos);
          case 'div':
            if (isF(b) ? b.isZero() : b === 0) throw mathErr(pos);
            return check(isF(a) && isF(b) ? a.div(b) : toNum(a) / toNum(b), pos);
          case 'pow':
            return check(power(a, b, pos), pos);
          case 'xrt':
            return check(root(a, b, pos), pos);
          case 'npr':
            return permComb(a, b, false, pos);
          case 'ncr':
            return permComb(a, b, true, pos);
        }
        break;
      }

      case 'frac': {
        flags.frac = true;
        const vals = node.parts.map(ev);
        const exact = vals.every((v) => isF(v) && v.isInteger());
        const den = vals[vals.length - 1];
        if (isF(den) ? den.isZero() : den === 0) throw mathErr(pos);
        if (exact) {
          const f = vals.length === 2 ? vals[0].div(vals[1]) : vals[0].add(vals[1].div(vals[2]));
          return check(f, pos);
        }
        const n = vals.map(toNum);
        return check(n.length === 2 ? n[0] / n[1] : n[0] + n[1] / n[2], pos);
      }

      case 'dms': {
        flags.dms = true;
        const scale = [Fraction.of(1), Fraction.of(60), Fraction.of(3600)];
        let acc = ZERO;
        node.parts.forEach((p, k) => {
          const v = ev(p);
          acc = isF(v) && isF(acc) ? acc.add(v.div(scale[k])) : toNum(acc) + toNum(v) / toNum(scale[k]);
        });
        return check(acc, pos);
      }

      case 'pre':
        return check(prefix(node.fn, ev(node.arg), pos), pos);

      case 'post':
        return check(postfix(node.fn, ev(node.arg), pos), pos);

      case 'call': {
        const a = toNum(ev(node.args[0]));
        const b = toNum(ev(node.args[1]));
        let x, y;
        if (node.fn === 'pol') {
          x = Math.hypot(a, b);
          y = a === 0 && b === 0 ? 0 : fromRad(Math.atan2(b, a), ctx.angle);
        } else {
          x = a * trig('cos', b, ctx.angle, pos);
          y = a * trig('sin', b, ctx.angle, pos);
        }
        x = round15(check(x, pos));
        y = round15(check(y, pos));
        ctx.vars.E = x;
        ctx.vars.F = y;
        return x;
      }
    }
    throw new CalcError('Syntax', pos);
  }

  function prefix(fn, v, pos) {
    const x = toNum(v);
    switch (fn) {
      case 'neg': return isF(v) ? v.neg() : -v;
      case 'sqrt':
        if (x < 0) throw mathErr(pos);
        return exactSqrt(v) ?? Math.sqrt(x);
      case 'cbrt': return exactCbrt(v) ?? Math.cbrt(x);
      case 'log':
        if (x <= 0) throw mathErr(pos);
        return Math.log10(x);
      case 'ln':
        if (x <= 0) throw mathErr(pos);
        return Math.log(x);
      case 'tenx':
        if (isF(v) && v.isInteger() && v.n >= -99n && v.n <= 99n) return Fraction.of(10).pow(v.n);
        return Math.pow(10, x);
      case 'ex': return Math.exp(x);
      case 'sin':
      case 'cos':
      case 'tan':
        return trig(fn, x, ctx.angle, pos);
      case 'asin':
      case 'acos':
        if (Math.abs(x) > 1) throw mathErr(pos);
        return fromRad(fn === 'asin' ? Math.asin(x) : Math.acos(x), ctx.angle);
      case 'atan': return fromRad(Math.atan(x), ctx.angle);
      case 'sinh': return Math.sinh(x);
      case 'cosh': return Math.cosh(x);
      case 'tanh': return Math.tanh(x);
      case 'asinh': return Math.asinh(x);
      case 'acosh':
        if (x < 1) throw mathErr(pos);
        return Math.acosh(x);
      case 'atanh':
        if (Math.abs(x) >= 1) throw mathErr(pos);
        return Math.atanh(x);
      case 'rnd': return roundToFormat(round15(x), ctx.fmt);
    }
    throw new CalcError('Syntax', pos);
  }

  function postfix(fn, v, pos) {
    switch (fn) {
      case 'sq': return arith.mul(v, v);
      case 'cube': return arith.mul(arith.mul(v, v), v);
      case 'inv':
        if (isF(v) ? v.isZero() : v === 0) throw mathErr(pos);
        return isF(v) ? v.inv() : 1 / v;
      case 'fact': return factorial(v, pos);
      case 'pct': return isF(v) ? v.div(Fraction.of(100)) : v / 100;
      case 'dms':
        flags.dms = true;
        return v;
      case 'udeg':
      case 'urad':
      case 'ugra': {
        const from = { udeg: 'D', urad: 'R', ugra: 'G' }[fn];
        if (from === ctx.angle) return v;
        return fromRad(toRad(toNum(v), from), ctx.angle);
      }
      case 'xhat':
      case 'yhat':
        if (ctx.mode !== 'REG') throw new CalcError('Syntax', pos);
        return stat((d) => regEstimate(fn, toNum(v), d), pos);
    }
    throw new CalcError('Syntax', pos);
  }

  const v = ev(tree);
  return isF(v) ? v : round15(v);
}
