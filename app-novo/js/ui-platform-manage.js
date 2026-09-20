// === PÁGINA 4 (EDIÇÃO) — lista fundida + modais ===
// Cada linha do acordeão junta o que antes eram DUAS listas separadas: a
// operacional (depósito, histórico, fim, reinício, apostas) e a de
// cadastro (nome, nível, grupo). Abrir uma plataforma mostra tudo dela
// num só lugar. Os modais de Histórico/Reinício/Apostas continuam sendo
// popups de verdade — só o "Gerenciar Plataformas" deixou de ser modal,
// porque agora ELE é a página inteira.
//
// Esta página não tem calendário nem painel VIP, então, diferente do
// antigo ui-platform-panel.js, aqui NÃO chamamos updateCalendarEvents()
// nem renderVipPanel() — cada página só atualiza o que é dela. Ao navegar
// para outra página, os dados são recarregados do Firestore do zero.
//
// === MIGRAÇÃO PARA SPA (Etapa 5, sub-entrega 1) — cuidado central ===
// No Sistema 1, `manageListEl`, `platformSearchEl` e os 3 modais
// (`historyModal`, `resetModal`, `betModal`) eram capturados como
// `const` no TOPO do arquivo, resolvidos uma única vez quando o
// navegador carregava edicao.html do zero. Num módulo ES importado uma
// única vez pela vida inteira da SPA, isso quebraria: essas constantes
// seriam resolvidas ANTES do router injetar o HTML da view no
// `#appShell`, e ficariam `null` para sempre.
//
// Solução: as referências de DOM viram variáveis de módulo (`let`),
// atribuídas dentro de funções chamadas pelo mount() da view
// (view-edicao.js), NUNCA no escopo de carga do arquivo:
//   - initManageControls(): resolve `manageListEl`/`platformSearchEl`
//     (painel principal, já presentes no HTML que a view escreve no
//     container) e liga busca + "Ordenar" + linha de adicionar.
//   - initModalListeners(): resolve os 3 modais e seus filhos — só pode
//     ser chamada DEPOIS que a view cria e anexa os 3 modais ao
//     document.body (eles não vivem no HTML estático de nenhuma página
//     global, são criados dinamicamente por view-edicao.js, mesmo
//     espírito do footer/legenda do Calendário — Opção A).
//
// Os listeners fixos dos modais (fechar, cancelar, confirmar reinício,
// etc.), que no Sistema 1 viviam soltos no escopo do módulo e eram
// registrados uma única vez, agora entram dentro de initModalListeners()
// — chamada uma vez por mount(). Como os 3 modais são recriados do zero a
// cada mount() (e removidos do body no unmount()), não há risco de
// listener duplicado entre visitas à rota.
//
// resetManageListCache() foi simplificada para a SPA: como o container
// inteiro é substituído pelo router a cada troca de rota, o
// #platformManageList antigo já não existe mais no DOM quando esta
// função roda — não há nó nenhum pra limpar manualmente. A função agora
// só zera o estado em memória (cache de linhas `rowElements`,
// `openRowId`, `expandedDataId`), que é o que realmente precisa ser
// resetado entre sessões/visitas.
//
// "APOSTEI HOJE": a contagem de dias de aposta (usada pro bônus VIP
// diário) usa getMonthStart (não getCycleStart) — conta sempre a partir
// do dia 1 do mês, independente de Reinício. Reinício mexe só no ciclo de
// nível/depósito (lastResetDate); misturar os dois fazia "Apostei hoje"
// da própria data do Reinício sumir por causa de um bug de fuso (string
// só-de-data comparada com limite de ciclo local) — ver changelog do
// Sistema 1.
//
// "DEPÓSITO: X DIAS": badge no cabeçalho que mostra há quantos dias foi
// feito o último depósito (dia do depósito = Dia 1), baseado em
// depositLog (histórico PERMANENTE — não reseta com Fim/Reinício, ao
// contrário do badge "Dia X" que usa lastResetDate). Só aparece quando a
// contagem está entre 7 e 12 dias — funciona como um aviso de janela
// pra reforçar depósito, não como um contador permanente na tela (ver
// getDaysSinceLastDeposit em cycle-logic.js).
//
// SAVE: cada ação aqui mexe em UMA plataforma, então usa savePlatform
// (grava só o doc dela, não reescreve as outras 32) — ver nota em
// platforms-store.js sobre por que isso importa (evita que uma aba com
// dados desatualizados em memória apague alterações feitas em outra aba).
//
// === RECONCILIAÇÃO DE DOM (correção de scroll/busca em mobile, herdada
//      do Sistema 1 sem alteração) ===
// Um Map (rowElements) guarda o elemento <div> de cada linha já presente
// na tela, indexado por platform.id. Duas funções substituem o "sempre
// reconstruir tudo":
//   - refreshRow(id): reconstrói e troca SÓ a linha daquela plataforma no
//     lugar dela (replaceWith) — as outras ~40 linhas nunca são tocadas.
//   - reconcileList(list): usada por renderManageList() quando o CONJUNTO
//     ou a ORDEM de linhas pode mudar (busca, trocar Ordenar, Fim/
//     Reinício/Salvar Dados, Nova plataforma, Remover). Remove só quem
//     saiu do filtro, cria só quem é novo, reordena quem já existe com
//     appendChild (que MOVE um nó já presente no DOM em vez de recriar —
//     preserva foco e nunca deixa o container vazio).
//
// Ações que mudam dado usado por filtro/ordenação (name, group,
// lastResetDate, cycleEnded) chamam refreshRow (pra atualizar a própria
// linha na hora) SEGUIDO de renderManageList() (pra corrigir posição/
// visibilidade se algum filtro estiver ativo).
//
// === PONTO 1 — Ordenar (filtra + ordena), herdado sem alteração ===
// getVisibleList() usa filterAndSortForManage() (platform-sort.js) — cada
// modo decide quem aparece E em que ordem ao mesmo tempo.
//
// === PONTO 8 — Minimizar "Dados", herdado sem alteração ===
// A seção "Dados" (nome/nível/tipo) começa recolhida ao abrir uma
// plataforma — só "Ações" fica sempre visível. expandedDataId guarda qual
// plataforma tem "Dados" expandida (reseta junto com openRowId sempre que
// a linha inteira é aberta/fechada).

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import { getMonthStart, getCurrentCycleDay, getTotalDepositsSinceCycle, getDaysSinceLastDeposit, colorForLevel } from './cycle-logic.js';
import { savePlatform, deletePlatformDoc } from './platforms-store.js';
import { filterAndSortForManage } from './platform-sort.js';
import { initSortMenu } from './ui-sort.js';
import { getCachedPreferences, saveManualOrder, saveBadgeVisibility } from './user-preferences-store.js';

// --- Referências de DOM do painel principal (busca + lista) ---
// Resolvidas por initManageControls(), chamada pelo mount() da view
// DEPOIS que o HTML do painel já foi escrito no container.
let manageListEl = null;
let platformSearchEl = null;
let manageReorderBtn = null;
let manageBadgeVisibilityBtn = null;
let manageBadgeVisibilityDropdown = null;
let badgeVisibilityTotalCheckbox = null;
let badgeVisibilityCycleDayCheckbox = null;

// --- Referências de DOM dos 3 modais ---
// Resolvidas por initModalListeners(), chamada pelo mount() da view
// DEPOIS que os 3 modais já foram criados e anexados ao document.body.
let historyModal = null;
let historyTitle = null;
let historyList = null;
let historyCloseBtn = null;

let resetModal = null;
let resetModalText = null;
let resetDateInput = null;
let resetConfirmBtn = null;
let resetCancelBtn = null;

let betModal = null;
let betModalTitle = null;
let betModalClose = null;
let betDateInput = null;
let betAddConfirm = null;
let betList = null;

let currentSearch = '';
let currentMode = null; // um dos SORT_MENU_OPTIONS.value, ou null (Padrão)
let openRowId = null;
// Ponto 8: id da plataforma cuja seção "Dados" está expandida (só uma por
// vez, já que só uma linha fica aberta). Sempre recolhida por padrão —
// reseta junto com openRowId sempre que uma linha é aberta/fechada.
let expandedDataId = null;

// Item 22: true enquanto o botão ⚙️ "Reordenar" está ativo — só tem
// efeito quando currentMode === null (Padrão), já que nos outros modos a
// ordem é ditada pelo critério escolhido (A-Z, Ativas, etc.), não faz
// sentido arrastar/mover manualmente. Cada linha ganha duas setas ▲▼
// nesse modo (ver buildRow) em vez de arrastar — HTML5 drag-and-drop não
// funciona de forma confiável em navegadores mobile por toque, e o app é
// usado 100% pelo celular.
let reorderModeActive = false;

// Lista visível da última renderização (após busca/filtro/ordenação) —
// usada pelas setas ▲▼ pra saber qual é o "vizinho" visível de uma
// plataforma (ver moveManualOrder). Sempre atualizada por
// renderManageList(), nunca por refreshRow() sozinho (que não muda
// conjunto/ordem).
let lastVisibleList = [];

// Depósito atualmente em edição dentro do modal de histórico — guardamos
// pela `date` (chave natural, já que não existe um id próprio por
// depósito). null quando nenhum item está em edição.
let editingDepositDate = null;

// Plataforma atualmente associada ao modal de Reinício/Apostas aberto.
let currentResetPlatform = null;
let currentBetPlatform = null;

// id da plataforma -> elemento <div class="platform-manage-row..."> já
// presente no DOM. Fonte de verdade de "o que está renderizado agora".
const rowElements = new Map();

// ---------- LISTA PRINCIPAL (fundida) ----------

// Item 22: aplica a ordem manual salva (users/{uid}/meta/preferences,
// via user-preferences-store.js) só quando "Padrão" está selecionado.
// Plataformas ausentes de manualOrder (novas, criadas depois da ordem já
// existir) vão pro FIM, preservando a ordem relativa entre elas — nunca
// aparecem embaralhadas entre as já ordenadas manualmente. Sort estável
// (garantido pelos motores JS modernos): quem empata em "ausente" mantém
// a ordem anterior da lista.
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

function getVisibleList() {
  const q = currentSearch.trim().toLowerCase();
  let list = state.platforms.filter(p => p.name.toLowerCase().includes(q));

  // Ponto 1: cada modo filtra E ordena ao mesmo tempo (ex: "A - Z" só
  // mostra quem começa com letra, já em ordem; "Ativas"/"Inativas"
  // consideram cycleEnded, não só lastResetDate). Ver
  // filterAndSortForManage em platform-sort.js pra tabela completa.
  // Item 22: "Padrão" (currentMode null) usa a ordem manual salva em vez
  // da ordem arbitrária de chegada do Firestore.
  if (currentMode) {
    list = filterAndSortForManage(list, currentMode);
  } else {
    list = applyManualOrder(list);
  }
  return list;
}

// Item 22 — todas as ~40 plataformas, na ordem manual efetiva (salva +
// as que ainda não entraram nela, anexadas no fim). Base usada por
// moveManualOrder pra sempre gravar a lista COMPLETA — nunca só o
// subconjunto filtrado pela busca, senão salvar a ordem com uma busca
// ativa perderia a posição de quem estava escondido no momento.
function getEffectiveOrderIds() {
  const order = getCachedPreferences().manualOrder || [];
  const allIds = new Set(state.platforms.map(p => p.id));
  const known = order.filter(id => allIds.has(id));
  const missing = state.platforms.map(p => p.id).filter(id => !known.includes(id));
  return [...known, ...missing];
}

// Troca a posição de `platformId` com seu vizinho VISÍVEL (direction -1 =
// sobe, +1 = desce), dentro da lista efetiva completa — não só dentro do
// subconjunto filtrado pela busca. Resolve o caso em que a busca deixa
// "buracos": trocar com o vizinho que aparece na tela, não com o
// próximo id fisicamente adjacente no array salvo (que pode estar
// escondido pela busca e dar a impressão de que o clique não fez nada).
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
  renderManageList();
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
  const existingEmpty = manageListEl.querySelector('.platform-manage-row-existing.history-empty');
  if (existingEmpty) existingEmpty.remove();

  if (list.length === 0) {
    rowElements.forEach(el => el.remove());
    rowElements.clear();
    const empty = document.createElement('div');
    empty.className = 'history-empty platform-manage-row-existing';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    manageListEl.appendChild(empty);
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
    manageListEl.appendChild(el);
  });
}

// Atualiza o CONTEÚDO de todas as linhas atualmente na tela, sem mudar
// quais estão visíveis nem a ordem — usado só na virada do dia (o badge
// "Dia X" muda sozinho mesmo sem nenhuma ação do usuário; ver
// scheduleDailyUpdate em view-edicao.js).
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
// da view (ver view-edicao.js), antes de initManageControls()/
// renderManageList(). Como o router já substitui o container inteiro a
// cada troca de rota, o #platformManageList da visita anterior não
// existe mais no DOM quando esta função roda — não há nó nenhum pra
// limpar manualmente aqui (diferente do Sistema 1, onde a mesma página
// nunca era descartada dentro de uma sessão). Só o cache em memória
// (rowElements, openRowId, expandedDataId) precisa ser zerado, senão um
// retorno a esta rota reaproveitaria estado de uma visita anterior.
export function resetManageListCache() {
  rowElements.clear();
  openRowId = null;
  expandedDataId = null;
  reorderModeActive = false;
  lastVisibleList = [];
}

export function renderManageList() {
  if (!manageListEl) return;
  const list = getVisibleList();
  lastVisibleList = list;
  reconcileList(list);
}

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'platform-manage-row platform-manage-row-existing' + (p.id === openRowId ? ' open' : '');
  row.dataset.id = p.id;

  // --- header (fechado): nome + badges + chevron ---
  const header = document.createElement('div');
  header.className = 'platform-manage-row-header';

  const title = document.createElement('div');
  title.className = 'platform-manage-row-title';
  title.textContent = p.name;
  if (!p.group) {
    const badge = document.createElement('span');
    badge.className = 'vip-unset-badge';
    badge.textContent = '⚠️ não configurado';
    title.appendChild(badge);
  }

  const badges = document.createElement('div');
  badges.className = 'platform-manage-row-badges';

  // Item 25a: visibilidade de cada badge agora é uma preferência salva
  // (users/{uid}/meta/preferences), não mais fixa — default (true/true)
  // reproduz o comportamento de sempre pra quem nunca mexeu no botão 👁.
  const badgeVisibility = getCachedPreferences().badgeVisibility;

  const cycleBadge = document.createElement('span');
  const cycleDay = getCurrentCycleDay(p);
  if (p.cycleEnded) {
    cycleBadge.className = 'cycle-day cycle-ended';
    cycleBadge.textContent = '⏸ Encerrado';
  } else if (cycleDay === 0) {
    cycleBadge.className = 'cycle-day no-bonus';
    cycleBadge.textContent = 'Dia 0';
  } else {
    cycleBadge.className = 'cycle-day';
    cycleBadge.textContent = `Dia ${cycleDay}`;
  }

  const total = getTotalDepositsSinceCycle(p);
  const totalBadge = document.createElement('span');
  totalBadge.className = 'platform-total-badge';
  totalBadge.style.background = colorForLevel(total);
  totalBadge.textContent = formatCurrency(total);

  // Item 25a: badge "Dia X"/ciclo pode ser escondido via preferência.
  if (badgeVisibility.cycleDayBadge) {
    badges.appendChild(cycleBadge);
  }
  // Item 27: o badge de Total some quando o ciclo está encerrado — não
  // faz sentido mostrar um valor acumulado de um ciclo já parado. Item
  // 25a: também pode ser escondido via preferência, independente do
  // badge de Depósito (abaixo), que NUNCA é escondido junto — mede outra
  // coisa (tempo desde o último depósito em depositLog, que nunca é
  // zerado por Fim/Reinício).
  if (!p.cycleEnded && badgeVisibility.totalBadge) {
    badges.appendChild(totalBadge);
  }

  // Badge "Depósito: X dias" — baseado em depositLog (permanente, não
  // reseta com Fim/Reinício). Item 10d: a partir de 7 dias o badge fica
  // visível PARA SEMPRE (sem teto superior) — o aviso existe justamente
  // pra sinalizar que faz tempo que não há depósito, então esconder
  // depois de um certo dia faria o aviso sumir quando a situação piora.
  // Quando a plataforma nunca recebeu depósito (daysSinceDeposit null),
  // o badge continua omitido de propósito. Este badge NÃO tem preferência
  // de visibilidade (Item 25a é só sobre Total e Dia do ciclo).
  const daysSinceDeposit = getDaysSinceLastDeposit(p);
  if (daysSinceDeposit !== null && daysSinceDeposit >= 7) {
    const depositDayBadge = document.createElement('span');
    depositDayBadge.className = 'cycle-day deposit-day-badge';
    depositDayBadge.textContent = `Depósito: ${daysSinceDeposit} dias`;
    depositDayBadge.title = `${daysSinceDeposit} dias desde o último depósito registrado (aviso ativo a partir do 7º dia)`;
    badges.appendChild(depositDayBadge);
  }

  // Item 22 — setas ▲▼: só existem quando o modo "Reordenar" (botão ⚙️)
  // está ativo E "Padrão" está selecionado (currentMode null) — nos
  // outros modos a ordem é ditada pelo critério escolhido, mover
  // manualmente não faria sentido. e.stopPropagation() é obrigatório:
  // sem ele, o clique nas setas também dispararia o listener de
  // abrir/fechar a linha (registrado no header inteiro, mais abaixo).
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
    // Ponto 8: "Dados" sempre recolhida de novo ao abrir/fechar a linha —
    // estado inicial igual pra todas as plataformas, sem lembrar escolha
    // anterior.
    expandedDataId = null;
    if (!wasOpen && previousOpenRowId) {
      refreshRow(previousOpenRowId); // fecha a linha que estava aberta antes
    }
    refreshRow(p.id); // aplica o novo estado (aberta ou fechada) nesta linha
  });

  // --- body (aberto): Ações + Dados ---
  const body = document.createElement('div');
  body.className = 'platform-manage-row-body';

  body.appendChild(buildActionsSection(p));

  const divider = document.createElement('hr');
  divider.className = 'manage-section-divider';
  body.appendChild(divider);

  body.appendChild(buildDataSection(p));

  row.appendChild(header);
  row.appendChild(body);
  return row;
}

// ---------- SEÇÃO "AÇÕES" (depósito, histórico, fim, reinício, apostas) ----------

function buildActionsSection(p) {
  const section = document.createElement('div');
  section.className = 'manage-actions-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Ações';
  section.appendChild(label);

  const resetInfo = document.createElement('div');
  resetInfo.className = 'reset-date';
  if (p.lastResetDate) {
    const resetDateObj = new Date(p.lastResetDate);
    const dia = String(resetDateObj.getDate()).padStart(2, '0');
    const mes = String(resetDateObj.getMonth() + 1).padStart(2, '0');
    resetInfo.textContent = `Ciclo iniciado: ${dia}/${mes}`;
  } else {
    resetInfo.textContent = 'Ciclo não iniciado';
  }
  section.appendChild(resetInfo);

  let input = null;
  if (!p.cycleEnded) {
    const form = document.createElement('div');
    form.className = 'platform-deposit-form';

    input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Valor do depósito';
    input.min = '0';
    input.step = '0.01';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Adicionar';
    addBtn.className = 'bet-manage-btn';
    addBtn.addEventListener('click', async () => {
      const value = parseFloat(input.value);
      if (isNaN(value) || value <= 0) {
        await showAppAlert('Digite um valor válido');
        return;
      }
      const entry = { date: new Date().toISOString(), value };
      p.deposits.push(entry);
      // depositLog é o histórico PERMANENTE usado pelo Financeiro (Página
      // 5) e também pelo badge "Depósito: X dias" — ao contrário de
      // p.deposits, Fim/Reinício (mais abaixo) NUNCA apagam este array.
      if (!p.depositLog) p.depositLog = [];
      p.depositLog.push({ ...entry });
      savePlatform(state.currentUid, p);
      // Só o conteúdo desta linha muda (total/badge) — depósito não afeta
      // nenhum filtro/ordenação ativo, então basta atualizar esta linha.
      refreshRow(p.id);
    });

    form.appendChild(input);
    form.appendChild(addBtn);
    section.appendChild(form);
  }

  const actionButtons = document.createElement('div');
  actionButtons.className = 'platform-actions-buttons';

  const historyBtn = document.createElement('button');
  historyBtn.textContent = 'Histórico';
  historyBtn.style.background = '#2563eb';
  historyBtn.addEventListener('click', () => showHistoryModal(p));

  const endBtn = document.createElement('button');
  endBtn.className = 'platform-end-btn' + (p.cycleEnded ? ' already-ended' : '');
  endBtn.textContent = p.cycleEnded ? '⏸ Encerrado' : '🏁 Fim';
  endBtn.disabled = p.cycleEnded;
  endBtn.addEventListener('click', async () => {
    const ok = await showAppConfirm(`Encerrar o ciclo de ${p.name}? Os depósitos serão zerados e o calendário ficará pausado até você apertar "Reinício".`);
    if (!ok) return;
    p.deposits = [];
    p.cycleEnded = true;
    savePlatform(state.currentUid, p);
    // cycleEnded pode afetar filtros de Ativas/Inativas — atualiza a
    // própria linha (badge "Encerrado") e reconcilia a lista visível.
    refreshRow(p.id);
    renderManageList();
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reinício';
  resetBtn.style.background = '#ef4444';
  resetBtn.addEventListener('click', () => showResetModal(p));

  actionButtons.appendChild(historyBtn);
  actionButtons.appendChild(endBtn);
  actionButtons.appendChild(resetBtn);
  section.appendChild(actionButtons);

  if (p.group === 'com') {
    section.appendChild(buildBetSection(p));
  }

  return section;
}

function buildBetSection(p) {
  const betSection = document.createElement('div');
  betSection.className = 'bet-section';

  const betRow = document.createElement('div');
  betRow.className = 'bet-row';

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // "Apostei hoje" conta sempre a partir do dia 1 do mês — independente de
  // Reinício/lastResetDate (ver getMonthStart em cycle-logic.js).
  const monthStart = getMonthStart(now);
  const betDaysInMonth = (p.betDays || []).filter(d => {
    // Força interpretação LOCAL: string só-de-data ("2026-08-16") seria
    // lida como meia-noite UTC — 3h antes da meia-noite local no Brasil.
    return new Date(`${d.slice(0, 10)}T00:00:00`) >= monthStart;
  });
  const alreadyBetToday = betDaysInMonth.some(d => d.slice(0, 10) === todayStr);

  const betTodayBtn = document.createElement('button');
  betTodayBtn.className = 'bet-today-btn' + (alreadyBetToday ? ' already-bet' : '');
  betTodayBtn.textContent = alreadyBetToday ? '✓ Apostei hoje' : '🎯 Apostei hoje';
  betTodayBtn.disabled = alreadyBetToday;
  betTodayBtn.addEventListener('click', () => {
    if (alreadyBetToday) return;
    if (!p.betDays) p.betDays = [];
    p.betDays.push(todayStr);
    savePlatform(state.currentUid, p);
    // Não afeta filtro/ordenação — só o conteúdo desta linha muda.
    refreshRow(p.id);
  });

  const betCount = document.createElement('span');
  betCount.className = 'bet-count-badge';
  betCount.textContent = `🎲 ${betDaysInMonth.length} dia(s)`;

  const betManageBtn = document.createElement('button');
  betManageBtn.className = 'bet-manage-btn';
  betManageBtn.textContent = 'Gerenciar';
  betManageBtn.addEventListener('click', () => showBetModal(p));

  betRow.appendChild(betTodayBtn);
  betRow.appendChild(betCount);
  betRow.appendChild(betManageBtn);
  betSection.appendChild(betRow);
  return betSection;
}

// ---------- BLOCO C — GERADOR DE CÓDIGOS (grupo de campos reutilizável) ----------
// Monta um grupo (Identificador, Depósito ou Aposta) dentro da seção
// "Dados". Não grava nada sozinho — devolve getValues(), chamado só
// quando o botão "Salvar" (já existente) é clicado, junto com nome/
// nível/grupo. Nenhuma dependência de codigo-logic-new.js aqui: este
// arquivo só monta o formulário — quem calcula/exibe o código é sempre
// codigo-logic.js + ui-codigo.js (Hub), intocados nesta sub-entrega.

// baseDate é gravado como string ISO com hora fixa em meia-noite local
// (mesmo padrão já usado pra lastResetDate em showResetModal) — evita o
// mesmo bug de fuso já documentado em getMonthStart/betDays se fosse
// comparado como string só-de-data.
function isoToDateInputValue(isoStr) {
  return isoStr ? String(isoStr).slice(0, 10) : '';
}

function dateInputValueToIso(value) {
  return value ? `${value}T00:00:00` : null;
}

function buildCodigoFieldGroup(title, config, opts = {}) {
  const cfg = config || {};
  const wrapper = document.createElement('div');

  const divider = document.createElement('hr');
  divider.className = 'manage-section-divider';
  wrapper.appendChild(divider);

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = title;
  wrapper.appendChild(label);

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'platform-form-fields';
  wrapper.appendChild(fieldsWrap);

  // Cada campo nasce dentro do próprio wrapper (label + input juntos),
  // pra permitir esconder o par inteiro de uma vez quando o Tipo mudar
  // — .platform-form-fields continua funcionando normalmente (flex
  // column), já que suas regras de CSS não usam combinador de filho
  // direto (aplicam a qualquer profundidade).
  function fieldPair(labelText, inputEl) {
    const pair = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    pair.appendChild(lbl);
    pair.appendChild(inputEl);
    fieldsWrap.appendChild(pair);
    return pair;
  }

  let tipoSelect = null;
  if (opts.includeTipo) {
    tipoSelect = document.createElement('select');
    [
      ['aleatoria', 'Aleatória'],
      ['fixa_sequencia', 'Fixa + Sequência'],
      ['fixa_data', 'Fixa + Mês/dia real']
    ].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = l;
      tipoSelect.appendChild(opt);
    });
    tipoSelect.value = cfg.tipo || 'aleatoria';
    fieldPair('Tipo', tipoSelect);
  }

  const fixoInput = document.createElement('input');
  fixoInput.type = 'text';
  fixoInput.maxLength = 12;
  fixoInput.placeholder = 'Ex: PROMO';
  fixoInput.value = cfg.fixo || '';
  const fixoPair = fieldPair('Fixo (texto)', fixoInput);

  const variavelInput = document.createElement('input');
  variavelInput.type = 'number';
  variavelInput.step = '1';
  variavelInput.value = (cfg.variavelInicio !== undefined && cfg.variavelInicio !== null) ? cfg.variavelInicio : 0;
  const variavelPair = fieldPair('Variável início', variavelInput);

  const baseDateInput = document.createElement('input');
  baseDateInput.type = 'date';
  baseDateInput.value = isoToDateInputValue(cfg.baseDate);
  const baseDatePair = fieldPair('Data base', baseDateInput);

  let valorMinimoInput = null;
  if (opts.includeValorMinimo) {
    valorMinimoInput = document.createElement('input');
    valorMinimoInput.type = 'number';
    valorMinimoInput.min = '0';
    valorMinimoInput.step = '0.01';
    valorMinimoInput.value = Number(cfg.valorMinimo) || 0;
    fieldPair('Valor mínimo', valorMinimoInput);
  }

  // Condicional só no grupo Identificador (11b/11d): Aleatória esconde
  // Fixo/Variável/Data base; Fixa+Mês-dia real esconde só Variável/Data
  // base (mês/dia são calculados sozinhos); Fixa+Sequência mostra tudo.
  if (tipoSelect) {
    function applyTipoVisibility() {
      const tipo = tipoSelect.value;
      fixoPair.classList.toggle('app-hidden', tipo === 'aleatoria');
      const showSequenceFields = tipo === 'fixa_sequencia';
      variavelPair.classList.toggle('app-hidden', !showSequenceFields);
      baseDatePair.classList.toggle('app-hidden', !showSequenceFields);
    }
    tipoSelect.addEventListener('change', applyTipoVisibility);
    applyTipoVisibility();
  }

  function getValues() {
    const result = {
      fixo: fixoInput.value.trim(),
      variavelInicio: Number(variavelInput.value) || 0,
      baseDate: dateInputValueToIso(baseDateInput.value)
    };
    if (tipoSelect) result.tipo = tipoSelect.value;
    if (valorMinimoInput) result.valorMinimo = Math.max(0, Number(valorMinimoInput.value) || 0);
    return result;
  }

  return { wrapper, getValues };
}

// ---------- SEÇÃO "DADOS" (nome, nível, grupo) ----------

function buildDataSection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  // Ponto 8: "Dados" (nome/nível/tipo) é editado raramente — só depois de
  // um processo longo de apostas até subir de nível — então fica
  // recolhida por padrão ao abrir a plataforma. Clicar no cabeçalho
  // expande/recolhe só esta seção, sem afetar "Ações" (sempre visível).
  const isDataExpanded = expandedDataId === p.id;

  const label = document.createElement('div');
  label.className = 'manage-section-label manage-section-label-collapsible';
  const labelText = document.createElement('span');
  labelText.textContent = 'Dados';
  const labelChevron = document.createElement('span');
  labelChevron.className = 'platform-manage-chevron' + (isDataExpanded ? ' open' : '');
  labelChevron.textContent = '▾';
  label.appendChild(labelText);
  label.appendChild(labelChevron);
  label.addEventListener('click', () => {
    expandedDataId = isDataExpanded ? null : p.id;
    refreshRow(p.id);
  });
  section.appendChild(label);

  // Recolhida: nada mais é montado — qualquer alteração não salva nos
  // campos abaixo (nome/nível/tipo) é descartada ao recolher, já que a
  // seção inteira é reconstruída do zero na próxima vez que for expandida.
  if (!isDataExpanded) {
    return section;
  }

  const fields = document.createElement('div');
  fields.className = 'platform-form-fields';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Código/Nome';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 12;
  nameInput.value = p.name;

  const levelLabel = document.createElement('label');
  levelLabel.textContent = 'Nível VIP';
  const levelSelect = document.createElement('select');
  [['', 'Não definido'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]
    .forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = l;
      levelSelect.appendChild(opt);
    });
  levelSelect.value = (p.level === null || p.level === undefined) ? '' : String(p.level);

  const groupLabel = document.createElement('label');
  groupLabel.textContent = 'Tipo';
  const groupSelect = document.createElement('select');
  [['', 'Não definido'], ['com', 'Com aposta'], ['sem', 'Sem aposta']]
    .forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = l;
      groupSelect.appendChild(opt);
    });
  groupSelect.value = p.group || '';

  fields.appendChild(nameLabel);
  fields.appendChild(nameInput);
  fields.appendChild(levelLabel);
  fields.appendChild(levelSelect);
  fields.appendChild(groupLabel);
  fields.appendChild(groupSelect);
  section.appendChild(fields);

  // === BLOCO C — Gerador de Códigos (Item 11f + 11h/11i) ===
  // 3 grupos dentro da mesma seção "Dados" (sem collapse próprio — já
  // está atrás do recolhimento do Ponto 8). Nenhum cálculo novo: só
  // grava os campos que codigo-logic-new.js (Etapa 3) já sabe ler.
  const codigoIdentificador = buildCodigoFieldGroup('Código Identificador', p.codigoConfig, { includeTipo: true });
  const codigoDeposito = buildCodigoFieldGroup('Código de Depósito', p.codigoDeposito, { includeValorMinimo: true });
  const codigoAposta = buildCodigoFieldGroup('Código de Aposta', p.codigoAposta, { includeValorMinimo: true });

  section.appendChild(codigoIdentificador.wrapper);
  section.appendChild(codigoDeposito.wrapper);
  section.appendChild(codigoAposta.wrapper);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-confirm';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim().toUpperCase();
    if (!name) {
      await showAppAlert('Digite um código para a plataforma.');
      return;
    }
    const duplicate = state.platforms.some(pp => pp !== p && pp.name.toUpperCase() === name);
    if (duplicate) {
      await showAppAlert('Já existe uma plataforma com esse código.');
      return;
    }
    p.name = name;
    p.level = levelSelect.value === '' ? null : Number(levelSelect.value);
    p.group = groupSelect.value === '' ? null : groupSelect.value;

    // Bloco C — os 3 grupos de código são lidos e gravados junto com
    // nome/nível/grupo, no mesmo clique em "Salvar" e no mesmo
    // savePlatform (nenhuma chamada nova ao Firestore).
    p.codigoConfig = codigoIdentificador.getValues();
    p.codigoDeposito = codigoDeposito.getValues();
    p.codigoAposta = codigoAposta.getValues();

    savePlatform(state.currentUid, p);
    openRowId = p.id;
    // Nome/grupo podem afetar busca e filtros Com/Sem — atualiza a
    // própria linha e reconcilia a lista visível.
    refreshRow(p.id);
    renderManageList();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-modal';
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remover';
  removeBtn.addEventListener('click', async () => {
    const ok = await showAppConfirm(
      `Remover "${p.name}"? Isso apaga também todo o histórico de depósitos e ` +
      `apostas dela. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    state.platforms = state.platforms.filter(pp => pp.id !== p.id);
    deletePlatformDoc(state.currentUid, p.id);
    openRowId = null;
    renderManageList();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(removeBtn);
  section.appendChild(actions);

  return section;
}

// ---------- LINHA FIXA: ADICIONAR NOVA PLATAFORMA ----------

function initAddRow() {
  const addRow = document.getElementById('platformManageAddRow');
  if (!addRow) return;
  addRow.querySelector('.platform-manage-row-header')
    .addEventListener('click', () => addRow.classList.toggle('open'));

  document.getElementById('platformManageAddSaveBtn').addEventListener('click', async () => {
    const nameInput = document.getElementById('platformManageAddName');
    const levelSelect = document.getElementById('platformManageAddLevel');
    const groupSelect = document.getElementById('platformManageAddGroup');

    const name = nameInput.value.trim().toUpperCase();
    if (!name) {
      await showAppAlert('Digite um código para a plataforma.');
      return;
    }
    const duplicate = state.platforms.some(p => p.name.toUpperCase() === name);
    if (duplicate) {
      await showAppAlert('Já existe uma plataforma com esse código.');
      return;
    }

    const newPlatform = {
      id: 'p' + Date.now(),
      name,
      lastResetDate: null,
      deposits: [],
      betDays: [],
      cycleEnded: false,
      level: levelSelect.value === '' ? null : Number(levelSelect.value),
      group: groupSelect.value === '' ? null : groupSelect.value,
      withdrawals: [],
      betEntries: [],
      financeWeeks: [],
      depositLog: [],
      balancePhases: [],
      obrigadoDays: [],
      misteriosoBonusLog: [],
      codigoConfig: { tipo: null, fixo: '', baseDate: null, variavelInicio: 0 },
      codigoDeposito: { fixo: '', baseDate: null, variavelInicio: 0, valorMinimo: 0 },
      codigoAposta: { fixo: '', baseDate: null, variavelInicio: 0, valorMinimo: 0 }
    };
    state.platforms.push(newPlatform);

    savePlatform(state.currentUid, newPlatform);
    nameInput.value = '';
    levelSelect.value = '';
    groupSelect.value = '';
    addRow.classList.remove('open');

    // Plataforma nova: não existe linha pra reaproveitar, reconcileList
    // cria do zero na posição correta.
    renderManageList();
  });
}

// ---------- MODAL: HISTÓRICO ----------

function showHistoryModal(platform) {
  historyTitle.textContent = `Histórico de Depósitos - ${platform.name}`;
  historyList.innerHTML = '';

  if (platform.deposits.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Nenhum depósito registrado</div>';
  } else {
    const sortedDeposits = [...platform.deposits].sort((a, b) => new Date(b.date) - new Date(a.date));
    sortedDeposits.forEach((dep) => {
      const depositDate = new Date(dep.date);
      const dia = String(depositDate.getDate()).padStart(2, '0');
      const mes = String(depositDate.getMonth() + 1).padStart(2, '0');
      const ano = depositDate.getFullYear();
      const horas = String(depositDate.getHours()).padStart(2, '0');
      const minutos = String(depositDate.getMinutes()).padStart(2, '0');

      const item = document.createElement('div');
      item.className = 'history-item';

      const itemContent = document.createElement('div');
      itemContent.className = 'history-item-content';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = `${dia}/${mes}/${ano} ${horas}:${minutos}`;
      itemContent.appendChild(dateSpan);

      const isEditingThis = editingDepositDate === dep.date;

      if (isEditingThis) {
        // Modo edição: só o VALOR é editável — data/hora nunca mudam, pra
        // não confundir quem não está acostumado com planilha.
        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.min = '0';
        valueInput.step = '0.01';
        valueInput.value = dep.value;
        valueInput.className = 'history-value-input';
        itemContent.appendChild(valueInput);
        item.appendChild(itemContent);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'history-edit-btn';
        saveBtn.textContent = 'Salvar';
        saveBtn.addEventListener('click', async () => {
          const newValue = parseFloat(valueInput.value);
          if (isNaN(newValue) || newValue <= 0) {
            await showAppAlert('Digite um valor válido');
            return;
          }
          dep.value = newValue;
          // Sincroniza com depositLog (histórico permanente que o
          // Financeiro usa) pela mesma data — é assim que financeiro.html
          // reconhece a correção na semana/fase atual (e no Saldo).
          const logEntry = (platform.depositLog || []).find(d => d.date === dep.date);
          if (logEntry) logEntry.value = newValue;
          savePlatform(state.currentUid, platform);
          editingDepositDate = null;
          openRowId = platform.id;
          // Não afeta filtro/ordenação — só o conteúdo da linha muda.
          refreshRow(platform.id);
          showHistoryModal(platform);
        });
        item.appendChild(saveBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'history-cancel-btn';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.addEventListener('click', () => {
          editingDepositDate = null;
          showHistoryModal(platform);
        });
        item.appendChild(cancelBtn);
      } else {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'history-value';
        valueSpan.textContent = formatCurrency(dep.value);
        itemContent.appendChild(valueSpan);
        item.appendChild(itemContent);

        const editBtn = document.createElement('button');
        editBtn.className = 'history-edit-btn';
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => {
          editingDepositDate = dep.date;
          showHistoryModal(platform);
        });
        item.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-delete-btn';
        deleteBtn.textContent = 'Excluir';
        deleteBtn.addEventListener('click', async () => {
          const ok = await showAppConfirm(`Deseja excluir este depósito de ${formatCurrency(dep.value)}?`);
          if (ok) {
            platform.deposits.splice(platform.deposits.indexOf(dep), 1);
            savePlatform(state.currentUid, platform);
            openRowId = platform.id;
            // Não afeta filtro/ordenação — só o conteúdo da linha muda.
            refreshRow(platform.id);
            showHistoryModal(platform);
          }
        });
        item.appendChild(deleteBtn);
      }

      historyList.appendChild(item);
    });
  }

  historyModal.style.display = 'flex';
}

// ---------- MODAL: REINÍCIO DE CICLO ----------

function showResetModal(platform) {
  currentResetPlatform = platform;
  resetModalText.textContent = `Reiniciar ciclo de ${platform.name}?`;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  resetDateInput.value = `${yyyy}-${mm}-${dd}`;

  resetModal.style.display = 'flex';
}

function closeResetModal() {
  resetModal.style.display = 'none';
  currentResetPlatform = null;
}

// ---------- MODAL: GERENCIAR APOSTAS ----------

function showBetModal(platform) {
  currentBetPlatform = platform;
  betModalTitle.textContent = `Apostas — ${platform.name}`;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  betDateInput.value = `${yyyy}-${mm}-${dd}`;

  renderBetList();
  betModal.style.display = 'flex';
}

function renderBetList() {
  betList.innerHTML = '';
  if (!currentBetPlatform) return;

  // Mesma regra de buildBetSection: mês atual (getMonthStart), não ciclo.
  const monthStart = getMonthStart(new Date());
  const days = (currentBetPlatform.betDays || [])
    .filter(d => new Date(`${d.slice(0, 10)}T00:00:00`) >= monthStart)
    .map(d => d.slice(0, 10))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => b.localeCompare(a));

  if (days.length === 0) {
    betList.innerHTML = '<div class="bet-empty">Nenhuma aposta registrada neste mês.</div>';
    return;
  }

  days.forEach(dateStr => {
    const [y, m, d] = dateStr.split('-');
    const item = document.createElement('div');
    item.className = 'bet-list-item';

    const label = document.createElement('span');
    label.textContent = `${d}/${m}/${y}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bet-list-remove';
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', () => {
      currentBetPlatform.betDays = (currentBetPlatform.betDays || [])
        .filter(dd => dd.slice(0, 10) !== dateStr);
      savePlatform(state.currentUid, currentBetPlatform);
      renderBetList();
      openRowId = currentBetPlatform.id;
      // Não afeta filtro/ordenação — só o conteúdo da linha muda.
      refreshRow(currentBetPlatform.id);
    });

    item.appendChild(label);
    item.appendChild(removeBtn);
    betList.appendChild(item);
  });
}

// ---------- INICIALIZAÇÃO DE DOM (chamadas pelo mount() da view) ----------

// Resolve as referências do painel principal (lista + busca), liga a
// linha fixa "+ Nova plataforma", a busca, o menu "Ordenar", o botão ⚙️
// "Reordenar" (Item 22) e o botão 👁 "Badges" (Item 25a). Chamada UMA
// VEZ por mount(), depois que o HTML do painel já foi escrito no
// container pela view. Retorna um cleanup COMBINADO (Ordenar + dropdown
// de badges) — quem chama (view-edicao.js) DEVE guardar e executar essa
// função no próprio unmount(), senão os listeners globais de
// document.click se acumulam a cada visita à rota.
export function initManageControls() {
  manageListEl = document.getElementById('platformManageList');
  platformSearchEl = document.getElementById('platformSearch');
  manageReorderBtn = document.getElementById('manageReorderBtn');
  manageBadgeVisibilityBtn = document.getElementById('manageBadgeVisibilityBtn');
  manageBadgeVisibilityDropdown = document.getElementById('manageBadgeVisibilityDropdown');
  badgeVisibilityTotalCheckbox = document.getElementById('badgeVisibilityTotal');
  badgeVisibilityCycleDayCheckbox = document.getElementById('badgeVisibilityCycleDay');

  initAddRow();

  if (platformSearchEl) {
    // A busca é adiada pro próximo frame (requestAnimationFrame) em vez de
    // rodar de forma síncrona dentro do evento 'input'. Isso dá tempo do
    // navegador/teclado virtual terminar de processar a tecla digitada
    // antes de qualquer atualização de DOM — evita a disputa com o ciclo
    // de composição do teclado (IME) que causava teclas "comidas" em
    // telas pequenas.
    let searchFrame = null;
    platformSearchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      if (searchFrame) cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        searchFrame = null;
        renderManageList();
      });
    });
  }

  // Item 22 — botão ⚙️ "Reordenar": só tem efeito com "Padrão"
  // selecionado (currentMode === null). Começa desabilitado se algum
  // outro modo já estiver ativo (não deveria acontecer logo no mount(),
  // já que currentMode sempre reseta pra null a cada visita à rota, mas
  // o guard fica aqui por segurança).
  if (manageReorderBtn) {
    manageReorderBtn.disabled = currentMode !== null;
    manageReorderBtn.addEventListener('click', () => {
      reorderModeActive = !reorderModeActive;
      manageReorderBtn.classList.toggle('active', reorderModeActive);
      manageReorderBtn.textContent = reorderModeActive ? '✓ Concluir reordenação' : '⚙️ Reordenar';
      // Muda o CONTEÚDO de todas as linhas (mostra/some as setas ▲▼) sem
      // mudar quais estão visíveis nem a ordem — mesmo uso de
      // refreshAllRows já feito na virada do dia.
      refreshAllRows();
    });
  }

  // Item 25a — botão 👁 "Badges": dropdown simples com 2 checkboxes,
  // reaproveitando o visual de .sort-menu-dropdown (sort-menu.css), mas
  // com lógica de abrir/fechar própria (não é uma lista de opções
  // exclusivas como o menu Ordenar, então não usa initSortMenu()).
  let closeBadgeDropdown = () => {};
  if (manageBadgeVisibilityBtn && manageBadgeVisibilityDropdown) {
    const visibility = getCachedPreferences().badgeVisibility;
    if (badgeVisibilityTotalCheckbox) badgeVisibilityTotalCheckbox.checked = visibility.totalBadge;
    if (badgeVisibilityCycleDayCheckbox) badgeVisibilityCycleDayCheckbox.checked = visibility.cycleDayBadge;

    function toggleDropdown() {
      manageBadgeVisibilityDropdown.classList.toggle('open');
      manageBadgeVisibilityBtn.setAttribute(
        'aria-expanded',
        manageBadgeVisibilityDropdown.classList.contains('open') ? 'true' : 'false'
      );
    }
    function onDocumentClick(e) {
      if (!manageBadgeVisibilityDropdown.contains(e.target) && e.target !== manageBadgeVisibilityBtn) {
        manageBadgeVisibilityDropdown.classList.remove('open');
        manageBadgeVisibilityBtn.setAttribute('aria-expanded', 'false');
      }
    }
    function onVisibilityChange() {
      const newVisibility = {
        totalBadge: badgeVisibilityTotalCheckbox ? badgeVisibilityTotalCheckbox.checked : true,
        cycleDayBadge: badgeVisibilityCycleDayCheckbox ? badgeVisibilityCycleDayCheckbox.checked : true
      };
      saveBadgeVisibility(state.currentUid, newVisibility);
      // Muda o CONTEÚDO de todas as linhas (badges aparecem/somem) sem
      // mudar quem está visível nem a ordem.
      refreshAllRows();
    }

    manageBadgeVisibilityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
    document.addEventListener('click', onDocumentClick);
    if (badgeVisibilityTotalCheckbox) badgeVisibilityTotalCheckbox.addEventListener('change', onVisibilityChange);
    if (badgeVisibilityCycleDayCheckbox) badgeVisibilityCycleDayCheckbox.addEventListener('change', onVisibilityChange);

    closeBadgeDropdown = () => document.removeEventListener('click', onDocumentClick);
  }

  const sortMenuCleanup = initSortMenu({
    buttonId: 'manageSortBtn',
    dropdownId: 'manageSortDropdown',
    // Página 4: cada modo filtra E ordena ao mesmo tempo (Ponto 1) — ver
    // getVisibleList / filterAndSortForManage em platform-sort.js.
    onChange: (mode) => {
      currentMode = mode;
      // Item 22: trocar pra qualquer modo diferente de "Padrão" desliga
      // o modo Reordenar automaticamente (não faz sentido continuar
      // mostrando setas ▲▼ numa ordem que não é mais a manual) e
      // desabilita o botão ⚙️ até "Padrão" ser selecionado de novo.
      if (mode !== null) {
        reorderModeActive = false;
        if (manageReorderBtn) {
          manageReorderBtn.disabled = true;
          manageReorderBtn.classList.remove('active');
          manageReorderBtn.textContent = '⚙️ Reordenar';
        }
      } else if (manageReorderBtn) {
        manageReorderBtn.disabled = false;
      }
      renderManageList();
    }
  });

  // Cleanup combinado: quem chama (view-edicao.js) só precisa guardar e
  // executar UMA função no unmount(), que desliga os dois listeners
  // globais (Ordenar + dropdown de Badges).
  return function combinedCleanup() {
    sortMenuCleanup();
    closeBadgeDropdown();
  };
}

// Resolve os 3 modais (Histórico/Reinício/Apostas) e liga seus listeners
// fixos. Chamada UMA VEZ por mount(), DEPOIS que a view já criou e anexou
// os 3 modais ao document.body — diferente do Sistema 1, onde esses
// elementos existiam no HTML estático de edicao.html e os listeners eram
// registrados uma única vez, na carga do script. Como os modais são
// recriados do zero a cada mount() (e removidos no unmount() da view),
// não há risco de listener duplicado entre visitas à rota.
export function initModalListeners() {
  historyModal = document.getElementById('historyModal');
  historyTitle = document.getElementById('historyTitle');
  historyList = document.getElementById('historyList');
  historyCloseBtn = document.getElementById('historyCloseBtn');

  historyCloseBtn.addEventListener('click', () => {
    editingDepositDate = null;
    historyModal.style.display = 'none';
  });
  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
      editingDepositDate = null;
      historyModal.style.display = 'none';
    }
  });

  resetModal = document.getElementById('resetModal');
  resetModalText = document.getElementById('resetModalText');
  resetDateInput = document.getElementById('resetDateInput');
  resetConfirmBtn = document.getElementById('resetConfirmBtn');
  resetCancelBtn = document.getElementById('resetCancelBtn');

  resetConfirmBtn.addEventListener('click', async () => {
    if (currentResetPlatform) {
      if (!resetDateInput.value) {
        await showAppAlert('Selecione uma data válida para reiniciar o ciclo.');
        return;
      }
      currentResetPlatform.lastResetDate = `${resetDateInput.value}T00:00:00`;
      currentResetPlatform.cycleEnded = false;
      // Reinício também zera os depósitos — garantia extra caso alguém
      // clique direto em "Reinício" sem passar por "Fim" antes. NÃO mexe
      // em betDays de propósito: "Apostei hoje" é contado por mês
      // (getMonthStart), não pelo ciclo.
      currentResetPlatform.deposits = [];
      openRowId = currentResetPlatform.id;
      savePlatform(state.currentUid, currentResetPlatform);
      // lastResetDate/cycleEnded podem afetar filtros de Ativas/Inativas e
      // ordenação por dias no ciclo — atualiza a linha e reconcilia a lista.
      refreshRow(currentResetPlatform.id);
      renderManageList();
    }
    closeResetModal();
  });

  resetCancelBtn.addEventListener('click', closeResetModal);
  resetModal.addEventListener('click', (e) => { if (e.target === resetModal) closeResetModal(); });

  betModal = document.getElementById('betModal');
  betModalTitle = document.getElementById('betModalTitle');
  betModalClose = document.getElementById('betModalClose');
  betDateInput = document.getElementById('betDateInput');
  betAddConfirm = document.getElementById('betAddConfirm');
  betList = document.getElementById('betList');

  betAddConfirm.addEventListener('click', async () => {
    if (!currentBetPlatform || !betDateInput.value) return;
    const dateStr = betDateInput.value;
    if (!currentBetPlatform.betDays) currentBetPlatform.betDays = [];

    const already = currentBetPlatform.betDays.some(d => d.slice(0, 10) === dateStr);
    if (already) {
      await showAppAlert('Este dia já está registrado.');
      return;
    }

    currentBetPlatform.betDays.push(dateStr);
    savePlatform(state.currentUid, currentBetPlatform);
    renderBetList();
    openRowId = currentBetPlatform.id;
    // Não afeta filtro/ordenação — só o conteúdo da linha muda.
    refreshRow(currentBetPlatform.id);
  });

  betModalClose.addEventListener('click', () => {
    betModal.style.display = 'none';
    currentBetPlatform = null;
  });
  betModal.addEventListener('click', e => {
    if (e.target === betModal) {
      betModal.style.display = 'none';
      currentBetPlatform = null;
    }
  });
}
