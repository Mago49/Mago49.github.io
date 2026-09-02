// === PONTO DE ENTRADA — Página 3 (VIP) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { renderVipPanel, initVipFilters, initVipTabs, initObrigadoPanel } from './ui-vip-panel.js';

startBackgroundAnimation();

initAuth({
  onLogin: async () => {
    initVipTabs();
    initVipFilters();
    renderVipPanel();
    // Ponto 7.3: carrega o valor de referência persistido (Firestore,
    // isolado — ver vip-obrigado-store.js) antes de desenhar a aba
    // Bônus Obrigado pela primeira vez.
    await initObrigadoPanel();
    scheduleDailyUpdate();
  }
});

// Bônus VIP depende do dia atual (dias no mês, segundas-feiras etc.) —
// sem isso, fica desatualizado até o usuário recarregar a página manualmente.
// Bônus Obrigado não depende do dia (é um padrão fixo mensal), então não
// precisa recalcular na virada do dia.
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
