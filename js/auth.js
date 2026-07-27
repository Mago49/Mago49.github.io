// === AUTENTICAÇÃO (Google / Firebase) ===
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-init.js';
import { state } from './state.js';
import { showAppAlert } from './utils.js';
import { loadPlatformsFromFirestore } from './platforms-store.js';
import { updateCalendarEvents } from './ui-calendar.js';
import { renderVipPanel } from './ui-vip-panel.js';
import { renderPlatformList } from './ui-platform-panel.js';

const authScreenEl = document.getElementById('authScreen');
const appMainEl = document.getElementById('appMain');
const appFooterEl = document.getElementById('appFooter');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const authErrorEl = document.getElementById('authError');
const logoutBtn = document.getElementById('logoutBtn');
const userLabelEl = document.getElementById('userLabel');

googleLoginBtn.addEventListener('click', async () => {
  authErrorEl.textContent = '';
  googleLoginBtn.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error('Erro no login:', err);
    authErrorEl.textContent = 'Não foi possível entrar. Tente novamente.';
  } finally {
    googleLoginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.currentUid = user.uid;
    userLabelEl.textContent = user.displayName ? `Olá, ${user.displayName.split(' ')[0]}` : (user.email || '');

    try {
      state.platforms = await loadPlatformsFromFirestore(state.currentUid);
    } catch (err) {
      console.error('Erro ao carregar dados do Firebase:', err);
      await showAppAlert('Não foi possível carregar seus dados. Verifique sua internet e tente novamente.');
      state.platforms = [];
    }

    authScreenEl.classList.add('app-hidden');
    appMainEl.classList.remove('app-hidden');
    appFooterEl.classList.remove('app-hidden');

    // updateCalendarEvents() já atualiza o resumo do topo (hero) sozinha
    // por dentro, então não é preciso chamar updateHeroSummary() de novo aqui.
    renderPlatformList();
    updateCalendarEvents();
    renderVipPanel();
  } else {
    state.currentUid = null;
    state.platforms = [];
    userLabelEl.textContent = '';
    appMainEl.classList.add('app-hidden');
    appFooterEl.classList.add('app-hidden');
    authScreenEl.classList.remove('app-hidden');
  }
});
