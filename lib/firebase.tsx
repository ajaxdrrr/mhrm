// src/lib/firebase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getDatabase } from "firebase/database";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyC4QFemE1kLO4TCQ0gNHfLixZqQSEARu2g",
  authDomain: "mhrm-a0b26.firebaseapp.com",
  projectId: "mhrm-a0b26",
  storageBucket: "mhrm-a0b26.firebasestorage.app",
  messagingSenderId: "601236250659",
  appId: "1:601236250659:web:1be25e978ce18f5bf49196",
  measurementId: "G-0LNRWDPKY7",
  // ✅ required for Realtime Database
  databaseURL: "https://mhrm-a0b26-default-rtdb.firebaseio.com",
};

// Singleton app
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth singleton with proper persistence per platform
let _auth: Auth;

if (Platform.OS === "web") {
  _auth = getAuth(app);
  // make web persist across refresh
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
} else {
  // native / Expo Go
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export const auth = _auth;

// Realtime Database singleton
export const db = getDatabase(app);
