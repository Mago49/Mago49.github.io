// === UI DA ABA "ANÁLISES" (View Gráficos — Sub-entrega 1) ===
// Montada SOB DEMANDA por view-graficos.js: só na primeira vez que a aba
// é aberta, e só depois do Chart.js estar carregado (window.Chart). Um
// canvas criado dentro de um painel oculto (display:none) nasce com
// tamanho 0 — por isso nunca é montada escondida.
//
// NENHUM acesso ao Firestore: lê só state.platforms + o resolvedor de
// contexto de bônus que view-graficos.js já carregou (leitura estrita).
// Toda conta vem de analise-logic.js (puro).
//
// FILTRO DE PERÍODO: vale só pras seções marcadas com o selo "📅 Período"
// (Caixa acumulado, Mês a mês, RTP observado). Previsão do Rollover e
// Bônus previsto ignoram o filtro de propósito (estado atual / projeção).
// O período escolhido fica guardado durante a sessão (variável de módulo),
// igual à aba ativa de view-graficos.js.
//
// CONTEXTO DE BÔNUS NÃO CONFIRMADO: Previsão do Rollover e Bônus previsto
// dependem de Obrigado/Misterioso — aparecem como "indisponível", nunca
// com valor errado. Mês a mês continua, com aviso (só o Bônus muda).
//
// SEGURANÇA: nome de plataforma (editável pelo usuário) só entra em
// innerHTML via escapeHtml; nos gráficos, vai como texto do Chart.js.
//
// === (Sub-entrega 3) SALDO E ROLLOVER DIÁRIOS ===
// Única seção desta aba que LÊ o banco (dailySnapshots, via
// loadDailySnapshotsRange — só leitura, por intervalo, teto de 400 dias).
//   - CACHE NA SESSÃO: período já coberto pelo que foi lido não lê de novo;
//     o cache vale só pro dia em que foi lido (a virada do dia descarta).
//     Trocar a plataforma do seletor nunca lê o banco.
//   - CORRIDA: cada leitura tem um número; resposta de uma leitura antiga
//     (período trocado no meio, aba desmontada) é descartada.
//   - FALHA: só esta seção mostra o erro + "Tentar de novo"; as outras
//     seções continuam normais.
//   - HOJE: com contexto de bônus confirmado, o ponto de hoje é o valor AO
//     VIVO (computeLiveBalance/computeRolloverLive — mesmas funções do
//     Financeiro). Sem contexto, hoje não aparece (nem o retrato salvo).

import { state } from './state.js';
import { formatCurrency, escapeHtml } from './utils.js';
import { toLocalDateString, computeLiveBalance, computeRolloverLive } from './finance-logic.js';
import { loadDailySnapshotsRange } from './daily-snapshot-store.js';
import {
  resolvePeriodPreset, createAnaliseCache,
  computeCashFlowSeries, computeMonthlyComparison, computeObservedRtp,
  computeRolloverForecast, computeUpcomingBonus,
  clampDailyRange, listSnapshotPlatforms, buildDailyBalanceSeries,
  RTP_MIN_WAGERED, ROLLOVER_PACE_DAYS, DAILY_SNAPSHOT_MAX_DAYS, ALL_PLATFORMS
} from './analise-logic.js';

const PERIOD_PRESETS = [
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-anterior', label: 'Mês anterior' },
  { id: 'tudo', label: 'Tudo' },
  { id: 'custom', label: 'Personalizado' }
];

// Sobrevive à troca de rota (sessão), como a aba ativa.
const periodState = { preset: '90d', customFrom: '', customTo: '' };

let rootEl = null;
let resolveCtx = () => ({});
let contextConfirmed = false;
let mounted = false;

const charts = { cash: null, monthly: null, rtp: null, daily: null };

// (Sub-entrega 3) Saldo/Rollover diários.
let dailyCache = null;       // { uid, loadedOn, from, to, docs } — sessão
let dailyRequest = 0;        // número da leitura em andamento (corrida)
let dailyLoading = false;
let dailyRange = null;       // último período (já limitado) pedido
let dailyPlatform = ALL_PLATFORMS; // seleção do seletor (sessão)
let dailyLive = null;        // { at, data } — valor ao vivo de hoje, reaproveitado por 60 s
const DAILY_LIVE_TTL_MS = 60000;

// ---------- helpers ----------

function formatDayKey(key) {
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function formatDayKeyShort(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function formatMonthKey(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${m}/${y.slice(2)}`;
}

function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function destroyChart(name) {
  if (charts[name]) {
    charts[name].destroy();
    charts[name] = null;
  }
}

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function setNote(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('app-hidden', !text);
}

function moneyTooltip() {
  return { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}` } };
}

// ---------- esqueleto ----------

function sectionHeading(title, description, withPeriodBadge) {
  return `
    <div class="section-heading" style="padding:0 0 0.9rem;">
      <div>
        <h2>${title}${withPeriodBadge ? ' <span class="graficos-period-badge">📅 Período</span>' : ''}</h2>
        ${description ? `<p>${description}</p>` : ''}
      </div>
    </div>`;
}

function renderSkeleton() {
  const presetButtons = PERIOD_PRESETS.map(p =>
    `<button type="button" class="vip-filter-btn graficos-period-btn" data-preset="${p.id}">${p.label}</button>`
  ).join('');

  rootEl.innerHTML = `
    <p id="analiseContextNote" class="graficos-note app-hidden"></p>

    <section class="card-shell graficos-section" aria-label="Período das análises">
      ${sectionHeading('Período', 'Vale só para as seções marcadas com 📅 Período.', false)}
      <div class="graficos-period-bar" role="group" aria-label="Escolher período">${presetButtons}</div>
      <div id="analiseCustomRange" class="graficos-period-custom app-hidden">
        <label for="analiseFrom">De</label>
        <input type="date" id="analiseFrom" aria-label="Data inicial" />
        <label for="analiseTo">Até</label>
        <input type="date" id="analiseTo" aria-label="Data final" />
      </div>
      <p id="analisePeriodLabel" class="graficos-note"></p>
      <p id="analisePeriodError" class="graficos-note graficos-note-warn app-hidden"></p>
    </section>

    <section class="card-shell graficos-section" aria-label="Resultado de caixa acumulado" style="margin-top:1.1rem;">
      ${sectionHeading('Resultado de Caixa Acumulado', 'Saques − Depósitos de todas as plataformas, acumulado desde o início do período. Acima de zero: saiu mais do que entrou.', true)}
      <div id="analiseCashCards" class="analise-cards"></div>
      <p id="analiseCashNote" class="graficos-note app-hidden"></p>
      <div class="chart-wrap"><canvas id="analiseCashChart"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Comparativo mês a mês" style="margin-top:1.1rem;">
      ${sectionHeading('Comparativo Mês a Mês', 'Depósito, Saque, Bônus e Resultado Betting de todas as plataformas, por mês.', true)}
      <p id="analiseMonthlyNote" class="graficos-note app-hidden"></p>
      <div class="chart-wrap"><canvas id="analiseMonthlyChart"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="RTP observado por plataforma" style="margin-top:1.1rem;">
      ${sectionHeading('RTP Observado por Plataforma', `(Apostado + R.B.) ÷ Apostado — quanto voltou de cada R$ 1,00 apostado. Só entram plataformas com pelo menos ${formatCurrency(RTP_MIN_WAGERED)} apostados no período.`, true)}
      <div id="analiseRtpCards" class="analise-cards"></div>
      <p id="analiseRtpNote" class="graficos-note app-hidden"></p>
      <div id="analiseRtpWrap" class="chart-wrap"><canvas id="analiseRtpChart"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Saldo e Rollover diários" style="margin-top:1.1rem;">
      ${sectionHeading('Saldo e Rollover Diários', 'Retrato salvo pelo app em cada dia (o da última abertura do Financeiro ou dos Gráficos naquele dia). Dia sem abertura aparece como lacuna — nunca como valor estimado.', true)}
      <div class="graficos-period-custom" style="padding-top:0; padding-bottom:0.9rem;">
        <label for="analiseDailyPlatform">Plataforma</label>
        <select id="analiseDailyPlatform" aria-label="Plataforma do gráfico diário" style="padding:0.55rem 0.7rem; border:1px solid #e6e9ee; border-radius:12px; outline:none; max-width:100%;"></select>
      </div>
      <div id="analiseDailyCards" class="analise-cards"></div>
      <p id="analiseDailyNote" class="graficos-note app-hidden"></p>
      <div id="analiseDailyError" class="app-hidden">
        <p id="analiseDailyErrorText" class="graficos-note graficos-note-warn"></p>
        <button type="button" id="analiseDailyRetry" class="bet-manage-btn" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
      </div>
      <div id="analiseDailyWrap" class="chart-wrap"><canvas id="analiseDailyChart"></canvas></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Previsão de liberação do Rollover" style="margin-top:1.1rem;">
      ${sectionHeading('Previsão de Liberação do Rollover', `Rollover atual ÷ média apostada por dia nos últimos ${ROLLOVER_PACE_DAYS} dias. Estado atual — não usa o filtro de período.`, false)}
      <div id="analiseRolloverBody"></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Bônus previsto" style="margin-top:1.1rem;">
      ${sectionHeading('Bônus Previsto', 'Projeção pela fórmula, a partir de amanhã (o bônus de hoje já está no Saldo/Rollover ao vivo). Não usa o filtro de período.', false)}
      <div id="analiseUpcomingBody"></div>
    </section>
  `;
}

// ---------- controles de período ----------

function applyPresetButtons() {
  rootEl.querySelectorAll('.graficos-period-btn').forEach(btn => {
    const active = btn.dataset.preset === periodState.preset;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const customWrap = $('analiseCustomRange');
  if (customWrap) customWrap.classList.toggle('app-hidden', periodState.preset !== 'custom');
}

function initPeriodControls() {
  rootEl.querySelectorAll('.graficos-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      periodState.preset = btn.dataset.preset;
      applyPresetButtons();
      renderPeriodSections();
    });
  });

  const fromInput = $('analiseFrom');
  const toInput = $('analiseTo');
  if (fromInput) fromInput.value = periodState.customFrom;
  if (toInput) toInput.value = periodState.customTo;

  const onCustomChange = () => {
    periodState.customFrom = fromInput ? fromInput.value : '';
    periodState.customTo = toInput ? toInput.value : '';
    if (periodState.preset === 'custom') renderPeriodSections();
  };
  if (fromInput) fromInput.addEventListener('change', onCustomChange);
  if (toInput) toInput.addEventListener('change', onCustomChange);

  applyPresetButtons();
}

// (Sub-entrega 3) Seletor de plataforma e "Tentar de novo" do gráfico diário.
function initDailyControls() {
  const select = $('analiseDailyPlatform');
  if (select) {
    select.addEventListener('change', () => {
      dailyPlatform = select.value || ALL_PLATFORMS;
      // Leitura em andamento: o desenho que vier dela já usa a nova seleção.
      if (dailyLoading || !dailyRange) return;
      renderDailySection(dailyRange); // período já coberto -> sem leitura
    });
  }
  const retry = $('analiseDailyRetry');
  if (retry) {
    retry.addEventListener('click', () => {
      if (dailyRange) renderDailySection(dailyRange);
    });
  }
}

// ---------- seções COM período ----------

function renderCashSection(range) {
  const series = computeCashFlowSeries(state.platforms, range.from, range.to);
  const cards = $('analiseCashCards');
  if (cards) {
    cards.innerHTML = `
      <div class="summary-card"><span class="summary-label">Depositado</span><span class="summary-value">${formatCurrency(series.deposit)}</span></div>
      <div class="summary-card"><span class="summary-label">Sacado</span><span class="summary-value">${formatCurrency(series.withdrawal)}</span></div>
      <div class="summary-card"><span class="summary-label">Resultado de caixa</span><span class="summary-value ${series.result >= 0 ? 'analise-pos' : 'analise-neg'}">${formatCurrency(series.result)}</span></div>`;
  }

  destroyChart('cash');
  if (series.points.length === 0) {
    setNote('analiseCashNote', 'Nenhum depósito ou saque no período.');
    return;
  }
  setNote('analiseCashNote', series.granularity === 'week'
    ? 'Período longo: um ponto por semana (segunda-feira) para manter o gráfico legível.'
    : '');

  const canvas = $('analiseCashChart');
  if (!canvas || !window.Chart) return;
  charts.cash = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: series.points.map(pt => formatDayKeyShort(pt.key)),
      datasets: [{
        label: 'Caixa acumulado',
        data: series.points.map(pt => pt.cumulative),
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15,118,110,0.12)',
        fill: 'origin',
        tension: 0.2,
        pointRadius: series.points.length > 60 ? 0 : 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: moneyTooltip() }
    }
  });
}

function renderMonthlySection(range, cache, refDate) {
  const data = computeMonthlyComparison(state.platforms, range.from, range.to, resolveCtx, refDate, cache);
  destroyChart('monthly');

  const notes = [];
  if (data.truncated) notes.push('Mostrando só os 24 meses mais recentes do período.');
  if (data.months.some(m => m.partial)) notes.push('Meses cortados pelo período mostram só os dias dentro dele.');
  if (data.estimatedCount > 0) notes.push(`${data.estimatedCount} semana(s) fechada(s) atravessam a virada do mês ou o limite do período: nelas o Bônus é o da fórmula + avulso, não o bônus real do fechamento.`);
  if (data.excludedCount > 0) notes.push(`${data.excludedCount} semana(s) antiga(s) (backfill, sem detalhe por dia) cortada(s) pelo recorte ficaram de fora.`);
  if (!contextConfirmed) notes.push('Sem as configurações de Obrigado/Misterioso: o Bônus pode aparecer menor que o real.');

  if (data.months.length === 0) {
    setNote('analiseMonthlyNote', 'Nenhum registro no período.');
    return;
  }
  setNote('analiseMonthlyNote', notes.join(' '));

  const canvas = $('analiseMonthlyChart');
  if (!canvas || !window.Chart) return;
  charts.monthly = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.months.map(m => formatMonthKey(m.month) + (m.partial ? '*' : '')),
      datasets: [
        { label: 'Depósito', data: data.months.map(m => m.deposit), backgroundColor: '#2563eb' },
        { label: 'Saque', data: data.months.map(m => m.withdrawal), backgroundColor: '#ef4444' },
        { label: 'Bônus', data: data.months.map(m => m.bonus), backgroundColor: '#7c3aed' },
        { label: 'R.B.', data: data.months.map(m => m.resultBetting), backgroundColor: '#f59e0b' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: moneyTooltip() }
    }
  });
}

function renderRtpSection(range, cache, refDate) {
  const data = computeObservedRtp(state.platforms, range.from, range.to, resolveCtx, refDate, cache);
  destroyChart('rtp');

  const cards = $('analiseRtpCards');
  if (cards) {
    cards.innerHTML = `
      <div class="summary-card"><span class="summary-label">RTP geral</span><span class="summary-value">${formatPercent(data.overall.rtp)}</span></div>
      <div class="summary-card"><span class="summary-label">Apostado no período</span><span class="summary-value">${formatCurrency(data.overall.wagered)}</span></div>
      <div class="summary-card"><span class="summary-label">R.B. no período</span><span class="summary-value ${data.overall.resultBetting >= 0 ? 'analise-pos' : 'analise-neg'}">${formatCurrency(data.overall.resultBetting)}</span></div>`;
  }

  const notes = [];
  if (data.belowMinimum > 0) notes.push(`${data.belowMinimum} plataforma(s) com menos de ${formatCurrency(data.minWagered)} apostados ficaram fora do ranking (entram no RTP geral).`);
  if (data.excludedCount > 0) notes.push(`${data.excludedCount} semana(s) de backfill cortada(s) pelo período ficaram de fora.`);

  const wrap = $('analiseRtpWrap');
  if (data.rows.length === 0) {
    notes.unshift('Nenhuma plataforma atingiu o mínimo de apostas no período.');
    setNote('analiseRtpNote', notes.join(' '));
    if (wrap) wrap.classList.add('app-hidden');
    return;
  }
  setNote('analiseRtpNote', notes.join(' '));
  if (wrap) {
    wrap.classList.remove('app-hidden');
    wrap.style.height = `${Math.max(240, data.rows.length * 28 + 60)}px`;
  }

  const canvas = $('analiseRtpChart');
  if (!canvas || !window.Chart) return;
  const rows = data.rows;
  charts.rtp = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{
        label: 'RTP observado',
        data: rows.map(r => Math.round(r.rtp * 1000) / 10),
        backgroundColor: rows.map(r => (r.rtp >= 1 ? '#15803d' : '#ef4444'))
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const r = rows[c.dataIndex];
              return `RTP ${formatPercent(r.rtp)} — apostado ${formatCurrency(r.wagered)}, R.B. ${formatCurrency(r.resultBetting)}`;
            }
          }
        }
      },
      scales: { x: { ticks: { callback: (v) => `${v}%` } } }
    }
  });
}

function renderPeriodSections() {
  if (!mounted || !rootEl) return;
  const refDate = new Date();
  const range = resolvePeriodPreset(periodState.preset, refDate, { from: periodState.customFrom, to: periodState.customTo });

  if (!range.ok) {
    setNote('analisePeriodError', range.error);
    setNote('analisePeriodLabel', '');
    return; // mantém os gráficos do último período válido
  }
  setNote('analisePeriodError', '');
  setNote('analisePeriodLabel', range.from
    ? `Período: ${formatDayKey(range.from)} a ${formatDayKey(range.to)}`
    : `Período: desde o primeiro registro até ${formatDayKey(range.to)}`);

  const cache = createAnaliseCache();
  renderCashSection(range);
  renderMonthlySection(range, cache, refDate);
  renderRtpSection(range, cache, refDate);
  renderDailySection(range);
}

// ---------- (Sub-entrega 3) SALDO E ROLLOVER DIÁRIOS ----------

function showDailyError(text) {
  const box = $('analiseDailyError');
  const msg = $('analiseDailyErrorText');
  if (msg) msg.textContent = text || '';
  if (box) box.classList.toggle('app-hidden', !text);
}

function setDailyChartVisible(visible) {
  const wrap = $('analiseDailyWrap');
  if (wrap) wrap.classList.toggle('app-hidden', !visible);
}

// Valor AO VIVO de hoje, por plataforma (mesmas funções do Financeiro).
// Reaproveitado por 60 s: trocar a plataforma no seletor não recalcula as 42.
function getLiveToday(todayKey) {
  const now = Date.now();
  if (dailyLive && dailyLive.dayKey === todayKey && now - dailyLive.at < DAILY_LIVE_TTL_MS) {
    return dailyLive.data;
  }
  const refDate = new Date();
  const platforms = {};
  state.platforms.forEach(p => {
    const ctx = resolveCtx(p);
    platforms[p.id] = {
      name: p.name,
      balance: computeLiveBalance(p, refDate, ctx),
      rollover: computeRolloverLive(p, refDate, ctx)
    };
  });
  const data = { dayKey: todayKey, platforms };
  dailyLive = { at: now, dayKey: todayKey, data };
  return data;
}

function fillDailySelect(options) {
  const select = $('analiseDailyPlatform');
  if (!select) return;
  if (dailyPlatform !== ALL_PLATFORMS && !options.some(o => o.id === dailyPlatform)) {
    dailyPlatform = ALL_PLATFORMS;
  }
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = ALL_PLATFORMS;
  all.textContent = 'Todas as plataformas (soma)';
  select.appendChild(all);
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.current ? o.name : `${o.name} (excluída)`;
    select.appendChild(opt);
  });
  select.value = dailyPlatform;
}

// Raio dos pontos: em séries longas, só aparecem os pontos ISOLADOS (dia
// com retrato entre duas lacunas — sem isso ele sumiria) e o de hoje.
function pointRadii(points, field) {
  const dense = points.length > 60;
  return points.map((pt, i) => {
    if (pt[field] === null) return 0;
    if (pt.live) return 5;
    if (!dense) return 2;
    const prev = i > 0 ? points[i - 1][field] : null;
    const next = i < points.length - 1 ? points[i + 1][field] : null;
    return (prev === null && next === null) ? 3 : 0;
  });
}

function drawDaily(range, docs) {
  if (!mounted || !rootEl) return;
  const todayKey = toLocalDateString(new Date());
  const todayInRange = todayKey >= range.from && todayKey <= range.to;

  // Sem contexto confirmado, hoje não aparece (nem o retrato salvo).
  const usableDocs = contextConfirmed ? docs : docs.filter(d => d.day !== todayKey);
  const live = (contextConfirmed && todayInRange) ? getLiveToday(todayKey) : null;

  fillDailySelect(listSnapshotPlatforms(usableDocs, state.platforms));
  const series = buildDailyBalanceSeries(usableDocs, range.from, range.to, dailyPlatform, live);

  const cards = $('analiseDailyCards');
  if (cards) {
    cards.replaceChildren();
    const card = (label, value, note) => {
      const c = document.createElement('div');
      c.className = 'summary-card';
      const l = document.createElement('span'); l.className = 'summary-label'; l.textContent = label; c.appendChild(l);
      const v = document.createElement('span'); v.className = 'summary-value'; v.textContent = value; c.appendChild(v);
      if (note) { const n = document.createElement('span'); n.className = 'summary-note'; n.textContent = note; c.appendChild(n); }
      return c;
    };
    const last = series.last;
    const lastNote = last ? (last.live ? 'Hoje (ao vivo)' : `Retrato de ${formatDayKey(last.key)}`) : '';
    cards.appendChild(card('Saldo', last && last.balance !== null ? formatCurrency(last.balance) : '—', lastNote));
    cards.appendChild(card('Rollover', last && last.rollover !== null ? formatCurrency(last.rollover) : '—', lastNote));
    cards.appendChild(card('Dias com retrato', `${series.daysWithData} de ${series.totalDays}`));
  }

  const notes = [];
  if (range.clamped) notes.push(`Período longo: mostrando só os últimos ${DAILY_SNAPSHOT_MAX_DAYS} dias.`);
  if (series.liveUsed) notes.push('O ponto de hoje (maior) é o valor ao vivo, calculado agora.');
  if (!contextConfirmed && todayInRange) notes.push('Hoje não aparece: as configurações de Obrigado/Misterioso não foram carregadas.');
  if (series.partialDays > 0) notes.push(`${series.partialDays} dia(s) com retrato incompleto de alguma plataforma: a soma desses dias considera só os valores válidos.`);

  destroyChart('daily');
  if (series.daysWithData === 0) {
    notes.unshift('Nenhum retrato diário salvo neste período. Os retratos são gravados quando você abre o Financeiro ou os Gráficos.');
    setNote('analiseDailyNote', notes.join(' '));
    setDailyChartVisible(false);
    return;
  }
  setNote('analiseDailyNote', notes.join(' '));
  setDailyChartVisible(true);

  const canvas = $('analiseDailyChart');
  if (!canvas || !window.Chart) return;
  const points = series.points;
  charts.daily = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(pt => formatDayKeyShort(pt.key)),
      datasets: [
        {
          label: 'Saldo',
          data: points.map(pt => pt.balance),
          borderColor: '#15803d',
          backgroundColor: '#15803d',
          spanGaps: false,
          tension: 0.2,
          pointRadius: pointRadii(points, 'balance')
        },
        {
          label: 'Rollover',
          data: points.map(pt => pt.rollover),
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          spanGaps: false,
          tension: 0.2,
          pointRadius: pointRadii(points, 'rollover')
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}${points[c.dataIndex].live ? ' (ao vivo)' : ''}`
          }
        }
      },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// range: { from, to } do filtro de período (from pode ser null = "Tudo").
function renderDailySection(range) {
  if (!mounted || !rootEl) return;
  const limited = clampDailyRange(range.from, range.to);
  dailyRange = limited;
  showDailyError('');

  const uid = state.currentUid;
  const todayKey = toLocalDateString(new Date());
  const cacheOk = !!dailyCache
    && dailyCache.uid === uid
    && dailyCache.loadedOn === todayKey
    && dailyCache.from <= limited.from
    && dailyCache.to >= limited.to;

  if (cacheOk) {
    dailyRequest++; // descarta qualquer leitura antiga ainda em andamento
    dailyLoading = false;
    drawDaily(limited, dailyCache.docs);
    return;
  }

  const req = ++dailyRequest;
  dailyLoading = true;
  destroyChart('daily');
  setDailyChartVisible(false);
  const cards = $('analiseDailyCards');
  if (cards) cards.replaceChildren();
  setNote('analiseDailyNote', 'Carregando os retratos diários…');

  loadDailySnapshotsRange(uid, limited.from, limited.to)
    .then(docs => {
      if (req !== dailyRequest || !mounted) return; // resposta antiga: descarta
      dailyLoading = false;
      dailyCache = { uid, loadedOn: todayKey, from: limited.from, to: limited.to, docs };
      drawDaily(limited, docs);
    })
    .catch(err => {
      if (req !== dailyRequest || !mounted) return;
      dailyLoading = false;
      console.error('Análises: falha ao ler os retratos diários (dailySnapshots):', err);
      setNote('analiseDailyNote', '');
      showDailyError('Não foi possível ler os retratos diários do banco de dados. Nada foi alterado. Verifique a internet e tente de novo.');
    });
}

// ---------- seções SEM período ----------

function unavailableHtml() {
  return '<p class="graficos-note graficos-note-warn">Indisponível: as configurações de Obrigado/Misterioso não foram carregadas. Abra a tela de novo quando a internet voltar.</p>';
}

function renderRolloverSection(refDate) {
  const body = $('analiseRolloverBody');
  if (!body) return;
  if (!contextConfirmed) { body.innerHTML = unavailableHtml(); return; }

  const data = computeRolloverForecast(state.platforms, resolveCtx, refDate);
  if (data.rows.length === 0) {
    body.innerHTML = '<p class="graficos-note">Nenhuma plataforma com Rollover pendente.</p>';
    return;
  }

  const rowsHtml = data.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${formatCurrency(r.rollover)}</td>
      <td class="num">${r.dailyPace > 0 ? formatCurrency(r.dailyPace) : '—'}</td>
      <td class="num">${r.days === null ? '<span class="analise-muted">sem ritmo de apostas</span>' : `~${r.days} dia(s)`}</td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="analise-cards">
      <div class="summary-card"><span class="summary-label">Rollover pendente (total)</span><span class="summary-value">${formatCurrency(data.totalRollover)}</span></div>
      <div class="summary-card"><span class="summary-label">Plataformas com Rollover</span><span class="summary-value">${data.rows.length}</span></div>
    </div>
    <div class="analise-table-wrap">
      <table class="analise-table">
        <thead><tr><th>Plataforma</th><th class="num">Rollover</th><th class="num">Média/dia (${data.paceDays}d)</th><th class="num">Previsão</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function renderUpcomingSection(refDate) {
  const body = $('analiseUpcomingBody');
  if (!body) return;
  if (!contextConfirmed) { body.innerHTML = unavailableHtml(); return; }

  const data = computeUpcomingBonus(state.platforms, resolveCtx, refDate);
  const weekLabel = data.fromKey > data.weekEndKey ? 'semana já termina hoje' : `${formatDayKeyShort(data.fromKey)} a ${formatDayKeyShort(data.weekEndKey)}`;
  const monthLabel = data.fromKey > data.monthEndKey ? 'mês já termina hoje' : `${formatDayKeyShort(data.fromKey)} a ${formatDayKeyShort(data.monthEndKey)}`;

  const rowsHtml = data.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${formatCurrency(r.week)}</td>
      <td class="num">${formatCurrency(r.month)}</td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="analise-cards">
      <div class="summary-card"><span class="summary-label">Até domingo</span><span class="summary-value">${formatCurrency(data.totals.week)}</span><span class="summary-note">${weekLabel}</span></div>
      <div class="summary-card"><span class="summary-label">Até o fim do mês</span><span class="summary-value">${formatCurrency(data.totals.month)}</span><span class="summary-note">${monthLabel}</span></div>
      <div class="summary-card"><span class="summary-label">Mês — VIP</span><span class="summary-value">${formatCurrency(data.monthByType.vip)}</span></div>
      <div class="summary-card"><span class="summary-label">Mês — Obrigado</span><span class="summary-value">${formatCurrency(data.monthByType.obrigado)}</span></div>
      <div class="summary-card"><span class="summary-label">Mês — Misterioso</span><span class="summary-value">${formatCurrency(data.monthByType.misterioso)}</span></div>
    </div>
    <p class="graficos-note">O Bônus Diário do grupo COM só é liberado em dia com aposta registrada — por isso nunca entra na projeção de dias futuros.</p>
    ${data.rows.length === 0
      ? '<p class="graficos-note">Nenhum bônus previsto pela fórmula no período restante.</p>'
      : `<div class="analise-table-wrap">
          <table class="analise-table">
            <thead><tr><th>Plataforma</th><th class="num">Até domingo</th><th class="num">Até fim do mês</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`}`;
}

function renderAll() {
  if (!mounted || !rootEl) return;
  const refDate = new Date();
  setNote('analiseContextNote', contextConfirmed
    ? ''
    : '⚠ Não foi possível carregar o valor do Bônus Obrigado e os templates do Misterioso. Previsão do Rollover e Bônus previsto ficam indisponíveis; o Bônus do Mês a Mês pode aparecer menor que o real.');
  renderPeriodSections();
  renderRolloverSection(refDate);
  renderUpcomingSection(refDate);
}

// ---------- API pública (view-graficos.js) ----------

// Chamar só com window.Chart já carregado e com o painel VISÍVEL.
export function mountAnalise(root, options = {}) {
  if (!root) return;
  unmountAnalise();
  rootEl = root;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  mounted = true;

  renderSkeleton();
  initPeriodControls();
  initDailyControls();
  renderAll();
}

// Virada do dia (view-graficos.js). Não faz nada se a aba nunca foi aberta.
// (Sub-entrega 3) Descarta o cache dos retratos e o valor ao vivo: o dia
// que era "hoje" virou passado e o retrato dele precisa ser lido.
export function refreshAnalise() {
  if (!mounted) return;
  dailyCache = null;
  dailyLive = null;
  renderAll();
}

// Ao voltar pra aba: garante o tamanho certo dos gráficos.
export function resizeAnaliseCharts() {
  Object.values(charts).forEach(c => { if (c) c.resize(); });
}

export function unmountAnalise() {
  destroyChart('cash');
  destroyChart('monthly');
  destroyChart('rtp');
  destroyChart('daily');
  // (Sub-entrega 3) invalida leitura em andamento; o cache da sessão fica
  // (vale só pro dia em que foi lido — ver renderDailySection).
  dailyRequest++;
  dailyLoading = false;
  dailyRange = null;
  dailyLive = null;
  mounted = false;
  rootEl = null;
  resolveCtx = () => ({});
  contextConfirmed = false;
}
