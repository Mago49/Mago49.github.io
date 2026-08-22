// === PÁGINA 5 (FINANCEIRO) — acordeão por plataforma + Painel Geral ===
// Cada linha mostra: a semana atual ao vivo (registrar saque, registrar
// aposta com R.B. já incluso, e — só aos domingos — Bônus pra fechar a
// semana); o "Total da plataforma" (soma de todas as semanas já
// fechadas + Saldo da fase atual); "Fases do Saldo"; e o Histórico de
// semanas (editar, excluir, adicionar semana antiga, busca por data).
// Reaproveita o visual do acordeão que já existe em manage-panel.css
// (mesmas classes .platform-manage-row*) — só o conteúdo de dentro de
// cada linha é diferente da Página 4.
//
// FASES: quando o histórico antigo é incompleto ou tem números
// conhecidamente errados, "Iniciar nova fase" fecha a fase atual (o
// resultado dela fica visível pra sempre em "Fases do Saldo") e pede um
// SALDO INICIAL (obrigatório) — pensado pra migração da planilha
// externa: no dia da virada de ciclo, você digita o Saldo real de cada
// plataforma e o sistema passa a somar os movimentos dali pra frente em
// cima desse valor, sem carregar nenhum cálculo da fase anterior. O
// badge do nome, "Semana atual" e "Total da plataforma" sempre mostram o
// Saldo da fase ATUAL (a mais recente, já com o Saldo Inicial dela
// somado).
//
// BACKFILL: "+ Adicionar semana antiga" (dentro do Histórico) insere uma
// semana já fechada direto no sistema — útil pra trazer dados de uma
// planilha externa antes de fechar uma fase.
//
// SAVE: cada ação aqui mexe em UMA plataforma, então usa savePlatform
// (grava só o doc dela). Só o botão de massa do Painel Geral
// (initFinanceOverview) mexe em todas de propósito e usa savePlatforms —
// ver nota em platforms-store.js sobre por que essa distinção existe.

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import {
  getWeekStart, getWeekEnd, toLocalDateString, toLocalDateTimeString,
  computeCurrentWeekLive, closeWeek, isCurrentWeekClosed, canCloseCurrentWeek,
  updateClosedWeek, deleteClosedWeek, addHistoricalWeek,
  computePlatformTotals, computeOverallTotals, computeLiveBalance,
  computePhaseHistory, startNewPhase, removeLastPhase
} from './finance-logic.js';
import { savePlatforms, savePlatform } from './platforms-store.js';

const financeListEl = document.getElementById('financeList');
const financeSearchEl = document.getElementById('financeSearch');

let currentSearch = '';
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
// Id da plataforma mostrando o formulário "Adicionar semana antiga" — só
// uma por vez. Reseta junto com o resto ao abrir/fechar uma linha.
let addingHistoricalWeekId = null;

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

function getVisibleList() {
  const q = currentSearch.trim().toLowerCase();
  return state.platforms.filter(p => p.name.toLowerCase().includes(q));
}

function statBox(label, value, cls = '') {
  return `
    <div class="finance-stat">
      <span class="finance-stat-label">${label}</span>
      <span class="finance-stat-value ${cls}">${value}</span>
    </div>`;
}

// Usado no card do histórico (semana fechada), no "Total da plataforma",
// no "Painel Geral" e nos cards de "Fases do Saldo" — todos têm o mesmo
// formato de 9 campos (o 9° é Saldo). A "Semana atual" (ao vivo) tem seu
// próprio grid, à parte.
//
// opts.balanceLabel troca o rótulo do último campo pra deixar claro do
// que se trata em cada contexto (semana fechada = travado; fase = da
// fase; padrão = Saldo ao vivo da fase atual). Saldo é travado em
// R$ 0,00 aqui na exibição também (defensivo).
//
// opts.showInitialBalance adiciona um box extra no INÍCIO do grid com o
// Saldo Inicial daquela fase — só usado nos cards de "Fases do Saldo",
// onde faz sentido separar "o que veio de fora" (Saldo Inicial) do que
// foi calculado a partir dos movimentos dentro da fase.
function statsGridHtml(totals, opts = {}) {
  const safeBalance = Math.max(0, Number(totals.balance) || 0);
  const balanceLabel = opts.balanceLabel || 'Saldo (Balance)';
  const initialBalanceBox = opts.showInitialBalance
    ? statBox('Saldo Inicial', formatCurrency(Math.max(0, Number(totals.initialBalance) || 0)))
    : '';
  return `
    ${initialBalanceBox}
    ${statBox('Depósito', formatCurrency(totals.deposit))}
    ${statBox('Saque', formatCurrency(totals.withdrawal))}
    ${statBox('Diferença', formatCurrency(totals.difference), totals.difference >= 0 ? 'positive' : 'negative')}
    ${statBox('Apostado', formatCurrency(totals.wagered))}
    ${statBox('N° Apostas', String(totals.betCount))}
    ${statBox('Bônus', formatCurrency(totals.bonus))}
    ${statBox('R.B.', formatCurrency(totals.resultBetting), totals.resultBetting >= 0 ? 'positive' : 'negative')}
    ${statBox('R.B. + Bônus', formatCurrency(totals.rbPlusBonus), totals.rbPlusBonus >= 0 ? 'positive' : 'negative')}
    ${statBox(balanceLabel, formatCurrency(safeBalance), 'positive')}
  `;
}

// ---------- PAINEL GERAL (topo da página — todas as plataformas) ----------

export function initFinanceOverview() {
  const fromEl = document.getElementById('financeOverviewFrom');
  const toEl = document.getElementById('financeOverviewTo');
  const clearBtn = document.getElementById('financeOverviewClearBtn');
  const newPhaseAllBtn = document.getElementById('financeOverviewNewPhaseAllBtn');

  if (fromEl) fromEl.addEventListener('change', renderFinanceOverview);
  if (toEl) toEl.addEventListener('change', renderFinanceOverview);
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      renderFinanceOverview();
    });
  }
  if (newPhaseAllBtn) {
    newPhaseAllBtn.addEventListener('click', async () => {
      const count = state.platforms.length;
      const ok = await showAppConfirm(
        `Iniciar uma nova fase pra todas as ${count} plataformas, a partir de agora, com Saldo Inicial R$ 0,00 pra todas? ` +
        `O resultado da fase atual de cada uma continua guardado (visível em "Fases do Saldo" ` +
        `dentro de cada plataforma), e o Saldo de todas volta a contar a partir de agora. ` +
        `Se cada plataforma tiver um Saldo real diferente pra migrar, prefira abrir a fase ` +
        `individualmente em cada uma (lá dá pra informar o Saldo Inicial de cada uma).`
      );
      if (!ok) return;
      const now = new Date();
      state.platforms.forEach(p => startNewPhase(p, now, 0));
      // Ação em massa DE VERDADE (todas as plataformas mudaram) — aqui, e
      // só aqui nesta página, savePlatforms (plural) é o correto.
      savePlatforms(state.currentUid, state.platforms);
      renderFinanceList();
    });
  }
}

export function renderFinanceOverview() {
  const statsEl = document.getElementById('financeOverviewStats');
  if (!statsEl) return;

  const fromEl = document.getElementById('financeOverviewFrom');
  const toEl = document.getElementById('financeOverviewTo');
  const from = fromEl && fromEl.value ? fromEl.value : null;
  const to = toEl && toEl.value ? toEl.value : null;

  const totals = computeOverallTotals(state.platforms, from, to);
  statsEl.innerHTML = statsGridHtml(totals);
}

// ---------- LISTA DE PLATAFORMAS ----------

export function renderFinanceList() {
  renderFinanceOverview();

  if (!financeListEl) return;
  financeListEl.innerHTML = '';

  const list = getVisibleList();

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'finance-empty';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    financeListEl.appendChild(empty);
    return;
  }

  list.forEach(p => financeListEl.appendChild(buildRow(p)));
}

function dividerEl() {
  const hr = document.createElement('hr');
  hr.className = 'manage-section-divider';
  return hr;
}

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'platform-manage-row' + (p.id === openRowId ? ' open' : '');
  row.dataset.id = p.id;

  const live = computeCurrentWeekLive(p);
  const closed = isCurrentWeekClosed(p);
  const liveBalance = computeLiveBalance(p);

  // --- header (fechado): nome + badge de Saldo (ao vivo, da fase atual)
  //     + status da semana ---
  const header = document.createElement('div');
  header.className = 'platform-manage-row-header';

  const title = document.createElement('div');
  title.className = 'platform-manage-row-title';
  title.textContent = p.name;

  const badges = document.createElement('div');
  badges.className = 'platform-manage-row-badges';

  const balanceBadge = document.createElement('span');
  balanceBadge.className = 'platform-total-badge';
  balanceBadge.style.background = '#dcfce7';
  balanceBadge.textContent = `Saldo ${formatCurrency(liveBalance)}`;
  balanceBadge.title = 'Saldo Inicial da fase atual (se houver) + depósitos - saques + resultado das apostas (R.B.) + bônus recebidos, desde o início da fase atual (mínimo R$ 0,00)';
  badges.appendChild(balanceBadge);

  if (closed) {
    const doneBadge = document.createElement('span');
    doneBadge.className = 'finance-closed-badge';
    doneBadge.textContent = '✓ semana fechada';
    badges.appendChild(doneBadge);
  }

  const chevron = document.createElement('span');
  chevron.className = 'platform-manage-chevron';
  chevron.textContent = '▾';

  header.appendChild(title);
  header.appendChild(badges);
  header.appendChild(chevron);
  header.addEventListener('click', () => {
    openRowId = (openRowId === p.id) ? null : p.id;
    editingWeek = null;
    historyDateFilter = null;
    startingPhaseId = null;
    addingHistoricalWeekId = null;
    renderFinanceList();
  });

  // --- body (aberto): Semana atual + Total da plataforma + Fases do
  //     Saldo + Histórico ---
  const body = document.createElement('div');
  body.className = 'platform-manage-row-body';
  body.appendChild(buildCurrentWeekSection(p, live, closed, liveBalance));
  body.appendChild(dividerEl());
  body.appendChild(buildPlatformTotalSection(p));
  body.appendChild(dividerEl());
  body.appendChild(buildPhaseSection(p));
  body.appendChild(dividerEl());
  body.appendChild(buildHistorySection(p));

  row.appendChild(header);
  row.appendChild(body);
  return row;
}

// ---------- SEÇÃO "SEMANA ATUAL" (ao vivo + registrar + fechar) ----------

function buildCurrentWeekSection(p, live, closed, liveBalance) {
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
    renderFinanceList();
  });
  withdrawForm.appendChild(withdrawInput);
  withdrawForm.appendChild(withdrawBtn);
  section.appendChild(withdrawForm);

  // --- registrar aposta (valor apostado + n° de apostas + R.B. da aposta) ---
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
    renderFinanceList();
  });
  betForm.appendChild(wageredInput);
  betForm.appendChild(betCountInput);
  betForm.appendChild(rbInput);
  betForm.appendChild(betBtn);
  section.appendChild(betForm);

  // --- fechar semana: só aos domingos. Pede só o Bônus — R.B. já vem
  //     somado ao vivo, e o Saldo é calculado sozinho (Saldo atual +
  //     Bônus desta semana) ao confirmar. ---
  if (canCloseCurrentWeek()) {
    const closeSection = document.createElement('div');
    closeSection.className = 'finance-close-week';

    const closeLabel = document.createElement('div');
    closeLabel.className = 'manage-section-label';
    closeLabel.textContent = 'Fechar semana (domingo)';
    closeSection.appendChild(closeLabel);

    const closeNote = document.createElement('p');
    closeNote.className = 'finance-close-week-note';
    closeNote.textContent = `R.B. da semana já somado automaticamente: ${formatCurrency(live.resultBetting)}. Saldo atual (antes do Bônus desta semana): ${formatCurrency(liveBalance)}. Falta só informar o Bônus — o Saldo final é calculado sozinho ao fechar.`;
    closeSection.appendChild(closeNote);

    const closeForm = document.createElement('div');
    closeForm.className = 'finance-entry-form';
    const bonusInput = document.createElement('input');
    bonusInput.type = 'number';
    bonusInput.step = '0.01';
    bonusInput.placeholder = 'Bônus recebido na semana';
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
      closeWeek(p, bonus);
      savePlatform(state.currentUid, p);
      openRowId = p.id;
      renderFinanceList();
    });
    closeActions.appendChild(closeBtn);
    closeSection.appendChild(closeActions);
    section.appendChild(closeSection);
  }

  return section;
}

// ---------- SEÇÃO "TOTAL DA PLATAFORMA" (soma das semanas fechadas + Saldo da fase atual) ----------

function buildPlatformTotalSection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Total da plataforma';
  section.appendChild(label);

  const weeks = p.financeWeeks || [];
  const totals = computePlatformTotals(p);

  const card = document.createElement('div');
  card.className = 'finance-week-card finance-total-card';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${weeks.length} semana(s) fechada(s)</span>`;
  card.appendChild(header);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Saldo (Balance) é sempre o valor ATUAL da fase atual, ao vivo (já com o Saldo Inicial dela, se houver) — não é uma soma das semanas fechadas nem das fases anteriores.';
  card.appendChild(note);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = statsGridHtml(totals);
  card.appendChild(stats);

  section.appendChild(card);
  return section;
}

// ---------- SEÇÃO "FASES DO SALDO" ----------

function buildPhaseSection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Fases do Saldo';
  section.appendChild(label);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Cada fase começa com um Saldo Inicial (informado na hora de abrir a fase) e soma os movimentos a partir dali — nada de fases anteriores é carregado além desse valor. "Iniciar nova fase" fecha a fase atual (o resultado dela fica guardado aqui pra sempre) e pede o Saldo Inicial da fase nova. Útil quando o histórico antigo é incompleto, tem números errados, ou quando você está migrando de uma planilha externa e quer começar do valor real de hoje.';
  section.appendChild(note);

  section.appendChild(buildPhaseControls(p));

  const phases = computePhaseHistory(p);
  const list = document.createElement('div');
  list.className = 'finance-history';
  [...phases].reverse().forEach(phase => {
    list.appendChild(buildPhaseCard(phase));
  });
  section.appendChild(list);

  return section;
}

function buildPhaseControls(p) {
  const wrap = document.createElement('div');
  wrap.className = 'finance-checkpoint';

  if (startingPhaseId === p.id) {
    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    // Pré-seleciona hoje às 00:01 — cobre o dia inteiro por padrão, mas
    // 100% editável (data E hora). toLocalDateTimeString, nunca
    // toISOString, pelo mesmo motivo de sempre (fuso do Brasil).
    const defaultPhaseStart = new Date();
    defaultPhaseStart.setHours(0, 1, 0, 0);
    dateInput.value = toLocalDateTimeString(defaultPhaseStart);
    dateInput.setAttribute('aria-label', 'Data e hora de início da nova fase');

    const initialBalanceInput = document.createElement('input');
    initialBalanceInput.type = 'number';
    initialBalanceInput.min = '0';
    initialBalanceInput.step = '0.01';
    initialBalanceInput.placeholder = 'Saldo Inicial da nova fase';
    initialBalanceInput.setAttribute('aria-label', 'Saldo Inicial da nova fase');

    const row = document.createElement('div');
    row.className = 'finance-entry-form';
    row.appendChild(dateInput);
    row.appendChild(initialBalanceInput);
    wrap.appendChild(row);

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

      // dateInput.value vem como "AAAA-MM-DDTHH:mm" — new Date() interpreta
      // como horário LOCAL (sem "Z"), então o instante gravado é
      // exatamente o que foi escolhido, minuto a minuto.
      const chosenInstant = new Date(dateInput.value);
      const dateLabel = chosenInstant.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const ok = await showAppConfirm(
        `Fechar a fase atual de ${p.name} e começar uma nova a partir de ${dateLabel}, com Saldo Inicial de ${formatCurrency(initialBalance)}? ` +
        `Tudo registrado ANTES desse instante continua contando na fase que está fechando (guardada pra sempre em "Fases do Saldo"); a partir dele, conta na fase nova.`
      );
      if (!ok) return;

      startNewPhase(p, dateInput.value, initialBalance);
      savePlatform(state.currentUid, p);
      startingPhaseId = null;
      openRowId = p.id;
      renderFinanceList();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel-modal';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => {
      startingPhaseId = null;
      renderFinanceList();
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
    renderFinanceList();
  });
  actions.appendChild(startBtn);

  if ((p.balancePhases || []).length > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-cancel-modal';
    removeBtn.textContent = 'Remover última fase';
    removeBtn.addEventListener('click', async () => {
      const ok = await showAppConfirm('Remover a última fase (e o Saldo Inicial dela)? O Saldo passa a contar de novo a partir de antes dela.');
      if (!ok) return;
      removeLastPhase(p);
      savePlatform(state.currentUid, p);
      openRowId = p.id;
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
    showInitialBalance: true
  });
  card.appendChild(stats);

  return card;
}

// ---------- SEÇÃO "HISTÓRICO" (semanas fechadas — editável, excluível,
//            com busca por data e opção de adicionar semana antiga) ----------

function buildHistorySection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Histórico (semanas fechadas)';
  section.appendChild(label);

  section.appendChild(buildAddHistoricalWeekControls(p));

  // Busca por data: escolher qualquer dia dentro de uma semana já fechada
  // pula direto pra ela, sem precisar rolar a lista inteira.
  const searchRow = document.createElement('div');
  searchRow.className = 'finance-entry-form';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.setAttribute('aria-label', 'Buscar semana por data');
  if (historyDateFilter) dateInput.value = historyDateFilter;
  dateInput.addEventListener('change', () => {
    historyDateFilter = dateInput.value || null;
    openRowId = p.id;
    renderFinanceList();
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
      renderFinanceList();
    });
    searchRow.appendChild(clearBtn);
  }
  section.appendChild(searchRow);

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
    section.appendChild(empty);
    return section;
  }

  const history = document.createElement('div');
  history.className = 'finance-history';

  weeks.forEach(w => {
    const isEditing = !!editingWeek
      && editingWeek.platformId === p.id
      && editingWeek.weekStart === w.weekStart;

    history.appendChild(isEditing ? buildWeekCardEditing(p, w) : buildWeekCardReadOnly(p, w));
  });

  section.appendChild(history);
  return section;
}

// "+ Adicionar semana antiga" — insere uma semana já fechada direto no
// histórico (backfill), fora do fluxo normal de fechamento aos domingos.
// Útil pra trazer dados de uma planilha externa antes de fechar uma fase.
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
      renderFinanceList();
    });
    wrap.appendChild(btn);
    return wrap;
  }

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
  const depositInput = numberInput('Depósito', 0); depositInput.min = '0';
  const withdrawalInput = numberInput('Saque', 0); withdrawalInput.min = '0';
  row1.appendChild(depositInput);
  row1.appendChild(withdrawalInput);
  wrap.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'finance-entry-form';
  const wageredInput = numberInput('Apostado', 0); wageredInput.min = '0';
  const betCountInput = numberInput('N° de apostas', 0, '1'); betCountInput.min = '0';
  row2.appendChild(wageredInput);
  row2.appendChild(betCountInput);
  wrap.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'finance-entry-form';
  const bonusInput = numberInput('Bônus', 0);
  const resultInput = numberInput('Result Betting (R.B.)', 0);
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
      const msg = result.reason === 'current-week'
        ? 'Essa é a semana atual — ela já é registrada automaticamente pelos campos de "Semana atual" acima, não precisa (e não dá) inserir por aqui.'
        : 'Já existe uma semana fechada nesse período pra essa plataforma. Use "Editar" nela se precisar corrigir algo, ou "Excluir" e adicione de novo.';
      await showAppAlert(msg);
      return;
    }

    savePlatform(state.currentUid, p);
    addingHistoricalWeekId = null;
    openRowId = p.id;
    renderFinanceList();
  });

const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    addingHistoricalWeekId = null;
    renderFinanceList();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  return wrap;
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
    renderFinanceList();
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
    renderFinanceList();
  });

  btnGroup.appendChild(editBtn);
  btnGroup.appendChild(deleteBtn);

  header.appendChild(rangeSpan);
  header.appendChild(btnGroup);
  card.appendChild(header);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = statsGridHtml(w, { balanceLabel: 'Saldo (travado nesta semana)' });
  card.appendChild(stats);

  return card;
}

// Diferença e R.B.+Bônus NÃO viram input: ficam de fora do formulário de
// propósito, porque são sempre recalculados a partir dos outros campos
// (ver updateClosedWeek em finance-logic.js) — editá-los direto poderia
// deixar o registro inconsistente. Saldo TAMBÉM não é editável aqui: é um
// retrato fixo do momento do fechamento que não alimenta nenhum outro
// cálculo do app — correções em Bônus/R.B. aqui já entram sozinhas no
// próximo cálculo ao vivo da fase atual.
function buildWeekCardEditing(p, w) {
  const card = document.createElement('div');
  card.className = 'finance-week-card finance-week-card-editing';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)}</span>`;
  card.appendChild(header);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Diferença e R.B. + Bônus são recalculados automaticamente ao salvar. O Saldo travado desta semana é fixo e não pode ser editado — o Saldo que realmente importa (o da fase atual, ao vivo) aparece em "Total da plataforma" e no nome da plataforma. Editar Depósito/Saque aqui corrige só o card desta semana; se precisar que a correção afete o Saldo/Fases, o mais seguro é excluir esta semana e adicionar de novo.';
  card.appendChild(note);

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
    renderFinanceList();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    editingWeek = null;
    renderFinanceList();
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

// ---------- CONTROLE DO TOPO (busca de plataforma) ----------

export function initFinanceControls() {
  if (financeSearchEl) {
    financeSearchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderFinanceList();
    });
  }
}
