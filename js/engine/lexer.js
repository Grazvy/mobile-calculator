// Turns the key-token buffer into lexemes: runs of digit / "." / EXP tokens
// become one numeric literal; every other token passes through unchanged.

import { Fraction } from './fraction.js';
import { CalcError, DIGITS } from './tokens.js';

function literal(mant, exp) {
  if (Math.abs(exp) > 150) return Number(`${mant}e${exp}`); // overflow is caught later
  return Fraction.fromDecimal(mant, exp);
}

export function lex(tokens) {
  const out = [];
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
    out.push({ t, pos: i });
    i++;
  }
  out.push({ t: 'eof', pos: tokens.length });
  return out;
}
