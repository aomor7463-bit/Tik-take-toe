
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBHB1X2gBLXn0tOKSthoCbguGGkp0bYOFc",
  authDomain: "tournament-26471.firebaseapp.com",
  databaseURL: "https://tournament-26471-default-rtdb.firebaseio.com",
  projectId: "tournament-26471",
  storageBucket: "tournament-26471.firebasestorage.app",
  messagingSenderId: "142722670959",
  appId: "1:142722670959:web:9422b045479f22bf0f489a",
  measurementId: "G-HJVTWJXJGT"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
