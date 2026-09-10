/* flashcard.js - stage 1. The word, how it sounds, what it means, and one
 * sentence around it. No test here: a test one second after reading the
 * answer proves nothing, the real check is the review tomorrow.
 */
import { sessionBar } from './progress.js';
import { speak } from './audio.js';
import * as store from '../storage.js';

/** The example currently chosen for a word, and how to step through them. */
export const exampleOf = word => word.examples[store.getExample(word.id) % word.examples.length];
export const exampleNo = word => (store.getExample(word.id) % word.examples.length) + 1;
export const nextExample = word =>
  store.setExample(word.id, (store.getExample(word.id) + 1) % word.examples.length);

/** {target} -> <mark>target</mark> so examples look like the reading screen. */
export const withMarks = s => s.replace(/\{(.+?)\}/g, '<mark>$1</mark>');

/**
 * @param {HTMLElement} container
 * @param {object} word
 * @param {{index:number,total:number,label:string,next:string}} pos
 * @param {{onNext:Function, onRerender:Function}} handlers
 */
export function renderFlashcard(container, word, pos, handlers){
  container.innerHTML = sessionBar(pos.index, pos.total) + `
    <div class="top"><span class="pill">${pos.label}</span></div>
    <div class="card">
      <div class="word">${word.word}</div>
      <div class="pos">/${word.ipa}/ · ${word.pos}</div>
      <button class="say" data-say="${word.word}">🔊 listen</button>
      <!-- word.translation exists on every word (see js/data/words.js) but is
           hidden in the UI for now, per request - data stays, display doesn't. -->
      <div class="def">${word.definition}</div>
      <div class="ex">${withMarks(exampleOf(word))}</div>
      ${word.opposite !== '—' ? `<div class="anto">opposite: ${word.opposite}</div>` : ''}
      <div class="exnav">example ${exampleNo(word)} of ${word.examples.length}</div>
    </div>
    <button class="go" id="next">${pos.next}</button>
    <button class="go ghost" id="alt">Show another example</button>`;

  container.querySelector('[data-say]').onclick = () => speak(word.word);
  container.querySelector('#next').onclick = handlers.onNext;
  container.querySelector('#alt').onclick = async () => {
    await nextExample(word);
    handlers.onRerender();
  };
}
