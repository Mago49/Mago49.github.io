// === PONTO DE ENTRADA — Página 1 (Hub) ===
// Esta página só mostra o resumo geral (Painel Geral). Sem calendário, sem
// painel de plataformas — por isso não importa ui-calendar.js nem carrega
// a biblioteca FullCalendar no HTML, economizando peso à toa.

import { initAuth } from './auth-guard.js';
import { startBackgroundAnimation } from './ui-background.js';
import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderHeroSummary } from './ui-hero.js';

startBackgroundAnimation();

initAuth({
  onLogin: () => {
    renderHeroSummary(computeHeroStats(state.platforms));
  }
});
