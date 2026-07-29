// === GUARDA DE AUTENTICAÇÃO (compartilhado pelas 4 páginas) ===
// Antes, cada página teria que copiar seu próprio bloco de onAuthStateChanged
// (o guia do projeto já previa isso). Em vez de duplicar ~40 linhas em 4
// arquivos, esse módulo concentra a parte que é IGUAL em toda página:
// login/logout, carregar state.platforms do Firestore, e mostrar/esconder
// a tela de login. Cada página só diz o que fazer DEPOIS de logar (onLogin).
//
// Resolve dois problemas do auth.js antigo:
// 1) Sessão que desloga ao fechar o navegador -> ver setPersistence em
//    firebase-init.js; este arquivo só espera authReady antes de tudo.
// 2) "Flash" da tela de login antes de confirmar que o usuário já está
//    logado -> existe um 3º estado (#authLoading) mostrado até a primeira
//    resposta do onAuthStateChanged, evitando piscar a tela de login à toa.

import {
  auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, authReady
} from './firebase-init.js';
import { state } from './state.js';
import { showAppAlert } from './utils.js';
import { loadPlatformsFromFirestore } from './platforms-store.js';

/**
 * @param {Object} options
 * @param {(user: import('firebase/auth').User) => void} options.onLogin
 *        Chamado depois que o login é confirmado E state.platforms já foi
 *        carregado do Firestore. Aqui cada página renderiza sua própria UI.
 * @param {() => void} [options.onLogout]
 *        Chamado quando o usuário desloga (ou nunca esteve logado).
 */
export function initAuth({ onLogin, onLogout }) {
  const authScreenEl = document.getElementById('authScreen');
  const authLoadingEl = document.getElementById('authLoading');
  const appMainEl = document.getElementById('appMain');
  const appFooterEl = document.getElementById('appFooter'); // só existe em calendario.html
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const authErrorEl = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');
  const userLabelEl = document.getElementById('userLabel');

  function showLoading() {
    if (authLoadingEl) authLoadingEl.classList.remove('app-hidden');
    if (authScreenEl) authScreenEl.classList.add('app-hidden');
    if (appMainEl) appMainEl.classList.add('app-hidden');
    if (appFooterEl) appFooterEl.classList.add('app-hidden');
  }

  function showLoginScreen() {
    if (authLoadingEl) authLoadingEl.classList.add('app-hidden');
    if (authScreenEl) authScreenEl.classList.remove('app-hidden');
    if (appMainEl) appMainEl.classList.add('app-hidden');
    if (appFooterEl) appFooterEl.classList.add('app-hidden');
  }

  function showApp() {
    if (authLoadingEl) authLoadingEl.classList.add('app-hidden');
    if (authScreenEl) authScreenEl.classList.add('app-hidden');
    if (appMainEl) appMainEl.classList.remove('app-hidden');
    if (appFooterEl) appFooterEl.classList.remove('app-hidden');
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      if (authErrorEl) authErrorEl.textContent = '';
      googleLoginBtn.disabled = true;
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        console.error('Erro no login:', err);
        if (authErrorEl) authErrorEl.textContent = 'Não foi possível entrar. Tente novamente.';
      } finally {
        googleLoginBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut(auth);
    });
  }

  showLoading();

  // Só liga o listener de auth depois que a persistência local foi
  // configurada (authReady) — evita qualquer corrida entre setPersistence
  // e a primeira leitura do estado de login.
  authReady.then(() => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        state.currentUid = user.uid;
        if (userLabelEl) {
          userLabelEl.textContent = user.displayName ? `Olá, ${user.displayName.split(' ')[0]}` : (user.email || '');
        }

        try {
          state.platforms = await loadPlatformsFromFirestore(state.currentUid);
        } catch (err) {
          console.error('Erro ao carregar dados do Firebase:', err);
          await showAppAlert('Não foi possível carregar seus dados. Verifique sua internet e tente novamente.');
          state.platforms = [];
        }

        showApp();
        if (typeof onLogin === 'function') onLogin(user);
      } else {
        state.currentUid = null;
        state.platforms = [];
        if (userLabelEl) userLabelEl.textContent = '';
        showLoginScreen();
        if (typeof onLogout === 'function') onLogout();
      }
    });
  });
}
