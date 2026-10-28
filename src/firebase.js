import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDyCLfitB-mDyx7D0cflOUD1Bh9irYhP8s',
  authDomain: 'healthapp-9c46d.firebaseapp.com',
  projectId: 'healthapp-9c46d',
  storageBucket: 'healthapp-9c46d.firebasestorage.app',
  messagingSenderId: '378266172308',
  appId: '1:378266172308:web:7cef0ec2e954ea4c8dad81',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
// Offline cache = fewer reads (stays well inside the free plan) and the app works without signal.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
