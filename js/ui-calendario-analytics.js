// === UI DA ABA "CALENDÁRIO" (View Gráficos — Sub-entrega 8b) ===
// Calendário próprio do Analytics — a Página 2 (Calendário do Misterioso)
// não muda. Grade mensal leve (sem FullCalendar), pensada pro celular.
//
// CAMADAS (liga/desliga): 🎯 Plano (planejado × real) · 💰 Depósitos por
// tipo · 🃏 Emissões do Misterioso · ✔️ Rotinas · 🚫 Dias proibidos.
// Filtro: todas as plataformas ou uma. Tocar no dia abre o detalhe num
// mini-contêiner centralizado.
//
// CARDS: "Planejado × real" do mês (cumprimento, desvio, acima do plano +
// gráfico acumulado) e "Resultado real" (vitórias/derrotas por lançamento,
// + "Por jogo / Por provedor" — Sub-entrega 9,
// multiplicador de perda, giro, % acima do plano, % acima do limite 🎲) —
// dia, semana ou mês. Configurações: limite do 🟡 e prazo do histórico.
//
// BANCO: plan-store.js (planos + plannerConfig/calendar), plan-log-store.js
// (histórico do planejado — fecha os dias que passaram e limpa pelo prazo).
// Leitura estrita (falha = aba bloqueada com "Tentar de novo"); rotinas
// tolerantes (sem elas, a camada some com aviso). Nunca grava plataforma.
//
// SEGURANÇA: nomes só por textContent.
//
// === (Sub-entrega 23) CONTÊINER DO DIA ===
// Uma lista ÚNICA por plataforma (antes: seções separadas Plano /
// Depósitos / Emissão / Rotinas / Proibido). Em cada plataforma:
//   - o PLANO é a meta de aposta do dia (real de planejado);
//   - 👉 hoje: o que falta apostar, em giros da paleta do plano;
//     futuro: as apostas planejadas do dia;
//   - rotina de APOSTA vira só selo (o plano manda na aposta); rotina de
//     aposta que vale no dia SEM plano = "⚠️ Sem plano" + "Abrir no
//     Planejador" (abre a aba já com a plataforma escolhida);
//   - rotinas de depósito/lembrete, depósitos feitos, 🃏 emissão e 🚫 dia
//     proibido na mesma plataforma.
// Pendentes primeiro (hoje: falta apostar/fazer; passado: não cumpridos;
// futuro: sem plano).
// Card "Resultado real": "🔎 De onde vem o planejado" lista os dias ×
// plataformas que formam o planejado do "Real × plano" (dias fechados —
// hoje fica de fora até fechar).

import { state } from './state.js';
import { formatCurrency, showAppAlert } from './utils.js';
import { toLocalDateString, getWeekStart, getWeekEnd } from './finance-logic.js';
import {
  buildMonthGrid, buildCalendarMonth, summarizePlanVsReal, computeRealMetrics,
  monthTitle, shiftMonth, monthRange, addDaysKey, buildDayPlatforms, suggestForRow, dayStatus
} from './calendar-logic.js';
import { requestPlanejadorFocus } from './ui-planejador.js';
import {
  loadPlannerData, isPlannerLoaded, getSavedPlans, getCalendarSettings, saveCalendarSettings, getStrategySettings
} from './plan-store.js';
import {
  loadPlanLogs, getPlanLogEntry, logPlanPastDays, purgeOldPlanLogs, retentionCutoff, PLAN_LOG_RETENTION_OPTIONS
} from './plan-log-store.js';
import { loadRoutineData, isRoutinesLoaded, getRoutines, getRoutineLogs, getMarks } from './routine-store.js';
import { ROUTINE_HISTORY_DAYS } from './routine-logic.js';
import { DEPOSIT_KINDS } from './deposit-kinds.js';
import { computeGameStats } from './game-catalog-logic.js';

const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LAYERS = [
  { id: 'plan', label: '🎯 Plano' },
  { id: 'deposits', label: '💰 Depósitos' },
  { id: 'misterioso', label: '🃏 Misterioso' },
  { id: 'routines', label: '✔️ Rotinas' },
  { id: 'forbidden', label: '🚫 Proibidos' }
];
const STATUS_ICON = { done: '✅', partial: '🟡', miss: '❌', today: '⏳', future: '·' };
const STATUS_LABEL = { done: 'Cumprido', partial: 'Parcial', miss: 'Não cumprido', today: 'Em andamento', future: 'Planejado' };
const RT_ICON = { done: '✅', ok: '🟢', pending: '⏳', missed: '❌', broken: '⚠️', due: '·' };
const RT_ACTION_ICON = { deposit: '💰', reminder: '🔔', 'no-deposit': '🚫💰', bet: '🎲' };
const TIER_LABEL = { baixo: 'baixo', medio: 'médio', alto: 'alto' };

let rootEl = null;
let mounted = false;
let busy = false;
let resolveCtx = () => ({});
let contextConfirmed = false;
let loadStatus = 'idle';
let loadToken = 0;
let chart = null;
let routinesFailed = false;
let logNote = '';

const ui = {
  ym: null,
  platformId: '',
  layers: new Set(LAYERS.map(l => l.id)),
  selectedKey: null,
  period: 'month',
  gameBy: 'game',
  draftThreshold: null,
  draftRetention: null
};

// ---------- helpers ----------

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function el(tag, className = '', text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null && text !== undefined) n.textContent = text;
  return n;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function money(c) {
  return formatCurrency((Number(c) || 0) / 100);
}

function pct(x, digits = 0) {
  return `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
}

function todayKey() {
  return toLocalDateString(new Date());
}

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_FULL[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function kpi(label, value, note, extra = '') {
  const c = el('div', `summary-card plan-kpi${extra ? ` ${extra}` : ''}`);
  c.appendChild(el('span', 'summary-label', label));
  c.appendChild(el('span', 'summary-value', value));
  if (note) c.appendChild(el('span', 'summary-note', note));
  return c;
}

function sortedPlatforms() {
  return [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
}

function filteredPlatforms() {
  return ui.platformId ? state.platforms.filter(p => p.id === ui.platformId) : state.platforms;
}

function world() {
  return {
    todayKey: todayKey(),
    getPlanLog: getPlanLogEntry,
    plans: new Map(getSavedPlans().map(p => [p.platformId, p])),
    thresholdPct: getCalendarSettings().partialThreshold
  };
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="calLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="calRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <div id="calMain" class="app-hidden">
      <section class="card-shell graficos-section" aria-label="Calendário">
        <div class="cal-toolbar">
          <button type="button" id="calPrev" class="cal-nav" aria-label="Mês anterior">‹</button>
          <strong id="calTitle" class="cal-title"></strong>
          <button type="button" id="calNext" class="cal-nav" aria-label="Próximo mês">›</button>
          <button type="button" id="calToday" class="bet-manage-btn cal-today">Hoje</button>
        </div>
        <div class="cal-filters">
          <select id="calPlatform" class="plan-input" aria-label="Plataforma"></select>
          <div id="calLayers" class="plan-chips" role="group" aria-label="Camadas"></div>
        </div>
        <div id="calGrid" class="cal-grid" role="grid"></div>
        <p class="plan-hint cal-legend">✅ cumprido · 🟡 parcial · ❌ não cumprido · ⏳ hoje · 💰 depósito · 🃏 Misterioso · 🚫 proibido</p>
      </section>

      <section class="card-shell graficos-section" aria-label="Planejado × real" style="margin-top:1.1rem;">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div><h2>Planejado × real</h2><p id="calPvrSub"></p></div>
        </div>
        <div id="calPvr" class="plan-kpis"></div>
        <div id="calChartWrap" class="chart-wrap cal-chart"><canvas id="calChart"></canvas></div>
      </section>

      <section class="card-shell graficos-section" aria-label="Resultado real" style="margin-top:1.1rem;">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div><h2>Resultado real</h2><p>Por lançamento (cada lançamento do Financeiro é uma sessão).</p></div>
        </div>
        <div id="calPeriod" class="plan-chips cal-period" role="group" aria-label="Período"></div>
        <div id="calMetrics" class="plan-kpis"></div>
        <div id="calPvrDetail" class="cal-pvr-detail"></div>
        <div class="cal-games">
          <div class="cal-games-head">
            <strong>🎰 Por jogo</strong>
            <div id="calGameBy" class="plan-chips" role="group" aria-label="Agrupar por"></div>
          </div>
          <div id="calGames" class="cal-games-list"></div>
        </div>
      </section>

      <section class="card-shell graficos-section" aria-label="Configurações do Calendário" style="margin-top:1.1rem;">
        <details class="cal-settings">
          <summary>⚙️ Configurações</summary>
          <div id="calSettings" class="cal-settings-body"></div>
        </details>
      </section>
    </div>
  `;
  $('calRetry').addEventListener('click', () => loadData(true));
  $('calPrev').addEventListener('click', () => { ui.ym = shiftMonth(ui.ym, -1); ui.selectedKey = null; renderAll(); });
  $('calNext').addEventListener('click', () => { ui.ym = shiftMonth(ui.ym, 1); ui.selectedKey = null; renderAll(); });
  $('calToday').addEventListener('click', () => { ui.ym = todayKey().slice(0, 7); ui.selectedKey = null; renderAll(); });
  $('calPlatform').addEventListener('change', (e) => { ui.platformId = e.target.value; renderAll(); });
}

function renderLoadState() {
  const note = $('calLoadNote');
  const retry = $('calRetry');
  const main = $('calMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando planos e histórico…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar os planos e o histórico do planejado. Pra não gravar nada em cima do que não foi lido, a aba fica bloqueada. Verifique a internet e tente de novo.';
  if (loadStatus === 'ok') {
    const parts = [];
    if (routinesFailed) parts.push('⚠ Rotinas não carregadas: as camadas ✔️ e 🚫 ficam vazias.');
    if (!contextConfirmed) parts.push('⚠ Templates do Misterioso não carregados: a camada 🃏 mostra todas as plataformas com ciclo ativo.');
    if (logNote) parts.push(logNote);
    msg = parts.join(' ');
  }
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error' || (loadStatus === 'ok' && !!msg));
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  const today = todayKey();
  logNote = '';
  loadStatus = 'loading';
  renderLoadState();
  try {
    if (force || !isPlannerLoaded(uid)) await loadPlannerData(uid);
    if (token !== loadToken || !mounted) return;
    const retention = getCalendarSettings().retentionDays;
    const from = retentionCutoff(today, retention) || addDaysKey(today, -400);
    await loadPlanLogs(uid, from, today);
    if (token !== loadToken || !mounted) return;
  } catch (err) {
    if (token !== loadToken || !mounted) return;
    console.error('Calendário: falha ao carregar:', err);
    loadStatus = 'error';
    renderLoadState();
    return;
  }

  // Fecha os dias que passaram dos planos salvos + limpeza pelo prazo.
  const retention = getCalendarSettings().retentionDays;
  const closed = await logPlanPastDays(uid, getSavedPlans(), today, retention);
  if (token !== loadToken || !mounted) return;
  if (!closed.ok) logNote = `⚠ ${closed.error}`;
  await purgeOldPlanLogs(uid, today, retention);
  if (token !== loadToken || !mounted) return;

  if (!isRoutinesLoaded(uid)) {
    try {
      await loadRoutineData(uid, addDaysKey(today, -ROUTINE_HISTORY_DAYS), today);
      routinesFailed = false;
    } catch (err) {
      console.warn('Calendário: rotinas não carregadas.', err);
      routinesFailed = true;
    }
    if (token !== loadToken || !mounted) return;
  } else {
    routinesFailed = false;
  }

  loadStatus = 'ok';
  renderLoadState();
  renderAll();
}

// ---------- desenho ----------

function computeMonth() {
  const w = world();
  const routinesOk = isRoutinesLoaded(state.currentUid);
  return buildCalendarMonth(ui.ym, {
    ...w,
    platforms: filteredPlatforms(),
    routines: routinesOk ? getRoutines() : null,
    routineLogs: routinesOk ? getRoutineLogs() : new Map(),
    marksToday: routinesOk ? getMarks(w.todayKey) : {},
    hasMisterioso: contextConfirmed ? (p => { try { return !!(resolveCtx(p) || {}).misteriosoTemplate; } catch (e) { return false; } }) : null
  });
}

function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  if (!ui.ym) ui.ym = todayKey().slice(0, 7);
  const days = computeMonth();
  renderControls();
  renderGrid(days);
  renderPlanVsReal(days);
  renderMetrics();
  renderSettings();
}

function renderControls() {
  $('calTitle').textContent = monthTitle(ui.ym);
  const select = $('calPlatform');
  select.replaceChildren();
  const all = el('option', '', 'Todas as plataformas');
  all.value = '';
  select.appendChild(all);
  sortedPlatforms().forEach(p => {
    const o = el('option', '', p.name);
    o.value = p.id;
    select.appendChild(o);
  });
  if (ui.platformId && !state.platforms.some(p => p.id === ui.platformId)) ui.platformId = '';
  select.value = ui.platformId;

  const layers = $('calLayers');
  layers.replaceChildren();
  LAYERS.forEach(l => layers.appendChild(button(l.label, `plan-chip${ui.layers.has(l.id) ? ' active' : ''}`, () => {
    if (ui.layers.has(l.id)) ui.layers.delete(l.id); else ui.layers.add(l.id);
    renderAll();
  })));
}

function renderGrid(days) {
  const grid = $('calGrid');
  grid.replaceChildren();
  WEEK_LABELS.forEach(w => grid.appendChild(el('span', 'cal-head', w)));
  buildMonthGrid(ui.ym).forEach(week => week.forEach(cell => {
    const d = days.get(cell.key);
    const c = el('button', 'cal-cell');
    c.type = 'button';
    if (!cell.inMonth || !d) {
      c.classList.add('cal-out');
      c.disabled = true;
      c.appendChild(el('span', 'cal-num', String(cell.day)));
      grid.appendChild(c);
      return;
    }
    if (d.isToday) c.classList.add('cal-is-today');
    if (ui.selectedKey === cell.key) c.classList.add('cal-selected');
    c.appendChild(el('span', 'cal-num', String(cell.day)));

    if (ui.layers.has('plan') && d.plan.rows.length) {
      const st = d.plan.status;
      c.classList.add(`cal-st-${st}`);
      const ratio = d.plan.plannedC > 0 ? d.plan.realC / d.plan.plannedC : 0;
      c.appendChild(el('span', 'cal-plan', STATUS_ICON[st]));
      if (st !== 'future' && st !== 'done') c.appendChild(el('span', 'cal-pct', `${Math.round(ratio * 100)}%`));
    }
    const icons = [];
    if (ui.layers.has('deposits') && d.deposits.totalC > 0) icons.push('💰');
    if (ui.layers.has('misterioso') && d.emissions.length) icons.push('🃏');
    if (ui.layers.has('forbidden') && d.forbidden.length) icons.push(d.forbidden.some(f => f.broken) ? '⚠️' : '🚫');
    if (icons.length) c.appendChild(el('span', 'cal-icons', icons.join('')));
    if (ui.layers.has('routines') && d.routines) {
      const r = d.routines;
      const txt = r.source === 'future' ? `✔️${r.total}` : `✔️${r.success}/${r.total}`;
      c.appendChild(el('span', `cal-rt${r.fail ? ' cal-rt-bad' : ''}`, txt));
    }
    c.setAttribute('aria-label', fmtDay(cell.key));
    c.addEventListener('click', () => { ui.selectedKey = cell.key; renderAll(); openDayDetail(d); });
    grid.appendChild(c);
  }));
}

// ---------- detalhe do dia (mini-contêiner centralizado) ----------

let detailClose = null;

function fmtStakeC(c) {
  return (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "10 × R$ 0,50 + 1 compra 100× R$ 0,40"
function describeLines(lines) {
  return (lines || []).map(l => (l.kind === 'buy'
    ? `1 compra ${l.multiplier}× R$ ${fmtStakeC(l.stakeC)}`
    : `${l.count} × R$ ${fmtStakeC(l.stakeC)}`)).join(' + ');
}

// (23) "Abrir no Planejador": escolhe a plataforma lá e troca de aba.
function openInPlanner(platformId) {
  if (detailClose) detailClose();
  requestPlanejadorFocus(platformId);
  const btn = document.querySelector('.graficos-tab-btn[data-tab="planejador"]');
  if (btn) btn.click();
}

function groupLabels(d) {
  if (d.isFuture) return ['⚠️ Sem plano', '📅 Programado'];
  if (d.isToday) return ['⏳ Pendentes', '✓ Em dia'];
  return ['⚠️ Não cumprido', '✓ Cumprido'];
}

// Um cartão por plataforma no contêiner do dia.
function platformCard(d, x) {
  const card = el('div', `cal-pf${x.attention ? ' cal-pf-attn' : ''}${x.noPlan ? ' cal-pf-noplan' : ''}`);
  const head = el('div', 'cal-pf-head');
  const icon = x.plan ? (STATUS_ICON[x.plan.status] || '') : (x.noPlan ? '⚠️' : '▫️');
  head.appendChild(el('span', 'cal-pf-name', `${icon} ${x.name}`));
  let right = '';
  if (x.plan) right = d.isFuture ? money(x.plan.plannedC) : `${money(x.plan.realC)} de ${money(x.plan.plannedC)}`;
  else if (x.noPlan) right = 'sem plano';
  head.appendChild(el('span', 'cal-pf-value', right));
  card.appendChild(head);

  // Selos: rotinas de aposta, emissão, dia proibido, acima do plano.
  const badges = el('div', 'cal-badges');
  x.betRoutines.forEach(it => {
    const b = el('span', `cal-badge cal-badge-bet cal-badge-${it.status}`, `🎲 ${it.emoji ? `${it.emoji} ` : ''}${it.name} ${it.status === 'due' ? '' : (RT_ICON[it.status] || '')}`.trim());
    if (it.minimum > 0) b.title = `Mínimo da rotina: ${formatCurrency(it.minimum)}`;
    badges.appendChild(b);
  });
  if (x.emission) badges.appendChild(el('span', 'cal-badge cal-badge-em', '🃏 Emissão'));
  if (x.forbidden) badges.appendChild(el('span', `cal-badge${x.forbidden.broken ? ' cal-badge-bad' : ' cal-badge-forb'}`, x.forbidden.broken ? '⚠️ Apostou em dia proibido' : '🚫 Não apostar'));
  if (x.plan && x.plan.overC > 0) badges.appendChild(el('span', 'cal-badge cal-badge-over', `+${money(x.plan.overC)} acima`));
  if (x.plan && x.plan.tier && !d.isToday && d.isFuture) badges.appendChild(el('span', 'cal-badge', `dia ${TIER_LABEL[x.plan.tier] || x.plan.tier}`));
  if (badges.childNodes.length) card.appendChild(badges);

  // 👉 o que apostar.
  if (x.plan) {
    if (d.isFuture) {
      if (x.plan.lines && x.plan.lines.length) card.appendChild(el('p', 'cal-pf-tip', `🎯 ${describeLines(x.plan.lines)}`));
    } else if (d.isToday) {
      const sug = suggestForRow(x.plan);
      if (sug) {
        const txt = sug.lines.length
          ? `👉 Falta ${money(sug.leftC)}: ${describeLines(sug.lines)}`
          : `👉 Falta ${money(sug.leftC)}`;
        card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-now', txt));
      } else {
        card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-ok', '✅ Meta de aposta do dia cumprida.'));
      }
    } else if (x.plan.lines && x.plan.lines.length && x.plan.status !== 'done') {
      card.appendChild(el('p', 'cal-pf-tip', `Planejado: ${describeLines(x.plan.lines)}`));
    }
  }
  if (x.noPlan) {
    const row = el('div', 'cal-pf-noplan-row');
    row.appendChild(el('span', 'cal-pf-warn', d.isFuture || d.isToday
      ? '⚠️ Sem plano — a rotina de aposta vale neste dia, mas o Planejador não tem meta pra esta plataforma.'
      : '⚠️ Sem plano neste dia (a rotina de aposta valia).'));
    if (d.isFuture || d.isToday) row.appendChild(button('Abrir no Planejador', 'bet-manage-btn cal-pf-open', () => openInPlanner(x.platformId)));
    card.appendChild(row);
  }
  if (x.offPlanC > 0) card.appendChild(el('p', 'cal-pf-line cal-line-muted', `↪ ${money(x.offPlanC)} apostado fora do plano`));

  // Rotinas de depósito / lembrete / sem depósito.
  x.routines.forEach(it => {
    const r = el('div', `cal-pf-line cal-pf-rt${PROBLEM.has(it.status) ? ' cal-line-bad' : ''}`);
    const ic = RT_ACTION_ICON[it.action] || '✔️';
    r.appendChild(el('span', 'cal-line-l', `${RT_ICON[it.status] || '·'} ${ic} ${it.emoji ? `${it.emoji} ` : ''}${it.name}`));
    let info = '';
    if (it.action === 'deposit') {
      if (d.isToday && it.amount !== null && it.amount !== undefined) info = `${formatCurrency(it.amount)}${it.minimum > 0 ? ` de ${formatCurrency(it.minimum)}` : ''}`;
      else if (it.minimum > 0) info = `mín. ${formatCurrency(it.minimum)}`;
    }
    r.appendChild(el('span', 'cal-line-r', info));
    card.appendChild(r);
  });

  // Depósitos feitos.
  if (x.deposits.length) {
    const parts = x.deposits.map(dp => {
      const kind = DEPOSIT_KINDS.find(k => k.id === dp.kind);
      return `${kind ? kind.emoji : '▫️'} ${money(dp.valueC)}`;
    });
    card.appendChild(el('p', 'cal-pf-line', `💰 Depositado ${money(x.depositC)} · ${parts.join(' · ')}`));
  }
  return card;
}

const PROBLEM = new Set(['missed', 'broken']);

function openDayDetail(d) {
  if (detailClose) detailClose();
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const overlay = el('div', 'cal-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', 'cal-box cal-box-day');
  overlay.appendChild(box);

  const head = el('div', 'cal-box-head');
  head.appendChild(el('h3', 'cal-box-title', `${fmtDay(d.key)}${d.isToday ? ' · hoje' : ''}`));
  const x = button('✕', 'cal-box-close', () => close());
  x.setAttribute('aria-label', 'Fechar');
  head.appendChild(x);
  box.appendChild(head);

  // Resumo do dia.
  const sum = el('div', 'cal-day-sum');
  if (d.plan.rows.length) {
    const st = d.plan.status;
    sum.appendChild(el('span', `cal-day-chip cal-st-${st}`, d.isFuture
      ? `🎯 ${money(d.plan.plannedC)} planejado`
      : `🎯 ${money(d.plan.realC)} de ${money(d.plan.plannedC)} · ${STATUS_ICON[st] || ''} ${STATUS_LABEL[st] || ''}`));
  }
  if (d.deposits.totalC > 0) sum.appendChild(el('span', 'cal-day-chip', `💰 ${money(d.deposits.totalC)} depositado`));
  if (d.routines) {
    const r = d.routines;
    sum.appendChild(el('span', `cal-day-chip${r.fail ? ' cal-day-chip-bad' : ''}`, r.source === 'future' ? `✔️ ${r.total} rotina(s)` : `✔️ ${r.success} de ${r.total} rotina(s)`));
  }
  if (sum.childNodes.length) box.appendChild(sum);

  const list = buildDayPlatforms(d);
  if (!list.length) {
    box.appendChild(el('p', 'cal-text', 'Nada neste dia.'));
  } else {
    const [attnLabel, okLabel] = groupLabels(d);
    const attn = list.filter(p => p.attention);
    const rest = list.filter(p => !p.attention);
    if (attn.length) {
      box.appendChild(el('span', 'cal-sec-title cal-group-title cal-group-attn', `${attnLabel} (${attn.length})`));
      attn.forEach(p => box.appendChild(platformCard(d, p)));
    }
    if (rest.length) {
      box.appendChild(el('span', 'cal-sec-title cal-group-title', `${okLabel} (${rest.length})`));
      rest.forEach(p => box.appendChild(platformCard(d, p)));
    }
  }

  function close() {
    detailClose = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    window.removeEventListener('popstate', close);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  detailClose = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  window.addEventListener('popstate', close);
  document.body.appendChild(overlay);
}

// ---------- planejado × real ----------

function renderPlanVsReal(days) {
  const t = todayKey();
  const s = summarizePlanVsReal(days, t);
  const sub = $('calPvrSub');
  sub.textContent = `${monthTitle(ui.ym)} · ${ui.platformId ? (state.platforms.find(p => p.id === ui.platformId) || {}).name || '' : 'todas as plataformas'} · 🟡 a partir de ${getCalendarSettings().partialThreshold}%`;
  const box = $('calPvr');
  box.replaceChildren();
  if (s.planDays === 0 && !s.plannedCum.some(v => v > 0)) {
    box.appendChild(el('p', 'graficos-note', 'Nenhum plano neste mês. Crie no Planejador — os dias que passam ficam guardados aqui.'));
    $('calChartWrap').classList.add('app-hidden');
    return;
  }
  box.appendChild(kpi('Cumprimento', s.rate === null ? '—' : pct(s.rate), `${s.done} de ${s.planDays} dia(s) fechados`, 'plan-kpi-main'));
  box.appendChild(kpi('Parciais / não', `${s.partial} / ${s.miss}`, 'dias'));
  box.appendChild(kpi('Desvio', `${s.deviationC >= 0 ? '+' : ''}${money(s.deviationC)}`, `real ${money(s.realC)} de ${money(s.plannedC)}`, s.deviationC < 0 ? 'cal-kpi-bad' : 'plan-kpi-bonus'));
  box.appendChild(kpi('Acima do plano', money(s.overC), `${s.overDays} vez(es)`, s.overC > 0 ? 'plan-kpi-vip' : ''));
  $('calChartWrap').classList.remove('app-hidden');
  renderChart(s);
}

function renderChart(s) {
  const canvas = $('calChart');
  if (!canvas || !window.Chart) return;
  const datasets = [
    { type: 'line', label: 'Planejado (acumulado)', data: s.plannedCum, borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0, tension: 0.2 },
    { type: 'line', label: 'Real (acumulado)', data: s.realCum, borderColor: '#2563eb', backgroundColor: '#2563eb', pointRadius: 0, tension: 0.2, spanGaps: false }
  ];
  if (chart) {
    chart.data.labels = s.labels;
    chart.data.datasets = datasets;
    chart.update('none');
    return;
  }
  chart = new window.Chart(canvas, {
    data: { labels: s.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: (c) => (c.parsed.y === null ? '' : `${c.dataset.label}: ${formatCurrency(c.parsed.y)}`) } }
      },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 6 } }, y: { beginAtZero: true } }
    }
  });
}

// ---------- resultado real ----------

function periodRange() {
  const t = todayKey();
  const base = ui.selectedKey || (ui.ym === t.slice(0, 7) ? t : monthRange(ui.ym).toKey);
  if (ui.period === 'day') return { fromKey: base, toKey: base, label: fmtDay(base) };
  if (ui.period === 'week') {
    const [y, m, d] = base.split('-').map(Number);
    const ws = getWeekStart(new Date(y, m - 1, d, 12));
    const from = toLocalDateString(ws);
    const to = toLocalDateString(getWeekEnd(ws));
    return { fromKey: from, toKey: to, label: `${from.slice(8, 10)}/${from.slice(5, 7)} a ${to.slice(8, 10)}/${to.slice(5, 7)}` };
  }
  const r = monthRange(ui.ym);
  return { ...r, label: monthTitle(ui.ym) };
}

function renderMetrics() {
  const chips = $('calPeriod');
  chips.replaceChildren();
  [['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].forEach(([id, label]) => chips.appendChild(button(label, `plan-chip${ui.period === id ? ' active' : ''}`, () => { ui.period = id; renderAll(); })));
  const range = periodRange();
  chips.appendChild(el('span', 'plan-hint cal-period-label', range.label));

  const limit = getStrategySettings().betDepositMonthlyLimit;
  const m = computeRealMetrics(filteredPlatforms(), range.fromKey, range.toKey, {
    todayKey: todayKey(),
    world: world(),
    betLimitReais: limit,
    limitMonthKey: range.fromKey.slice(0, 7)
  });
  const box = $('calMetrics');
  box.replaceChildren();
  if (m.sessions === 0 && m.depositC === 0) {
    box.appendChild(el('p', 'graficos-note', 'Nenhum lançamento neste período.'));
    renderGameStats(range);
    renderPvrDetail(m);
    return;
  }
  box.appendChild(kpi('Vitórias', `${m.wins} · ${money(m.winC)}`, m.sessions ? `${pct(m.wins / m.sessions)} das sessões` : '', 'plan-kpi-bonus'));
  box.appendChild(kpi('Derrotas', `${m.losses} · ${money(m.lossC)}`, m.even ? `${m.even} empate(s)` : '', m.losses ? 'cal-kpi-bad' : ''));
  box.appendChild(kpi('R.B. do período', `${m.rbC >= 0 ? '+' : ''}${money(m.rbC)}`, `${m.sessions} sessão(ões)`, m.rbC < 0 ? 'cal-kpi-bad' : 'plan-kpi-main'));
  box.appendChild(kpi('Multiplicador de perda', m.lossMultiple === null ? '—' : `${m.lossMultiple.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`, m.depositC ? `derrotas ÷ ${money(m.depositC)} depositado` : 'sem depósito no período', m.lossMultiple !== null && m.lossMultiple >= 1 ? 'cal-kpi-bad' : ''));
  box.appendChild(kpi('Giro', m.turnover === null ? '—' : `${m.turnover.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`, `apostado ${money(m.wageredC)} ÷ depositado`));
  box.appendChild(kpi('Real × plano', m.overPlanPct === null ? '—' : `${m.overPlanPct >= 0 ? '+' : ''}${pct(m.overPlanPct, 1)}`, m.plannedC ? `${m.daysAbove} dia(s) acima · real ${money(m.realOnPlanC)} de ${money(m.plannedC)}` : 'sem dia com plano fechado', m.overPlanPct !== null && m.overPlanPct > 0 ? 'plan-kpi-vip' : ''));
  renderGameStats(range);
  renderPvrDetail(m);
  if (m.limitC > 0) {
    box.appendChild(kpi('Acima do limite 🎲', m.overLimitPct > 0 ? `+${pct(m.overLimitPct, 1)}` : 'Dentro', `${money(m.betDepositC)} de ${money(m.limitC)} no mês`, m.overLimitPct > 0 ? 'cal-kpi-bad' : ''));
  } else {
    box.appendChild(kpi('Acima do limite 🎲', '—', 'defina o limite na aba Misterioso'));
  }
}

// (23) 🔎 De onde vem o planejado do "Real × plano": dias fechados ×
// plataformas, agrupados por dia.
let pvrOpen = false;

function renderPvrDetail(m) {
  const host = $('calPvrDetail');
  if (!host) return;
  host.replaceChildren();
  const rows = (m && m.planRows) || [];
  if (!rows.length) return;
  const det = el('details', 'cal-settings cal-pvr');
  det.open = pvrOpen;
  det.addEventListener('toggle', () => { pvrOpen = det.open; });
  det.appendChild(el('summary', '', `🔎 De onde vem o planejado do Real × plano (${money(m.plannedC)})`));
  const body = el('div', 'cal-pvr-body');
  body.appendChild(el('p', 'plan-hint', 'Só dias FECHADOS com plano (hoje entra quando o dia acabar). Dias passados usam o planejado congelado no histórico.'));
  const byDay = new Map();
  rows.forEach(r => { if (!byDay.has(r.key)) byDay.set(r.key, []); byDay.get(r.key).push(r); });
  const th = getCalendarSettings().partialThreshold;
  byDay.forEach((list, key) => {
    const p = list.reduce((s2, r) => s2 + r.plannedC, 0);
    const re = list.reduce((s2, r) => s2 + r.realC, 0);
    const day = el('div', 'cal-pvr-day');
    const dh = el('div', 'cal-pvr-head');
    dh.appendChild(el('span', 'cal-line-l', `${STATUS_ICON[dayStatus(p, re, th)] || ''} ${fmtDay(key)}`));
    dh.appendChild(el('span', 'cal-line-r', `${money(re)} de ${money(p)}`));
    day.appendChild(dh);
    list.forEach(r => {
      const line = el('div', 'cal-line cal-pvr-row');
      line.appendChild(el('span', 'cal-line-l', `${STATUS_ICON[dayStatus(r.plannedC, r.realC, th)] || ''} ${r.name}`));
      line.appendChild(el('span', 'cal-line-r', `${money(r.realC)} de ${money(r.plannedC)}`));
      day.appendChild(line);
    });
    body.appendChild(day);
  });
  const tot = el('div', 'cal-pvr-total');
  tot.appendChild(el('span', '', `Total · ${byDay.size} dia(s)`));
  tot.appendChild(el('strong', '', `${money(m.realOnPlanC)} de ${money(m.plannedC)}`));
  body.appendChild(tot);
  det.appendChild(body);
  host.appendChild(det);
}

// ---------- por jogo / por provedor (Sub-entrega 9) ----------
// Mesmos lançamentos do Financeiro (betEntries), mesmo período e mesmo filtro
// de plataforma do card — só agrupados pelo jogo copiado no lançamento.

function renderGameStats(range) {
  const chips = $('calGameBy');
  const box = $('calGames');
  if (!chips || !box) return;
  chips.replaceChildren();
  [['game', 'Jogo'], ['provider', 'Provedor']].forEach(([id, label]) => chips.appendChild(button(label, `plan-chip${ui.gameBy === id ? ' active' : ''}`, () => { ui.gameBy = id; renderGameStats(range); })));
  box.replaceChildren();
  const rows = computeGameStats(filteredPlatforms(), range.fromKey, range.toKey, ui.gameBy, d => toLocalDateString(new Date(d)));
  if (rows.length === 0) {
    box.appendChild(el('p', 'plan-hint', 'Nenhuma aposta neste período.'));
    return;
  }
  if (rows.length === 1 && rows[0].label === 'Sem jogo') {
    box.appendChild(el('p', 'plan-hint', 'As apostas deste período não têm jogo marcado. Escolha o jogo ao registrar (ou edite em "Últimas apostas").'));
  }
  rows.forEach(r => {
    const row = el('div', `cal-game-row${r.rbC < 0 ? ' bad' : ''}`);
    const head = el('div', 'cal-game-top');
    const name = el('span', 'cal-game-name', r.label);
    if (ui.gameBy === 'game' && r.provider) name.appendChild(el('small', 'cal-game-prov', ` · ${r.provider}`));
    head.appendChild(name);
    head.appendChild(el('span', `cal-game-rb${r.rbC < 0 ? ' bad' : ''}`, `${r.rbC >= 0 ? '+' : ''}${money(r.rbC)}`));
    row.appendChild(head);
    row.appendChild(el('span', 'cal-game-meta', `${r.sessions} sessão(ões) · apostado ${money(r.wageredC)} · ✅ ${r.wins} (${money(r.winC)}) · ❌ ${r.losses} (${money(r.lossC)})`));
    box.appendChild(row);
  });
}

// ---------- configurações ----------

function renderSettings() {
  const box = $('calSettings');
  box.replaceChildren();
  const s = getCalendarSettings();

  const f1 = el('div', 'cal-field');
  f1.appendChild(el('span', 'plan-label', 'Parcial 🟡 a partir de (% do planejado)'));
  const row = el('div', 'plan-row');
  const input = el('input', 'plan-input');
  input.type = 'number';
  input.min = '1';
  input.max = '99';
  input.inputMode = 'numeric';
  input.value = ui.draftThreshold !== null ? ui.draftThreshold : String(s.partialThreshold);
  input.addEventListener('input', () => { ui.draftThreshold = input.value; });
  row.appendChild(input);
  row.appendChild(el('span', 'plan-sep', '%'));
  f1.appendChild(row);
  box.appendChild(f1);

  const f2 = el('div', 'cal-field');
  f2.appendChild(el('span', 'plan-label', 'Guardar o planejado por'));
  const chips = el('div', 'plan-chips');
  const current = ui.draftRetention !== null ? ui.draftRetention : s.retentionDays;
  PLAN_LOG_RETENTION_OPTIONS.forEach(r => chips.appendChild(button(r === 0 ? 'Sempre' : `${r} dias`, `plan-chip${current === r ? ' active' : ''}`, () => { ui.draftRetention = r; renderSettings(); })));
  f2.appendChild(chips);
  f2.appendChild(el('p', 'plan-hint', 'Dias mais antigos que o prazo são apagados sozinhos ao abrir esta aba. O backup leva tudo que estiver guardado.'));
  box.appendChild(f2);

  const save = button('Salvar', 'btn-confirm', async () => {
    if (busy) return;
    const t = Math.round(Number(input.value));
    if (!(t >= 1 && t <= 99)) { await showAppAlert('O parcial precisa ser de 1% a 99%.'); return; }
    busy = true;
    save.disabled = true;
    try {
      const result = await saveCalendarSettings(state.currentUid, { partialThreshold: t, retentionDays: current });
      if (!result.ok) { await showAppAlert(result.error); return; }
      ui.draftThreshold = null;
      ui.draftRetention = null;
    } finally {
      busy = false;
      if (mounted) renderAll();
    }
  });
  const actions = el('div', 'plan-actions');
  actions.appendChild(save);
  box.appendChild(actions);
}

// ---------- API pública (view-graficos.js) ----------

// Chamar com window.Chart carregado e o painel VISÍVEL.
export function mountCalendarioAnalytics(root, options = {}) {
  if (!root) return;
  unmountCalendarioAnalytics();
  rootEl = root;
  mounted = true;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  if (!ui.ym) ui.ym = todayKey().slice(0, 7);
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba / virada do dia: fecha o dia que passou e redesenha.
export async function refreshCalendarioAnalytics() {
  if (!mounted || loadStatus !== 'ok' || busy) return;
  const closed = await logPlanPastDays(state.currentUid, getSavedPlans(), todayKey(), getCalendarSettings().retentionDays);
  if (!mounted) return;
  logNote = closed.ok ? '' : `⚠ ${closed.error}`;
  renderLoadState();
  renderAll();
}

export function resizeCalendarioAnalytics() {
  if (chart) chart.resize();
}

export function unmountCalendarioAnalytics() {
  loadToken++;
  if (detailClose) detailClose();
  if (chart) { chart.destroy(); chart = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  ui.draftThreshold = null;
  ui.draftRetention = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
