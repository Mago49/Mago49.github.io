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

import { state } from './state.js';
import { formatCurrency } from './utils.js';
import {
  computeGlobalKpis, computeWeeklyBalanceSeries,
  computeWeeklyDepositWithdrawal, computeBonusByTypeCurrentMonth
} from './analytics-logic.js';
import { loadObrigadoValuePerAppearance } from './vip-obrigado-store.js';
import { loadMisteriosoTemplates } from './vip-misterioso-store.js';

let dailyTimer = null;
let chartJsLoadPromise = null;
let balanceChart = null;
let depositWithdrawalChart = null;
let bonusTypeChart = null;

let obrigadoValuePerAppearance = 0.30;
let misteriosoTemplates = [];

function loadChartJsScript() {
  if (window.Chart) return Promise.resolve();
  if (chartJsLoadPromise) return chartJsLoadPromise;
  chartJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Chart.js'));
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

function refreshPage() {
  renderKpis();
  renderBalanceChart();
  renderDepositWithdrawalChart();
  renderBonusTypeChart();
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
  `;

  obrigadoValuePerAppearance = await loadObrigadoValuePerAppearance(state.currentUid);
  misteriosoTemplates = await loadMisteriosoTemplates(state.currentUid);

  await loadChartJsScript();

  refreshPage();
  scheduleDailyUpdate();
}

export function unmount() {
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  if (balanceChart) { balanceChart.destroy(); balanceChart = null; }
  if (depositWithdrawalChart) { depositWithdrawalChart.destroy(); depositWithdrawalChart = null; }
  if (bonusTypeChart) { bonusTypeChart.destroy(); bonusTypeChart = null; }
}
