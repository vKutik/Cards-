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
    <span>🟢 Learned <b>${c.known}</b></span>
    <span>🟠 Seen <b>${c.read}</b></span>
    <span>🔴 Started <b>${c.started}</b></span>
  </div>`;
}

/** Thin bar used inside a session. */
export const sessionBar = (done, total) =>
  `<div class="bar"><span style="width:${Math.round(100*done/Math.max(1,total))}%"></span></div>`;

/** Three dots showing where you are inside a lesson. */
export const stageStrip = step =>
  `<div class="stages">${[0,1,2].map(i => `<i class="${i<=step?'on':''}"></i>`).join('')}</div>`;
