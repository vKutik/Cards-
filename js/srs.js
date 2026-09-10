/* srs.js - the scheduling rules. No DOM, no storage internals: it reads a
 * snapshot and writes back through storage.js, so the same logic can move to
 * a Python service untouched.
 */
import { words, DAILY_NEW_LIMIT } from './data.js';
import * as store from './storage.js';

/** Review intervals in days. The spacing is the part that does the work. */
export const STEPS = [1, 3, 7, 16, 35, 90];
const DAY = 864e5;

export const today = () => new Date().toISOString().slice(0,10);
const daysBetween = (a,b) => Math.round((new Date(b) - new Date(a)) / DAY);

/* ---------- the four steps a word moves through ----------
 *   new     never opened                       grey
 *   started its first flashcard is done        red
 *   read    proved inside a passage            amber
 *   known   box 4, the interval is months      green
 * Reading only recolours a word; it never moves its due date.
 */
export const STEP_NAME = { started:'Started', read:'Seen', known:'Learned' };

export function stepOf(id){
  const s = store.getWord(id);
  if(!s) return 'new';
  if(s.box >= 4) return 'known';
  return store.isReadProven(id) ? 'read' : 'started';
}

export const countStep = step =>
  Object.keys(store.snapshot().words).filter(id => stepOf(+id) === step).length;

/** Ids of every word already introduced - what unlocks reading. */
export const introducedIds = () => new Set(Object.keys(store.snapshot().words).map(Number));

/* ---------- what is due ---------- */
export function due(){
  const t = today();
  return Object.keys(store.snapshot().words)
    .filter(id => daysBetween(store.getWord(id).next, t) >= 0)
    .map(Number);
}

/* ---------- the daily cap on new words ---------- */
const startTimes = () => {
  const now = Date.now();
  return Object.keys(store.snapshot().words)
    .map(id => store.getWord(id).new)
    .filter(t => t && now - t < DAY)
    .sort((a,b) => a-b);
};

export const newQuota = () => Math.max(0, DAILY_NEW_LIMIT - startTimes().length);

/** Milliseconds until the cap frees up again, 0 if it already has. */
export function unlockIn(){
  const r = startTimes();
  if(r.length < DAILY_NEW_LIMIT) return 0;
  return Math.max(0, r[r.length - DAILY_NEW_LIMIT] + DAY - Date.now());
}

export function hhmm(ms){
  const m = Math.ceil(ms/6e4), h = Math.floor(m/60);
  return h ? `${h}h ${m%60}m` : `${m}m`;
}

/** The next words that may be opened right now, in list order. */
export const nextNewWords = () =>
  words.map(w => w.id).filter(id => !store.getWord(id)).slice(0, newQuota());

/* ---------- transitions ---------- */
export function introduce(id){
  const s = store.getWord(id) || { box:0, right:0, wrong:0, seen:0 };
  if(!s.new) s.new = Date.now();
  const d = new Date(); d.setDate(d.getDate() + STEPS[0]);
  s.next = d.toISOString().slice(0,10);
  s.lastSeen = today();
  return store.putWord(id, s);
}

/** grade: 0 forgot, 1 hard, 2 good, 3 easy. */
export function grade(id, g){
  const s = store.getWord(id) || { box:0, right:0, wrong:0, seen:0 };
  s.seen++;
  if(g === 0){ s.wrong++; s.box = 0; }                 // forgot: back to day one
  else { s.right++; s.box = Math.min(STEPS.length-1, s.box + (g === 1 ? 0 : g === 2 ? 1 : 2)); }
  const d = new Date(); d.setDate(d.getDate() + STEPS[s.box]);
  s.next = d.toISOString().slice(0,10);
  s.lastSeen = today();
  store.logAnswer(g > 0);
  return store.putWord(id, s);
}
