import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutExpr, layoutFraction, layoutValue, linearText } from '../js/layout.js';

const caretOf = (lay, i) => lay.carets.find((c) => c.index === i);

function assertOneCaretPerGap(tokens) {
  const lay = layoutExpr(tokens);
  const idx = lay.carets.map((c) => c.index).sort((a, b) => a - b);
  assert.deepEqual(idx, Array.from({ length: tokens.length + 1 }, (_, i) => i), tokens.join(' '));
}

test('one caret per cursor gap', () => {
  assertOneCaretPerGap([]);
  assertOneCaretPerGap(['1', 'add', '2']);
  assertOneCaretPerGap(['tFrac', 'tSep', 'tEnd']);
  assertOneCaretPerGap(['tMixed', '3', 'tSep', '1', 'tSep', '2', 'tEnd']);
  assertOneCaretPerGap(['2', 'tPow', 'tFrac', '1', 'tSep', '2', 'tEnd', 'tEnd', 'add', 'tSqrt', '9', 'tEnd']);
  assertOneCaretPerGap(['tRoot', '3', 'tSep', 'tCbrt', '8', 'tEnd', 'tEnd', 'tTenx', 'tEnd', 'tEx', '2', 'tEnd']);
});

test('fraction: numerator above denominator, bar in between', () => {
  const lay = layoutExpr(['tFrac', '1', 'tSep', '2', 'tEnd']);
  const num = caretOf(lay, 1);
  const den = caretOf(lay, 3);
  assert.ok(num.base < 0 && den.base > 0);
  assert.ok(lay.ops.some((o) => o.h && o.y === -4), 'fraction bar');
  assert.ok(lay.asc > 7 && lay.desc > 0, 'taller than one line');
});

test('exponent is raised, root has an overbar', () => {
  const p = layoutExpr(['2', 'tPow', '3', 'tEnd']);
  assert.ok(caretOf(p, 2).base < caretOf(p, 0).base);
  const r = layoutExpr(['tSqrt', '2', 'tEnd']);
  assert.ok(r.ops.some((o) => o.h && o.y < -7), 'overbar above the argument');
  assert.ok(r.w > 5);
});

test('empty slots show a placeholder', () => {
  const lay = layoutExpr(['tFrac', 'tSep', 'tEnd']);
  assert.equal(lay.ops.filter((o) => o.g === '□').length, 2);
});

test('linear text', () => {
  assert.equal(linearText(['1', '2', 'add', '3']), '12+3');
  assert.equal(linearText(['tFrac', '1', 'tSep', '2', '3', 'tEnd']), '1/23');
  assert.equal(linearText(['tFrac', '1', 'add', '2', 'tSep', '3', 'tEnd']), '(1+2)/3');
  assert.equal(linearText(['tSqrt', '2', 'tEnd', 'mul', '2', 'tPow', '1', '0', 'tEnd']), '√2×2^10');
  assert.equal(linearText(['tRoot', '3', 'tSep', '8', 'tEnd']), '3ˣ√8');
});

test('fraction result layout', () => {
  const f = layoutFraction({ neg: true, w: '3', n: '1', d: '2' });
  assert.ok(f.ops.some((o) => o.g === '-'));
  assert.ok(f.ops.some((o) => o.h));
  assert.equal(f.carets.length, 0);
});

test('brackets grow around tall contents', () => {
  const flat = layoutExpr(['lp', '1', 'add', '2', 'rp']);
  assert.ok(flat.ops.some((o) => o.g === '('), 'plain bracket glyph on one line');
  const tall = layoutExpr(['lp', 'tFrac', '1', 'tSep', '2', 'tEnd', 'rp']);
  assert.ok(!tall.ops.some((o) => o.g === '(' || o.g === ')'), 'brackets drawn as lines');
  const verticals = tall.ops.filter((o) => o.l && o.l[0] === o.l[2]);
  assert.ok(verticals.some((o) => o.l[1] < -7 && o.l[3] > 0), 'bracket spans the fraction');
});

test('abs and log base templates', () => {
  const a = layoutExpr(['tAbs', '3', 'tEnd']);
  assert.equal(a.ops.filter((o) => o.l).length, 2);
  const l = layoutExpr(['tLogb', '2', 'tSep', '8', 'tEnd']);
  assert.ok(l.desc > 0, 'base is lowered');
  assert.equal(linearText(['tLogb', '2', 'tSep', '8', 'tEnd']), 'log_2(8)');
  assert.equal(linearText(['tAbs', '3', 'add', '1', 'tEnd']), 'Abs(3+1)');
});

test('result layout', () => {
  const dec = layoutValue({ neg: false, cells: [{ ch: '1', dp: false }, { ch: '4', dp: true }], exp: null });
  assert.equal(dec.ops.map((o) => o.g).join(''), '14'); // no trailing point
  const sci = layoutValue({ neg: true, cells: [{ ch: '1', dp: true }, { ch: '2', dp: false }], exp: { neg: true, digits: '05' } });
  assert.equal(sci.ops.map((o) => o.g).join(''), '-1.2×10-5');
  const dms = layoutValue({ neg: false, cells: [...'2°30°36'].map((ch) => ({ ch, dp: false })), exp: null });
  assert.equal(dms.ops.map((o) => o.g).join(''), '2°30′36″');
});

test('wide scientific results are rounded to fit', () => {
  const cells = [...'6.666666667'.replace('.', '')].map((ch, k) => ({ ch, dp: k === 0 }));
  const v = { neg: false, cells, exp: { neg: true, digits: '06' } };
  const fit = layoutValue(v, 70);
  assert.ok(fit.w <= 70);
  assert.equal(fit.ops.map((o) => o.g).join('').replace(/×10.*/, ''), '6.6667');
});
