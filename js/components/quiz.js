/* quiz.js - one question engine for every kind of question in the app.
 *
 * A question is always { question, options, correctIndex, wordId? }.
 * Where it came from - written into the lesson, or generated from the word
 * list - is not this module's business.
 */
import { sessionBar } from './progress.js';

/* ---------- question builders ---------- */

/** Shuffle, keeping track of where the right answer went. */
function shuffled(q){
  const tagged = q.options.map((text,i) => ({ text, ok: i === q.correctIndex }));
  for(let i = tagged.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return tagged;
}

const pickSome = (arr, n) => {
  const c = arr.slice();
  for(let i = c.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1)); [c[i],c[j]] = [c[j],c[i]];
  }
  return c.slice(0, n);
};

/** "What does <b>trembled</b> mean here?" - wrong answers are real
 *  definitions of other words, same part of speech where possible. */
export function meaningQuestion(word, allWords, exclude = []){
  const pool = allWords.filter(w => w.id !== word.id && !exclude.includes(w.id));
  const same = pickSome(pool.filter(w => w.pos === word.pos), 3);
  const wrong = same.length === 3 ? same : same.concat(pickSome(pool, 3 - same.length));
  return {
    wordId: word.id,
    question: `In this passage, what does <b>${word.word}</b> mean?`,
    options: [word.definition, ...wrong.map(w => w.definition)],
    correctIndex: 0
  };
}

/** Gap-fill: the word's own example with the target blanked out. */
export function gapQuestion(word, allWords){
  const sentence = word.examples[0] || '';
  const surface = (sentence.match(/\{(.+?)\}/) || [,word.word])[1];
  const blanked = sentence.replace(/\{.+?\}/, '<u> </u>');
  const wrong = pickSome(allWords.filter(w => w.id !== word.id && w.pos === word.pos), 3);
  return {
    wordId: word.id,
    question: `Which word fits the gap?<div class="cloze">${blanked}</div>`,
    options: [surface, ...wrong.map(w => w.word)],
    correctIndex: 0
  };
}

/* ---------- the runner ---------- */

/**
 * @param {HTMLElement} container
 * @param {Array} questions
 * @param {{onAnswer?:(q,ok)=>void, onDone:(score,total)=>void}} handlers
 */
export function runQuiz(container, questions, handlers){
  let i = 0, score = 0, options = null;

  function draw(){
    if(i >= questions.length) return handlers.onDone(score, questions.length);

    const q = questions[i];
    if(!options) options = shuffled(q);

    container.innerHTML = sessionBar(i, questions.length) + `
      <div class="top"><span class="pill">Question ${i+1} of ${questions.length}</span></div>
      <div class="card">
        <p class="def">${q.question}</p>
        ${options.map((o,k) => `<button class="opt" data-k="${k}">${o.text}</button>`).join('')}
      </div>`;

    container.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const chosen = options[+btn.dataset.k];
      btn.className = 'opt ' + (chosen.ok ? 'right' : 'wrong');
      if(chosen.ok) score++;
      handlers.onAnswer && handlers.onAnswer(q, chosen.ok);
      container.querySelectorAll('.opt').forEach(b => b.onclick = null);
      setTimeout(() => { i++; options = null; draw(); }, 600);
    });
  }

  draw();
}
