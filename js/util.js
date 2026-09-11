/* util.js - the two array helpers more than one module needs.
 *
 * Nothing here knows about words, screens or storage. They live apart
 * because both the router and the quiz shuffle and draw at random, and one
 * copy of a Fisher-Yates is better than two that can drift.
 */

/** A shuffled copy. The original is never touched. */
export function shuffle(a){
  const c = a.slice();
  for(let i = c.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1)); [c[i],c[j]] = [c[j],c[i]];
  }
  return c;
}

/** One element at random, undefined for an empty array. */
export const one = a => a[Math.floor(Math.random()*a.length)];
