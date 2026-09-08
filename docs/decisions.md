# Decisions worth knowing

The long version of why the app is built the way it is. Back to the [README](../README.md).

- **Dates are local-time `YYYY-MM-DD` strings, never `toISOString()`.** A UTC key puts an evening
  recording on the wrong day for anyone west of Greenwich.
- **Plates are served from `public/plates/`, one per month.** They were first hotlinked from remote
  storage, which sends no `Access-Control-Allow-Origin` header. With `crossOrigin="anonymous"` the
  image fails to load outright, and without it the sampling canvas is tainted and `getImageData`
  throws. Self-hosting fixes both, which is why the twelve files live in the repo rather than on a
  CDN.
- **The accent drives today's ring, the saved-day marks and every focus ring.** It is published as
  `--accent` on the app root and read from CSS, so the palette lives in one place: `lib/themes.ts`,
  where the month decides it and there is no theme switch to disagree with. The selected day stays
  ink-on-paper deliberately: sampled from the paintings the accents would have spanned `#D5C08E` to
  `#A8322F`, and no single text colour stays legible on all of them.
- **A day plays itself only when you click it.** An `AudioContext` created without a user gesture
  starts suspended, so autoplaying on first paint would report "playing" in silence. Loading the
  page leaves today's clip ready but paused.
- **Restoring never writes over a day this device already has.** The two copies are not equally
  safe. A backup file is a snapshot of whenever it was taken; the day on the device may be the only
  copy in existence, recorded this morning and not in any file yet. The obvious implementation
  writes the file straight over the journal, which destroys the newer recording with nothing to undo
  it — so the local day wins, and the restore says how many days it left alone rather than reporting
  a silent success. The case that matters is not the empty phone, it is an old backup landing on a
  calendar that has moved on.
- **The backup is plain JSON with the audio inside it, not an archive.** A zip would be a third
  smaller and would need a library to write and a library to read. This needs neither: it can be
  opened by anything, and the recordings can be pulled out of it with a few lines of whatever
  somebody has to hand, years from now, with this app gone. A journal you can only recover with the
  software that wrote it is not much of a backup. The cost is base64's extra third, paid on a file
  that is written once in a while and read almost never.
- **One JSON object per line, not one JSON document.** The header is the first line and every line
  after it is a day, which is what lets both halves work a clip at a time: the file is built as
  `Blob` parts and read through a stream, and neither side ever holds more than one recording.

  The first version got this half right and half wrong. It was *written* incrementally, precisely
  because holding a year of base64 as one JavaScript string is the step most likely to fail on a
  phone — and then *read* with `JSON.parse(await file.text())`, which is that same step, on the side
  where it matters more. A restore is what somebody runs when the file is the only copy they have
  left, so it is the one path that must not run out of memory.

  Measured on a 156MB backup of 300 days: the streaming read peaks at **+69MB** of RSS, the
  whole-document read at **+296MB** — roughly twice the size of the file, which is the number that
  ends a restore on a phone.
- **The days are handed to a callback rather than returned as an array.** The same reason, one layer
  up: returning `Entry[]` would put every decoded recording in memory at once, undoing the streaming
  parse immediately above it. The caller writes each day and lets it go, so the high-water mark is a
  single clip whatever the file weighs.
- **A line that cannot be read is skipped, and the days around it are still restored.** The
  whole-document version could not do this: one bad byte failed all of it, including every day
  written before the damage. A backup truncated by a failed copy — exactly the file somebody
  restores from — now gives back everything up to the cut, and says how many lines it could not
  read rather than reporting a silent success.
- **Every field in a restored backup is checked rather than trusted.** This file has been in
  somebody's downloads for a year: it may have been edited, truncated by a failed copy, or picked
  from the wrong folder. The failure that matters is the quiet one, where a malformed day lands in
  the journal as an entry that cannot play and cannot be explained — so a day that does not survive
  checking is stepped over and the rest are kept, and a file that is not a backup at all is refused
  in words rather than a parser error. `isDateKey` round-trips the date rather than matching a
  pattern, which is what separates a real day from `2026-02-31`.
- **Inter is served from this origin.** It used to arrive through an `@import` of a Google Fonts
  stylesheet at the top of `index.css`, which is the slowest possible shape: an `@import` is only
  discovered once the stylesheet itself has been parsed, so the font file was the fourth blocking
  round trip on a page that is mostly display type. It also handed Google the IP of everyone opening
  a private journal, and it was the single exception the content security policy had to make. One
  variable file now covers all four weights.
- **Future days are dimmed, past days are not.** The design this came from was a 2027 calendar and
  dimmed the past; for a journal that is backwards: the past is where the entries are. Future days
  stay clickable so you can load music ahead of a date.
- **The year is live and unbounded.** Paging past January or December rolls the year rather than
  stopping, so the journal is not confined to one sheet of twelve months. The rail still jumps
  within the year on screen.
- **If the plate image is missing or taints the canvas, there is still something to sample.**
  `ASCIIStillLife` falls back to a hand-painted still life, so the effect never has to be absent.

