// Easter egg: type 58008 and press = for a MLG montage over the calculator, as long as the
// dubstep clip (~6.6 s). Sounds are the user's own clips in assets/mlg/ (see the README there);
// missing clips are skipped. Nothing here touches the DOM until it is played, so tests can import it.

const CODE = '58008';
const CLIP_DIR = 'assets/mlg/';
export const DURATION = 6.6; // seconds: the length of dubstep.mp3
const FADE_AT = 6.2; // visuals start fading out
const AUDIO_FADE_AT = 6.3; // everything still playing fades to silence by DURATION
const LATE_LIMIT = 0.3; // a clip that is ready this late still plays, later ones are skipped
const READY_TIMEOUT = 15000; // ms: start anyway if the clips / pictures / audio are not ready by then
const LEAD = 0.1; // s: audio is scheduled this far ahead so every clip starts exactly on time
const TARGET_RMS = 0.2; // clips are levelled to this loudness (about -14 dBFS) before `vol`
const DUCK = 0.45; // the music drops to this while a voice line plays (about -7 dB)
const FX_LEVEL = 0.7; // voices and effects sit about 3 dB lower than the music's levelled loudness
const EDGE = 0.06; // fade at a cut, so clips never click

/** True for exactly 58008 (the calculation just run, or the line being typed). */
export function isEasterEgg(tokens) {
  return Array.isArray(tokens) && tokens.join('') === CODE;
}

/**
 * The soundtrack. t = start (s), vol = level after levelling, len = how much of the clip to play
 * (silence at the start of each file is skipped automatically). kind: 'bed' is the music under
 * everything, 'voice' lines duck the music, 'sfx' are effects.
 * Voice lines never overlap each other; effects sit in the pauses of the voices.
 */
export const SOUNDS = [
  { t: 0, clip: 'dubstep', vol: 1.25, kind: 'bed' },
  { t: 0, clip: 'airhorn', vol: 1, len: 0.45, kind: 'sfx' },
  { t: 0.42, clip: 'damn-son', vol: 1, len: 2.12, kind: 'voice' },
  { t: 0.72, clip: 'sniper', vol: 1, len: 0.25, kind: 'sfx' }, // the crack fills the pause after "damn son"
  { t: 0.84, clip: 'hitmarker', vol: 0.9, kind: 'sfx' },
  { t: 2.53, clip: 'hitmarker', vol: 0.9, kind: 'sfx' }, // three ticks between the voice lines
  { t: 2.65, clip: 'hitmarker', vol: 0.9, kind: 'sfx' },
  { t: 2.77, clip: 'hitmarker', vol: 0.9, kind: 'sfx' },
  { t: 2.84, clip: 'triple', vol: 1, len: 1.55, kind: 'voice' }, // cut in the pause after the phrase
  { t: 4.4, clip: 'wow', vol: 1, len: 0.62, kind: 'voice' },
  { t: 5.03, clip: 'mom-camera', vol: 0.85, len: 1.57, kind: 'voice' },
];

// ---------- artwork (static, trusted markup) ----------

const HIT_PATH = 'M4 4L15 15M36 4L25 15M4 36L15 25M36 36L25 25';
const SVG = {
  hit:
    `<svg viewBox="0 0 40 40"><path d="${HIT_PATH}" stroke="#000" stroke-width="7" stroke-linecap="square"/>` +
    `<path d="${HIT_PATH}" stroke="#fff" stroke-width="3.5" stroke-linecap="square"/></svg>`,
  shades:
    '<svg viewBox="0 0 16 5" shape-rendering="crispEdges"><g fill="#000"><rect width="16" height="1"/>' +
    '<rect x="1" y="1" width="6" height="2"/><rect x="2" y="3" width="4" height="1"/>' +
    '<rect x="9" y="1" width="6" height="2"/><rect x="10" y="3" width="4" height="1"/></g>' +
    '<g fill="#fff"><rect x="2" y="1" width="1" height="1"/><rect x="3" y="2" width="1" height="1"/>' +
    '<rect x="10" y="1" width="1" height="1"/><rect x="11" y="2" width="1" height="1"/></g></svg>',
};
/** Start time of the n-th SOUNDS entry for a clip, so the visuals land on their sounds. */
const cue = (name, n = 0) => SOUNDS.filter((e) => e.clip === name)[n].t;

// Pictures from assets/mlg/. Flyers are thrown across the screen; w = width range in vmin
// (tall pictures get a narrower range so they all look about the same size).
const FLYERS = {
  'd-chip': { file: 'd-chip.png', w: [13, 19] },
  'd-package': { file: 'd-package.png', w: [14, 18] },
  'mtn-d': { file: 'mtn-d.png', w: [10, 13] },
  illum: { file: 'illum.png', w: [15, 21] },
};
// order they are thrown in: mostly chips
const THROWS = ['d-chip', 'mtn-d', 'd-package', 'd-chip', 'illum', 'mtn-d', 'd-chip', 'd-package', 'illum'];
// dancers on the sides of the screen
const DANCERS = { left: 's-dog.gif', right: 'mlg-frog.gif' };
const IMAGES = [...Object.values(FLYERS).map((f) => f.file), ...Object.values(DANCERS)];

// ---------- audio ----------

/**
 * Measure a decoded clip: where the sound starts (skip) and the gain that brings its loud part
 * to TARGET_RMS without pushing the peak past full scale.
 */
export function measureClip(buf) {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  for (const d of chans) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak === 0) return { buf, skip: 0, gain: 0 };
  let first = 0;
  search: for (; first < n; first++) for (const d of chans) if (Math.abs(d[first]) > peak * 0.05) break search;
  // loudness of the loud part: mean power of 1024-sample frames within 20 dB of the loudest one
  const frames = [];
  for (let i = 0; i < n; i += 1024) {
    let p = 0;
    const end = Math.min(n, i + 1024);
    for (const d of chans) for (let k = i; k < end; k++) p += d[k] * d[k];
    frames.push(p / ((end - i) * chans.length));
  }
  const top = Math.max(...frames);
  const loud = frames.filter((p) => p >= top / 100);
  const rms = Math.sqrt(loud.reduce((a, b) => a + b, 0) / loud.length);
  return {
    buf,
    skip: Math.max(0, first / buf.sampleRate - 0.01),
    gain: Math.min(TARGET_RMS / rms, 0.98 / peak),
  };
}

/** Output chain: everything goes through a limiter so overlapping clips never clip. */
export function masterBus(ac) {
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(ac.destination);
  return limiter;
}

/** Gain over time (montage seconds) for one entry: cut fades, music ducking, final fade. */
function envelope(entry, level, playLen) {
  const start = entry.t;
  const end = Math.min(start + playLen, DURATION);
  let pts = [[start, level]];
  if (entry.kind === 'bed') {
    for (const v of SOUNDS) {
      if (v.kind !== 'voice') continue;
      pts.push([v.t - 0.05, level], [v.t, level * DUCK], [v.t + v.len, level * DUCK], [v.t + v.len + 0.15, level]);
    }
  }
  const valueAt = (t) => {
    let v = level;
    for (let i = 0; i < pts.length; i++) {
      const [t1, v1] = pts[i];
      if (t1 > t) {
        const [t0, v0] = pts[i - 1] || pts[i];
        return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      }
      v = v1;
    }
    return v;
  };
  const fade = Math.max(start, Math.min(end - EDGE, AUDIO_FADE_AT));
  const atFade = valueAt(fade);
  pts = pts.filter(([t]) => t < fade);
  pts.push([fade, atFade], [end, 0]);
  return { pts, end };
}

/**
 * Play one entry. `zero` is the audio-clock time of montage second 0; a clip that is ready late
 * starts right away (the music seeks to stay in time) or is skipped when it is too late.
 */
export function scheduleClip(ac, dest, entry, info, zero) {
  const now = ac.currentTime;
  const late = now - (zero + entry.t);
  const bed = entry.kind === 'bed';
  if (late > LATE_LIMIT && !bed) return null;
  const available = info.buf.duration - info.skip;
  const playLen = Math.min(entry.len ?? available, available);
  if (late >= playLen) return null;
  const level = entry.vol * info.gain * (bed ? 1 : FX_LEVEL);
  const { pts, end } = envelope(entry, level, playLen);
  const when = Math.max(now, zero + entry.t);
  const seek = bed && late > 0 ? late : 0;
  const at = (t) => Math.max(when, zero + t + (bed ? 0 : Math.max(0, late)));

  const src = ac.createBufferSource();
  src.buffer = info.buf;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(pts[0][1], when);
  for (const [t, v] of pts.slice(1)) gain.gain.linearRampToValueAtTime(v, at(t));
  src.connect(gain).connect(dest);
  src.start(when, info.skip + seek);
  src.stop(at(end) + 0.02);
  return src;
}

let ctx = null;
let master = null;
const clips = new Map(); // clip name -> Promise<measured clip | null>
const images = new Map(); // file -> preloaded Image (keeps it in the memory cache)

function audioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = masterBus(ctx);
  }
  return ctx;
}

function clip(name) {
  if (!clips.has(name)) {
    const p = fetch(CLIP_DIR + name + '.mp3')
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((data) => (data ? ctx.decodeAudioData(data) : null))
      .then((buf) => (buf ? measureClip(buf) : null))
      .catch(() => null);
    clips.set(name, p);
  }
  return clips.get(name);
}

/** Start fetching and decoding the clips (call once 58008 has been typed, before =). */
export function preloadEasterEgg() {
  for (const f of IMAGES) {
    if (images.has(f)) continue;
    const img = new Image();
    img.src = CLIP_DIR + f;
    images.set(f, img);
  }
  if (!audioContext()) return;
  for (const s of SOUNDS) clip(s.clip);
}

/** Resolves when a preloaded picture can be drawn (or has failed: it is skipped then). */
function imageReady(img) {
  if (img.decode) return img.decode().catch(() => {});
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.onload = img.onerror = () => resolve();
  });
}

/** Resolves once the context is actually running (mobile browsers may hold it until the finger lifts). */
function running(ac) {
  if (ac.state === 'running') return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (ac.state !== 'running') return;
      ac.removeEventListener('statechange', check);
      resolve();
    };
    ac.addEventListener('statechange', check);
  });
}

// ---------- the show ----------

let show = null;
let pending = null; // "=" was pressed, waiting for everything to be loaded

/** True while the montage is on screen or about to start. */
export function easterEggPlaying() {
  return show !== null || pending !== null;
}

/** End the montage now (tap, Esc) or when it is over. */
export function stopEasterEgg() {
  if (pending) {
    pending.cancel();
    pending = null;
  }
  if (!show) return;
  const s = show;
  show = null;
  for (const t of s.timers) clearTimeout(t);
  for (const src of s.sources) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  s.overlay.remove();
  s.calcEl.classList.remove('mlg-tint');
  document.body.classList.remove('mlg-shake');
}

/**
 * Start the montage. Must be called from inside the "=" key handler so audio may start.
 * Nothing is shown until every clip is decoded, every picture loaded and the audio output is
 * running, so the first run looks and sounds exactly like later ones.
 */
export function playEasterEgg(opts) {
  if (show || pending) return;
  const ac = audioContext();
  const wake = () => ac && ac.resume().catch(() => {});
  wake();
  preloadEasterEgg();
  // phones only allow audio to start on the finger lifting, not on the touch itself
  const gestures = ['pointerup', 'touchend', 'keyup', 'click'];
  for (const g of gestures) window.addEventListener(g, wake, true);
  let timer;
  const p = {
    cancel() {
      clearTimeout(timer);
      for (const g of gestures) window.removeEventListener(g, wake, true);
    },
  };
  pending = p;
  const ready = Promise.all([
    ...SOUNDS.map((e) => clip(e.clip)),
    ...IMAGES.map((f) => imageReady(images.get(f))),
    ac ? running(ac) : null,
  ]);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, READY_TIMEOUT);
  });
  Promise.race([ready, timeout]).then(() => {
    if (pending !== p) return; // cancelled
    p.cancel();
    pending = null;
    runShow(opts, ac);
  });
}

function runShow({ calcEl, lcdEl }, ac) {
  const overlay = document.createElement('div');
  overlay.className = 'mlg-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  // sound: everything is decoded, so schedule it all now on the audio clock, a moment ahead
  const sources = [];
  let delay = 0; // s until montage second 0 is heard
  if (ac && master) {
    const zero = ac.currentTime + LEAD;
    for (const entry of SOUNDS) {
      clip(entry.clip).then((info) => {
        if (!info || show !== s) return;
        const src = scheduleClip(ac, master, entry, info, zero);
        if (src) s.sources.push(src);
      });
    }
    delay = LEAD + (ac.outputLatency || ac.baseLatency || 0);
  }

  // visuals: montage second 0 is when the first sound is heard
  const s = { overlay, calcEl, timers: [], sources, start: performance.now() + delay * 1000 };
  show = s;
  const elapsed = () => (performance.now() - s.start) / 1000;
  const at = (t, fn) => s.timers.push(setTimeout(() => show === s && fn(), Math.max(0, t * 1000 - (performance.now() - s.start))));

  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stopEasterEgg();
  });

  const r = lcdEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const rand = (a, b) => a + Math.random() * (b - a);

  const add = (cls, html = '', vars = {}, life = 0) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    overlay.appendChild(el);
    if (life) at(elapsed() + life, () => el.remove());
    return el;
  };
  // long captions shrink so they stay inside the screen (Impact caps are about 0.55em wide)
  const text = (msg, x, y, rot = rand(-14, 14), life = 1.1) => {
    const size = Math.min((Math.min(W, H) * 11) / 100, (W * 0.88) / (msg.length * 0.55));
    add('mlg-text', '', { left: `${x}px`, top: `${y}px`, '--r': `${rot}deg`, 'font-size': `${size}px` }, life).append(msg);
  };
  const hit = (x, y, size = 14) =>
    add('mlg-hit', SVG.hit, { left: `${x}px`, top: `${y}px`, '--s': `${size}vmin` }, 0.45);
  const shake = () => {
    document.body.classList.remove('mlg-shake');
    void document.body.offsetWidth; // restart the animation
    document.body.classList.add('mlg-shake');
  };
  const flare = (x, y) => add('mlg-flare', '', { left: `${x}px`, top: `${y}px` }, 0.7);
  /** An element holding one of the pictures; it removes itself if the file is missing. */
  const picture = (cls, file, vars, life) => {
    const el = add(cls, '', vars, life);
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.onerror = () => el.remove();
    img.src = CLIP_DIR + file;
    el.appendChild(img);
    return el;
  };

  // 0.0: tint, MLG stamp, airhorn; the scope sweeps onto the display
  const D = Math.min(r.width * 0.85, Math.min(W, H) * 0.7);
  const side = Math.random() < 0.5 ? -1 : 1;
  let scope = null;
  at(0, () => {
    calcEl.classList.add('mlg-tint');
    text('MLG', W / 2, H * 0.16, -8, 0.5);
    scope = add('mlg-scope', '', {
      left: `${cx}px`, top: `${cy}px`, '--d': `${D}px`,
      '--sx': `${side * W * 0.45}px`, '--sy': `${H * rand(0.2, 0.35)}px`, '--sweep': `${cue('sniper')}s`,
    });
  });
  at(cue('damn-son'), () => text('DAMN SON', W / 2, H * 0.78, 7, 0.9));

  // the shot, then the hitmarker
  at(cue('sniper'), () => {
    scope?.classList.add('mlg-recoil');
    at(cue('sniper') + 0.3, () => scope?.remove());
    add('mlg-flash', '', {}, 0.4);
    shake();
    flare(cx, cy);
    try {
      if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
    } catch {
      /* unsupported */
    }
  });
  at(cue('hitmarker'), () => {
    hit(cx, cy, 22);
    text('HEADSHOT', W / 2, r.bottom + H * 0.08, -10, 1.1);
  });
  at(cue('hitmarker') + 0.4, () => text('360 NO SCOPE', W / 2, H * 0.62, 8, 1.2));

  // dancers slide in on the sides after the shot and stay until the end
  at(cue('hitmarker') + 0.15, () => {
    for (const [edge, file] of Object.entries(DANCERS)) picture(`mlg-dancer mlg-${edge}`, file, {});
  });

  // 1.0-5.9: things thrown across the screen
  for (let i = 0; i < 20; i++) {
    at(1.0 + i * 0.24, () => {
      const kind = FLYERS[THROWS[i % THROWS.length]];
      const fromLeft = Math.random() < 0.5;
      const size = rand(...kind.w);
      const px = (size * 2 * Math.min(W, H)) / 100; // tall pictures: clear the edge fully
      const x0 = fromLeft ? -px : W + px / 2;
      const x1 = fromLeft ? W + px / 2 : -px;
      const y0 = rand(H * 0.3, H);
      const y1 = rand(H * 0.2, H);
      const dur = rand(1.2, 1.9);
      picture('mlg-fly', kind.file, {
        '--s': `${size}vmin`, '--d': `${dur}s`,
        '--x0': `${x0}px`, '--y0': `${y0}px`,
        '--xm': `${(x0 + x1) / 2}px`, '--ym': `${Math.min(y0, y1) - rand(H * 0.2, H * 0.4)}px`,
        '--x1': `${x1}px`, '--y1': `${y1}px`,
        '--r': `${(fromLeft ? 1 : -1) * rand(360, 1080)}deg`,
      }, dur + 0.05);
    });
  }
  for (const t of [1.9, 3.7, 4.7, 5.6]) {
    at(t, () => text('+100', rand(W * 0.2, W * 0.8), rand(H * 0.25, H * 0.8), rand(-20, 20), 0.8));
  }

  // triple
  for (const k of [0, 1, 2]) at(cue('hitmarker', k + 1), () => hit(cx + (k - 1) * r.width * 0.25, cy + rand(-10, 10), 13));
  at(cue('triple'), () => {
    text('OH BABY A TRIPLE', W / 2, H * 0.42, -5, 1.4);
    shake();
  });
  at(3.3, () => flare(rand(W * 0.2, W * 0.8), rand(H * 0.2, H * 0.6)));

  // wow, deal with it
  at(cue('wow'), () => {
    add('mlg-shades', SVG.shades, { left: `${cx}px`, top: `${cy}px`, '--w': `${r.width * 0.55}px` });
    text('WOW', W / 2, H * 0.3, 6, 0.9);
  });

  // mom get the camera
  at(cue('mom-camera'), () => {
    text('MOM GET THE CAMERA!', W / 2, H * 0.66, -6, 1.3);
    shake();
    flare(rand(W * 0.2, W * 0.8), rand(H * 0.4, H * 0.8));
    hit(rand(W * 0.2, W * 0.8), rand(H * 0.3, H * 0.7), 16);
  });

  // fade out and clean up
  at(FADE_AT, () => overlay.classList.add('mlg-out'));
  at(DURATION, stopEasterEgg);
}
