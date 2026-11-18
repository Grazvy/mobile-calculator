// Turns the key-token buffer into lexemes: runs of digit / "." / EXP tokens
// become one numeric literal; natural-display template markers are expanded
// into bracketed plain lexemes; every other token passes through unchanged.

import { Fraction } from './fraction.js';
import { CalcError, DIGITS, TEMPLATE_START } from './tokens.js';

// Lexemes emitted for each template marker. Every template is wrapped in an
// outer bracket pair so it behaves as one operand.
const OPEN = {
  tFrac: ['lp', 'lp'], tMixed: ['lp', 'lp'], tRoot: ['lp', 'lp'], tLogb: ['lp', 'lp'],
  tAbs: ['lp', 'abs', 'lp'],
  tSqrt: ['lp', 'sqrt', 'lp'], tCbrt: ['lp', 'cbrt', 'lp'],
  tTenx: ['lp', 'tenx', 'lp'], tEx: ['lp', 'ex', 'lp'],
  tPow: ['pow', 'lp'],
  tBase: ['lp'],
};
const SEP = {
  tFrac: ['rp', 'frac', 'lp'], tMixed: ['rp', 'frac', 'lp'], tRoot: ['rp', 'xrt', 'lp'], tLogb: ['rp', 'logb', 'lp'],
};
const CLOSE = { tPow: ['rp'], tBase: ['rp'] };

function literal(mant, exp) {
  if (Math.abs(exp) > 150) return Number(`${mant}e${exp}`); // overflow is caught later
  return Fraction.fromDecimal(mant, exp);
}

export function lex(tokens) {
  const out = [];
  const stack = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (DIGITS.has(t) || t === '.' || t === 'EE') {
      const start = i;
      let mant = '';
      let dots = 0;
      while (i < tokens.length && (DIGITS.has(tokens[i]) || tokens[i] === '.')) {
        if (tokens[i] === '.' && ++dots > 1) throw new CalcError('Syntax', i);
        mant += tokens[i++];
      }
      let exp = 0;
      if (tokens[i] === 'EE') {
        i++;
        let sign = 1;
        if (tokens[i] === 'neg' || tokens[i] === 'sub') {
          sign = -1;
          i++;
        } else if (tokens[i] === 'add') i++;
        let ed = '';
        while (i < tokens.length && DIGITS.has(tokens[i])) ed += tokens[i++];
        if (!ed) throw new CalcError('Syntax', i);
        exp = sign * parseInt(ed, 10);
        if (mant === '') mant = '1';
      }
      if (mant.startsWith('.')) mant = '0' + mant;
      if (mant.endsWith('.')) mant += '0';
      out.push({ t: 'num', value: literal(mant, exp), decimal: dots > 0, pos: start });
      continue;
    }
    if (TEMPLATE_START.has(t) || t === 'tSep' || t === 'tEnd') {
      let seq;
      if (TEMPLATE_START.has(t)) {
        stack.push(t);
        seq = OPEN[t];
      } else {
        const tpl = stack[stack.length - 1];
        if (!tpl) throw new CalcError('Syntax', i);
        if (t === 'tSep') seq = SEP[tpl] || ['rp', 'comma', 'lp'];
        else {
          stack.pop();
          seq = CLOSE[tpl] || ['rp', 'rp'];
        }
      }
      for (const x of seq) out.push({ t: x, pos: i });
      i++;
      continue;
    }
    out.push({ t, pos: i });
    i++;
  }
  out.push({ t: 'eof', pos: tokens.length });
  return out;
}
