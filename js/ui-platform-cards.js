// === GRID DE CARDS DE FILTRO — Página 2 (calendário) ===
// Cada card mostra nome + "Dia X" (mesmo badge usado em toda a aplicação,
// ver panel.css) e clicar nele filtra o calendário — mesmo comportamento
// de sempre (filterCalendarByPlatform / showAllBonusCalendar). Sem botões
// de ação: aqui é só filtro visual, as ações do dia a dia moraram pra
// Página 4.
import { state } from './state.js';
import { getCurrentCycleDay } from './cycle-logic.js';
import { sortPlatforms } from './platform-sort.js';
import { filterCalendarByPlatform, showAllBonusCalendar } from './ui-calendar.js';
import { initSortMenu } from './ui-sort.js';

let currentFilter = '';
let currentSortMode = null;
let selectedId = null; // null = ALL selecionado

function cycleDayBadge(platform) {
  if (platform.cycleEnded) {
    return `<span class="cycle-day cycle-ended">⏸ Encerrado</span>`;
  }
  const day = getCurrentCycleDay(platform);
  if (day === 0) {
    return `<span class="cycle-day no-bonus">Dia 0</span>`;
  }
  return `<span class="cycle-day">Dia ${day}</span>`;
}

export function renderPlatformCards(filter = currentFilter, sortMode = currentSortMode) {
  currentFilter = filter;
  currentSortMode = sortMode;

  const gridEl = document.getElementById('pcardsGrid');
  if (!gridEl) return;

  const q = filter.trim().toLowerCase();
  let list = state.platforms.filter(p => p.name.toLowerCase().includes(q));
  if (sortMode) list = sortPlatforms(list, sortMode);

  const allCard = document.createElement('button');
  allCard.type = 'button';
  allCard.className = 'pcard all-card' + (selectedId === null ? ' selected' : '');
  allCard.innerHTML = `<span class="name">ALL</span><span class="cycle-day">Todas</span>`;
  allCard.addEventListener('click', () => {
    selectedId = null;
    showAllBonusCalendar();
    renderPlatformCards();
  });

  gridEl.innerHTML = '';
  gridEl.appendChild(allCard);

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pcards-empty';
    empty.textContent = 'Nenhuma plataforma encontrada.';
    gridEl.appendChild(empty);
    return;
  }

  list.forEach(p => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pcard' + (selectedId === p.id ? ' selected' : '');
    card.dataset.id = p.id;
    card.innerHTML = `<span class="name">${p.name}</span>${cycleDayBadge(p)}`;
    card.addEventListener('click', () => {
      selectedId = p.id;
      filterCalendarByPlatform(p.id);
      renderPlatformCards();
    });
    gridEl.appendChild(card);
  });
}

// Liga busca + dropdown "Ordenar". Chamado uma única vez pelo main-calendario.js.
export function initPlatformCardsControls() {
  const searchEl = document.getElementById('pcardsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => renderPlatformCards(e.target.value, currentSortMode));
  }

  initSortMenu({
    buttonId: 'pcardsSortBtn',
    dropdownId: 'pcardsSortDropdown',
    // Página 2: TODOS os itens do menu só reordenam, nada é escondido.
    onChange: (mode) => renderPlatformCards(currentFilter, mode)
  });
}
