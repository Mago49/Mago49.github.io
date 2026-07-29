// === PONTO DE ENTRADA — Página 4 (Edição) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { initManageControls, renderManageList } from './ui-platform-manage.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    initManageControls();
    renderManageList();
    scheduleDailyUpdate();
  }
});

// "Dia X" de cada linha muda na virada do dia.
let dailyTimer = null;
function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    renderManageList();
    scheduleDailyUpdate();
  }, ms);
}
