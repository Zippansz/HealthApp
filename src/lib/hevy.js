import { parseCSV } from './csv';

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "27 Oct 2026, 20:37" -> "2026-10-27T20:37"
export function parseHevyDate(s) {
  const m = /^(\d{1,2}) (\w{3}) (\d{4}), (\d{1,2}):(\d{2})/.exec((s || '').trim());
  if (!m) return null;
  const p = n => String(n).padStart(2, '0');
  return `${m[3]}-${p(MONTHS[m[2]])}-${p(m[1])}T${p(m[4])}:${m[5]}`;
}
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const n = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };

// Turns a Hevy CSV export into workouts. The id is built from title + start time, so importing
// overlapping exports never creates duplicates.
export function parseHevy(text) {
  const { rows } = parseCSV(text);
  const map = new Map();
  for (const r of rows) {
    const start = parseHevyDate(r.start_time);
    if (!start) continue;
    const id = hash(`${r.title}|${start}`);
    if (!map.has(id)) map.set(id, { id, data: { title: r.title, date: start.slice(0, 10), start, end: parseHevyDate(r.end_time), description: r.description || '', exercises: [] } });
    const w = map.get(id).data;
    let ex = w.exercises.find(e => e.name === r.exercise_title);
    if (!ex) { ex = { name: r.exercise_title, notes: r.exercise_notes || '', sets: [] }; w.exercises.push(ex); }
    ex.sets.push({ type: r.set_type || 'normal', kg: n(r.weight_kg), reps: n(r.reps), dist: n(r.distance_km), sec: n(r.duration_seconds), rpe: n(r.rpe) });
  }
  return [...map.values()];
}

// Several Hevy sessions on the same date count as ONE workout (stored data stays per session, so re-imports never duplicate).
export function mergeByDate(workouts) {
  const days = new Map();
  for (const w of workouts) {
    const d = days.get(w.date) || { id: w.date, date: w.date, titles: [], start: w.start, end: w.end, mins: 0, exercises: [] };
    if (!d.titles.includes(w.title)) d.titles.push(w.title);
    if (w.start < d.start) d.start = w.start;
    if (w.end && (!d.end || w.end > d.end)) d.end = w.end;
    if (w.end) d.mins += Math.max(0, Math.round((new Date(w.end) - new Date(w.start)) / 60000));
    for (const e of w.exercises) {
      const x = d.exercises.find(y => y.name === e.name);
      if (x) { x.sets = [...x.sets, ...e.sets]; if (e.notes && !x.notes.includes(e.notes)) x.notes = [x.notes, e.notes].filter(Boolean).join(' / '); }
      else d.exercises.push({ ...e, sets: [...e.sets] });
    }
    days.set(w.date, d);
  }
  return [...days.values()].map(({ titles, ...d }) => ({ ...d, title: titles.join(' + ') }));
}

// Parses the text Hevy produces with "Share → Copy" (title, date line, exercise blocks with "Set 1: 35 kg x 28").
// Uses the same id formula as the CSV import, so a later CSV import of the same workout never duplicates it.
const TYPES = { drop: 'dropset', dropset: 'dropset', 'warm-up': 'warmup', warmup: 'warmup', failure: 'failure' };
function parseShareDate(s) {
  const m = /(\w{3})\w*\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(s || '');
  if (!m || !MONTHS[m[1]]) return null;
  let h = +m[4];
  const ap = (m[6] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const p = x => String(x).padStart(2, '0');
  return `${m[3]}-${p(MONTHS[m[1]])}-${p(m[2])}T${p(h)}:${m[5]}`;
}
const toSec = t => t.split(':').reduce((a, x) => a * 60 + +x, 0);
function parseSet(body) {
  const set = { type: 'normal', kg: null, reps: null, dist: null, sec: null, rpe: null };
  const tag = /\[([^\]]+)\]/.exec(body);
  if (tag) set.type = TYPES[tag[1].trim().toLowerCase()] || 'normal';
  const b = body.replace(/\[[^\]]*\]/g, '').trim();
  let m;
  if ((m = /@\s*([\d.,]+)\s*rpe/i.exec(b))) set.rpe = n(m[1]);
  if ((m = /([\d.,]+)\s*(kg|lbs?)\s*x\s*(\d+)/i.exec(b))) {
    set.kg = n(m[1]); if (/lb/i.test(m[2])) set.kg = Math.round(set.kg * 0.45359237 * 10) / 10;
    set.reps = n(m[3]);
  } else if ((m = /^(\d+)\s*reps?/i.exec(b))) set.reps = n(m[1]);
  if ((m = /([\d.,]+)\s*km/i.exec(b))) set.dist = n(m[1]);
  if ((m = /(\d+:\d{2}(?::\d{2})?)/.exec(b))) set.sec = toSec(m[1]);
  return set;
}
export function parseHevyText(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim());
  const title = lines.find(Boolean);
  const start = lines.map(parseShareDate).find(Boolean);
  if (!title || !start) throw new Error('Could not find the workout title and date. Paste the whole text from Hevy.');
  const w = { title, date: start.slice(0, 10), start, end: null, description: '', exercises: [] };
  let ex = null;
  for (const l of lines) {
    const s = /^Set\s+\d+\s*:\s*(.+)$/i.exec(l);
    if (s) {
      if (ex) ex.sets.push(parseSet(s[1]));
    } else if (l && l !== title && !parseShareDate(l) && !/^@hevy|^https?:\/\//i.test(l)) {
      ex = { name: l, notes: '', sets: [] }; w.exercises.push(ex);
    }
  }
  w.exercises = w.exercises.filter(e => e.sets.length);
  if (!w.exercises.length) throw new Error('No sets found in the pasted text.');
  return { id: hash(`${title}|${start}`), data: w };
}
