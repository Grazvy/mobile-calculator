import { Calculator } from './calculator.js';
import { LcdRenderer, viewText } from './display.js';
import { buildKeypad, KEYBOARD } from './keys.js';

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
  restartBlink();
  render();
}

buildKeypad(document.getElementById('keys'), (id) => {
  haptic();
  press(id);
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support unavailable (e.g. file://) */
    });
  });
}
