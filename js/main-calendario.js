// === PONTO DE ENTRADA — Página 2 (Calendário) ===
import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderLegend } from './ui-hero.js';
import { createCalendar, updateCalendarEvents, scrollToCurrentWeek } from './ui-calendar.js';
import { renderPlatformCards, initPlatformCardsControls } from './ui-platform-cards.js';

startBackgroundAnimation();

function refreshPage() {
  updateCalendarEvents(() => renderLegend(computeHeroStats(state.platforms)));
  renderPlatformCards();
}

initAuth({
  onLogin: () => {
    createCalendar();
    initPlatformCardsControls();
    refreshPage();
    // Ponto 2.1: só na abertura da página, uma única vez — nunca dentro de
    // scheduleDailyUpdate() abaixo, pra não forçar scroll indesejado se a
    // virada do dia acontecer enquanto alguém já está navegando.
    scrollToCurrentWeek();
    scheduleDailyUpdate();
  }
});

// A virada do dia muda o "Dia X" de cada plataforma e pode mudar o nível
// máximo atingido (legenda) — sem isso, ficaria desatualizado até recarregar.
let dailyTimer = null;
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
