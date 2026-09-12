// === RESUMO DO TOPO (HERO) — Página 1 — e LEGENDA — Página 2 ===
// Antes essas duas coisas viviam numa função só (updateHeroSummary), o que
// não funciona mais: os elementos do hero só existem em index.html e o
// elemento da legenda (#appFooter) só existe na view Calendário. Cada
// página chama só o renderizador que faz sentido pra ela, os dois
// alimentados pela mesma função pura computeHeroStats() (cycle-logic.js).
import { formatCurrency } from './utils.js';
import { LEVEL_INFO } from './cycle-logic.js';

// Usado só em view-inicio.js
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

// Converte o label textual de LEVEL_INFO (ex: "1–29", "1.000–1.099") em
// faixa formatada em R$ (ex: "R$ 1,00 – R$ 29,00"). Item 26n (Bloco J):
// re-exibição pura — os NÚMEROS de cada faixa continuam exatamente os
// mesmos já definidos em LEVEL_INFO (cycle-logic.js, intocado nesta
// etapa); só a formatação na tela muda, de texto cru pra moeda. Zero
// relação com colorForLevel() ou com a lógica de emissão de datas.
function formatLevelRangeLabel(label) {
  const parts = label.split('–').map(part =>
    part.trim().replace(/\./g, '').replace(',', '.')
  );
  if (parts.length !== 2) return label; // formato inesperado: exibe cru, nunca quebra a legenda
  const min = Number(parts[0]);
  const max = Number(parts[1]);
  if (isNaN(min) || isNaN(max)) return label;
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

// Usado só em view-calendario.js. Mostra do Nível 0 até o nível mais
// alto realmente atingido por alguma plataforma no ciclo atual — evita
// listar níveis que ninguém alcançou ainda (lógica de exibição
// inalterada). Só o TEXTO de cada faixa mudou (Item 26n).
export function renderLegend(stats) {
  const legendEl = document.getElementById('appFooter');
  if (!legendEl) return;

  let html = '';
  for (let level = 0; level <= stats.maxLevel; level++) {
    html += `
      <div class="legend-item">
        <div class="legend-swatch" style="background:var(--level-${level})"></div>
        <span>${formatLevelRangeLabel(LEVEL_INFO[level].label)}</span>
      </div>`;
  }
  legendEl.innerHTML = html;
}
