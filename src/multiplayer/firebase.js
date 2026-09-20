// Firebase initialization for Tactical Risk multiplayer
// Uses Firebase v9 modular SDK

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMrm6zJois_EdvD1JbGnQ_SKoO86abyW4",
  authDomain: "tactical-risk.firebaseapp.com",
  projectId: "tactical-risk",
  storageBucket: "tactical-risk.firebasestorage.app",
  messagingSenderId: "355113488244",
  appId: "1:355113488244:web:07c84ec2c0404b3ad0e621",
  measurementId: "G-SDR6HK67Z1"
};

// Initialize Firebase
let app = null;
let auth = null;
let db = null;

export function initializeFirebase(config = null) {
  if (app) return { app, auth, db };

  const finalConfig = config || firebaseConfig;

  // Check if config has been set up
  if (finalConfig.apiKey === "YOUR_API_KEY") {
    console.warn('Firebase not configured. Please update src/multiplayer/firebase.js with your Firebase project configuration.');
    return { app: null, auth: null, db: null };
  }

  app = initializeApp(finalConfig);
  // getAuth() already restores the IndexedDB session. Changing persistence
  // on init raced that restore on the V2.77 reload and dropped the user.
  auth = getAuth(app);
  db = getFirestore(app);

  return { app, auth, db };
}

export function getFirebaseApp() {
  return app;
}

export function getFirebaseAuth() {
  return auth;
}

export function getFirebaseDb() {
  return db;
}

// Check if Firebase is configured
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}
