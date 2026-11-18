import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, provider } from './firebase';
import { useSettings } from './lib/db';
import { syncSheets } from './lib/health';
import { DEFAULTS } from './lib/defaults';
import Measurements from './modules/Measurements';
import Intake from './modules/Intake';
import Training from './modules/Training';
import Settings from './modules/Settings';

const TABS = [['measure', 'Measure'], ['intake', 'Intake'], ['train', 'Training'], ['settings', 'Settings']];

// If a tab crashes, show the error here (and keep the tab bar) instead of a black screen.
class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.tab !== this.props.tab && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="card"><h3 style={{ marginBottom: 6 }}>Something broke on this tab</h3>
      <div className="msg r" style={{ wordBreak: 'break-word' }}>{String(this.state.err.message || this.state.err)}</div>
      <div className="dim" style={{ fontSize: 12, margin: '8px 0' }}>Switch to another tab, or reload. Send me this message and I'll fix it.</div>
      <button onClick={() => location.reload()}>Reload</button></div>;
  }
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('tab') || 'measure'; } catch { return 'measure'; } });
  const [err, setErr] = useState('');
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const settings = useSettings(user?.uid, DEFAULTS);
  const synced = useRef(false);
  useEffect(() => {
    if (!user || !settings || synced.current) return;
    synced.current = true;
    if ((settings.sheetBody || settings.sheetActivity) && Date.now() - (settings.lastSync || 0) > 6 * 3600 * 1000) syncSheets(user.uid, settings);
  }, [user, settings]);
  const go = t => { setTab(t); try { localStorage.setItem('tab', t); } catch {} };

  const login = async () => {
    setErr('');
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(auth, provider);
      else setErr(e.message);
    }
  };

  if (user === undefined) return <div className="login dim">Loading…</div>;
  if (!user) return (
    <div className="login">
      <img src="./icon.svg" width="88" height="88" alt="" style={{ borderRadius: 20 }} />
      <h2>Nano OS Health</h2>
      <div className="mute">Measurements · Intake · Training</div>
      <button className="pri" onClick={login}>Sign in with Google</button>
      {err && <div className="msg r">{err}</div>}
    </div>
  );
  if (!settings) return <div className="login dim">Loading your data…</div>;

  const props = { uid: user.uid, settings };
  return (
    <>
      <div className="wrap"><Boundary tab={tab}>
        {tab === 'measure' && <Measurements {...props} />}
        {tab === 'intake' && <Intake {...props} />}
        {tab === 'train' && <Training {...props} />}
        {tab === 'settings' && <Settings {...props} user={user} onSignOut={() => signOut(auth)} />}
      </Boundary></div>
      <nav className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}</nav>
    </>
  );
}
