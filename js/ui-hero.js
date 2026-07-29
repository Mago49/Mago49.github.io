// === RESUMO DO TOPO (HERO) — Página 1 — e LEGENDA — Página 2 ===
// Antes essas duas coisas viviam numa função só (updateHeroSummary), o que
// não funciona mais: os elementos do hero só existem em index.html e o
// elemento da legenda (#appFooter) só existe em calendario.html. Cada
// página agora chama só o renderizador que faz sentido pra ela, os dois
// alimentados pela mesma função pura computeHeroStats() (cycle-logic.js).
import { formatCurrency } from './utils.js';
import { LEVEL_INFO } from './cycle-logic.js';

// Usado só em main-inicio.js
export function renderHeroSummary(stats) {
  const platformCountEl = document.getElementById('heroPlatformCount');
  const totalDepositsEl = document.getElementById('heroTotalDeposits');
  const bonusTodayEl = document.getElementById('heroBonusToday');
  const highlightEl = document.getElementById('heroNextHighlight');
  const highlightNoteEl = document.getElementById('heroNextHighlightNote');
  if (!platformCountEl) return;

  platformCountEl.textContent = String(stats.totalPlatforms);
  totalDepositsEl.textContent = formatCurrency(stats.totalDeposits);
  bonusTodayEl.textContent = String(stats.bonusToday);

  if (stats.topPlatform && stats.topPlatformTotal > 0) {
    highlightEl.textContent = stats.topPlatform.name;
    highlightNoteEl.textContent = `${formatCurrency(stats.topPlatformTotal)} no ciclo atual • ${stats.activeCycles} plataformas ativas.`;
  } else {
    highlightEl.textContent = stats.activeCycles > 0 ? 'Em dia' : 'Sem depósitos';
    highlightNoteEl.textContent = stats.activeCycles > 0
      ? `${stats.activeCycles} plataformas com ciclo em andamento.`
      : 'Adicione depósitos para começar a acompanhar os níveis.';
  }
}

// Usado só em main-calendario.js. Mostra do Nível 0 até o nível mais alto
// realmente atingido por alguma plataforma no ciclo atual — evita listar
// níveis que ninguém alcançou ainda. Lógica de exibição inalterada.
export function renderLegend(stats) {
  const legendEl = document.getElementById('appFooter');
  if (!legendEl) return;

  let html = '';
  for (let level = 0; level <= stats.maxLevel; level++) {
    html += `
      <div class="legend-item">
        <div class="legend-swatch" style="background:var(--level-${level})"></div>
        <div><span class="legend-label">Nível ${level}:</span><span>${LEVEL_INFO[level].label}</span></div>
      </div>`;
  }
  legendEl.innerHTML = html;
}
