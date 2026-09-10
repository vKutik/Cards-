/* tooltip.js - one tooltip at a time, positioned over #tooltip-layer.
 * Kept apart from reader.js so any screen can use it. */
import { speak } from './audio.js';

const layer = () => document.getElementById('tooltip-layer');
let open = null;   // { el, anchor }

export function hideTooltip(){
  if(!open) return;
  open.anchor.classList.remove('open');
  open.el.remove();
  open = null;
}

/**
 * @param {HTMLElement} anchor element the bubble points at
 * @param {{title:string, say?:string, translation?:string, hint?:string}} content
 *        `say` is the text the speaker button reads out, if it should have one
 */
export function showTooltip(anchor, content){
  const wasSame = open && open.anchor === anchor;
  hideTooltip();
  if(wasSame) return;               // tapping the same word closes it

  const el = document.createElement('div');
  el.className = 'tooltip';
  el.innerHTML =
    `<div class="tiphead"><b>${content.title}</b>` +
    (content.say ? `<button class="tipsay" aria-label="Listen">🔊</button>` : '') +
    `</div>` +
    (content.translation ? `<div class="tr">${content.translation}</div>` : '') +
    (content.hint ? `<div class="hint">${content.hint}</div>` : '');
  layer().appendChild(el);

  if(content.say){
    const say = el.querySelector('.tipsay');
    // stop the tap here: the document-level listener would close the bubble
    say.onclick = e => { e.stopPropagation(); speak(content.say); };
  }

  const a = anchor.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  const margin = 8;

  // prefer below; flip above when there is no room
  const below = a.bottom + margin + t.height < window.innerHeight;
  const top = below ? a.bottom + margin : a.top - t.height - margin;

  let left = a.left + a.width/2 - t.width/2;
  left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin));

  el.style.top = `${Math.max(margin, top)}px`;
  el.style.left = `${left}px`;
  el.classList.add(below ? 'below' : 'above');
  el.style.setProperty('--arrow', `${a.left + a.width/2 - left}px`);

  anchor.classList.add('open');
  open = { el, anchor };
  requestAnimationFrame(() => el.classList.add('show'));
}

/* One global listener: any tap that is not on a mark or a tooltip closes it. */
document.addEventListener('click', e => {
  if(open && !e.target.closest('mark') && !e.target.closest('.tooltip')) hideTooltip();
}, true);
window.addEventListener('resize', hideTooltip);
document.addEventListener('keydown', e => { if(e.key === 'Escape') hideTooltip(); });
