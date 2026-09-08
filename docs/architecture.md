# Architecture

The file tree, the layout rules, the month table, and the test suites.
Back to the [README](../README.md).

## How it fits together

```
src/
  main.tsx                mounts the app
  App.tsx                 one screen, so this is four lines
  index.css               the whole layout and type; theme tokens on :root
  audio/
    context.ts            shared types, the React context, and useAudio()
    AudioProvider.tsx     the single AudioContext, recorder, and playback graph
  components/
    ASCIIStillLife.tsx    the reactive plate (sampling, character grid, drift boxes)
    StillLifeCalendar.tsx the sheet: plate, caption, month bar, grid, and both rails
    CalendarSheet.tsx     the page itself
    Waveform.tsx          the level meter, fed by the shared analyser
    CrashScreen.tsx       the error boundary, which says the journal is still there
  lib/
    date.ts               local-time YYYY-MM-DD keys, the month grid, and isDateKey
    db.ts                 IndexedDB: the entries, and whether the notice has been seen
    backup.ts             the one file that holds a journal: write it, read it back
    months.ts             the twelve plates: art, subject, scanner labels
    themes.ts             three palettes, one per four-month block
    *.test.ts             the `lib` suite, beside what it tests
  components/*.test.tsx   the `ui` suite, beside the screens it renders
  test/                   the harness: a microphone, and jsdom's gaps
public/plates/            the twelve month illustrations
public/_headers           the policy and the caching
e2e/smoke.spec.ts         the browser suite, run against the built app
wrangler.jsonc            an assets-only deploy: no `main`, because there is no server
```

There is exactly one `AudioContext` for the whole app. The provider owns it and publishes two refs,
`sessionRef` (the analyser) and `levelRef` (the smoothed amplitude), which the illustration reads
inside its own animation frame. Nothing about the audio flows through React state, so the plate
never re-renders to animate.

The graph is `source → analyser → monitor(gain) → destination`. The monitor gain drops to `0` while
the microphone is being metered, which is what lets the plate react live *during* a recording
without the room feeding back into itself.

## Layout

The page scales as one printed object. A single custom property carries it:

```css
--u: clamp(0.45px, min(0.0926svh, 0.0856svw), 1px)
```

`--u` is 1px at the 1168×1080 design size and every dimension in the stylesheet is `calc(N *
var(--u))`. It is clamped by **both** axes, so the plate and the whole calendar always share one
viewport. Nothing scrolls, and the grid is never pushed below the fold. Checked from 1280×800 up to
1440p.

Below about 900px wide, or 520px tall, that stops being possible: 1168 units would need `--u` under
its 0.45px floor, so the right margin was clipped away and the type fell to about 5px. There the
same DOM is re-laid as one column that does scroll: the plate and its month first, then the two
margins as full-width panels beneath, with `--u` pinned to a true pixel so every rule above lands at
the size it was drawn for. It is the only layout allowed to scroll, and it is a fallback rather than
a phone design.

The date circles are sized by their **row**, not their column: the grid takes whatever height is
left and the circles fill it, which is what stops the calendar growing the page taller. The grid is
always six rows, padded with blanks, so a five-row month never gets taller cells than a six-row one.

The plate is a 720×470 panel and `ASCIIStillLife` renders at 1440×940 to match it, so its character
cells are square (measured: 1.004). Its vignette constants are derived from the grid rather than
hardcoded, so changing `CELL` or `HEIGHT` cannot silently decentre the scan.

## The month table

`src/lib/months.ts` holds one row per month: the painting, a roman plate number, the printed subject
line, the scanner's guesses and alt text. Colour is not among them. It comes from `themes.ts`, one
palette per four-month block, [for the reason given in the README](../README.md#the-year-changes-colour).

| | Month | Subject |
| --- | --- | --- |
| I | JANUARY | oysters, lemon, paring knife |
| II | FEBRUARY | game feathers, bound with twine |
| III | MARCH | broken tulips in a water glass |
| IV | APRIL | blossom branch, nest, four eggs |
| V | MAY | peonies in a brown vase |
| VI | JUNE | wild strawberries and cherries |
| VII | JULY | cut melon with plums |
| VIII | AUGUST | figs, plums, apricots on the branch |
| IX | SEPTEMBER | grapes and peach on pewter |
| X | OCTOBER | black grapes and vine leaves |
| XI | NOVEMBER | mushrooms, walnuts, chestnuts |
| XII | DECEMBER | split pomegranate, dried figs, bay |

The twelve illustrations were generated with GPT for this project and are covered by the same
licence as the code.

## Tests

```bash
npm test          # both suites
npm run test:watch
```

Two suites, because they need genuinely different runtimes.

**`lib`** runs in Node and covers the pure functions: local-time day keys and the month grid, and
the backup format from both ends — that a journal survives the round trip with its bytes intact,
that a file which is not a backup is refused in words rather than a parser error, and that a day
which cannot be trusted is stepped over while the rest are kept.

**`ui`** renders the screens into jsdom, against a microphone that can be told to work or to refuse
(`src/test/audio.ts`). It covers recording a day and finding it on the device, a take that captured
nothing being refused rather than filling the day with silence, uploading a file and having an
oversized one refused before it is decoded, the four different ways a browser withholds a
microphone, deleting a day, the notice that this browser is the only copy being said once and
remembered, and the backup: written with the audio really in it, read back onto an empty device,
and declining to write over a day the device already has.

Two of the checks are on claims made elsewhere in this file rather than on code paths, because a
claim nothing checks is a claim that quietly stops being true:

- Every palette is contrast-checked against WCAG relative luminance, so the 4.5:1 and 3:1 figures
  above are measured on every run rather than measured once.
- Every month's plate is checked to be a file that is actually in `public/plates/`. A renamed one
  would put the fallback still life on screen with nothing to say why.

### A third suite, in an actual browser

```bash
npx playwright install chromium   # once
npm run test:e2e                  # Chromium, against the built app
```

Three smoke tests, and they exist because reading the code found real bugs in the band jsdom cannot
enter: an empty take stored as a filled day, a file download failing in silence. Reading is a poor
way to find the next one.

Chromium is given a synthetic microphone (`--use-fake-device-for-media-stream`), so a take is
genuinely encoded by a real `MediaRecorder`, decoded by a real `AudioContext`, and held by a real
IndexedDB in between. The last of the three saves a backup and reads the file off disk, which is the
one test that can answer whether the download works at all: the file is handed over as a `blob:` URL
on an anchor, under a policy whose `default-src` does not name `blob:`. That is a question about a
header, and it would pass every unit test while failing for everybody.

Served through `wrangler dev` rather than through Vite, deliberately: that is the shipped
arrangement, with `public/_headers` on every asset. A dev server would skip those headers, and the
headers are the thing most likely to break the app without breaking a unit test. Each test also
fails on any unexpected console error, which is how a policy that refuses a script or a canvas that
taints would announce itself.

### What the tests do not reach

- **Whether any of it makes a sound.** A take now demonstrably encodes, decodes and reaches
  `PLAYING` in a real browser, but whether it is *audible*, whether the level meter follows a voice,
  and whether the analyser is wired the way the graph intends are still questions no assertion here
  asks.
- **What the plate looks like.** The image is fetched and decoded in the browser suite, so the
  sampling path runs against real pixels rather than jsdom's `null` context. Nothing checks the
  result: the character grid, the vignette and the scan are rendered and then taken on trust.
- **The layout, beyond fitting.** The browser suite asserts the page never scrolls sideways. `--u`,
  the six-row grid geometry and the one-column phone arrangement are otherwise unchecked: the grid
  *data* is tested, how tall a circle ends up is not.
- **What the browser does on its own.** Storage eviction, `navigator.storage.persist()`, Add to Home
  Screen, and Safari's seven-day rule are the reasons the backup exists, and none of them can be
  provoked in a test. That the one defence against them cannot itself be tested end to end is worth
  saying out loud.
- **A backup at real size.** The round trip is tested on a handful of clips. Whether a couple of
  hundred megabytes of base64 survives being built, downloaded, and read back on a phone with less
  memory than a laptop is not something jsdom or a 1.2-second take can answer.

