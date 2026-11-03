import React, { useMemo } from 'react';
import { muscleStats } from '../lib/muscles';

const STATUS = {
  up: ['Progressing', 'var(--green)'], flat: ['Holding', 'var(--blue)'], down: ['Slipping', 'var(--amber)'], new: ['Not enough data', 'var(--dim)'],
};

function Spark({ weeks, color }) {
  const data = [...weeks].reverse(); // oldest -> newest
  const max = Math.max(...data, 1);
  return (
    <svg viewBox="0 0 120 34" width="100%" height="34" style={{ display: 'block' }}>
      {data.map((v, i) => <rect key={i} x={i * 10 + 1} y={34 - (v / max) * 32} width="8" height={Math.max((v / max) * 32, v ? 2 : 0.5)} rx="1.5" fill={color} opacity={i >= 8 ? 1 : 0.45} />)}
    </svg>
  );
}

export default function MuscleDash({ workouts, bwAt }) {
  const stats = useMemo(() => muscleStats(workouts, bwAt), [workouts, bwAt]);
  const kg = v => (v >= 1000 ? (v / 1000).toFixed(1) + ' t' : Math.round(v) + ' kg');
  if (!stats.length) return null;
  const pct = d => (d == null ? '–' : (d > 0 ? '+' : '') + (d * 100).toFixed(0) + '%');
  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Muscle dashboard</h3>
      <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
        Strength = best estimated 1RM (or reps for bodyweight moves) in the last 6 weeks vs the 6 weeks before. Volume = weight × reps per week (kg lifted, averaged over the last 4 weeks). Pull-ups, chin-ups, push-ups and dips count a share of your body weight. Bars show the last 12 weeks, the newest 4 in full colour.
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {stats.map(m => {
          const [label, color] = STATUS[m.status];
          const trend = m.priorVol ? (m.recentVol - m.priorVol) / m.priorVol : 0;
          return (
            <details key={m.name} className="card" style={{ marginBottom: 0, padding: 12 }}>
              <summary style={{ listStyle: 'none', color: 'var(--text)' }}>
                <div className="row sp"><b>{m.name}</b><span style={{ color, fontSize: 12, fontWeight: 600 }}>{label}</span></div>
                <div className="row sp" style={{ margin: '6px 0 2px' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color }}>{pct(m.delta)}</span>
                  <span className="mute" style={{ fontSize: 12, textAlign: 'right' }}>{kg(m.recentVol)}/wk<br />{trend > 0.1 ? '▲' : trend < -0.1 ? '▼' : '►'} vs {kg(m.priorVol)} before</span>
                </div>
                <Spark weeks={m.weeks} color={color} />
                <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>Last trained {m.daysAgo === 0 ? 'today' : m.daysAgo + ' days ago'}{m.nDelta ? ` · based on ${m.nDelta} exercise${m.nDelta > 1 ? 's' : ''}` : ''}</div>
              </summary>
              <table style={{ marginTop: 8, fontSize: 13 }}><tbody>
                {m.exercises.map(x => (
                  <tr key={x.name}><td>{x.name}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{x.delta == null ? <span className="dim">no comparison</span> : <b style={{ color: x.delta > 0.02 ? 'var(--green)' : x.delta < -0.02 ? 'var(--amber)' : 'var(--mute)' }}>{pct(x.delta)}</b>}</td></tr>))}
              </tbody></table>
            </details>);
        })}
      </div>
    </div>
  );
}
