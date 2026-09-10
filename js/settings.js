/* settings.js - app-level preferences, kept apart from storage.js: this is
 * how the app is shown, not learning progress. Currently just the developer
 * flag; grows here if real user-facing settings arrive later.
 */
const KEY = 'vocab-settings';

const defaults = () => ({ devMode: false });

let state = defaults();
try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch(e){}

function persist(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){} }

export const isDevMode = () => state.devMode;
export function setDevMode(v){ state.devMode = !!v; persist(); }

/* Developer mode is not a button anyone taps by accident: it unlocks the
 * same way Android's build-number trick does - five taps on one label,
 * inside a short window, resets if you pause too long. */
const UNLOCK_TAPS = 5;
const TAP_WINDOW_MS = 1500;
let tapCount = 0, tapTimer = null;

/** Call on every tap of the unlock label. Returns true the moment dev mode
 *  turns on (so the caller can react once, not on every tap after). */
export function registerUnlockTap(){
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, TAP_WINDOW_MS);
  if(tapCount >= UNLOCK_TAPS){
    tapCount = 0;
    if(!state.devMode){ setDevMode(true); return true; }
  }
  return false;
}
