// === PONTO DE ENTRADA — Página 3 (VIP) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { renderVipPanel, initVipFilters } from './ui-vip-panel.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    initVipFilters();
    renderVipPanel();
    scheduleDailyUpdate();
  }
});

// Bônus VIP depende do dia atual (dias no mês, segundas-feiras etc.) —
// sem isso, fica desatualizado até o usuário recarregar a página manualmente.
let dailyTimer = null;
function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    renderVipPanel();
    scheduleDailyUpdate();
  }, ms);
}
