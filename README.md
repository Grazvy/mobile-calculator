# SC-82 phone calculator

A two-line scientific calculator in the style of the classic school calculators (fx-82MS layout and behaviour). The whole phone screen is the calculator. It installs as an app and works offline after the first visit.

Plain HTML/CSS/JS with no build step and no dependencies.

## Deploy to Netlify

Either:

- **Drag and drop:** open https://app.netlify.com/drop and drop this folder onto it, or
- **Git:** push the folder to a repository and choose "Import from Git" in Netlify. `netlify.toml` already sets the publish directory to `.` with no build command.

On the phone, open the site once, then use **Add to Home Screen** (Safari share menu, or the Chrome menu). From then on it starts full screen and works with no connection.

## Releasing an update

Bump `VERSION` in [sw.js](sw.js) (for example `sc82-v2`) whenever you change any file. Otherwise phones keep the old cached copy. If you add a new file, also add it to the `ASSETS` list in `sw.js`.

## Develop

```sh
npm test          # engine + key-sequence tests (node --test, no install needed)
npm run serve     # http://localhost:8000
npm run icons     # regenerate icons/ (only if you change the icon design)
```

On a desktop you can type on the keyboard too: digits, `+ - * / ^ ( )`, Enter for `=`, Backspace for DEL, Esc for AC, and the arrow keys.

## What it does

- **COMP:** + − × ÷, powers and roots, x² x³ x⁻¹ x!, log/ln/10ˣ/eˣ, trig, inverse trig and hyperbolic trig, nPr/nCr, Pol(/Rec(, %, Ran#, Rnd, π
- **Order of operations** follows the fx-82MS rules, including implied multiplication (`2π`, `2sin 30`) and prefix functions without brackets (`sin 30+1`)
- **Exact fractions** with a b/c, plus a b/c ↔ decimal and d/c toggles; degrees-minutes-seconds with °′″; ENG notation
- **Angle units** Deg/Rad/Gra and the DRG▶ conversion
- **Display formats** Fix 0–9, Sci 0–9, Norm 1/2
- **Memory:** Ans, M (M+/M−), and A–F, X, Y via STO/RCL/ALPHA. Memory and settings are kept between visits.
- **Replay:** ▲▼ to step through earlier calculations and ◀▶ to edit them; errors jump the cursor to the problem
- **SD statistics** (data with frequencies; Σx², Σx, n, x̄, xσn, xσn−1) and **REG linear regression** (A, B, r, x̂, ŷ)

Only linear regression is supported in REG mode (no Log/Exp/Pwr/Inv/Quad).

## Layout

```
index.html, css/style.css      page shell and styling
js/app.js                      wiring: keypad → calculator → LCD, service worker registration
js/keys.js                     key layout and touch handling
js/calculator.js               calculator state machine (modes, cursor, memory, replay, stats)
js/display.js, js/font.js      canvas LCD: 5×7 dot-matrix line and 7-segment line
js/engine/                     lexer, parser, evaluator, exact fractions, number formatting, stats
sw.js, manifest.webmanifest    offline cache and installable-app metadata
```
