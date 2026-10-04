import { startBackgroundAnimation } from './ui-background.js';
import { initAuth } from './auth-guard.js';
import { initRouter } from './router.js';
import { SAFE_MODE } from './dev-flags.js';
import { state } from './state.js';

// Tempo em segundo plano a partir do qual, ao voltar, a página recarrega
// (evita trabalhar com state.platforms velho em memória).
const BACKGROUND_RELOAD_MS = 30 * 60 * 1000;

startBackgroundAnimation();
 if (SAFE_MODE) {
  document.getElementById('safeModeBanner').classList.remove('app-hidden');
}

initAuth({
  onLogin: () => initRouter(),
  onLogout: () => { window.location.hash = '#/inicio'; }
});

// Mitigação de estado velho: ficou muito tempo em segundo plano -> recarrega
// ao voltar (só se houver usuário logado).
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt !== null && Date.now() - hiddenAt > BACKGROUND_RELOAD_MS && state.currentUid) {
    window.location.reload();
  }
  hiddenAt = null;
});
