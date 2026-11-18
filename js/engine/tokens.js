// Token ids stored in the input buffer, their dot-matrix text, and their syntactic class.

// Single-character glyphs used by the dot-matrix font (see js/font.js).
export const CH = {
  FRAC: '⌟', // ⌟ fraction separator
  NEG: '', // short "(-)" minus
  XBAR: '',
  YBAR: '',
  XHAT: '',
  YHAT: '',
  INV: '⁻', // ⁻ (drawn as "⁻¹")
  SUPX: 'ˣ', // ˣ
};

export const TOKEN_TEXT = {
  0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  '.': '.', EE: 'E',
  add: '+', sub: '-', mul: '×', div: '÷', pow: '^', xrt: CH.SUPX + '√',
  npr: 'P', ncr: 'C', frac: CH.FRAC,
  neg: CH.NEG, sqrt: '√', cbrt: '³√', log: 'log ', ln: 'ln ', tenx: '10^', ex: 'e^',
  sin: 'sin ', cos: 'cos ', tan: 'tan ',
  asin: 'sin' + CH.INV + ' ', acos: 'cos' + CH.INV + ' ', atan: 'tan' + CH.INV + ' ',
  sinh: 'sinh ', cosh: 'cosh ', tanh: 'tanh ',
  asinh: 'sinh' + CH.INV + ' ', acosh: 'cosh' + CH.INV + ' ', atanh: 'tanh' + CH.INV + ' ',
  rnd: 'Rnd ',
  sq: '²', cube: '³', inv: CH.INV, fact: '!', pct: '%', dms: '°',
  udeg: '°', urad: 'r', ugra: 'g', xhat: CH.XHAT, yhat: CH.YHAT,
  pi: 'π', ran: 'Ran#', ans: 'Ans',
  vA: 'A', vB: 'B', vC: 'C', vD: 'D', vE: 'E', vF: 'F', vX: 'X', vY: 'Y', vM: 'M',
  sx2: 'Σx²', sx: 'Σx', sn: 'n', mx: CH.XBAR, sxn: 'xσn', sxn1: 'xσn-1',
  sy2: 'Σy²', sy: 'Σy', sxy: 'Σxy', my: CH.YBAR, syn: 'yσn', syn1: 'yσn-1',
  ra: 'A', rb: 'B', rr: 'r',
  lp: '(', rp: ')', comma: ',', semi: ';', pol: 'Pol(', rec: 'Rec(',
};

export const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

export const BINARY = new Set(['add', 'sub', 'mul', 'div', 'pow', 'xrt', 'npr', 'ncr']);

export const PREFIX = new Set([
  'neg', 'sqrt', 'cbrt', 'log', 'ln', 'tenx', 'ex',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'rnd',
]);

export const POSTFIX = new Set([
  'sq', 'cube', 'inv', 'fact', 'pct', 'dms', 'udeg', 'urad', 'ugra', 'xhat', 'yhat',
]);

export const STAT_ATOMS = new Set([
  'sx2', 'sx', 'sn', 'mx', 'sxn', 'sxn1', 'sy2', 'sy', 'sxy', 'my', 'syn', 'syn1', 'ra', 'rb', 'rr',
]);

export const ATOM = new Set([
  'pi', 'ran', 'ans', 'vA', 'vB', 'vC', 'vD', 'vE', 'vF', 'vX', 'vY', 'vM', ...STAT_ATOMS,
]);

export const tokenText = (t) => TOKEN_TEXT[t] ?? '?';
export const tokensText = (tokens) => tokens.map(tokenText).join('');

export class CalcError extends Error {
  /** @param {'Syntax'|'Math'} type  @param {number} pos token index of the problem */
  constructor(type, pos) {
    super(`${type} ERROR`);
    this.type = type;
    this.pos = pos;
  }
}
