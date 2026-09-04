import { startBackgroundAnimation } from './ui-background.js';
import { initAuth } from './auth-guard.js';
import { initRouter } from './router.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => initRouter(),
  onLogout: () => { window.location.hash = '#/inicio'; }
});
