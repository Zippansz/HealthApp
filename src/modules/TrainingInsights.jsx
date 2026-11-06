import React, { useMemo, useState } from 'react';
import { saveSettings } from '../lib/db';
import { todayStr, addDays, daysBetween } from '../lib/calc';
import * as T from '../lib/trainstats';

const kgFmt = v => (v >= 1000 ? (v / 1000).toFixed(1) + ' t' : Math.round(v) + ' kg');
const pct = d => (d == null ? '–' : (d > 0 ? '+' : '') + (d * 100).toFixed(0) + '%');
const setTxt = s => (s ? ((s.kg || 0) > 0 ? `${s.kg} × ${s.reps}` : `${s.reps} reps`) : '–');
const Bar = ({ v, color = 'var(--green)' }) => (
  <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
    <div style={{ width: Math.max(2, Math.min(1, v) * 100) + '%', height: '100%', background: color }} />
  </div>
);

function Week({ workouts, bwAt, today }) {
  const w = useMemo(() => T.weekSummary(workouts, today, bwAt), [workouts, today]);
  const neg = useMemo(() => T.neglected(workouts, today), [workouts, today]);
  const last = useMemo(() => T.lastTrained(workouts), [workouts]);
  const names = T.MUSCLE_ORDER.filter(m => m !== 'Other' && (w.prev[m] || w.now[m] || last[m]));
  const wk = daysBetween(w.start, today) + 1;
  return (
    <div className="card">
      <div className="row sp"><h3>This week</h3><span className="mute" style={{ fontSize: 13 }}>day {wk} of 7</span></div>
      <div className="grid" style={{ margin: '8px 0' }}>
        <div className="card stat" style={{ marginBottom: 0 }}><div className="lbl">Sessions</div><div className="v">{w.days}</div><div className="s">last week {w.prevDays}</div></div>
        <div className="card stat" style={{ marginBottom: 0 }}><div className="lbl">Hard sets</div><div className="v">{w.sets}</div><div className="s">last week {w.prevSets}</div></div>
      </div>
      {names.map(m => {
        const n = w.now[m] || 0, p = w.prev[m] || 0, d = last[m] ? daysBetween(last[m], today) : null;
        return <div key={m} style={{ margin: '6px 0' }}>
          <div className="row sp" style={{ fontSize: 13 }}><span>{m}</span>
            <span className="mute">{n ? kgFmt(n) : d != null && d <= wk - 1 ? '' : 'not yet'} <span className="dim">/ {p ? kgFmt(p) : '–'} last wk</span></span></div>
          <Bar v={p ? n / p : n ? 1 : 0} color={n >= p && n ? 'var(--green)' : 'var(--blue)'} />
        </div>;
      })}
      {neg.length > 0 && <div style={{ marginTop: 10, fontSize: 13 }}>
        {neg.slice(0, 3).map(x => <div key={x.name} style={{ color: 'var(--amber)' }}>⚠ {x.name}: {x.days} days since last trained</div>)}
      </div>}
    </div>
  );
}

function Heat({ workouts, today }) {
  const grid = useMemo(() => T.heatmap(workouts, today, 26), [workouts, today]);
  const col = ['#1e293b', '#14532d', '#16a34a', '#4ade80'];
  const total = grid.flat().filter(c => c.level).length;
  return (
    <div className="card">
      <div className="row sp"><h3>Consistency</h3><span className="mute" style={{ fontSize: 13 }}>{total} training days in 26 weeks</span></div>
      <div style={{ display: 'flex', gap: 3, marginTop: 8, overflowX: 'auto' }}>
        {grid.map((wk, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {wk.map(c => <div key={c.date} title={`${c.date}: ${c.sets} sets`} style={{ width: 11, height: 11, borderRadius: 2, background: c.future ? 'transparent' : col[c.level] }} />)}
        </div>)}
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Each column is a week (Mon–Sun, newest right). Darker = fewer sets, brighter = 20+ sets.</div>
    </div>
  );
}

function Goals({ uid, settings, workouts, today }) {
  const goals = settings.goals || [];
  const hist = useMemo(() => T.history(workouts), [workouts]);
  const sug = useMemo(() => T.suggestGoals(hist, today, goals), [hist, goals.length]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''), [kg, setKg] = useState(''), [reps, setReps] = useState('');
  const save = g => saveSettings(uid, { goals: g });
  const off = settings.goalsOff || [];
  React.useEffect(() => {
    if (!hist.size) return;
    const next = T.syncGoals(goals, off, hist, today);
    if (JSON.stringify(next) !== JSON.stringify(goals)) save(next);
  }, [hist, JSON.stringify(goals), off.length]);
  const remove = i => saveSettings(uid, { goals: goals.filter((_, j) => j !== i), goalsOff: [...off, goals[i].name] });
  const add = () => {
    const n = hist.has(name) ? name : null; if (!n || !(+reps > 0)) return;
    if (+reps > T.MAX_REPS) { setReps(String(T.MAX_REPS)); return; }
    saveSettings(uid, { goals: [...goals.filter(g => g.name !== n), { name: n, kg: +kg || 0, reps: +reps }], goalsOff: off.filter(x => x !== n) }); setName(''); setKg(''); setReps(''); setOpen(false);
  };
  const names = [...hist.keys()].sort();
  return (
    <div className="card">
      <div className="row sp"><h3>Goals</h3><button className="sm" onClick={() => setOpen(!open)}>{open ? 'Close' : '+ Add'}</button></div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>Goal = one set of kg × reps. Your 5 most-done exercises get a goal automatically, and when you hit a goal it moves up: more reps, then +2.5 kg at 25 reps. Tap × to drop one.</div>
      {open && <div style={{ marginBottom: 10 }}>
        <input list="exnames" placeholder="Exercise" value={name} onChange={e => setName(e.target.value)} />
        <datalist id="exnames">{names.map(n => <option key={n} value={n} />)}</datalist>
        <div className="f3" style={{ margin: '6px 0' }}>
          <input inputMode="decimal" placeholder="kg (0 = bodyweight)" value={kg} onChange={e => setKg(e.target.value)} />
          <input inputMode="numeric" placeholder="Reps (max 30)" value={reps} onChange={e => setReps(e.target.value)} />
          <button className="pri" onClick={add}>Save</button>
        </div>
      </div>}
      {goals.map((g, i) => {
        const p = T.goalProgress(g, hist, today);
        const color = p.done ? 'var(--green)' : 'var(--blue)';
        return <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
          <div className="row sp"><b style={{ fontSize: 14 }}>{g.name}</b><button className="sm" onClick={() => remove(i)}>×</button></div>
          <div className="row sp" style={{ fontSize: 13, margin: '2px 0 4px' }}>
            <span>Target {setTxt(g)}{p.done ? ' ✓' : ''}</span><span className="mute">{Math.round(p.pct * 100)}%</span></div>
          <Bar v={p.pct} color={color} />
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
            Best set {setTxt(p.bestSet)}{g.kg > 0 && p.atWeight ? ` · at ${g.kg} kg: ${p.atWeight} reps${p.atWeight < g.reps ? `, ${g.reps - p.atWeight} to go` : ''}` : ''}
            {p.delta != null ? ` · ${pct(p.delta)} vs 6 wks ago` : ''}
            {!p.done && (p.etaWeeks != null ? ` · on pace in ~${p.etaWeeks} wk` : ' · no upward trend yet')}
          </div>
        </div>;
      })}
      {!goals.length && !sug.length && <div className="dim">No goals yet.</div>}
      {sug.length > 0 && <div style={{ marginTop: 10 }}>
        <div className="dim" style={{ fontSize: 12, marginBottom: 4 }}>Suggested (your most-done exercises)</div>
        {sug.map(s => <div key={s.name} className="row sp" style={{ padding: '4px 0', fontSize: 13 }}>
          <span>{s.name}<br /><span className="dim">best {setTxt(s.now)} → {setTxt(s)}</span></span>
          <button className="sm" onClick={() => saveSettings(uid, { goals: [...goals, { name: s.name, kg: s.kg, reps: s.reps }], goalsOff: off.filter(x => x !== s.name) })}>Add</button></div>)}
      </div>}
    </div>
  );
}

function Practice({ workouts, today }) {
  const list = useMemo(() => T.practice(workouts, today), [workouts, today]);
  if (!list.length) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Daily practice</h3>
      {list.map(p => {
        const max = Math.max(...p.daily, 1);
        return <div key={p.name} style={{ padding: '6px 0' }}>
          <div className="row sp"><b style={{ fontSize: 14 }}>{p.name}</b><span className="mute" style={{ fontSize: 13 }}>best set {p.thisWeek} this week <span className="dim">/ {p.lastWeek} last</span></span></div>
          <svg viewBox="0 0 140 28" width="100%" height="28" style={{ display: 'block', margin: '4px 0' }}>
            {p.daily.map((v, i) => <rect key={i} x={i * 10 + 1} y={28 - (v / max) * 26} width="8" height={Math.max(v ? (v / max) * 26 : 1, 1)} rx="1.5" fill={v ? 'var(--green)' : '#1e293b'} />)}
          </svg>
          <div className="dim" style={{ fontSize: 12 }}>{p.streak ? `${p.streak}-day streak · ` : ''}best set ever {p.best} reps · bars = best set per day, last 14 days</div>
        </div>;
      })}
    </div>
  );
}

function Records({ workouts, today, onPick }) {
  const ev = useMemo(() => T.prEvents(workouts), [workouts]);
  const st = useMemo(() => T.stalled(workouts, today, ev), [workouts, ev]);
  const label = { weight: 'heaviest', reps: 'more reps', volume: 'best set' };
  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Recent records</h3>
      {ev.slice(0, 8).map((e, i) => <div key={i} className="row sp" style={{ padding: '4px 0', fontSize: 13, cursor: 'pointer' }} onClick={() => onPick(e.name)}>
        <span>🏆 {e.name}<br /><span className="dim">{e.types.map(t => label[t]).join(' · ')}</span></span>
        <span style={{ textAlign: 'right' }}><b>{setTxt(e.top)}</b><br /><span className="dim">{e.date.slice(5)}</span></span></div>)}
      {!ev.length && <div className="dim">No records yet.</div>}
      {st.length > 0 && <>
        <div className="dim" style={{ fontSize: 12, margin: '10px 0 4px' }}>Stalled – no record in 6+ weeks</div>
        {st.map(s => <div key={s.name} className="row sp" style={{ fontSize: 13, padding: '2px 0', cursor: 'pointer' }} onClick={() => onPick(s.name)}>
          <span style={{ color: 'var(--amber)' }}>{s.name}</span><span className="dim">{s.weeks} wk</span></div>)}
      </>}
    </div>
  );
}

function IntakeSplit({ workouts, meals, nutrition, today }) {
  const r = useMemo(() => {
    const days = {};
    nutrition.forEach(n => { days[n.id] = { kcal: n.kcal || 0, p: n.p || 0, f: n.f || 0, c: n.c || 0 }; });
    const m = {};
    meals.forEach(x => { const t = (m[x.date] ||= { kcal: 0, p: 0, f: 0, c: 0 }); t.kcal += x.kcal || 0; t.p += x.p || 0; t.f += x.f || 0; t.c += x.c || 0; });
    Object.assign(days, m);
    return T.intakeSplit(workouts, days, today);
  }, [workouts, meals, nutrition, today]);
  if (!r.train && !r.rest) return null;
  const Col = ({ t, title }) => <div className="card stat" style={{ marginBottom: 0 }}>
    <div className="lbl">{title}</div>
    {t ? <><div className="v">{Math.round(t.kcal)}<span className="mute" style={{ fontSize: 13 }}> kcal</span></div>
      <div className="s">P {Math.round(t.p)} · C {Math.round(t.c)} · F {Math.round(t.f)} · {t.n} days</div></> : <div className="s">no data</div>}
  </div>;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Training vs rest days</h3>
      <div className="grid"><Col t={r.train} title="Training days" /><Col t={r.rest} title="Rest days" /></div>
      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Average logged intake. Training day = 8+ hard sets. Days under 800 kcal are ignored as incomplete.</div>
    </div>
  );
}

export function WorkoutDetail({ workout, workouts, onBack, onPick }) {
  const rows = useMemo(() => T.compareWorkout(workout, workouts), [workout, workouts]);
  return (
    <>
      <button className="sm" onClick={onBack} style={{ marginBottom: 10 }}>‹ Back</button>
      <h2>{workout.title}</h2>
      <div className="mute" style={{ marginBottom: 10 }}>{workout.date}</div>
      {rows.map(r => {
        const next = r.topNow && r.topNow.reps ? ((r.topNow.kg || 0) > 0 ? `${r.topNow.kg} × ${r.topNow.reps + 1}` : `${r.topNow.reps + 1} reps`) : null;
        return <div key={r.name} className="card">
          <div className="row sp"><b style={{ cursor: 'pointer' }} onClick={() => onPick(r.name)}>{r.name}</b>
            {r.delta != null && <b style={{ color: r.delta > 0.02 ? 'var(--green)' : r.delta < -0.02 ? 'var(--amber)' : 'var(--mute)' }}>{pct(r.delta)}</b>}</div>
          <table><thead><tr><th>Today</th><th>{r.prevDate ? 'Before (' + r.prevDate.slice(5) + ')' : 'Before'}</th></tr></thead><tbody>
            {Array.from({ length: Math.max(r.now.length, r.prev ? r.prev.length : 0) }, (_, i) =>
              <tr key={i}><td>{r.now[i] ? setTxt(r.now[i]) : ''}</td><td className="dim">{r.prev && r.prev[i] ? setTxt(r.prev[i]) : ''}</td></tr>)}
          </tbody></table>
          {r.notes && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>📝 {r.notes}</div>}
          {next && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--blue)' }}>Next target: {next}</div>}
        </div>;
      })}
    </>
  );
}

export default function TrainingInsights({ uid, settings, workouts, bwAt, meals, nutrition, onPick }) {
  const today = todayStr();
  if (!workouts.length) return null;
  return (
    <>
      <Week workouts={workouts} bwAt={bwAt} today={today} />
      <Goals uid={uid} settings={settings} workouts={workouts} today={today} />
      <Heat workouts={workouts} today={today} />
      <Records workouts={workouts} today={today} onPick={onPick} />
      <IntakeSplit workouts={workouts} meals={meals} nutrition={nutrition} today={today} />
    </>
  );
}
