// Exact rational numbers (BigInt numerator / denominator) used for a b/c
// fractions and for keeping integer / decimal-literal arithmetic exact.

const abs = (a) => (a < 0n ? -a : a);

function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

const digits = (a) => abs(a).toString().length;

export class Fraction {
  constructor(n, d = 1n) {
    if (d === 0n) throw new RangeError('division by zero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  static of(i) {
    return new Fraction(BigInt(i));
  }

  /** Build from a decimal mantissa string ("12.5") and a power-of-ten exponent. */
  static fromDecimal(mant, exp = 0) {
    const [ip, fp = ''] = mant.split('.');
    const n = BigInt((ip || '0') + fp);
    const scale = fp.length - exp;
    return scale >= 0 ? new Fraction(n, 10n ** BigInt(scale)) : new Fraction(n * 10n ** BigInt(-scale));
  }

  add(o) { return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Fraction(this.n * o.n, this.d * o.d); }
  div(o) { return new Fraction(this.n * o.d, this.d * o.n); }
  neg() { return new Fraction(-this.n, this.d); }
  inv() { return new Fraction(this.d, this.n); }

  pow(k) {
    // k: BigInt integer exponent
    if (k < 0n) return this.inv().pow(-k);
    return new Fraction(this.n ** k, this.d ** k);
  }

  isInteger() { return this.d === 1n; }
  isZero() { return this.n === 0n; }
  sign() { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; }
  /** Number of decimal digits in the larger of numerator and denominator. */
  size() { return Math.max(digits(this.n), digits(this.d)); }

  toNumber() {
    const ln = digits(this.n);
    const ld = digits(this.d);
    if (ln < 300 && ld < 300) return Number(this.n) / Number(this.d);
    const k = BigInt(Math.max(ln, ld) - 250);
    const p = 10n ** k;
    const sn = this.n / p;
    const sd = this.d / p;
    if (sd === 0n) return this.n < 0n ? -Infinity : Infinity;
    return Number(sn) / Number(sd);
  }
}

/** Integer square root of a non-negative BigInt. */
export function isqrt(n) {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  // Newton refinement (the float estimate can be off for big values)
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) {
      // settle on floor value
      while (x * x > n) x -= 1n;
      while ((x + 1n) * (x + 1n) <= n) x += 1n;
      return x;
    }
    x = y;
  }
}

/** Integer cube root of a non-negative BigInt (floor). */
export function icbrt(n) {
  if (n < 2n) return n;
  let x = BigInt(Math.round(Math.cbrt(Number(n))));
  while (x * x * x > n) x -= 1n;
  while ((x + 1n) ** 3n <= n) x += 1n;
  return x;
}
