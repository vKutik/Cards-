# Words learning app

A vocabulary trainer for 100 words: five new words a day, a story that uses
all five, and a quiz built from that story. Spaced repetition brings each
word back on its own schedule.

## Running it

The app uses ES6 modules, so it must be served over HTTP — opening
`index.html` straight from disk (`file://`) is blocked by the browser's
module CORS rules.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

GitHub Pages serves it as-is.

## Structure

```
index.html                 markup only: the screen shell
styles/
  main.css                 font, palette, page, typography
  components.css           buttons, cards, gauge, quiz options, word rows
  reading.css              passage text, highlighted words, tooltip
  _font.css                the embedded Inter subset
js/
  app.js                   entry point: boot, router, screens
  data.js                  the data contract (re-exports + helpers)
  storage.js               the only module that persists progress
  srs.js                   scheduling rules, no DOM
  settings.js               app preferences and the developer-mode unlock
  data/
    words.js               100 words: ipa, translation, definition, examples
    lessons.js             20 lessons: 5 wordIds, a marked-up text, a quiz
    passages.js            97 extra passages, 36 from public-domain books
  components/
    progress.js            the round gauge and its legend
    flashcard.js           stage 1 card
    reader.js              stage 2: paints a passage, hangs tooltips
    tooltip.js             one tooltip at a time, positioned and flipped
    quiz.js                stage 3: question engine and question builders
    review.js              the spaced-repetition screen
```

### Rules the layout follows

- **Separation of concerns.** UI (`components/`), data (`data/`) and business
  logic (`srs.js`, `storage.js`) never reach into each other. `srs.js` has no
  DOM calls; components never read `localStorage`.
- **JSON-first.** No word, sentence or question is written into a view.
  Everything comes from `js/data/`.
- **One way to save.** Every change to progress goes through `storage.js`.
  Nothing else touches `localStorage`.
- **DRY.** A lesson stores `wordIds`, not copies of the words.

## Learning flow

1. **Daily limit** — 5 new words per rolling 24 hours.
2. **Stage 1, flashcards** — word, transcription, audio, definition, one
   example. Five cards.
3. **Stage 2, reading** — a short text weaving in all five words. Tap any
   highlighted word for a tooltip with its transcription and meaning; the
   text stays where it is.
4. **Stage 3, quiz** — two comprehension questions written for the story,
   plus one gap-fill generated from the day's words.

Extra reading practice draws a random passage from the 97 in the bank; a
passage opens only once every word in it has been introduced.

### The four steps a word moves through

| Colour | Step | Reached when |
|---|---|---|
| grey | new | never opened |
| red | started | its first flashcard is done |
| amber | read in a text | its meaning was answered correctly from a passage |
| green | known | box 4 — the review interval is months |

Reading only recolours a word. It never moves the due date; that is the
review screen's job alone.

### Ukrainian translations

Every word in `js/data/words.js` carries a `translation` field, but it is
not rendered anywhere right now — hidden in the UI on request, the data
stays put. To bring it back, drop the `.uk` markup back into
`flashcard.js`, `review.js`, the word-list row in `app.js`, and pass
`translation` into the `showTooltip()` call in `reader.js`; `tooltip.js`
already renders it when present.

## Settings and developer mode

The Settings screen (linked from the home screen) currently just shows
where progress is saved. A "Developer" card with a
**Delete all progress** button is hidden until you tap the "Vocabulary
trainer" label on that screen five times in a row — the same trick as
Android's build-number unlock, so it isn't something a learner hits by
accident. The unlock persists (`localStorage`, key `vocab-settings`)
across reloads. Deletion asks for a second confirmation and cannot be
undone; it goes through `storage.resetAll()`, the only function allowed to
wipe the progress store.

## Moving to a Python backend

`data.js` already exposes `fetchWords()`, `fetchLessons()` and
`fetchPassages()`, and `storage.js` keeps all reads and writes behind
`Backend.read()` / `Backend.write()`. Pointing those at
`GET /api/daily-lesson` and a progress endpoint (FastAPI + SQLite) is the
whole migration — no screen changes.
