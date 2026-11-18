import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator } from '../js/calculator.js';
import { lowerText } from '../js/engine/format.js';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}

// keys separated by spaces; multi-digit numbers are split into digit keys
const keys = (s) => s.trim().split(/\s+/).flatMap((w) => (/^[0-9]+$/.test(w) ? [...w] : [w]));

function calc(seq, c = new Calculator({ random: () => 0.123 })) {
  for (const k of keys(seq)) c.press(k);
  return c;
}
const lower = (c) => lowerText(c.view().lower);
const upper = (c) => c.view().upper;

test('basic arithmetic and display', () => {
  const c = calc('2 add 3 mul 4 eq');
  assert.equal(lower(c), '14.');
  assert.equal(upper(c), '2+3×4');
  assert.equal(lower(calc('1 dot 5 add 2 eq')), '3.5');
  assert.equal(lower(calc('1 div 3 eq')), '0.333333333');
});

test('Ans chaining and repeat with =', () => {
  const c = calc('5 eq add 2 eq');
  assert.equal(upper(c), 'Ans+2');
  assert.equal(lower(c), '7.');
  c.press('eq');
  assert.equal(lower(c), '9.');
  assert.equal(lower(calc('3 eq sq eq')), '9.');
  assert.equal(lower(calc('3 eq 4 eq')), '4.'); // a digit starts a new calculation
});

test('fractions and display toggles', () => {
  const c = calc('1 frac 2 add 1 frac 3 eq');
  assert.equal(lower(c), '5⌟6');
  c.press('frac');
  assert.equal(lower(c), '0.833333333');
  c.press('frac');
  assert.equal(lower(c), '5⌟6');
  const d = calc('3 frac 1 frac 2 eq');
  assert.equal(lower(d), '3⌟1⌟2');
  d.press('shift');
  d.press('frac');
  assert.equal(lower(d), '7⌟2');
  const e = calc('0 dot 75 eq frac');
  assert.equal(lower(e), '3⌟4');
});

test('sexagesimal toggle', () => {
  const c = calc('2 dot 51 eq dms');
  assert.equal(lower(c), '2°30°36');
  c.press('dms');
  assert.equal(lower(c), '2.51');
  assert.equal(lower(calc('1 dms 30 dms eq')), '1°30°0');
});

test('ENG notation', () => {
  const c = calc('56088 eq eng');
  assert.equal(lower(c), '56.088e03');
  c.press('eng');
  assert.equal(lower(c), '56088.e00');
  c.press('shift');
  c.press('eng');
  c.press('shift');
  c.press('eng');
  assert.equal(lower(c), '0.056088e06');
});

test('editing: cursor, overwrite, insert, delete', () => {
  const c = calc('1 2 3');
  c.press('left');
  c.press('left');
  c.press('9'); // overwrite "2"
  assert.equal(upper(c), '193');
  c.press('shift');
  c.press('del'); // insert mode
  c.press('5');
  assert.equal(upper(c), '1953');
  c.press('del'); // insert mode deletes left of cursor
  assert.equal(upper(c), '193');
  c.press('eq');
  assert.equal(lower(c), '193.');
  c.press('left'); // back into the expression
  c.press('del');
  c.press('eq');
  assert.equal(lower(c), '19.');
});

test('errors and recovery', () => {
  const c = calc('1 div 0 eq');
  assert.equal(upper(c), 'Math ERROR');
  assert.equal(c.view().lower, null);
  c.press('left');
  assert.equal(c.phase, 'edit');
  assert.equal(c.cur, 1); // cursor at the ÷
  c.press('right');
  c.press('right');
  c.press('del');
  c.press('2');
  c.press('eq');
  assert.equal(lower(c), '0.5');
  const s = calc('2 add eq');
  assert.equal(upper(s), 'Syntax ERROR');
  s.press('ac');
  assert.equal(lower(s), '0.');
});

test('memory: STO, RCL, ALPHA, M+', () => {
  const c = calc('5 shift rcl neg'); // 5 STO A
  assert.equal(upper(c), '5→A');
  calc('ac alpha neg mul 2 eq', c);
  assert.equal(lower(c), '10.');
  calc('ac rcl neg', c);
  assert.equal(upper(c), 'A=');
  assert.equal(lower(c), '5.');
  calc('ac 3 mplus 4 mplus', c);
  assert.equal(c.view().ind.M, true);
  calc('ac rcl mplus', c);
  assert.equal(lower(c), '7.');
  calc('ac 2 shift mplus rcl mplus', c);
  assert.equal(lower(c), '5.');
});

test('memory persists through storage', () => {
  const storage = new MemStorage();
  const a = new Calculator({ storage });
  calc('1 frac 3 shift rcl rp mode mode 2', a); // X = 1/3, Rad
  const b = new Calculator({ storage });
  assert.equal(b.angle, 'R');
  calc('alpha rp mul 3 eq', b);
  assert.equal(lower(b), '1.');
});

test('replay history', () => {
  const c = calc('1 add 1 eq 2 add 2 eq ac');
  assert.equal(c.view().ind.up, true);
  c.press('up');
  assert.equal(upper(c), '2+2');
  assert.equal(lower(c), '4.');
  c.press('up');
  assert.equal(upper(c), '1+1');
  c.press('down');
  assert.equal(upper(c), '2+2');
  c.press('left');
  c.press('del');
  c.press('5');
  c.press('eq');
  assert.equal(lower(c), '7.');
});

test('modes: angle units, Fix, Sci, CLR', () => {
  assert.equal(lower(calc('mode mode 2 sin lp shift exp div 2 eq')), '1.');
  assert.equal(lower(calc('mode mode mode 1 3 1 div 3 eq')), '0.333');
  const c = calc('mode mode mode 2 3 1234 eq');
  assert.equal(lower(c), '1.23e03');
  assert.equal(c.view().ind.SCI, true);
  calc('shift mode 2', c);
  assert.equal(upper(c), 'Mode clear');
  calc('ac 1234 eq', c);
  assert.equal(lower(c), '1234.');
  assert.equal(c.view().upper, '1234');
});

test('hyp and inverse trig keys', () => {
  assert.equal(lower(calc('hyp sin 0 eq')), '0.');
  assert.equal(upper(calc('hyp shift sin 1')), 'sinh⁻ 1');
  assert.equal(lower(calc('shift cos 0 eq')), '90.');
});

test('DRG▶ menu and %', () => {
  assert.equal(lower(calc('shift exp shift ans 2 eq')), '180.'); // π r → degrees
  assert.equal(lower(calc('200 mul 15 shift eq')), '30.');
});

test('SD statistics', () => {
  const c = calc('mode 2');
  assert.equal(c.view().ind.SD, true);
  calc('1 mplus 2 mplus 3 mplus 4 mplus', c);
  assert.equal(upper(c), 'n=');
  assert.equal(lower(c), '4.');
  calc('shift 2 1 eq', c); // x̄
  assert.equal(lower(c), '2.5');
  calc('5 shift comma 2 mplus', c); // 5 with frequency 2
  assert.equal(lower(c), '6.');
  calc('shift 1 3 eq', c); // n
  assert.equal(lower(c), '6.');
  calc('shift mode 1', c); // Scl
  calc('ac shift 2 1 eq', c);
  assert.equal(upper(c), 'Math ERROR');
});

test('REG linear regression', () => {
  const c = calc('mode 3 1 comma 3 mplus 2 comma 5 mplus 3 comma 7 mplus');
  assert.equal(lower(c), '3.');
  calc('shift 2 right right 2 eq', c); // B
  assert.equal(lower(c), '2.');
  calc('10 shift 2 left 2 eq', c); // 10 ŷ
  assert.equal(lower(c), '21.');
});

test('power off and on', () => {
  const c = calc('5 shift ac');
  assert.equal(c.view().on, false);
  c.press('7');
  assert.equal(c.view().on, false);
  c.press('on');
  assert.equal(lower(c), '0.');
});
