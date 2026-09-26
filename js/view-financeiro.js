// === VIEW: Financeiro (Página 5) — Etapa 7, sub-entrega 2 ===
// mount()/unmount() chamados pelo router a cada troca de rota. Primeira
// migração deste arquivo pra SPA — segue exatamente o mesmo padrão já
// usado em view-edicao.js (Opção A: modal criado dinamicamente e anexado
// ao document.body, removido no unmount()).
//
// Modal "Últimas apostas" (Bloco P) — não existe em nenhum HTML estático
// (financeiro.html do Sistema 1 não tinha esse modal, é 100% novo desta
// etapa), então nasce aqui, junto com a view.
//
// CUIDADOS SPA (mesma classe já resolvida em Calendário/VIP/Edição):
//   K1  — sortMenuCleanup (retornado por initFinanceControls) precisa
//         ser chamado no unmount(), senão o listener global de
//         document.click do dropdown "Ordenar" se acumula a cada visita.
//   K12 — nenhuma referência de DOM fica `const` no topo do arquivo de
//         UI (ui-finance-panel.js já corrigido nesta sub-entrega).

import { state } from './state.js';
import {
  initFinanceControls, initFinanceOverview, initBetHistoryModalListeners,
  renderFinanceList, refreshAllRows, resetFinanceListCache,
  setBonusContextResolver
} from './ui-finance-panel.js';
import { loadObrigadoValuePerAppearance } from './vip-obrigado-store.js';
import { loadMisteriosoTemplates } from './vip-misterioso-store.js';
import { loadPreferences } from './user-preferences-store.js';

let dailyTimer = null;
let sortMenuCleanup = null;
let modalsContainerEl = null;

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

// Cria o modal "Últimas apostas" (Bloco P) e anexa ao document.body —
// não vive no shell global nem no HTML desta view (que só ocupa
// #appShell). Removido no unmount(), pra nunca ficar um modal órfão em
// outra rota. Reaproveita 100% o visual do modal de Histórico
// (.history-modal/.history-modal-content, modals.css) — nenhuma CSS
// nova precisa existir.
function createModals() {
  modalsContainerEl = document.createElement('div');
  modalsContainerEl.id = 'financeiroModalsRoot';
  modalsContainerEl.innerHTML = `
    <div class="history-modal" id="betHistoryModal">
      <div class="history-modal-content">
        <h2 id="betHistoryTitle">Últimas apostas</h2>
        <div id="betHistoryList"></div>
        <button class="history-close" id="betHistoryCloseBtn">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalsContainerEl);
}

function removeModals() {
  if (modalsContainerEl) {
    modalsContainerEl.remove();
    modalsContainerEl = null;
  }
}

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">💰 Financeiro</span>
        <h1>Financeiro</h1>
        <p>Depósito, saque, apostas, bônus e resultado — semana de segunda a domingo, por plataforma.</p>
      </div>
    </div>

    <section class="card-shell finance-overview" aria-label="Painel geral — todas as plataformas">
      <div class="finance-panel-header">
        <h3>Painel Geral</h3>
      </div>

      <div class="finance-overview-filter">
        <label for="financeOverviewFrom">De</label>
        <input type="date" id="financeOverviewFrom" aria-label="Data inicial" />
        <label for="financeOverviewTo">Até</label>
        <input type="date" id="financeOverviewTo" aria-label="Data final" />
        <button type="button" id="financeOverviewClearBtn" class="btn-cancel-modal">Limpar filtro</button>
      </div>

      <div class="finance-overview-filter">
        <input type="search" id="financeOverviewPlatformFilter" placeholder="Filtrar por plataforma (nome ou parte dele)" aria-label="Filtrar Painel Geral por plataforma" style="flex:1; min-width:220px; padding:0.6rem 0.75rem; border:1px solid #e6e9ee; border-radius:12px; outline:none;" />
      </div>

      <p class="finance-close-week-note">Soma de todas as plataformas com base nas semanas já fechadas (ou só das que baterem com o filtro de nome, se preenchido). Sem filtro, mostra todo o histórico. O Saldo (Balance) e o Rollover são sempre o valor atual da fase atual de cada plataforma e não são afetados pelo filtro de datas.</p>

      <div id="financeOverviewStats" class="finance-stats-grid"></div>

      <div class="finance-checkpoint">
        <button type="button" id="financeOverviewNewPhaseAllBtn" class="btn-cancel-modal">🔒 Iniciar nova fase em todas as plataformas</button>
      </div>
    </section>

    <section class="card-shell finance-panel" aria-label="Financeiro por plataforma">
      <div class="finance-panel-header">
        <h3>Plataformas</h3>
        <input id="financeSearch" type="search" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
        <button type="button" id="financeReorderBtn" class="btn-neutral" title="Só funciona com 'Padrão' selecionado no Ordenar">⚙️ Reordenar</button>
        <div class="sort-menu">
          <button type="button" id="financeBadgeVisibilityBtn" class="sort-menu-toggle" aria-expanded="false">👁 Badges</button>
          <div class="sort-menu-dropdown" id="financeBadgeVisibilityDropdown">
            <label style="display:flex; align-items:center; gap:0.4rem; padding:0.5rem 0.7rem; cursor:pointer;">
              <input type="checkbox" id="financeBadgeVisibilityBalance" style="width:auto;" /> Saldo
            </label>
            <label style="display:flex; align-items:center; gap:0.4rem; padding:0.5rem 0.7rem; cursor:pointer;">
              <input type="checkbox" id="financeBadgeVisibilityRollover" style="width:auto;" /> Rollover
            </label>
          </div>
        </div>
        <div class="sort-menu">
          <button type="button" id="financeSortBtn" class="sort-menu-toggle" aria-expanded="false">⇅ Ordenar</button>
          <div class="sort-menu-dropdown" id="financeSortDropdown"></div>
        </div>
      </div>

      <div id="financeList" role="list" aria-live="polite"></div>
    </section>
  `;

  resetFinanceListCache();
  createModals();

  // Item 22: manualOrder é COMPARTILHADO com a Edição (mesmo documento
  // users/{uid}/meta/preferences) — precisa estar no cache ANTES do
  // primeiro renderFinanceList(), senão a lista abriria na ordem
  // arbitrária de chegada do Firestore por um instante.
  await loadPreferences(state.currentUid);

  // Etapa 7, sub-entrega 3: Obrigado/Misterioso passam a alimentar
  // Saldo/Rollover ao vivo (via bonus-ledger-logic.js) — carregados UMA
  // vez aqui, ANTES do primeiro render, mesmo padrão já usado por
  // loadCardCustomization() em view-calendario.js. `misteriosoTemplate`
  // é POR PLATAFORMA (cada uma pode ter um template diferente ou
  // nenhum) — findTemplateForPlatform reaproveita a mesma lógica já
  // usada em ui-vip-panel.js.
  const obrigadoValuePerAppearance = await loadObrigadoValuePerAppearance(state.currentUid);
  const misteriosoTemplates = await loadMisteriosoTemplates(state.currentUid);
  function findTemplateForPlatform(platformId) {
    return misteriosoTemplates.find(t => (t.platformIds || []).includes(platformId)) || null;
  }
  setBonusContextResolver((platform) => ({
    obrigadoValuePerAppearance,
    misteriosoTemplate: findTemplateForPlatform(platform.id)
  }));

  sortMenuCleanup = initFinanceControls();
  initFinanceOverview();
  initBetHistoryModalListeners();

  renderFinanceList(); // já chama renderFinanceOverview() internamente
  scheduleDailyUpdate();
}

export function unmount() {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }

  if (sortMenuCleanup) {
    sortMenuCleanup();
    sortMenuCleanup = null;
  }

  removeModals();
}
