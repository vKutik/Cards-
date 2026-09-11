/* progress.js - the round progress gauge and the small legend under it.
 * Pure rendering: hand it the four counts, it returns markup. */

const ARC = 282.74;   // length of the 90px semicircle drawn below

/**
 * @param {{known:number, read:number, started:number, total:number}} c
 * @returns {string} markup for the gauge plus its legend
 */
export function progressRing(c){
  const pct = Math.round(100 * c.known / c.total);
  // three arcs stacked on one path, each drawn over the previous one
  const green   = ARC * c.known / c.total;
  const amber   = ARC * (c.known + c.read) / c.total;
  const red     = ARC * (c.known + c.read + c.started) / c.total;
  const seg = (colour, len) =>
    `<path class="seg" d="M20 112 A90 90 0 0 1 200 112" stroke="${colour}" stroke-dasharray="${len} ${ARC}"/>`;

  return `
  <div class="gauge">
    <svg viewBox="0 0 220 124" width="100%" role="img" aria-label="${pct}% learned">
      ${seg('var(--track)', ARC)}
      ${seg('var(--red)', red)}
      ${seg('var(--amber)', amber)}
      ${seg('var(--green)', green)}
      <text class="gnum" x="110" y="96" text-anchor="middle">${pct}<tspan class="gpct">%</tspan></text>
    </svg>
  </div>
  <div class="key">
    <span><i class="dot known"></i>Learned <b>${c.known}</b></span>
    <span><i class="dot read"></i>Seen <b>${c.read}</b></span>
    <span><i class="dot started"></i>Started <b>${c.started}</b></span>
  </div>`;
}

/**
 * The familiarity index: three dots telling the story of one word rather
 * than a percentage. Filled dots are steps taken; a cooling one has faded
 * because the word is long past due. At three the dots close into a line.
 *
 * @param {{level:number, cooling:boolean}} fam from srs.familiarity()
 */
export function familiarityDots(fam){
  const titles = ['not met in a text yet', 'read in a text',
                  'answered from the text', 'mastered'];
  const dots = [0,1,2].map(i => {
    if(i >= fam.level) return '<i></i>';
    const last = i === fam.level - 1;
    return `<i class="on${fam.cooling && last ? ' cool' : ''}"></i>`;
  }).join('');
  return `<span class="fam${fam.level === 3 ? ' full' : ''}"
    role="img" aria-label="${titles[fam.level]}" title="${titles[fam.level]}">${dots}</span>`;
}
