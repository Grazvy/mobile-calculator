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

test('fractions and the S⇔D key', () => {
  const c = calc('1 frac 2 right add 1 frac 3 eq');
  assert.equal(lower(c), '5/6');
  c.press('sd');
  assert.equal(lower(c), '0.833333333');
  c.press('sd');
  assert.equal(lower(c), '5/6');
  const d = calc('3 shift frac 1 right 2 eq'); // mixed number template
  assert.equal(lower(d), '3 1/2');
  calc('shift sd', d);
  assert.equal(lower(d), '7/2');
  assert.equal(lower(calc('0 dot 75 eq sd')), '3/4');
  assert.equal(lower(calc('1 div 4 sd')), '1/4'); // S⇔D while typing calculates first
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
  calc('shift eng shift eng', c);
  assert.equal(lower(c), '0.056088e06');
});

test('editing: insert by default, overwrite via SHIFT DEL', () => {
  const c = calc('1 2 3 left left 9');
  assert.equal(upper(c), '1923'); // inserted
  c.press('del'); // deletes left of the cursor
  assert.equal(upper(c), '123');
  calc('shift del 5', c); // overwrite mode replaces the "2"
  assert.equal(upper(c), '153');
  c.press('eq');
  assert.equal(lower(c), '153.');
  c.press('left'); // back into the expression, cursor at the end
  c.press('del');
  c.press('eq');
  assert.equal(lower(c), '15.');
});

test('◀▶ wrap around the line', () => {
  const c = calc('1 2 left left');
  assert.equal(c.cur, 0);
  c.press('left');
  assert.equal(c.cur, 2);
  c.press('right');
  assert.equal(c.cur, 0);
});

test('errors and recovery', () => {
  const c = calc('1 div 0 eq');
  assert.equal(upper(c), 'Math ERROR');
  assert.equal(c.view().lower, null);
  assert.deepEqual(c.view().lines, ['Math ERROR', '', '[AC] :Cancel', '[◀][▶]:Goto']);
  c.press('left');
  assert.equal(c.phase, 'edit');
  assert.equal(c.cur, 1); // cursor at the ÷
  calc('right right del 2 eq', c);
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
  assert.equal(upper(calc('7 shift rcl sd')), '7→Y'); // Y lives on S⇔D
});

test('memory persists through storage', () => {
  const storage = new MemStorage();
  const a = new Calculator({ storage });
  calc('1 frac 3 shift rcl rp shift mode 2', a); // X = 1/3, Rad
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

test('MODE and SETUP menus', () => {
  assert.deepEqual(calc('mode').view().lines, ['1:COMP', '2:SD  3:REG']);
  assert.deepEqual(calc('shift mode').view().lines, ['1:Deg 2:Rad', '3:Gra 4:Fix', '5:Sci 6:Norm']);
  assert.deepEqual(calc('shift mode down').view().lines, ['1:ab/c', '2:d/c']);
  assert.equal(lower(calc('shift mode 2 sin lp shift exp div 2 eq')), '1.');
  assert.equal(lower(calc('shift mode 4 3 1 div 3 eq')), '0.333');
  const c = calc('shift mode 5 3 1234 eq');
  assert.equal(lower(c), '1.23e03');
  assert.equal(c.view().ind.SCI, true);
  calc('shift 9 2', c); // CLR: Mode
  assert.equal(upper(c), 'Mode clear');
  calc('ac 1234 eq', c);
  assert.equal(lower(c), '1234.');
  assert.equal(c.view().upper, '1234');
  assert.equal(lower(calc('shift mode down 2 1 frac 3 right mul 4 eq')), '4/3'); // d/c: improper results
});

test('hyp and inverse trig keys', () => {
  assert.equal(lower(calc('hyp sin 0 eq')), '0.');
  assert.equal(upper(calc('hyp shift sin 1')), 'sinh⁻ 1');
  assert.equal(lower(calc('shift cos 0 eq')), '90.');
});

test('DRG▶ menu, %, nPr/nCr, Pol', () => {
  assert.equal(lower(calc('shift exp shift ans 2 eq')), '180.'); // π r → degrees
  assert.equal(lower(calc('200 mul 15 shift lp eq')), '30.');
  assert.equal(lower(calc('5 shift div 2 eq')), '10.'); // 5C2
  assert.equal(lower(calc('5 shift mul 2 eq')), '20.'); // 5P2
  assert.equal(lower(calc('pol 3 shift rp 4 rp eq')), '5.');
});

test('SD statistics', () => {
  const c = calc('mode 2');
  assert.equal(c.view().ind.SD, true);
  calc('1 mplus 2 mplus 3 mplus 4 mplus', c);
  assert.equal(upper(c), 'n=');
  assert.equal(lower(c), '4.');
  calc('shift 2 1 eq', c); // x̄
  assert.equal(lower(c), '2.5');
  calc('5 shift rp 2 mplus', c); // 5 with frequency 2
  assert.equal(lower(c), '6.');
  calc('shift 1 3 eq', c); // n
  assert.equal(lower(c), '6.');
  calc('shift 9 1', c); // Scl
  calc('ac shift 2 1 eq', c);
  assert.equal(upper(c), 'Math ERROR');
});

test('REG linear regression', () => {
  const c = calc('mode 3 1 shift rp 3 mplus 2 shift rp 5 mplus 3 shift rp 7 mplus');
  assert.equal(lower(c), '3.');
  calc('shift 2 right right 2 eq', c); // B
  assert.equal(lower(c), '2.');
  calc('10 shift 2 left 5 eq', c); // 10 ŷ
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

test('natural display templates', () => {
  assert.equal(lower(calc('sqrt 16 eq')), '4.');
  assert.equal(lower(calc('sqrt 2 right sq eq')), '2.');
  assert.equal(lower(calc('2 pow 10 eq')), '1024.');
  assert.equal(lower(calc('2 pow 3 right add 1 eq')), '9.');
  assert.equal(lower(calc('3 shift pow 8 eq')), '2.');
  assert.equal(lower(calc('shift sqrt 27 eq')), '3.');
  assert.equal(lower(calc('2 shift sq eq')), '8.');
  assert.equal(lower(calc('shift log 2 eq')), '100.');
  assert.equal(lower(calc('12 frac 4 eq')), '3.');
  assert.equal(lower(calc('2 frac 4 right mul 3 eq')), '1 1/2');
  assert.equal(upper(calc('1 frac 2 right add sqrt 3')), '1/2+√3');
  assert.equal(lower(calc('abs neg 3 eq')), '3.');
  assert.equal(lower(calc('logb 2 right 8 eq')), '3.');
  assert.equal(upper(calc('logb 1 right 8 eq')), 'Math ERROR');
  assert.equal(lower(calc('alpha exp eq')), '2.718281828');
  const c = calc('5 eq pow 2 eq'); // power of the previous result
  assert.equal(upper(c), 'Ans^2');
  assert.equal(lower(c), '25.');
  const f = calc('5 eq frac 2 eq'); // □/□ after a result divides Ans
  assert.equal(upper(f), 'Ans/2');
  assert.equal(lower(f), '2 1/2');
});

test('templates: empty slot, delete, overwrite', () => {
  const e = calc('frac 3 eq');
  assert.equal(upper(e), 'Syntax ERROR');
  e.press('left');
  assert.equal(e.cur, 3); // cursor in the empty denominator
  assert.deepEqual(calc('sqrt del').buf, []); // empty template removed
  assert.deepEqual(calc('sqrt 9 del').buf, ['tSqrt', 'tEnd']);
  assert.deepEqual(calc('sqrt 9 left del').buf, ['9']); // DEL on the √ unwraps it
  const o = calc('shift del 1 frac 2 left left 5'); // overwrite never replaces the fraction separator
  assert.equal(upper(o), '15/2');
  const b = calc('sqrt 9 right del');
  assert.equal(b.cur, 2); // backspace onto the end steps inside
  assert.equal(b.buf.length, 3);
});

test('up/down move between numerator and denominator', () => {
  const c = calc('12 frac 34'); // cursor at the end of the denominator
  const sep = c.buf.indexOf('tSep');
  c.press('up');
  assert.ok(c.cur > 0 && c.cur <= sep, 'cursor moved into the numerator');
  c.press('down');
  assert.ok(c.cur > sep, 'cursor back in the denominator');
  const p = calc('2 pow 3 left left'); // cursor before the exponent template
  p.press('up');
  assert.equal(p.cur, 2); // into the exponent
  calc('ac 7 up', c); // single line: nothing above, cursor stays
  assert.equal(c.cur, 1);
});

test('tap moves the cursor', () => {
  const c = calc('1 add 2 add 3');
  c.tap(2);
  c.press('9');
  assert.equal(upper(c), '1+92+3'); // inserted at the tapped position
  c.press('eq');
  c.tap(0); // tapping a result re-opens it for editing
  assert.equal(c.phase, 'edit');
  assert.equal(c.cur, 0);
  const e = calc('1 div 0 eq');
  e.tap(null);
  assert.equal(e.phase, 'edit');
  const m = calc('mode');
  m.tap(0);
  assert.equal(m.phase, 'menu');
});
