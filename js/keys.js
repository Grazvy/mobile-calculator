// Key layout (two-line scientific calculator order) and touch handling.
// s = SHIFT label (gold), a = ALPHA label (red). Labels are static, trusted markup.

const K = (id, cap, s = '', a = '', cls = '') => ({ id, cap, s, a, cls });
const sup = (t) => `<sup>${t}</sup>`;

export const TOP_LEFT = [
  K('shift', 'SHIFT', '', '', 'k-mod k-shift'),
  K('alpha', 'ALPHA', '', '', 'k-mod k-alpha'),
  K('inv', 'x' + sup('−1'), 'x!'),
  K('ncr', '<i>n</i>C<i>r</i>', '<i>n</i>P<i>r</i>'),
];

export const TOP_RIGHT = [
  K('mode', 'MODE', 'CLR', '', 'k-mod'),
  K('on', 'ON', '', '', 'k-mod'),
  K('pol', 'Pol(', 'Rec('),
  K('cube', 'x' + sup('3'), sup('3') + '√'),
];

export const FN_ROWS = [
  [
    K('frac', 'a' + sup('b') + '/<sub>c</sub>', 'd/c'),
    K('sqrt', '√'),
    K('sq', 'x' + sup('2')),
    K('pow', '^', sup('x') + '√'),
    K('log', 'log', '10' + sup('x')),
    K('ln', 'ln', '<i>e</i>' + sup('x')),
  ],
  [
    K('neg', '(−)', '', 'A'),
    K('dms', '°′″', '←', 'B'),
    K('hyp', 'hyp', '', 'C'),
    K('sin', 'sin', 'sin' + sup('−1'), 'D'),
    K('cos', 'cos', 'cos' + sup('−1'), 'E'),
    K('tan', 'tan', 'tan' + sup('−1'), 'F'),
  ],
  [
    K('rcl', 'RCL', 'STO'),
    K('eng', 'ENG', '←'),
    K('lp', '('),
    K('rp', ')', '', 'X'),
    K('comma', ',', ';', 'Y'),
    K('mplus', 'M+', 'M−', 'M'),
  ],
];

export const MAIN_ROWS = [
  [K('7', '7'), K('8', '8'), K('9', '9'), K('del', 'DEL', 'INS', '', 'k-red'), K('ac', 'AC', 'OFF', '', 'k-red')],
  [K('4', '4'), K('5', '5'), K('6', '6'), K('mul', '×'), K('div', '÷')],
  [K('1', '1', 'S-SUM'), K('2', '2', 'S-VAR'), K('3', '3'), K('add', '+'), K('sub', '−')],
  [K('0', '0', 'Rnd'), K('dot', '•', 'Ran#'), K('exp', 'EXP', 'π'), K('ans', 'Ans', 'DRG▶'), K('eq', '=', '%')],
];

const REPEAT = new Set(['left', 'right', 'up', 'down', 'del']);
const REPEAT_DELAY = 450;
const REPEAT_RATE = 90;

function keyEl(k, extraCls) {
  const el = document.createElement('div');
  el.className = `key ${extraCls} ${k.cls}`.trim();
  el.dataset.key = k.id;
  el.innerHTML =
    `<div class="lbl"><span class="ls">${k.s}</span><span class="la">${k.a}</span></div>` +
    `<div class="cap"><span>${k.cap}</span></div>`;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', k.id);
  return el;
}

function pad() {
  const el = document.createElement('div');
  el.className = 'pad';
  el.innerHTML =
    '<div class="pad-ring">' +
    '<span class="tri up"></span><span class="tri down"></span>' +
    '<span class="tri left"></span><span class="tri right"></span>' +
    '<span class="pad-label">REPLAY</span></div>';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'cursor keys');
  return el;
}

/** Build the keypad into `root`; `onKey(id)` is called for every press (and auto-repeat). */
export function buildKeypad(root, onKey) {
  const top = document.createElement('div');
  top.className = 'block block-top';
  const tl = document.createElement('div');
  tl.className = 'top-side';
  TOP_LEFT.forEach((k) => tl.appendChild(keyEl(k, 'k-fn')));
  const tr = document.createElement('div');
  tr.className = 'top-side';
  TOP_RIGHT.forEach((k) => tr.appendChild(keyEl(k, 'k-fn')));
  const padEl = pad();
  top.append(tl, padEl, tr);

  const fn = document.createElement('div');
  fn.className = 'block block-fn';
  FN_ROWS.flat().forEach((k) => fn.appendChild(keyEl(k, 'k-fn')));

  const main = document.createElement('div');
  main.className = 'block block-main';
  MAIN_ROWS.flat().forEach((k) => main.appendChild(keyEl(k, 'k-num')));

  root.append(top, fn, main);

  // --- pointer handling ---
  const active = new Map(); // pointerId -> {el, timer}

  const release = (pid) => {
    const a = active.get(pid);
    if (!a) return;
    clearTimeout(a.timer);
    clearInterval(a.timer);
    a.el.classList.remove('pressed', 'p-up', 'p-down', 'p-left', 'p-right');
    active.delete(pid);
  };

  const padDirection = (e) => {
    const r = padEl.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  };

  root.addEventListener('pointerdown', (e) => {
    const keyNode = e.target.closest('.key');
    const padNode = e.target.closest('.pad');
    if (!keyNode && !padNode) return;
    e.preventDefault();
    const el = keyNode || padNode;
    const id = keyNode ? keyNode.dataset.key : padDirection(e);
    release(e.pointerId);
    el.classList.add(keyNode ? 'pressed' : `p-${id}`);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    onKey(id);
    const entry = { el, timer: null };
    if (REPEAT.has(id)) {
      entry.timer = setTimeout(() => {
        entry.timer = setInterval(() => onKey(id), REPEAT_RATE);
      }, REPEAT_DELAY);
    }
    active.set(e.pointerId, entry);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    root.addEventListener(type, (e) => release(e.pointerId));
  }
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Physical keyboard support (desktop testing / Bluetooth keyboards). */
export const KEYBOARD = {
  0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  '.': 'dot', ',': 'comma', '+': 'add', '-': 'sub', '*': 'mul', x: 'mul', '/': 'div',
  '^': 'pow', '(': 'lp', ')': 'rp', Enter: 'eq', '=': 'eq', Backspace: 'del',
  Delete: 'ac', Escape: 'ac', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up',
  ArrowDown: 'down', s: 'sin', c: 'cos', t: 'tan', l: 'log', n: 'ln', r: 'sqrt',
  e: 'exp', a: 'ans', m: 'mode',
  '!': ['shift', 'inv'], p: ['shift', 'exp'], '%': ['shift', 'eq'],
};
