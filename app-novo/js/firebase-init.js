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
  getFirestore, collection, doc, getDoc, getDocs,
  deleteDoc as _deleteDoc, writeBatch as _writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { SAFE_MODE } from './dev-flags.js';

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

// Aviso visível e NÃO bloqueante de falha de gravação (SAFE_MODE = false).
// Toast criado direto no body, com estilo inline — de propósito não usa
// utils.js/showAppAlert (o #appModal é único e disputa listeners).
// z-index acima do #appModal (210). Some sozinho em ~8s; no máximo 1
// aviso a cada 10s. Nunca lança: falha ao montar o aviso não pode
// mascarar o erro original da gravação.
const SAVE_WARNING_VISIBLE_MS = 8000;
const SAVE_WARNING_MIN_GAP_MS = 10000;
let lastSaveWarningAt = 0;

function showSaveFailureToast() {
  try {
    const now = Date.now();
    if (now - lastSaveWarningAt < SAVE_WARNING_MIN_GAP_MS) return;
    if (typeof document === 'undefined' || !document.body) return;
    lastSaveWarningAt = now;

    const toast = document.createElement('div');
    toast.setAttribute('role', 'alert');
    toast.textContent = 'Atenção: a última alteração pode não ter sido salva. Verifique sua conexão e tente novamente; se persistir, recarregue a página.';
    toast.style.cssText = [
      'position:fixed', 'left:50%', 'transform:translateX(-50%)',
      'bottom:calc(1rem + env(safe-area-inset-bottom, 0px))',
      'width:min(92vw, 420px)', 'box-sizing:border-box',
      'padding:0.8rem 1rem', 'border-radius:14px',
      'background:#b91c1c', 'color:#fff',
      'font:600 0.88rem/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
      'box-shadow:0 12px 30px rgba(15,23,42,0.3)',
      'z-index:1000', 'pointer-events:none', 'text-align:center'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, SAVE_WARNING_VISIBLE_MS);
  } catch (e) {
    console.error('Falha ao exibir aviso de gravação:', e);
  }
}

export function writeBatch(dbRef) {
  if (!SAFE_MODE) {
    const batch = _writeBatch(dbRef);
    const nativeCommit = batch.commit.bind(batch);
    batch.commit = () => nativeCommit().catch(err => {
      showSaveFailureToast();
      throw err; // chamadores já fazem .catch(console.error)
    });
    return batch;
  }
  return {
    set: (ref) => console.log('[MODO TESTE] set bloqueado:', ref.path),
    update: (ref) => console.log('[MODO TESTE] update bloqueado:', ref.path),
    delete: (ref) => console.log('[MODO TESTE] delete bloqueado:', ref.path),
    commit: () => { console.log('[MODO TESTE] commit bloqueado — nada foi salvo'); return Promise.resolve(); }
  };
}

export function deleteDoc(ref) {
  if (!SAFE_MODE) {
    return _deleteDoc(ref).catch(err => {
      showSaveFailureToast();
      throw err; // chamadores já fazem .catch(console.error)
    });
  }
  console.log('[MODO TESTE] deleteDoc bloqueado:', ref.path);
  return Promise.resolve();
}

// Reexporta as funções do SDK usadas no resto do app, pra tudo vir de um só lugar.
// getDoc (singular) foi adicionado pra suportar o doc-sentinela em
// platforms-store.js (ver loadPlatformsFromFirestore) — não muda nada do
// que já existia, só soma uma leitura pontual nova.
export {
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, getDoc, getDocs,
};
