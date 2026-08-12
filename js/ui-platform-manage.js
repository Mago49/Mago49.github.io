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

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import { getCycleStart, getCurrentCycleDay, getTotalDepositsSinceCycle, colorForLevel } from './cycle-logic.js';
import { savePlatforms, deletePlatformDoc } from './platforms-store.js';
import { sortPlatforms, filterPlatforms, SORT_ONLY_MODES } from './platform-sort.js';
import { initSortMenu } from './ui-sort.js';

const manageListEl = document.getElementById('platformManageList');
const platformSearchEl = document.getElementById('platformSearch');

let currentSearch = '';
let currentMode = null; // um dos SORT_MENU_OPTIONS.value, ou null (Padrão)
let openRowId = null;

// ---------- LISTA PRINCIPAL (fundida) ----------

function getVisibleList() {
  const q = currentSearch.trim().toLowerCase();
  let list = state.platforms.filter(p => p.name.toLowerCase().includes(q));

  if (currentMode) {
    list = SORT_ONLY_MODES.has(currentMode)
      ? sortPlatforms(list, currentMode)
      : filterPlatforms(list, currentMode); // com / sem / ativas / inativas -> filtra (esconde)
  }
  return list;
}

export function renderManageList() {
  if (!manageListEl) return;
  manageListEl.querySelectorAll('.platform-manage-row-existing').forEach(el => el.remove());

  const list = getVisibleList();

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty platform-manage-row-existing';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    manageListEl.appendChild(empty);
    return;
  }

  list.forEach(p => manageListEl.appendChild(buildRow(p)));
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

  badges.appendChild(cycleBadge);
  badges.appendChild(totalBadge);

  const chevron = document.createElement('span');
  chevron.className = 'platform-manage-chevron';
  chevron.textContent = '▾';

  header.appendChild(title);
  header.appendChild(badges);
  header.appendChild(chevron);
  header.addEventListener('click', () => {
    openRowId = (openRowId === p.id) ? null : p.id;
    renderManageList();
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
      // 5) — ao contrário de p.deposits, Fim/Reinício (mais abaixo) NUNCA
      // apagam este array.
      if (!p.depositLog) p.depositLog = [];
      p.depositLog.push({ ...entry });
      savePlatforms(state.currentUid, state.platforms);
      renderManageList();
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
    savePlatforms(state.currentUid, state.platforms);
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const cycleStart = getCycleStart(p, new Date());
  const betDaysInCycle = (p.betDays || []).filter(d => new Date(d) >= cycleStart);
  const alreadyBetToday = betDaysInCycle.some(d => d.slice(0, 10) === todayStr);

  const betTodayBtn = document.createElement('button');
  betTodayBtn.className = 'bet-today-btn' + (alreadyBetToday ? ' already-bet' : '');
  betTodayBtn.textContent = alreadyBetToday ? '✓ Apostei hoje' : '🎯 Apostei hoje';
  betTodayBtn.disabled = alreadyBetToday;
  betTodayBtn.addEventListener('click', () => {
    if (alreadyBetToday) return;
    if (!p.betDays) p.betDays = [];
    p.betDays.push(todayStr);
    savePlatforms(state.currentUid, state.platforms);
    renderManageList();
  });

  const betCount = document.createElement('span');
  betCount.className = 'bet-count-badge';
  betCount.textContent = `🎲 ${betDaysInCycle.length} dia(s)`;

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

// ---------- SEÇÃO "DADOS" (nome, nível, grupo) ----------

function buildDataSection(p) {
  const section = document.createElement('div');
  section.className = 'manage-data-section';

  const label = document.createElement('div');
  label.className = 'manage-section-label';
  label.textContent = 'Dados';
  section.appendChild(label);

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

    savePlatforms(state.currentUid, state.platforms);
    openRowId = p.id;
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
    savePlatforms(state.currentUid, state.platforms);
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

    state.platforms.push({
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
      balancePhases: []
    });

    savePlatforms(state.currentUid, state.platforms);
    nameInput.value = '';
    levelSelect.value = '';
    groupSelect.value = '';
    addRow.classList.remove('open');

    renderManageList();
  });
}

// ---------- MODAL: HISTÓRICO ----------

const historyModal = document.getElementById('historyModal');
const historyTitle = document.getElementById('historyTitle');
const historyList = document.getElementById('historyList');
const historyCloseBtn = document.getElementById('historyCloseBtn');

// Depósito atualmente em edição dentro do modal de histórico — guardamos
// pela `date` (chave natural, já que não existe um id próprio por
// depósito). null quando nenhum item está em edição.
let editingDepositDate = null;

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
          savePlatforms(state.currentUid, state.platforms);
          editingDepositDate = null;
          openRowId = platform.id;
          renderManageList();
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
            savePlatforms(state.currentUid, state.platforms);
            openRowId = platform.id;
            renderManageList();
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

// ---------- MODAL: REINÍCIO DE CICLO ----------

const resetModal = document.getElementById('resetModal');
const resetModalText = document.getElementById('resetModalText');
const resetDateInput = document.getElementById('resetDateInput');
const resetConfirmBtn = document.getElementById('resetConfirmBtn');
const resetCancelBtn = document.getElementById('resetCancelBtn');
let currentResetPlatform = null;

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

resetConfirmBtn.addEventListener('click', async () => {
  if (currentResetPlatform) {
    if (!resetDateInput.value) {
      await showAppAlert('Selecione uma data válida para reiniciar o ciclo.');
      return;
    }
    currentResetPlatform.lastResetDate = `${resetDateInput.value}T00:00:00`;
    currentResetPlatform.cycleEnded = false;
    // Reinício também zera os depósitos — garantia extra caso alguém clique
    // direto em "Reinício" sem passar por "Fim" antes.
    currentResetPlatform.deposits = [];
    openRowId = currentResetPlatform.id;
    savePlatforms(state.currentUid, state.platforms);
    renderManageList();
  }
  closeResetModal();
});

resetCancelBtn.addEventListener('click', closeResetModal);
resetModal.addEventListener('click', (e) => { if (e.target === resetModal) closeResetModal(); });

// ---------- MODAL: GERENCIAR APOSTAS ----------

const betModal = document.getElementById('betModal');
const betModalTitle = document.getElementById('betModalTitle');
const betModalClose = document.getElementById('betModalClose');
const betDateInput = document.getElementById('betDateInput');
const betAddConfirm = document.getElementById('betAddConfirm');
const betList = document.getElementById('betList');
let currentBetPlatform = null;

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

  const cycleStart = getCycleStart(currentBetPlatform, new Date());
  const days = (currentBetPlatform.betDays || [])
    .filter(d => new Date(d) >= cycleStart)
    .map(d => d.slice(0, 10))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => b.localeCompare(a));

  if (days.length === 0) {
    betList.innerHTML = '<div class="bet-empty">Nenhuma aposta registrada neste ciclo.</div>';
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
      savePlatforms(state.currentUid, state.platforms);
      renderBetList();
      openRowId = currentBetPlatform.id;
      renderManageList();
    });

    item.appendChild(label);
    item.appendChild(removeBtn);
    betList.appendChild(item);
  });
}

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
  savePlatforms(state.currentUid, state.platforms);
  renderBetList();
  openRowId = currentBetPlatform.id;
  renderManageList();
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

// ---------- CONTROLES DO TOPO (busca, ordenar) ----------
// O botão "Resetar todos os depósitos" foi REMOVIDO — ele zerava
// `deposits` de todas as plataformas de uma vez e tinha o mesmo problema
// (em escala maior) que Fim/Reinício sempre tiveram em relação ao
// Financeiro: apagar dados que a Página 5 ainda precisava daquela semana.
// Como Fim/Reinício já cobrem o caso de uso real (por plataforma), ele
// deixou de existir.

export function initManageControls() {
  initAddRow();

  if (platformSearchEl) {
    platformSearchEl.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderManageList();
    });
  }

  initSortMenu({
    buttonId: 'manageSortBtn',
    dropdownId: 'manageSortDropdown',
    // Página 4: 1-9/9-1/+Dias/-Dias reordenam; Com/Sem/Ativas/Inativas
    // escondem quem não bate (ver getVisibleList / filterPlatforms).
    onChange: (mode) => {
      currentMode = mode;
      renderManageList();
    }
  });
}
