import { Calculator } from './calculator.js';
import { LcdRenderer, viewText } from './display.js';
import { buildKeypad, KEYBOARD } from './keys.js';
import { easterEggPlaying, isEasterEgg, playEasterEgg, preloadEasterEgg, stopEasterEgg } from './easter.js';

function safeStorage() {
  try {
    const s = window.localStorage;
    const probe = '__sci82_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const calc = new Calculator({ storage: safeStorage() });
const canvas = document.getElementById('lcd');
const lcd = new LcdRenderer(canvas);
const live = document.getElementById('lcd-text');

let lastText = '';
function render() {
  const view = calc.view();
  lcd.render(view);
  const text = viewText(view);
  if (text !== lastText) {
    live.textContent = text;
    lastText = text;
  }
}

function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch {
    /* unsupported */
  }
}

let blinkTimer = null;
function restartBlink() {
  lcd.blink = true;
  clearInterval(blinkTimer);
  blinkTimer = setInterval(() => {
    lcd.blink = !lcd.blink;
    render();
  }, 500);
}

function press(id) {
  calc.press(id);
  lcd.follow();
  restartBlink();
  render();
  if (id === 'eq' && calc.phase === 'result' && isEasterEgg(calc.lastTokens)) {
    playEasterEgg({ calcEl: document.getElementById('calc'), lcdEl: canvas.parentElement });
  } else if (calc.phase === 'edit' && isEasterEgg(calc.buf)) {
    preloadEasterEgg(); // decode the clips while the finger moves to =, so the first sounds are on time
  }
}

buildKeypad(document.getElementById('keys'), (id) => {
  haptic();
  press(id);
});

// Tap the display to move the cursor there; drag it (touch or mouse) to scroll.
const DRAG_SLOP = 6; // px of movement before a press counts as a drag, not a tap
let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < DRAG_SLOP) return;
  drag.moved = true;
  // the content follows the finger
  lcd.scrollBy((drag.x - e.clientX) / lcd.pitch, (drag.y - e.clientY) / lcd.pitch);
  drag.x = e.clientX;
  drag.y = e.clientY;
  render();
});

function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return;
  const tap = !drag.moved && !cancelled;
  drag = null;
  if (!tap) return;
  haptic();
  calc.tap(lcd.hitTest(e.clientX, e.clientY));
  calc.save();
  lcd.follow();
  restartBlink();
  render();
}
canvas.addEventListener('pointerup', (e) => endDrag(e, false));
canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

// Mouse wheel / trackpad: vertical wheel scrolls up/down, or sideways when the
// input is only one line tall; shift+wheel and horizontal swipes scroll sideways.
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 30 : 1 / lcd.pitch; // → dots
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey || (lcd.range.y === 0 && dx === 0)) [dx, dy] = [dx + dy, 0];
    lcd.scrollBy(dx, dy);
    render();
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (easterEggPlaying()) {
    // the keypad is covered while the easter egg plays; Esc ends it early
    e.preventDefault();
    if (e.key === 'Escape') stopEasterEgg();
    return;
  }
  const k = KEYBOARD[e.key];
  if (!k) return;
  e.preventDefault();
  for (const id of [].concat(k)) press(id);
});

new ResizeObserver(() => {
  lcd.resize();
  render();
}).observe(canvas);

// Stop pinch-zoom / rubber-band scrolling so the page behaves like a device.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

render();
restartBlink();

if ('serviceWorker' in navigator) {
  // When an update is installed, the new worker takes over this page (skipWaiting +
  // clients.claim in sw.js). Reload once so the new files are used straight away
  // instead of on the next launch. Skipped on the very first install.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      // never cut the easter egg off halfway: wait for it to finish first
      const reload = () => (easterEggPlaying() ? setTimeout(reload, 250) : window.location.reload());
      reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support unavailable (e.g. file://) */
    });
  });
}
