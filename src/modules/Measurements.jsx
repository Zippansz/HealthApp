import React, { useMemo, useRef, useState } from 'react';
import Chart from '../Chart';
import { useCollection, put, remove, putMany } from '../lib/db';
import { MODE_COLORS } from '../lib/defaults';
import { TAPE } from '../lib/tape';
import { deleteField } from 'firebase/firestore';
import { extractTape } from '../lib/gemini';
import { todayStr, addDays, daysBetween, num, fmt, rfm, whtr, withMA, slopePerWeek, phaseFor } from '../lib/calc';

function Stat({ label, value, unit, goal, start, cur, lowerIsBetter = true, digits = 1, active, onClick, sub }) {
  let pct = null;
  if (cur != null && goal != null && start != null && start !== goal) pct = Math.max(0, Math.min(100, ((start - cur) / (start - goal)) * 100));
  return (
    <div className="card stat" onClick={onClick} style={{ marginBottom: 0, cursor: 'pointer', borderColor: active ? 'var(--blue)' : undefined, boxShadow: active ? '0 0 0 1px var(--blue)' : undefined }}>
      <div className="lbl">{label}{active ? ' · shown' : ''}</div>
      <div className="v">{fmt(value, digits)}<span className="mute" style={{ fontSize: 13 }}> {unit}</span></div>
      <div className="s">{sub != null ? sub : `Goal ${fmt(goal, digits)} ${unit}`}</div>
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

  // One-time tidy: the old separate Abdomen / tape Waist values move into Navel / Waist (only where those are empty).
  const stale = rows.filter(r => r.t_abdomen != null || r.t_waist != null);
  React.useEffect(() => {
    stale.forEach(r => put(uid, 'measurements', r.id, {
      ...(r.t_abdomen != null && r.navel == null ? { navel: r.t_abdomen } : {}),
      ...(r.t_waist != null && r.waist == null ? { waist: r.t_waist } : {}),
      t_abdomen: deleteField(), t_waist: deleteField(),
    }));
  }, [stale.length]);

  const data = useMemo(() => rows.slice().sort((a, b) => a.date.localeCompare(b.date)), [rows]);
  const ma = useMemo(() => withMA(data), [data]);
  const last = key => [...data].reverse().find(r => r[key] != null)?.[key] ?? null;
  const lastMA = ma.at(-1);
  const slope = slopePerWeek(ma);
  const navel = last('navel'), waist = last('waist'), scaleBf = last('bf');
  const phase = phaseFor(settings.phases, todayStr());
  const goal = settings.goal;

  // ----- the chart shows whichever metric card was tapped -----
  const [sel, setSel] = useState('weight');
  const METRICS = {
    weight: { label: 'Weight', unit: 'kg', digits: 1, yPad: 0.5, get: r => r.weight, goal: phase?.weight ?? goal.weight, start: settings.start.weight },
    navel: { label: 'Navel', unit: 'cm', digits: 1, yPad: 1, get: r => r.navel, goal: phase?.navel ?? goal.navel, start: settings.start.navel },
    waist: { label: 'Waist', unit: 'cm', digits: 1, yPad: 1, get: r => r.waist, goal: phase?.waist ?? goal.waist, start: settings.start.waist },
    rfm: { label: 'Body fat (RFM)', unit: '%', digits: 1, yPad: 0.5, get: r => rfm(h, r.navel), goal: phase?.bf ?? goal.bf, start: settings.start.bf },
    whtr: { label: 'Waist-to-height', unit: '', digits: 3, yPad: 0.01, get: r => whtr(h, r.navel), goal: goal.whtr, start: settings.start.whtr },
    scale: { label: 'Body fat (scale)', unit: '%', digits: 1, yPad: 0.5, get: r => r.bf, goal: phase?.bf ?? goal.bf, start: settings.start.bf },
  };
  const tapeRows = data.filter(r => TAPE.some(([k]) => r[k] != null));
  const tapeFirst = k => tapeRows.find(r => r[k] != null)?.[k];
  const tapeLast = k => [...tapeRows].reverse().find(r => r[k] != null)?.[k];
  const whrOf = r => (r.waist && r.t_hip ? r.waist / r.t_hip : null);
  const whrRows = data.filter(r => whrOf(r) != null);
  const lastWhr = whrRows.length ? whrOf(whrRows.at(-1)) : null;
  TAPE.forEach(([k, l]) => { METRICS[k] = { label: l, unit: 'cm', digits: 1, yPad: 1, get: r => r[k], goal: null, start: tapeFirst(k) }; });
  METRICS.whr = { label: 'Waist–hip ratio', unit: '', digits: 2, yPad: 0.01, get: whrOf, goal: null, start: whrRows.length ? whrOf(whrRows[0]) : null };
  const chartRef = useRef(null);
  const pick = k => { setSel(k); setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60); };
  const M = METRICS[sel] || METRICS.weight;
  const pts = data.map(r => ({ date: r.date, v: M.get(r) })).filter(r => r.v != null && Number.isFinite(r.v));
  const maM = withMA(pts, 'v');
  const lastM = maM.at(-1);
  const slopeM = slopePerWeek(maM);
  let proj = null, projEnd = null;
  if (lastM && slopeM != null) {
    projEnd = phase ? phase.end : addDays(todayStr(), 60);
    const d = daysBetween(lastM.date, projEnd);
    if (d > 0) proj = lastM.ma + (slopeM / 7) * d;
  }
  const projSeries = proj != null ? [{ x: lastM.date, y: lastM.ma }, { x: projEnd, y: proj }] : [];
  const rate = slopeM == null ? null : slopeM;
  const good = rate == null || M.goal == null ? null : (M.goal < M.start ? rate < 0 : rate > 0);

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
  const saveAll = async () => {
    const patch = { date: form.date };
    ['weight', 'waist', 'navel'].forEach(k => { const v = num(form[k]); if (v != null) patch[k] = v; });
    TAPE.forEach(([k]) => { const v = num(tape[k]); if (v != null) patch[k] = v; });
    if (Object.keys(patch).length < 2) return;
    await put(uid, 'measurements', form.date, patch);
    setForm({ ...form, weight: '', waist: '', navel: '' });
    setTape({ date: form.date }); setTapeMsg('Saved ✓'); setTimeout(() => setTapeMsg(''), 2000);
  };

  const months = useMemo(() => {
    const m = new Map();
    [...data].reverse().forEach(r => { const k = r.date.slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()];
  }, [data]);

  const bands = settings.phases.map(p => ({ start: p.start, end: p.end, color: MODE_COLORS[p.mode] || '#888', label: p.name }));
  const delta = lastM && M.start != null ? lastM.ma - M.start : null;

  return (
    <>
      <div className="row sp" style={{ marginBottom: 12 }}>
        <h2>Measurements</h2>
        <div className="mute" style={{ fontSize: 13 }}>{phase ? <>Phase: <b className="g">{phase.name}</b> · ends {phase.end}</> : 'No active phase'}</div>
      </div>
      <div className="grid" style={{ marginBottom: 12 }}>
        <Stat active={sel === 'weight'} onClick={() => pick('weight')} label="Weight (7DMA)" value={lastMA?.ma} unit="kg" goal={phase?.weight ?? goal.weight} start={settings.start.weight} cur={lastMA?.ma} />
        <Stat active={sel === 'navel'} onClick={() => pick('navel')} label="Navel" value={navel} unit="cm" goal={phase?.navel ?? goal.navel} start={settings.start.navel} cur={navel} />
        <Stat active={sel === 'waist'} onClick={() => pick('waist')} label="Waist" value={waist} unit="cm" goal={phase?.waist ?? goal.waist} start={settings.start.waist} cur={waist} />
        <Stat active={sel === 'rfm'} onClick={() => pick('rfm')} label="Body fat (RFM)" value={rfm(h, navel)} unit="%" goal={phase?.bf ?? goal.bf} start={settings.start.bf} cur={rfm(h, navel)} />
        <Stat active={sel === 'whtr'} onClick={() => pick('whtr')} label="Waist-to-height" value={whtr(h, navel)} unit="" goal={goal.whtr} start={settings.start.whtr} cur={whtr(h, navel)} digits={3} />
        {scaleBf != null && <Stat active={sel === 'scale'} onClick={() => pick('scale')} label="Body fat (scale)" value={scaleBf} unit="%" goal={phase?.bf ?? goal.bf} start={settings.start.bf} cur={scaleBf} />}
      </div>

      <details className="card" style={{ padding: 14 }}>
        <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text)' }}>
          <b>Body-part measurements</b>
          <span className="dim" style={{ fontSize: 13 }}>{TAPE.filter(([k]) => tapeLast(k) != null).length} tracked · tap to expand</span>
        </summary>
        <div className="grid" style={{ margin: '12px 0' }}>
          {TAPE.filter(([k]) => tapeLast(k) != null).map(([k, l]) => { const d = tapeLast(k) - tapeFirst(k); return (
            <Stat key={k} active={sel === k} onClick={() => pick(k)} label={l} value={tapeLast(k)} unit="cm" digits={1} sub={Math.abs(d) < 0.05 ? 'no change since first' : `${d > 0 ? '+' : ''}${d.toFixed(1)} cm since first`} />); })}
          {lastWhr != null && <Stat active={sel === 'whr'} onClick={() => pick('whr')} label="Waist–hip ratio" value={lastWhr} unit="" digits={2} sub={`${whrRows.length} measurements`} />}
        </div>
        {tapeRows.length === 0 && <div className="dim">No body-part measurements yet. Add them in the form above.</div>}
      </details>

      <div className="card" ref={chartRef}>
        <div className="row sp"><h3>{M.label}</h3>
          <span className="mute" style={{ fontSize: 13 }}>
            Trend {rate != null ? <b className={good == null ? '' : good ? 'g' : 'a'}>{rate > 0 ? '+' : ''}{rate.toFixed(M.digits === 3 ? 3 : 2)} {M.unit}/wk</b> : '–'}
            {proj != null && <> · projected <b>{proj.toFixed(M.digits)} {M.unit}</b> by {projEnd}</>}
            {delta != null && <> · {delta > 0 ? '+' : ''}{delta.toFixed(M.digits)} {M.unit} {M.goal == null ? 'since first' : 'since start'}</>}
          </span></div>
        <Chart bands={bands} yPad={M.yPad}
          series={[{ points: pts.map(r => ({ x: r.date, y: r.v })), color: '#475569', dots: true, width: 1 }, { points: maM.map(r => ({ x: r.date, y: r.ma })), color: '#38bdf8', width: 2.5 }, { points: projSeries, color: '#f59e0b', dashed: true }]}
          hlines={M.goal != null ? [{ y: M.goal, color: '#10b981', label: 'target' }] : []} />
        <div className="dim" style={{ fontSize: 12 }}>Tap another card above to chart it · grey = measurements · blue = 7-day average · dashed = trend projection · coloured bands = phases</div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Add measurement</h3>
        <div className="f2" style={{ marginBottom: 8 }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <input inputMode="decimal" placeholder="Weight kg" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          <input inputMode="decimal" placeholder="Waist cm" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
          <input inputMode="decimal" placeholder="Navel cm" value={form.navel} onChange={e => setForm({ ...form, navel: e.target.value })} />
        </div>
        <details style={{ margin: '10px 0' }}>
          <summary>Body parts (screenshot or type)</summary>
          <div className="dim" style={{ fontSize: 13, margin: '6px 0' }}>Upload a screenshot of the Renpho body-part screen and the numbers are read for you, or type them in.</div>
          <input type="file" accept="image/*" onChange={readShot} disabled={reading} />
          {reading && <div className="mute">Reading…</div>}
          <div className="f3" style={{ margin: '10px 0' }}>
            {TAPE.map(([k, l]) => <Field2 key={k} label={l + ' cm'}><input inputMode="decimal" value={tape[k] ?? ''} onChange={e => setTape({ ...tape, [k]: e.target.value })} /></Field2>)}
          </div>
        </details>
        <button className="pri" onClick={saveAll}>Save</button>
        {tapeMsg && <div className="msg">{tapeMsg}</div>}
        <details style={{ marginTop: 10 }}><summary>Paste from Excel</summary>
          <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>One row per line: date (YYYY-MM-DD), weight, navel, waist – separated by tabs. Comma decimals work.</div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} />
          <button onClick={importPaste} disabled={!paste.trim()} style={{ marginTop: 6 }}>Import</button> <span className="g">{msg}</span>
        </details>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>History</h3>
        {months.length === 0 && <div className="dim">No measurements yet.</div>}
        {months.map(([ym, list], mi) => {
          const ws = list.filter(r => r.weight != null).map(r => r.weight);
          const avg = ws.length ? ws.reduce((x, y) => x + y, 0) / ws.length : null;
          return (
            <details key={ym} open={mi === 0} style={{ borderTop: '1px solid #1e293b' }}>
              <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0' }}>
                <b style={{ color: 'var(--text)' }}>{new Date(ym + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
                <span className="dim" style={{ fontSize: 13 }}>{list.length} days{avg != null ? ` · avg ${avg.toFixed(1)} kg` : ''}</span>
              </summary>
              <table style={{ marginBottom: 8 }}><thead><tr><th>Date</th><th>Weight</th><th>Navel</th><th>Waist</th><th>BF scale</th><th></th></tr></thead>
                <tbody>{list.map(r => (
                  <tr key={r.id}><td>{r.date.slice(5)}</td><td>{fmt(r.weight, 1)}</td><td>{fmt(r.navel, 1)}</td><td>{fmt(r.waist, 1)}</td><td>{fmt(r.bf, 1)}</td>
                    <td><button className="sm danger" onClick={() => window.confirm('Delete ' + r.date + '?') && remove(uid, 'measurements', r.id)}>✕</button></td></tr>))}
                </tbody></table>
            </details>);
        })}
      </div>
    </>
  );
}
