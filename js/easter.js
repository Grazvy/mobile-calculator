// Easter egg: type 58005 and press = for a MLG montage over the calculator, as long as the
// dubstep clip (~6.6 s). Sounds are the user's own clips in assets/mlg/ (see the README there);
// missing clips are skipped. Nothing here touches the DOM until it is played, so tests can import it.

const CODE = '58005';
const CLIP_DIR = 'assets/mlg/';
export const DURATION = 6.6; // seconds: the length of dubstep.mp3
const FADE_AT = 6.2; // visuals start fading out
const AUDIO_FADE_AT = 6.3; // everything still playing fades to silence by DURATION
const LATE_LIMIT = 0.3; // a clip that is ready this late still plays, later ones are skipped
const TARGET_RMS = 0.2; // clips are levelled to this loudness (about -14 dBFS) before `vol`
const DUCK = 0.25; // the music drops to this while a voice line plays
const EDGE = 0.06; // fade at a cut, so clips never click

/** True for exactly 58005 (the calculation just run, or the line being typed). */
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
  { t: 0, clip: 'dubstep', vol: 0.6, kind: 'bed' },
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
  chip:
    '<svg viewBox="0 0 100 92"><path d="M50 4Q57 6 96 82Q50 94 4 82Q43 6 50 4Z" fill="#f59b1d" stroke="#c45f16" stroke-width="3"/>' +
    '<g fill="#d8460e"><circle cx="40" cy="40" r="3"/><circle cx="58" cy="52" r="2.5"/><circle cx="34" cy="66" r="3"/>' +
    '<circle cx="66" cy="72" r="2.5"/><circle cx="50" cy="26" r="2"/><circle cx="48" cy="62" r="2"/></g>' +
    '<g fill="#ffd27a"><circle cx="54" cy="36" r="2"/><circle cx="26" cy="76" r="2"/><circle cx="74" cy="64" r="1.8"/></g></svg>',
  can:
    '<svg viewBox="0 0 60 112"><rect x="6" y="10" width="48" height="94" rx="7" fill="#1d8b3c"/>' +
    '<rect x="6" y="10" width="48" height="94" rx="7" fill="none" stroke="#0d5221" stroke-width="2"/>' +
    '<ellipse cx="30" cy="10" rx="22" ry="6" fill="#c9ccd1" stroke="#7d8187" stroke-width="2"/>' +
    '<ellipse cx="30" cy="104" rx="22" ry="5" fill="#9ea2a8"/>' +
    '<path d="M6 44Q30 34 54 44V68Q30 58 6 68Z" fill="#c8102e"/>' +
    '<text x="30" y="61" font-family="Impact,Arial Black,sans-serif" font-size="17" fill="#fff" text-anchor="middle">DEW</text>' +
    '<rect x="13" y="18" width="5" height="78" rx="2.5" fill="#fff" opacity=".28"/></svg>',
  illuminati:
    '<svg viewBox="0 0 100 90"><path d="M50 4L96 86H4Z" fill="#2fbf4a" stroke="#0b5d1f" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M28 58Q50 36 72 58Q50 78 28 58Z" fill="#fff" stroke="#000" stroke-width="3"/>' +
    '<circle cx="50" cy="58" r="8" fill="#000"/><circle cx="53" cy="55" r="2.5" fill="#fff"/></svg>',
  shades:
    '<svg viewBox="0 0 16 5" shape-rendering="crispEdges"><g fill="#000"><rect width="16" height="1"/>' +
    '<rect x="1" y="1" width="6" height="2"/><rect x="2" y="3" width="4" height="1"/>' +
    '<rect x="9" y="1" width="6" height="2"/><rect x="10" y="3" width="4" height="1"/></g>' +
    '<g fill="#fff"><rect x="2" y="1" width="1" height="1"/><rect x="3" y="2" width="1" height="1"/>' +
    '<rect x="10" y="1" width="1" height="1"/><rect x="11" y="2" width="1" height="1"/></g></svg>',
};
/** Start time of the n-th SOUNDS entry for a clip, so the visuals land on their sounds. */
const cue = (name, n = 0) => SOUNDS.filter((e) => e.clip === name)[n].t;

const EMOJI = ['🐸', '🐸', '💯', '👌', '🔥'];
const FLYERS = ['chip', 'can', 'frog', 'chip', 'can', 'frog', 'emoji'];

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
  const level = entry.vol * info.gain;
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

/** Start fetching and decoding the clips (call once 58005 has been typed, before =). */
export function preloadEasterEgg() {
  if (!audioContext()) return;
  for (const s of SOUNDS) clip(s.clip);
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

/** True while the montage is on screen. */
export function easterEggPlaying() {
  return show !== null;
}

/** End the montage now (tap, Esc) or when it is over. */
export function stopEasterEgg() {
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

/** Start the montage. Must be called from inside the "=" key handler so audio may start. */
export function playEasterEgg({ calcEl, lcdEl }) {
  if (show) return;
  const overlay = document.createElement('div');
  overlay.className = 'mlg-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  const s = { overlay, calcEl, timers: [], sources: [], start: performance.now() };
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

  // sound: every clip on the audio clock, relative to the moment "=" was pressed
  const ac = audioContext();
  if (ac) {
    ac.resume().catch(() => {});
    const ready = running(ac);
    for (const entry of SOUNDS) {
      Promise.all([clip(entry.clip), ready]).then(([info]) => {
        if (!info || show !== s) return;
        const src = scheduleClip(ac, master, entry, info, ac.currentTime - elapsed());
        if (src) s.sources.push(src);
      });
    }
  }

  // 0.0: tint, MLG stamp, airhorn; the scope sweeps onto the display
  calcEl.classList.add('mlg-tint');
  text('MLG', W / 2, H * 0.16, -8, 0.5);
  at(cue('damn-son'), () => text('DAMN SON', W / 2, H * 0.78, 7, 0.9));
  const D = Math.min(r.width * 0.85, Math.min(W, H) * 0.7);
  const side = Math.random() < 0.5 ? -1 : 1;
  const scope = add('mlg-scope', '', {
    left: `${cx}px`, top: `${cy}px`, '--d': `${D}px`,
    '--sx': `${side * W * 0.45}px`, '--sy': `${H * rand(0.2, 0.35)}px`, '--sweep': `${cue('sniper')}s`,
  });

  // the shot, then the hitmarker
  at(cue('sniper'), () => {
    scope.classList.add('mlg-recoil');
    at(cue('sniper') + 0.3, () => scope.remove());
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

  // 1.0-5.9: things flying across the screen
  for (let i = 0; i < 20; i++) {
    at(1.0 + i * 0.24, () => {
      const kind = FLYERS[i % FLYERS.length];
      const fromLeft = Math.random() < 0.5;
      const size = rand(14, 24);
      const px = (size * Math.min(W, H)) / 100;
      const html =
        kind === 'frog' ? '🐸' : kind === 'emoji' ? EMOJI[(Math.random() * EMOJI.length) | 0] : SVG[kind];
      const x0 = fromLeft ? -px : W;
      const x1 = fromLeft ? W : -px;
      const y0 = rand(H * 0.3, H);
      const y1 = rand(H * 0.2, H);
      const dur = rand(1.2, 1.9);
      add(`mlg-fly mlg-${kind === 'emoji' ? 'frog' : kind}`, html, {
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
  at(2.6, () => add('mlg-illu', SVG.illuminati));
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
