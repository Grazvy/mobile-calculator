# Development

Plain HTML/CSS/JS with no build step and no dependencies.

## Develop

```sh
npm test          # engine, layout and key-sequence tests (node --test, no install needed)
npm run serve     # http://localhost:8000
npm run icons     # regenerate icons/ (only if you change the icon design)
```

On a desktop you can type on the keyboard too: digits, `+ - * / ^ ( ) ,`, `f` for a fraction, `d` for S⇔D, Enter for `=`, Backspace for DEL, Esc for AC, and the arrow keys. Clicking the display moves the cursor.

## Deploy to Netlify

Either:

- **Drag and drop:** open https://app.netlify.com/drop and drop this folder onto it, or
- **Git:** push the folder to a repository and choose "Import from Git" in Netlify. `netlify.toml` already sets the publish directory to `.` with no build command.

## Releasing an update

Bump `VERSION` in [sw.js](../sw.js) (for example `fx85-v11`) whenever you change any file, or phones keep the old cached copy. If you add a new file, also add it to the `ASSETS` list in `sw.js`.

The service worker serves files from its cache first. After a deploy, an installed app opens on the old build, installs the new worker in the background, and then reloads itself once into the new build (the `controllerchange` handler in [js/app.js](../js/app.js)). Builds older than `sc82-v4` lack that handler, so phones still on them need one extra restart to pick up the update.

While developing, the cache gets in the way. Use a private window, or tick "Bypass for network" under DevTools → Application → Service workers.

## Keypad

The order follows the natural-display school calculators (fx-85GT PLUS style). Gold labels need SHIFT first, red labels need ALPHA first.

```
SHIFT     ALPHA      [ REPLAY ]       MODE (SETUP)   ON
Abs       Pol (Rec)  [   pad  ]       x⁻¹ (x!)       log□□
□/□ (□□/□)  √□ (∛□)  x² (x³)  x^□ (ˣ√□)  log (10^□)  ln (e^□)
(−) [A]   °′″ (←) [B]  hyp [C]  sin (sin⁻¹) [D]  cos (cos⁻¹) [E]  tan (tan⁻¹) [F]
RCL (STO) ENG (←)    ( (%)    ) (,) [X]  S⇔D (ab/c⇔d/c) [Y]  M+ (M−) [M]
7   8   9 (CLR)   DEL (INS)   AC (OFF)
4   5   6         × (nPr)     ÷ (nCr)
1 (S-SUM)  2 (S-VAR)  3   +   −
0 (Rnd)  . (Ran#)  ×10ˣ (π) [e]  Ans (DRG▶)  =
```

MODE picks COMP, SD or REG. SHIFT MODE (SETUP) sets the angle unit, Fix, Sci or Norm, and, on its second page (▼), ab/c or d/c results. SHIFT 9 (CLR) clears memory, modes or everything.

## Features

- **Natural display:** the whole LCD is one dot matrix. Unlit dots stay faintly visible, and all dots share one size, so the gaps between them form a fine grid that runs through the text as well. Input is laid out like a textbook: stacked fractions, √ with an overbar, raised exponents, a lowered log base, and |Abs| bars. Exponents (including x², x⁻¹ and the ×10 of results), the log base and root indices use a smaller 3×5 font, as do their empty boxes and the cursor inside them. Fractions stay full size. Empty template slots show as solid boxes. Brackets grow as tall as what they enclose. The input starts top-left and uses the whole screen as it grows taller; once it no longer fits, it follows the cursor (arrows show which way there is more). You can also scroll it by hand with the mouse wheel or by dragging (touch or mouse). The view stays where you left it until the next key press or tap. Tapping the display moves the cursor. The result appears bottom-right: decimals, `×10` with a raised exponent, stacked fractions or `2°30′36″`.
- **Templates:** □/□, □□/□, √□, ∛□, x^□, ˣ√□, 10^□, e^□, Abs and log□□. A number typed just before □/□ or ˣ√□ becomes the numerator (or index), so `1 □/□ 2` still gives ½. □/□ right after a result divides Ans. x², x³ and x⁻¹ insert an x^□ power with the exponent already filled in (2, 3 or −1), so you can move into it and change the number. x^, x², x³, x⁻¹ and x! with no value before them add an empty base box (□^□, □²), which counts as one bracketed value.
- **Editing:** insert by default (SHIFT DEL toggles overwrite). ◀▶ step through every slot and wrap around the ends of the line. ▲▼ move between numerator and denominator (or base and exponent). Tapping the display puts the cursor at that spot, and tapping a result re-opens it for editing. DEL on a template's edge removes it but keeps its contents; DEL in an empty base box removes the whole □² (or □^□, □!). Two cursor positions drawn at the same spot (just before a box and just inside it) count as one: ◀▶ always visibly move, and typing goes into the box. A base box holding a single value turns into plain input once the cursor leaves it, so 3² behaves exactly like typing 3 then x².
- **COMP:** + − × ÷, powers and roots, x² x³ x⁻¹ x!, log/ln/log base/10ˣ/eˣ, Abs, trig, inverse trig and hyperbolic trig, nPr/nCr, Pol(/Rec(, %, Ran#, Rnd, π, e
- **Order of operations** follows the natural-display rules, including implied multiplication (`2π`, `2sin(30)`). sin, cos, tan (with inverses and hyperbolics), log, ln and Rnd are entered with their opening bracket (`sin(`), and the bracket belongs to the function, so `sin(30)²` is (sin 30)². A missing `)` at the end is closed automatically. Each template counts as one bracketed value.
- **Exact fractions**, with S⇔D switching a result between fraction and decimal (SHIFT S⇔D: mixed or improper). Also degrees-minutes-seconds with °′″ and ENG notation.
- **Angle units** Deg/Rad/Gra and the DRG▶ conversion
- **Display formats** Fix 0–9, Sci 0–9, Norm 1/2
- **Memory:** Ans, M (M+/M−), and A–F, X, Y via STO/RCL/ALPHA. Memory and settings are kept between visits.
- **Replay:** ▲▼ to step through earlier calculations and ◀▶ to edit them; errors jump the cursor to the problem
- **SD statistics** (data with frequencies; Σx², Σx, n, x̄, xσn, xσn−1) and **REG linear regression** (A, B, r, x̂, ŷ). Enter data with M+: `x` or `x,freq` in SD, and `x,y` or `x,y,freq` in REG (`,` is SHIFT `)`).

Only linear regression is supported in REG mode (no Log/Exp/Pwr/Inv/Quad).

## Easter egg

Typing `58005` and pressing `=` plays a MLG montage over the calculator (about 6.6 s, the length of the dubstep clip): a sniper scope, hitmarkers, flying chips, cans and frogs, and meme text. Tap the screen or press Esc to end it early. The sounds are your own MP3 clips in `assets/mlg/`, and [assets/mlg/README.md](../assets/mlg/README.md) lists the expected file names and format. Missing clips are skipped, silence at the start of a clip is trimmed, and clip loudness is levelled automatically. The timing of each clip is the `SOUNDS` table in `js/easter.js`, and the visuals take their cue times from it. With reduced motion turned on, the shake, flashes and spinning are dropped.

## Code layout

```
index.html, css/style.css      page shell and styling
js/app.js                      wiring: keypad → calculator → LCD, service worker registration
js/keys.js                     key layout and touch handling
js/calculator.js               calculator state machine (modes, cursor, memory, replay, stats)
js/layout.js                   natural-display layout: tokens → dot-grid drawing ops + cursor positions
js/display.js, js/font.js      canvas LCD: indicator row + one 72-dot-wide matrix (5×7 font); tap hit-testing
js/easter.js                   58005 = easter egg (MLG montage overlay); clips in assets/mlg/
js/engine/                     lexer, parser, evaluator, exact fractions, number formatting, stats
sw.js, manifest.webmanifest    offline cache and installable-app metadata
tests/                         engine, layout and key-sequence tests
tools/make-icons.mjs           icon generator
```

## Natural-display input model

The input stays a flat token array (`Calculator.buf`) with the cursor as a gap index (`cur`). Templates are stored as marker tokens: `start slot (tSep slot)* tEnd`, with the starts `tFrac`, `tMixed`, `tSqrt`, `tCbrt`, `tRoot`, `tPow`, `tTenx`, `tEx`, `tAbs`, `tLogb` and `tBase` (the empty base box) (see `SLOTS` in [js/engine/tokens.js](../js/engine/tokens.js)). Every gap is a distinct position on screen, so ◀▶ move one gap at a time. The lexer expands markers into bracketed plain lexemes (for example a fraction becomes `((a) frac (b))`), which means the parser and evaluator need no template-specific code. Overwrite mode never replaces a marker. DEL on a marker unwraps the template, or removes it if it's empty.
