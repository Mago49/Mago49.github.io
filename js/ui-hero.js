// === RESUMO DO TOPO (HERO) ===
import { state } from './state.js';
import { formatCurrency } from './utils.js';
import { getTotalDepositsSinceCycle, getEventsForDate, getCurrentCycleDay } from './cycle-logic.js';

export function updateHeroSummary() {
  const totalPlatforms = state.platforms.length;
  const totalDeposits = state.platforms.reduce((sum, platform) => sum + getTotalDepositsSinceCycle(platform), 0);
  const bonusToday = getEventsForDate(new Date()).length;
  const activeCycles = state.platforms.filter(platform => !platform.cycleEnded && platform.lastResetDate && getCurrentCycleDay(platform) > 0).length;
  const topPlatform = [...state.platforms]
    .filter(platform => !platform.cycleEnded)
    .sort((a, b) => getTotalDepositsSinceCycle(b) - getTotalDepositsSinceCycle(a))[0];

  document.getElementById('heroPlatformCount').textContent = String(totalPlatforms);
  document.getElementById('heroTotalDeposits').textContent = formatCurrency(totalDeposits);
  document.getElementById('heroBonusToday').textContent = String(bonusToday);

  const highlightEl = document.getElementById('heroNextHighlight');
  const highlightNoteEl = document.getElementById('heroNextHighlightNote');

  if (topPlatform && getTotalDepositsSinceCycle(topPlatform) > 0) {
    highlightEl.textContent = topPlatform.name;
    highlightNoteEl.textContent = `${formatCurrency(getTotalDepositsSinceCycle(topPlatform))} no ciclo atual • ${activeCycles} plataformas ativas.`;
  } else {
    highlightEl.textContent = activeCycles > 0 ? 'Em dia' : 'Sem depósitos';
    highlightNoteEl.textContent = activeCycles > 0
      ? `${activeCycles} plataformas com ciclo em andamento.`
      : 'Adicione depósitos para começar a acompanhar os níveis.';
  }
}
