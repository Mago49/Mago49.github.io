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
//
// (Sub-entrega E) CONTEXTO DE BÔNUS: Obrigado/Misterioso vêm de
// loadBonusContextStrict (bonus-context-store.js). Esta tela é só leitura,
// então uma falha NÃO impede de abrir — mas agora fica explícita: aparece
// uma nota no topo, Obrigado/Misterioso entram como 0 (em vez do 0,30
// padrão em silêncio) e o snapshot diário NÃO é agendado (ele grava Saldo
// e Rollover, que dependem desses dois valores).
//
// (Sub-entrega G) Heatmap "Bônus Avulso" recebe o resolvedor de ctx (o
// avulso efetivo depende da fórmula do dia) e a nota do "Bônus por Tipo"
// explica que o Avulso agora inclui a diferença informada nos fechamentos.
//
// === (Análises — Sub-entrega 1) ABAS ===
// A página passa a ter abas: "Visão Geral" (TUDO que já existia, sem
// nenhuma mudança de lógica — as seções só foram envolvidas no painel da
// aba) e "Análises" (ui-graficos-analise.js + analise-logic.js).
//   - Visual das abas reaproveita .vip-tabs/.vip-tab-btn (vip.css, já
//     global). A SELEÇÃO usa só .graficos-tab-btn/.graficos-tab-panel e
//     fica restrita ao container desta view — nunca colide com o
//     applyActiveTab de ui-vip-panel.js (que usa seletor global).
//   - Análises é montada SOB DEMANDA (primeira abertura da aba), depois do
//     Chart.js carregado e com o painel já visível — canvas em painel
//     oculto nasce com tamanho 0.
//   - Voltar pra uma aba chama .resize() nos gráficos dela (podem ter sido
//     redesenhados escondidos na virada do dia).
//   - A aba ativa é lembrada durante a sessão (variável de módulo).
//   - Nenhuma leitura/gravação nova no Firestore.
//
// === (Total Apostado — Sub-entrega 2) ===
// Terceira aba, "Total Apostado" (ui-total-apostado.js + wager-total-
// logic.js). Não usa Chart.js: monta na primeira abertura da aba e é
// redesenhada a cada volta pra ela (os lançamentos podem ter mudado no
// Financeiro) e na virada do dia. É a ÚNICA parte desta página que grava
// no banco — sempre via savePlatform (platforms-store.js), nunca direto.
//
// === (Planejador — Sub-entrega 5) ===
// Quarta aba, "Planejador" (ui-planejador.js + plan-logic.js +
// plan-store.js). Usa Chart.js, então monta SOB DEMANDA como Análises
// (depois do download e com o painel visível). Grava só nas coleções
// betPlans/plannerConfig — nunca em plataformas.
// No celular, a barra de abas vira uma faixa com rolagem lateral
// (graficos.css) em vez de quebrar em duas linhas.
//
// === (Rotinas — Sub-entrega 6) ===
// Quinta aba, "Rotinas" (ui-rotinas.js + routine-logic.js +
// routine-store.js). Sem Chart.js: monta na primeira abertura; na volta e
// na virada do dia, grava o histórico dos dias que fecharam e redesenha.
// Grava só em routines/routineLog/routineMarks — nunca em plataformas.
//
// === (Misterioso — Sub-entrega 7b) ===
// Sexta aba, "Misterioso" (ui-misterioso.js + strategy-logic.js): orçamento,
// plano sugerido, ranking e contenção. Usa Chart.js (gráfico de contenção),
// então monta SOB DEMANDA como Planejador. Grava só plannerConfig/strategy.
// Rotinas passa a receber o contexto de bônus (Agenda do dia mostra as
// emissões e a sugestão do Misterioso).
//
// === (Calendário — Sub-entrega 8b) ===
// Sétima aba, "Calendário" (ui-calendario-analytics.js + calendar-logic.js
// + plan-log-store.js): planejado × real, camadas e resultado real. Usa
// Chart.js — monta SOB DEMANDA. Grava só planLog e plannerConfig/calendar.
// A Página 2 (Calendário do Misterioso) não muda.
//
// === (Jogos — Sub-entrega 9) ===
// Oitava aba, "Jogos" (ui-game-catalog.js + game-catalog-logic.js +
// game-catalog-store.js): biblioteca de jogos, provedores e valores de
// aposta. Sem Chart.js: monta na primeira abertura (como Rotinas). Grava só
// gameCatalog/gameConfig — nunca em plataformas.

import { state } from './state.js';
import { formatCurrency } from './utils.js';
import {
  computeGlobalKpis, computeWeeklyBalanceSeries,
  computeWeeklyDepositWithdrawal, computeBonusByTypeCurrentMonth,
  computePlatformRankings, computeWeeklyResultBetting,
  computeWeeklyWagered, computeBonusRoiByPlatform, computeHeatmapMatrix
} from './analytics-logic.js';
import { loadBonusContextStrict } from './bonus-context-store.js';
import { scheduleDailySnapshot } from './daily-snapshot-store.js';
import { mountAnalise, refreshAnalise, resizeAnaliseCharts, unmountAnalise } from './ui-graficos-analise.js';
import { mountTotalApostado, refreshTotalApostado, unmountTotalApostado } from './ui-total-apostado.js';
import { mountPlanejador, refreshPlanejador, resizePlanejador, unmountPlanejador } from './ui-planejador.js';
import { mountRotinas, refreshRotinas, unmountRotinas } from './ui-rotinas.js';
import { mountMisterioso, refreshMisterioso, resizeMisterioso, unmountMisterioso } from './ui-misterioso.js';
import {
  mountCalendarioAnalytics, refreshCalendarioAnalytics, resizeCalendarioAnalytics, unmountCalendarioAnalytics
} from './ui-calendario-analytics.js';
import { mountGameCatalog, refreshGameCatalog, unmountGameCatalog } from './ui-game-catalog.js';

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
let bonusContextConfirmed = false; // (Sub-entrega E)

// (Análises — Sub-entrega 1)
const GRAFICOS_TABS = ['geral', 'analises', 'apostado', 'planejador', 'rotinas', 'misterioso', 'calendario', 'jogos'];
let activeGraficosTab = 'geral'; // lembrada durante a sessão
let analiseMounted = false;
let analiseMountPromise = null;
let apostadoMounted = false; // (Total Apostado — Sub-entrega 2)
let planejadorMounted = false; // (Planejador — Sub-entrega 5)
let planejadorMountPromise = null;
let rotinasMounted = false; // (Rotinas — Sub-entrega 6)
let misteriosoMounted = false; // (Misterioso — Sub-entrega 7b)
let misteriosoMountPromise = null;
let calendarioMounted = false; // (Calendário — Sub-entrega 8b)
let calendarioMountPromise = null;
let jogosMounted = false; // (Jogos — Sub-entrega 9)

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
  const { dayKeys, rows } = computeHeatmapMatrix(state.platforms, currentHeatmapMetric, 14, new Date(), resolveCtxForPlatform);

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

// ---------- (Análises — Sub-entrega 1) ABAS ----------

function getGeralCharts() {
  return [balanceChart, depositWithdrawalChart, bonusTypeChart, rankingChart, resultBettingChart, wageredChart, bonusRoiChart];
}

// Monta a aba Análises uma única vez por visita à rota. Só depois do
// Chart.js carregado e com o painel visível. Falha no Chart.js mostra o
// motivo no próprio painel (a Visão Geral continua funcionando).
function ensureAnaliseMounted(container, token) {
  if (analiseMounted) return Promise.resolve();
  if (analiseMountPromise) return analiseMountPromise;

  analiseMountPromise = loadChartJsScript()
    .then(() => {
      if (token !== mountToken) return; // saiu da rota durante o download
      if (activeGraficosTab !== 'analises') return; // trocou de aba antes de terminar: monta na próxima abertura
      const root = container.querySelector('#graficosAnaliseRoot');
      if (!root) return;
      mountAnalise(root, { resolveCtx: resolveCtxForPlatform, contextConfirmed: bonusContextConfirmed });
      analiseMounted = true;
    })
    .catch(err => {
      console.error('Análises: não foi possível carregar o Chart.js:', err);
      if (token !== mountToken) return;
      const root = container.querySelector('#graficosAnaliseRoot');
      if (root) {
        root.innerHTML = '<p class="graficos-note graficos-note-warn"></p>';
        root.firstElementChild.textContent = 'Não foi possível carregar a biblioteca de gráficos. Verifique a internet e abra a aba de novo.';
      }
    })
    .finally(() => {
      analiseMountPromise = null;
    });

  return analiseMountPromise;
}

// (Planejador — Sub-entrega 5) Mesmo padrão de ensureAnaliseMounted.
function ensurePlanejadorMounted(container, token) {
  if (planejadorMounted) return Promise.resolve();
  if (planejadorMountPromise) return planejadorMountPromise;

  planejadorMountPromise = loadChartJsScript()
    .then(() => {
      if (token !== mountToken) return;
      if (activeGraficosTab !== 'planejador') return;
      const root = container.querySelector('#graficosPlanejadorRoot');
      if (!root) return;
      mountPlanejador(root, { resolveCtx: resolveCtxForPlatform, contextConfirmed: bonusContextConfirmed });
      planejadorMounted = true;
    })
    .catch(err => {
      console.error('Planejador: não foi possível carregar o Chart.js:', err);
      if (token !== mountToken) return;
      const root = container.querySelector('#graficosPlanejadorRoot');
      if (root) {
        root.innerHTML = '<p class="graficos-note graficos-note-warn"></p>';
        root.firstElementChild.textContent = 'Não foi possível carregar a biblioteca de gráficos. Verifique a internet e abra a aba de novo.';
      }
    })
    .finally(() => {
      planejadorMountPromise = null;
    });

  return planejadorMountPromise;
}

// (Misterioso — Sub-entrega 7b) Mesmo padrão de ensurePlanejadorMounted.
function ensureMisteriosoMounted(container, token) {
  if (misteriosoMounted) return Promise.resolve();
  if (misteriosoMountPromise) return misteriosoMountPromise;

  misteriosoMountPromise = loadChartJsScript()
    .then(() => {
      if (token !== mountToken) return;
      if (activeGraficosTab !== 'misterioso') return;
      const root = container.querySelector('#graficosMisteriosoRoot');
      if (!root) return;
      mountMisterioso(root, { resolveCtx: resolveCtxForPlatform, contextConfirmed: bonusContextConfirmed });
      misteriosoMounted = true;
    })
    .catch(err => {
      console.error('Misterioso: não foi possível carregar o Chart.js:', err);
      if (token !== mountToken) return;
      const root = container.querySelector('#graficosMisteriosoRoot');
      if (root) {
        root.innerHTML = '<p class="graficos-note graficos-note-warn"></p>';
        root.firstElementChild.textContent = 'Não foi possível carregar a biblioteca de gráficos. Verifique a internet e abra a aba de novo.';
      }
    })
    .finally(() => {
      misteriosoMountPromise = null;
    });

  return misteriosoMountPromise;
}

// (Calendário — Sub-entrega 8b) Mesmo padrão de ensurePlanejadorMounted.
function ensureCalendarioMounted(container, token) {
  if (calendarioMounted) return Promise.resolve();
  if (calendarioMountPromise) return calendarioMountPromise;

  calendarioMountPromise = loadChartJsScript()
    .then(() => {
      if (token !== mountToken) return;
      if (activeGraficosTab !== 'calendario') return;
      const root = container.querySelector('#graficosCalendarioRoot');
      if (!root) return;
      mountCalendarioAnalytics(root, { resolveCtx: resolveCtxForPlatform, contextConfirmed: bonusContextConfirmed });
      calendarioMounted = true;
    })
    .catch(err => {
      console.error('Calendário: não foi possível carregar o Chart.js:', err);
      if (token !== mountToken) return;
      const root = container.querySelector('#graficosCalendarioRoot');
      if (root) {
        root.innerHTML = '<p class="graficos-note graficos-note-warn"></p>';
        root.firstElementChild.textContent = 'Não foi possível carregar a biblioteca de gráficos. Verifique a internet e abra a aba de novo.';
      }
    })
    .finally(() => {
      calendarioMountPromise = null;
    });

  return calendarioMountPromise;
}

function applyGraficosTab(container, token) {
  if (!GRAFICOS_TABS.includes(activeGraficosTab)) activeGraficosTab = 'geral';

  container.querySelectorAll('.graficos-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === activeGraficosTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  container.querySelectorAll('.graficos-tab-panel').forEach(panel => {
    panel.classList.toggle('app-hidden', panel.dataset.tabPanel !== activeGraficosTab);
  });

  hideHeatmapTooltip();

  if (activeGraficosTab === 'geral') {
    getGeralCharts().forEach(c => { if (c) c.resize(); });
  } else if (activeGraficosTab === 'analises') {
    if (analiseMounted) resizeAnaliseCharts();
    else ensureAnaliseMounted(container, token);
  } else if (activeGraficosTab === 'apostado') {
    // (Total Apostado) sem Chart.js — monta na hora; na volta, redesenha.
    if (apostadoMounted) {
      refreshTotalApostado();
    } else {
      const root = container.querySelector('#graficosApostadoRoot');
      if (root) {
        mountTotalApostado(root);
        apostadoMounted = true;
      }
    }
  } else if (activeGraficosTab === 'planejador') {
    if (planejadorMounted) {
      resizePlanejador();
      refreshPlanejador();
    } else {
      ensurePlanejadorMounted(container, token);
    }
  } else if (activeGraficosTab === 'rotinas') {
    if (rotinasMounted) {
      refreshRotinas();
    } else {
      const root = container.querySelector('#graficosRotinasRoot');
      if (root) {
        mountRotinas(root, { resolveCtx: resolveCtxForPlatform, contextConfirmed: bonusContextConfirmed });
        rotinasMounted = true;
      }
    }
  } else if (activeGraficosTab === 'misterioso') {
    if (misteriosoMounted) {
      resizeMisterioso();
      refreshMisterioso();
    } else {
      ensureMisteriosoMounted(container, token);
    }
  } else if (activeGraficosTab === 'calendario') {
    if (calendarioMounted) {
      resizeCalendarioAnalytics();
      refreshCalendarioAnalytics();
    } else {
      ensureCalendarioMounted(container, token);
    }
  } else if (activeGraficosTab === 'jogos') {
    if (jogosMounted) {
      refreshGameCatalog();
    } else {
      const root = container.querySelector('#graficosJogosRoot');
      if (root) {
        mountGameCatalog(root);
        jogosMounted = true;
      }
    }
  }

  // Aba ativa sempre visível na faixa rolável (celular).
  const activeBtn = container.querySelector(`.graficos-tab-btn[data-tab="${activeGraficosTab}"]`);
  if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function initGraficosTabs(container, token) {
  container.querySelectorAll('.graficos-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === activeGraficosTab) return;
      activeGraficosTab = btn.dataset.tab;
      applyGraficosTab(container, token);
    });
  });
  applyGraficosTab(container, token);
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
    refreshAnalise(); // (Análises) não faz nada se a aba não foi aberta
    refreshTotalApostado(); // (Total Apostado) idem
    refreshPlanejador(); // (Planejador) idem
    refreshRotinas(); // (Rotinas) idem — grava o dia que fechou
    refreshMisterioso(); // (Misterioso) idem
    refreshCalendarioAnalytics(); // (Calendário) idem — guarda o dia que fechou
    scheduleDailyUpdate();
  }, nextMidnight - now);
}

export async function mount(container) {
  const token = ++mountToken;
  heatmapLayout = null;
  analiseMounted = false;
  analiseMountPromise = null;
  apostadoMounted = false;
  planejadorMounted = false;
  planejadorMountPromise = null;
  rotinasMounted = false;
  misteriosoMounted = false;
  misteriosoMountPromise = null;
  calendarioMounted = false;
  calendarioMountPromise = null;
  jogosMounted = false;
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">📊 Analytics</span>
        <h1>Gráficos</h1>
        <p>Visão executiva consolidada de todas as plataformas.</p>
      </div>
    </div>

    <p id="graficosContextNote" class="graficos-note app-hidden"></p>

    <div class="vip-tabs graficos-tabs" role="tablist" aria-label="Seções de gráficos">
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="geral">Visão Geral</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="analises">Análises</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="apostado">Total Apostado</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="planejador">Planejador</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="rotinas">Rotinas</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="misterioso">Misterioso</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="calendario">Calendário</button>
      <button type="button" class="vip-tab-btn graficos-tab-btn" role="tab" data-tab="jogos">Jogos</button>
    </div>

    <div class="graficos-tab-panel" data-tab-panel="geral" role="tabpanel">

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
      <p class="graficos-note">VIP/Obrigado/Misterioso são a PROJEÇÃO do mês atual (mesma fórmula da aba VIP); Avulso = valor real lançado via "Inserir bônus hoje" neste mês (sem repetir o que a fórmula já conta) + a diferença informada ao fechar as semanas que terminam neste mês (bônus real − contabilizado; diferença negativa abate, total nunca abaixo de zero).</p>
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

    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="analises" role="tabpanel">
      <div id="graficosAnaliseRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="apostado" role="tabpanel">
      <div id="graficosApostadoRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="planejador" role="tabpanel">
      <div id="graficosPlanejadorRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="rotinas" role="tabpanel">
      <div id="graficosRotinasRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="misterioso" role="tabpanel">
      <div id="graficosMisteriosoRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="calendario" role="tabpanel">
      <div id="graficosCalendarioRoot"></div>
    </div>

    <div class="graficos-tab-panel app-hidden" data-tab-panel="jogos" role="tabpanel">
      <div id="graficosJogosRoot"></div>
    </div>
  `;

  // (Sub-entrega E) Leitura estrita do contexto de bônus. Falha não impede
  // a tela (só leitura), mas fica explícita e bloqueia o snapshot.
  try {
    const bonusContext = await loadBonusContextStrict(state.currentUid);
    if (token !== mountToken) return; // saiu da rota durante o await
    obrigadoValuePerAppearance = bonusContext.obrigadoValuePerAppearance;
    misteriosoTemplates = bonusContext.misteriosoTemplates;
    bonusContextConfirmed = true;
  } catch (err) {
    console.error('Gráficos: contexto de bônus não confirmado — Obrigado/Misterioso fora dos cálculos, snapshot não agendado:', err);
    if (token !== mountToken) return;
    obrigadoValuePerAppearance = 0;
    misteriosoTemplates = [];
    bonusContextConfirmed = false;
    const noteEl = document.getElementById('graficosContextNote');
    if (noteEl) {
      noteEl.textContent = '⚠ Não foi possível carregar o valor do Bônus Obrigado e os templates do Misterioso. Os valores abaixo estão SEM esses dois bônus (Saldo, Rollover e Bônus por Tipo podem aparecer menores que o real). Abra esta tela de novo quando a internet voltar.';
      noteEl.classList.remove('app-hidden');
    }
  }

  if (bonusContextConfirmed) {
    scheduleDailySnapshot(state.currentUid, state.platforms, resolveCtxForPlatform);
  }

  // (Análises) Abas — depois do contexto de bônus, pra a aba Análises
  // receber bonusContextConfirmed já resolvido. Se a aba lembrada for
  // Análises, a montagem dela espera o Chart.js sozinha.
  initGraficosTabs(container, token);

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
  // (Análises)
  unmountAnalise();
  analiseMounted = false;
  analiseMountPromise = null;
  // (Total Apostado)
  unmountTotalApostado();
  apostadoMounted = false;
  // (Planejador)
  unmountPlanejador();
  planejadorMounted = false;
  planejadorMountPromise = null;
  // (Rotinas)
  unmountRotinas();
  rotinasMounted = false;
  // (Misterioso)
  unmountMisterioso();
  misteriosoMounted = false;
  misteriosoMountPromise = null;
  // (Calendário)
  unmountCalendarioAnalytics();
  calendarioMounted = false;
  calendarioMountPromise = null;
  // (Jogos)
  unmountGameCatalog();
  jogosMounted = false;
}
