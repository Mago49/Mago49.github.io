// === VIEW FINANCEIRO — acordeão por plataforma + Painel Geral (Etapa 7) ===
// Primeira migração deste arquivo pra SPA — baseado 1:1 no
// comportamento de ui-finance-panel.js (Sistema 1), com as mudanças da
// Etapa 7 abaixo. Cada linha mostra: a semana atual ao vivo (registrar
// saque, registrar aposta, "Últimas apostas" — Bloco P — e, só aos
// domingos, Bônus pra fechar a semana); o "Total da plataforma"; "Fases
// do Saldo"; e o Histórico de semanas.
//
// === O QUE MUDOU NESTA SUB-ENTREGA (2) ===
//
// 1) BLOCO P — "Últimas apostas": botão azul ao lado de "Registrar
//    aposta", abre um modal (mesmo padrão visual do Histórico de
//    Depósitos da Edição) listando só as apostas da SEMANA EM ABERTO —
//    editar (3 campos: Apostado, N° de apostas, R.B.) ou excluir. Apostas
//    de semanas já fechadas não aparecem aqui — correção nelas continua
//    pelo modal de edição já existente em cada card de semana fechada
//    (buildWeekCardEditing).
//
// 2) "INICIAR NOVA FASE" — mudança de contrato de startNewPhase()
//    (finance-logic.js, sub-entrega 1): agora SÓ aceita datas que caem
//    numa segunda-feira (recusa com { ok:false, reason:'not-monday' } —
//    ver nota extensa em finance-logic.js sobre o porquê: elimina por
//    construção o bug de fronteira de fase que já causou duplicação de
//    R.B./Bônus em produção) e PASSA A EXIGIR também um Rollover Inicial
//    (obrigatório, mesmo tratamento do Saldo Inicial — sem isso o
//    Rollover da fase nova nasceria incorreto). Por depender diretamente
//    da assinatura já alterada, esses dois campos entram JUNTO com esta
//    sub-entrega, mesmo o roteiro original tendo agrupado "Rollover
//    Inicial" com a sub-entrega 3 — não dava pra migrar este formulário
//    de outro jeito sem deixá-lo quebrado ou chamando a função com um
//    valor fictício.
//
// NADA MAIS desta etapa entra aqui ainda: sem "Inserir bônus hoje", sem
// "Bônus Acumulado" de domingo, sem Rollover visível nos quadrantes de
// estatística (statsGridHtml) — isso é a sub-entrega 3/4, que vai EDITAR
// este mesmo arquivo por cima (nunca reescrever do zero).
//
// === RECONCILIAÇÃO DE DOM (mesmo padrão já usado em Edição/Calendário/VIP) ===
// Um Map (rowElements) guarda o elemento de cada linha já presente na
// tela, indexado por platform.id — refreshRow() troca só uma linha,
// reconcileList() sincroniza o conjunto/ordem sem nunca esvaziar o
// container (evita o salto de scroll já documentado nas outras views).
//
// === CUIDADO SPA (Adendo K12, aplicado aqui pela primeira vez neste
//      arquivo) ===
// `financeListEl`/`financeSearchEl` NÃO são resolvidos no topo do
// módulo (isso quebraria, já que o router injeta o HTML da view DEPOIS
// do módulo ser importado) — viram variáveis `let`, resolvidas dentro de
// initFinanceControls(), chamada pelo mount() da view.
//
// === CUIDADO SPA (Adendo K1) ===
// initFinanceControls() retorna o cleanup de initSortMenu() — quem
// chama (view-financeiro.js) guarda e executa essa função no próprio
// unmount(), senão o listener global de document.click do dropdown
// "Ordenar" se acumularia a cada visita à rota.

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import { colorForLevel } from './cycle-logic.js';
import {
  getWeekStart, getWeekEnd, toLocalDateString, toLocalDateTimeString,
  computeCurrentWeekLive, closeWeek, isCurrentWeekClosed, canCloseCurrentWeek,
  updateClosedWeek, deleteClosedWeek, addHistoricalWeek,
  computePlatformTotals, computeOverallTotals, computeLiveBalance, computeRolloverLive,
  computePhaseHistory, startNewPhase, removeLastPhase
} from './finance-logic.js';
import {
  getExpectedBonusToday, computeBonusDiffToday,
  getAccumulatedBonusThisWeek, computeAutoAccruedBonusForWeek
} from './bonus-ledger-logic.js';
import { getCachedPreferences, saveManualOrder, saveBadgeVisibility } from './user-preferences-store.js';
import { savePlatforms, savePlatform } from './platforms-store.js';
import {
  parseFinanceSpreadsheet, formatImportedFieldName, formatImportedNumber
} from './finance-spreadsheet-import.js';
import { filterAndSortForManage } from './platform-sort.js';
import { initSortMenu } from './ui-sort.js';

// --- Referências de DOM do painel principal (busca + lista) ---
// Resolvidas por initFinanceControls(), chamada pelo mount() da view
// DEPOIS que o HTML do painel já foi escrito no container (K12).
let financeListEl = null;
let financeSearchEl = null;

// --- Referências de DOM do modal "Últimas apostas" (Bloco P) ---
// Resolvidas por initBetHistoryModalListeners(), chamada pelo mount() da
// view DEPOIS que o modal já foi criado e anexado ao document.body
// (mesmo padrão "Opção A" já usado pelos modais de Edição).
let betHistoryModal = null;
let betHistoryTitle = null;
let betHistoryList = null;
let betHistoryCloseBtn = null;

let currentSearch = '';
// Ponto 5.1: um dos FINANCE_SORT_MENU_OPTIONS.value, ou null (Padrão).
let currentMode = null;
let openRowId = null;
// Semana do histórico atualmente em edição (no máximo uma por vez):
// { platformId, weekStart } | null
let editingWeek = null;
// Data digitada na busca do histórico (dentro da linha aberta) — string
// 'AAAA-MM-DD' ou null. Reseta toda vez que uma linha é aberta/fechada.
let historyDateFilter = null;
// Id da plataforma mostrando o formulário "Iniciar nova fase" — só uma
// por vez. Reseta junto com o resto ao abrir/fechar uma linha.
let startingPhaseId = null;
// Id da plataforma mostrando a seção "Adicionar semana antiga" — só uma
// por vez. Reseta junto com o resto ao abrir/fechar uma linha.
let addingHistoricalWeekId = null;
// Quais das 3 seções colapsáveis ('total' | 'phases' | 'history') estão
// expandidas na linha aberta agora — todas começam recolhidas, reseta
// junto com o resto ao abrir/fechar uma linha.
let expandedSections = new Set();

// Bloco P — plataforma atualmente associada ao modal "Últimas apostas"
// aberto, e qual aposta (por referência de objeto) está em edição.
let currentBetHistoryPlatform = null;
let editingBetEntry = null;

// Etapa 7, sub-entrega 3: resolve o ctx (Obrigado/Misterioso) de CADA
// plataforma — setado uma vez pela view (view-financeiro.js), depois de
// carregar os dois do Firestore. Sem chamar setBonusContextResolver
// (ex: antes da view terminar de montar), devolve {} — VIP diário/
// semanal/mensal continuam funcionando normalmente mesmo assim (não
// dependem de ctx), só Obrigado/Misterioso ficam de fora até o
// resolvedor real ser definido.
let resolveCtxForPlatform = () => ({});

export function setBonusContextResolver(fn) {
  resolveCtxForPlatform = typeof fn === 'function' ? fn : () => ({});
}

// Item 22 — true enquanto o botão ⚙️ "Reordenar" está ativo — só tem
// efeito quando currentMode === null (Padrão), mesmo comportamento já
// validado em ui-platform-manage.js (Edição). manualOrder é o MESMO
// documento (users/{uid}/meta/preferences) — reordenar aqui também
// reordena a Edição, e vice-versa (Bloco B: "mesma ordem em Edição e
// Financeiro").
let reorderModeActive = false;

// Lista visível da última renderização — usada pelas setas ▲▼ pra saber
// qual é o vizinho VISÍVEL de uma plataforma (mesmo padrão da Edição).
let lastVisibleList = [];

// id da plataforma -> elemento <div class="platform-manage-row..."> já
// presente no DOM.
const rowElements = new Map();

const FINANCE_SORT_MENU_OPTIONS = [
  { value: 'saldo-desc', label: 'Maior Saldo' },
  { value: 'saldo-asc', label: 'Menor Saldo' },
  { value: 'az', label: 'A - Z' },
  { value: 'za', label: 'Z - A' },
  { value: '1-9', label: '1 – 9' },
  { value: '9-1', label: '9 – 1' },
  { value: 'com', label: 'Com Aposta' },
  { value: 'sem', label: 'Sem Aposta' },
  { value: 'ativas', label: 'Ativas' },
  { value: 'inativas', label: 'Inativas' }
];

function formatDatePt(isoDateStr) {
  if (!isoDateStr) return '';
  const cleanStr = isoDateStr.split('T')[0];
  const [y, m, d] = cleanStr.split('-');
  return `${d}/${m}`;
}

function formatDateTimePt(isoStr) {
  return new Date(isoStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Item 22 — aplica a ordem manual salva (compartilhada com a Edição) só
// quando "Padrão" está selecionado. Plataformas ausentes de manualOrder
// vão pro fim, preservando a ordem relativa entre elas.
function applyManualOrder(list) {
  const order = getCachedPreferences().manualOrder || [];
  if (order.length === 0) return list;
  const indexMap = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ia = indexMap.has(a.id) ? indexMap.get(a.id) : Infinity;
    const ib = indexMap.has(b.id) ? indexMap.get(b.id) : Infinity;
    return ia - ib;
  });
}

// Todas as plataformas, na ordem manual efetiva (salva + as que ainda
// não entraram nela, no fim) — base usada por moveManualOrder pra
// sempre gravar a lista COMPLETA, nunca só o subconjunto filtrado pela
// busca (senão salvar com uma busca ativa perderia a posição de quem
// estava escondido).
function getEffectiveOrderIds() {
  const order = getCachedPreferences().manualOrder || [];
  const allIds = new Set(state.platforms.map(p => p.id));
  const known = order.filter(id => allIds.has(id));
  const missing = state.platforms.map(p => p.id).filter(id => !known.includes(id));
  return [...known, ...missing];
}

// Troca a posição de `platformId` com seu vizinho VISÍVEL (direction -1
// = sobe, +1 = desce) — mesma lógica já validada em
// ui-platform-manage.js.
function moveManualOrder(platformId, direction) {
  const visibleIds = lastVisibleList.map(p => p.id);
  const idx = visibleIds.indexOf(platformId);
  const neighborIdx = idx + direction;
  if (idx === -1 || neighborIdx < 0 || neighborIdx >= visibleIds.length) return;
  const neighborId = visibleIds[neighborIdx];

  const ids = getEffectiveOrderIds();
  const posA = ids.indexOf(platformId);
  const posB = ids.indexOf(neighborId);
  if (posA === -1 || posB === -1) return;

  [ids[posA], ids[posB]] = [ids[posB], ids[posA]];
  saveManualOrder(state.currentUid, ids);
  renderFinanceList();
  // Corrige o disabled das setas ▲▼ de TODAS as linhas visíveis — mesmo
  // motivo já documentado na Edição (sem isso, uma linha que nasceu no
  // topo/fim ficaria com a seta desabilitada errada pra sempre).
  refreshAllRows();
}

function getVisibleList() {
  const q = currentSearch.trim().toLowerCase();
  let list = state.platforms.filter(p => p.name.toLowerCase().includes(q));

  if (currentMode === 'saldo-desc') {
    return [...list].sort((a, b) => computeLiveBalance(b, new Date(), resolveCtxForPlatform(b)) - computeLiveBalance(a, new Date(), resolveCtxForPlatform(a)));
  }
  if (currentMode === 'saldo-asc') {
    return [...list].sort((a, b) => computeLiveBalance(a, new Date(), resolveCtxForPlatform(a)) - computeLiveBalance(b, new Date(), resolveCtxForPlatform(b)));
  }

  if (currentMode) {
    list = filterAndSortForManage(list, currentMode);
  } else {
    list = applyManualOrder(list);
  }
  return list;
}

function statBox(label, value, cls = '') {
  return `
    <div class="finance-stat">
      <span class="finance-stat-label">${label}</span>
      <span class="finance-stat-value ${cls}">${value}</span>
    </div>`;
}

function statsGridHtml(totals, opts = {}) {
  const safeBalance = Math.max(0, Number(totals.balance) || 0);
  const balanceLabel = opts.balanceLabel || 'Saldo (Balance)';
  const initialBalanceBox = opts.showInitialBalance
    ? statBox('Saldo Inicial', formatCurrency(Math.max(0, Number(totals.initialBalance) || 0)))
    : '';
  // Etapa 7, sub-entrega 4 (Bloco P) — Rollover é opcional de propósito:
  // nem todo "totals" que passa por aqui tem um Rollover fazendo sentido
  // (ex: uma semana fechada individual tem só o RETRATO do fechamento,
  // rolloverAtClose — nunca o "totals.rollover" ao vivo). Quem chama
  // decide via opts.rolloverValue; undefined/null = não mostra a caixa.
  const initialRolloverBox = opts.showInitialRollover
    ? statBox('Rollover Inicial', formatCurrency(Math.max(0, Number(totals.initialRollover) || 0)))
    : '';
  const rolloverBox = (opts.rolloverValue !== undefined && opts.rolloverValue !== null)
    ? statBox(opts.rolloverLabel || 'Rollover', formatCurrency(Math.max(0, Number(opts.rolloverValue) || 0)), 'positive')
    : '';
  return `
    ${initialBalanceBox}
    ${initialRolloverBox}
    ${statBox('Depósito', formatCurrency(totals.deposit))}
    ${statBox('Saque', formatCurrency(totals.withdrawal))}
    ${statBox('Diferença', formatCurrency(totals.difference), totals.difference >= 0 ? 'positive' : 'negative')}
    ${statBox('Apostado', formatCurrency(totals.wagered))}
    ${statBox('N° Apostas', String(totals.betCount))}
    ${statBox('Bônus', formatCurrency(totals.bonus))}
    ${statBox('R.B.', formatCurrency(totals.resultBetting), totals.resultBetting >= 0 ? 'positive' : 'negative')}
    ${statBox('R.B. + Bônus', formatCurrency(totals.rbPlusBonus), totals.rbPlusBonus >= 0 ? 'positive' : 'negative')}
    ${statBox(balanceLabel, formatCurrency(safeBalance), 'positive')}
    ${rolloverBox}
  `;
}

// ---------- PAINEL GERAL (topo da página — todas as plataformas) ----------

export function initFinanceOverview() {
  const fromEl = document.getElementById('financeOverviewFrom');
  const toEl = document.getElementById('financeOverviewTo');
  const clearBtn = document.getElementById('financeOverviewClearBtn');
  const newPhaseAllBtn = document.getElementById('financeOverviewNewPhaseAllBtn');
  const platformFilterEl = document.getElementById('financeOverviewPlatformFilter');

  if (fromEl) fromEl.addEventListener('change', renderFinanceOverview);
  if (toEl) toEl.addEventListener('change', renderFinanceOverview);
  if (platformFilterEl) {
    // Item 20 (metade "Plataforma") — restringe o Painel Geral a quem
    // bate com o nome digitado. Mesmo adiamento pro próximo frame já
    // usado na busca principal, pra não brigar com o teclado virtual.
    let filterFrame = null;
    platformFilterEl.addEventListener('input', () => {
      if (filterFrame) cancelAnimationFrame(filterFrame);
      filterFrame = requestAnimationFrame(() => {
        filterFrame = null;
        renderFinanceOverview();
      });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      if (platformFilterEl) platformFilterEl.value = '';
      renderFinanceOverview();
    });
  }
  if (newPhaseAllBtn) {
    newPhaseAllBtn.addEventListener('click', async () => {
      const count = state.platforms.length;
      // Etapa 7: fase só pode começar numa segunda-feira. Pra "todas de
      // uma vez" (que não tem como pedir Saldo/Rollover Inicial
      // individual de cada plataforma), usamos sempre a segunda-feira
      // da semana atual — nunca "agora" cru, que quase nunca cai numa
      // segunda.
      const mondayThisWeek = getWeekStart(new Date());
      const mondayLabel = mondayThisWeek.toLocaleDateString('pt-BR');
      const ok = await showAppConfirm(
        `Iniciar uma nova fase pra todas as ${count} plataformas, a partir de segunda-feira ` +
        `(${mondayLabel} — toda fase nova precisa começar numa segunda-feira, pra nunca dividir ` +
        `uma semana entre duas fases), com Saldo Inicial e Rollover Inicial R$ 0,00 pra todas? ` +
        `O resultado da fase atual de cada uma continua guardado (visível em "Fases do Saldo" ` +
        `dentro de cada plataforma). Se cada plataforma tiver um Saldo/Rollover real diferente pra ` +
        `migrar, prefira abrir a fase individualmente em cada uma.`
      );
      if (!ok) return;

      let failedCount = 0;
      state.platforms.forEach(p => {
        const result = startNewPhase(p, mondayThisWeek, 0, 0);
        if (!result.ok) failedCount += 1; // não deveria acontecer (mondayThisWeek é sempre segunda)
      });
      if (failedCount > 0) {
        await showAppAlert(`${failedCount} plataforma(s) não puderam abrir a fase (erro inesperado de data). Tente abrir individualmente nelas.`);
      }
      // Ação em massa DE VERDADE — savePlatforms (plural) é o correto
      // só aqui, igual já era no Sistema 1.
      savePlatforms(state.currentUid, state.platforms);
      refreshAllRows();
      renderFinanceList();
    });
  }
}

export function renderFinanceOverview() {
  const statsEl = document.getElementById('financeOverviewStats');
  if (!statsEl) return;

  const fromEl = document.getElementById('financeOverviewFrom');
  const toEl = document.getElementById('financeOverviewTo');
  const platformFilterEl = document.getElementById('financeOverviewPlatformFilter');
  const from = fromEl && fromEl.value ? fromEl.value : null;
  const to = toEl && toEl.value ? toEl.value : null;

  // Item 20 (metade "Plataforma") — some junto com Data (interseção),
  // já que os dois filtros são aplicados em cima do MESMO conjunto antes
  // de computeOverallTotals somar.
  const platformQuery = (platformFilterEl?.value || '').trim().toLowerCase();
  const platformsForOverview = platformQuery
    ? state.platforms.filter(p => p.name.toLowerCase().includes(platformQuery))
    : state.platforms;

  const totals = computeOverallTotals(platformsForOverview, from, to, resolveCtxForPlatform);
  statsEl.innerHTML = statsGridHtml(totals, { rolloverValue: totals.rollover, rolloverLabel: 'Rollover (todas as plataformas)' });
}

// ---------- RECONCILIAÇÃO DE DOM ----------

function refreshRow(platformId) {
  const platform = state.platforms.find(pp => pp.id === platformId);
  if (!platform) return;
  const oldEl = rowElements.get(platformId);
  if (!oldEl) return;
  const newEl = buildRow(platform);
  oldEl.replaceWith(newEl);
  rowElements.set(platformId, newEl);
}

function reconcileList(list) {
  const existingEmpty = financeListEl.querySelector('.finance-empty');
  if (existingEmpty) existingEmpty.remove();

  if (list.length === 0) {
    rowElements.forEach(el => el.remove());
    rowElements.clear();
    const empty = document.createElement('div');
    empty.className = 'finance-empty';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    financeListEl.appendChild(empty);
    return;
  }

  const visibleIds = new Set(list.map(p => p.id));

  rowElements.forEach((el, id) => {
    if (!visibleIds.has(id)) {
      el.remove();
      rowElements.delete(id);
    }
  });

  list.forEach(p => {
    let el = rowElements.get(p.id);
    if (!el) {
      el = buildRow(p);
      rowElements.set(p.id, el);
    }
    financeListEl.appendChild(el);
  });
}

export function refreshAllRows() {
  rowElements.forEach((oldEl, platformId) => {
    const platform = state.platforms.find(p => p.id === platformId);
    if (!platform) return;
    const newEl = buildRow(platform);
    oldEl.replaceWith(newEl);
    rowElements.set(platformId, newEl);
  });
}

// Zera o estado em memória — DEVE ser chamado no início de cada mount()
// da view (ver view-financeiro.js), antes de initFinanceControls()/
// renderFinanceList(). Mesmo motivo já documentado em
// ui-platform-manage.js: o router já substitui o container inteiro a
// cada troca de rota, então só o cache em memória precisa ser zerado.
export function resetFinanceListCache() {
  rowElements.clear();
  openRowId = null;
  editingWeek = null;
  historyDateFilter = null;
  startingPhaseId = null;
  addingHistoricalWeekId = null;
  expandedSections = new Set();
  currentBetHistoryPlatform = null;
  editingBetEntry = null;
  reorderModeActive = false;
  lastVisibleList = [];
}

// ---------- LISTA DE PLATAFORMAS ----------

export function renderFinanceList() {
  renderFinanceOverview();
  if (!financeListEl) return;
  const list = getVisibleList();
  lastVisibleList = list;
  reconcileList(list);
}

function dividerEl() {
  const hr = document.createElement('hr');
  hr.className = 'manage-section-divider';
  return hr;
}

// ---------- SEÇÕES COLAPSÁVEIS ----------

function buildCollapsibleSection(p, sectionKey, label, buildContentFn) {
  const wrapper = document.createElement('div');
  wrapper.className = 'manage-data-section';

  const isExpanded = expandedSections.has(sectionKey);

  const header = document.createElement('div');
  header.className = 'manage-section-label manage-section-label-collapsible';
  const labelText = document.createElement('span');
  labelText.textContent = label;
  const chevron = document.createElement('span');
  chevron.className = 'platform-manage-chevron' + (isExpanded ? ' open' : '');
  chevron.textContent = '▾';
  header.appendChild(labelText);
  header.appendChild(chevron);
  header.addEventListener('click', () => {
    if (isExpanded) {
      expandedSections.delete(sectionKey);
      if (sectionKey === 'phases') startingPhaseId = null;
      if (sectionKey === 'history') {
        editingWeek = null;
        historyDateFilter = null;
        addingHistoricalWeekId = null;
      }
    } else {
      expandedSections.add(sectionKey);
    }
    refreshRow(p.id);
  });
  wrapper.appendChild(header);

  if (!isExpanded) return wrapper;

  wrapper.appendChild(buildContentFn());
  return wrapper;
}

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'platform-manage-row' + (p.id === openRowId ? ' open' : '');
  row.dataset.id = p.id;

  const live = computeCurrentWeekLive(p);
  const closed = isCurrentWeekClosed(p);
  const ctx = resolveCtxForPlatform(p);
  const liveBalance = computeLiveBalance(p, new Date(), ctx);
  const rolloverLive = computeRolloverLive(p, new Date(), ctx);

  const header = document.createElement('div');
  header.className = 'platform-manage-row-header';

  const title = document.createElement('div');
  title.className = 'platform-manage-row-title';
  title.textContent = p.name;

  const badges = document.createElement('div');
  badges.className = 'platform-manage-row-badges';

  // Item 25b: visibilidade de cada badge agora é uma preferência salva
  // (users/{uid}/meta/preferences) — default (true/true) reproduz o
  // comportamento de sempre pra quem nunca mexeu no botão 👁.
  const badgeVisibility = getCachedPreferences().badgeVisibility;

  if (badgeVisibility.financeBalanceBadge) {
    const balanceBadge = document.createElement('span');
    balanceBadge.className = 'platform-total-badge';
    balanceBadge.style.background = colorForLevel(liveBalance);
    balanceBadge.textContent = `Saldo ${formatCurrency(liveBalance)}`;
    balanceBadge.title = 'Saldo Inicial da fase atual (se houver) + depósitos - saques + resultado das apostas (R.B.) + bônus (fórmula + avulso), desde o início da fase atual (mínimo R$ 0,00)';
    badges.appendChild(balanceBadge);
  }

  if (badgeVisibility.financeRolloverBadge) {
    const rolloverBadge = document.createElement('span');
    rolloverBadge.className = 'platform-total-badge';
    rolloverBadge.style.background = '#dbeafe';
    rolloverBadge.style.color = '#1d4ed8';
    rolloverBadge.textContent = `Rollover ${formatCurrency(rolloverLive)}`;
    rolloverBadge.title = 'Quanto ainda falta apostar pra quitar o que entrou como depósito/bônus, desde o início da fase atual (mínimo R$ 0,00)';
    badges.appendChild(rolloverBadge);
  }

  if (closed) {
    const doneBadge = document.createElement('span');
    doneBadge.className = 'finance-closed-badge';
    doneBadge.textContent = '✓ semana fechada';
    badges.appendChild(doneBadge);
  }

  // Item 22 — setas ▲▼: só existem quando o modo "Reordenar" está ativo
  // E "Padrão" está selecionado (currentMode null) — mesma regra já
  // validada na Edição.
  let reorderControls = null;
  if (reorderModeActive && currentMode === null) {
    reorderControls = document.createElement('div');
    reorderControls.className = 'platform-manage-row-badges';
    reorderControls.style.gap = '0.25rem';

    const visibleIds = lastVisibleList.map(pp => pp.id);
    const idx = visibleIds.indexOf(p.id);

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'bet-manage-btn';
    upBtn.textContent = '▲';
    upBtn.disabled = idx <= 0;
    upBtn.setAttribute('aria-label', `Mover ${p.name} pra cima`);
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveManualOrder(p.id, -1);
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'bet-manage-btn';
    downBtn.textContent = '▼';
    downBtn.disabled = idx === -1 || idx >= visibleIds.length - 1;
    downBtn.setAttribute('aria-label', `Mover ${p.name} pra baixo`);
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveManualOrder(p.id, 1);
    });

    reorderControls.appendChild(upBtn);
    reorderControls.appendChild(downBtn);
  }

  const chevron = document.createElement('span');
  chevron.className = 'platform-manage-chevron';
  chevron.textContent = '▾';

  header.appendChild(title);
  header.appendChild(badges);
  if (reorderControls) header.appendChild(reorderControls);
  header.appendChild(chevron);
  header.addEventListener('click', () => {
    const previousOpenRowId = openRowId;
    const wasOpen = previousOpenRowId === p.id;
    openRowId = wasOpen ? null : p.id;
    editingWeek = null;
    historyDateFilter = null;
    startingPhaseId = null;
    addingHistoricalWeekId = null;
    expandedSections = new Set();
    if (!wasOpen && previousOpenRowId) {
      refreshRow(previousOpenRowId);
    }
    refreshRow(p.id);
  });

  const body = document.createElement('div');
  body.className = 'platform-manage-row-body';
  body.appendChild(buildCurrentWeekSection(p, live, closed, liveBalance, ctx));
  body.appendChild(dividerEl());
  body.appendChild(buildCollapsibleSection(p, 'total', 'Total da plataforma', () => buildPlatformTotalContent(p)));
  body.appendChild(dividerEl());
  body.appendChild(buildCollapsibleSection(p, 'phases', 'Fases do Saldo', () => buildPhaseContent(p)));
  body.appendChild(dividerEl());
  body.appendChild(buildCollapsibleSection(p, 'history', 'Histórico (semanas fechadas)', () => buildHistoryContent(p)));

  row.appendChild(header);
  row.appendChild(body);
  return row;
}

// ---------- SEÇÃO "SEMANA ATUAL" ----------

function buildCurrentWeekSection(p, live, closed, liveBalance, ctx) {
  const section = document.createElement('div');
  section.className = 'manage-actions-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Semana atual';
  section.appendChild(label);

  const weekLabel = document.createElement('div');
  weekLabel.className = 'finance-week-label';
  weekLabel.textContent = `${live.weekStart.toLocaleDateString('pt-BR')} – ${live.weekEnd.toLocaleDateString('pt-BR')}`;
  section.appendChild(weekLabel);

  const rolloverLive = computeRolloverLive(p, new Date(), ctx);
  const statsWrap = document.createElement('div');
  statsWrap.className = 'finance-week-current';
  statsWrap.innerHTML = `
    <div class="finance-stats-grid">
      ${statBox('Depósito', formatCurrency(live.deposit))}
      ${statBox('Saque', formatCurrency(live.withdrawal))}
      ${statBox('Diferença', formatCurrency(live.difference), live.difference >= 0 ? 'positive' : 'negative')}
      ${statBox('Apostado', formatCurrency(live.wagered))}
      ${statBox('N° Apostas', String(live.betCount))}
      ${statBox('R.B.', formatCurrency(live.resultBetting), live.resultBetting >= 0 ? 'positive' : 'negative')}
      ${statBox('Saldo (Balance)', formatCurrency(liveBalance), 'positive')}
      ${statBox('Rollover', formatCurrency(rolloverLive), 'positive')}
    </div>`;
  section.appendChild(statsWrap);

  if (closed) {
    const doneNote = document.createElement('p');
    doneNote.className = 'finance-close-week-note';
    doneNote.textContent = 'Semana já fechada. Os valores acima continuam sendo somados pra próxima semana.';
    section.appendChild(doneNote);
    return section;
  }

  // --- registrar saque ---
  const withdrawForm = document.createElement('div');
  withdrawForm.className = 'finance-entry-form';
  const withdrawInput = document.createElement('input');
  withdrawInput.type = 'number';
  withdrawInput.min = '0';
  withdrawInput.step = '0.01';
  withdrawInput.placeholder = 'Valor do saque';
  const withdrawBtn = document.createElement('button');
  withdrawBtn.className = 'bet-manage-btn';
  withdrawBtn.type = 'button';
  withdrawBtn.textContent = 'Registrar saque';
  withdrawBtn.addEventListener('click', async () => {
    const value = parseFloat(withdrawInput.value);
    if (isNaN(value) || value <= 0) {
      await showAppAlert('Digite um valor válido');
      return;
    }
    if (!p.withdrawals) p.withdrawals = [];
    p.withdrawals.push({ date: new Date().toISOString(), value });
    savePlatform(state.currentUid, p);
    openRowId = p.id;
    refreshRow(p.id);
    renderFinanceList();
  });
  withdrawForm.appendChild(withdrawInput);
  withdrawForm.appendChild(withdrawBtn);
  section.appendChild(withdrawForm);

  // --- registrar aposta + Últimas apostas (Bloco P) ---
  const betForm = document.createElement('div');
  betForm.className = 'finance-entry-form';
  const wageredInput = document.createElement('input');
  wageredInput.type = 'number';
  wageredInput.min = '0';
  wageredInput.step = '0.01';
  wageredInput.placeholder = 'Valor apostado';
  const betCountInput = document.createElement('input');
  betCountInput.type = 'number';
  betCountInput.min = '0';
  betCountInput.step = '1';
  betCountInput.placeholder = 'N° de apostas';
  const rbInput = document.createElement('input');
  rbInput.type = 'number';
  rbInput.step = '0.01';
  rbInput.placeholder = 'R.B. da aposta';
  const betBtn = document.createElement('button');
  betBtn.className = 'bet-manage-btn';
  betBtn.type = 'button';
  betBtn.textContent = 'Registrar aposta';
  betBtn.addEventListener('click', async () => {
    const wagered = parseFloat(wageredInput.value);
    const betCount = parseInt(betCountInput.value, 10);
    const resultBetting = parseFloat(rbInput.value);
    if (isNaN(wagered) || wagered <= 0 || isNaN(betCount) || betCount <= 0 || isNaN(resultBetting)) {
      await showAppAlert('Digite valor apostado, n° de apostas e R.B. válidos');
      return;
    }
    if (!p.betEntries) p.betEntries = [];
    p.betEntries.push({ date: new Date().toISOString(), wagered, betCount, resultBetting });
    savePlatform(state.currentUid, p);
    openRowId = p.id;
    refreshRow(p.id);
    renderFinanceList();
  });

  // Bloco P — botão azul, mesmo padrão visual de betBtn, ao lado dele.
  const betHistoryBtn = document.createElement('button');
  betHistoryBtn.className = 'bet-manage-btn';
  betHistoryBtn.type = 'button';
  betHistoryBtn.textContent = '🎲 Últimas apostas';
  betHistoryBtn.addEventListener('click', () => showBetHistoryModal(p));

  betForm.appendChild(wageredInput);
  betForm.appendChild(betCountInput);
  betForm.appendChild(rbInput);
  betForm.appendChild(betBtn);
  betForm.appendChild(betHistoryBtn);
  section.appendChild(betForm);

  // --- Etapa 7, sub-entrega 3: "Inserir bônus hoje" (Bloco F/Item 16 +
  //     Bloco P) --- Abaixo da linha de "Registrar aposta" (P3.1) —
  //     nunca na mesma linha, pra não sobrepor em telas pequenas.
  //     Reaproveita .finance-entry-form (já tem flex-wrap — P3.3).
  section.appendChild(buildDailyBonusSection(p, ctx));

  if (canCloseCurrentWeek()) {
    const closeSection = document.createElement('div');
    closeSection.className = 'finance-close-week';

    const closeLabel = document.createElement('div');
    closeLabel.className = 'manage-section-label';
    closeLabel.textContent = 'Fechar semana (domingo)';
    closeSection.appendChild(closeLabel);

    const closeNote = document.createElement('p');
    closeNote.className = 'finance-close-week-note';
    closeNote.textContent = `R.B. da semana já somado automaticamente: ${formatCurrency(live.resultBetting)}. Saldo atual (antes do Bônus final desta semana): ${formatCurrency(liveBalance)}. Informe o valor REAL total de bônus recebido na semana — o Saldo final é recalculado sozinho ao fechar.`;
    closeSection.appendChild(closeNote);

    // Bloco F Item 16.7 — só-leitura: soma do que a fórmula (Bônus 1) já
    // vinha creditando sozinha essa semana + o que foi lançado via
    // "Inserir bônus hoje" (Bônus 2, sem escala aqui — é o valor real
    // recebido). Ajuda o usuário a conferir ANTES de digitar o total
    // final abaixo — nunca substitui o campo manual.
    const accumulatedAuto = computeAutoAccruedBonusForWeek(p, new Date(), ctx);
    const accumulatedManual = getAccumulatedBonusThisWeek(p, new Date());
    const accumulatedStat = document.createElement('div');
    accumulatedStat.className = 'finance-stats-grid';
    accumulatedStat.innerHTML = statBox('Bônus Acumulado (fórmula + avulso)', formatCurrency(accumulatedAuto + accumulatedManual), 'positive');
    closeSection.appendChild(accumulatedStat);

    const closeForm = document.createElement('div');
    closeForm.className = 'finance-entry-form';
    const bonusInput = document.createElement('input');
    bonusInput.type = 'number';
    bonusInput.step = '0.01';
    bonusInput.placeholder = 'Bônus recebido na semana (valor real)';
    closeForm.appendChild(bonusInput);
    closeSection.appendChild(closeForm);

    const closeActions = document.createElement('div');
    closeActions.className = 'reset-modal-buttons';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-confirm';
    closeBtn.type = 'button';
    closeBtn.textContent = '🔒 Fechar semana';
    closeBtn.addEventListener('click', async () => {
      const bonus = parseFloat(bonusInput.value);
      if (isNaN(bonus)) {
        await showAppAlert('Preencha o Bônus pra fechar a semana.');
        return;
      }
      const ok = await showAppConfirm(`Fechar a semana de ${p.name}? Depois de fechada, os valores não mudam mais sozinhos.`);
      if (!ok) return;
      closeWeek(p, bonus, new Date(), ctx);
      savePlatform(state.currentUid, p);
      openRowId = p.id;
      refreshRow(p.id);
      renderFinanceList();
    });
    closeActions.appendChild(closeBtn);
    closeSection.appendChild(closeActions);
    section.appendChild(closeSection);
  }

  return section;
}

// ---------- Etapa 7, sub-entrega 3: "INSERIR BÔNUS HOJE" (Item 16.4/16.5) ----------
// Campo de bônus avulso + botão R (escala do Rollover pra ESTE
// lançamento específico, padrão 1:1). O sistema já desconta sozinho o
// que a fórmula (VIP diário/semanal/mensal + Obrigado/Misterioso) já
// contava pra hoje, e o que já foi lançado hoje em cliques anteriores —
// só a diferença vira uma entrada nova em otherBonusLog (Item 16.4/16.6:
// recalculado do zero a cada clique, nunca acumula erro de ordem entre
// "Apostei hoje" e "Inserir bônus hoje").
function buildDailyBonusSection(p, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'finance-entry-form';

  const bonusInput = document.createElement('input');
  bonusInput.type = 'number';
  bonusInput.step = '0.01';
  bonusInput.min = '0';
  bonusInput.placeholder = 'Inserir bônus hoje';
  bonusInput.setAttribute('aria-label', 'Valor total de bônus recebido hoje');
  wrap.appendChild(bonusInput);

  let currentScale = 1;

  // Escala (botão R) — some/aparece um campo numérico compacto ao lado,
  // padrão 1 (1:1). Só afeta o Rollover, nunca o Saldo (que é sempre
  // 1:1 — ver finance-logic.js/computeLiveBalance).
  const scaleInput = document.createElement('input');
  scaleInput.type = 'number';
  scaleInput.step = '1';
  scaleInput.min = '1';
  scaleInput.value = '1';
  scaleInput.className = 'history-value-input app-hidden';
  scaleInput.setAttribute('aria-label', 'Escala do Rollover pra este lançamento');

  const scaleBtn = document.createElement('button');
  scaleBtn.type = 'button';
  scaleBtn.className = 'bet-manage-btn';
  scaleBtn.textContent = 'R: 1x';
  scaleBtn.title = 'Escala do Rollover pra este lançamento — padrão 1:1, clique pra mudar';
  scaleBtn.addEventListener('click', () => {
    scaleInput.classList.toggle('app-hidden');
  });
  scaleInput.addEventListener('change', () => {
    const v = parseInt(scaleInput.value, 10);
    currentScale = (!isNaN(v) && v >= 1) ? v : 1;
    scaleInput.value = String(currentScale);
    scaleBtn.textContent = `R: ${currentScale}x`;
  });

  wrap.appendChild(scaleBtn);
  wrap.appendChild(scaleInput);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'bet-manage-btn';
  confirmBtn.textContent = 'Confirmar bônus';
  confirmBtn.addEventListener('click', async () => {
    const valorDigitado = parseFloat(bonusInput.value);
    if (isNaN(valorDigitado) || valorDigitado < 0) {
      await showAppAlert('Digite um valor válido pro bônus recebido hoje.');
      return;
    }

    const expected = getExpectedBonusToday(p, new Date(), ctx);
    const diff = computeBonusDiffToday(p, valorDigitado, new Date(), ctx);
    const rolloverValue = diff * currentScale;

    const ok = await showAppConfirm(
      `Registrar ${formatCurrency(valorDigitado)} de bônus hoje? ` +
      `O sistema já esperava ${formatCurrency(expected)} pela fórmula (VIP/Obrigado/Misterioso) hoje — ` +
      `será lançada só a diferença: ${formatCurrency(diff)} no Saldo` +
      (currentScale !== 1 ? ` e ${formatCurrency(rolloverValue)} no Rollover (escala ${currentScale}x)` : ' e no Rollover (escala 1:1)') +
      `.`
    );
    if (!ok) return;

    if (!p.otherBonusLog) p.otherBonusLog = [];
    p.otherBonusLog.push({
      date: new Date().toISOString(),
      rawValue: diff,
      scale: currentScale,
      rolloverValue,
      createdAt: new Date().toISOString()
    });
    savePlatform(state.currentUid, p);

    bonusInput.value = '';
    scaleInput.value = '1';
    currentScale = 1;
    scaleBtn.textContent = 'R: 1x';
    scaleInput.classList.add('app-hidden');

    openRowId = p.id;
    // Muda o Saldo (e o Rollover, quando visível — sub-entrega 4) — se
    // o modo ativo for Maior/Menor Saldo, a posição da linha pode mudar.
    refreshRow(p.id);
    renderFinanceList();
  });
  wrap.appendChild(confirmBtn);

  return wrap;
}

// ---------- SEÇÃO "TOTAL DA PLATAFORMA" ----------

function buildPlatformTotalContent(p) {
  const weeks = p.financeWeeks || [];
  const totals = computePlatformTotals(p, resolveCtxForPlatform(p));

  const card = document.createElement('div');
  card.className = 'finance-week-card finance-total-card';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${weeks.length} semana(s) fechada(s)</span>`;
  card.appendChild(header);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Saldo (Balance) é sempre o valor ATUAL da fase atual, ao vivo (já com o Saldo Inicial dela, se houver, e o bônus do dia já somado) — não é uma soma das semanas fechadas nem das fases anteriores.';
  card.appendChild(note);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = statsGridHtml(totals, { rolloverValue: totals.rollover, rolloverLabel: 'Rollover da fase atual' });
  card.appendChild(stats);

  return card;
}

// ---------- SEÇÃO "FASES DO SALDO" ----------

function buildPhaseContent(p) {
  const fragment = document.createDocumentFragment();

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Cada fase começa com um Saldo Inicial e um Rollover Inicial (informados na hora de abrir a fase) e soma os movimentos a partir dali. "Iniciar nova fase" só pode começar numa SEGUNDA-FEIRA — trava necessária pra nenhuma semana fechada nunca ficar dividida entre duas fases (isso já causou duplicação de valores no passado). Útil quando o histórico antigo é incompleto, tem números errados, ou quando você está migrando de uma planilha externa e quer começar do valor real de hoje.';
  fragment.appendChild(note);

  fragment.appendChild(buildPhaseControls(p));

  const phases = computePhaseHistory(p, new Date(), resolveCtxForPlatform(p));
  const list = document.createElement('div');
  list.className = 'finance-history';
  [...phases].reverse().forEach(phase => {
    list.appendChild(buildPhaseCard(phase));
  });
  fragment.appendChild(list);

  return fragment;
}

function buildPhaseControls(p) {
  const wrap = document.createElement('div');
  wrap.className = 'finance-checkpoint';

  if (startingPhaseId === p.id) {
    // Etapa 7: sem escolha de hora — toda fase nova começa às 00:00 da
    // segunda-feira escolhida (nunca outro horário, pra nunca abrir
    // margem de uma fase "quase alinhada" com a semana). type="date"
    // (não mais "datetime-local") + validação de dia da semana antes de
    // confirmar.
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    const defaultMonday = getWeekStart(new Date());
    dateInput.value = toLocalDateString(defaultMonday);
    dateInput.setAttribute('aria-label', 'Data de início da nova fase (precisa ser uma segunda-feira)');

    const initialBalanceInput = document.createElement('input');
    initialBalanceInput.type = 'number';
    initialBalanceInput.min = '0';
    initialBalanceInput.step = '0.01';
    initialBalanceInput.placeholder = 'Saldo Inicial da nova fase';
    initialBalanceInput.setAttribute('aria-label', 'Saldo Inicial da nova fase');

    const initialRolloverInput = document.createElement('input');
    initialRolloverInput.type = 'number';
    initialRolloverInput.min = '0';
    initialRolloverInput.step = '0.01';
    initialRolloverInput.placeholder = 'Rollover Inicial da nova fase';
    initialRolloverInput.setAttribute('aria-label', 'Rollover Inicial da nova fase');

    const row1 = document.createElement('div');
    row1.className = 'finance-entry-form';
    row1.appendChild(dateInput);
    wrap.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'finance-entry-form';
    row2.appendChild(initialBalanceInput);
    row2.appendChild(initialRolloverInput);
    wrap.appendChild(row2);

    const actions = document.createElement('div');
    actions.className = 'reset-modal-buttons';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn-confirm';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', async () => {
      if (!dateInput.value) {
        await showAppAlert('Escolha uma data.');
        return;
      }

      const initialBalance = parseFloat(initialBalanceInput.value);
      if (initialBalanceInput.value.trim() === '' || isNaN(initialBalance) || initialBalance < 0) {
        await showAppAlert('Informe o Saldo Inicial da nova fase (obrigatório, maior ou igual a zero).');
        return;
      }

      const initialRollover = parseFloat(initialRolloverInput.value);
      if (initialRolloverInput.value.trim() === '' || isNaN(initialRollover) || initialRollover < 0) {
        await showAppAlert('Informe o Rollover Inicial da nova fase (obrigatório, maior ou igual a zero) — o Saldo real só fica acertivo a partir de agora se esse valor estiver correto.');
        return;
      }

      const chosenDate = new Date(`${dateInput.value}T00:00:00`);
      if (chosenDate.getDay() !== 1) {
        await showAppAlert('A nova fase só pode começar numa SEGUNDA-FEIRA — escolha outra data. Essa trava existe pra nenhuma semana ficar dividida entre duas fases.');
        return;
      }

      const dateLabel = chosenDate.toLocaleDateString('pt-BR');
      const ok = await showAppConfirm(
        `Fechar a fase atual de ${p.name} e começar uma nova a partir de segunda-feira, ${dateLabel}, ` +
        `com Saldo Inicial de ${formatCurrency(initialBalance)} e Rollover Inicial de ${formatCurrency(initialRollover)}? ` +
        `Tudo registrado ANTES desse instante continua contando na fase que está fechando (guardada pra ` +
        `sempre em "Fases do Saldo"); a partir dele, conta na fase nova.`
      );
      if (!ok) return;

      const result = startNewPhase(p, chosenDate, initialBalance, initialRollover);
      if (!result.ok) {
        await showAppAlert('Não foi possível abrir a fase: a data escolhida não é uma segunda-feira.');
        return;
      }
      savePlatform(state.currentUid, p);
      startingPhaseId = null;
      openRowId = p.id;
      refreshRow(p.id);
      renderFinanceList();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel-modal';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => {
      startingPhaseId = null;
      refreshRow(p.id);
    });

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    wrap.appendChild(actions);
    return wrap;
  }

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'bet-manage-btn';
  startBtn.textContent = '🔒 Iniciar nova fase';
  startBtn.addEventListener('click', () => {
    startingPhaseId = p.id;
    openRowId = p.id;
    refreshRow(p.id);
  });
  actions.appendChild(startBtn);

  if ((p.balancePhases || []).length > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-cancel-modal';
    removeBtn.textContent = 'Remover última fase';
    removeBtn.addEventListener('click', async () => {
      const ok = await showAppConfirm('Remover a última fase (e o Saldo/Rollover Inicial dela)? O Saldo e o Rollover passam a contar de novo a partir de antes dela.');
      if (!ok) return;
      removeLastPhase(p);
      savePlatform(state.currentUid, p);
      openRowId = p.id;
      refreshRow(p.id);
      renderFinanceList();
    });
    actions.appendChild(removeBtn);
  }

  wrap.appendChild(actions);
  return wrap;
}

function buildPhaseCard(phase) {
  const card = document.createElement('div');
  card.className = 'finance-week-card' + (phase.isCurrent ? ' finance-total-card' : '');

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  const startLabel = phase.startDate ? formatDateTimePt(phase.startDate) : 'início';
  const endLabel = phase.endDate ? formatDateTimePt(phase.endDate) : 'agora (atual)';
  header.innerHTML = `<span>Fase ${phase.phaseNumber}: ${startLabel} – ${endLabel}</span>`;
  card.appendChild(header);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = statsGridHtml(phase, {
    balanceLabel: phase.isCurrent ? 'Saldo da fase atual' : 'Saldo da fase',
    showInitialBalance: true,
    showInitialRollover: true,
    rolloverValue: phase.rollover,
    rolloverLabel: phase.isCurrent ? 'Rollover da fase atual' : 'Rollover da fase'
  });
  card.appendChild(stats);

  return card;
}

// ---------- SEÇÃO "HISTÓRICO" ----------

function buildHistoryContent(p) {
  const fragment = document.createDocumentFragment();

  fragment.appendChild(buildAddHistoricalWeekControls(p));

  const searchRow = document.createElement('div');
  searchRow.className = 'finance-entry-form';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.setAttribute('aria-label', 'Buscar semana por data');
  if (historyDateFilter) dateInput.value = historyDateFilter;
  dateInput.addEventListener('change', () => {
    historyDateFilter = dateInput.value || null;
    openRowId = p.id;
    refreshRow(p.id);
  });
  searchRow.appendChild(dateInput);

  if (historyDateFilter) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn-cancel-modal';
    clearBtn.textContent = 'Limpar busca';
    clearBtn.addEventListener('click', () => {
      historyDateFilter = null;
      openRowId = p.id;
      refreshRow(p.id);
    });
    searchRow.appendChild(clearBtn);
  }
  fragment.appendChild(searchRow);

  let weeks = [...(p.financeWeeks || [])].sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  if (historyDateFilter) {
    const [y, m, d] = historyDateFilter.split('-').map(Number);
    const filterDate = new Date(y, m - 1, d, 12, 0, 0);
    const targetWeekStart = toLocalDateString(getWeekStart(filterDate));
    weeks = weeks.filter(w => w.weekStart === targetWeekStart);
  }

  if (weeks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'finance-empty';
    empty.textContent = historyDateFilter
      ? 'Nenhuma semana fechada encontrada pra essa data.'
      : 'Nenhuma semana fechada ainda.';
    fragment.appendChild(empty);
    return fragment;
  }

  const history = document.createElement('div');
  history.className = 'finance-history';

  weeks.forEach(w => {
    const isEditing = !!editingWeek
      && editingWeek.platformId === p.id
      && editingWeek.weekStart === w.weekStart;

    history.appendChild(isEditing ? buildWeekCardEditing(p, w) : buildWeekCardReadOnly(p, w));
  });

  fragment.appendChild(history);
  return fragment;
}

function describeAddHistoricalWeekFailure(reason) {
  if (reason === 'current-week') {
    return 'Essa é a semana atual — ela já é registrada automaticamente pelos campos de "Semana atual" acima, não precisa (e não dá) inserir por aqui.';
  }
  if (reason === 'duplicate') {
    return 'Já existe uma semana fechada nesse período pra essa plataforma. Use "Editar" nela se precisar corrigir algo, ou "Excluir" e adicione de novo.';
  }
  return 'Não foi possível adicionar essa semana.';
}

function shortAddHistoricalWeekFailureReason(reason) {
  if (reason === 'current-week') return 'é a semana atual, não pode ser inserida por aqui';
  if (reason === 'duplicate') return 'semana já cadastrada';
  return 'não foi possível adicionar';
}

function buildAddHistoricalWeekControls(p) {
  const wrap = document.createElement('div');
  wrap.className = 'finance-checkpoint';

  if (addingHistoricalWeekId !== p.id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bet-manage-btn';
    btn.textContent = '+ Adicionar semana antiga';
    btn.addEventListener('click', () => {
      addingHistoricalWeekId = p.id;
      openRowId = p.id;
      refreshRow(p.id);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  renderHistoricalWeekModeChoice(p, wrap);
  return wrap;
}

function renderHistoricalWeekModeChoice(p, wrap) {
  wrap.innerHTML = '';

  const modeRow = document.createElement('div');
  modeRow.className = 'finance-entry-form';

  const manualBtn = document.createElement('button');
  manualBtn.type = 'button';
  manualBtn.className = 'bet-manage-btn';
  manualBtn.textContent = 'Preencher manualmente';
  manualBtn.addEventListener('click', () => {
    buildManualHistoricalWeekControls(p, wrap);
  });

  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'bet-manage-btn';
  pasteBtn.textContent = 'Colar da planilha';
  pasteBtn.addEventListener('click', () => {
    buildSpreadsheetHistoricalWeekControls(p, wrap);
  });

  modeRow.appendChild(manualBtn);
  modeRow.appendChild(pasteBtn);
  wrap.appendChild(modeRow);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Escolha como deseja inserir a semana. "Colar da planilha" permite copiar várias plataformas de uma vez; o sistema calcula sozinho Diferença, Saldo e R.B. + Bônus. Backfill não pede Rollover Inicial — ele não abre fase, só insere uma semana fechada dentro da fase já aberta.';
  wrap.appendChild(note);
}

function buildManualHistoricalWeekControls(p, wrap) {
  wrap.innerHTML = '';

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Escolha qualquer dia dentro da semana que quer inserir (a semana inteira, de segunda a domingo, é calculada a partir dele). Diferença e R.B. + Bônus são calculados sozinhos.';
  wrap.appendChild(note);

  const dateRow = document.createElement('div');
  dateRow.className = 'finance-entry-form';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.setAttribute('aria-label', 'Data dentro da semana antiga');
  dateRow.appendChild(dateInput);
  wrap.appendChild(dateRow);

  const row1 = document.createElement('div');
  row1.className = 'finance-entry-form';
  // Item 26t: nascem vazios (placeholder só como dica), não com "0"
  // pré-preenchido — evita que o usuário esqueça de digitar um campo e
  // ele entre como zero sem querer.
  const depositInput = numberInput('Depósito', ''); depositInput.min = '0';
  const withdrawalInput = numberInput('Saque', ''); withdrawalInput.min = '0';
  row1.appendChild(depositInput);
  row1.appendChild(withdrawalInput);
  wrap.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'finance-entry-form';
  const wageredInput = numberInput('Apostado', ''); wageredInput.min = '0';
  const betCountInput = numberInput('N° de apostas', '', '1'); betCountInput.min = '0';
  row2.appendChild(wageredInput);
  row2.appendChild(betCountInput);
  wrap.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'finance-entry-form';
  const bonusInput = numberInput('Bônus', '');
  const resultInput = numberInput('Result Betting (R.B.)', '');
  row3.appendChild(bonusInput);
  row3.appendChild(resultInput);
  wrap.appendChild(row3);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-confirm';
  saveBtn.textContent = 'Adicionar semana';
  saveBtn.addEventListener('click', async () => {
    if (!dateInput.value) {
      await showAppAlert('Escolha uma data dentro da semana.');
      return;
    }

    const deposit = parseFloat(depositInput.value);
    const withdrawal = parseFloat(withdrawalInput.value);
    const wagered = parseFloat(wageredInput.value);
    const betCount = parseInt(betCountInput.value, 10);
    const bonus = parseFloat(bonusInput.value);
    const resultBetting = parseFloat(resultInput.value);

    if ([deposit, withdrawal, wagered, betCount, bonus, resultBetting].some(v => isNaN(v))) {
      await showAppAlert('Preencha todos os campos com valores válidos.');
      return;
    }

    const chosenDate = new Date(`${dateInput.value}T12:00:00`);
    const wStart = getWeekStart(chosenDate);
    const wEnd = getWeekEnd(wStart);
    const rangeLabel = `${wStart.toLocaleDateString('pt-BR')} – ${wEnd.toLocaleDateString('pt-BR')}`;

    const ok = await showAppConfirm(`Adicionar a semana de ${rangeLabel} pra ${p.name}, com Depósito ${formatCurrency(deposit)} e Saque ${formatCurrency(withdrawal)}?`);
    if (!ok) return;

    const result = addHistoricalWeek(p, chosenDate, { deposit, withdrawal, wagered, betCount, bonus, resultBetting });
    if (!result.ok) {
      await showAppAlert(describeAddHistoricalWeekFailure(result.reason));
      return;
    }

    savePlatform(state.currentUid, p);
    addingHistoricalWeekId = null;
    openRowId = p.id;
    refreshRow(p.id);
    renderFinanceList();
  });

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'bet-manage-btn';
  backBtn.textContent = '← Voltar';
  backBtn.addEventListener('click', () => {
    renderHistoricalWeekModeChoice(p, wrap);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    addingHistoricalWeekId = null;
    refreshRow(p.id);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(backBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);
}

function buildSpreadsheetHistoricalWeekControls(p, wrap) {
  wrap.innerHTML = '';

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Copie da planilha o bloco que contém os nomes das plataformas e as linhas Deposit, Withdrawal, Bonus, Amount wagered, N° Betting e Result Betting. Pode colar várias plataformas de uma vez.';
  wrap.appendChild(note);

  const dateRow = document.createElement('div');
  dateRow.className = 'finance-entry-form';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.setAttribute('aria-label', 'Data dentro da semana antiga');
  dateRow.appendChild(dateInput);
  wrap.appendChild(dateRow);

  const pasteInput = document.createElement('textarea');
  pasteInput.className = 'finance-spreadsheet-paste';
  pasteInput.rows = 10;
  pasteInput.placeholder = 'Cole aqui (Ctrl+V) os dados copiados da planilha...';
  pasteInput.setAttribute('aria-label', 'Dados da planilha');
  wrap.appendChild(pasteInput);

  const preview = document.createElement('div');
  preview.className = 'finance-spreadsheet-preview';
  wrap.appendChild(preview);

  const analyzeBtn = document.createElement('button');
  analyzeBtn.type = 'button';
  analyzeBtn.className = 'bet-manage-btn';
  analyzeBtn.textContent = 'Analisar dados';
  wrap.appendChild(analyzeBtn);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn-confirm';
  importBtn.textContent = 'Importar semanas';
  importBtn.disabled = true;

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'bet-manage-btn';
  backBtn.textContent = '← Voltar';
  backBtn.addEventListener('click', () => {
    renderHistoricalWeekModeChoice(p, wrap);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    addingHistoricalWeekId = null;
    refreshRow(p.id);
  });

  actions.appendChild(importBtn);
  actions.appendChild(backBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  let parsedResult = null;

  function renderPreview(parsed) {
    preview.innerHTML = '';

    if (parsed.errors.length) {
      const error = document.createElement('div');
      error.className = 'finance-close-week-note';
      error.textContent = parsed.errors.join(' ');
      preview.appendChild(error);
      importBtn.disabled = true;
      return;
    }

    const title = document.createElement('p');
    title.className = 'finance-close-week-note';
    title.textContent = `Plataformas reconhecidas: ${parsed.platforms.length}. Apenas as linhas brutas serão importadas; Diferença, Saldo e R.B. + Bônus são ignorados.`;
    preview.appendChild(title);

    const list = document.createElement('div');
    list.className = 'finance-spreadsheet-preview-list';

    parsed.platforms.forEach(item => {
      const row = document.createElement('div');
      row.className = 'finance-stat';

      const label = document.createElement('span');
      label.className = 'finance-stat-label';
      label.textContent = item.platformName;

      const values = document.createElement('span');
      values.className = 'finance-stat-value';

      if (item.valid) {
        const f = item.fields;
        values.textContent = `✓ Dep. ${formatImportedNumber(f.deposit)} | Saque ${formatImportedNumber(f.withdrawal)} | Apostado ${formatImportedNumber(f.wagered)} | ${formatImportedNumber(f.betCount)} apostas | Bônus ${formatImportedNumber(f.bonus)} | R.B. ${formatImportedNumber(f.resultBetting)}`;
      } else {
        const missing = item.missing.map(formatImportedFieldName);
        const invalid = item.invalid.map(x => `${formatImportedFieldName(x.field)} (${x.raw})`);
        const problems = [];
        if (missing.length) problems.push(`faltando: ${missing.join(', ')}`);
        if (invalid.length) problems.push(`inválido: ${invalid.join(', ')}`);
        values.textContent = `⚠ ${problems.join(' | ')}`;
      }

      row.appendChild(label);
      row.appendChild(values);
      list.appendChild(row);
    });

    preview.appendChild(list);

    if (parsed.warnings.length) {
      const warning = document.createElement('p');
      warning.className = 'finance-close-week-note';
      warning.textContent = parsed.warnings.join(' ');
      preview.appendChild(warning);
    }

    importBtn.disabled = !parsed.platforms.some(item => item.valid) || !dateInput.value;
  }

  function analyze() {
    parsedResult = parseFinanceSpreadsheet(
      pasteInput.value,
      state.platforms.map(item => item.name)
    );
    renderPreview(parsedResult);
  }

  analyzeBtn.addEventListener('click', analyze);

  dateInput.addEventListener('change', () => {
    if (parsedResult) renderPreview(parsedResult);
  });

  pasteInput.addEventListener('paste', () => {
    setTimeout(analyze, 0);
  });

  importBtn.addEventListener('click', async () => {
    if (!dateInput.value) {
      await showAppAlert('Escolha uma data dentro da semana.');
      return;
    }

    if (!parsedResult) analyze();
    if (!parsedResult || !parsedResult.platforms.some(item => item.valid)) {
      await showAppAlert('Não há nenhuma plataforma válida pronta para importar.');
      return;
    }

    const chosenDate = new Date(`${dateInput.value}T12:00:00`);
    const wStart = getWeekStart(chosenDate);
    const wEnd = getWeekEnd(wStart);
    const rangeLabel = `${wStart.toLocaleDateString('pt-BR')} – ${wEnd.toLocaleDateString('pt-BR')}`;

    const platformMap = new Map(state.platforms.map(item => [item.name.toLowerCase(), item]));
    const candidates = parsedResult.platforms.filter(item => item.valid);
    const unavailable = [];
    const duplicate = [];
    const ready = [];

    candidates.forEach(item => {
      const platform = platformMap.get(item.platformName.toLowerCase());
      if (!platform) {
        unavailable.push(item.platformName);
        return;
      }
      const alreadyExists = (platform.financeWeeks || []).some(w => w.weekStart === toLocalDateString(wStart));
      if (alreadyExists) {
        duplicate.push(item.platformName);
        return;
      }
      ready.push({ item, platform });
    });

    if (ready.length === 0) {
      const details = [];
      if (duplicate.length) details.push(`já cadastradas: ${duplicate.join(', ')}`);
      if (unavailable.length) details.push(`não encontradas: ${unavailable.join(', ')}`);
      await showAppAlert(`Nenhuma plataforma está pronta para importar a semana de ${rangeLabel}. ${details.join(' | ')}`);
      return;
    }

    const previewText = ready.map(({ item }) => item.platformName).join(', ');
    const skipped = [];
    if (duplicate.length) skipped.push(`já cadastradas: ${duplicate.join(', ')}`);
    if (unavailable.length) skipped.push(`não encontradas: ${unavailable.join(', ')}`);
    const skippedText = skipped.length ? ` ${skipped.join(' | ')}.` : '';

    const ok = await showAppConfirm(
      `Importar a semana de ${rangeLabel} para ${ready.length} plataforma(s): ${previewText}?${skippedText}`
    );
    if (!ok) return;

    const imported = [];
    const failed = [];

    for (const { item, platform } of ready) {
      try {
        const result = addHistoricalWeek(platform, chosenDate, item.fields);
        if (!result.ok) {
          failed.push(`${platform.name} (${shortAddHistoricalWeekFailureReason(result.reason)})`);
          continue;
        }
        savePlatform(state.currentUid, platform);
        imported.push(platform.name);
      } catch (error) {
        console.error('Erro ao importar semana da planilha:', error);
        failed.push(`${platform.name} (erro inesperado ao salvar — tente novamente)`);
      }
    }

    addingHistoricalWeekId = null;
    ready.forEach(({ platform }) => refreshRow(platform.id));
    refreshRow(p.id);
    renderFinanceList();

    const messageParts = [];
    if (imported.length) messageParts.push(`Importadas: ${imported.join(', ')}.`);
    if (failed.length) messageParts.push(`Falharam: ${failed.join(', ')}.`);
    if (duplicate.length) messageParts.push(`Ignoradas por duplicidade: ${duplicate.join(', ')}.`);
    if (unavailable.length) messageParts.push(`Não encontradas no sistema: ${unavailable.join(', ')}.`);
    await showAppAlert(messageParts.join(' '));
  });
}

function buildWeekCardReadOnly(p, w) {
  const card = document.createElement('div');
  card.className = 'finance-week-card';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';

  const rangeSpan = document.createElement('span');
  rangeSpan.textContent = `${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)}`;

  const btnGroup = document.createElement('div');
  btnGroup.className = 'finance-week-card-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'bet-manage-btn';
  editBtn.textContent = 'Editar';
  editBtn.addEventListener('click', () => {
    editingWeek = { platformId: p.id, weekStart: w.weekStart };
    openRowId = p.id;
    refreshRow(p.id);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'history-delete-btn';
  deleteBtn.textContent = 'Excluir';
  deleteBtn.addEventListener('click', async () => {
    const ok = await showAppConfirm(`Excluir a semana de ${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)} de ${p.name}? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    deleteClosedWeek(p, w.weekStart);
    savePlatform(state.currentUid, p);
    openRowId = p.id;
    refreshRow(p.id);
    renderFinanceList();
  });

  btnGroup.appendChild(editBtn);
  btnGroup.appendChild(deleteBtn);

  header.appendChild(rangeSpan);
  header.appendChild(btnGroup);
  card.appendChild(header);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = statsGridHtml(w, {
    balanceLabel: 'Saldo (travado nesta semana)',
    rolloverValue: w.rolloverAtClose,
    rolloverLabel: 'Rollover (no momento do fechamento)'
  });
  card.appendChild(stats);

  return card;
}

function buildWeekCardEditing(p, w) {
  const card = document.createElement('div');
  card.className = 'finance-week-card finance-week-card-editing';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)}</span>`;
  card.appendChild(header);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Diferença e R.B. + Bônus são recalculados automaticamente ao salvar. O Saldo travado desta semana e o Rollover distribuído (bonusRollover/rolloverAtClose) são fixos e não podem ser editados aqui — se precisar corrigir de verdade, o caminho mais seguro é excluir esta semana e fechar de novo.';
  card.appendChild(note);

  if (w.rolloverAtClose !== undefined && w.rolloverAtClose !== null) {
    const rolloverStat = document.createElement('div');
    rolloverStat.className = 'finance-stats-grid';
    rolloverStat.innerHTML = statBox('Rollover (no momento do fechamento)', formatCurrency(Math.max(0, Number(w.rolloverAtClose) || 0)), 'positive');
    card.appendChild(rolloverStat);
  }

  const row1 = document.createElement('div');
  row1.className = 'finance-entry-form';
  const depositInput = numberInput('Depósito', w.deposit);
  const withdrawalInput = numberInput('Saque', w.withdrawal);
  row1.appendChild(depositInput);
  row1.appendChild(withdrawalInput);
  card.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'finance-entry-form';
  const wageredInput = numberInput('Apostado', w.wagered);
  const betCountInput = numberInput('N° de apostas', w.betCount, '1');
  row2.appendChild(wageredInput);
  row2.appendChild(betCountInput);
  card.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'finance-entry-form';
  const bonusInput = numberInput('Bônus', w.bonus);
  const resultInput = numberInput('Result Betting (R.B.)', w.resultBetting);
  row3.appendChild(bonusInput);
  row3.appendChild(resultInput);
  card.appendChild(row3);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-confirm';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', async () => {
    const deposit = parseFloat(depositInput.value);
    const withdrawal = parseFloat(withdrawalInput.value);
    const wagered = parseFloat(wageredInput.value);
    const betCount = parseInt(betCountInput.value, 10);
    const bonus = parseFloat(bonusInput.value);
    const resultBetting = parseFloat(resultInput.value);

    if ([deposit, withdrawal, wagered, betCount, bonus, resultBetting].some(v => isNaN(v))) {
      await showAppAlert('Preencha todos os campos com valores válidos.');
      return;
    }

    updateClosedWeek(p, w.weekStart, { deposit, withdrawal, wagered, betCount, bonus, resultBetting });
    savePlatform(state.currentUid, p);
    editingWeek = null;
    openRowId = p.id;
    refreshRow(p.id);
    renderFinanceList();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    editingWeek = null;
    refreshRow(p.id);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  card.appendChild(actions);

  return card;
}

function numberInput(placeholder, value, step = '0.01') {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.placeholder = placeholder;
  input.value = value;
  input.setAttribute('aria-label', placeholder);
  return input;
}

// ============================================================
// BLOCO P — MODAL "ÚLTIMAS APOSTAS" (só semana em aberto)
// ============================================================
// Mesmo padrão visual do modal de Histórico de Depósitos (Edição):
// item + valor + Editar/Excluir, botão Voltar/Fechar no rodapé. Reusa
// classes já globais (modals.css/manage-panel.css/panel.css) — nenhuma
// CSS nova precisa ser criada.

function formatBetEntryDateTime(isoStr) {
  return new Date(isoStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Só as apostas da semana ATUAL EM ABERTO — semanas fechadas continuam
// sendo corrigidas pelo modal de edição já existente em cada card
// (buildWeekCardEditing).
function getCurrentWeekBetEntries(platform, refDate = new Date()) {
  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);
  return (platform.betEntries || []).filter(e => {
    const d = new Date(e.date);
    return d >= weekStart && d <= weekEnd;
  });
}

function showBetHistoryModal(platform) {
  currentBetHistoryPlatform = platform;
  editingBetEntry = null;
  renderBetHistoryList();
  if (betHistoryModal) betHistoryModal.style.display = 'flex';
}

function closeBetHistoryModal() {
  if (betHistoryModal) betHistoryModal.style.display = 'none';
  currentBetHistoryPlatform = null;
  editingBetEntry = null;
}

function renderBetHistoryList() {
  if (!betHistoryList || !currentBetHistoryPlatform) return;
  const platform = currentBetHistoryPlatform;

  const live = computeCurrentWeekLive(platform);
  if (betHistoryTitle) {
    betHistoryTitle.textContent = `Últimas apostas — ${platform.name} (${live.weekStart.toLocaleDateString('pt-BR')} – ${live.weekEnd.toLocaleDateString('pt-BR')})`;
  }

  betHistoryList.innerHTML = '';

  const entries = [...getCurrentWeekBetEntries(platform)].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (entries.length === 0) {
    betHistoryList.innerHTML = '<div class="history-empty">Nenhuma aposta registrada nesta semana ainda.</div>';
    return;
  }

  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const isEditingThis = editingBetEntry === entry;

    if (isEditingThis) {
      const editWrap = document.createElement('div');
      editWrap.className = 'platform-form-fields';
      editWrap.style.flex = '1';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = formatBetEntryDateTime(entry.date);
      editWrap.appendChild(dateSpan);

      const wageredInput = numberInput('Valor apostado', entry.wagered);
      const betCountInput = numberInput('N° de apostas', entry.betCount, '1');
      const rbInput = numberInput('R.B. da aposta', entry.resultBetting);
      editWrap.appendChild(wageredInput);
      editWrap.appendChild(betCountInput);
      editWrap.appendChild(rbInput);
      item.appendChild(editWrap);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'history-edit-btn';
      saveBtn.textContent = 'Salvar';
      saveBtn.addEventListener('click', async () => {
        const wagered = parseFloat(wageredInput.value);
        const betCount = parseInt(betCountInput.value, 10);
        const resultBetting = parseFloat(rbInput.value);
        if (isNaN(wagered) || wagered <= 0 || isNaN(betCount) || betCount <= 0 || isNaN(resultBetting)) {
          await showAppAlert('Digite valor apostado, n° de apostas e R.B. válidos.');
          return;
        }
        entry.wagered = wagered;
        entry.betCount = betCount;
        entry.resultBetting = resultBetting;
        savePlatform(state.currentUid, platform);
        editingBetEntry = null;
        renderBetHistoryList();
        // Muda o Saldo (via R.B.) — se o modo ativo for Maior/Menor
        // Saldo, a posição da linha pode mudar também.
        refreshRow(platform.id);
        renderFinanceList();
      });
      item.appendChild(saveBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'history-cancel-btn';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.addEventListener('click', () => {
        editingBetEntry = null;
        renderBetHistoryList();
      });
      item.appendChild(cancelBtn);
    } else {
      const itemContent = document.createElement('div');
      itemContent.className = 'history-item-content';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = formatBetEntryDateTime(entry.date);
      itemContent.appendChild(dateSpan);

      const valueSpan = document.createElement('span');
      valueSpan.className = 'history-value';
      valueSpan.textContent = `Apostado ${formatCurrency(entry.wagered)} · ${entry.betCount} aposta(s) · R.B. ${formatCurrency(entry.resultBetting)}`;
      itemContent.appendChild(valueSpan);

      item.appendChild(itemContent);

      const editBtn = document.createElement('button');
      editBtn.className = 'history-edit-btn';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        editingBetEntry = entry;
        renderBetHistoryList();
      });
      item.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-delete-btn';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showAppConfirm(`Excluir esta aposta (${formatCurrency(entry.wagered)}, R.B. ${formatCurrency(entry.resultBetting)})?`);
        if (!ok) return;
        const idx = platform.betEntries.indexOf(entry);
        if (idx !== -1) platform.betEntries.splice(idx, 1);
        savePlatform(state.currentUid, platform);
        renderBetHistoryList();
        refreshRow(platform.id);
        renderFinanceList();
      });
      item.appendChild(deleteBtn);
    }

    betHistoryList.appendChild(item);
  });
}

// Resolve o modal "Últimas apostas" e liga seus listeners fixos —
// chamada UMA VEZ por mount() da view, DEPOIS que a view já criou e
// anexou o modal ao document.body (mesmo padrão "Opção A" já usado
// pelos modais de Edição).
export function initBetHistoryModalListeners() {
  betHistoryModal = document.getElementById('betHistoryModal');
  betHistoryTitle = document.getElementById('betHistoryTitle');
  betHistoryList = document.getElementById('betHistoryList');
  betHistoryCloseBtn = document.getElementById('betHistoryCloseBtn');

  if (betHistoryCloseBtn) {
    betHistoryCloseBtn.addEventListener('click', closeBetHistoryModal);
  }
  if (betHistoryModal) {
    betHistoryModal.addEventListener('click', (e) => {
      if (e.target === betHistoryModal) closeBetHistoryModal();
    });
  }
}

// ---------- CONTROLE DO TOPO (busca + ordenar) ----------

// Resolve as referências de DOM (K12) + liga busca e o menu "Ordenar".
// Chamada UMA VEZ pelo mount() da view, depois que o HTML do painel já
// foi escrito no container. Retorna o cleanup de initSortMenu() (K1) —
// quem chama DEVE guardar e executar essa função no próprio unmount().
export function initFinanceControls() {
  financeListEl = document.getElementById('financeList');
  financeSearchEl = document.getElementById('financeSearch');
  const financeReorderBtn = document.getElementById('financeReorderBtn');
  const financeBadgeVisibilityBtn = document.getElementById('financeBadgeVisibilityBtn');
  const financeBadgeVisibilityDropdown = document.getElementById('financeBadgeVisibilityDropdown');
  const badgeVisibilityBalanceCheckbox = document.getElementById('financeBadgeVisibilityBalance');
  const badgeVisibilityRolloverCheckbox = document.getElementById('financeBadgeVisibilityRollover');

  if (financeSearchEl) {
    let searchFrame = null;
    financeSearchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      if (searchFrame) cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        searchFrame = null;
        renderFinanceList();
      });
    });
  }

  // Item 22/25b — mesmo "Bug 1" já corrigido na Edição: os 3 controles
  // (⚙️/👁/⇅) não podem ficar abertos ao mesmo tempo, nem o modo
  // Reordenar ativo enquanto um dropdown também está aberto.
  function closeSortDropdownUI() {
    const dd = document.getElementById('financeSortDropdown');
    const btn = document.getElementById('financeSortBtn');
    if (dd) dd.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function closeBadgeDropdownUI() {
    if (financeBadgeVisibilityDropdown) financeBadgeVisibilityDropdown.classList.remove('open');
    if (financeBadgeVisibilityBtn) financeBadgeVisibilityBtn.setAttribute('aria-expanded', 'false');
  }
  function deactivateReorderModeUI() {
    if (!reorderModeActive) return;
    reorderModeActive = false;
    if (financeReorderBtn) {
      financeReorderBtn.classList.remove('active');
      financeReorderBtn.textContent = '⚙️ Reordenar';
    }
    refreshAllRows();
  }

  if (financeReorderBtn) {
    financeReorderBtn.disabled = currentMode !== null;
    financeReorderBtn.addEventListener('click', () => {
      const turningOn = !reorderModeActive;
      if (turningOn) {
        closeSortDropdownUI();
        closeBadgeDropdownUI();
      }
      reorderModeActive = !reorderModeActive;
      financeReorderBtn.classList.toggle('active', reorderModeActive);
      financeReorderBtn.textContent = reorderModeActive ? '✓ Concluir reordenação' : '⚙️ Reordenar';
      refreshAllRows();
    });
  }

  let closeBadgeDropdown = () => {};
  if (financeBadgeVisibilityBtn && financeBadgeVisibilityDropdown) {
    const visibility = getCachedPreferences().badgeVisibility;
    if (badgeVisibilityBalanceCheckbox) badgeVisibilityBalanceCheckbox.checked = visibility.financeBalanceBadge;
    if (badgeVisibilityRolloverCheckbox) badgeVisibilityRolloverCheckbox.checked = visibility.financeRolloverBadge;

    function toggleDropdown() {
      const willOpen = !financeBadgeVisibilityDropdown.classList.contains('open');
      if (willOpen) {
        closeSortDropdownUI();
        deactivateReorderModeUI();
      }
      financeBadgeVisibilityDropdown.classList.toggle('open');
      financeBadgeVisibilityBtn.setAttribute(
        'aria-expanded',
        financeBadgeVisibilityDropdown.classList.contains('open') ? 'true' : 'false'
      );
    }
    function onDocumentClick(e) {
      if (!financeBadgeVisibilityDropdown.contains(e.target) && e.target !== financeBadgeVisibilityBtn) {
        financeBadgeVisibilityDropdown.classList.remove('open');
        financeBadgeVisibilityBtn.setAttribute('aria-expanded', 'false');
      }
    }
    function onVisibilityChange() {
      saveBadgeVisibility(state.currentUid, {
        financeBalanceBadge: badgeVisibilityBalanceCheckbox ? badgeVisibilityBalanceCheckbox.checked : true,
        financeRolloverBadge: badgeVisibilityRolloverCheckbox ? badgeVisibilityRolloverCheckbox.checked : true
      });
      refreshAllRows();
    }

    financeBadgeVisibilityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
    document.addEventListener('click', onDocumentClick);
    if (badgeVisibilityBalanceCheckbox) badgeVisibilityBalanceCheckbox.addEventListener('change', onVisibilityChange);
    if (badgeVisibilityRolloverCheckbox) badgeVisibilityRolloverCheckbox.addEventListener('change', onVisibilityChange);

    closeBadgeDropdown = () => document.removeEventListener('click', onDocumentClick);
  }

  const financeSortBtnEl = document.getElementById('financeSortBtn');
  if (financeSortBtnEl) {
    financeSortBtnEl.addEventListener('click', () => {
      closeBadgeDropdownUI();
      deactivateReorderModeUI();
    });
  }

  const sortMenuCleanup = initSortMenu({
    buttonId: 'financeSortBtn',
    dropdownId: 'financeSortDropdown',
    options: FINANCE_SORT_MENU_OPTIONS,
    onChange: (mode) => {
      currentMode = mode;
      if (mode !== null) {
        reorderModeActive = false;
        if (financeReorderBtn) {
          financeReorderBtn.disabled = true;
          financeReorderBtn.classList.remove('active');
          financeReorderBtn.textContent = '⚙️ Reordenar';
        }
      } else if (financeReorderBtn) {
        financeReorderBtn.disabled = false;
      }
      renderFinanceList();
    }
  });

  return function combinedCleanup() {
    sortMenuCleanup();
    closeBadgeDropdown();
  };
}
