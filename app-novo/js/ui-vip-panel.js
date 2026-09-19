// === PAINEL DE BÔNUS (Página 3) — SUB-ENTREGA 1: só aba Bônus VIP ===
// Migração pura da lógica que já existia em ui-vip-panel.js (Sistema 1),
// sem nenhuma mudança de comportamento. renderVipPanel/initVipFilters são
// EXATAMENTE as mesmas funções de sempre.
//
// initVipTabs() já é genérico pras 3 abas (Bônus VIP / Obrigado /
// Misterioso) — troca de aba só esconde/mostra um <div> por
// data-tab-panel, sem depender de nenhuma lógica própria de cada aba.
// Por isso ela já fica pronta aqui, mesmo as abas Obrigado e Misterioso
// ainda não tendo função nenhuma nesta sub-entrega — o markup delas em
// view-vip.js é só estático até a próxima sub-entrega editar este arquivo
// e ADICIONAR as funções de Obrigado/Misterioso (initObrigadoPanel,
// initMisteriosoPanel etc.), sem remover nada do que já está aqui.
//
// NENHUMA dependência de vip-obrigado-store.js, vip-misterioso-store.js
// ou misterioso-logic.js nesta sub-entrega — só entram junto com a lógica
// das respectivas abas.

import { state } from './state.js';
import { formatCurrency, escapeHtml, showAppAlert, showAppConfirm } from './utils.js';
import { getVipBonus, computeEmissionDates } from './cycle-logic.js';
import { savePlatform } from './platforms-store.js';
import { loadObrigadoValuePerAppearance, saveObrigadoValuePerAppearance } from './vip-obrigado-store.js';
import { loadMisteriosoTemplates, saveMisteriosoTemplate, deleteMisteriosoTemplate } from './vip-misterioso-store.js';
import { MISTERIOSO_DEPOSIT_THRESHOLDS, getEffectiveMisteriosoValue, isWithinEditableWindow } from './misterioso-logic.js';
import { parseMisteriosoTemplatePaste } from './misterioso-template-import.js';
import { checkAndCloseMonthlyHistory, loadHistoryList } from './vip-history-store.js';

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

// ---------- ABA "BÔNUS VIP" (migração pura — sem nenhuma mudança de lógica) ----------

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
// vez pela view, depois do primeiro mount.
export function initVipFilters() {
  const searchEl = document.getElementById('vipSearch');
  const filterBtns = document.querySelectorAll('.vip-filter-btn');
  let currentGroup = null;

  function apply() {
    renderVipPanel(currentGroup, searchEl ? searchEl.value : '');
  }

  if (searchEl) {
    searchEl.addEventListener('input', apply);

    // Ponto 2.2 (Sistema 1): em telas pequenas, o teclado virtual pode
    // cobrir o campo de busca ao focar. Rola a tela pra deixar o campo no
    // início da área visível assim que ele ganha foco.
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

// ---------- ABA "BÔNUS OBRIGADO" (migração pura — sem nenhuma mudança de lógica) ----------

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

// ---------- ABA "BÔNUS MISTERIOSO" ----------
// Templates (vip-misterioso-store.js) agrupam plataformas que pagam pelos
// MESMOS 8 patamares fixos de depósito (MISTERIOSO_DEPOSIT_THRESHOLDS,
// misterioso-logic.js) — só o intervalo de bônus (min/max) por patamar
// muda de template pra template. Uma plataforma pertence a no máximo UM
// template por vez (exclusividade — Bloco E item 14 — garantida ao
// salvar, ver saveBtn em renderMisteriosoTemplateForm).
//
// Item 5b: nota de clareza explícita sobre o período do "Total do mês" —
// ver renderMisteriosoForecast.
// Item 6: painel de templates com scroll interno (vip.css) — corrige
// corte em tela pequena.
// Item 7: lista de eventos editáveis usa paginação "carregar mais" (4 por
// vez) em vez de mostrar tudo de uma vez.
// Bloco E: "Colar da planilha" (misteriosoPasteInput dentro do form de
// template) preenche os 8 campos min/max de uma vez, via
// parseMisteriosoTemplatePaste — sem mudar a exclusividade já existente.

let misteriosoTemplates = [];
let misteriosoTemplateFormOpen = false;
let misteriosoEditingTemplateId = null; // null = criando novo
let misteriosoTemplateSearch = '';
let misteriosoSelectedPlatformIds = new Set();
let misteriosoForecastMonth = ''; // 'AAAA-MM', default = mês atual
// Item 7: quantos eventos editáveis estão visíveis agora — cresce de 4 em
// 4 ao clicar "Carregar mais". Reseta pra 4 sempre que a lista de eventos
// muda de tamanho total (evento editado sai da janela de 7 dias, etc.)
// pra nunca mostrar um botão "Carregar mais" sem sentido.
let misteriosoVisibleCount = 4;

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function findTemplateForPlatform(platformId) {
  return misteriosoTemplates.find(t => (t.platformIds || []).includes(platformId)) || null;
}

// Carrega os templates do Firestore e faz a primeira renderização —
// chamado uma única vez pela view, depois do login/mount.
export async function initMisteriosoPanel() {
  misteriosoTemplates = await loadMisteriosoTemplates(state.currentUid);
  const now = new Date();
  misteriosoForecastMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  initMisteriosoControls();
  renderMisteriosoPanel();
}

function initMisteriosoControls() {
  const monthInput = document.getElementById('misteriosoMonthInput');
  if (monthInput) {
    monthInput.value = misteriosoForecastMonth;
    monthInput.addEventListener('change', () => {
      misteriosoForecastMonth = monthInput.value || misteriosoForecastMonth;
      renderMisteriosoForecast();
    });
  }

  const manageBtn = document.getElementById('misteriosoManageBtn');
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      misteriosoTemplateFormOpen = !misteriosoTemplateFormOpen;
      if (!misteriosoTemplateFormOpen) {
        misteriosoEditingTemplateId = null;
        misteriosoTemplateSearch = '';
        misteriosoSelectedPlatformIds = new Set();
      }
      manageBtn.textContent = misteriosoTemplateFormOpen ? '✓ Fechar gerenciamento' : '⚙ Gerenciar templates';
      renderMisteriosoTemplateManager();
    });
  }

  renderMisteriosoTemplateManager();
}

function renderMisteriosoPanel() {
  misteriosoVisibleCount = 4;
  renderMisteriosoForecast();
  renderMisteriosoEditableEvents();
}

// ---- Previsão do mês selecionado ----
// Só soma dentro do CICLO ATUAL de cada plataforma (as 5 datas de emissão
// vêm de lastResetDate, não recalculam ciclos passados) — mesma limitação
// já aceita em outras partes do app (ex: calendário), não uma regressão
// nova.
function computeMisteriosoForecast(yearMonth) {
  let total = 0;
  state.platforms.forEach(p => {
    if (p.cycleEnded) return;
    const template = findTemplateForPlatform(p.id);
    if (!template) return;
    computeEmissionDates(p).forEach(date => {
      const key = toDateKey(date);
      if (key.slice(0, 7) === yearMonth) {
        total += getEffectiveMisteriosoValue(p, key, template);
      }
    });
  });
  return total;
}

// Item 5b: nota de clareza — "Previsão do mês" soma o MÊS INTEIRO
// selecionado, não só os eventos da lista de revisão abaixo (que só
// mostra os últimos 7 dias editáveis). São dois recortes diferentes de
// propósito: o total é sobre o mês inteiro, a lista é só uma janela de
// edição recente.
function renderMisteriosoForecast() {
  const totalEl = document.getElementById('misteriosoTotal');
  const noteEl = document.getElementById('misteriosoForecastNote');
  if (!totalEl) return;
  totalEl.textContent = formatCurrency(computeMisteriosoForecast(misteriosoForecastMonth));
  if (noteEl) {
    noteEl.textContent = 'Este total considera o mês inteiro selecionado — a lista abaixo mostra só os eventos dos últimos 7 dias, que ainda podem ser editados.';
  }
}

// ---- Eventos editáveis (hoje + até 7 dias atrás), com paginação (Item 7) ----
function getEditableMisteriosoEvents() {
  const today = new Date();
  const events = [];
  state.platforms.forEach(p => {
    if (p.cycleEnded) return;
    const template = findTemplateForPlatform(p.id);
    if (!template) return;
    computeEmissionDates(p).forEach(date => {
      const key = toDateKey(date);
      if (isWithinEditableWindow(key, today)) {
        events.push({ platform: p, dateKey: key, template });
      }
    });
  });
  events.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return events;
}

function renderMisteriosoEditableEvents() {
  const listEl = document.getElementById('misteriosoEventsList');
  const loadMoreWrap = document.getElementById('misteriosoLoadMoreWrap');
  if (!listEl) return;
  listEl.innerHTML = '';

  const allEvents = getEditableMisteriosoEvents();

  if (allEvents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum evento de Bônus Misterioso nos últimos 7 dias (ou nenhuma plataforma tem um template atribuído ainda).';
    listEl.appendChild(empty);
    if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    return;
  }

  // Item 7: só renderiza os primeiros `misteriosoVisibleCount` — nunca a
  // lista inteira de uma vez. "Carregar mais" soma +4, nunca reconstrói o
  // que já estava visível.
  const visibleEvents = allEvents.slice(0, misteriosoVisibleCount);

  visibleEvents.forEach(({ platform, dateKey, template }) => {
    const row = document.createElement('div');
    row.className = 'misterioso-event-row';

    const label = document.createElement('span');
    label.className = 'misterioso-event-label';
    const [, m, d] = dateKey.split('-');
    label.textContent = `${platform.name} — ${d}/${m}`;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.value = getEffectiveMisteriosoValue(platform, dateKey, template);
    input.className = 'misterioso-event-input';
    input.setAttribute('aria-label', `Bônus Misterioso de ${platform.name} em ${d}/${m}`);
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      if (isNaN(value) || value < 0) {
        input.value = getEffectiveMisteriosoValue(platform, dateKey, template);
        return;
      }
      if (!platform.misteriosoBonusLog) platform.misteriosoBonusLog = [];
      const existing = platform.misteriosoBonusLog.find(e => e.date === dateKey);
      if (existing) {
        existing.value = value;
        existing.edited = true;
      } else {
        platform.misteriosoBonusLog.push({ date: dateKey, value, edited: true });
      }
      savePlatform(state.currentUid, platform);
      renderMisteriosoForecast();
    });
    row.appendChild(input);

    listEl.appendChild(row);
  });

  if (loadMoreWrap) {
    loadMoreWrap.innerHTML = '';
    if (allEvents.length > misteriosoVisibleCount) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'bet-manage-btn';
      loadMoreBtn.textContent = `Carregar mais (${allEvents.length - misteriosoVisibleCount} restante(s))`;
      loadMoreBtn.addEventListener('click', () => {
        misteriosoVisibleCount += 4;
        renderMisteriosoEditableEvents();
      });
      loadMoreWrap.appendChild(loadMoreBtn);
    }
  }
}

// ---- Gerenciamento de templates ----
function renderMisteriosoTemplateManager() {
  const wrap = document.getElementById('misteriosoTemplateManager');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.classList.toggle('app-hidden', !misteriosoTemplateFormOpen);
  if (!misteriosoTemplateFormOpen) return;

  const list = document.createElement('div');
  list.className = 'finance-history';

  if (misteriosoTemplates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum template criado ainda.';
    list.appendChild(empty);
  } else {
    misteriosoTemplates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'finance-week-card';

      const header = document.createElement('div');
      header.className = 'finance-week-card-header';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = `${t.name} — ${(t.platformIds || []).length} plataforma(s)`;
      header.appendChild(titleSpan);

      const actions = document.createElement('div');
      actions.className = 'finance-week-card-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'bet-manage-btn';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        misteriosoEditingTemplateId = t.id;
        misteriosoSelectedPlatformIds = new Set(t.platformIds || []);
        renderMisteriosoTemplateForm();
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'history-delete-btn';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showAppConfirm(`Excluir o template "${t.name}"? As plataformas associadas deixam de ter faixa de Bônus Misterioso até você criar/associar outro template.`);
        if (!ok) return;
        deleteMisteriosoTemplate(state.currentUid, t.id);
        misteriosoTemplates = misteriosoTemplates.filter(tt => tt.id !== t.id);
        renderMisteriosoTemplateManager();
        renderMisteriosoPanel();
      });
      actions.appendChild(deleteBtn);

      header.appendChild(actions);
      card.appendChild(header);
      list.appendChild(card);
    });
  }
  wrap.appendChild(list);

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'bet-manage-btn';
  newBtn.textContent = '+ Novo template';
  newBtn.addEventListener('click', () => {
    misteriosoEditingTemplateId = null;
    misteriosoSelectedPlatformIds = new Set();
    misteriosoTemplateSearch = '';
    renderMisteriosoTemplateForm();
  });
  wrap.appendChild(newBtn);

  const formWrap = document.createElement('div');
  formWrap.id = 'misteriosoTemplateForm';
  wrap.appendChild(formWrap);
}

function renderMisteriosoTemplateForm() {
  const formWrap = document.getElementById('misteriosoTemplateForm');
  if (!formWrap) return;
  formWrap.innerHTML = '';

  const editingTemplate = misteriosoEditingTemplateId
    ? misteriosoTemplates.find(t => t.id === misteriosoEditingTemplateId)
    : null;

  const wrap = document.createElement('div');
  wrap.className = 'obrigado-add-form'; // reaproveita o visual do formulário do Bônus Obrigado

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nome do template (ex: Padrão A)';
  nameInput.value = editingTemplate ? editingTemplate.name : '';
  wrap.appendChild(nameInput);

  const tiersWrap = document.createElement('div');
  tiersWrap.className = 'misterioso-tiers-grid';
  const rangeInputs = [];
  MISTERIOSO_DEPOSIT_THRESHOLDS.forEach((threshold, i) => {
    const row = document.createElement('div');
    row.className = 'misterioso-tier-row';

    const label = document.createElement('span');
    label.className = 'misterioso-tier-label';
    label.textContent = formatCurrency(threshold);
    row.appendChild(label);

    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.step = '0.01';
    minInput.min = '0';
    minInput.placeholder = 'Mín.';
    minInput.value = editingTemplate ? editingTemplate.bonusRanges[i].min : '';
    row.appendChild(minInput);

    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.step = '0.01';
    maxInput.min = '0';
    maxInput.placeholder = 'Máx.';
    maxInput.value = editingTemplate ? editingTemplate.bonusRanges[i].max : '';
    row.appendChild(maxInput);

    rangeInputs.push({ minInput, maxInput });
    tiersWrap.appendChild(row);
  });
  wrap.appendChild(tiersWrap);

  // === Bloco E — "Colar da planilha" ===
  // Preenche os 8 pares min/max acima de uma vez, via
  // parseMisteriosoTemplatePaste. Não muda a exclusividade (que continua
  // resolvida só no saveBtn, abaixo) — só evita digitar 16 campos à mão.
  const pasteToggleBtn = document.createElement('button');
  pasteToggleBtn.type = 'button';
  pasteToggleBtn.className = 'bet-manage-btn';
  pasteToggleBtn.textContent = '📋 Colar da planilha';
  wrap.appendChild(pasteToggleBtn);

  const pasteWrap = document.createElement('div');
  pasteWrap.className = 'obrigado-add-form app-hidden';
  pasteWrap.style.margin = '0';

  const pasteNote = document.createElement('p');
  pasteNote.className = 'finance-close-week-note';
  pasteNote.textContent = `Cole exatamente ${MISTERIOSO_DEPOSIT_THRESHOLDS.length} linhas, uma por patamar (na mesma ordem de cima: ${MISTERIOSO_DEPOSIT_THRESHOLDS.map(formatCurrency).join(', ')}), cada linha com Mínimo e Máximo separados por tab ou espaço.`;
  pasteWrap.appendChild(pasteNote);

  const pasteInput = document.createElement('textarea');
  pasteInput.className = 'finance-spreadsheet-paste';
  pasteInput.rows = 8;
  pasteInput.placeholder = 'Cole aqui (Ctrl+V) os 8 pares Mínimo/Máximo...';
  pasteInput.setAttribute('aria-label', 'Colar dados dos 8 patamares');
  pasteWrap.appendChild(pasteInput);

  const pasteApplyBtn = document.createElement('button');
  pasteApplyBtn.type = 'button';
  pasteApplyBtn.className = 'btn-confirm';
  pasteApplyBtn.textContent = 'Aplicar';
  pasteApplyBtn.addEventListener('click', async () => {
    const result = parseMisteriosoTemplatePaste(pasteInput.value);
    if (!result.ok) {
      await showAppAlert(result.error);
      return;
    }
    result.bonusRanges.forEach((range, i) => {
      rangeInputs[i].minInput.value = range.min;
      rangeInputs[i].maxInput.value = range.max;
    });
    pasteWrap.classList.add('app-hidden');
    pasteInput.value = '';
  });
  pasteWrap.appendChild(pasteApplyBtn);

  pasteToggleBtn.addEventListener('click', () => {
    pasteWrap.classList.toggle('app-hidden');
  });

  wrap.appendChild(pasteWrap);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Buscar plataforma';
  searchInput.value = misteriosoTemplateSearch;
  searchInput.addEventListener('input', (e) => {
    misteriosoTemplateSearch = e.target.value;
    renderMisteriosoTemplatePlatformList();
  });
  wrap.appendChild(searchInput);

  const listWrap = document.createElement('div');
  listWrap.id = 'misteriosoTemplatePlatformList';
  listWrap.className = 'obrigado-add-platform-list';
  wrap.appendChild(listWrap);

  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-confirm';
  saveBtn.textContent = editingTemplate ? 'Salvar alterações' : 'Criar template';
  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      await showAppAlert('Digite um nome pro template.');
      return;
    }
    const bonusRanges = rangeInputs.map(({ minInput, maxInput }) => {
      const min = parseFloat(minInput.value);
      const max = parseFloat(maxInput.value);
      return { min: isNaN(min) ? 0 : min, max: isNaN(max) ? 0 : max };
    });

    const id = misteriosoEditingTemplateId || ('mt' + Date.now());

    // Bloco E — Item 14 — exclusividade: uma plataforma só pertence a UM
    // template por vez — remove das outras antes de salvar esta.
    misteriosoTemplates.forEach(t => {
      if (t.id === id) return;
      const filtered = (t.platformIds || []).filter(pid => !misteriosoSelectedPlatformIds.has(pid));
      if (filtered.length !== (t.platformIds || []).length) {
        t.platformIds = filtered;
        saveMisteriosoTemplate(state.currentUid, t);
      }
    });

    const platformIds = [...misteriosoSelectedPlatformIds];
    saveMisteriosoTemplate(state.currentUid, { id, name, bonusRanges, platformIds });

    const newTemplate = { id, name, bonusRanges, platformIds };
    if (misteriosoEditingTemplateId) {
      misteriosoTemplates = misteriosoTemplates.map(t => t.id === id ? newTemplate : t);
    } else {
      misteriosoTemplates.push(newTemplate);
    }

    misteriosoEditingTemplateId = null;
    misteriosoSelectedPlatformIds = new Set();
    misteriosoTemplateSearch = '';
    renderMisteriosoTemplateManager();
    renderMisteriosoPanel();
  });
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel-modal';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    misteriosoEditingTemplateId = null;
    misteriosoSelectedPlatformIds = new Set();
    misteriosoTemplateSearch = '';
    formWrap.innerHTML = '';
  });
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  formWrap.appendChild(wrap);
  renderMisteriosoTemplatePlatformList();
}

function renderMisteriosoTemplatePlatformList() {
  const listWrap = document.getElementById('misteriosoTemplatePlatformList');
  if (!listWrap) return;

  const q = misteriosoTemplateSearch.trim().toLowerCase();
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
    checkbox.checked = misteriosoSelectedPlatformIds.has(p.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) misteriosoSelectedPlatformIds.add(p.id);
      else misteriosoSelectedPlatformIds.delete(p.id);
    });

    const span = document.createElement('span');
    span.textContent = p.name;

    label.appendChild(checkbox);
    label.appendChild(span);
    listWrap.appendChild(label);
  });
}

// ---------- ABA "HISTÓRICO MENSAL" (Bloco A) ----------
// Chamada por último no mount() da view (view-vip.js), depois de
// initObrigadoPanel/initMisteriosoPanel já terem carregado
// obrigadoValuePerAppearance e misteriosoTemplates — reaproveita esses 2
// valores de módulo em vez de recarregar do Firestore de novo.

function formatYearMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1]} de ${y}`;
}

function buildHistoryMonthCard(entry) {
  const card = document.createElement('div');
  card.className = 'finance-week-card';

  const header = document.createElement('div');
  header.className = 'finance-week-card-header';
  header.innerHTML = `<span>${formatYearMonthLabel(entry.yearMonth)}</span>`;
  card.appendChild(header);

  const vipStats = document.createElement('div');
  vipStats.className = 'finance-stats-grid';
  vipStats.innerHTML = `
    <div class="finance-stat"><span class="finance-stat-label">Diário Com</span><span class="finance-stat-value">${formatCurrency(entry.vip.dailyCom)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Diário Sem</span><span class="finance-stat-value">${formatCurrency(entry.vip.dailySem)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Semanal Com</span><span class="finance-stat-value">${formatCurrency(entry.vip.weeklyCom)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Semanal Sem</span><span class="finance-stat-value">${formatCurrency(entry.vip.weeklySem)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Mensal Com</span><span class="finance-stat-value">${formatCurrency(entry.vip.monthlyCom)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Mensal Sem</span><span class="finance-stat-value">${formatCurrency(entry.vip.monthlySem)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Total VIP</span><span class="finance-stat-value positive">${formatCurrency(entry.vip.total)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Obrigado</span><span class="finance-stat-value">${formatCurrency(entry.obrigado.total)}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Incidências</span><span class="finance-stat-value">${entry.obrigado.incidencias}</span></div>
    <div class="finance-stat"><span class="finance-stat-label">Misterioso</span><span class="finance-stat-value">${formatCurrency(entry.misterioso)}</span></div>
  `;
  card.appendChild(vipStats);

  return card;
}

async function renderHistoryList() {
  const listEl = document.getElementById('vipHistoryList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="history-empty">Carregando histórico...</div>';

  const list = await loadHistoryList(state.currentUid);

  listEl.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum mês fechado ainda — o primeiro mês completo desde que esta funcionalidade existe é fechado automaticamente na próxima virada de mês.';
    listEl.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'finance-history';
  list.forEach(entry => wrap.appendChild(buildHistoryMonthCard(entry)));
  listEl.appendChild(wrap);
}

// Chamada uma única vez no mount() da view, depois das outras 2 abas
// terem carregado seus dados (obrigadoValuePerAppearance,
// misteriosoTemplates — variáveis de módulo já preenchidas nesse ponto).
export async function initHistoryTab() {
  await checkAndCloseMonthlyHistory(
    state.currentUid,
    state.platforms,
    misteriosoTemplates,
    obrigadoValuePerAppearance
  );
  await renderHistoryList();
}
