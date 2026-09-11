/* reader.js - the reading screen.
 *
 * It is handed a passage ({ text, source }) and does two things:
 * paints it, and hangs a tooltip on every <mark data-word="..."> the data
 * already carries. It never looks a word up itself - the caller passes a
 * dictionary, so the same module serves lessons and extra reading alike.
 */
import { showTooltip, hideTooltip } from './tooltip.js';

/**
 * @param {HTMLElement} container element to render into
 * @param {{text:string, source?:string}} passage
 * @param {Map<string,object>} dict headword -> word object
 */
export function initReader(container, passage, dict){
  container.innerHTML =
    `<div class="story">${passage.text}</div>` +
    (passage.source ? `<div class="source">${passage.source}</div>` : '');

  container.querySelectorAll('mark').forEach(el => {
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');

    const open = e => {
      e.stopPropagation();
      const word = dict.get(el.dataset.word);
      if(!word) return;
      // translation is on the word object but left out of the tooltip for now
      showTooltip(el, {
        title: `${word.word} /${word.ipa}/`,
        say: { id: word.id, word: word.word },
        hint: word.definition
      });
    };

    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') open(e); });
  });

  return { destroy: hideTooltip };
}

/** headword -> word object, for the dictionary argument above. */
export const dictOf = words => new Map(words.map(w => [w.word, w]));
