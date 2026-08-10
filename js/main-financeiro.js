// === PONTO DE ENTRADA — Página 5 (Financeiro) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { initFinanceControls, renderFinanceList, initFinanceOverview } from './ui-finance-panel.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    initFinanceControls();
    initFinanceOverview();
    renderFinanceList(); // já chama renderFinanceOverview() internamente
    scheduleDailyUpdate();
  }
});

// A semana atual (ao vivo) e o botão "Fechar semana" (só aparece aos
// domingos) dependem do dia de hoje — sem isso, ficaria desatualizado até
// o usuário recarregar a página manualmente.
let dailyTimer = null;
function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    renderFinanceList();
    scheduleDailyUpdate();
  }, ms);
}
