# Easter egg clips

Type `58008` and press `=` to start the MLG montage ([js/easter.js](../../js/easter.js)). It runs as long as `dubstep.mp3` (about 6.6 s). The sounds come from the files in this folder. Any clip that's missing is skipped and the visuals play without it.

| File | Plays at (s) | How much plays |
|---|---|---|
| `dubstep.mp3` | 0 | the whole track, drops under the voice lines, fades out at the end |
| `airhorn.mp3` | 0 | a 0.45 s blast |
| `damn-son.mp3` | 0.42 | all of it ("damn son, where'd you find this") |
| `sniper.mp3` | 0.72 | 0.25 s, placed in the pause after "damn son" |
| `hitmarker.mp3` | 0.84, then 2.53 / 2.65 / 2.77 | the tick |
| `triple.mp3` | 2.84 | 1.55 s, cut in the pause after "oh baby a triple" |
| `wow.mp3` | 4.40 | all of it |
| `mom-camera.mp3` | 5.03 | 1.57 s, faded out at the end of the montage |

Voice lines never overlap each other. Effects are placed in the pauses between words.

## Format

- **MP3**: plays in every browser, including iOS Safari.
- Silence at the start of a file is skipped automatically.
- Clips are levelled to the same loudness automatically, and a limiter stops the mix from clipping.
- Keep files small (under about 200 KB). Embedded cover art only adds download size: `damn-son.mp3` carries about 150 KB of it. `ffmpeg -i in.mp3 -map 0:a -c copy out.mp3` strips it.
- If you replace a clip, check the times and lengths in the `SOUNDS` table in `js/easter.js`. Each entry is tuned to where the pauses fall in the current files.

The clips are not in the service worker's precache list, because one missing file would break the offline install. They're cached the first time they play, and work offline after that. On iPhones the hardware silent switch mutes them.
