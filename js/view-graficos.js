// === VIEW: Gráficos (Página 6) — Etapa 8, Sub-entrega 1 ===
// mount()/unmount() chamados pelo router. Chart.js carregado SOB DEMANDA
// (lazy), só quando esta view monta — mesmo cuidado já documentado em
// view-calendario-new.js (FullCalendar): esta página é a única que usa a
// biblioteca, carregar globalmente pesaria à toa nas outras 5.
//
// Sub-entrega 1: KPIs Globais + 3 gráficos (Saldo Global, Depósito x
// Saque semanal, Bônus por Tipo). Ranking/ROI/Heatmap ficam pras
// sub-entregas 2 e 3 — este arquivo será EDITADO por cima delas, nunca
// reescrito do zero (mesmo padrão de ui-finance-panel.js entre
// sub-entregas).
//
// (6.3) mountToken: mount() é assíncrono; se o usuário sair da rota antes
// dos awaits terminarem, o mount desiste em silêncio (sem desenhar na
// tela seguinte). Tooltip do heatmap agora também funciona por toque.

import { state } from './state.js';
import { formatCurrency } from './utils.js';
import {
  computeGlobalKpis, computeWeeklyBalanceSeries,
  computeWeeklyDepositWithdrawal, computeBonusByTypeCurrentMonth,
  computePlatformRankings, computeWeeklyResultBetting,
  computeWeeklyWagered, computeBonusRoiByPlatform, computeHeatmapMatrix
} from './analytics-logic.js';
import { loadObrigadoValuePerAppearance } from './vip-obrigado-store.js';
import { loadMisteriosoTemplates } from './vip-misterioso-store.js';
import { scheduleDailySnapshot } from './daily-snapshot-store.js';

let dailyTimer = null;
let chartJsLoadPromise = null;
let balanceChart = null;
let depositWithdrawalChart = null;
let bonusTypeChart = null;
let rankingChart = null;
let resultBettingChart = null;
let wageredChart = null;
let bonusRoiChart = null;
let currentRankingMetric = 'balance';
let currentHeatmapMetric = 'deposito';
let heatmapLayout = null; // { dayKeys, rows, cellW, cellH, labelWidth, headerHeight } — usado pelo tooltip (mouse e toque)
let heatmapTipTimer = null; // (6.3) esconde o tooltip sozinho depois de um toque
let mountToken = 0; // (6.3) invalida mount() assíncrono se o usuário sair da rota no meio

let obrigadoValuePerAppearance = 0.30;
let misteriosoTemplates = [];

function loadChartJsScript() {
  if (window.Chart) return Promise.resolve();
  if (chartJsLoadPromise) return chartJsLoadPromise;
  chartJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    script.onload = () => resolve();
    script.onerror = () => {
      chartJsLoadPromise = null; // próxima visita tenta de novo
      script.remove();
      reject(new Error('Falha ao carregar Chart.js'));
    };
    document.head.appendChild(script);
  });
  return chartJsLoadPromise;
}

function findTemplateForPlatform(platformId) {
  return misteriosoTemplates.find(t => (t.platformIds || []).includes(platformId)) || null;
}

function resolveCtxForPlatform(platform) {
  return {
    obrigadoValuePerAppearance,
    misteriosoTemplate: findTemplateForPlatform(platform.id)
  };
}

function formatWeekLabelDDMM(isoDateStr) {
  const [, m, d] = isoDateStr.split('-');
  return `${d}/${m}`;
}

function kpiCard(label, value, note = '') {
  return `
    <div class="summary-card">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
      ${note ? `<span class="summary-note">${note}</span>` : ''}
    </div>`;
}

function renderKpis() {
  const el = document.getElementById('graficosKpiGrid');
  if (!el) return;
  const kpis = computeGlobalKpis(state.platforms, new Date(), resolveCtxForPlatform);
  const roiText = kpis.roiGlobal === null ? '—' : kpis.roiGlobal.toFixed(2);
  const idbText = kpis.idb === null ? '—' : `${(kpis.idb * 100).toFixed(1)}%`;

  el.innerHTML = [
    kpiCard('Saldo Global', formatCurrency(kpis.saldoGlobal)),
    kpiCard('Rollover Total', formatCurrency(kpis.rolloverTotal)),
    kpiCard('Total Depositado', formatCurrency(kpis.totalDepositado)),
    kpiCard('Total Sacado', formatCurrency(kpis.totalSacado)),
    kpiCard('Total Apostado', formatCurrency(kpis.totalApostado)),
    kpiCard('N° de Apostas', String(kpis.totalApostas)),
    kpiCard('Resultado Líquido (R.B.)', formatCurrency(kpis.resultadoLiquido)),
    kpiCard('Bônus Distribuído', formatCurrency(kpis.bonusDistribuidoTotal), 'Soma das semanas já fechadas'),
    kpiCard('ROI Global', roiText, 'Resultado Betting ÷ Bônus'),
    kpiCard('Dependência de Bônus (IDB)', idbText, 'Bônus ÷ Resultado Betting')
  ].join('');
}

function renderBalanceChart() {
  const canvas = document.getElementById('graficoSaldoGlobal');
  if (!canvas || !window.Chart) return;
  const series = computeWeeklyBalanceSeries(state.platforms);
  if (balanceChart) balanceChart.destroy();
  balanceChart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map(pt => formatWeekLabelDDMM(pt.weekEnd)),
      datasets: [{
        label: 'Saldo Global',
        data: series.map(pt => pt.total),
        borderColor: '#15803d',
        backgroundColor: 'rgba(21,128,61,0.12)',
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderDepositWithdrawalChart() {
  const canvas = document.getElementById('graficoDepositoSaque');
  if (!canvas || !window.Chart) return;
  const series = computeWeeklyDepositWithdrawal(state.platforms);
  if (depositWithdrawalChart) depositWithdrawalChart.destroy();
  depositWithdrawalChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.map(pt => formatWeekLabelDDMM(pt.weekStart)),
      datasets: [
        { label: 'Depósito', data: series.map(pt => pt.deposit), backgroundColor: '#2563eb' },
        { label: 'Saque', data: series.map(pt => pt.withdrawal), backgroundColor: '#ef4444' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
    }
  });
}

function renderBonusTypeChart() {
  const canvas = document.getElementById('graficoBonusTipo');
  if (!canvas || !window.Chart) return;
  const bonus = computeBonusByTypeCurrentMonth(state.platforms, obrigadoValuePerAppearance, misteriosoTemplates, new Date());
  if (bonusTypeChart) bonusTypeChart.destroy();
  bonusTypeChart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['VIP', 'Obrigado', 'Misterioso', 'Avulso'],
      datasets: [{
        data: [bonus.vip, bonus.obrigado, bonus.misterioso, bonus.avulso],
        backgroundColor: ['#2563eb', '#15803d', '#7c3aed', '#f59e0b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function initRankingControls() {
  const select = document.getElementById('rankingMetricSelect');
  if (!select) return;
  select.value = currentRankingMetric;
  select.addEventListener('change', () => {
    currentRankingMetric = select.value;
    renderRankingChart();
  });
}

function renderRankingChart() {
  const canvas = document.getElementById('graficoRanking');
  if (!canvas || !window.Chart) return;

  const rankings = computePlatformRankings(state.platforms, resolveCtxForPlatform, new Date(), 10);
  const fieldMap = { balance: 'byBalance', lucro: 'byLucro', resultBetting: 'byResultBetting' };
  const rows = rankings[fieldMap[currentRankingMetric]];
  const metricLabels = { balance: 'Saldo', lucro: 'Lucro (R.B. + Bônus)', resultBetting: 'Resultado Betting' };
  const metricColors = { balance: '#15803d', lucro: '#2563eb', resultBetting: '#7c3aed' };

  if (rankingChart) rankingChart.destroy();
  rankingChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        label: metricLabels[currentRankingMetric],
        data: rows.map(r => r[currentRankingMetric]),
        backgroundColor: metricColors[currentRankingMetric]
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderResultBettingChart() {
  const canvas = document.getElementById('graficoResultBetting');
  if (!canvas || !window.Chart) return;
  const series = computeWeeklyResultBetting(state.platforms);
  if (resultBettingChart) resultBettingChart.destroy();
  resultBettingChart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map(pt => formatWeekLabelDDMM(pt.weekStart)),
      datasets: [{
        label: 'Resultado Betting (R.B.)',
        data: series.map(pt => pt.resultBetting),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.15)',
        fill: true,
        tension: 0.25
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

function renderWageredChart() {
  const canvas = document.getElementById('graficoValorApostado');
  if (!canvas || !window.Chart) return;
  const series = computeWeeklyWagered(state.platforms);
  if (wageredChart) wageredChart.destroy();
  wageredChart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map(pt => formatWeekLabelDDMM(pt.weekStart)),
      datasets: [{
        label: 'Valor Apostado',
        data: series.map(pt => pt.wagered),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.15)',
        fill: false,
        tension: 0.25
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

function renderBonusRoiChart() {
  const canvas = document.getElementById('graficoRoiBonus');
  const noteEl = document.getElementById('roiBonusEmptyNote');
  if (!canvas || !window.Chart) return;

  const rows = computeBonusRoiByPlatform(state.platforms, resolveCtxForPlatform, new Date(), 10);
  if (bonusRoiChart) { bonusRoiChart.destroy(); bonusRoiChart = null; }

  if (rows.length === 0) {
    if (noteEl) noteEl.classList.remove('app-hidden');
    return;
  }
  if (noteEl) noteEl.classList.add('app-hidden');

  bonusRoiChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        label: 'ROI (R.B. ÷ Bônus)',
        data: rows.map(r => r.roi),
        backgroundColor: rows.map(r => r.roi >= 1 ? '#15803d' : '#ef4444')
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

// Escala de cor simples (5 degraus) — 0 sempre cinza-claro, nunca
// confundido com "valor baixo real" (diferença visual clara).
function colorForIntensity(t) {
  if (t <= 0) return '#f1f5f9';
  const stops = ['#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'];
  const idx = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[idx];
}

function formatHeatmapValue(value) {
  return formatCurrency(value);
}

// Desenho em Canvas 2D nativo — sem biblioteca, sem espera de rede.
// Roda independente do Chart.js estar carregado ou não.
function renderHeatmapCanvas() {
  const canvas = document.getElementById('graficoHeatmap');
  const metricSelect = document.getElementById('heatmapMetricSelect');
  if (!canvas) return;

  currentHeatmapMetric = metricSelect ? metricSelect.value : currentHeatmapMetric;
  const { dayKeys, rows } = computeHeatmapMatrix(state.platforms, currentHeatmapMetric, 14, new Date());

  const cellW = 26;
  const cellH = 16;
  const labelWidth = 72;
  const headerHeight = 46;

  const width = labelWidth + dayKeys.length * cellW;
  const height = headerHeight + rows.length * cellH;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px Poppins, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  let maxVal = 0;
  rows.forEach(r => r.values.forEach(v => { if (v > maxVal) maxVal = v; }));

  // Cabeçalho de datas (rotacionado, senão não cabe em 26px de largura)
  ctx.fillStyle = '#64748b';
  dayKeys.forEach((k, i) => {
    const [, m, d] = k.split('-');
    ctx.save();
    ctx.translate(labelWidth + i * cellW + (cellW - 2) / 2, headerHeight - 4);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${d}/${m}`, 0, 0);
    ctx.restore();
  });

  rows.forEach((row, rIdx) => {
    const y = headerHeight + rIdx * cellH;
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(row.name, 2, y + cellH / 2);

    row.values.forEach((val, cIdx) => {
      const x = labelWidth + cIdx * cellW;
      const intensity = maxVal > 0 ? val / maxVal : 0;
      ctx.fillStyle = colorForIntensity(intensity);
      ctx.fillRect(x, y, cellW - 2, cellH - 2);
    });
  });

  heatmapLayout = { dayKeys, rows, cellW, cellH, labelWidth, headerHeight };
}

function hideHeatmapTooltip() {
  const tooltip = document.getElementById('heatmapTooltip');
  if (tooltip) tooltip.style.display = 'none';
  if (heatmapTipTimer) { clearTimeout(heatmapTipTimer); heatmapTipTimer = null; }
}

// Mostra o tooltip da célula sob (clientX, clientY). autoHideMs > 0 (toque):
// some sozinho; 0 (mouse): fica enquanto o cursor estiver em cima.
function showHeatmapTooltipAt(canvas, tooltip, clientX, clientY, autoHideMs) {
  if (!heatmapLayout) return;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const { dayKeys, rows, cellW, cellH, labelWidth, headerHeight } = heatmapLayout;

  const col = Math.floor((x - labelWidth) / cellW);
  const row = Math.floor((y - headerHeight) / cellH);

  if (col < 0 || col >= dayKeys.length || row < 0 || row >= rows.length) {
    hideHeatmapTooltip();
    return;
  }

  const [, m, d] = dayKeys[col].split('-');
  const value = rows[row].values[col];
  tooltip.textContent = `${rows[row].name} — ${d}/${m}: ${formatHeatmapValue(value)}`;
  tooltip.style.display = 'block';

  // Não deixa o tooltip sair pela borda direita da tela (celular).
  const margin = 8;
  const maxLeft = window.innerWidth - tooltip.offsetWidth - margin;
  tooltip.style.left = `${Math.max(margin, Math.min(clientX + 12, maxLeft))}px`;
  tooltip.style.top = `${clientY + 12}px`;

  if (heatmapTipTimer) { clearTimeout(heatmapTipTimer); heatmapTipTimer = null; }
  if (autoHideMs > 0) heatmapTipTimer = setTimeout(hideHeatmapTooltip, autoHideMs);
}

function initHeatmapControls() {
  const select = document.getElementById('heatmapMetricSelect');
  const canvas = document.getElementById('graficoHeatmap');
  const tooltip = document.getElementById('heatmapTooltip');
  if (select) {
    select.value = currentHeatmapMetric;
    select.addEventListener('change', () => {
      hideHeatmapTooltip();
      renderHeatmapCanvas();
    });
  }
  if (canvas && tooltip) {
    canvas.addEventListener('mousemove', (e) => showHeatmapTooltipAt(canvas, tooltip, e.clientX, e.clientY, 0));
    canvas.addEventListener('mouseleave', hideHeatmapTooltip);
    // Toque/caneta: mostra no ponto tocado, some em 3,5 s ou ao tocar fora de
    // uma célula. Rolar o heatmap na horizontal também esconde.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      showHeatmapTooltipAt(canvas, tooltip, e.clientX, e.clientY, 3500);
    });
    if (canvas.parentElement) canvas.parentElement.addEventListener('scroll', hideHeatmapTooltip, { passive: true });
  }
}

function refreshPage() {
  renderKpis();
  renderHeatmapCanvas();
  renderBalanceChart();
  renderDepositWithdrawalChart();
  renderBonusTypeChart();
  renderRankingChart();
  renderResultBettingChart();
  renderWageredChart();
  renderBonusRoiChart();
}

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  dailyTimer = setTimeout(() => {
    refreshPage();
    scheduleDailyUpdate();
  }, nextMidnight - now);
}

export async function mount(container) {
  const token = ++mountToken;
  heatmapLayout = null;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">📊 Analytics</span>
        <h1>Gráficos</h1>
        <p>Visão executiva consolidada de todas as plataformas.</p>
      </div>
    </div>

    <section class="card-shell graficos-section" aria-label="KPIs Globais">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div><h2>KPIs Globais</h2></div>
      </div>
      <div id="graficosKpiGrid" class="kpi-grid"></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Evolução do Saldo Global" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Evolução do Saldo Global</h2>
          <p>Um ponto por fechamento de semana — soma do Saldo mais recente já fechado de cada plataforma até aquela data.</p>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="graficoSaldoGlobal"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Depósitos vs Saques" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div><h2>Depósitos vs Saques (por semana)</h2></div>
      </div>
      <div class="chart-wrap"><canvas id="graficoDepositoSaque"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Bônus por Tipo" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div><h2>Bônus por Tipo</h2></div>
      </div>
      <p class="graficos-note">VIP/Obrigado/Misterioso são a PROJEÇÃO do mês atual (mesma fórmula da aba VIP); Avulso é o valor real já lançado via "Inserir bônus hoje" neste mês.</p>
      <div class="chart-wrap" style="height:280px;"><canvas id="graficoBonusTipo"></canvas></div>
    </section>

      <section class="card-shell graficos-section" aria-label="Ranking de Plataformas" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Ranking de Plataformas (Top 10)</h2>
          <p>Baseado nas semanas já fechadas + Saldo/Rollover ao vivo da fase atual, conforme o critério escolhido.</p>
        </div>
      </div>
      <div class="finance-entry-form" style="padding:0 1.1rem 0.9rem;">
        <select id="rankingMetricSelect" aria-label="Critério do ranking" style="padding:0.6rem 0.75rem; border:1px solid #e6e9ee; border-radius:12px; outline:none;">
          <option value="balance">Por Saldo</option>
          <option value="lucro">Por Lucro (R.B. + Bônus)</option>
          <option value="resultBetting">Por Resultado Betting</option>
        </select>
      </div>
      <div class="chart-wrap"><canvas id="graficoRanking"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Resultado Betting" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div><h2>Resultado Betting (por semana)</h2></div>
      </div>
      <div class="chart-wrap"><canvas id="graficoResultBetting"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Valor Apostado" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div><h2>Valor Apostado (por semana)</h2></div>
      </div>
      <div class="chart-wrap"><canvas id="graficoValorApostado"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="ROI dos Bônus por Plataforma" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>ROI dos Bônus por Plataforma (Top 10)</h2>
          <p>ROI = Resultado Betting ÷ Bônus, das semanas já fechadas + fase atual. Só entram plataformas com bônus &gt; 0.</p>
        </div>
      </div>
      <p id="roiBonusEmptyNote" class="graficos-note app-hidden">Nenhuma plataforma com bônus registrado ainda.</p>
      <div class="chart-wrap"><canvas id="graficoRoiBonus"></canvas></div>
    </section>

     <section class="card-shell graficos-section" aria-label="Heatmap Geral" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Heatmap Geral</h2>
          <p>Últimos 14 dias, por plataforma. Sem Saldo diário salvo no sistema — a métrica escolhida é sempre um dado que existe por dia (nunca uma aproximação de Saldo).</p>
        </div>
      </div>
      <div class="finance-entry-form" style="padding:0 1.1rem 0.9rem;">
        <select id="heatmapMetricSelect" aria-label="Métrica do heatmap" style="padding:0.6rem 0.75rem; border:1px solid #e6e9ee; border-radius:12px; outline:none;">
          <option value="deposito">Depósito</option>
          <option value="apostado">Valor Apostado</option>
          <option value="resultBetting">Resultado Betting</option>
          <option value="bonus">Bônus Avulso</option>
        </select>
      </div>
      <div class="heatmap-scroll">
        <canvas id="graficoHeatmap"></canvas>
      </div>
      <div id="heatmapTooltip" class="heatmap-tooltip"></div>
    </section>
  `;

  const loadedObrigado = await loadObrigadoValuePerAppearance(state.currentUid);
  if (token !== mountToken) return; // saiu da rota durante o await
  const loadedMisterioso = await loadMisteriosoTemplates(state.currentUid);
  if (token !== mountToken) return;
  obrigadoValuePerAppearance = loadedObrigado;
  misteriosoTemplates = loadedMisterioso;
  scheduleDailySnapshot(state.currentUid, state.platforms, resolveCtxForPlatform);

  // Heatmap não depende do Chart.js — renderiza na hora, antes da
  // biblioteca terminar de baixar, pra não ficar esperando à toa.
  initHeatmapControls();
  renderKpis();
  renderHeatmapCanvas();

  await loadChartJsScript();
  if (token !== mountToken) return; // saiu da rota durante o download

  initRankingControls();
  refreshPage();
  scheduleDailyUpdate();
}

export function unmount() {
  mountToken++; // invalida qualquer mount() ainda esperando um await
  if (heatmapTipTimer) { clearTimeout(heatmapTipTimer); heatmapTipTimer = null; }
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  if (balanceChart) { balanceChart.destroy(); balanceChart = null; }
  if (depositWithdrawalChart) { depositWithdrawalChart.destroy(); depositWithdrawalChart = null; }
  if (bonusTypeChart) { bonusTypeChart.destroy(); bonusTypeChart = null; }
  if (rankingChart) { rankingChart.destroy(); rankingChart = null; }
  if (resultBettingChart) { resultBettingChart.destroy(); resultBettingChart = null; }
  if (wageredChart) { wageredChart.destroy(); wageredChart = null; }
  if (bonusRoiChart) { bonusRoiChart.destroy(); bonusRoiChart = null; }
}
