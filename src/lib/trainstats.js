import { addDays, daysBetween } from './calc';
import { muscleOf, bwShare, MUSCLE_ORDER } from './muscles';

export const MAX_REPS = 30;
const hardSets = e => e.sets.filter(s => s.type !== 'warmup' && s.reps > 0);
const setScore = s => ((s.kg || 0) > 0 ? s.kg * s.reps : s.reps); // best-set measure: kg x reps, or reps for bodyweight
export const topSet = sets => sets.reduce((m, s) => (setScore(s) > setScore(m) ? s : m), sets[0]);
export const mondayOf = d => addDays(d, -((new Date(d + 'T12:00:00').getDay() + 6) % 7));

// name -> sessions [{date, title, notes, sets(hard)}], oldest first. Workouts are already merged per date.
export function history(workouts) {
  const by = new Map();
  for (const w of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of w.exercises) {
      const sets = hardSets(e); if (!sets.length) continue;
      if (!by.has(e.name)) by.set(e.name, []);
      by.get(e.name).push({ date: w.date, title: w.title, notes: e.notes || '', sets });
    }
  }
  return by;
}

// Personal records per session: heaviest weight, most reps at (or above) a weight, best single-set volume.
// The very first session of an exercise only sets the baseline.
export function prEvents(workouts) {
  const out = [];
  for (const [name, sessions] of history(workouts)) {
    const prev = [];
    let maxKg = 0, maxVol = 0, maxReps = 0;
    sessions.forEach((s, i) => {
      const types = new Set();
      if (i > 0) for (const set of s.sets) {
        const kg = set.kg || 0, reps = set.reps;
        if (kg > 0) {
          if (kg > maxKg + 1e-9) types.add('weight');
          if (kg * reps > maxVol + 1e-9) types.add('volume');
          const best = prev.reduce((m, p) => (p.kg >= kg - 1e-9 ? Math.max(m, p.reps) : m), 0);
          if (best > 0 && reps > best) types.add('reps');
        } else if (reps > maxReps) types.add('reps');
      }
      for (const set of s.sets) {
        const kg = set.kg || 0;
        maxKg = Math.max(maxKg, kg); maxVol = Math.max(maxVol, kg * set.reps);
        if (!kg) maxReps = Math.max(maxReps, set.reps);
        prev.push({ kg, reps: set.reps });
      }
      if (types.size) out.push({ date: s.date, name, types: [...types], top: topSet(s.sets) });
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// Exercises done regularly with no record for 6+ weeks.
export function stalled(workouts, today, events) {
  const lastPr = {};
  events.forEach(e => { if (!lastPr[e.name] || e.date > lastPr[e.name]) lastPr[e.name] = e.date; });
  const res = [];
  for (const [name, sessions] of history(workouts)) {
    if (sessions.length < 5 || daysBetween(sessions.at(-1).date, today) > 70) continue;
    const ref = lastPr[name] || sessions[0].date;
    const since = sessions.filter(s => s.date > ref).length;
    const weeks = Math.floor(daysBetween(ref, today) / 7);
    if (weeks >= 6 && since >= 3) res.push({ name, ref, weeks, since });
  }
  return res.sort((a, b) => b.weeks - a.weeks).slice(0, 8);
}

// Volume (kg x reps, plus a share of body weight for pull-ups etc.) per muscle between two dates (inclusive).
export function volumeByMuscle(workouts, from, to, bwAt = () => null) {
  const v = {};
  for (const w of workouts) {
    if (w.date < from || w.date > to) continue;
    for (const e of w.exercises) {
      const sets = hardSets(e); if (!sets.length) continue;
      const bw = (bwAt(w.date) || 0) * bwShare(e.name);
      const m = muscleOf(e.name);
      v[m] = (v[m] || 0) + sets.reduce((a, s) => a + ((s.kg || 0) + bw) * s.reps, 0);
    }
  }
  return v;
}

export function lastTrained(workouts) {
  const last = {};
  for (const w of workouts) for (const e of w.exercises) {
    if (!hardSets(e).length) continue;
    const m = muscleOf(e.name); if (!last[m] || w.date > last[m]) last[m] = w.date;
  }
  return last;
}

export function weekSummary(workouts, today, bwAt) {
  const start = mondayOf(today), prevStart = addDays(start, -7), prevEnd = addDays(start, -1);
  const inWeek = workouts.filter(w => w.date >= start && w.date <= today);
  const setsOf = w => w.exercises.reduce((a, e) => a + hardSets(e).length, 0);
  return {
    start,
    days: inWeek.filter(w => setsOf(w) > 0).length,
    sets: inWeek.reduce((a, w) => a + setsOf(w), 0),
    prevDays: workouts.filter(w => w.date >= prevStart && w.date <= prevEnd && setsOf(w) > 0).length,
    prevSets: workouts.filter(w => w.date >= prevStart && w.date <= prevEnd).reduce((a, w) => a + setsOf(w), 0),
    now: volumeByMuscle(workouts, start, today, bwAt),
    prev: volumeByMuscle(workouts, prevStart, prevEnd, bwAt),
  };
}

// Muscles trained earlier but not for 2+ weeks.
export function neglected(workouts, today) {
  const last = lastTrained(workouts);
  return Object.entries(last).map(([m, d]) => ({ name: m, days: daysBetween(d, today) }))
    .filter(x => x.name !== 'Other' && x.days >= 14 && x.days <= 150).sort((a, b) => b.days - a.days);
}

// Calendar grid, oldest week first. level: 0 none, 1 small (<8 sets), 2 normal, 3 big (20+ sets).
export function heatmap(workouts, today, weeks = 26) {
  const sets = {};
  workouts.forEach(w => { sets[w.date] = (sets[w.date] || 0) + w.exercises.reduce((a, e) => a + hardSets(e).length, 0); });
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, wi) => Array.from({ length: 7 }, (_, di) => {
    const date = addDays(first, wi * 7 + di); const n = sets[date] || 0;
    return { date, sets: n, future: date > today, level: n === 0 ? 0 : n < 8 ? 1 : n < 20 ? 2 : 3 };
  }));
}

// Bodyweight exercises you do often (pull-ups, push-ups, dips): reps per week, streak, best day.
export function practice(workouts, today) {
  const res = [];
  for (const [name, sessions] of history(workouts)) {
    if (!bwShare(name) || daysBetween(sessions.at(-1).date, today) > 120) continue;
    const per = {};
    sessions.forEach(s => { per[s.date] = Math.max(per[s.date] || 0, ...s.sets.map(x => x.reps)); });
    const start = mondayOf(today), prevStart = addDays(start, -7);
    const sum = (a, b) => Math.max(0, ...Object.entries(per).filter(([d]) => d >= a && d <= b).map(([, v]) => v));
    let streak = 0, d = per[today] ? today : addDays(today, -1);
    while (per[d]) { streak++; d = addDays(d, -1); }
    res.push({
      name, thisWeek: sum(start, today), lastWeek: sum(prevStart, addDays(start, -1)), streak,
      best: Math.max(...Object.values(per)), last: sessions.at(-1).date,
      daily: Array.from({ length: 14 }, (_, i) => per[addDays(today, i - 13)] || 0),
    });
  }
  return res.sort((a, b) => b.last.localeCompare(a.last) || b.thisWeek - a.thisWeek).slice(0, 4);
}

// Progress toward a set goal: "kg x reps" in one set (kg 0 = bodyweight reps).
export function goalProgress(goal, hist, today) {
  const sessions = hist.get(goal.name) || [];
  const target = goal.kg > 0 ? goal.kg * goal.reps : goal.reps;
  const per = sessions.map(s => ({ date: s.date, v: Math.max(...s.sets.map(setScore)), top: topSet(s.sets) }));
  if (!per.length) return { target, best: 0, pct: 0, bestSet: null, atWeight: 0, delta: null, etaWeeks: null, done: false };
  const bestRow = per.reduce((m, r) => (r.v > m.v ? r : m), per[0]);
  const atWeight = Math.max(0, ...sessions.flatMap(s => s.sets.filter(x => (x.kg || 0) >= goal.kg - 1e-9).map(x => x.reps)));
  const a = per.filter(r => daysBetween(r.date, today) < 42), b = per.filter(r => daysBetween(r.date, today) >= 42 && daysBetween(r.date, today) < 84);
  const delta = a.length && b.length ? Math.max(...a.map(r => r.v)) / Math.max(...b.map(r => r.v)) - 1 : null;
  // pace: straight line through the last 12 weeks of session bests
  const pts = per.filter(r => daysBetween(r.date, today) < 84);
  let etaWeeks = null;
  if (pts.length >= 4 && bestRow.v < target) {
    const xs = pts.map(r => daysBetween(pts[0].date, r.date)), ys = pts.map(r => r.v);
    const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length;
    const den = xs.reduce((p, x) => p + (x - mx) ** 2, 0);
    const slope = den ? xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0) / den : 0;
    if (slope > 0) { const level = Math.max(my + slope * (xs.at(-1) - mx), bestRow.v); etaWeeks = Math.ceil((target - level) / slope / 7); }
  }
  return { target, best: bestRow.v, pct: Math.min(1, bestRow.v / target), bestSet: bestRow.top, bestDate: bestRow.date, atWeight, delta, etaWeeks, done: bestRow.v >= target };
}

// Goals worth suggesting: the exercises you do most, aiming about 25% above your best set.
export function suggestGoals(hist, today, existing) {
  const have = new Set(existing.map(g => g.name));
  return [...hist.entries()]
    .map(([name, sessions]) => ({ name, n: sessions.filter(s => daysBetween(s.date, today) < 120).length, sessions }))
    .filter(x => x.n >= 4 && !have.has(x.name))
    .sort((a, b) => b.n - a.n).slice(0, 5)
    .map(x => {
      const t = topSet(x.sessions.flatMap(s => s.sets));
      const kg = t.kg || 0;
      // 30 reps is the ceiling: once reached, the next goal is a heavier weight
      if (t.reps >= MAX_REPS) return kg > 0 ? { name: x.name, kg: kg + 2.5, reps: MAX_REPS, now: t } : null;
      return { name: x.name, kg, reps: Math.min(MAX_REPS, Math.max(t.reps + 2, Math.ceil(t.reps * 1.25))), now: t };
    }).filter(Boolean);
}

// Workout detail: every exercise next to the previous time you did it.
export function compareWorkout(workout, workouts) {
  const hist = history(workouts);
  return workout.exercises.map(e => {
    const now = hardSets(e);
    const prevS = (hist.get(e.name) || []).filter(s => s.date < workout.date).at(-1) || null;
    const topNow = now.length ? topSet(now) : null, topPrev = prevS ? topSet(prevS.sets) : null;
    const delta = topNow && topPrev ? setScore(topNow) / setScore(topPrev) - 1 : null;
    return { name: e.name, notes: e.notes || '', now, allSets: e.sets, prev: prevS && prevS.sets, prevDate: prevS && prevS.date, topNow, topPrev, delta };
  });
}

// Average intake on training days (8+ hard sets) vs other days. dayTotals: {date: {kcal,p,f,c}}
export function intakeSplit(workouts, dayTotals, today) {
  const sets = {};
  workouts.forEach(w => { sets[w.date] = (sets[w.date] || 0) + w.exercises.reduce((a, e) => a + hardSets(e).length, 0); });
  const acc = { train: { n: 0, kcal: 0, p: 0, f: 0, c: 0 }, rest: { n: 0, kcal: 0, p: 0, f: 0, c: 0 } };
  for (const [d, t] of Object.entries(dayTotals)) {
    if (d >= today || t.kcal < 800) continue;
    const g = acc[(sets[d] || 0) >= 8 ? 'train' : 'rest'];
    g.n++; g.kcal += t.kcal; g.p += t.p; g.f += t.f; g.c += t.c;
  }
  const avg = g => (g.n ? { n: g.n, kcal: g.kcal / g.n, p: g.p / g.n, f: g.f / g.n, c: g.c / g.n } : null);
  return { train: avg(acc.train), rest: avg(acc.rest) };
}

export { MUSCLE_ORDER };
