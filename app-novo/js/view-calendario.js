// === VIEW: Calendário (Página 2) ===
// mount()/unmount() chamados pelo router a cada troca de rota. Reaproveita
// 100% da lógica que já existia em main-calendario.js — muda só ONDE o
// HTML é escrito (container recebido do router) e GANHA um unmount() de
// verdade, que não existia no Sistema 1 (lá a página nunca era
// desmontada, só recarregada do zero pelo navegador).
//
// TRÊS CUIDADOS NOVOS, exclusivos da SPA:
//
// 1) Instância do FullCalendar (state.calendar): sem destroy() no
//    unmount(), sair e voltar a esta rota várias vezes acumularia
//    instâncias fantasmas rodando em paralelo.
//
// 2) Timer da virada do dia (dailyTimer): sem clearTimeout() no
//    unmount(), cada visita à rota empilharia um setTimeout que nunca
//    morre — múltiplos refreshPage() disparando juntos à meia-noite.
//
// 3) Listener global do menu "Ordenar" (ver ui-sort.js): initSortMenu()
//    registra um document.addEventListener que, sem cleanup, também se
//    acumularia a cada visita à rota. initPlatformCardsControls() repassa
//    o cleanup de initSortMenu(); guardamos aqui e disparamos no
//    unmount().
//
// FULLCALENDAR VIA CDN: o JS é carregado SOB DEMANDA (lazy), só quando
// esta view monta pela primeira vez — não fica no <head> global do
// shell. O CSS do FullCalendar é leve e fica global (ver index.html),
// mas o JS é pesado e as outras 4 views nunca usam — carregar globalmente
// contrariaria o próprio cuidado já documentado no Sistema 1
// (main-inicio.js: "não carrega a biblioteca FullCalendar, economizando
// peso à toa"). Cacheado via fullCalendarLoadPromise — baixa uma única
// vez por sessão, mesmo entrando e saindo da rota repetidas vezes.
//
// FOOTER/LEGENDA (#appFooter): só esta página tem legenda fixa. Criada
// dinamicamente aqui no mount() e removida no unmount() (Opção A). A
// classe "has-legend" (reserva espaço embaixo, ver footer.css) é
// aplicada/removida em #appMain junto com o footer.

import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderLegend } from './ui-hero.js';
import { createCalendar, updateCalendarEvents, scrollToCurrentWeek } from './ui-calendar.js';
import { renderPlatformCards, initPlatformCardsControls, resetPlatformCardsFilters } from './ui-platform-cards.js';

let dailyTimer = null;
let footerEl = null;
let fullCalendarLoadPromise = null;
let sortMenuCleanup = null;

function loadFullCalendarScript() {
  if (window.FullCalendar) return Promise.resolve();
  if (fullCalendarLoadPromise) return fullCalendarLoadPromise;

  fullCalendarLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar FullCalendar'));
    document.head.appendChild(script);
  });

  return fullCalendarLoadPromise;
}

function refreshPage() {
  updateCalendarEvents(() => renderLegend(computeHeroStats(state.platforms)));
  renderPlatformCards();
}

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    refreshPage();
    scheduleDailyUpdate();
  }, ms);
}

export async function mount(container) {
  // Item 26j: sem subtítulo. Item 26k: novo título. Nav não entra aqui —
  // já é global (top-nav do shell, index.html), sempre acima de
  // qualquer view (resolve o Item 26l automaticamente).
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h1>🃏 Calendário do Bônus Misterioso</h1>
      </div>
    </div>

    <section class="card-shell" aria-label="Calendário de bônus">
      <div class="calendar-toolbar">
        <span class="pill">📅 Visual mensal, semanal e diária</span>
        <span class="pill">🎯 Cores por nível automático</span>
        <span class="pill">⚡ Atualização local instantânea</span>
      </div>
      <div id="calendar"></div>
    </section>

    <section class="card-shell pcards-section" aria-label="Filtro de plataformas">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Plataformas</h2>
          <p>Clique numa plataforma para ver só os bônus dela no calendário.</p>
        </div>
      </div>

      <div class="pcards-toolbar">
        <input type="search" id="pcardsSearch" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
        <div class="sort-menu">
          <button type="button" id="pcardsSortBtn" class="sort-menu-toggle" aria-expanded="false">⇅ Ordenar</button>
          <div class="sort-menu-dropdown" id="pcardsSortDropdown"></div>
        </div>
      </div>

      <div class="pcards-grid" id="pcardsGrid"></div>
    </section>
  `;

  // Footer/legenda (Opção A): position:fixed cuida do posicionamento
  // independente de onde o nó está no DOM; anexado ao body.
  footerEl = document.createElement('footer');
  footerEl.className = 'legend';
  footerEl.id = 'appFooter';
  document.body.appendChild(footerEl);
  document.getElementById('appMain')?.classList.add('has-legend');

  // Zera filtro/busca/seleção de uma visita anterior — ver nota em
  // ui-platform-cards.js (resetPlatformCardsFilters).
  resetPlatformCardsFilters();

  await loadFullCalendarScript();

  createCalendar();
  sortMenuCleanup = initPlatformCardsControls();
  refreshPage();
  // Só na abertura da view, uma única vez — nunca dentro de
  // scheduleDailyUpdate(), pra não forçar scroll indesejado se a virada
  // do dia acontecer enquanto alguém já está navegando.
  scrollToCurrentWeek();
  scheduleDailyUpdate();
}

export function unmount() {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }

  if (state.calendar) {
    state.calendar.destroy();
    state.calendar = null;
  }

  if (sortMenuCleanup) {
    sortMenuCleanup();
    sortMenuCleanup = null;
  }

  if (footerEl) {
    footerEl.remove();
    footerEl = null;
  }
  document.getElementById('appMain')?.classList.remove('has-legend');
}
