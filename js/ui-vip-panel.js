// === PAINEL DE BÔNUS (Página 3) ===
// Reestruturado em 3 abas (Ponto 7.1): Bônus VIP, Bônus Obrigado e Bônus
// Misterioso — trocar de aba só esconde/mostra um <div>, sem navegar de
// URL. Cada aba tem seu próprio estado de módulo, sem interferir uma na
// outra.
//
// BÔNUS VIP (Ponto 7.2): renderVipPanel/initVipFilters são EXATAMENTE as
// mesmas funções de sempre, só realocadas pra dentro da primeira aba —
// nenhuma linha de lógica mudou aqui.
//
// BÔNUS OBRIGADO (Ponto 7.3): usa o novo campo `platform.obrigadoDays`
// (dias FIXOS do mês, 1-31, que se repetem todo mês — ver
// platforms-store.js). Os cards "Dia X" NUNCA são gravados como
// estrutura própria: são sempre recalculados a partir de obrigadoDays de
// cada plataforma, então nunca podem dessincronizar. O valor de
// referência por aparição é persistido em Firestore, isolado do resto
// (ver vip-obrigado-store.js) — nunca toca na coleção `platforms` nem no
// doc-sentinela.
//
// BÔNUS MISTERIOSO (Ponto 7.4): reservado pra uma próxima etapa — a aba
// existe só como placeholder "em construção" por enquanto.

import { state } from './state.js';
import { formatCurrency, escapeHtml, showAppAlert } from './utils.js';
import { getVipBonus } from './cycle-logic.js';
import { savePlatform } from './platforms-store.js';
import { loadObrigadoValuePerAppearance, saveObrigadoValuePerAppearance } from './vip-obrigado-store.js';

// ---------- ABAS (Ponto 7.1) ----------

let activeTab = 'vip';

export function initVipTabs() {
  const tabButtons = document.querySelectorAll('.vip-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      applyActiveTab();
    });
  });
  applyActiveTab();
}

function applyActiveTab() {
  document.querySelectorAll('.vip-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  document.querySelectorAll('.vip-tab-panel').forEach(panel => {
    panel.classList.toggle('app-hidden', panel.dataset.tabPanel !== activeTab);
  });
}

// ---------- ABA "BÔNUS VIP" (Ponto 7.2 — sem nenhuma mudança de lógica) ----------

// filterGroup: null (ALL) | 'com' | 'sem'
// searchTerm: filtra por nome, case-insensitive
export function renderVipPanel(filterGroup = null, searchTerm = '') {
  const totalsEl = document.getElementById('vipTotals');
  const summaryEl = document.getElementById('vipSummary');
  if (!totalsEl || !summaryEl) return;

  const q = searchTerm.trim().toLowerCase();

  const vipList = state.platforms.filter(p => {
    if (p.group !== 'com' && p.group !== 'sem') return false;
    if (filterGroup && p.group !== filterGroup) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const totals = vipList.reduce((acc, platform) => {
    const bonus = getVipBonus(platform);
    acc.daily += bonus.daily;
    acc.weekly += bonus.weekly;
    acc.monthly += bonus.monthly;
    acc.total += bonus.total;
    return acc;
  }, { daily: 0, weekly: 0, monthly: 0, total: 0 });

  totalsEl.innerHTML = `
    <div class="vip-total-box"><span class="vip-total-label">Diário</span><span class="vip-total-value">${formatCurrency(totals.daily)}</span></div>
    <div class="vip-total-box"><span class="vip-total-label">Semanal</span><span class="vip-total-value">${formatCurrency(totals.weekly)}</span></div>
    <div class="vip-total-box"><span class="vip-total-label">Mensal</span><span class="vip-total-value">${formatCurrency(totals.monthly)}</span></div>
    <div class="vip-total-box"><span class="vip-total-label">Total</span><span class="vip-total-value">${formatCurrency(totals.total)}</span></div>
  `;

  if (vipList.length === 0) {
    summaryEl.innerHTML = '<div class="history-empty">Nenhuma plataforma encontrada.</div>';
    return;
  }

  summaryEl.innerHTML = vipList.map((platform) => {
    const bonus = getVipBonus(platform);
    const groupLabel = platform.group === 'com' ? 'Com aposta' : 'Sem aposta';
    const groupClass = platform.group === 'com' ? 'group-com' : 'group-sem';
    // Nome digitado pelo usuário: escapado antes de entrar no innerHTML,
    // pra um "<" ou "&" no código da plataforma não virar HTML sem querer.
    const safeName = escapeHtml(platform.name);

    return `
      <article class="vip-item">
        <div class="vip-item-header">
          <div class="vip-code">${safeName}</div>
          <div class="vip-badges">
            <span class="vip-badge level">VIP ${platform.level}</span>
            <span class="vip-badge ${groupClass}">${groupLabel}</span>
          </div>
        </div>
        <div class="vip-breakdown">
          <div class="vip-box"><span class="vip-box-title">Diário</span><span class="vip-box-value">${formatCurrency(bonus.daily)}</span></div>
          <div class="vip-box"><span class="vip-box-title">Semanal</span><span class="vip-box-value">${formatCurrency(bonus.weekly)}</span></div>
          <div class="vip-box"><span class="vip-box-title">Mensal</span><span class="vip-box-value">${formatCurrency(bonus.monthly)}</span></div>
          <div class="vip-box"><span class="vip-box-title">Total</span><span class="vip-box-value">${formatCurrency(bonus.total)}</span></div>
        </div>
        <div class="vip-total-line">Soma do bônus: ${formatCurrency(bonus.total)}</div>
      </article>
    `;
  }).join('');
}

// Liga busca + os 3 botões de filtro (ALL / COM / SEM). Chamado uma única
// vez pelo main-vip.js, depois do primeiro login.
export function initVipFilters() {
  const searchEl = document.getElementById('vipSearch');
  const filterBtns = document.querySelectorAll('.vip-filter-btn');
  let currentGroup = null;

  function apply() {
    renderVipPanel(currentGroup, searchEl ? searchEl.value : '');
  }

  if (searchEl) {
    searchEl.addEventListener('input', apply);

    // Ponto 2.2: em telas pequenas, o teclado virtual pode cobrir o campo
    // de busca ao focar (ver print do usuário — o card de plataforma
    // ficava colado no topo, sem espaço pro campo). Rola a tela pra deixar
    // o campo no início da área visível assim que ele ganha foco.
    searchEl.addEventListener('focus', () => {
      searchEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const value = btn.dataset.group;
      currentGroup = value === 'all' ? null : value;
      apply();
    });
  });
}

// ---------- ABA "BÔNUS OBRIGADO" (Ponto 7.3) ----------

let obrigadoValuePerAppearance = 0.30;
let obrigadoEditMode = false;
let obrigadoAddSearch = '';
let obrigadoSelectedIds = new Set();

export async function initObrigadoPanel() {
  obrigadoValuePerAppearance = await loadObrigadoValuePerAppearance(state.currentUid);
  initObrigadoControls();
  renderObrigadoPanel();
}

function initObrigadoControls() {
  const editBtn = document.getElementById('obrigadoEditBtn');
  const valueInput = document.getElementById('obrigadoValueInput');

  if (valueInput) {
    valueInput.value = obrigadoValuePerAppearance;
    valueInput.addEventListener('change', () => {
      const value = parseFloat(valueInput.value);
      if (isNaN(value) || value < 0) {
        valueInput.value = obrigadoValuePerAppearance;
        return;
      }
      obrigadoValuePerAppearance = value;
      saveObrigadoValuePerAppearance(state.currentUid, value);
      renderObrigadoPanel();
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      obrigadoEditMode = !obrigadoEditMode;
      editBtn.textContent = obrigadoEditMode ? '✓ Concluir edição' : '✏️ Editar';
      editBtn.classList.toggle('active', obrigadoEditMode);
      if (!obrigadoEditMode) {
        obrigadoAddSearch = '';
        obrigadoSelectedIds = new Set();
      }
      renderObrigadoAddForm();
      renderObrigadoPanel();
    });
  }

  renderObrigadoAddForm();
}

export function renderObrigadoPanel() {
  const totalEl = document.getElementById('obrigadoTotal');
  const gridEl = document.getElementById('obrigadoGrid');
  if (!totalEl || !gridEl) return;

  const platformsWithDays = state.platforms.filter(p => (p.obrigadoDays || []).length > 0);
  const totalAppearances = platformsWithDays.reduce((sum, p) => sum + p.obrigadoDays.length, 0);
  const total = totalAppearances * obrigadoValuePerAppearance;
  totalEl.textContent = formatCurrency(total);

  const dayMap = new Map();
  platformsWithDays.forEach(p => {
    p.obrigadoDays.forEach(day => {
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day).push(p);
    });
  });

  const sortedDays = [...dayMap.keys()].sort((a, b) => a - b);

  gridEl.innerHTML = '';

  if (sortedDays.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum dia cadastrado ainda. Clique em "Editar" pra começar.';
    gridEl.appendChild(empty);
    return;
  }

  sortedDays.forEach(day => {
    const card = document.createElement('div');
    card.className = 'obrigado-day-card';

    const header = document.createElement('div');
    header.className = 'obrigado-day-card-header';
    header.textContent = `Dia ${day}`;
    card.appendChild(header);

    const list = document.createElement('div');
    list.className = 'obrigado-day-card-platforms';

    dayMap.get(day).forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'obrigado-platform-chip';

      const chipLabel = document.createElement('span');
      chipLabel.textContent = p.name;
      chip.appendChild(chipLabel);

      if (obrigadoEditMode) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'obrigado-chip-remove';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `Remover ${p.name} do dia ${day}`);
        removeBtn.addEventListener('click', () => {
          p.obrigadoDays = p.obrigadoDays.filter(d => d !== day);
          savePlatform(state.currentUid, p);
          renderObrigadoPanel();
        });
        chip.appendChild(removeBtn);
      }

      list.appendChild(chip);
    });

    card.appendChild(list);
    gridEl.appendChild(card);
  });
}

function renderObrigadoAddForm() {
  const wrap = document.getElementById('obrigadoAddForm');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.classList.toggle('app-hidden', !obrigadoEditMode);
  if (!obrigadoEditMode) return;

  const note = document.createElement('p');
  note.className = 'finance-close-week-note';
  note.textContent = 'Escolha o dia do mês e selecione as plataformas que pagam Bônus Obrigado nesse dia. Pra remover, use o "×" ao lado do código de cada plataforma nos cards abaixo.';
  wrap.appendChild(note);

  const dayRow = document.createElement('div');
  dayRow.className = 'finance-entry-form';
  const dayInput = document.createElement('input');
  dayInput.type = 'number';
  dayInput.min = '1';
  dayInput.max = '31';
  dayInput.placeholder = 'Dia do mês (1-31)';
  dayInput.setAttribute('aria-label', 'Dia do mês');
  dayRow.appendChild(dayInput);
  wrap.appendChild(dayRow);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Buscar plataforma';
  searchInput.setAttribute('aria-label', 'Buscar plataforma');
  searchInput.value = obrigadoAddSearch;
  searchInput.addEventListener('input', (e) => {
    obrigadoAddSearch = e.target.value;
    renderObrigadoAddPlatformList();
  });
  wrap.appendChild(searchInput);

  const listWrap = document.createElement('div');
  listWrap.id = 'obrigadoAddPlatformList';
  listWrap.className = 'obrigado-add-platform-list';
  wrap.appendChild(listWrap);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-confirm';
  saveBtn.textContent = 'Adicionar dia às selecionadas';
  saveBtn.addEventListener('click', async () => {
    const day = parseInt(dayInput.value, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      await showAppAlert('Digite um dia válido (1 a 31).');
      return;
    }
    if (obrigadoSelectedIds.size === 0) {
      await showAppAlert('Selecione ao menos uma plataforma.');
      return;
    }
    obrigadoSelectedIds.forEach(id => {
      const platform = state.platforms.find(pp => pp.id === id);
      if (!platform) return;
      if (!platform.obrigadoDays) platform.obrigadoDays = [];
      if (!platform.obrigadoDays.includes(day)) {
        platform.obrigadoDays.push(day);
        savePlatform(state.currentUid, platform);
      }
    });
    obrigadoSelectedIds = new Set();
    dayInput.value = '';
    renderObrigadoAddPlatformList();
    renderObrigadoPanel();
  });
  actions.appendChild(saveBtn);
  wrap.appendChild(actions);

  renderObrigadoAddPlatformList();
}

function renderObrigadoAddPlatformList() {
  const listWrap = document.getElementById('obrigadoAddPlatformList');
  if (!listWrap) return;

  const q = obrigadoAddSearch.trim().toLowerCase();
  const list = state.platforms.filter(p => p.name.toLowerCase().includes(q));

  listWrap.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    listWrap.appendChild(empty);
    return;
  }

  list.forEach(p => {
    const label = document.createElement('label');
    label.className = 'obrigado-checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = obrigadoSelectedIds.has(p.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) obrigadoSelectedIds.add(p.id);
      else obrigadoSelectedIds.delete(p.id);
    });

    const span = document.createElement('span');
    span.textContent = p.name;

    label.appendChild(checkbox);
    label.appendChild(span);
    listWrap.appendChild(label);
  });
}
