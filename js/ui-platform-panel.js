// === PAINEL DE PLATAFORMAS ===
// Agrupa renderPlatformList() e os modais de Histórico, Reinício, Apostas e
// Gerenciar Plataformas no mesmo arquivo DE PROPÓSITO: essas peças chamam
// umas às outras o tempo todo (abrir modal -> salvar -> re-renderizar lista
// -> fechar modal). Separar isso em arquivos menores criaria import
// circular entre eles sem ganhar clareza.

import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency } from './utils.js';
import { getCycleStart, getCurrentCycleDay, getTotalDepositsSinceCycle, colorForLevel } from './cycle-logic.js';
import { savePlatforms, deletePlatformDoc } from './platforms-store.js';
import { updateCalendarEvents, filterCalendarByPlatform, showAllBonusCalendar } from './ui-calendar.js';
import { updateHeroSummary } from './ui-hero.js';
import { renderVipPanel } from './ui-vip-panel.js';

const platformPanelEl = document.getElementById('platformPanel');
const platformSearchEl = document.getElementById('platformSearch');

// ---------- LISTA DE PLATAFORMAS ----------

export function renderPlatformList(filter = '') {
  const listEl = document.getElementById('platformList');
  listEl.innerHTML = '';
  const q = filter.trim().toLowerCase();
  const items = state.platforms.filter(p => p.name.toLowerCase().includes(q));

  items.forEach(p => {
    const li = document.createElement('li');
    li.className = 'platform-item' + (p.cycleEnded ? ' ended' : '');
    li.dataset.id = p.id;

    const total = getTotalDepositsSinceCycle(p);
    const bgColor = colorForLevel(total);
    const cycleDay = getCurrentCycleDay(p);

    const header = document.createElement('div');
    header.className = 'platform-item-header';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name;

    const cycleInfo = document.createElement('div');
    cycleInfo.className = 'cycle-day';
    if (p.cycleEnded) {
      cycleInfo.classList.add('cycle-ended');
      cycleInfo.textContent = '⏸ Encerrado';
    } else if (cycleDay === 0) {
      cycleInfo.classList.add('no-bonus');
      cycleInfo.textContent = 'Dia 0';
    } else {
      cycleInfo.textContent = `Dia ${cycleDay}`;
    }

    const cycleGroup = document.createElement('div');
    cycleGroup.className = 'cycle-day-group';

    const editIconBtn = document.createElement('button');
    editIconBtn.type = 'button';
    editIconBtn.className = 'edit-icon-btn' + (p.group ? '' : ' unset');
    editIconBtn.textContent = '📝';
    editIconBtn.title = p.group ? 'Editar plataforma' : 'Configurar nível VIP';
    editIconBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openPlatformManage(p.id);
    });

    cycleGroup.appendChild(cycleInfo);
    cycleGroup.appendChild(editIconBtn);

    header.appendChild(name);
    header.appendChild(cycleGroup);
    li.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'platform-meta';

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

    const totalBadge = document.createElement('span');
    totalBadge.className = 'platform-total-badge';
    totalBadge.style.background = bgColor;
    totalBadge.textContent = formatCurrency(total);

    meta.appendChild(resetInfo);
    meta.appendChild(totalBadge);
    li.appendChild(meta);

    let input = null;
    if (!p.cycleEnded) {
      const form = document.createElement('div');
      form.className = 'platform-deposit-form';

      input = document.createElement('input');
      input.type = 'number';
      input.placeholder = 'Valor do depósito';
      input.min = '0';
      input.step = '0.01';
      input.value = '';

      form.appendChild(input);
      li.appendChild(form);
    }

    const actionButtons = document.createElement('div');
    actionButtons.className = 'platform-actions-buttons';

    const historyBtn = document.createElement('button');
    historyBtn.textContent = 'Histórico';
    historyBtn.style.background = '#2563eb';
    historyBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showHistoryModal(p);
    });

    let btn = null;
    if (!p.cycleEnded) {
      btn = document.createElement('button');
      btn.textContent = 'Adicionar';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const value = parseFloat(input.value);
        if (isNaN(value) || value <= 0) {
          await showAppAlert('Digite um valor válido');
          return;
        }
        p.deposits.push({
          date: new Date().toISOString(),
          value: value
        });
        input.value = '';
        savePlatforms(state.currentUid, state.platforms);
        updateCalendarEvents();
        renderPlatformList(q);
        updateHeroSummary();
      });
    }

    const endBtn = document.createElement('button');
    endBtn.className = 'platform-end-btn' + (p.cycleEnded ? ' already-ended' : '');
    endBtn.textContent = p.cycleEnded ? '⏸ Encerrado' : '🏁 Fim';
    endBtn.disabled = p.cycleEnded;
    endBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const ok = await showAppConfirm(`Encerrar o ciclo de ${p.name}? Os depósitos serão zerados e o calendário ficará pausado até você apertar "Reinício".`);
      if (!ok) return;
      p.deposits = [];
      p.cycleEnded = true;
      savePlatforms(state.currentUid, state.platforms);
      updateCalendarEvents();
      renderPlatformList(q);
      updateHeroSummary();
    });

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reinício';
    resetBtn.style.background = '#ef4444';
    resetBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showResetModal(p, q);
    });

    actionButtons.appendChild(historyBtn);
    if (btn) actionButtons.appendChild(btn);
    actionButtons.appendChild(endBtn);
    actionButtons.appendChild(resetBtn);
    li.appendChild(actionButtons);

    // Seção de apostas — só para plataformas 'com aposta'
    if (p.group === 'com') {
      const betSection = document.createElement('div');
      betSection.className = 'bet-section';

      const betRow = document.createElement('div');
      betRow.className = 'bet-row';

      const todayStr = new Date().toISOString().slice(0, 10);
      const cycleStart = getCycleStart(p, new Date());
      const betDaysInCycle = (p.betDays || []).filter(d => {
        return new Date(d) >= cycleStart;
      });
      const alreadyBetToday = betDaysInCycle.some(d => d.slice(0, 10) === todayStr);

      const betTodayBtn = document.createElement('button');
      betTodayBtn.className = 'bet-today-btn' + (alreadyBetToday ? ' already-bet' : '');
      betTodayBtn.textContent = alreadyBetToday ? '✓ Apostei hoje' : '🎯 Apostei hoje';
      betTodayBtn.disabled = alreadyBetToday;
      betTodayBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (alreadyBetToday) return;
        if (!p.betDays) p.betDays = [];
        p.betDays.push(todayStr);
        savePlatforms(state.currentUid, state.platforms);
        renderPlatformList(q);
        renderVipPanel();
      });

      const betCount = document.createElement('span');
      betCount.className = 'bet-count-badge';
      betCount.textContent = `🎲 ${betDaysInCycle.length} dia(s)`;

      const betManageBtn = document.createElement('button');
      betManageBtn.className = 'bet-manage-btn';
      betManageBtn.textContent = 'Gerenciar';
      betManageBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        showBetModal(p, q);
      });

      betRow.appendChild(betTodayBtn);
      betRow.appendChild(betCount);
      betRow.appendChild(betManageBtn);
      betSection.appendChild(betRow);
      li.appendChild(betSection);
    }

    li.addEventListener('click', (e) => {
      if (e.target === btn || e.target === input || e.target === resetBtn || e.target === historyBtn) return;
      document.querySelectorAll('.platform-item').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      filterCalendarByPlatform(p.id);
    });

    listEl.appendChild(li);
  });

  updateHeroSummary();
}

// ---------- MODAL: HISTÓRICO ----------

const historyModal = document.getElementById('historyModal');
const historyTitle = document.getElementById('historyTitle');
const historyList = document.getElementById('historyList');
const historyCloseBtn = document.getElementById('historyCloseBtn');

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

      const valueSpan = document.createElement('span');
      valueSpan.className = 'history-value';
      valueSpan.textContent = formatCurrency(dep.value);

      itemContent.appendChild(dateSpan);
      itemContent.appendChild(valueSpan);
      item.appendChild(itemContent);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-delete-btn';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showAppConfirm(`Deseja excluir este depósito de ${formatCurrency(dep.value)}?`);
        if (ok) {
          platform.deposits.splice(platform.deposits.indexOf(dep), 1);
          savePlatforms(state.currentUid, state.platforms);
          updateCalendarEvents();
          renderPlatformList(platformSearchEl.value);
          showHistoryModal(platform);
          updateHeroSummary();
        }
      });
      item.appendChild(deleteBtn);

      historyList.appendChild(item);
    });
  }

  historyModal.style.display = 'flex';
}

historyCloseBtn.addEventListener('click', () => {
  historyModal.style.display = 'none';
});

historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) {
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
let currentResetFilter = '';

function showResetModal(platform, filter) {
  currentResetPlatform = platform;
  currentResetFilter = filter;
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

resetConfirmBtn.addEventListener('click', () => {
  if (currentResetPlatform) {
    currentResetPlatform.lastResetDate = `${resetDateInput.value}T00:00:00`;
    currentResetPlatform.cycleEnded = false;
    savePlatforms(state.currentUid, state.platforms);
    updateCalendarEvents();
    renderPlatformList(currentResetFilter);
    updateHeroSummary();
  }
  closeResetModal();
});

resetCancelBtn.addEventListener('click', () => {
  closeResetModal();
});

resetModal.addEventListener('click', (e) => {
  if (e.target === resetModal) closeResetModal();
});

// ---------- MODAL: GERENCIAR APOSTAS ----------

const betModal = document.getElementById('betModal');
const betModalTitle = document.getElementById('betModalTitle');
const betModalClose = document.getElementById('betModalClose');
const betDateInput = document.getElementById('betDateInput');
const betAddConfirm = document.getElementById('betAddConfirm');
const betList = document.getElementById('betList');
let currentBetPlatform = null;
let currentBetFilter = '';

function showBetModal(platform, filter) {
  currentBetPlatform = platform;
  currentBetFilter = filter || '';
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
      renderPlatformList(currentBetFilter);
      renderVipPanel();
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
  renderPlatformList(currentBetFilter);
  renderVipPanel();
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

// ---------- MODAL: GERENCIAR PLATAFORMAS (acordeão) ----------

const platformManageModal = document.getElementById('platformManageModal');
const platformManageCloseBtn = document.getElementById('platformManageCloseBtn');
const platformManageList = document.getElementById('platformManageList');
const platformManageAddRow = document.getElementById('platformManageAddRow');

function renderPlatformManageList(openId) {
  platformManageList.querySelectorAll('.platform-manage-row-existing').forEach(el => el.remove());

  state.platforms.forEach(p => {
    const row = document.createElement('div');
    row.className = 'platform-manage-row platform-manage-row-existing';
    row.dataset.id = p.id;
    if (p.id === openId) row.classList.add('open');

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

    const chevron = document.createElement('span');
    chevron.className = 'platform-manage-chevron';
    chevron.textContent = '▾';

    header.appendChild(title);
    header.appendChild(chevron);
    header.addEventListener('click', () => row.classList.toggle('open'));

    const body = document.createElement('div');
    body.className = 'platform-manage-row-body';

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
      renderPlatformManageList(p.id);
      renderPlatformList(platformSearchEl.value);
      renderVipPanel();
      updateCalendarEvents();
      updateHeroSummary();
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
      renderPlatformManageList();
      renderPlatformList(platformSearchEl.value);
      renderVipPanel();
      updateCalendarEvents();
      updateHeroSummary();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(removeBtn);
    body.appendChild(fields);
    body.appendChild(actions);
    row.appendChild(header);
    row.appendChild(body);
    platformManageList.appendChild(row);
  });
}

platformManageAddRow.querySelector('.platform-manage-row-header')
  .addEventListener('click', () => platformManageAddRow.classList.toggle('open'));

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
    level: levelSelect.value === '' ? null : Number(levelSelect.value),
    group: groupSelect.value === '' ? null : groupSelect.value
  });

  savePlatforms(state.currentUid, state.platforms);
  nameInput.value = '';
  levelSelect.value = '';
  groupSelect.value = '';
  platformManageAddRow.classList.remove('open');

  renderPlatformManageList();
  renderPlatformList(platformSearchEl.value);
  renderVipPanel();
  updateCalendarEvents();
  updateHeroSummary();
});

function openPlatformManage(focusId) {
  renderPlatformManageList(focusId || null);
  platformManageModal.style.display = 'flex';
  if (focusId) {
    requestAnimationFrame(() => {
      const row = platformManageList.querySelector(`.platform-manage-row-existing[data-id="${focusId}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

function closePlatformManage() {
  platformManageModal.style.display = 'none';
}

platformManageCloseBtn.addEventListener('click', closePlatformManage);
platformManageModal.addEventListener('click', (e) => {
  if (e.target === platformManageModal) closePlatformManage();
});

document.getElementById('editPlatformsBtn').addEventListener('click', () => {
  openPlatformManage();
});

// ---------- CONTROLES DO PAINEL (busca, minimizar, ações em massa) ----------

platformSearchEl.addEventListener('input', (e) => {
  renderPlatformList(e.target.value);
});

document.getElementById('allBonusBtn').addEventListener('click', () => {
  document.querySelectorAll('.platform-item').forEach(el => el.classList.remove('selected'));
  showAllBonusCalendar();
});

document.getElementById('resetAllBtn').addEventListener('click', async () => {
  const ok = await showAppConfirm('Resetar todos os depósitos de TODAS as plataformas?');
  if (!ok) return;
  state.platforms.forEach(p => p.deposits = []);
  savePlatforms(state.currentUid, state.platforms);
  renderPlatformList();
  updateCalendarEvents();
  updateHeroSummary();
});

const toggleBtn = document.getElementById('togglePanelBtn');
const minimizeTab = document.getElementById('minimizeTab');

toggleBtn.addEventListener('click', () => {
  platformPanelEl.classList.toggle('minimized');
  minimizeTab.classList.toggle('show');
  toggleBtn.title = platformPanelEl.classList.contains('minimized') ? 'Abrir painel' : 'Minimizar painel';
  minimizeTab.textContent = platformPanelEl.classList.contains('minimized') ? 'Abrir Painel' : 'Fechar Painel';
});

minimizeTab.addEventListener('click', () => {
  platformPanelEl.classList.remove('minimized');
  minimizeTab.classList.remove('show');
  toggleBtn.title = 'Minimizar painel';
  minimizeTab.textContent = 'Abrir Painel';
});
