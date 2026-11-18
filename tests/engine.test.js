import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../js/engine/lexer.js';
import { parse } from '../js/engine/parser.js';
import { evaluate, toNum } from '../js/engine/evaluate.js';
import { formatLower, lowerText } from '../js/engine/format.js';
import { Fraction } from '../js/engine/fraction.js';

// "12 add 3.5" → ['1','2','add','3','.','5']; words are token ids, numbers are split into digits
const T = (s) =>
  s.trim().split(/\s+/).flatMap((w) => (/^[0-9.]+$/.test(w) ? [...w] : [w]));

function run(src, opts = {}) {
  const ctx = {
    angle: 'D', fmt: { type: 'Norm', n: 1 }, vars: {}, ans: Fraction.of(0),
    random: () => 0.5, mode: 'COMP', sd: [], reg: [], flags: {}, ...opts,
  };
  return { value: evaluate(parse(lex(T(src))), ctx), ctx };
}
const num = (src, opts) => toNum(run(src, opts).value);
const shown = (src, { disp = { mode: 'dec' }, fmt = { type: 'Norm', n: 1 }, ...opts } = {}) =>
  lowerText(formatLower(run(src, { fmt, ...opts }).value, disp, fmt));
const err = (src, opts) => {
  try {
    run(src, opts);
  } catch (e) {
    return `${e.type}@${e.pos}`;
  }
  return 'no error';
};

test('precedence', () => {
  assert.equal(num('2 add 3 mul 4'), 14);
  assert.equal(num('neg 2 sq'), -4);
  assert.equal(num('sub 2 sq'), -4);
  assert.equal(num('2 pow 3 pow 2'), 64); // left to right
  assert.equal(num('2 pow 3 sq'), 512); // postfix first
  assert.equal(num('2 pi'), 6.28318530717959);
  assert.equal(num('2 lp 3 add 4 rp'), 14);
  assert.equal(num('1 div 2 pi'), 0.159154943091895); // implied × binds tighter than ÷
  assert.equal(num('6 div 2 lp 1 add 2 rp'), 1);
  assert.equal(num('2 sin 30'), 1);
  assert.equal(num('sin 30 rp add 1'), 1.5);
  assert.equal(num('sin 30 add 60'), 1); // sin( runs to the end: sin(90)
  assert.equal(num('sin 30 rp sq'), 0.25); // the bracket belongs to sin: (sin 30)²
  assert.equal(num('2 sin 30 rp sin 30'), 0.5); // implied × between bracketed functions
  assert.equal(num('sqrt 2 sq'), 2);
  assert.equal(num('2 mul sub 3'), -6);
  assert.equal(num('2 pow sub 1'), 0.5);
  assert.equal(num('lp 2 add 3'), 5); // auto-close
  assert.equal(num('3 add 2 ncr 1 mul 2'), 7);
});

test('functions', () => {
  assert.equal(num('sin 30'), 0.5);
  assert.equal(num('sin 180'), 0);
  assert.equal(num('cos 90'), 0);
  assert.equal(num('tan 45'), 1);
  assert.equal(num('sin pi', { angle: 'R' }), 0);
  assert.equal(num('cos 100', { angle: 'G' }), 0);
  assert.equal(num('asin 0.5'), 30);
  assert.equal(num('log 1000'), 3);
  assert.equal(num('ln ex 2'), 2);
  assert.equal(num('tenx 3'), 1000);
  assert.equal(num('5 fact'), 120);
  assert.equal(num('10 ncr 3'), 120);
  assert.equal(num('10 npr 3'), 720);
  assert.equal(num('3 xrt 8'), 2);
  assert.equal(num('3 xrt sub 8'), -2);
  assert.equal(num('cbrt 27'), 3);
  assert.equal(num('4 inv'), 0.25);
  assert.equal(num('200 mul 15 pct'), 30);
  assert.equal(num('sub 8 pow lp 1 div 3 rp'), -2);
  assert.equal(num('sinh 0'), 0);
  assert.equal(num('pol 3 comma 4 rp'), 5);
  const { ctx } = run('pol 3 comma 4');
  assert.equal(ctx.vars.F, 53.130102354156);
  assert.equal(num('rec 2 comma 60'), 1);
  assert.equal(num('90 udeg', { angle: 'R' }), 1.5707963267949);
});

test('fractions stay exact', () => {
  assert.equal(shown('1 frac 2 add 1 frac 3', { disp: { mode: 'frac' } }), '5/6');
  assert.equal(shown('1 frac 2 add 1 frac 3', { disp: { mode: 'frac', improper: true } }), '5/6');
  assert.equal(shown('3 frac 1 frac 2 add 1', { disp: { mode: 'frac' } }), '4 1/2');
  assert.equal(shown('3 frac 1 frac 2 add 1', { disp: { mode: 'frac', improper: true } }), '9/2');
  assert.equal(shown('1 div 3 mul 3'), '1.');
  assert.equal(shown('0.1 add 0.2'), '0.3');
  assert.equal(shown('1 div 3'), '0.333333333');
  assert.equal(shown('0.75', { disp: { mode: 'frac' } }), '3/4');
  assert.equal(run('1 frac 2').ctx.flags.frac, true);
});

test('sexagesimal', () => {
  assert.equal(num('2 dms 30 dms'), 2.5);
  assert.equal(num('2 dms 30 dms 36 dms'), 2.51);
  assert.equal(shown('2.51', { disp: { mode: 'dms' } }), '2°30°36');
  assert.equal(shown('1 div 3', { disp: { mode: 'dms' } }), '0°20°0');
});

test('errors', () => {
  assert.equal(err('log 0'), 'Math@0');
  assert.equal(err('1 div 0'), 'Math@1');
  assert.equal(err('69 fact'), 'no error');
  assert.equal(err('70 fact'), 'Math@2');
  assert.equal(err('sqrt sub 1'), 'Math@0');
  assert.equal(err('tan 90'), 'Math@0');
  assert.equal(err('1 EE 99 mul 10'), 'Math@4');
  assert.equal(err('2 add'), 'Syntax@2');
  assert.equal(err('2 add mul 3'), 'Syntax@2');
  assert.equal(err('1 . 2 . 3'), 'Syntax@3');
  assert.equal(err('2 rp'), 'Syntax@1');
  assert.equal(err('0 pow 0'), 'Math@1');
  assert.equal(err('lp sub 4 rp pow 0.5'), 'Math@4');
});

test('number formatting', () => {
  assert.equal(shown('0'), '0.');
  assert.equal(shown('1234567890'), '1234567890.');
  assert.equal(shown('12345678901'), '1.23456789e10');
  assert.equal(shown('2 div 3'), '0.666666667');
  assert.equal(shown('0.01'), '0.01');
  assert.equal(shown('0.001'), '1.e-03');
  assert.equal(shown('0.001', { fmt: { type: 'Norm', n: 2 } }), '0.001');
  assert.equal(shown('sub 1.5'), '-1.5');
  assert.equal(shown('1 div 3', { fmt: { type: 'Fix', n: 2 } }), '0.33');
  assert.equal(shown('2', { fmt: { type: 'Fix', n: 3 } }), '2.000');
  assert.equal(shown('1234', { fmt: { type: 'Sci', n: 3 } }), '1.23e03');
  assert.equal(shown('56088', { disp: { mode: 'eng', engShift: 0 } }), '56.088e03');
  assert.equal(shown('56088', { disp: { mode: 'eng', engShift: -1 } }), '0.056088e06');
  assert.equal(shown('0.08125', { disp: { mode: 'eng', engShift: 0 } }), '81.25e-03');
  assert.equal(shown('1 EE 99'), '1.e99');
});

test('statistics', () => {
  const sd = [{ x: 1, f: 1 }, { x: 2, f: 1 }, { x: 3, f: 1 }, { x: 4, f: 1 }];
  assert.equal(num('mx', { mode: 'SD', sd }), 2.5);
  assert.equal(num('sn', { mode: 'SD', sd }), 4);
  assert.equal(num('sxn1', { mode: 'SD', sd }), 1.29099444873581);
  const reg = [{ x: 1, y: 3, f: 1 }, { x: 2, y: 5, f: 1 }, { x: 3, y: 7, f: 1 }];
  assert.equal(num('ra', { mode: 'REG', reg }), 1);
  assert.equal(num('rb', { mode: 'REG', reg }), 2);
  assert.equal(num('rr', { mode: 'REG', reg }), 1);
  assert.equal(num('10 yhat', { mode: 'REG', reg }), 21);
  assert.equal(num('21 xhat', { mode: 'REG', reg }), 10);
  assert.equal(err('mx', { mode: 'SD', sd: [] }), 'Math@0');
});
