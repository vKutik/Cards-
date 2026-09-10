/* review.js - the spaced-repetition screen. Recall first, reveal second,
 * then say how hard it was; srs.js turns that into the next due date. */
import { sessionBar } from './progress.js';
import { speak, exampleOf, exampleNo, nextExample, withMarks } from './flashcard.js';
import * as srs from '../srs.js';
import * as store from '../storage.js';

const clozeOf = s => s.replace(/\{.+?\}/, '<u> </u>');

const GRADES = [
  { g:0, label:'Forgot', note:'again today',      cls:'g0' },
  { g:1, label:'Hard',   note:'same interval',    cls:''   },
  { g:2, label:'Good',   note:'next interval',    cls:''   },
  { g:3, label:'Easy',   note:'skip an interval', cls:'g3' }
];

/**
 * @param {HTMLElement} container
 * @param {object} word
 * @param {{index:number,total:number,revealed:boolean}} pos
 * @param {{onReveal:Function, onGrade:(g:number)=>void, onRerender:Function}} handlers
 */
export function renderReview(container, word, pos, handlers){
  const seen = store.getWord(word.id)?.seen || 0;

  if(!pos.revealed){
    // alternate between "which word is missing" and "what does it mean"
    const askCloze = seen % 2 === 0;
    container.innerHTML = sessionBar(pos.index, pos.total) + `
      <div class="top">
        <span class="pill">Review ${pos.index+1} of ${pos.total}</span>
        <span class="pill">${srs.STEP_NAME[srs.stepOf(word.id)]}</span>
      </div>
      <div class="card">
        ${askCloze
          ? `<p class="muted">Which word is missing?</p><div class="cloze">${clozeOf(exampleOf(word))}</div>`
          : `<p class="muted">What does this word mean?</p>
             <div class="word">${word.word}</div><div class="pos">/${word.ipa}/ · ${word.pos}</div>`}
        <p class="muted">Recall it yourself, out loud, and only then reveal it.</p>
      </div>
      <button class="go" id="show">Show answer</button>`;
    container.querySelector('#show').onclick = handlers.onReveal;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="word">${word.word}</div>
      <div class="pos">/${word.ipa}/ · ${word.pos}</div>
      <button class="say" data-say="${word.word}">🔊 listen</button>
      <!-- translation hidden in the UI for now, see flashcard.js -->
      <div class="def">${word.definition}</div>
      <div class="ex">${withMarks(exampleOf(word))}</div>
      ${word.opposite !== '—' ? `<div class="anto">opposite: ${word.opposite}</div>` : ''}
      <div class="exnav">example ${exampleNo(word)} of ${word.examples.length}</div>
      <button class="say alt" id="alt" style="margin:10px 0 0">Show another example</button>
    </div>
    <p class="muted">How easily did it come back?</p>
    <div class="grade">
      ${GRADES.map(x => `<button class="${x.cls}" data-g="${x.g}">${x.label}<small>${x.note}</small></button>`).join('')}
    </div>`;

  container.querySelector('[data-say]').onclick = () => speak(word.word);
  container.querySelector('#alt').onclick = async () => { await nextExample(word); handlers.onRerender(); };
  container.querySelectorAll('[data-g]').forEach(b =>
    b.onclick = () => handlers.onGrade(+b.dataset.g));
}
