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
