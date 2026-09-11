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
audio/                     100 pronunciation recordings, one per word
js/
  app.js                   entry point: boot, router, screens
  data.js                  the data contract (re-exports + helpers)
  storage.js               the only module that persists progress
  srs.js                   scheduling rules, no DOM
  settings.js               app preferences and the developer-mode unlock
  data/
    words.js               100 words: ipa, translation, definition, examples
    lessons.js             20 lessons: 5 wordIds, a marked-up text, a quiz
    passages.js            1000 reading passages, ten for every word
    pronunciation.js       the recording, speaker and licence per word
  components/
    progress.js            the round gauge and its legend
    flashcard.js           stage 1 card
    reader.js              stage 2: paints a passage, hangs tooltips
    tooltip.js             one tooltip at a time, positioned and flipped
    quiz.js                stage 3: the three mechanics and the runner
    audio.js               plays the recording, falls back to SpeechSynthesis
    motion.js              how a screen arrives: cross-fade, or ease-in
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
2. **Stage 1, flashcards** — word, transcription, recording, definition, one
   example. Five cards.
3. **Stage 2, reading** — a short text weaving in all five words. Tap any
   highlighted word for a tooltip with its transcription, a speaker button
   and its meaning; the text stays where it is.
4. **Stage 3, quiz** — two comprehension questions written for the story,
   plus one of the three checking mechanics below on a word from today.

### The three checking mechanics

No radio buttons and no submit button anywhere: the answer *is* the tap, on
the pill or on the sentence card itself. All three are generated from the
word list at run time, so they never go stale.

| Mechanic | What you see | What it checks |
|---|---|---|
| **Context gap fill** | a sentence with the word cut out, and 3–4 word pills | whether the context, not the translation, tells you which word belongs |
| **Context match** | the word, then two sentences — its own and one belonging to another word with this one transplanted in | the sense of the word, not just recognition of its shape |
| **Intuitive focus** | one sentence with the word highlighted and one claimed meaning — yes or no | a three-second calibration, no reading of four options |

Every option in a gap fill carries the same ending as the answer, so the
shape of the words can never point at the right one. Real forms from the
word list are used wherever they exist; the handful English does not build
by rule are spelled out in `ODD` in `quiz.js`.

**Feedback is never punitive.** A miss does not flash red: the tapped
option fades, the right answer lifts in amber, and a line underneath says
what the word actually means. It moves on by itself, or sooner if you tap.
The story's own comprehension questions run through the same runner and get
the same treatment.

## Reading practice, on a growing interval

Every word owns a shelf of **ten passages**, and a passage belongs to exactly
one word. When a word comes round, one of its ten is drawn **at random** from
those you have not read yet — so the word returns in a different text every
time, never the same page twice while an unread one is left.

The gap between visits widens with every success, following the forgetting
curve rather than a fixed rota (`READ_STEPS` in `srs.js`):

| Visit | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th+ |
|---|---|---|---|---|---|---|---|
| Days later | 1 | 3 | 7 | 16 | 35 | 90 | 180 |

Answer from the text and the word moves up a rung. Miss it and it drops to
the bottom — back tomorrow — which is what keeps the schedule honest. The
first text is offered the moment a word is introduced, since the lesson was
the meeting and the texts are the repetitions.

When nothing is due the screen says so and names the day the next word comes
round, with a *Read ahead anyway* button for when you want more than the
spacing asks of you.

Each text is followed by one check on its word, and the mechanic follows the
text's place on the shelf, so the questions vary as the texts do.

### The familiarity index

Three dots beside a word instead of a percentage — the story of your
relationship with it rather than a score:

| | Meaning |
|---|---|
| ◦ ◦ ◦ | never met it in a text |
| ● ◦ ◦ | read it inside a real passage |
| ● ● ◦ | answered for it correctly from that passage |
| ▬▬▬ | mastered — the dots close into one line |

Leave a word far past its due date and the last lit dot fades to an outline:
the forgetting curve showing through, as a nudge rather than a penalty.

### Where the texts come from

932 of the 1000 are real extracts from 101 public-domain books — Dickens,
Austen, the Brontës, Twain, London, Chopin, Cather, Wharton, Conan Doyle,
Montgomery, Burnett and others — each shown with its source. The remaining 68
were written for this course, for words the nineteenth century barely uses
(`tape`, `leak`, `drill`, `rely`).

They were mined from the corpus and filtered, not hand-picked one by one, so
the pipeline does the quality work:

- **Wrong senses are blocked.** A regex has no idea that "attaching
  significance" is not the `attach` this course teaches, so 53 words carry an
  explicit list of collocations to reject, plus a rule that a physical word
  sitting beside a strongly abstract noun is the other sense. Some off-sense
  uses still get through — roughly one text in ten — which is the honest limit
  of matching senses without a language model.
- **Offensive material is dropped.** Period fiction carries slurs; anything
  matching that list, or reading as a broken fragment, is thrown out.
- **Readable books are preferred.** Each book is scored for sentence length
  and vocabulary outside the corpus's common 2,400 words, and passages from
  the denser books are penalised, so what surfaces leans towards Anne of Green
  Gables rather than Middlemarch.
- Passages must start a paragraph, end a sentence, run 35–80 words, name at
  most three people, and no more than two may come from the same book for the
  same word.

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

## Pronunciation

Every word is spoken by a real person, not a speech synthesiser. The 100
recordings come from **Wiktionary** and Wikimedia Commons, chosen per word in
this order: an `En-us-` recording first (the app teaches American
transcription), then British, then Lingua Libre English.

They are **served from this repository** rather than hot-linked. Wikimedia
rate-limits bursts — a word list where you tap several words in a row is
exactly such a burst — and a tap should not wait on a third-party round trip.
`audio/` is 1.9 MB for all 100 files.

`js/components/audio.js` plays the recording and only falls back to
SpeechSynthesis when a file is missing or the browser refuses to play it, so
nothing goes silent.

### Credit

Most of the licences (CC BY-SA 3.0 and 4.0) require attribution, so the
speakers are credited in the app itself, on the Settings screen, and each
entry in `js/data/pronunciation.js` keeps its speaker, licence and the
Commons page it came from. The recordings are by Dvortygirl (74), Vealhurl
(11), Neskaya (4) and ten others, under CC BY-SA 3.0, CC BY-SA 4.0, CC0 and
public domain.

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
