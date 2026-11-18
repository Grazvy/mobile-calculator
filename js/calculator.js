// Calculator state machine. DOM-free: press(keyId) changes state, view() describes the LCD.

import { lex } from './engine/lexer.js';
import { parse } from './engine/parser.js';
import { evaluate, round15, toNum } from './engine/evaluate.js';
import { Fraction } from './engine/fraction.js';
import { dmsString, formatLower, fractionString, rationalOf } from './engine/format.js';
import { ATOM, BINARY, CH, CalcError, POSTFIX, SLOTS, TEMPLATE_START, isMarker } from './engine/tokens.js';
import { layoutExpr, linearText } from './layout.js';

const STORAGE_KEY = 'sci82.state.v1';
const MAX_TOKENS = 99;
const MAX_HISTORY = 30;
const VAR_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
// keys that carry a red ALPHA variable letter
const VAR_KEYS = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', rp: 'X', sd: 'Y', mplus: 'M' };
const DIGIT_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const PLAIN_TOKEN = {
  dot: '.', exp: 'EE', add: 'add', sub: 'sub', mul: 'mul', div: 'div',
  sq: 'sq', inv: 'inv', pol: 'pol', log: 'log', ln: 'ln', neg: 'neg', lp: 'lp', rp: 'rp', ans: 'ans',
};
const SHIFT_TOKEN = {
  inv: 'fact', pol: 'rec', sq: 'cube', mul: 'npr', div: 'ncr', lp: 'pct', rp: 'comma',
  0: 'rnd', dot: 'ran', exp: 'pi',
};
// keys that insert a natural-display template (a b/c is handled separately)
const PLAIN_TEMPLATE = { sqrt: 'tSqrt', pow: 'tPow', abs: 'tAbs', logb: 'tLogb' };
const SHIFT_TEMPLATE = { sqrt: 'tCbrt', pow: 'tRoot', log: 'tTenx', ln: 'tEx' };
// templates whose first slot takes the number typed just before the key
const CAPTURE = new Set(['tFrac', 'tMixed', 'tRoot']);
const isNumberTok = (t) => DIGIT_KEYS.has(t) || t === '.' || t === 'EE';
// postfix keys that get an empty base box (□², □!) when no value comes before them
const NEEDS_BASE = new Set(['sq', 'cube', 'inv', 'fact']);

const ZERO = Fraction.of(0);
const isF = (v) => v instanceof Fraction;
const addVals = (a, b) => (isF(a) && isF(b) ? a.add(b) : round15(toNum(a) + toNum(b)));
const negVal = (v) => (isF(v) ? v.neg() : -v);

const DEFAULT_SETTINGS = () => ({ mode: 'COMP', angle: 'D', fmt: { type: 'Norm', n: 1 }, dc: false });

// Menus: pages of numbered items (a digit key picks one) or a single prompt line.
const item = (label, token) => ({ label, token });
const MENUS = {
  mode: [[item('COMP'), item('SD'), item('REG')]],
  setup: [
    [item('Deg'), item('Rad'), item('Gra'), item('Fix'), item('Sci'), item('Norm')],
    [item('ab/c'), item('d/c')],
  ],
  fix: { prompt: 'Fix 0~9?' },
  sci: { prompt: 'Sci 0~9?' },
  norm: { prompt: 'Norm 1~2?' },
  clrComp: [[item('Mcl'), item('Mode'), item('All')]],
  clrStat: [[item('Scl'), item('Mode'), item('All')]],
  drg: [[item('°', 'udeg'), item('r', 'urad'), item('g', 'ugra')]],
  ssumSD: [[item('Σx²', 'sx2'), item('Σx', 'sx'), item('n', 'sn')]],
  ssumREG: [
    [item('Σx²', 'sx2'), item('Σx', 'sx'), item('n', 'sn')],
    [item('Σy²', 'sy2'), item('Σy', 'sy'), item('Σxy', 'sxy')],
  ],
  svarSD: [[item(CH.XBAR, 'mx'), item('xσn', 'sxn'), item('xσn-1', 'sxn1')]],
  svarREG: [
    [item(CH.XBAR, 'mx'), item('xσn', 'sxn'), item('xσn-1', 'sxn1')],
    [item(CH.YBAR, 'my'), item('yσn', 'syn'), item('yσn-1', 'syn1')],
    [item('A', 'ra'), item('B', 'rb'), item('r', 'rr'), item(CH.XHAT, 'xhat'), item(CH.YHAT, 'yhat')],
  ],
};

/** Text lines for a menu page: "1:Deg  2:Rad", two 6-character columns when they fit. */
export function menuLines(page) {
  const cells = page.map((it, k) => `${k + 1}:${it.label}`);
  const lines = [];
  for (let k = 0; k < cells.length; k++) {
    const a = cells[k];
    const b = cells[k + 1];
    if (b !== undefined && a.length <= 5 && b.length <= 6) {
      lines.push(a.padEnd(6) + b);
      k++;
    } else lines.push(a);
  }
  return lines;
}

function encode(v) {
  return isF(v) ? { n: v.n.toString(), d: v.d.toString() } : v;
}
function decode(v) {
  if (v && typeof v === 'object' && 'n' in v) return new Fraction(BigInt(v.n), BigInt(v.d));
  return typeof v === 'number' && Number.isFinite(v) ? v : ZERO;
}

export class Calculator {
  constructor({ storage = null, random = Math.random } = {}) {
    this.storage = storage;
    this.random = random;
    this.resetAll();
    this.load();
  }

  // ---------- state ----------

  resetAll() {
    Object.assign(this, DEFAULT_SETTINGS());
    this.vars = Object.fromEntries(VAR_NAMES.map((n) => [n, ZERO]));
    this.ans = ZERO;
    this.sd = [];
    this.reg = [];
    this.history = [];
    this.on = true;
    this.clearLine();
  }

  clearLine() {
    this.buf = [];
    this.cur = 0;
    this.ins = true; // natural display: insert by default
    this.phase = 'edit';
    this.shift = false;
    this.alpha = false;
    this.hyp = false;
    this.await = null;
    this.menu = null;
    this.error = null;
    this.upperTokens = null; // expression shown on the dot-matrix area (result phase)
    this.upperText = ''; // suffix after it, or a plain message
    this.hist = -1;
    this.lastTokens = null;
    this.dtRepeat = null;
    this.disp = { value: ZERO, mode: 'dec', engShift: 0, improper: this.dc };
  }

  save() {
    if (!this.storage) return;
    try {
      const data = {
        mode: this.mode, angle: this.angle, fmt: this.fmt, dc: this.dc,
        vars: Object.fromEntries(VAR_NAMES.map((n) => [n, encode(this.vars[n])])),
        ans: encode(this.ans), sd: this.sd, reg: this.reg,
      };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable: keep working without persistence */
    }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (['COMP', 'SD', 'REG'].includes(d.mode)) this.mode = d.mode;
      if (['D', 'R', 'G'].includes(d.angle)) this.angle = d.angle;
      if (d.fmt && ['Norm', 'Fix', 'Sci'].includes(d.fmt.type)) this.fmt = { type: d.fmt.type, n: d.fmt.n | 0 };
      this.dc = !!d.dc;
      for (const n of VAR_NAMES) if (d.vars && n in d.vars) this.vars[n] = decode(d.vars[n]);
      this.ans = decode(d.ans);
      if (Array.isArray(d.sd)) this.sd = d.sd.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.f));
      if (Array.isArray(d.reg)) this.reg = d.reg.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y));
      this.disp.improper = this.dc;
    } catch {
      /* ignore corrupt storage */
    }
  }

  // ---------- key handling ----------

  press(key) {
    this.dispatch(key);
    this.save();
  }

  dispatch(key) {
    if (!this.on) {
      if (key === 'on') this.powerOn();
      return;
    }
    if (key === 'on') return this.powerOn();
    if (key === 'shift') {
      this.shift = !this.shift;
      this.alpha = false;
      return;
    }
    if (key === 'alpha') {
      this.alpha = !this.alpha;
      this.shift = false;
      return;
    }
    const { shift, alpha } = this;
    this.shift = this.alpha = false;

    if (shift && key === 'ac') return this.powerOff();
    if (this.await) return this.awaitKey(key);
    if (this.phase === 'menu') return this.menuKey(key);
    if (this.phase === 'error') return this.errorKey(key);
    if (this.phase === 'message') {
      this.clearLine();
      if (key === 'ac') return;
    }
    if (alpha) {
      if (key === 'exp') return this.insert('euler');
      const v = VAR_KEYS[key];
      if (v) this.insert('v' + v);
      return;
    }
    if (key === 'hyp') {
      this.hyp = true;
      return;
    }
    const hyp = this.hyp;
    this.hyp = false;
    return shift ? this.shiftKey(key, hyp) : this.plainKey(key, hyp);
  }

  plainKey(key, hyp) {
    if (DIGIT_KEYS.has(key)) return this.insert(key);
    if (PLAIN_TEMPLATE[key]) return this.insertTemplate(PLAIN_TEMPLATE[key]);
    if (PLAIN_TOKEN[key]) return this.insert(PLAIN_TOKEN[key]);
    const result = this.phase === 'result';
    switch (key) {
      case 'sin':
      case 'cos':
      case 'tan':
        return this.insert(hyp ? key + 'h' : key);
      case 'frac':
        return this.insertTemplate('tFrac');
      case 'sd':
        return this.sdKey(false);
      case 'dms':
        return result ? this.toggleDms() : this.insert('dms');
      case 'eng':
        return result ? this.eng(1) : undefined;
      case 'rcl':
        this.await = 'rcl';
        return;
      case 'mplus':
        return this.mode === 'COMP' ? this.memAdd(1) : this.dataEntry();
      case 'del':
        return this.del();
      case 'ac':
        return this.clearLine();
      case 'eq':
        return this.equals();
      case 'mode':
        return this.openMenu('mode');
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        return this.arrow(key);
    }
  }

  shiftKey(key, hyp) {
    if (SHIFT_TOKEN[key]) return this.insert(SHIFT_TOKEN[key]);
    if (SHIFT_TEMPLATE[key]) return this.insertTemplate(SHIFT_TEMPLATE[key]);
    const result = this.phase === 'result';
    const stat = this.mode !== 'COMP';
    switch (key) {
      case 'sin':
      case 'cos':
      case 'tan':
        return this.insert('a' + key + (hyp ? 'h' : ''));
      case 'frac':
        return this.insertTemplate('tMixed');
      case 'sd':
        return this.sdKey(true);
      case 'dms':
        if (result) this.disp = { ...this.disp, mode: 'dec' };
        return;
      case 'eng':
        return result ? this.eng(-1) : undefined;
      case 'rcl':
        this.await = 'sto';
        return;
      case 'mplus':
        return stat ? undefined : this.memAdd(-1);
      case 'del':
        if (this.phase === 'edit') this.ins = !this.ins;
        return;
      case 'mode':
        return this.openMenu('setup');
      case '9':
        return this.openMenu(stat ? 'clrStat' : 'clrComp');
      case '1':
        return stat ? this.openMenu(this.mode === 'SD' ? 'ssumSD' : 'ssumREG') : undefined;
      case '2':
        return stat ? this.openMenu(this.mode === 'SD' ? 'svarSD' : 'svarREG') : undefined;
      case 'ans':
        return this.openMenu('drg');
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        return this.arrow(key);
    }
  }

  insert(tok) {
    if (this.phase === 'result') {
      const chain = BINARY.has(tok) || POSTFIX.has(tok);
      this.buf = chain ? ['ans', tok] : [tok];
      this.cur = this.buf.length;
      this.ins = true; // natural display: insert by default
      this.phase = 'edit';
      this.hist = -1;
      this.dtRepeat = null;
      return;
    }
    if (NEEDS_BASE.has(tok) && !this.hasOperandBefore()) {
      // nothing to apply x², x⁻¹ ... to: insert an empty base box and move into it
      if (this.buf.length + 3 > MAX_TOKENS) return;
      this.buf.splice(this.cur, 0, 'tBase', 'tEnd', tok);
      this.cur++;
      return;
    }
    // overwrite mode never replaces a template marker
    const overwrite = !this.ins && this.cur < this.buf.length && !isMarker(this.buf[this.cur]);
    if (overwrite) this.buf[this.cur] = tok;
    else if (this.buf.length < MAX_TOKENS) this.buf.splice(this.cur, 0, tok);
    else return;
    this.cur++;
  }

  /** Insert an empty template (fraction, root, power...) and move into its first free slot. */
  insertTemplate(kind) {
    const tpl = [kind, ...Array(SLOTS[kind] - 1).fill('tSep'), 'tEnd'];
    if (this.phase === 'result') {
      // continue from the result like a binary operator would
      if (kind === 'tPow') this.startLine(['ans', ...tpl], 2);
      else if (kind === 'tFrac') this.startLine([kind, 'ans', 'tSep', 'tEnd'], 3);
      else if (kind === 'tRoot') this.startLine([kind, 'ans', 'tSep', 'tEnd'], 3);
      else this.startLine(tpl, 1);
      return;
    }
    if (this.buf.length + tpl.length > MAX_TOKENS) return;
    if (kind === 'tPow' && !this.hasOperandBefore()) {
      // x^ with nothing before it: □^□, cursor in the base box
      if (this.buf.length + tpl.length + 2 > MAX_TOKENS) return;
      this.buf.splice(this.cur, 0, 'tBase', 'tEnd', ...tpl);
      this.cur++;
      return;
    }
    let captured = [];
    if (CAPTURE.has(kind)) {
      let s = this.cur;
      while (s > 0 && isNumberTok(this.buf[s - 1])) s--;
      captured = this.buf.splice(s, this.cur - s);
      this.cur = s;
    }
    this.buf.splice(this.cur, 0, kind, ...captured, ...tpl.slice(1));
    this.cur += captured.length ? captured.length + 2 : 1;
  }

  /** True when the token before the cursor ends a value (a number, Ans, ")", x², a template...). */
  hasOperandBefore() {
    const t = this.buf[this.cur - 1];
    if (t === undefined) return false;
    return DIGIT_KEYS.has(t) || t === '.' || ATOM.has(t) || t === 'rp' || POSTFIX.has(t) || t === 'tEnd';
  }

  startLine(buf, cur) {
    this.buf = buf;
    this.cur = cur;
    this.ins = true; // natural display: insert by default
    this.phase = 'edit';
    this.hist = -1;
    this.dtRepeat = null;
  }

  del() {
    if (this.phase === 'result') return this.editLast('left');
    const buf = this.buf;
    const next = buf[this.cur];
    // the end of a template slot behaves like the end of the line
    const slotEnd = this.cur >= buf.length || next === 'tSep' || next === 'tEnd';
    let at = this.cur;
    if (this.ins || slotEnd) {
      if (this.cur === 0) return;
      at = this.cur - 1;
    }
    const t = buf[at];
    if (t === 'tEnd') {
      this.cur = at; // step into the template's last slot instead of deleting it
      return;
    }
    if (TEMPLATE_START.has(t) || t === 'tSep') return this.unwrap(at);
    buf.splice(at, 1);
    if (at < this.cur) this.cur--;
  }

  /** Marker indices [start, ...separators, end] of the template that owns the marker at `at`. */
  templateMarks(at) {
    const buf = this.buf;
    let s = at;
    if (!TEMPLATE_START.has(buf[at])) {
      let depth = 0;
      for (s = at - 1; s >= 0; s--) {
        if (buf[s] === 'tEnd') depth++;
        else if (TEMPLATE_START.has(buf[s])) {
          if (depth === 0) break;
          depth--;
        }
      }
    }
    const marks = [s];
    let depth = 0;
    for (let i = s + 1; i < buf.length; i++) {
      const t = buf[i];
      if (TEMPLATE_START.has(t)) depth++;
      else if (t === 'tEnd') {
        if (depth === 0) {
          marks.push(i);
          break;
        }
        depth--;
      } else if (t === 'tSep' && depth === 0) marks.push(i);
    }
    return marks;
  }

  /** Remove a template: drop it entirely when empty, otherwise keep its contents inline. */
  unwrap(at) {
    const marks = this.templateMarks(at);
    const s = marks[0];
    const e = marks[marks.length - 1];
    const empty = e - s + 1 === marks.length;
    const drop = (i) => (empty ? i >= s && i <= e : marks.includes(i));
    let before = 0;
    for (let i = 0; i < this.cur; i++) if (drop(i)) before++;
    this.buf = this.buf.filter((_, i) => !drop(i));
    this.cur -= before;
  }

  arrow(key) {
    if (this.phase === 'result') {
      if (key === 'left' || key === 'right') return this.editLast(key);
      return this.replay(key === 'up' ? -1 : 1);
    }
    const n = this.buf.length;
    // like natural-display Casios: ◀ at the start wraps to the end and ▶ at the end to the start
    if (key === 'left') this.cur = this.cur > 0 ? this.cur - 1 : n;
    else if (key === 'right') this.cur = this.cur < n ? this.cur + 1 : 0;
    else if (this.buf.length === 0) this.replay(key === 'up' ? -1 : 1);
    else this.vertical(key === 'up' ? -1 : 1);
  }

  /** ▲▼ inside an expression: numerator <-> denominator, otherwise the nearest position above / below. */
  vertical(dir) {
    const { carets } = layoutExpr(this.buf);
    const here = carets.find((c) => c.index === this.cur);
    if (!here) return;
    const nearestIn = (lo, hi) => {
      let best = null;
      for (const c of carets) {
        if (c.index < lo || c.index > hi) continue;
        if (!best || Math.abs(c.x - here.x) < Math.abs(best.x - here.x)) best = c;
      }
      return best;
    };
    // fractions: move to the other part of the nearest enclosing fraction
    const stack = [];
    for (let i = 0; i < this.cur; i++) {
      const t = this.buf[i];
      if (TEMPLATE_START.has(t)) stack.push({ s: i, slot: 0 });
      else if (t === 'tSep' && stack.length) stack[stack.length - 1].slot++;
      else if (t === 'tEnd') stack.pop();
    }
    for (let k = stack.length - 1; k >= 0; k--) {
      const { s, slot } = stack[k];
      const kind = this.buf[s];
      if (kind !== 'tFrac' && kind !== 'tMixed') continue;
      const den = kind === 'tFrac' ? 1 : 2;
      const target = dir > 0 && slot < den ? den : dir < 0 && slot === den ? den - 1 : -1;
      if (target < 0) continue;
      const m = this.templateMarks(s);
      const c = nearestIn(m[target] + 1, m[target + 1]);
      if (c) this.cur = c.index;
      return;
    }
    // anything else (exponents, roots): nearest position strictly above / below
    let best = null;
    let bestScore = Infinity;
    for (const c of carets) {
      const dy = (c.base - here.base) * dir;
      if (dy <= 0) continue;
      const score = dy * 1000 + Math.abs(c.x - here.x);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) this.cur = best.index;
  }

  /** Tap on the display: put the cursor at token gap `index` (null = no position). */
  tap(index) {
    if (!this.on || this.await || this.phase === 'menu' || this.phase === 'message') return;
    this.shift = this.alpha = this.hyp = false;
    if (this.phase === 'error') {
      this.phase = 'edit';
      this.error = null;
      return;
    }
    if (this.phase === 'result') {
      if (!this.lastTokens || index === null || index === undefined) return;
      this.editLast('left');
    }
    if (index !== null && index !== undefined) this.cur = Math.max(0, Math.min(this.buf.length, index));
  }

  /** Re-open the expression behind the shown result for editing (◀ → end, ▶ → start). */
  editLast(key) {
    const toks = this.lastTokens;
    if (!toks || !toks.length) return;
    this.buf = toks.slice();
    this.cur = key === 'left' ? this.buf.length : 0;
    this.ins = true; // natural display: insert by default
    this.phase = 'edit';
    this.hist = -1;
  }

  replay(dir) {
    const n = this.history.length;
    if (!n) return;
    let i;
    if (dir < 0) i = this.hist < 0 ? n - 1 : this.hist - 1;
    else i = this.hist < 0 ? -1 : this.hist + 1;
    if (i < 0 || i >= n) return;
    const h = this.history[i];
    this.hist = i;
    this.phase = 'result';
    this.upperTokens = h.tokens;
    this.upperText = '';
    this.lastTokens = h.tokens;
    this.disp = { ...h.disp };
  }

  // ---------- evaluation ----------

  context(flags) {
    return {
      angle: this.angle, fmt: this.fmt, vars: this.vars, ans: this.ans,
      random: this.random, mode: this.mode, sd: this.sd, reg: this.reg, flags,
    };
  }

  /** Evaluate tokens; on failure switch to the error screen and return null. */
  compute(tokens, { offset = 0, full = tokens } = {}) {
    const flags = {};
    try {
      const value = evaluate(parse(lex(tokens)), this.context(flags));
      return { value, flags };
    } catch (e) {
      const ce = e instanceof CalcError ? e : new CalcError('Math', tokens.length);
      this.phase = 'error';
      this.error = { type: ce.type, pos: ce.pos + offset };
      this.buf = full.slice();
      this.cur = Math.min(this.error.pos, this.buf.length);
      this.ins = true; // natural display: insert by default
      return null;
    }
  }

  defaultDisp(value, flags) {
    let mode = 'dec';
    if (flags.dms && dmsString(toNum(value))) mode = 'dms';
    else if (flags.frac && !flags.decimal && isF(value) && fractionString(value, this.dc)) mode = 'frac';
    return { value, mode, engShift: 0, improper: this.dc };
  }

  showResult(tokens, text, value, flags = {}) {
    this.phase = 'result';
    this.upperTokens = tokens;
    this.upperText = text;
    this.disp = this.defaultDisp(value, flags);
    this.dtRepeat = null;
  }

  /** Run tokens as a calculation (updates Ans and replay history). */
  calculate(tokens, suffix = '') {
    const r = this.compute(tokens);
    if (!r) return null;
    this.ans = r.value;
    this.lastTokens = tokens.slice();
    this.showResult(tokens.slice(), suffix, r.value, r.flags);
    this.history.push({ tokens: tokens.slice(), disp: { ...this.disp } });
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.hist = this.history.length - 1;
    return r;
  }

  equals() {
    const tokens = this.phase === 'result' ? this.lastTokens : this.buf;
    if (!tokens || !tokens.length) return;
    this.calculate(tokens);
  }

  /** Value for M+/STO: evaluate the line being typed, or use the value on screen. */
  currentValue(suffix) {
    if (this.phase === 'edit' && this.buf.length) {
      const r = this.calculate(this.buf, suffix);
      return r ? { value: r.value } : null;
    }
    return { value: this.disp.value, upper: null };
  }

  memAdd(sign) {
    const label = sign > 0 ? 'M+' : 'M-';
    const r = this.currentValue(label);
    if (!r) return;
    this.vars.M = addVals(this.vars.M, sign > 0 ? r.value : negVal(r.value));
    if (r.upper === null) {
      this.ans = r.value;
      this.phase = 'result';
      this.upperTokens = null;
      this.upperText = label;
    }
  }

  awaitKey(key) {
    if (key === 'ac') return this.clearLine();
    const v = VAR_KEYS[key];
    if (!v) return;
    const kind = this.await;
    this.await = null;
    if (kind === 'sto') {
      const r = this.currentValue('→' + v);
      if (!r) return;
      this.vars[v] = r.value;
      if (r.upper === null) {
        this.ans = r.value;
        this.phase = 'result';
        this.upperTokens = null;
        this.upperText = 'Ans→' + v;
      }
    } else {
      const value = this.vars[v];
      this.ans = value;
      this.showResult(['v' + v], '=', value, { frac: isF(value) && !value.isInteger() });
      this.lastTokens = ['v' + v];
      this.hist = -1;
    }
  }

  errorKey(key) {
    if (key === 'ac') return this.clearLine();
    if (key === 'left' || key === 'right') {
      this.phase = 'edit';
      this.error = null;
    }
  }

  // ---------- result display toggles ----------

  /** S⇔D: fraction <-> decimal (SHIFT: mixed <-> improper). While typing it calculates first. */
  sdKey(improper) {
    if (this.phase === 'edit' && this.buf.length) {
      if (!this.calculate(this.buf)) return;
    }
    if (this.phase !== 'result') return;
    this.toggleFrac(improper);
  }

  toggleFrac(improper) {
    const d = this.disp;
    const f = rationalOf(d.value);
    if (improper) {
      const imp = d.mode === 'frac' ? !d.improper : true;
      if (fractionString(f, imp)) this.disp = { ...d, mode: 'frac', improper: imp };
      return;
    }
    if (d.mode === 'frac') this.disp = { ...d, mode: 'dec' };
    else if (fractionString(f, this.dc)) this.disp = { ...d, mode: 'frac', improper: this.dc };
  }

  toggleDms() {
    const d = this.disp;
    if (d.mode === 'dms') this.disp = { ...d, mode: 'dec' };
    else if (dmsString(toNum(d.value))) this.disp = { ...d, mode: 'dms' };
  }

  eng(dir) {
    const d = this.disp;
    const shift = d.mode === 'eng' ? d.engShift + dir : dir > 0 ? 0 : -1;
    const next = { ...d, mode: 'eng', engShift: shift };
    // only accept shifts the 10-digit display can show
    const probe = formatLower(d.value, next, this.fmt);
    const x = Math.abs(toNum(d.value));
    if (shift < -3 || shift > 3 || (x !== 0 && !probe.exp)) return;
    this.disp = next;
  }

  // ---------- statistics data entry ----------

  dataEntry() {
    if (this.phase === 'result' && this.dtRepeat) return this.addData(this.dtRepeat);
    let entry;
    if (this.phase === 'edit' && this.buf.length) {
      entry = this.parseData(this.buf);
      if (!entry) return;
    } else if (this.phase === 'result' && this.mode === 'SD') {
      entry = { x: round15(toNum(this.disp.value)), f: 1 };
    } else return;
    this.addData(entry);
  }

  parseData(buf) {
    // split at top-level "," and ";"
    const parts = [];
    let depth = 0;
    let start = 0;
    const seps = [];
    buf.forEach((t, i) => {
      if (t === 'lp' || t === 'pol' || t === 'rec' || TEMPLATE_START.has(t)) depth++;
      else if (t === 'rp' || t === 'tEnd') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (t === 'comma' || t === 'semi')) {
        parts.push({ tokens: buf.slice(start, i), offset: start });
        seps.push({ t, i });
        start = i + 1;
      }
    });
    parts.push({ tokens: buf.slice(start), offset: start });
    const pattern = seps.map((s) => s.t).join(' ');
    // the frequency may follow a ";" (fx-82MS style) or a "," (no ";" key on this layout)
    const ok = this.mode === 'SD'
      ? ['', 'semi', 'comma'].includes(pattern)
      : ['comma', 'comma semi', 'comma comma'].includes(pattern);
    if (!ok) {
      this.compute(['comma'], { offset: seps.length ? seps[seps.length - 1].i : buf.length, full: buf });
      return null;
    }
    const vals = [];
    for (const p of parts) {
      const r = this.compute(p.tokens, { offset: p.offset, full: buf });
      if (!r) return null;
      vals.push(round15(toNum(r.value)));
    }
    const f = vals.length > (this.mode === 'SD' ? 1 : 2) ? vals[vals.length - 1] : 1;
    if (!(f > 0)) {
      this.phase = 'error';
      this.error = { type: 'Math', pos: buf.length };
      return null;
    }
    return this.mode === 'SD' ? { x: vals[0], f } : { x: vals[0], y: vals[1], f };
  }

  addData(entry) {
    const list = this.mode === 'SD' ? this.sd : this.reg;
    list.push({ ...entry });
    const n = list.reduce((s, e) => s + e.f, 0);
    this.showResult(null, 'n=', round15(n));
    this.dtRepeat = entry;
    this.lastTokens = null;
    this.hist = -1;
  }

  // ---------- menus ----------

  openMenu(id) {
    this.menu = { id, page: 0, prev: this.phase === 'result' ? 'result' : 'edit' };
    this.phase = 'menu';
  }

  menuPages() {
    const m = MENUS[this.menu.id];
    return Array.isArray(m) ? m : [];
  }

  menuKey(key) {
    const { id } = this.menu;
    if (key === 'ac') return this.clearLine();
    const pages = this.menuPages();
    if (['left', 'right', 'up', 'down'].includes(key) && pages.length > 1) {
      const step = key === 'right' || key === 'down' ? 1 : -1;
      this.menu.page = (this.menu.page + step + pages.length) % pages.length;
      return;
    }
    if (!DIGIT_KEYS.has(key)) return;
    this.choose(id, Number(key), pages[this.menu.page]);
  }

  choose(id, d, page) {
    const done = () => this.clearLine();
    switch (id) {
      case 'mode':
        if (d >= 1 && d <= 3) {
          this.mode = ['COMP', 'SD', 'REG'][d - 1];
          done();
        }
        return;
      case 'setup':
        if (this.menu.page === 1) {
          // page 2: fraction result format
          if (d === 1 || d === 2) {
            this.dc = d === 2;
            done();
          }
        } else if (d >= 1 && d <= 3) {
          this.angle = ['D', 'R', 'G'][d - 1];
          done();
        } else if (d >= 4 && d <= 6) this.menu = { ...this.menu, id: ['fix', 'sci', 'norm'][d - 4], page: 0 };
        return;
      case 'fix':
      case 'sci':
        this.fmt = { type: id === 'fix' ? 'Fix' : 'Sci', n: d };
        return done();
      case 'norm':
        if (d === 1 || d === 2) {
          this.fmt = { type: 'Norm', n: d };
          done();
        }
        return;
      case 'clrComp':
      case 'clrStat':
        return this.clear(d, id === 'clrStat');
      default: {
        // token-inserting menus (DRG▶, S-SUM, S-VAR)
        const tok = page && page[d - 1] && page[d - 1].token;
        if (!tok) return;
        this.phase = this.menu.prev;
        this.menu = null;
        this.insert(tok);
      }
    }
  }

  clear(d, stat) {
    let msg;
    if (d === 1) {
      if (stat) {
        this.sd = [];
        this.reg = [];
        msg = 'Stat clear';
      } else {
        for (const n of VAR_NAMES) this.vars[n] = ZERO;
        msg = 'Mem clear';
      }
    } else if (d === 2) {
      Object.assign(this, DEFAULT_SETTINGS());
      msg = 'Mode clear';
    } else if (d === 3) {
      this.resetAll();
      msg = 'All clear';
    } else return;
    this.clearLine();
    this.phase = 'message';
    this.upperText = msg;
  }

  // ---------- power ----------

  powerOn() {
    this.on = true;
    this.clearLine();
  }

  powerOff() {
    this.clearLine();
    this.on = false;
  }

  // ---------- view ----------

  view() {
    if (!this.on) return { on: false };
    const n = this.history.length;
    const replayable = this.phase === 'result' || (this.phase === 'edit' && this.buf.length === 0);
    const ind = {
      S: this.shift, A: this.alpha, M: toNum(this.vars.M) !== 0,
      STO: this.await === 'sto', RCL: this.await === 'rcl',
      SD: this.mode === 'SD', REG: this.mode === 'REG',
      D: this.angle === 'D', R: this.angle === 'R', G: this.angle === 'G',
      FIX: this.fmt.type === 'Fix', SCI: this.fmt.type === 'Sci',
      up: replayable && n > 0 && (this.hist < 0 || this.hist > 0),
      down: replayable && this.hist >= 0 && this.hist < n - 1,
    };
    // expr: tokens laid out in natural display; upper: the same as one line of text
    const view = {
      on: true, phase: this.phase, ind, upper: '', expr: null, suffix: '', cursor: null, insert: this.ins,
      lower: null, lines: null,
    };
    switch (this.phase) {
      case 'edit':
        view.expr = this.buf;
        view.upper = linearText(this.buf);
        view.cursor = this.cur;
        view.lower = formatLower(this.disp.value, this.disp, this.fmt);
        break;
      case 'result':
      case 'message':
        view.expr = this.phase === 'result' ? this.upperTokens : null;
        view.suffix = this.upperText;
        view.upper = (view.expr ? linearText(view.expr) : '') + this.upperText;
        view.lower = formatLower(this.disp.value, this.disp, this.fmt);
        break;
      case 'error':
        view.upper = `${this.error.type} ERROR`;
        view.lines = [view.upper, '', '[AC] :Cancel', '[◀][▶]:Goto'];
        break;
      case 'menu': {
        const m = MENUS[this.menu.id];
        view.lines = Array.isArray(m) ? menuLines(m[this.menu.page]) : [m.prompt];
        view.upper = view.lines.join(' ');
        view.more = this.menuPages().length > 1;
        break;
      }
    }
    return view;
  }
}
