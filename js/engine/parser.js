// Recursive-descent parser following the two-line scientific calculator
// order of operations (highest priority first):
//   1. Pol( Rec( and parentheses
//   2. postfix functions: x² x³ x⁻¹ x! °'" % angle-unit marks x̂ ŷ
//   3. ^  ˣ√ (left to right)
//   4. a b/c fraction entry
//   5. implied multiplication before π, variables, Ans, "(" and Pol(/Rec(
//   6. prefix functions: (-) √ ³√ log ln 10^ e^ sin cos tan ... Rnd
//   7. implied multiplication before prefix functions (2sin30)
//   8. nPr nCr
//   9. × ÷
//  10. + −
// Prefix functions take the following value without needing "(":
// "sin 30+1" is sin(30)+1. Missing ")" at the end of the input are closed automatically.

import { ATOM, CalcError, POSTFIX, PREFIX } from './tokens.js';

const startsImplA = (t) => ATOM.has(t) || t === 'lp' || t === 'pol' || t === 'rec';
const startsImplB = (t) => startsImplA(t) || PREFIX.has(t);
const isPrefixPos = (t) => PREFIX.has(t) || t === 'sub' || t === 'add';

export function parse(lx) {
  let i = 0;
  const peek = () => lx[i];
  const is = (t) => lx[i].t === t;
  const next = () => lx[i++];
  const fail = (l = peek()) => {
    throw new CalcError('Syntax', l.pos);
  };

  function sum() {
    let n = product();
    while (is('add') || is('sub')) {
      const op = next();
      n = { type: 'bin', op: op.t, a: n, b: product(), pos: op.pos };
    }
    return n;
  }

  function product() {
    let n = perm();
    while (is('mul') || is('div')) {
      const op = next();
      n = { type: 'bin', op: op.t, a: n, b: perm(), pos: op.pos };
    }
    return n;
  }

  function perm() {
    let n = implB();
    while (is('npr') || is('ncr')) {
      const op = next();
      n = { type: 'bin', op: op.t, a: n, b: implB(), pos: op.pos };
    }
    return n;
  }

  function implB() {
    let n = prefix();
    while (startsImplB(peek().t)) {
      const pos = peek().pos;
      n = { type: 'bin', op: 'mul', a: n, b: prefix(), pos };
    }
    return n;
  }

  function prefixNode(f, arg) {
    if (f.t === 'add') return arg;
    return { type: 'pre', fn: f.t === 'sub' ? 'neg' : f.t, arg, pos: f.pos };
  }

  function prefix() {
    if (isPrefixPos(peek().t)) {
      const f = next();
      return prefixNode(f, prefix());
    }
    return implA();
  }

  function implA() {
    let n = fracLevel();
    while (startsImplA(peek().t)) {
      const pos = peek().pos;
      n = { type: 'bin', op: 'mul', a: n, b: fracLevel(), pos };
    }
    return n;
  }

  function fracLevel() {
    const parts = [power()];
    let pos = null;
    while (is('frac')) {
      const f = next();
      if (pos === null) pos = f.pos;
      if (parts.length === 3) fail(f);
      parts.push(power());
    }
    return parts.length === 1 ? parts[0] : { type: 'frac', parts, pos };
  }

  function power() {
    let n = postfix();
    while (is('pow') || is('xrt')) {
      const op = next();
      n = { type: 'bin', op: op.t, a: n, b: powerOperand(), pos: op.pos };
    }
    return n;
  }

  function powerOperand() {
    if (isPrefixPos(peek().t)) {
      const f = next();
      return prefixNode(f, powerOperand());
    }
    return postfix();
  }

  function postfix() {
    let n = primary();
    while (POSTFIX.has(peek().t)) {
      const f = next();
      n = { type: 'post', fn: f.t, arg: n, pos: f.pos };
    }
    return n;
  }

  function closeParen() {
    if (is('rp')) next();
    else if (!is('eof')) fail();
  }

  function primary() {
    const l = peek();
    switch (l.t) {
      case 'num': {
        next();
        const node = { type: 'num', value: l.value, decimal: l.decimal, pos: l.pos };
        if (!is('dms')) return node;
        // sexagesimal literal: d°m°s°
        next();
        const parts = [node];
        while (parts.length < 3 && is('num')) {
          const m = next();
          parts.push({ type: 'num', value: m.value, decimal: m.decimal, pos: m.pos });
          if (is('dms')) next();
          else break;
        }
        return { type: 'dms', parts, pos: l.pos };
      }
      case 'lp': {
        next();
        const e = sum();
        closeParen();
        return e;
      }
      case 'pol':
      case 'rec': {
        next();
        const a = sum();
        if (!is('comma')) fail();
        next();
        const b = sum();
        closeParen();
        return { type: 'call', fn: l.t, args: [a, b], pos: l.pos };
      }
      default:
        if (ATOM.has(l.t)) {
          next();
          return { type: 'atom', name: l.t, pos: l.pos };
        }
        return fail(l);
    }
  }

  const tree = sum();
  if (!is('eof')) fail();
  return tree;
}
