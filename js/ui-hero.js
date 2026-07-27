// === RESUMO DO TOPO (HERO) + LEGENDA DINÂMICA DO RODAPÉ ===
import { state } from './state.js';
import { formatCurrency } from './utils.js';
import { getTotalDepositsSinceCycle, getEventsForDate, getCurrentCycleDay, levelForAmount, LEVEL_INFO } from './cycle-logic.js';

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

  updateLegend(topPlatform ? getTotalDepositsSinceCycle(topPlatform) : 0);
}

// Mostra só do Nível 0 até o nível mais alto realmente atingido por alguma
// plataforma no ciclo atual (topPlatform já é o maior total, calculado
// acima). Evita listar níveis (ex: 6, 7) que ninguém alcançou ainda.
function updateLegend(maxAmount) {
  const legendEl = document.getElementById('appFooter');
  if (!legendEl) return;

  const maxLevel = levelForAmount(maxAmount);
  let html = '';
  for (let level = 0; level <= maxLevel; level++) {
    html += `
      <div class="legend-item">
        <div class="legend-swatch" style="background:var(--level-${level})"></div>
        <div><span class="legend-label">Nível ${level}:</span><span>${LEVEL_INFO[level].label}</span></div>
      </div>`;
  }
  legendEl.innerHTML = html;
    }
