// === PONTO DE ENTRADA — Página 5 (Financeiro) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { initFinanceControls, renderFinanceList, initFinanceOverview, refreshAllRows, resetFinanceListCache } from './ui-finance-panel.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    // Zera o cache interno de linhas ANTES do primeiro render da sessão —
    // evita que um relogin na mesma aba reaproveite uma linha antiga
    // (mesmo id) com conteúdo desatualizado (ver comentário em
    // ui-finance-panel.js sobre a reconciliação de DOM).
    resetFinanceListCache();
    initFinanceControls();
    initFinanceOverview();
    renderFinanceList(); // já chama renderFinanceOverview() internamente
    scheduleDailyUpdate();
  }
});

// A semana atual (ao vivo) e o botão "Fechar semana" (só aparece aos
// domingos) dependem do dia de hoje. Como renderFinanceList() agora só
// atualiza conteúdo de linhas que realmente precisam mudar (reconciliação,
// não mais reconstrução total), refreshAllRows() garante que TODAS as
// linhas visíveis recalculem "Semana atual"/"Fechar semana" mesmo sem
// nenhuma ação do usuário — renderFinanceList() continua sendo chamado
// também, pra manter o Painel Geral atualizado.
let dailyTimer = null;
function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    refreshAllRows();
    renderFinanceList();
    scheduleDailyUpdate();
  }, ms);
}
