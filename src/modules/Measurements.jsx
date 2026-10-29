import React, { useMemo, useState } from 'react';
import Chart from '../Chart';
import { useCollection, put, remove, putMany } from '../lib/db';
import { MODE_COLORS } from '../lib/defaults';
import { TAPE } from '../lib/tape';
import { extractTape } from '../lib/gemini';
import { todayStr, addDays, daysBetween, num, fmt, rfm, whtr, withMA, slopePerWeek, phaseFor } from '../lib/calc';

function Stat({ label, value, unit, goal, start, cur, lowerIsBetter = true, digits = 1 }) {
  let pct = null;
  if (cur != null && goal != null && start != null && start !== goal) pct = Math.max(0, Math.min(100, ((start - cur) / (start - goal)) * 100));
  return (
    <div className="card stat" style={{ marginBottom: 0 }}>
      <div className="lbl">{label}</div>
      <div className="v">{fmt(value, digits)}<span className="mute" style={{ fontSize: 13 }}> {unit}</span></div>
      <div className="s">Goal {fmt(goal, digits)} {unit}</div>
      {pct != null && <div className="bar" style={{ marginTop: 6 }}><i style={{ width: pct + '%', background: 'var(--green)' }} /></div>}
    </div>
  );
}

const Field2 = ({ label, children }) => <label style={{ display: 'block' }}><div className="lbl" style={{ marginBottom: 3 }}>{label}</div>{children}</label>;

export default function Measurements({ uid, settings }) {
  const rows = useCollection(uid, 'measurements');
  const h = settings.heightCm;
  const [form, setForm] = useState({ date: todayStr(), weight: '', waist: '', navel: '' });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [tape, setTape] = useState({ date: todayStr() });
  const [tapeMsg, setTapeMsg] = useState('');
  const [reading, setReading] = useState(false);

  const data = useMemo(() => rows.slice().sort((a, b) => a.date.localeCompare(b.date)), [rows]);
  const ma = useMemo(() => withMA(data), [data]);
  const last = key => [...data].reverse().find(r => r[key] != null)?.[key] ?? null;
  const lastMA = ma.at(-1);
  const slope = slopePerWeek(ma);
  const navel = last('navel'), waist = last('waist'), scaleBf = last('bf');
  const phase = phaseFor(settings.phases, todayStr());
  const goal = settings.goal;

  // projection: continue the current trend to the end of the active phase (or 60 days if none)
  let proj = null, projEnd = null;
  if (lastMA && slope != null) {
    projEnd = phase ? phase.end : addDays(todayStr(), 60);
    const d = daysBetween(lastMA.date, projEnd);
    if (d > 0) proj = lastMA.ma + (slope / 7) * d;
  }
  const projSeries = proj != null ? [{ x: lastMA.date, y: lastMA.ma }, { x: projEnd, y: proj }] : [];

  const save = async () => {
    const patch = { date: form.date };
    ['weight', 'waist', 'navel'].forEach(k => { const v = num(form[k]); if (v != null) patch[k] = v; });
    if (Object.keys(patch).length < 2) return;
    await put(uid, 'measurements', form.date, patch);
    setForm({ ...form, weight: '', waist: '', navel: '' });
  };
  const importPaste = async () => {
    // Excel format: YYYY-MM-DD <TAB> weight <TAB> navel <TAB> waist   (comma decimals are fine)
    const items = [];
    paste.split('\n').forEach(line => {
      const c = line.trim().split(/\t|;/);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0] || '')) return;
      const data = { date: c[0] };
      const w = num(c[1]), n = num(c[2]), wa = num(c[3]);
      if (w != null) data.weight = w; if (n != null) data.navel = n; if (wa != null) data.waist = wa;
      items.push({ id: c[0], data });
    });
    await putMany(uid, 'measurements', items);
    setMsg(`Imported ${items.length} rows.`); setPaste('');
  };

  const readShot = async e => {
    const f = e.target.files[0]; if (!f) return;
    setReading(true); setTapeMsg('');
    try {
      const base64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
      const got = await extractTape({ key: settings.geminiKey, model: settings.geminiModel, base64, mime: f.type || 'image/png' });
      const next = { ...tape };
      TAPE.forEach(([k]) => { const v = got[k.slice(2)]; if (v != null) next[k] = String(v); });
      setTape(next); setTapeMsg('Read from screenshot – check the numbers, then save.');
    } catch (err) { setTapeMsg(err.message); }
    setReading(false); e.target.value = '';
  };
  const saveTape = async () => {
    const patch = { date: tape.date };
    TAPE.forEach(([k]) => { const v = num(tape[k]); if (v != null) patch[k] = v; });
    if (Object.keys(patch).length < 2) return;
    await put(uid, 'measurements', tape.date, patch);
    setTape({ date: tape.date }); setTapeMsg('Saved ✓');
  };
  const tapeRows = data.filter(r => TAPE.some(([k]) => r[k] != null));
  const tapeFirst = k => tapeRows.find(r => r[k] != null)?.[k];
  const tapeLast = k => [...tapeRows].reverse().find(r => r[k] != null)?.[k];
  const lastWhr = (() => { const r = [...tapeRows].reverse().find(x => x.t_waist && x.t_hip); return r ? r.t_waist / r.t_hip : null; })();

  const bands = settings.phases.map(p => ({ start: p.start, end: p.end, color: MODE_COLORS[p.mode] || '#888', label: p.name }));
  const weightPts = data.filter(r => r.weight != null).map(r => ({ x: r.date, y: r.weight }));
  const delta = lastMA ? lastMA.ma - settings.start.weight : null;

  return (
    <>
      <div className="row sp" style={{ marginBottom: 12 }}>
        <h2>Measurements</h2>
        <div className="mute" style={{ fontSize: 13 }}>{phase ? <>Phase: <b className="g">{phase.name}</b> · ends {phase.end}</> : 'No active phase'}</div>
      </div>
      <div className="grid" style={{ marginBottom: 12 }}>
        <Stat label="Weight (7DMA)" value={lastMA?.ma} unit="kg" goal={phase?.weight ?? goal.weight} start={settings.start.weight} cur={lastMA?.ma} />
        <Stat label="Navel" value={navel} unit="cm" goal={phase?.navel ?? goal.navel} start={settings.start.navel} cur={navel} />
        <Stat label="Waist" value={waist} unit="cm" goal={phase?.waist ?? goal.waist} start={settings.start.waist} cur={waist} />
        <Stat label="Body fat (RFM)" value={rfm(h, navel)} unit="%" goal={phase?.bf ?? goal.bf} start={settings.start.bf} cur={rfm(h, navel)} />
        <Stat label="Waist-to-height" value={whtr(h, navel)} unit="" goal={goal.whtr} start={settings.start.whtr} cur={whtr(h, navel)} digits={3} />
        {scaleBf != null && <Stat label="Body fat (scale)" value={scaleBf} unit="%" goal={phase?.bf ?? goal.bf} start={settings.start.bf} cur={scaleBf} />}
      </div>

      <div className="card">
        <div className="row sp"><h3>Weight</h3>
          <span className="mute" style={{ fontSize: 13 }}>
            Trend {slope != null ? <b className={slope < 0 ? 'g' : 'a'}>{slope > 0 ? '+' : ''}{slope.toFixed(2)} kg/wk</b> : '–'}
            {proj != null && <> · projected <b>{proj.toFixed(1)} kg</b> by {projEnd}</>}
            {delta != null && <> · {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg since start</>}
          </span></div>
        <Chart bands={bands}
          series={[{ points: weightPts, color: '#475569', dots: true, width: 1 }, { points: ma.map(r => ({ x: r.date, y: r.ma })), color: '#38bdf8', width: 2.5 }, { points: projSeries, color: '#f59e0b', dashed: true }]}
          hlines={[{ y: phase?.weight ?? goal.weight, color: '#10b981', label: 'target' }]} />
        <div className="dim" style={{ fontSize: 12 }}>Grey = daily weigh-ins · blue = 7-day average · dashed = trend projection · coloured bands = phases</div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Add measurement</h3>
        <div className="f2" style={{ marginBottom: 8 }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <input inputMode="decimal" placeholder="Weight kg" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          <input inputMode="decimal" placeholder="Waist cm" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
          <input inputMode="decimal" placeholder="Navel cm" value={form.navel} onChange={e => setForm({ ...form, navel: e.target.value })} />
        </div>
        <button className="pri" onClick={save}>Save</button>
        <details style={{ marginTop: 10 }}><summary>Paste from Excel</summary>
          <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>One row per line: date (YYYY-MM-DD), weight, navel, waist – separated by tabs. Comma decimals work.</div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} />
          <button onClick={importPaste} disabled={!paste.trim()} style={{ marginTop: 6 }}>Import</button> <span className="g">{msg}</span>
        </details>
      </div>

      <div className="card">
        <div className="row sp" style={{ marginBottom: 8 }}><h3>Body-part measurements</h3>{lastWhr != null && <span className="mute" style={{ fontSize: 13 }}>Waist–hip ratio <b>{lastWhr.toFixed(2)}</b></span>}</div>
        {tapeRows.length > 0 && (
          <table style={{ marginBottom: 10 }}><thead><tr><th></th><th>First</th><th>Latest</th><th>Change</th></tr></thead><tbody>
            {TAPE.filter(([k]) => tapeLast(k) != null).map(([k, l]) => { const a = tapeFirst(k), b = tapeLast(k), d = b - a; return (
              <tr key={k}><td>{l}</td><td>{fmt(a, 1)}</td><td>{fmt(b, 1)}</td><td className={Math.abs(d) < 0.05 ? 'dim' : ''}>{Math.abs(d) < 0.05 ? '–' : (d > 0 ? '+' : '') + d.toFixed(1)}</td></tr>); })}
          </tbody></table>)}
        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Upload a screenshot of the Renpho body-part screen and the numbers are read for you, or type them in.</div>
        <input type="file" accept="image/*" onChange={readShot} disabled={reading} />
        {reading && <div className="mute">Reading…</div>}
        <div className="f3" style={{ margin: '10px 0' }}>
          <Field2 label="Date"><input type="date" value={tape.date} onChange={e => setTape({ ...tape, date: e.target.value })} /></Field2>
          {TAPE.map(([k, l]) => <Field2 key={k} label={l + ' cm'}><input inputMode="decimal" value={tape[k] ?? ''} onChange={e => setTape({ ...tape, [k]: e.target.value })} /></Field2>)}
        </div>
        <button className="pri" onClick={saveTape}>Save</button>
        {tapeMsg && <div className="msg">{tapeMsg}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>History</h3>
        <table><thead><tr><th>Date</th><th>Weight</th><th>Navel</th><th>Waist</th><th>BF scale</th><th></th></tr></thead>
          <tbody>{data.slice(-40).reverse().map(r => (
            <tr key={r.id}><td>{r.date}</td><td>{fmt(r.weight, 1)}</td><td>{fmt(r.navel, 1)}</td><td>{fmt(r.waist, 1)}</td><td>{fmt(r.bf, 1)}</td>
              <td><button className="sm danger" onClick={() => window.confirm('Delete ' + r.date + '?') && remove(uid, 'measurements', r.id)}>✕</button></td></tr>))}
          </tbody></table>
      </div>
    </>
  );
}
