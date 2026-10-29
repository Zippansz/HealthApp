import React, { useMemo, useState } from 'react';
import Chart from '../Chart';
import { useCollection, putMany } from '../lib/db';
import { parseHevy, mergeByDate } from '../lib/hevy';
import { e1rm, fmt, withMA } from '../lib/calc';

// Per-exercise stats from all workouts.
export function exerciseStats(workouts, bwAt) {
  const by = {};
  for (const w of workouts) for (const e of w.exercises) {
    const sets = e.sets.filter(s => s.type !== 'warmup' && s.reps > 0);
    if (!sets.length) continue;
    const x = (by[e.name] ||= { name: e.name, sessions: [] });
    const weighted = sets.filter(s => s.kg > 0);
    const best = weighted.reduce((m, s) => Math.max(m, e1rm(s.kg, s.reps)), 0);
    x.sessions.push({
      date: w.date, title: w.title, sets: sets.length,
      best1rm: best, topKg: Math.max(0, ...weighted.map(s => s.kg)), maxReps: Math.max(...sets.map(s => s.reps)),
      volume: sets.reduce((a, s) => a + (s.kg || 0) * s.reps, 0),
      topSet: weighted.length ? weighted.reduce((m, s) => (e1rm(s.kg, s.reps) > e1rm(m.kg, m.reps) ? s : m)) : null,
    });
  }
  return Object.values(by).map(x => {
    x.sessions.sort((a, b) => a.date.localeCompare(b.date));
    const weighted = x.sessions.some(s => s.best1rm > 0);
    const bestS = x.sessions.reduce((m, s) => ((weighted ? s.best1rm : s.maxReps) > (weighted ? m.best1rm : m.maxReps) ? s : m), x.sessions[0]);
    return { ...x, weighted, last: x.sessions.at(-1).date, best: weighted ? bestS.best1rm : bestS.maxReps, bestDate: bestS.date, rel: weighted && bwAt(bestS.date) ? bestS.best1rm / bwAt(bestS.date) : null };
  });
}

export default function Training({ uid, settings }) {
  const workouts = useCollection(uid, 'workouts');
  const meas = useCollection(uid, 'measurements');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const norm = useMemo(() => mergeByDate(workouts), [workouts]);
  const ma = useMemo(() => withMA(meas), [meas]);
  const bwAt = date => { const p = ma.filter(m => m.date <= date); return p.length ? p.at(-1).ma : ma[0]?.ma ?? null; };
  const stats = useMemo(() => exerciseStats(norm, bwAt), [norm, ma]);

  const onFiles = async e => {
    setBusy(true); setMsg('');
    try {
      let total = 0;
      for (const f of e.target.files) {
        const items = parseHevy(await f.text());
        await putMany(uid, 'workouts', items); total += items.length;
      }
      setMsg(`Imported ${total} sessions (sessions on the same date are shown as one workout; duplicates are never added twice).`);
    } catch (err) { setMsg('Import failed: ' + err.message); }
    setBusy(false); e.target.value = '';
  };

  const list = stats.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.last.localeCompare(a.last));
  const cur = sel && stats.find(s => s.name === sel);
  const recent = [...norm].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 15);
  const thisYear = norm.filter(w => w.date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length;

  if (cur) return (
    <>
      <button className="sm" onClick={() => setSel(null)} style={{ marginBottom: 10 }}>‹ Back</button>
      <h2 style={{ marginBottom: 10 }}>{cur.name}</h2>
      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card stat" style={{ marginBottom: 0 }}><div className="lbl">{cur.weighted ? 'Best est. 1RM' : 'Best reps'}</div><div className="v">{fmt(cur.best, cur.weighted ? 1 : 0)}<span className="mute" style={{ fontSize: 13 }}> {cur.weighted ? 'kg' : ''}</span></div><div className="s">{cur.bestDate}</div></div>
        {cur.rel != null && <div className="card stat" style={{ marginBottom: 0 }}><div className="lbl">Relative strength</div><div className="v">{cur.rel.toFixed(2)}<span className="mute" style={{ fontSize: 13 }}> × BW</span></div><div className="s">1RM / body weight</div></div>}
        <div className="card stat" style={{ marginBottom: 0 }}><div className="lbl">Heaviest set</div><div className="v">{fmt(Math.max(...cur.sessions.map(s => s.topKg)), 1)}<span className="mute" style={{ fontSize: 13 }}> kg</span></div><div className="s">{cur.sessions.length} sessions</div></div>
      </div>
      <div className="card"><h3 style={{ marginBottom: 6 }}>{cur.weighted ? 'Estimated 1RM per session (Epley)' : 'Best reps per session'}</h3>
        <Chart yPad={cur.weighted ? 2 : 1} series={[{ color: '#10b981', dots: true, points: cur.sessions.map(s => ({ x: s.date, y: cur.weighted ? s.best1rm : s.maxReps })).filter(p => p.y > 0) }]} /></div>
      <div className="card"><h3 style={{ marginBottom: 6 }}>Sessions</h3>
        <table><thead><tr><th>Date</th><th>Top set</th><th>1RM</th><th>Sets</th></tr></thead><tbody>
          {[...cur.sessions].reverse().slice(0, 40).map((s, i) => <tr key={i}><td>{s.date}</td><td>{s.topSet ? `${s.topSet.kg} × ${s.topSet.reps}` : `${s.maxReps} reps`}</td><td>{s.best1rm ? s.best1rm.toFixed(1) : '–'}</td><td>{s.sets}</td></tr>)}
        </tbody></table></div>
    </>
  );

  return (
    <>
      <div className="row sp" style={{ marginBottom: 12 }}><h2>Training</h2><span className="mute" style={{ fontSize: 13 }}>{norm.length} workouts · {thisYear} in last 30 days</span></div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Import from Hevy</h3>
        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Choose one or more exported CSV files. Re-importing is safe: the same workout is never added twice.</div>
        <input type="file" multiple onChange={onFiles} disabled={busy} />
        {busy && <div className="mute">Importing…</div>}{msg && <div className="msg">{msg}</div>}
      </div>

      <div className="card">
        <div className="row sp" style={{ marginBottom: 8 }}><h3>Exercises</h3><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ width: 160 }} /></div>
        <table><thead><tr><th>Exercise</th><th>Best</th><th>×BW</th><th>Last</th></tr></thead><tbody>
          {list.map(s => <tr key={s.name} onClick={() => setSel(s.name)} style={{ cursor: 'pointer' }}>
            <td>{s.name}</td><td>{s.weighted ? s.best.toFixed(1) + ' kg' : s.best + ' reps'}</td><td>{s.rel ? s.rel.toFixed(2) : '–'}</td><td className="dim">{s.last.slice(2)}</td></tr>)}
        </tbody></table>
        {list.length === 0 && <div className="dim">No exercises yet – import a Hevy file above.</div>}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Recent workouts</h3>
        {recent.map(w => {
          const sets = w.exercises.reduce((a, e) => a + e.sets.filter(s => s.type !== 'warmup').length, 0);
          const vol = w.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.kg || 0) * (s.reps || 0), 0), 0);
          const mins = w.mins || null;
          return <div key={w.id} style={{ padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
            <div className="row sp"><b>{w.title}</b><span className="dim">{w.date}</span></div>
            <div className="mute" style={{ fontSize: 13 }}>{w.exercises.length} exercises · {sets} sets · {Math.round(vol)} kg volume{mins ? ` · ${mins} min` : ''}</div></div>;
        })}
      </div>
    </>
  );
}
