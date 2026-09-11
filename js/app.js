/* app.js - entry point: boot, routing, and the screens that glue the
 * components together. Screens decide what to show; they never persist
 * anything themselves (storage.js) and never schedule anything (srs.js).
 */
import { words, lessons, passages, wordById, lessonWords, openPassages,
         shelfOf } from './data.js';
import * as store from './storage.js';
import * as srs from './srs.js';
import * as settings from './settings.js';
import { progressRing, familiarityDots } from './components/progress.js';
import { renderFlashcard } from './components/flashcard.js';
import { markedOf } from './components/word.js';
import { say } from './components/audio.js';
import { pronunciations } from './data/pronunciation.js';
import { renderReview } from './components/review.js';
import { initReader, dictOf } from './components/reader.js';
import { runQuiz, questionFor, anyQuestion } from './components/quiz.js';
import { hideTooltip } from './components/tooltip.js';
import { paint, easeIn } from './components/motion.js';
import { shuffle, one } from './util.js';

const screen = () => document.getElementById('screen');
const DICT = dictOf(words);

/* ---------------- router ---------------- */
const routes = {};
let current = { name:'home', params:{} };

/* The one way a screen changes. Nothing outside this file calls it -
   app.js is the entry point, not a library. */
function go(name, params = {}){
  hideTooltip();
  current = { name, params };
  paint(screen(), () => routes[name](params), () => window.scrollTo(0,0));
}
/** Same screen, fresh content - a card stepping to its next example. */
const rerender = () => paint(screen(), () => routes[current.name](current.params));

const backButton = (label = 'Back', to = 'home') =>
  `<button class="go ghost" data-back="${to}">${label}</button>`;
const wireBack = () => screen().querySelectorAll('[data-back]')
  .forEach(b => b.onclick = () => go(b.dataset.back));

/** Both quizzes finish the same way: the score, a line about it, then a way
 *  back into the text. Only the wording and those buttons differ, so the
 *  caller passes them and wires their clicks afterwards. */
function scoreScreen(score, total, note, buttons, backLabel = 'Back'){
  screen().innerHTML = `<h1>${score} of ${total}</h1>
    <div class="card muted"><p>${note}</p></div>
    ${buttons}${backButton(backLabel,'home')}`;
  easeIn(screen());
  wireBack();
}

/* ---------------- home ---------------- */
routes.home = () => {
  const dueIds   = srs.due();
  const wait     = srs.unlockIn();
  const openIds  = srs.introducedIds();
  const reading  = openPassages(openIds);
  const lesson   = nextLesson();

  const counts = {
    known:   srs.countStep('known'),
    read:    srs.countStep('read'),
    started: srs.countStep('started'),
    total:   words.length
  };

  screen().innerHTML = progressRing(counts) + `
    ${dueIds.length ? `<button class="go" id="review">Review ${dueIds.length} word${dueIds.length===1?'':'s'}</button>` : ''}
    <button class="go ${dueIds.length ? 'ghost' : ''}" id="lesson" ${lesson ? '' : 'disabled'}>
      ${lesson ? 'Learn' : (wait ? `New words in ${srs.hhmm(wait)}` : 'All words opened')}
    </button>
    <button class="go ghost" id="reading" ${reading.length ? '' : 'disabled'}>Reading practice</button>
    <button class="go ghost" id="list">Word list</button>
    <button class="linkbtn" id="settings">Settings</button>`;

  const on = (id, fn) => { const el = screen().querySelector('#'+id); if(el) el.onclick = fn; };
  on('review',   () => go('review',  { queue: shuffle(dueIds), i:0, revealed:false }));
  on('lesson',   () => lesson && go('lesson', { id: lesson.id, stage: resumeStage(lesson) }));
  on('reading',  () => go('reading'));
  on('list',     () => go('list'));
  on('settings', () => go('settings'));
};

/** What to offer next. A lesson whose cards are done but whose reading or
 *  quiz is not always wins, so the daily cap can never strand you halfway.
 *  Otherwise the first lesson with an unopened word, if the cap allows it. */
function nextLesson(){
  const unfinished = lessons.find(l =>
    l.wordIds.every(id => store.getWord(id)) && store.lessonStage(l.id) !== 'done');
  if(unfinished) return unfinished;
  if(srs.newQuota() === 0) return null;
  return lessons.find(l => l.wordIds.some(id => !store.getWord(id))) || null;
}

/** Which of the three stages to drop back into. */
function resumeStage(lesson){
  if(lesson.wordIds.some(id => !store.getWord(id))) return 0;
  return store.lessonStage(lesson.id) === 'quiz' ? 2 : 1;
}

/* ---------------- lesson: cards -> reading -> quiz ---------------- */
routes.lesson = ({ id, stage = 0, i = 0 }) => {
  const lesson = lessons.find(l => l.id === id);
  const ws = lessonWords(lesson);

  if(stage === 0) return lessonCards(lesson, ws, i);
  if(stage === 1) return lessonReading(lesson);
  return lessonQuiz(lesson, ws);
};

function lessonCards(lesson, ws, i){
  const word = ws[i];
  const head = `<h1>${lesson.title}</h1>`;
  screen().innerHTML = head + '<div id="stage"></div>';

  renderFlashcard(screen().querySelector('#stage'), word,
    { label:`New word ${i+1} of ${ws.length}`,
      fam: srs.familiarity(word.id, textsRead(word.id)),
      next: i === ws.length-1 ? 'Read the story' : 'Got it' },
    {
      onNext: async () => {
        await srs.introduce(word.id);
        if(i === ws.length-1){ await store.setLessonStage(lesson.id,'reading');
          go('lesson',{ id:lesson.id, stage:1 }); }
        else go('lesson',{ id:lesson.id, stage:0, i:i+1 });
      },
      onRerender: rerender
    });
}

function lessonReading(lesson){
  screen().innerHTML = `<h1>${lesson.title}</h1>` + `
    <p class="muted">All five of today's words are in this text. Tap any highlighted
      word if you need its meaning.</p>
    <div class="card" id="stage"></div>
    <button class="go" id="toquiz">Answer the questions</button>
    ${backButton('Back','home')}`;

  initReader(screen().querySelector('#stage'), lesson, DICT);
  screen().querySelector('#toquiz').onclick = async () => {
    await store.setLessonStage(lesson.id,'quiz');
    go('lesson',{ id:lesson.id, stage:2 });
  };
  wireBack();
}

function lessonQuiz(lesson, ws){
  // the story's own comprehension questions, then one of the three word
  // mechanics on a word from today - which one is left to the draw
  const questions = [
    ...lesson.quiz,
    anyQuestion(one(ws), words)
  ];
  screen().innerHTML = `<h1>${lesson.title}</h1><div id="stage"></div>`;

  runQuiz(screen().querySelector('#stage'), questions, {
    onAnswer: (q, ok) => { if(ok && q.wordId != null) store.markReadCorrect(q.wordId); },
    onDone: async (score, total) => {
      await store.setLessonStage(lesson.id,'done');
      scoreScreen(score, total,
        score === total
          ? 'The text carried every answer. That is how words are learned outside a card.'
          : 'Read the story once more and look at the sentence around each word.',
        `<button class="go" id="again">Read it again</button>`, 'Done');
      screen().querySelector('#again').onclick = () => go('lesson',{ id:lesson.id, stage:1 });
    }
  });
}

/* ---------------- review ---------------- */
routes.review = params => {
  const { queue, i, revealed } = params;
  if(i >= queue.length){
    const log = store.todayLog();
    screen().innerHTML = `<h1>Session done</h1>
      <div class="card">
        <div class="row"><span>Reviewed</span><b>${queue.length}</b></div>
        <div class="row"><span>Right today</span><b>${log.right}</b></div>
        <div class="row"><span>Forgotten today</span><b>${log.wrong}</b></div>
      </div>${backButton('Back','home')}`;
    return wireBack();
  }

  const word = wordById(queue[i]);
  screen().innerHTML = '<div id="stage"></div>';
  renderReview(screen().querySelector('#stage'), word,
    { index:i, total:queue.length, revealed, fam: srs.familiarity(word.id, textsRead(word.id)) },
    {
      onReveal: () => go('review', { ...params, revealed:true }),
      onRerender: rerender,
      onGrade: async g => {
        await srs.grade(word.id, g);
        const next = { ...params, i:i+1, revealed:false };
        if(g === 0) next.queue = [...queue, word.id];   // forgotten: comes back today
        go('review', next);
      }
    });
};

/* ---------------- reading on a growing interval ---------------- */
/**
 * Two different things decide what you read, and they must not be confused.
 *
 * The *schedule* decides what comes back on its own: one text per word per
 * interval, widening with every success. That is the spacing doing its job.
 *
 * Wanting to read more is not the schedule's business. A word owns ten
 * texts and you can work through all ten whenever you like - "Another text"
 * stays on this word and never touches its due date, so extra practice can
 * never cost you the spacing. Reading more is always allowed; it is simply
 * never *asked* of you.
 *
 * @param {number|null} id     show exactly this passage
 * @param {number|null} word   show a text for this word, whatever the schedule says
 * @param {number|null} after  move past this word ("Another word")
 * @param {boolean} ahead      read even though nothing is due
 */
routes.reading = ({ id = null, word: only = null, after = null, ahead = false } = {}) => {
  const due = srs.readingDue();
  const free = only !== null || ahead || id !== null;

  if(!due.length && !free) return readingRested();

  const passage = id !== null ? passages[id] : pickText(only ?? nextWord(due, after));
  if(!passage) return go('home');

  const word  = wordById(passage.w);
  const late  = srs.overdueBy(passage.w);
  const total = shelf(passage.w).length;
  const done  = textsRead(passage.w);

  screen().innerHTML = `<h1>Reading practice</h1>
    <p class="muted"><b>${word.word}</b> · ${done >= total
        ? `all ${total} texts answered`
        : `${done} of ${total} answered`}${late > 1 ? ` · ${late} days overdue` : ''}
      ${due.length > 1 ? ` · ${due.length - 1} more waiting` : ''}
      <button class="murky" id="murky" title="This text does not make the word clear"
        aria-label="This text does not make the word clear">?</button></p>
    <div class="card" id="stage"></div>
    <button class="go" id="quiz">Answer the question</button>
    <button class="go ghost" id="more">Another text for <b>${word.word}</b></button>
    <button class="go ghost" id="another">Another word</button>
    ${backButton('Back','home')}`;

  initReader(screen().querySelector('#stage'), passage, DICT);
  screen().querySelector('#quiz').onclick = () => go('readingQuiz', { id: passage.id });
  // more of the same word: the schedule is not consulted and not moved
  screen().querySelector('#more').onclick = () => go('reading', { word: passage.w, ahead });
  screen().querySelector('#another').onclick = () => go('reading', { after: passage.w, ahead });
  screen().querySelector('#murky').onclick = async () => {
    // a rule cannot tell a figurative use from a plain one; this can
    await store.markMurky(passage.id);
    go('reading', { word: passage.w, ahead });
  };
  wireBack();
};

/* Nothing is *due* - which is not the same as nothing to read. The schedule
   has finished asking; the shelves are still full. Say both, and make the
   reading button the plain one rather than something you have to insist on. */
function readingRested(){
  const days = srs.nextReadingIn();
  const open = [...srs.introducedIds()];
  const spare = open.reduce((n, id) => n + shelf(id).length - textsRead(id), 0);

  screen().innerHTML = `<h1>Reading practice</h1>
    <div class="card">
      <p class="def">${days
        ? `The schedule brings the next word back ${days === 1 ? 'tomorrow' : `in ${days} days`}.`
        : 'Open some words first and their texts will start arriving here.'}</p>
      ${open.length ? `<p class="muted">Nothing is <em>due</em> - but
        ${spare} more text${spare === 1 ? '' : 's'} are sitting on the shelves of the
        words you have already opened. Reading them costs you nothing: extra
        practice never moves a due date.</p>` : ''}
    </div>
    ${spare ? `<button class="go" id="ahead">Keep reading</button>` : ''}
    ${backButton('Back','home')}`;
  const a = screen().querySelector('#ahead');
  if(a) a.onclick = () => go('reading', { ahead:true });
  wireBack();
}

/* A word's shelf minus the texts the learner retired with the "?" button.
   Both the counter in the header and the draw below work off this, so a
   retired text stops being counted as well as stops coming round. */
const shelf = wordId => shelfOf(wordId).filter(p => !store.isMurky(p.id));

const textsRead = wordId => shelf(wordId).filter(p => store.isPassageRead(p.id)).length;

/* Texts already served in this sitting. A text only counts as *read* once
   its question is answered, so "have you read it" cannot order a browse
   through the shelf - this can. Deliberately not persisted: it orders one
   sitting and is forgotten, which is what keeps the shelf from repeating
   itself while you work through it. */
const shown = new Set();

/** One of the word's ten: an unread one it has not just served, at random. */
function pickText(wordId){
  if(wordId == null) return null;
  const left = shelf(wordId);
  if(!left.length) return shelfOf(wordId)[0] || null;   // every one retired

  // worked all the way through: start the shelf again rather than stall
  if(left.every(p => shown.has(p.id))) left.forEach(p => shown.delete(p.id));

  const unseen = left.filter(p => !shown.has(p.id));
  const chosen = one(unseen.filter(p => !store.isPassageRead(p.id)).length
    ? unseen.filter(p => !store.isPassageRead(p.id))
    : unseen);
  shown.add(chosen.id);
  return chosen;
}

/** Which word to read next: the most overdue one, or - when the learner
 *  asked to move on - the one after it in the queue, so "Another word"
 *  walks the whole queue instead of bouncing between its top two. */
function nextWord(due, after){
  if(!due.length) return anyIntroduced(after);
  if(after === null) return due[0];
  return due[(due.indexOf(after) + 1) % due.length];
}

/** Reading ahead of schedule: whichever word is closest to its turn. */
function anyIntroduced(skip = null){
  const ids = [...srs.introducedIds()].filter(id => id !== skip);
  if(!ids.length) return null;
  return ids.sort((a,b) => srs.overdueBy(b) - srs.overdueBy(a))[0];
}

routes.readingQuiz = ({ id }) => {
  const passage = passages[id];
  // one check on the word this text belongs to; the mechanic follows the
  // text's place on the shelf, so five texts give five different angles
  const questions = [questionFor(wordById(passage.w), words, passage.slot)];
  screen().innerHTML = '<div id="stage"></div>';

  runQuiz(screen().querySelector('#stage'), questions, {
    // getting it right from the passage alone is what turns a word amber
    onAnswer: (q, ok) => { if(ok) store.markReadCorrect(q.wordId); },
    onDone: async (score, total) => {
      await store.markPassageRead(passage.id);
      // right: the next text for this word moves further out. wrong: tomorrow.
      await srs.gradeReading(passage.w, score === total);
      scoreScreen(score, total,
        score === total
          ? 'You read the meaning out of the sentences around it. That is how words are actually learned.'
          : 'Read it once more and look at what happens either side of the word.',
        `<button class="go" id="more">Another text for <b>${wordById(passage.w).word}</b></button>
         <button class="go ghost" id="another">Next word</button>
         <button class="go ghost" id="again">Read this one again</button>`);
      screen().querySelector('#more').onclick = () => go('reading',{ word: passage.w });
      screen().querySelector('#another').onclick = () => go('reading',{ after: passage.w, ahead:true });
      screen().querySelector('#again').onclick = () => go('reading',{ id: passage.id });
    }
  });
};

/* ---------------- word list ---------------- */
const RANK = { started:0, read:1, known:2 };

routes.list = () => {
  const seen = words.filter(w => store.getWord(w.id))
    .sort((a,b) => RANK[srs.stepOf(a.id)] - RANK[srs.stepOf(b.id)] || a.id - b.id);

  const body = seen.length ? seen.map(w => `
    <div class="card item">
      <div class="ihead">
        <b>${w.word}</b>
        ${familiarityDots(srs.familiarity(w.id, textsRead(w.id)))}
        <span class="ipos">/${w.ipa}/ · ${w.pos}</span>
        <button class="say tiny" data-say="${w.id}">🔊</button>
      </div>
      <div class="idef">${w.definition}</div>
      <div class="ex">${markedOf(w.examples[0])}</div>
      ${w.opposite !== '—' ? `<div class="anto">opposite: ${w.opposite}</div>` : ''}
    </div>`).join('')
    : '<div class="card muted">Nothing here yet. Open your first lesson to start.</div>';

  screen().innerHTML = `<h1>Word list</h1>${body}${backButton('Back','home')}`;
  screen().querySelectorAll('[data-say]').forEach(b =>
    b.onclick = () => { const w = wordById(+b.dataset.say); say(w.id, w.word); });
  wireBack();
};

/* ---------------- settings ---------------- */
/* Nothing here is essential to the learning flow. The "Developer" card is
 * hidden until settings.registerUnlockTap() says five taps landed on the
 * title within its window - not something a learner stumbles into, but not
 * a secret either: the title says so. */
routes.settings = ({ confirming = false, note = '' } = {}) => {
  screen().innerHTML = `<h1>Settings</h1>
    ${note ? `<div class="fb ok">${note}</div>` : ''}
    <div class="card">
      <h2 id="tap" class="tapzone">Vocabulary trainer</h2>
      <p class="muted">Saving to: ${store.storageLabel()}</p>
    </div>
    ${newWordsCard()}
    ${creditsCard()}
    ${settings.isDevMode() ? devCard(confirming) : ''}
    ${backButton('Back','home')}`;

  screen().querySelector('#tap').onclick = () => {
    if(settings.registerUnlockTap()) go('settings', { note:'Developer mode unlocked.' });
  };

  screen().querySelector('#plus5').onclick = async () => {
    await srs.grantMore();
    go('settings', { note:`Five more words opened. ${srs.newQuota()} waiting on the home screen.` });
  };

  const del = screen().querySelector('#devDelete');
  if(del) del.onclick = () => go('settings', { confirming:true });
  const yes = screen().querySelector('#devYes');
  if(yes) yes.onclick = async () => { await store.resetAll(); go('home'); };
  const no = screen().querySelector('#devNo');
  if(no) no.onclick = () => go('settings');

  wireBack();
};

/* Five a day is not a limit imposed on the learner - it is the number the
   review intervals assume, and going faster than it is what buries people in
   reviews a week later. So the button opens one more batch rather than
   raising the cap: the extra ages out on its own and tomorrow starts at five
   again, with no setting left switched on to forget about. */
function newWordsCard(){
  const quota = srs.newQuota();
  const wait  = srs.unlockIn();
  return `<div class="card">
    <h2>New words</h2>
    <p class="muted">Five new words per 24 hours is the pace the spacing is
      built around. This opens five more right now without changing that —
      the extra batch ages out after a day, and tomorrow starts at five again.</p>
    <div class="row"><span>Ready to open now</span><b>${quota}</b></div>
    ${!quota && wait ? `<div class="row"><span>Next five in</span><b>${srs.hhmm(wait)}</b></div>` : ''}
    <button class="go ghost" id="plus5">+5 words now</button>
  </div>`;
}

/* The recordings are other people's work under licences that ask for a
   credit, so the credit is in the app, not only in the README. */
function creditsCard(){
  const by = {};
  for(const id in pronunciations){
    const p = pronunciations[id];
    (by[p.by] = by[p.by] || { n:0, lic:new Set() }).n++;
    by[p.by].lic.add(p.lic);
  }
  const voices = Object.entries(by).sort((a,b) => b[1].n - a[1].n)
    .map(([name, v]) => `<div class="row"><span>${name || 'uncredited'}</span>
        <b>${v.n}</b></div>`).join('');
  const licences = [...new Set(Object.values(pronunciations).map(p => p.lic))].join(', ');
  return `<div class="card">
    <h2>Pronunciations</h2>
    <p class="muted">Spoken by volunteers and published on
      <a href="https://en.wiktionary.org" target="_blank" rel="noopener">Wiktionary</a>
      and Wikimedia Commons, under ${licences}. Words recorded, by speaker:</p>
    ${voices}
  </div>`;
}

function devCard(confirming){
  return `
    <div class="card">
      <h2>Developer</h2>
      <p class="muted">Not part of the normal flow. Deletes every word, lesson and log
        on this device - there is no undo.</p>
      ${confirming
        ? `<div class="fb no">Delete all progress? This cannot be undone.</div>
           <button class="go danger" id="devYes">Yes, delete everything</button>
           <button class="go ghost" id="devNo">Cancel</button>`
        : `<button class="go danger" id="devDelete">Delete all progress</button>`}
    </div>`;
}

/* ---------------- boot ---------------- */
/* Progress saved by the single-file version has words but no lesson stages.
   Treat any lesson whose words are all introduced as finished, so an existing
   learner is not walked back through lessons they have already done. */
function migrateLessonStages(){
  if(Object.keys(store.snapshot().lesson).length) return;
  if(!Object.keys(store.snapshot().words).length) return;
  for(const l of lessons){
    if(l.wordIds.every(id => store.getWord(id))) store.setLessonStage(l.id,'done');
  }
}

await store.load();
migrateLessonStages();
go('home');
