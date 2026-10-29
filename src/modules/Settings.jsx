import React, { useEffect, useState } from 'react';
import { saveSettings, getAll, putMany } from '../lib/db';
import { DEFAULTS } from '../lib/defaults';
import { downloadFile, todayStr, num } from '../lib/calc';
import { parseCSV, toCSV } from '../lib/csv';
import { mergeByDate } from '../lib/hevy';
import { TAPE } from '../lib/tape';
import { importHealthCSV, syncSheets } from '../lib/health';

const Field = ({ label, children }) => <label style={{ display: 'block' }}><div className="lbl" style={{ marginBottom: 3 }}>{label}</div>{children}</label>;
const N = ({ v, set }) => <input inputMode="decimal" value={v ?? ''} onChange={e => set(e.target.value === '' ? '' : e.target.value)} />;

export default function Settings({ uid, settings, user, onSignOut }) {
  const [d, setD] = useState(settings);
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  useEffect(() => setD(settings), [settings]);

  const up = (path, v) => setD(prev => {
    const n = structuredClone(prev); let o = n;
    path.slice(0, -1).forEach(k => (o = o[k])); o[path.at(-1)] = v; return n;
  });
  const clean = () => {
    const n = structuredClone(d);
    const f = (o, ks) => ks.forEach(k => (o[k] = num(o[k]) ?? DEFAULTS[k]));
    n.heightCm = num(n.heightCm) ?? 177; n.baseTdee = num(n.baseTdee) ?? 2200;
    Object.keys(n.start).forEach(k => (n.start[k] = num(n.start[k]) ?? 0));
    Object.keys(n.goal).forEach(k => (n.goal[k] = num(n.goal[k]) ?? 0));
    Object.values(n.modes).forEach(m => ['p', 'kcalMin', 'kcalMax', 'fMax', 'cMax'].forEach(k => (m[k] = num(m[k]) ?? 0)));
    n.phases.forEach(p => ['weight', 'navel', 'waist', 'bf'].forEach(k => (p[k] = num(p[k]) ?? 0)));
    return n;
  };
  const save = async () => { await saveSettings(uid, clean()); setSaved('Saved ✓'); setTimeout(() => setSaved(''), 2000); };

  // ---------- exports ----------
  const loadAll = async () => {
    const [measurements, meals, activity, workouts] = await Promise.all(['measurements', 'meals', 'activity', 'workouts'].map(n => getAll(uid, n)));
    return { measurements, meals, activity, workouts };
  };
  const exportAnalysis = async () => {
    setMsg('Preparing…');
    const a = await loadAll();
    const { geminiKey, ...cfg } = settings;
    const out = {
      exportedAt: new Date().toISOString(),
      about: 'Personal health data from the Nano OS Health app. Dates are YYYY-MM-DD. Weights in kg, lengths in cm. meals[].ts is a unix-ms timestamp of when the meal was logged. Use workouts[].exercises[].sets for training. settings.phases describe the planned phases/targets.',
      settings: cfg,
      measurements: a.measurements.sort((x, y) => x.date.localeCompare(y.date)).map(({ id, ...r }) => r),
      meals: a.meals.sort((x, y) => (x.ts || 0) - (y.ts || 0)).map(({ id, ...r }) => ({ ...r, time: r.ts ? new Date(r.ts).toISOString() : null })),
      activity: a.activity.sort((x, y) => x.date.localeCompare(y.date)).map(({ id, ...r }) => r),
      workouts: mergeByDate(a.workouts).sort((x, y) => x.start.localeCompare(y.start)).map(({ id, ...r }) => r),
    };
    downloadFile(`nano-os-export-${todayStr()}.json`, JSON.stringify(out, null, 1));
    setMsg(`Exported ${out.measurements.length} measurements, ${out.meals.length} meals, ${out.activity.length} activity days, ${out.workouts.length} workouts.`);
  };
  const csv = async kind => {
    const a = await loadAll();
    if (kind === 'meals') downloadFile('meals.csv', toCSV(a.meals.sort((x, y) => (x.ts || 0) - (y.ts || 0)).map(m => ({ ...m, time: m.ts ? new Date(m.ts).toISOString() : '' })), ['date', 'time', 'name', 'amount', 'kcal', 'p', 'f', 'c']), 'text/csv');
    if (kind === 'measurements') downloadFile('measurements.csv', toCSV(a.measurements.sort((x, y) => x.date.localeCompare(y.date)), ['date', 'weight', 'waist', 'navel', 'bf', ...TAPE.map(t => t[0])]), 'text/csv');
    if (kind === 'activity') downloadFile('activity.csv', toCSV(a.activity.sort((x, y) => x.date.localeCompare(y.date)), ['date', 'steps', 'kcal']), 'text/csv');
    if (kind === 'sets') {
      const rows = [];
      mergeByDate(a.workouts).forEach(w => w.exercises.forEach(e => e.sets.forEach((s, i) => rows.push({ date: w.date, start: w.start, workout: w.title, exercise: e.name, set: i + 1, type: s.type, kg: s.kg, reps: s.reps, rpe: s.rpe, sec: s.sec, km: s.dist }))));
      downloadFile('training-sets.csv', toCSV(rows, ['date', 'start', 'workout', 'exercise', 'set', 'type', 'kg', 'reps', 'rpe', 'sec', 'km']), 'text/csv');
    }
  };

  // ---------- Health Data Export (file fallback + automatic sheet sync) ----------
  const importHealth = async e => {
    setMsg('');
    for (const f of e.target.files) {
      try { const r = await importHealthCSV(uid, await f.text()); setMsg(m => m + `${f.name}: ${r.count} ${r.kind} imported. `); }
      catch (err) { setMsg(m => m + `${f.name}: ${err.message} `); }
    }
    e.target.value = '';
  };
  const [sheet, setSheet] = useState({ body: settings.sheetBody || '', act: settings.sheetActivity || '' });
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    await saveSettings(uid, { sheetBody: sheet.body.trim(), sheetActivity: sheet.act.trim(), lastSync: null });
    await syncSheets(uid, { ...settings, sheetBody: sheet.body.trim(), sheetActivity: sheet.act.trim(), lastSync: null });
    setSyncing(false);
  };

  return (
    <>
      <h2 style={{ marginBottom: 12 }}>Settings</h2>

      <div className="card">
        <div className="row sp"><div><div className="lbl">Signed in</div>{user.email}</div><button onClick={onSignOut}>Sign out</button></div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>AI (Gemini)</h3>
        <Field label="API key (stored privately in your account)"><input type="password" value={d.geminiKey || ''} onChange={e => up(['geminiKey'], e.target.value.trim())} placeholder="Paste key from aistudio.google.com/apikey" /></Field>
        <div style={{ height: 8 }} />
        <Field label="Model"><input value={d.geminiModel} onChange={e => up(['geminiModel'], e.target.value.trim())} /></Field>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ok" onClick={async () => { await saveSettings(uid, { geminiKey: (d.geminiKey || '').trim(), geminiModel: d.geminiModel }); setKeyMsg('Saved ✓'); setTimeout(() => setKeyMsg(''), 2500); }}>Save key</button>
          <span className="g">{keyMsg}</span>
          <span className="dim" style={{ fontSize: 12 }}>{settings.geminiKey ? 'A key is stored in your account.' : 'No key stored yet.'}</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Body & goals</h3>
        <div className="f2" style={{ marginBottom: 10 }}>
          <Field label="Height cm"><N v={d.heightCm} set={v => up(['heightCm'], v)} /></Field>
          <Field label="Base TDEE kcal"><N v={d.baseTdee} set={v => up(['baseTdee'], v)} /></Field>
        </div>
        <table><thead><tr><th></th><th>Start</th><th>Final goal</th></tr></thead><tbody>
          {[['weight', 'Weight kg'], ['navel', 'Navel cm'], ['waist', 'Waist cm'], ['bf', 'BF %'], ['whtr', 'WHtR']].map(([k, l]) => (
            <tr key={k}><td>{l}</td><td><N v={d.start[k]} set={v => up(['start', k], v)} /></td><td><N v={d.goal[k]} set={v => up(['goal', k], v)} /></td></tr>))}
        </tbody></table>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Daily targets per mode</h3>
        {Object.entries(d.modes).map(([k, m]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <b>{m.label}</b>
            <div className="f3" style={{ marginTop: 6 }}>
              <Field label="kcal min"><N v={m.kcalMin} set={v => up(['modes', k, 'kcalMin'], v)} /></Field>
              <Field label="kcal max"><N v={m.kcalMax} set={v => up(['modes', k, 'kcalMax'], v)} /></Field>
              <Field label="Protein ≥ g"><N v={m.p} set={v => up(['modes', k, 'p'], v)} /></Field>
              <Field label="Fat ≤ g"><N v={m.fMax} set={v => up(['modes', k, 'fMax'], v)} /></Field>
              <Field label="Carbs ≤ g"><N v={m.cMax} set={v => up(['modes', k, 'cMax'], v)} /></Field>
            </div>
          </div>))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Phases</h3>
        {d.phases.map((p, i) => (
          <div key={i} style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 10 }}>
            <div className="row sp" style={{ marginBottom: 6 }}>
              <input value={p.name} onChange={e => up(['phases', i, 'name'], e.target.value)} style={{ flex: 1 }} />
              <button className="sm danger" onClick={() => setD({ ...d, phases: d.phases.filter((_, j) => j !== i) })}>✕</button>
            </div>
            <div className="f3" style={{ marginBottom: 6 }}>
              <Field label="Start"><input type="date" value={p.start} onChange={e => up(['phases', i, 'start'], e.target.value)} /></Field>
              <Field label="End"><input type="date" value={p.end} onChange={e => up(['phases', i, 'end'], e.target.value)} /></Field>
              <Field label="Mode"><select value={p.mode} onChange={e => up(['phases', i, 'mode'], e.target.value)}>{Object.entries(d.modes).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></Field>
            </div>
            <div className="f3">
              <Field label="Weight kg"><N v={p.weight} set={v => up(['phases', i, 'weight'], v)} /></Field>
              <Field label="Navel cm"><N v={p.navel} set={v => up(['phases', i, 'navel'], v)} /></Field>
              <Field label="Waist cm"><N v={p.waist} set={v => up(['phases', i, 'waist'], v)} /></Field>
              <Field label="BF %"><N v={p.bf} set={v => up(['phases', i, 'bf'], v)} /></Field>
            </div>
          </div>))}
        <button style={{ marginTop: 10 }} onClick={() => setD({ ...d, phases: [...d.phases, { name: 'New phase', start: todayStr(), end: todayStr(), mode: 'maintenance', weight: 75, navel: 85, waist: 84, bf: 17 }] })}>+ Add phase</button>
      </div>

      <div className="row" style={{ marginBottom: 12 }}><button className="ok" onClick={save}>Save settings</button><span className="g">{saved}</span></div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Health Data Export sync</h3>
        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>In your Google Sheet: File → Share → Publish to web → choose one tab (not "Entire document") and the format <b>CSV</b> → Publish → copy the link. Do it for "Body Measurements" and for "Activity", and paste the links here. The app then reads them each time you open it (at most every 6 hours).</div>
        <Field label="Body Measurements link"><input value={sheet.body} onChange={e => setSheet({ ...sheet, body: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/e/…output=csv" /></Field>
        <div style={{ height: 8 }} />
        <Field label="Activity link"><input value={sheet.act} onChange={e => setSheet({ ...sheet, act: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/e/…output=csv" /></Field>
        <div className="row" style={{ marginTop: 10 }}><button className="ok" onClick={syncNow} disabled={syncing || (!sheet.body && !sheet.act)}>{syncing ? 'Syncing…' : 'Save & sync everything now'}</button></div>
        {settings.lastSyncMsg && <div className="msg">{settings.lastSyncMsg}{settings.lastSync ? ` · ${new Date(settings.lastSync).toLocaleString()}` : ''}</div>}
        <details style={{ marginTop: 8 }}><summary>Or import CSV files by hand</summary>
          <input type="file" multiple onChange={importHealth} />
        </details>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Export</h3>
        <button className="pri" onClick={exportAnalysis}>Export for analysis (JSON)</button>
        <div className="dim" style={{ fontSize: 13, margin: '6px 0 10px' }}>One file with everything: measurements, every meal with timestamp, activity, workouts and targets. Give it to Claude for deeper analysis. Your Gemini key is never included.</div>
        <div className="row">{['meals', 'measurements', 'activity', 'sets'].map(k => <button key={k} className="sm" onClick={() => csv(k)}>{k}.csv</button>)}</div>
        {msg && <div className="msg">{msg}</div>}
      </div>
    </>
  );
}
