// Stand-in for the Firebase CDN modules. runTransaction always rejects so
// an End Turn push can be tested without a network.

export function initializeApp() { return {}; }
export function getAuth() { return {}; }
export function getFirestore() { return {}; }
export function doc() { return { path: 'games/test' }; }
export function getDoc() {
  return Promise.resolve({ exists: () => false, data: () => ({}) });
}
export function updateDoc() { return Promise.resolve(); }
export function setDoc() { return Promise.resolve(); }
export function onSnapshot() { return () => {}; }
export function serverTimestamp() { return null; }
export function runTransaction() {
  return Promise.reject(new Error('firestore rejected the turn'));
}
export function createUserWithEmailAndPassword() { return Promise.resolve(); }
export function signInWithEmailAndPassword() { return Promise.resolve(); }
export function signInWithPhoneNumber() { return Promise.resolve(); }
export function signOut() { return Promise.resolve(); }
export function onAuthStateChanged() { return () => {}; }
export function updateProfile() { return Promise.resolve(); }
export class RecaptchaVerifier {}
