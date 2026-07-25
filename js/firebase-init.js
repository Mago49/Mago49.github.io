// === FIREBASE INIT ===
// Único lugar do projeto onde initializeApp() é chamado.
// Toda página nova (gestao.html, relatorios.html, etc.) deve importar
// auth/db DAQUI, nunca chamar initializeApp() de novo — isso causa erro
// de "app já inicializado" ou aponta pro projeto errado.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// TODO: troque pelos valores do SEU projeto Firebase
// (Console do Firebase > Configurações do projeto > Seus apps > SDK setup and configuration)
const firebaseConfig = {
  apiKey: "AIzaSyBYByjI-DQIZMwYiZIub0Wli7A-wVu_XmQ",
  authDomain: "painel1-b6ec2.firebaseapp.com",
  projectId: "painel1-b6ec2",
  storageBucket: "painel1-b6ec2.firebasestorage.app",
  messagingSenderId: "1005504044952",
  appId: "1:1005504044952:web:de298c7cadd0542a94d5ed"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Reexporta as funções do SDK usadas no resto do app, pra tudo vir de um só lugar.
export {
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, getDocs, deleteDoc, writeBatch
};
