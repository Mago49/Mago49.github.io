// === PONTO DE ENTRADA — Página 4 (Edição) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { initManageControls, renderManageList, refreshAllRows, resetManageListCache } from './ui-platform-manage.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    // Zera o cache interno de linhas ANTES do primeiro render da sessão —
    // evita que um relogin na mesma aba reaproveite uma linha antiga
    // (mesmo id) com conteúdo desatualizado (ver comentário em
    // ui-platform-manage.js sobre a reconciliação de DOM).
    resetManageListCache();
    initManageControls();
    renderManageList();
    scheduleDailyUpdate();
  }
});

// "Dia X" de cada linha muda na virada do dia. Como renderManageList()
// agora só atualiza conteúdo de linhas que realmente precisam mudar
// (reconciliação, não mais reconstrução total), refreshAllRows() garante
// que o badge de TODAS as linhas visíveis seja recalculado mesmo sem
// nenhuma ação do usuário — renderManageList() continua sendo chamado
// também, pra corrigir qualquer reordenação (ex: modo "+ Dias no ciclo").
let dailyTimer = null;
function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    refreshAllRows();
    renderManageList();
    scheduleDailyUpdate();
  }, ms);
}
