/* app.js - entry point: boot, routing, and the screens that glue the
 * components together. Screens decide what to show; they never persist
 * anything themselves (storage.js) and never schedule anything (srs.js).
 */
import { words, lessons, passages, wordById, lessonWords, openPassages, DAILY_NEW_LIMIT }
  from './data.js';
import * as store from './storage.js';
import * as srs from './srs.js';
import * as settings from './settings.js';
import { progressRing, stageStrip, sessionBar } from './components/progress.js';
import { renderFlashcard, speak, withMarks } from './components/flashcard.js';
import { renderReview } from './components/review.js';
import { initReader, dictOf } from './components/reader.js';
import { runQuiz, meaningQuestion, gapQuestion } from './components/quiz.js';
import { hideTooltip } from './components/tooltip.js';

const screen = () => document.getElementById('screen');
const DICT = dictOf(words);

/* ---------------- router ---------------- */
const routes = {};
let current = { name:'home', params:{} };

export function go(name, params = {}){
  hideTooltip();
  current = { name, params };
  window.scrollTo(0,0);
  routes[name](params);
}
const rerender = () => routes[current.name](current.params);

const backButton = (label = 'Back', to = 'home') =>
  `<button class="go ghost" data-back="${to}">${label}</button>`;
const wireBack = () => screen().querySelectorAll('[data-back]')
  .forEach(b => b.onclick = () => go(b.dataset.back));

/* ---------------- home ---------------- */
routes.home = () => {
  const dueIds   = srs.due();
  const newIds   = srs.nextNewWords();
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
      ${lesson ? `${resumeStage(lesson) ? 'Continue' : 'Lesson'} ${lesson.id} · ${lesson.title}`
                : (wait ? `New words in ${srs.hhmm(wait)}` : 'All lessons opened')}
    </button>
    <button class="go ghost" id="reading" ${reading.length ? '' : 'disabled'}>Reading practice</button>
    <button class="go ghost" id="list">Word list</button>
    <button class="linkbtn" id="settings">Settings</button>`;

  const on = (id, fn) => { const el = screen().querySelector('#'+id); if(el) el.onclick = fn; };
  on('review',   () => go('review',  { queue: shuffle(dueIds), i:0, revealed:false, right:0 }));
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
  if(stage === 1) return lessonReading(lesson, ws);
  return lessonQuiz(lesson, ws);
};

function lessonCards(lesson, ws, i){
  const word = ws[i];
  const head = `<h1>${lesson.title}</h1>` + stageStrip(0);
  screen().innerHTML = head + '<div id="stage"></div>';

  renderFlashcard(screen().querySelector('#stage'), word,
    { index:i, total:ws.length, label:`New word ${i+1} of ${ws.length}`,
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

function lessonReading(lesson, ws){
  screen().innerHTML = `<h1>${lesson.title}</h1>` + stageStrip(1) + `
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
  // written comprehension questions, plus one gap-fill built from the words
  const questions = [
    ...lesson.quiz,
    gapQuestion(ws[Math.floor(Math.random()*ws.length)], words)
  ];
  screen().innerHTML = `<h1>${lesson.title}</h1>` + stageStrip(2) + '<div id="stage"></div>';

  runQuiz(screen().querySelector('#stage'), questions, {
    onAnswer: (q, ok) => { if(ok && q.wordId != null) store.markReadCorrect(q.wordId); },
    onDone: async (score, total) => {
      await store.setLessonStage(lesson.id,'done');
      screen().innerHTML = `<h1>${score} of ${total}</h1>
        <div class="card muted"><p>${score === total
          ? 'The text carried every answer. That is how words are learned outside a card.'
          : 'Read the story once more and look at the sentence around each word.'}</p></div>
        <button class="go" id="again">Read it again</button>
        ${backButton('Done','home')}`;
      screen().querySelector('#again').onclick = () => go('lesson',{ id:lesson.id, stage:1 });
      wireBack();
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
    { index:i, total:queue.length, revealed },
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

/* ---------------- extra reading ---------------- */
routes.reading = ({ id = null } = {}) => {
  const open = openPassages(srs.introducedIds());
  if(!open.length) return go('home');

  const passage = id === null ? pickPassage(open) : passages[id];
  const wait = srs.unlockIn();

  screen().innerHTML = `<h1>Reading practice</h1>
    <p class="muted">${open.length} passage${open.length===1?'':'s'} open${wait ? ` · more in ${srs.hhmm(wait)}` : ''}</p>
    <div class="card" id="stage"></div>
    <button class="go" id="quiz">Answer the questions</button>
    <button class="go ghost" id="another">Another passage</button>
    ${backButton('Back','home')}`;

  initReader(screen().querySelector('#stage'), passage, DICT);
  screen().querySelector('#quiz').onclick = () => go('readingQuiz', { id: passage.id });
  screen().querySelector('#another').onclick = () => go('reading');
  wireBack();
};

/** Prefer a passage never read, and never the one just shown. */
let lastPassage = null;
function pickPassage(open){
  let pool = open.filter(p => !store.isPassageRead(p.id));
  if(!pool.length) pool = open;
  if(pool.length > 1) pool = pool.filter(p => p.id !== lastPassage);
  const chosen = pool[Math.floor(Math.random()*pool.length)];
  lastPassage = chosen.id;
  return chosen;
}

routes.readingQuiz = ({ id }) => {
  const passage = passages[id];
  const questions = passage.wordIds.map(wid => meaningQuestion(wordById(wid), words, passage.wordIds));
  screen().innerHTML = '<div id="stage"></div>';

  runQuiz(screen().querySelector('#stage'), questions, {
    // getting it right from the passage alone is what turns a word amber
    onAnswer: (q, ok) => { if(ok) store.markReadCorrect(q.wordId); },
    onDone: async (score, total) => {
      await store.markPassageRead(passage.id);
      screen().innerHTML = `<h1>${score} of ${total}</h1>
        <div class="card muted"><p>${score === total
          ? 'You read the meaning out of the sentences around it. That is how words are actually learned.'
          : 'Read it once more and look at what happens either side of the word.'}</p></div>
        <button class="go" id="another">Another passage</button>
        <button class="go ghost" id="again">Read it again</button>
        ${backButton('Back','home')}`;
      screen().querySelector('#another').onclick = () => go('reading');
      screen().querySelector('#again').onclick = () => go('reading',{ id: passage.id });
      wireBack();
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
        <span class="dot ${srs.stepOf(w.id)}"></span><b>${w.word}</b>
        <span class="ipos">/${w.ipa}/ · ${w.pos}</span>
        <button class="say tiny" data-say="${w.word}">🔊</button>
      </div>
      <div class="idef">${w.definition}</div>
      <div class="ex">${withMarks(w.examples[0])}</div>
      ${w.opposite !== '—' ? `<div class="anto">opposite: ${w.opposite}</div>` : ''}
    </div>`).join('')
    : '<div class="card muted">Nothing here yet. Open your first lesson to start.</div>';

  screen().innerHTML = `<h1>Word list</h1>${body}${backButton('Back','home')}`;
  screen().querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
  wireBack();
};

/* ---------------- settings ---------------- */
/* Nothing here is essential to the learning flow. The "Developer" card is
 * hidden until settings.registerUnlockTap() says five taps landed on the
 * title within its window - not something a learner stumbles into, but not
 * a secret either: the title says so. */
routes.settings = ({ confirming = false, note = '' } = {}) => {
  screen().innerHTML = `<h1>Settings</h1>
    <div class="card">
      <h2 id="tap" style="cursor:default">Vocabulary trainer</h2>
      <p class="muted">Saving to: ${store.storageLabel()}</p>
    </div>
    ${settings.isDevMode() ? devCard(confirming, note) : ''}
    ${backButton('Back','home')}`;

  screen().querySelector('#tap').onclick = () => {
    if(settings.registerUnlockTap()) go('settings', { note:'Developer mode unlocked.' });
  };

  const del = screen().querySelector('#devDelete');
  if(del) del.onclick = () => go('settings', { confirming:true });
  const yes = screen().querySelector('#devYes');
  if(yes) yes.onclick = async () => { await store.resetAll(); go('home'); };
  const no = screen().querySelector('#devNo');
  if(no) no.onclick = () => go('settings');

  wireBack();
};

function devCard(confirming, note){
  return `
    <div class="card">
      <h2>Developer</h2>
      ${note ? `<div class="fb ok">${note}</div>` : ''}
      <p class="muted">Not part of the normal flow. Deletes every word, lesson and log
        on this device - there is no undo.</p>
      ${confirming
        ? `<div class="fb no">Delete all progress? This cannot be undone.</div>
           <button class="go danger" id="devYes">Yes, delete everything</button>
           <button class="go ghost" id="devNo">Cancel</button>`
        : `<button class="go danger" id="devDelete">Delete all progress</button>`}
    </div>`;
}

/* ---------------- helpers ---------------- */
function shuffle(a){
  const x = a.slice();
  for(let i = x.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1)); [x[i],x[j]] = [x[j],x[i]];
  }
  return x;
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
