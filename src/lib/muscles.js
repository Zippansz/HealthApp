import { daysBetween, e1rm, todayStr } from './calc';

// Hevy's export has no muscle info, so exercises are grouped by name. Primary muscle only.
const RULES = [
  [/neck/i, 'Neck'],
  [/behind the back curl/i, 'Biceps'],
  [/wrist|forearm|reverse curl/i, 'Forearms'],
  [/calf/i, 'Calves'],
  [/ab wheel|crunch|leg raise|cable twist|plank/i, 'Core'],
  [/back extension|hyperextension|superman/i, 'Back'],
  [/leg curl/i, 'Hamstrings & glutes'],
  [/deadlift|rdl|romanian|hip thrust|clean and jerk|good morning/i, 'Hamstrings & glutes'],
  [/squat|leg press|leg extension|lunge/i, 'Quads'],
  [/tricep|skullcrusher|pushdown|\bdip\b|kickback/i, 'Triceps'],
  [/upright row|face pull|reverse fly|rear delt|lateral raise|front raise|overhead press|shoulder press|arnold/i, 'Shoulders'],
  [/curl/i, 'Biceps'],
  [/chest supported|\brow\b|pull ?up|chin up|pulldown|dead hang|pullover|shrug/i, 'Back'],
  [/bench press|chest|fly|push up|crossover|pec/i, 'Chest'],
];
export const muscleOf = name => (RULES.find(([re]) => re.test(name)) || [null, 'Other'])[1];
export const priorityOrder = saved => {
  const keep = (saved || []).filter(m => MUSCLE_ORDER.includes(m));
  return [...keep, ...MUSCLE_ORDER.filter(m => !keep.includes(m))];
};
export const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings & glutes', 'Calves', 'Core', 'Neck', 'Other'];

const WEEKS = 12;
// Share of body weight that counts as load for bodyweight moves (approximate).
export const bwShare = name => (/pull ?up|chin up/i.test(name) ? 1 : /push ?up/i.test(name) ? 0.65 : /\bdip\b/i.test(name) ? 0.5 : 0);

export function muscleStats(workouts, bwAt = () => null) {
  const today = todayStr();
  const groups = {};
  for (const w of workouts) {
    const age = daysBetween(w.date, today);
    if (age < 0 || age >= WEEKS * 7) continue;
    for (const e of w.exercises) {
      const sets = e.sets.filter(s => s.type !== 'warmup' && s.reps > 0);
      if (!sets.length) continue;
      const m = muscleOf(e.name);
      const g = (groups[m] ||= { name: m, weeks: Array(WEEKS).fill(0), last: null, ex: {} });
      const bw = (bwAt(w.date) || 0) * bwShare(e.name);
      const vol = sets.reduce((a, x) => a + ((x.kg || 0) + bw) * x.reps, 0);   // kg x reps (+ share of body weight for pull-ups etc.)
      g.weeks[Math.floor(age / 7)] += vol;
      if (!g.last || w.date > g.last) g.last = w.date;
      const weighted = sets.some(s => s.kg > 0);
      const metric = weighted ? Math.max(...sets.map(s => e1rm(s.kg, s.reps))) : Math.max(...sets.map(s => s.reps));
      const x = (g.ex[e.name] ||= { name: e.name, weighted, recent: 0, prior: 0, unit: weighted ? 'kg 1RM' : 'reps' });
      if (age < 42) x.recent = Math.max(x.recent, metric); else x.prior = Math.max(x.prior, metric);
    }
  }
  return Object.values(groups).map(g => {
    const exs = Object.values(g.ex).map(x => ({ ...x, delta: x.recent && x.prior ? x.recent / x.prior - 1 : null }));
    const ds = exs.filter(x => x.delta != null).map(x => x.delta);
    const delta = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    const recentVol = g.weeks.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const priorVol = g.weeks.slice(4, 8).reduce((a, b) => a + b, 0) / 4;
    return {
      name: g.name, weeks: g.weeks, last: g.last, daysAgo: daysBetween(g.last, today), recentVol, priorVol, delta, nDelta: ds.length,
      status: delta == null ? 'new' : delta > 0.02 ? 'up' : delta < -0.02 ? 'down' : 'flat',
      exercises: exs.sort((a, b) => (b.delta ?? -9) - (a.delta ?? -9)),
    };
  }).sort((a, b) => MUSCLE_ORDER.indexOf(a.name) - MUSCLE_ORDER.indexOf(b.name));
}
