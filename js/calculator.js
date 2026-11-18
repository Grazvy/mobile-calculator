// Calculator state machine. DOM-free: press(keyId) changes state, view() describes the LCD.

import { lex } from './engine/lexer.js';
import { parse } from './engine/parser.js';
import { evaluate, round15, toNum } from './engine/evaluate.js';
import { Fraction } from './engine/fraction.js';
import { dmsString, formatLower, fractionString, rationalOf } from './engine/format.js';
import { BINARY, CalcError, POSTFIX, tokensText } from './engine/tokens.js';

const STORAGE_KEY = 'sci82.state.v1';
const MAX_TOKENS = 99;
const MAX_HISTORY = 30;
const VAR_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
// keys that carry a red ALPHA variable letter
const VAR_KEYS = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', rp: 'X', comma: 'Y', mplus: 'M' };
const DIGIT_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const PLAIN_TOKEN = {
  dot: '.', exp: 'EE', add: 'add', sub: 'sub', mul: 'mul', div: 'div', pow: 'pow',
  sqrt: 'sqrt', sq: 'sq', cube: 'cube', inv: 'inv', ncr: 'ncr', pol: 'pol',
  log: 'log', ln: 'ln', neg: 'neg', lp: 'lp', rp: 'rp', comma: 'comma', ans: 'ans',
};
const SHIFT_TOKEN = {
  inv: 'fact', ncr: 'npr', pol: 'rec', cube: 'cbrt', pow: 'xrt', log: 'tenx', ln: 'ex',
  comma: 'semi', 0: 'rnd', dot: 'ran', exp: 'pi',
};

const ZERO = Fraction.of(0);
const isF = (v) => v instanceof Fraction;
const addVals = (a, b) => (isF(a) && isF(b) ? a.add(b) : round15(toNum(a) + toNum(b)));
const negVal = (v) => (isF(v) ? v.neg() : -v);

const DEFAULT_SETTINGS = () => ({ mode: 'COMP', angle: 'D', fmt: { type: 'Norm', n: 1 }, dc: false });

const MENUS = {
  mode1: [{ text: 'COMP SD  REG', items: ['COMP', 'SD', 'REG'] }],
  mode2: [{ text: 'Deg Rad Gra', items: ['Deg', 'Rad', 'Gra'] }],
  mode3: [{ text: 'Fix Sci Norm', items: ['Fix', 'Sci', 'Norm'] }],
  mode4: [{ text: 'Disp', items: ['Disp'] }],
  disp: [{ text: 'ab/c d/c', items: ['ab/c', 'd/c'] }],
  fix: [{ text: 'Fix 0~9?', items: [] }],
  sci: [{ text: 'Sci 0~9?', items: [] }],
  norm: [{ text: 'Norm 1~2?', items: [] }],
  clrComp: [{ text: 'Mcl Mode All', items: ['Mcl', 'Mode', 'All'] }],
  clrStat: [{ text: 'Scl Mode All', items: ['Scl', 'Mode', 'All'] }],
  drg: [{ text: 'D   R   G', items: ['D', 'R', 'G'], tokens: ['udeg', 'urad', 'ugra'] }],
  ssumSD: [{ text: 'Σx²  Σx  n', items: ['Σx²', 'Σx', 'n'], tokens: ['sx2', 'sx', 'sn'] }],
  ssumREG: [
    { text: 'Σx²  Σx  n', items: ['Σx²', 'Σx', 'n'], tokens: ['sx2', 'sx', 'sn'] },
    { text: 'Σy² Σy  Σxy', items: ['Σy²', 'Σy', 'Σxy'], tokens: ['sy2', 'sy', 'sxy'] },
  ],
  svarSD: [{ text: ' xσn xσn-1', items: ['', 'xσn', 'xσn-1'], tokens: ['mx', 'sxn', 'sxn1'] }],
  svarREG: [
    { text: ' xσn xσn-1', items: ['', 'xσn', 'xσn-1'], tokens: ['mx', 'sxn', 'sxn1'] },
    { text: ' yσn yσn-1', items: ['', 'yσn', 'yσn-1'], tokens: ['my', 'syn', 'syn1'] },
    { text: 'A   B   r', items: ['A', 'B', 'r'], tokens: ['ra', 'rb', 'rr'] },
    { text: '    ', items: ['', ''], tokens: ['xhat', 'yhat'] },
  ],
};
const MODE_PAGES = ['mode1', 'mode2', 'mode3', 'mode4'];

/** Place the selection digits on the 10-cell lower line under each menu word. */
function menuLower(page) {
  const cells = Array.from({ length: 10 }, () => ({ ch: ' ', dp: false }));
  let from = 0;
  page.items.forEach((label, k) => {
    const start = page.text.indexOf(label, from);
    from = start + label.length;
    const center = start + label.length / 2;
    const cell = Math.max(0, Math.min(9, Math.round((center / 12) * 10 - 0.5)));
    cells[cell] = { ch: String(k + 1), dp: false };
  });
  return { neg: false, cells, exp: null };
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
    this.ins = false;
    this.phase = 'edit';
    this.shift = false;
    this.alpha = false;
    this.hyp = false;
    this.await = null;
    this.menu = null;
    this.error = null;
    this.upperFixed = '';
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
    if (PLAIN_TOKEN[key]) return this.insert(PLAIN_TOKEN[key]);
    const result = this.phase === 'result';
    switch (key) {
      case 'sin':
      case 'cos':
      case 'tan':
        return this.insert(hyp ? key + 'h' : key);
      case 'frac':
        return result ? this.toggleFrac(false) : this.insert('frac');
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
        return this.openMenu('mode1');
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        return this.arrow(key);
    }
  }

  shiftKey(key, hyp) {
    if (SHIFT_TOKEN[key]) return this.insert(SHIFT_TOKEN[key]);
    const result = this.phase === 'result';
    const stat = this.mode !== 'COMP';
    switch (key) {
      case 'sin':
      case 'cos':
      case 'tan':
        return this.insert('a' + key + (hyp ? 'h' : ''));
      case 'frac':
        return result ? this.toggleFrac(true) : undefined;
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
        return this.openMenu(stat ? 'clrStat' : 'clrComp');
      case '1':
        return stat ? this.openMenu(this.mode === 'SD' ? 'ssumSD' : 'ssumREG') : undefined;
      case '2':
        return stat ? this.openMenu(this.mode === 'SD' ? 'svarSD' : 'svarREG') : undefined;
      case 'ans':
        return this.openMenu('drg');
      case 'eq':
        this.insert('pct');
        return this.equals();
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
      this.ins = false;
      this.phase = 'edit';
      this.hist = -1;
      this.dtRepeat = null;
      return;
    }
    const overwrite = !this.ins && this.cur < this.buf.length;
    if (overwrite) this.buf[this.cur] = tok;
    else if (this.buf.length < MAX_TOKENS) this.buf.splice(this.cur, 0, tok);
    else return;
    this.cur++;
  }

  del() {
    if (this.phase === 'result') return this.editLast('left');
    if (this.ins || this.cur >= this.buf.length) {
      if (this.cur > 0) {
        this.buf.splice(this.cur - 1, 1);
        this.cur--;
      }
    } else {
      this.buf.splice(this.cur, 1);
    }
  }

  arrow(key) {
    if (this.phase === 'result') {
      if (key === 'left' || key === 'right') return this.editLast(key);
      return this.replay(key === 'up' ? -1 : 1);
    }
    if (key === 'left') this.cur = Math.max(0, this.cur - 1);
    else if (key === 'right') this.cur = Math.min(this.buf.length, this.cur + 1);
    else if (this.buf.length === 0) this.replay(key === 'up' ? -1 : 1);
  }

  /** Re-open the expression behind the shown result for editing (◀ → end, ▶ → start). */
  editLast(key) {
    const toks = this.lastTokens;
    if (!toks || !toks.length) return;
    this.buf = toks.slice();
    this.cur = key === 'left' ? this.buf.length : 0;
    this.ins = false;
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
    this.upperFixed = tokensText(h.tokens);
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
      this.ins = false;
      return null;
    }
  }

  defaultDisp(value, flags) {
    let mode = 'dec';
    if (flags.dms && dmsString(toNum(value))) mode = 'dms';
    else if (flags.frac && !flags.decimal && isF(value) && fractionString(value, this.dc)) mode = 'frac';
    return { value, mode, engShift: 0, improper: this.dc };
  }

  showResult(upper, value, flags = {}) {
    this.phase = 'result';
    this.upperFixed = upper;
    this.disp = this.defaultDisp(value, flags);
    this.dtRepeat = null;
  }

  /** Run tokens as a calculation (updates Ans and replay history). */
  calculate(tokens, suffix = '') {
    const r = this.compute(tokens);
    if (!r) return null;
    this.ans = r.value;
    this.lastTokens = tokens.slice();
    this.showResult(tokensText(tokens) + suffix, r.value, r.flags);
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
      this.upperFixed = label;
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
        this.upperFixed = 'Ans→' + v;
      }
    } else {
      const value = this.vars[v];
      this.ans = value;
      this.showResult(v + '=', value, { frac: isF(value) && !value.isInteger() });
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
      if (t === 'lp' || t === 'pol' || t === 'rec') depth++;
      else if (t === 'rp') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (t === 'comma' || t === 'semi')) {
        parts.push({ tokens: buf.slice(start, i), offset: start });
        seps.push({ t, i });
        start = i + 1;
      }
    });
    parts.push({ tokens: buf.slice(start), offset: start });
    const pattern = seps.map((s) => s.t).join(' ');
    const ok = this.mode === 'SD' ? ['', 'semi'].includes(pattern) : ['comma', 'comma semi'].includes(pattern);
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
    this.showResult('n=', round15(n));
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
    return MENUS[this.menu.id];
  }

  menuKey(key) {
    const { id } = this.menu;
    if (key === 'ac') return this.clearLine();
    if (key === 'mode') {
      const i = MODE_PAGES.indexOf(id);
      this.menu = { ...this.menu, id: MODE_PAGES[(i + 1) % MODE_PAGES.length], page: 0 };
      return;
    }
    const pages = this.menuPages();
    if ((key === 'left' || key === 'right') && pages.length > 1) {
      const step = key === 'right' ? 1 : -1;
      this.menu.page = (this.menu.page + step + pages.length) % pages.length;
      return;
    }
    if (!DIGIT_KEYS.has(key)) return;
    this.choose(id, Number(key), pages[this.menu.page]);
  }

  choose(id, d, page) {
    const done = () => this.clearLine();
    switch (id) {
      case 'mode1':
        if (d >= 1 && d <= 3) {
          this.mode = ['COMP', 'SD', 'REG'][d - 1];
          done();
        }
        return;
      case 'mode2':
        if (d >= 1 && d <= 3) {
          this.angle = ['D', 'R', 'G'][d - 1];
          done();
        }
        return;
      case 'mode3':
        if (d >= 1 && d <= 3) this.menu = { ...this.menu, id: ['fix', 'sci', 'norm'][d - 1], page: 0 };
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
      case 'mode4':
        if (d === 1) this.menu = { ...this.menu, id: 'disp', page: 0 };
        return;
      case 'disp':
        if (d === 1 || d === 2) {
          this.dc = d === 2;
          done();
        }
        return;
      case 'clrComp':
      case 'clrStat':
        return this.clear(d, id === 'clrStat');
      default: {
        // token-inserting menus (DRG▶, S-SUM, S-VAR)
        const tok = page.tokens && page.tokens[d - 1];
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
    this.upperFixed = msg;
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
    const view = { on: true, ind, upper: '', cursor: null, insert: this.ins, lower: null };
    switch (this.phase) {
      case 'edit':
        view.upper = tokensText(this.buf);
        view.cursor = tokensText(this.buf.slice(0, this.cur)).length;
        view.lower = formatLower(this.disp.value, this.disp, this.fmt);
        break;
      case 'result':
      case 'message':
        view.upper = this.upperFixed;
        view.lower = formatLower(this.disp.value, this.disp, this.fmt);
        break;
      case 'error':
        view.upper = `${this.error.type} ERROR`;
        break;
      case 'menu': {
        const page = this.menuPages()[this.menu.page];
        view.upper = page.text;
        view.lower = page.items.length ? menuLower(page) : null;
        view.more = this.menuPages().length > 1;
        break;
      }
    }
    return view;
  }
}
