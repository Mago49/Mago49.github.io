// === PÁGINA 5 (FINANCEIRO) — acordeão por plataforma ===
// Cada linha mostra a semana atual ao vivo (editável: registrar saque,
// registrar aposta, e — a partir de domingo — Bônus + Result Betting pra
// fechar a semana) e, abaixo, o histórico de semanas já fechadas
// (editável campo a campo, ver buildWeekCardEditing). Reaproveita o
// visual do acordeão que já existe em manage-panel.css (mesmas classes
// .platform-manage-row*) — só o conteúdo de dentro de cada linha é
// diferente da Página 4.

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import {
  computeCurrentWeekLive, closeWeek, isCurrentWeekClosed, canCloseCurrentWeek, updateClosedWeek
} from './finance-logic.js';
import { savePlatforms } from './platforms-store.js';

const financeListEl = document.getElementById('financeList');
const financeSearchEl = document.getElementById('financeSearch');

let currentSearch = '';
let openRowId = null;
// Semana do histórico atualmente em edição (no máximo uma por vez):
// { platformId, weekStart } | null
let editingWeek = null;

function formatDatePt(isoDateStr) {
  const [y, m, d] = isoDateStr.split('-');
  return `${d}/${m}`;
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

function numberInput(placeholder, value, step = '0.01') {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.placeholder = placeholder;
  input.value = value;
  input.setAttribute('aria-label', placeholder);
  return input;
}

export function renderFinanceList() {
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

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'platform-manage-row' + (p.id === openRowId ? ' open' : '');
  row.dataset.id = p.id;

  const live = computeCurrentWeekLive(p);
  const closed = isCurrentWeekClosed(p);

  // --- header (fechado): nome + badge de diferença + status da semana ---
  const header = document.createElement('div');
  header.className = 'platform-manage-row-header';

  const title = document.createElement('div');
  title.className = 'platform-manage-row-title';
  title.textContent = p.name;

  const badges = document.createElement('div');
  badges.className = 'platform-manage-row-badges';

  const diffBadge = document.createElement('span');
  diffBadge.className = 'platform-total-badge';
  diffBadge.style.background = live.difference >= 0 ? '#dcfce7' : '#fecaca';
  diffBadge.textContent = `Δ ${formatCurrency(live.difference)}`;
  badges.appendChild(diffBadge);

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
    renderFinanceList();
  });

  // --- body (aberto): Semana atual + Histórico ---
  const body = document.createElement('div');
  body.className = 'platform-manage-row-body';
  body.appendChild(buildCurrentWeekSection(p, live, closed));

  const divider = document.createElement('hr');
  divider.className = 'manage-section-divider';
  body.appendChild(divider);

  body.appendChild(buildHistorySection(p));

  row.appendChild(header);
  row.appendChild(body);
  return row;
}

// ---------- SEÇÃO "SEMANA ATUAL" (ao vivo + registrar + fechar) ----------

function buildCurrentWeekSection(p, live, closed) {
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
    savePlatforms(state.currentUid, state.platforms);
    openRowId = p.id;
    renderFinanceList();
  });
  withdrawForm.appendChild(withdrawInput);
  withdrawForm.appendChild(withdrawBtn);
  section.appendChild(withdrawForm);

  // --- registrar aposta (valor apostado + n° de apostas) ---
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
  const betBtn = document.createElement('button');
  betBtn.className = 'bet-manage-btn';
  betBtn.type = 'button';
  betBtn.textContent = 'Registrar aposta';
  betBtn.addEventListener('click', async () => {
    const wagered = parseFloat(wageredInput.value);
    const betCount = parseInt(betCountInput.value, 10);
    if (isNaN(wagered) || wagered <= 0 || isNaN(betCount) || betCount <= 0) {
      await showAppAlert('Digite valor apostado e n° de apostas válidos');
      return;
    }
    if (!p.betEntries) p.betEntries = [];
    p.betEntries.push({ date: new Date().toISOString(), wagered, betCount });
    savePlatforms(state.currentUid, state.platforms);
    openRowId = p.id;
    renderFinanceList();
  });
  betForm.appendChild(wageredInput);
  betForm.appendChild(betCountInput);
  betForm.appendChild(betBtn);
  section.appendChild(betForm);

  // --- fechar semana (só aparece aos domingos) ---
  if (canCloseCurrentWeek()) {
    const closeSection = document.createElement('div');
    closeSection.className = 'finance-close-week';

    const closeLabel = document.createElement('div');
    closeLabel.className = 'manage-section-label';
    closeLabel.textContent = 'Fechar semana (domingo)';
    closeSection.appendChild(closeLabel);

    const closeForm = document.createElement('div');
    closeForm.className = 'finance-entry-form';
    const bonusInput = document.createElement('input');
    bonusInput.type = 'number';
    bonusInput.step = '0.01';
    bonusInput.placeholder = 'Bônus recebido na semana';
    const resultInput = document.createElement('input');
    resultInput.type = 'number';
    resultInput.step = '0.01';
    resultInput.placeholder = 'Result Betting (R.B.)';
    closeForm.appendChild(bonusInput);
    closeForm.appendChild(resultInput);
    closeSection.appendChild(closeForm);

    const closeActions = document.createElement('div');
    closeActions.className = 'reset-modal-buttons';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-confirm';
    closeBtn.type = 'button';
    closeBtn.textContent = '🔒 Fechar semana';
    closeBtn.addEventListener('click', async () => {
      const bonus = parseFloat(bonusInput.value);
      const resultBetting = parseFloat(resultInput.value);
      if (isNaN(bonus) || isNaN(resultBetting)) {
        await showAppAlert('Preencha Bônus e Result Betting pra fechar a semana.');
        return;
      }
      const ok = await showAppConfirm(`Fechar a semana de ${p.name}? Depois de fechada, os valores não mudam mais sozinhos.`);
      if (!ok) return;
      closeWeek(p, bonus, resultBetting);
      savePlatforms(state.currentUid, state.platforms);
      openRowId = p.id;
      renderFinanceList();
    });
    closeActions.appendChild(closeBtn);
    closeSection.appendChild(closeActions);
    section.appendChild(closeSection);
  }

  return section;
}

// ---------- SEÇÃO "HISTÓRICO" (semanas fechadas — editável campo a campo) ----------

function buildHistorySection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Histórico (semanas fechadas)';
  section.appendChild(label);

  const weeks = [...(p.financeWeeks || [])].sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  if (weeks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'finance-empty';
    empty.textContent = 'Nenhuma semana fechada ainda.';
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

function buildWeekCardReadOnly(p, w) {
  const card = document.createElement('div');
  card.className = 'finance-week-card';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';

  const rangeSpan = document.createElement('span');
  rangeSpan.textContent = `${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)}`;

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'bet-manage-btn';
  editBtn.textContent = 'Editar';
  editBtn.addEventListener('click', () => {
    editingWeek = { platformId: p.id, weekStart: w.weekStart };
    openRowId = p.id;
    renderFinanceList();
  });

  header.appendChild(rangeSpan);
  header.appendChild(editBtn);
  card.appendChild(header);

  const stats = document.createElement('div');
  stats.className = 'finance-stats-grid';
  stats.innerHTML = `
    ${statBox('Depósito', formatCurrency(w.deposit))}
    ${statBox('Saque', formatCurrency(w.withdrawal))}
    ${statBox('Diferença', formatCurrency(w.difference), w.difference >= 0 ? 'positive' : 'negative')}
    ${statBox('Apostado', formatCurrency(w.wagered))}
    ${statBox('N° Apostas', String(w.betCount))}
    ${statBox('Bônus', formatCurrency(w.bonus))}
    ${statBox('R.B.', formatCurrency(w.resultBetting), w.resultBetting >= 0 ? 'positive' : 'negative')}
    ${statBox('R.B. + Bônus', formatCurrency(w.rbPlusBonus), w.rbPlusBonus >= 0 ? 'positive' : 'negative')}
  `;
  card.appendChild(stats);

  return card;
}

// Diferença e R.B.+Bônus NÃO viram input: ficam de fora do formulário de
// propósito, porque são sempre recalculados a partir dos outros 6 campos
// (ver updateClosedWeek em finance-logic.js) — editá-los direto poderia
// deixar o registro inconsistente (ex: Diferença que não bate com
// Saque - Depósito).
function buildWeekCardEditing(p, w) {
  const card = document.createElement('div');
  card.className = 'finance-week-card finance-week-card-editing';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${formatDatePt(w.weekStart)} – ${formatDatePt(w.weekEnd)}</span>`;
  card.appendChild(header);

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Diferença e R.B. + Bônus são recalculados automaticamente ao salvar.';
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
    savePlatforms(state.currentUid, state.platforms);
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

// ---------- CONTROLE DO TOPO (busca) ----------

export function initFinanceControls() {
  if (financeSearchEl) {
    financeSearchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderFinanceList();
    });
  }
}
