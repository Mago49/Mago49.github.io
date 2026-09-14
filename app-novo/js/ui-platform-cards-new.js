// === GRID DE CARDS DE FILTRO — Página 2 (calendário) ===
// Cada card mostra nome + "Dia X" (mesmo badge usado em toda a aplicação,
// ver panel.css) e clicar nele filtra o calendário — mesmo comportamento
// de sempre (filterCalendarByPlatform / showAllBonusCalendar). Sem botões
// de ação: aqui é só filtro visual, as ações do dia a dia moraram pra
// Página 4.
//
// === BLOCO L — PERSONALIZAÇÃO DE CARDS (novo) ===
// Antes de desenhar cada card, consulta getCachedCardCustomization() (já
// carregado no mount() da view — ver view-calendario.js) e aplica, se
// existir:
//   - cor: fundo = hex escolhido, borda = darkenColor(hex) (tom mais
//     escuro da própria cor, sem precisar de uma segunda cor salva),
//     texto do nome em preto (#000) — só quando há cor customizada; sem
//     ela, o card mantém o visual padrão de sempre.
//   - marcador: um <span class="pcard-marker"> com o emoji, ancorado no
//     canto superior direito do card (position:relative é aplicado aqui
//     via JS no próprio elemento, sem precisar editar platform-cards.css).
// PURAMENTE ESTÉTICO — nenhuma relação com colorForLevel()/LEVEL_INFO
// (cycle-logic.js) nem com a lógica de ordenação (platform-sort.js), que
// seguem exatamente como estavam.
import { state } from './state.js';
import { getCurrentCycleDay } from './cycle-logic.js';
import { sortPlatforms } from './platform-sort.js';
import { filterCalendarByPlatform, showAllBonusCalendar } from './ui-calendar.js';
import { initSortMenu } from './ui-sort.js';
import { getCachedCardCustomization } from './card-customization-store.js';
import { darkenColor } from './color-palette.js';

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

// Aplica cor de fundo/borda/texto e o marcador de emoji num card já
// construído, se a plataforma tiver personalização salva. Não faz nada
// (mantém o visual padrão) quando não há customização pra essa
// plataforma.
function applyCardCustomization(card, platform) {
  const customization = getCachedCardCustomization();
  const colorEntry = customization.colors ? customization.colors[platform.id] : null;
  const marker = customization.markers ? customization.markers[platform.id] : null;

  if (colorEntry && colorEntry.hex) {
    card.style.background = colorEntry.hex;
    card.style.borderColor = darkenColor(colorEntry.hex);
    const nameEl = card.querySelector('.name');
    if (nameEl) nameEl.style.color = '#000';
  }

  if (marker) {
    card.style.position = 'relative';
    const markerEl = document.createElement('span');
    markerEl.className = 'pcard-marker';
    markerEl.textContent = marker;
    card.appendChild(markerEl);
  }
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
    applyCardCustomization(card, p);
    gridEl.appendChild(card);
  });
}

// Liga busca + dropdown "Ordenar". Retorna uma função de cleanup —
// repassa o cleanup de initSortMenu() pra quem montou a view poder
// desligar o listener global no unmount() (ver ui-sort.js).
export function initPlatformCardsControls() {
  const searchEl = document.getElementById('pcardsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => renderPlatformCards(e.target.value, currentSortMode));
  }

  return initSortMenu({
    buttonId: 'pcardsSortBtn',
    dropdownId: 'pcardsSortDropdown',
    onChange: (mode) => renderPlatformCards(currentFilter, mode)
  });
}

// Zera o estado de módulo (busca, ordenação, seleção). Necessário só na
// SPA: sair da rota Calendário e voltar NÃO reseta essas variáveis
// sozinho, já que o módulo é importado uma única vez pra vida inteira da
// aplicação. Chamada por view-calendario.js, no início do mount(), antes
// de initPlatformCardsControls().
export function resetPlatformCardsFilters() {
  currentFilter = '';
  currentSortMode = null;
  selectedId = null;
}
