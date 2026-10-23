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
//
// === (Sub-entrega E) ===
// a) CONTEXTO DE BÔNUS ESTRITO: Obrigado/Misterioso agora vêm de
//    loadBonusContextStrict (bonus-context-store.js). Antes vinham dos
//    loaders tolerantes, que em falha de leitura devolvem 0,30 / lista
//    vazia em silêncio — e esta tela GRAVA valores permanentes calculados
//    com eles: fechamento automático de semanas, fechamento de domingo
//    (Rollover do fechamento), "Inserir bônus hoje" (avulso = digitado −
//    esperado) e o snapshot diário. Se a leitura falhar, o Financeiro NÃO
//    abre (mesma política dos templates VIP no login): mostra o motivo e
//    "Tentar de novo". Nada é gravado nesse caminho.
// b) mountToken (mesmo padrão de view-vip.js/view-edicao.js): se o usuário
//    sair da rota durante os awaits, o mount desiste em silêncio — antes
//    ligava listeners nos modais já removidos (erro) e deixava o listener
//    global do "Ordenar" sem cleanup.
// c) removeModals() também no INÍCIO do mount (idempotente): o "Tentar de
//    novo" remonta a tela sem passar pelo unmount, e não pode duplicar os
//    modais no document.body.

import { state } from './state.js';
import {
  initFinanceControls, initFinanceOverview, initBetHistoryModalListeners, initWithdrawalsModalListeners,
  renderFinanceList, refreshAllRows, resetFinanceListCache,
  setBonusContextResolver
} from './ui-finance-panel.js';
import { autoCloseOverdueWeeks } from './finance-logic.js';
import { savePlatform } from './platforms-store.js';
import { showAppAlert } from './utils.js';
import { loadBonusContextStrict } from './bonus-context-store.js';
import { loadPreferences } from './user-preferences-store.js';

let dailyTimer = null;
let sortMenuCleanup = null;
let modalsContainerEl = null;
let mountToken = 0;

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

    <div class="history-modal" id="withdrawalsModal">
      <div class="history-modal-content">
        <h2 id="withdrawalsTitle">Saques</h2>
        <div id="withdrawalsList"></div>
        <button class="history-close" id="withdrawalsCloseBtn">Fechar</button>
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

// (Sub-entrega E) Tela de bloqueio quando o contexto de bônus não pôde ser
// confirmado. Texto fixo (nada do usuário entra em innerHTML).
function renderContextFailure(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">💰 Financeiro</span>
        <h1>Financeiro</h1>
      </div>
    </div>
    <section class="card-shell" style="padding:1.25rem;">
      <p class="finance-close-week-note" id="financeContextFailureText"></p>
      <div class="reset-modal-buttons" style="justify-content:flex-start; margin-top:0.9rem;">
        <button type="button" class="btn-confirm" id="financeContextRetryBtn">Tentar de novo</button>
      </div>
    </section>
  `;
  const textEl = container.querySelector('#financeContextFailureText');
  if (textEl) {
    textEl.textContent = 'Não foi possível carregar as configurações de bônus (valor do Obrigado e templates do Misterioso). ' +
      'Pra não calcular nem gravar Saldo, Rollover e bônus errados, o Financeiro não foi aberto. Nada foi alterado. ' +
      'Verifique a internet e tente de novo.';
  }
  const retryBtn = container.querySelector('#financeContextRetryBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      retryBtn.disabled = true;
      retryBtn.textContent = 'Carregando...';
      mount(container);
    });
  }
}

export async function mount(container) {
  const token = ++mountToken;
  const isStale = () => token !== mountToken;

  // (Sub-entrega E) Remontagem pelo "Tentar de novo" não passa pelo unmount.
  if (sortMenuCleanup) {
    sortMenuCleanup();
    sortMenuCleanup = null;
  }
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  removeModals();

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
      </div>

      <div class="finance-overview-filter">
        <input type="search" id="financeOverviewPlatformFilter" placeholder="Filtrar por plataforma (nome ou parte dele)" aria-label="Filtrar Painel Geral por plataforma" style="flex:1; min-width:220px; padding:0.6rem 0.75rem; border:1px solid #e6e9ee; border-radius:12px; outline:none;" />
      </div>

      <div class="finance-checkpoint finance-overview-actions">
        <button type="button" id="financeOverviewClearBtn">Limpar filtro</button>
        <button type="button" id="financeOverviewPhaseToggleBtn">🔀 Filtrar por fase</button>
        <button type="button" id="financeOverviewModeBtn">⚡ Ao Vivo</button>
      </div>

      <div id="financeOverviewPhaseWrap" class="app-hidden">
        <select id="financeOverviewPhaseSelect" aria-label="Filtrar Painel Geral por fase" style="padding:0.6rem 0.75rem; border:1px solid #e6e9ee; border-radius:12px; outline:none;"></select>
      </div>

      <div id="financeOverviewStats" class="finance-stats-grid"></div>

      <p class="finance-close-week-note" id="financeOverviewNote"></p>
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
  if (isStale()) return;

  // Etapa 7, sub-entrega 3: Obrigado/Misterioso alimentam Saldo/Rollover ao
  // vivo (via bonus-ledger-logic.js) — carregados UMA vez aqui, ANTES do
  // primeiro render. (Sub-entrega E) Leitura ESTRITA: sem confirmação dos
  // dois, a tela não abre (ver nota no topo).
  let bonusContext;
  try {
    bonusContext = await loadBonusContextStrict(state.currentUid);
  } catch (err) {
    console.error('Financeiro: contexto de bônus não confirmado — tela não aberta, nada gravado:', err);
    if (isStale()) return;
    setBonusContextResolver(null);
    removeModals();
    renderContextFailure(container);
    return;
  }
  if (isStale()) return;

  const resolveCtx = bonusContext.resolveCtx;
  setBonusContextResolver(resolveCtx);

  // SUB-ENTREGA 3 (item 5): segunda chance. Semanas passadas que ficaram
  // sem fechamento são fechadas aqui, ANTES do primeiro render, com o que
  // o sistema já contabilizou (ver autoCloseOverdueWeeks em finance-logic).
  // try/catch: um erro aqui nunca pode impedir o Financeiro de abrir.
  let autoClose = { touched: [], summary: [], weeksClosed: 0 };
  try {
    autoClose = autoCloseOverdueWeeks(state.platforms, resolveCtx, new Date());
    autoClose.touched.forEach(platform => savePlatform(state.currentUid, platform));
  } catch (err) {
    console.error('Erro no fechamento automático de semanas:', err);
  }

  sortMenuCleanup = initFinanceControls();
  initFinanceOverview();
  initBetHistoryModalListeners();
  initWithdrawalsModalListeners();

  renderFinanceList(); // já chama renderFinanceOverview() internamente
  scheduleDailyUpdate();

  if (autoClose.weeksClosed > 0) {
    const names = autoClose.summary.slice(0, 8).map(item => `${item.platformName} (${item.weeks.length})`).join(', ');
    const more = autoClose.summary.length > 8 ? ` e mais ${autoClose.summary.length - 8}` : '';
    await showAppAlert(
      `Fechei automaticamente ${autoClose.weeksClosed} semana(s) em ${autoClose.summary.length} plataforma(s) que ficaram sem fechamento: ${names}${more}. ` +
      `O bônus gravado é o que o sistema já contabilizou. Onde houve bônus, aparece o painel "Bônus real" na plataforma pra você confirmar o valor — ou use "Editar" na semana.`
    );
  }
}

export function unmount() {
  mountToken++; // (Sub-entrega E) invalida qualquer mount() ainda esperando um await

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
