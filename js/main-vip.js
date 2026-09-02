// === PONTO DE ENTRADA — Página 3 (VIP) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { renderVipPanel, initVipFilters, initVipTabs, initObrigadoPanel, initMisteriosoPanel } from './ui-vip-panel.js';

startBackgroundAnimation();

initAuth({
  onLogin: async () => {
    initVipTabs();
    initVipFilters();
    renderVipPanel();
    // Bônus Obrigado e Bônus Misterioso carregam dado próprio do
    // Firestore (isolado, fora de `platforms`) antes da primeira
    // renderização de cada aba.
    await initObrigadoPanel();
    await initMisteriosoPanel();
    scheduleDailyUpdate();
  }
});

// Bônus VIP depende do dia atual (dias no mês, segundas-feiras etc.).
// Bônus Obrigado e Bônus Misterioso não dependem da virada do dia da
// mesma forma (Obrigado é padrão fixo mensal; Misterioso só muda quando
// uma data de emissão entra/sai da janela de 7 dias, o que a própria
// renderização já resolve na próxima vez que a aba for aberta).
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
