import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export const col = (uid, name) => collection(db, 'users', uid, name);

export function useCollection(uid, name, { since } = {}) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const q = since ? query(col(uid, name), where('date', '>=', since)) : col(uid, name);
    return onSnapshot(q, snap => setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [uid, name, since]);
  return rows;
}

export function useSettings(uid, defaults) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid, 'meta', 'settings'), snap => {
      setS(snap.exists() ? { ...defaults, ...snap.data() } : defaults);
    });
  }, [uid]);
  return s;
}

export const saveSettings = (uid, patch) =>
  setDoc(doc(db, 'users', uid, 'meta', 'settings'), patch, { merge: true });
export const put = (uid, name, id, data) => setDoc(doc(db, 'users', uid, name, id), data, { merge: true });
export const remove = (uid, name, id) => deleteDoc(doc(db, 'users', uid, name, id));

// Writes in chunks (Firestore batches max out at 500).
export async function putMany(uid, name, items) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(db);
    items.slice(i, i + 400).forEach(({ id, data }) => b.set(doc(db, 'users', uid, name, id), data, { merge: true }));
    await b.commit();
  }
}

export async function getAll(uid, name) {
  const snap = await getDocs(col(uid, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
