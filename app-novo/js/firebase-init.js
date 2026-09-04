// === FIREBASE INIT ===
// Único lugar do projeto onde initializeApp() é chamado.
// Toda página nova deve importar auth/db DAQUI, nunca chamar initializeApp()
// de novo — isso causa erro de "app já inicializado" ou aponta pro projeto errado.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, deleteDoc, writeBatch
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

// Garante sessão persistida entre fechamentos do navegador (fica logado até
// clicar em "Sair"). Sem isso o SDK pode cair num padrão menos confiável
// dependendo do navegador (Safari/ITP, aba privada, etc.) — pedir de forma
// explícita é o que garante o comportamento em qualquer ambiente.
// authReady resolve depois que a persistência é configurada; auth-guard.js
// aguarda essa promise antes de registrar onAuthStateChanged, pra nunca
// correr risco de ler o estado de auth antes da persistência certa valer.
export const authReady = setPersistence(auth, browserLocalPersistence)
  .catch(err => console.error('Erro ao configurar persistência de login:', err));

// Reexporta as funções do SDK usadas no resto do app, pra tudo vir de um só lugar.
// getDoc (singular) foi adicionado pra suportar o doc-sentinela em
// platforms-store.js (ver loadPlatformsFromFirestore) — não muda nada do
// que já existia, só soma uma leitura pontual nova.
export {
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, getDoc, getDocs, deleteDoc, writeBatch
};
