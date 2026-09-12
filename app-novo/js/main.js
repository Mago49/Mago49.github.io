import { startBackgroundAnimation } from './ui-background.js';
import { initAuth } from './auth-guard.js';
import { initRouter } from './router.js';
import { SAFE_MODE } from './dev-flags.js';

startBackgroundAnimation();
 if (SAFE_MODE) {
  document.getElementById('safeModeBanner').classList.remove('app-hidden');
}

initAuth({
  onLogin: () => initRouter(),
  onLogout: () => { window.location.hash = '#/inicio'; }
});
