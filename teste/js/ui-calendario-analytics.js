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
// === (Sub-entrega 29) 🏁 ENCERRAR O DIA + RESULTADO DO DIA ===
// Cartão da plataforma: 📈 R.B. do dia junto do apostado; hoje, com o lucro
// ≥ meta do dia e ainda faltando apostar, 💡 sugere encerrar. "🏁 Encerrar
// o dia" (substitui o ⏭ Parar hoje): mostra apostado / meta / R.B. /
// multiplicador, pede o motivo e abre o 🔄 do Planejador já preenchido —
// o resto vai pros próximos dias e o dia de hoje fica 🏁 no histórico
// (conta como cumprido). Resultado real: card 🏁 Paradas.
//
// === (Sub-entrega 25) 🙈 IGNORAR + 📟 ENCERRADOS ===
// Dia que já passou (planejado vindo do histórico): "🙈 Ignorar" no cartão
// da plataforma e no "🔎 De onde vem o planejado". O dia sai de todas as
// contas (fica guardado — plan-log-store setPlanLogIgnored). Camada
// 📟 Encerrados (desligada por padrão): mostra os dias ignorados, apagados,
// com "Voltar a contar".
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
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { toLocalDateString, getWeekStart, getWeekEnd, computeLiveBalance, sumRolloverIncreases } from './finance-logic.js';
import { colorForLevel } from './cycle-logic.js'; // (33) cor do saldo = cor do nível
import {
  buildMonthGrid, buildCalendarMonth, summarizePlanVsReal, computeRealMetrics,
  monthTitle, shiftMonth, monthRange, addDaysKey, buildDayPlatforms, suggestForRow, dayStatus
} from './calendar-logic.js';
import { requestPlanejadorFocus } from './ui-planejador.js';

import {
  loadPlannerData, isPlannerLoaded, getSavedPlans, getCalendarSettings, saveCalendarSettings, getStrategySettings,
  getCustomStopReasons, getCustomStopKinds, saveCustomStopReasons,
  getSavedPlan, stopTodayInPlace, undoStopTodayInPlace // (32) 🏁 no próprio lugar
} from './plan-store.js';
import { spreadLeftoverOnPlan, unspreadLeftoverOnPlan } from './plan-logic.js';
// (31) Motivos do 🏁: fixos + criados pelo usuário (botão +).
import {
  BUILTIN_STOP_REASONS, BUILTIN_STOP_KINDS, STOP_LABEL_MAX, STOP_EMOJI_MAX, CUSTOM_STOP_REASON_MAX, CUSTOM_STOP_KIND_MAX,
  STOP_EMOJI_SUGGESTIONS, DEFAULT_CUSTOM_EMOJI, DEFAULT_KIND_EMOJI, newCustomStopReasonId, newCustomStopKindId,
  isDuplicateStopLabel, isDuplicateKindLabel, stopReasonText, stopKindText, stopReasonSnapshot, suggestStopReason,
  activeStop
} from './stop-reasons.js';
import {
  loadPlanLogs, getPlanLogEntry, logPlanPastDays, purgeOldPlanLogs, retentionCutoff, PLAN_LOG_RETENTION_OPTIONS,
  setPlanLogIgnored, planLogId
} from './plan-log-store.js';
import { loadRoutineData, isRoutinesLoaded, getRoutines, getRoutineLogs, getMarks, setDepositChoice } from './routine-store.js';
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
  { id: 'forbidden', label: '🚫 Proibidos' },
  { id: 'ended', label: '📟 Encerrados' } // (25) desligada por padrão
];
const STATUS_ICON = { done: '✅', partial: '🟡', miss: '❌', today: '⏳', future: '·' };
const STATUS_LABEL = { done: 'Cumprido', partial: 'Parcial', miss: 'Não cumprido', today: 'Em andamento', future: 'Planejado' };
const RT_ICON = { done: '✅', ok: '🟢', pending: '⏳', missed: '❌', broken: '⚠️', due: '·', paused: '⏸', deferred: '⏭' };
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
  layers: new Set(LAYERS.map(l => l.id).filter(id => id !== 'ended')),
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

// (33) Multiplicador legível: 2,1× · 0,81× · 0,005× (nunca "0×").
function fmtX(v) {
  const a = Math.abs(Number(v) || 0);
  if (a > 0 && a < 0.0005) return '<0,001×';
  return `${a.toLocaleString('pt-BR', { maximumFractionDigits: a >= 1 ? 1 : (a >= 0.1 ? 2 : 3) })}×`;
}

// (33) Saldo ao vivo da plataforma (mesma conta do Financeiro) — null se falhar.
function liveBalanceOf(platformId) {
  const p = (state.platforms || []).find(q => q.id === platformId);
  if (!p) return null;
  try { return computeLiveBalance(p, new Date(), resolveCtx(p) || {}); } catch (err) { return null; }
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
    marksFor: routinesOk ? getMarks : null, // (27) ⏭ adiados
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
    if (ui.layers.has('ended') && d.ignored.length) icons.push('📟');
    if (ui.layers.has('plan') && d.plan.rows.some(r => r.stopped)) icons.push('🏁'); // (29)
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

// (25) 🙈 Ignorar / voltar a contar UM dia × plataforma.
async function toggleIgnored(dayKey, platformId, name, plannedC, realC, ignore) {
  if (busy) return;
  const ok = await showAppConfirm(ignore
    ? `Ignorar o plano de ${name} em ${fmtDay(dayKey)} (${money(realC)} de ${money(plannedC)})? O dia sai do Cumprimento, do Real × plano, da Aderência e do 🏆 Grupos. Fica guardado — dá pra voltar a contar em 📟 Encerrados.`
    : `Voltar a contar o plano de ${name} em ${fmtDay(dayKey)} (${money(realC)} de ${money(plannedC)})?`);
  if (!ok || !mounted) return;
  busy = true;
  let result;
  try {
    result = await setPlanLogIgnored(state.currentUid, [planLogId(dayKey, platformId)], ignore);
  } finally {
    busy = false;
  }
  if (!result.ok) { await showAppAlert(result.error); return; }
  if (!mounted) return;
  const reopen = !!detailClose;
  renderAll();
  if (reopen) {
    const days = computeMonth();
    if (days.has(dayKey)) openDayDetail(days.get(dayKey));
  }
}

// (27) Depositar mesmo assim / pular hoje / desfazer.
async function chooseDeposit(dayKey, routineId, platformId, choice, reopenKey = dayKey) {
  if (busy) return;
  busy = true;
  let result;
  try {
    result = await setDepositChoice(state.currentUid, dayKey, routineId, platformId, choice);
  } finally {
    busy = false;
  }
  if (!result.ok) { await showAppAlert(result.error); return; }
  if (!mounted) return;
  const reopen = !!detailClose;
  renderAll();
  if (reopen) {
    const days = computeMonth();
    if (days.has(reopenKey)) openDayDetail(days.get(reopenKey));
  }
}

// ---------- (Sub-entrega 32) 🏁 no próprio lugar ----------
// Encerrar = grava o 🏁 de hoje E soma o que faltava nos próximos dias
// DAQUELA plataforma (proporcional ao que cada dia já tem) — num lote só.
// Não passa pelo Planejador, não recalcula pelo Rollover e não mexe nas
// outras plataformas (nem do grupo). ↩️ Desfazer no mesmo dia.

const SPREAD_NOTE = {
  'no-future': 'O plano não tem dia de aposta depois de hoje — o resto fica no Rollover (entra quando você refizer o plano no 🔄).',
  'too-small': 'O resto é menor que 1 giro — os próximos dias não mudam.',
  'no-plan': 'Sem plano salvo — o resto fica no Rollover.',
  'no-stakes': 'Sem valores de aposta no plano — o resto fica no Rollover.',
  nothing: 'Nada faltando hoje — só registra o 🏁.',
  // (36)
  'no-high': 'O plano não tem dia ALTO depois de hoje — escolha outra opção.',
  'manual-empty': 'Escolha quanto vai em cada dia.',
  none: 'Não distribuir: o resto fica no Rollover — entra quando você refizer o plano no 🔄.'
};

// Monta (sem gravar) o 🏁 + o plano com o resto somado.
function buildStopItem(x, reason, dist = null) {
  const t = todayKey();
  const row = x.plan;
  const leftC = Math.max(0, row.plannedC - row.realC);
  const saved = getSavedPlan(x.platformId);
  const mode = dist && dist.mode ? dist.mode : 'auto'; // (36) para onde vai o resto
  const sp = mode === 'none' ? { ok: false, error: leftC > 0 ? 'none' : 'nothing' }
    : (saved ? spreadLeftoverOnPlan(saved, t, leftC, { mode, manual: dist ? dist.manual : null }) : { ok: false, error: 'no-plan' });
  const nowIso = new Date().toISOString();
  const newDoc = sp.ok ? { ...saved, days: sp.days, totals: sp.totals, updatedAt: nowIso } : null;
  const stop = {
    at: nowIso, reason, ...stopReasonSnapshot(reason, getCustomStopReasons(), getCustomStopKinds()),
    rbC: row.rbC || 0, wageredC: row.realC, plannedC: row.plannedC,
    ...(sp.ok ? { spread: sp.spread, planAt: nowIso, movedC: sp.movedC } : {})
  };
  return { platformId: x.platformId, name: x.name, leftC, sp, stop, newDoc };
}

function spreadText(item) {
  if (!item.sp.ok) return SPREAD_NOTE[item.sp.error] || SPREAD_NOTE['no-plan'];
  const keys = Object.keys(item.sp.spread).sort();
  const parts = keys.slice(0, 5).map(k => `${k.slice(8, 10)}/${k.slice(5, 7)} +${money(item.sp.spread[k].a - item.sp.spread[k].b)}`);
  return `+${money(item.sp.movedC)} em ${keys.length} dia(s): ${parts.join(' · ')}${keys.length > 5 ? ' …' : ''}${item.sp.movedC !== item.leftC ? ' (arredondado pelos valores de aposta)' : ''}`;
}

// ---------- (Sub-entrega 36) 📅 Para onde vai o resto ----------
const DIST_MODES = [
  ['auto', '⚖️ Automático'], ['next', '⏭ Próximo dia'], ['high', '🔝 Dias altos'],
  ['manual', '✍️ Escolher por dia'], ['none', '⏸ Não distribuir']
];
// Sem jeito de distribuir (vale qualquer modo): só o 🏁 é gravado.
const DIST_STOP_ONLY = new Set(['no-future', 'too-small', 'nothing', 'no-plan', 'no-stakes', 'none']);

function newDist() { return { mode: 'auto', manual: {}, open: false }; }

function parseMoneyC(text) {
  const t = String(text || '').trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!t) return 0;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

function fmtInputC(c) {
  return (Math.round(Number(c) || 0) / 100).toFixed(2).replace('.', ',');
}

// Dias de aposta do plano salvo depois de hoje (onde dá pra mandar o resto).
function futurePlanDays(platformId) {
  const saved = getSavedPlan(platformId);
  const t = todayKey();
  return saved && Array.isArray(saved.days) ? saved.days.filter(dd => dd && dd.key > t && Number(dd.plannedC) > 0) : [];
}

// Pré-preenche o "Escolher por dia" com a divisão proporcional (soma exata).
function proportionalShares(days, leftC) {
  const weight = days.reduce((s2, dd) => s2 + Math.round(Number(dd.plannedC) || 0), 0);
  const out = {};
  let given = 0;
  days.forEach((dd, i) => {
    const share = i === days.length - 1 ? leftC - given : Math.round(leftC * Math.round(Number(dd.plannedC) || 0) / (weight || 1));
    given += share;
    if (share > 0) out[dd.key] = share;
  });
  return out;
}

function manualSumC(dist) {
  return Object.values(dist.manual || {}).reduce((s2, v) => s2 + (Math.round(Number(v) || 0)), 0);
}

// O resto pode ser gravado assim? (manual: a soma tem que fechar)
function distValid(item, dist) {
  if (dist.mode === 'manual') return item.sp.ok && manualSumC(dist) === item.leftC;
  return item.sp.ok || DIST_STOP_ONLY.has(item.sp.error);
}

/**
 * Mini-contêiner da distribuição de UMA plataforma. onChange(item) a cada
 * mudança (atualiza botão/nota de fora). Só monta os campos por dia quando
 * o modo é "Escolher por dia".
 */
function distEditor(x, dist, onChange) {
  const wrap = el('div', 'cal-dist');
  const leftC = Math.max(0, x.plan.plannedC - x.plan.realC);
  const days = futurePlanDays(x.platformId);
  const note = el('p', 'cal-stop-spread');
  const counter = el('p', 'cal-dist-count');
  const refresh = () => {
    const item = buildStopItem(x, 'outro', dist);
    note.textContent = `📅 ${spreadText(item)}`;
    note.classList.toggle('cal-line-muted', !item.sp.ok);
    if (dist.mode === 'manual') {
      const diff = leftC - manualSumC(dist);
      counter.textContent = diff === 0 ? '✓ Fechou a conta.' : (diff > 0 ? `Falta distribuir ${money(diff)}.` : `Passou ${money(-diff)} do que faltava.`);
      counter.classList.toggle('cal-line-bad', diff !== 0);
    }
    onChange(item);
  };
  if (!(leftC > 0) || !days.length) {
    wrap.appendChild(note);
    refresh();
    return wrap;
  }
  wrap.appendChild(el('span', 'plan-label', `📅 Para onde vai o resto (${money(leftC)})`));
  const chips = el('div', 'plan-chips cal-dist-modes');
  const manualBox = el('div', 'cal-dist-manual');
  const drawManual = () => {
    manualBox.replaceChildren();
    if (dist.mode !== 'manual') return;
    days.forEach(dd => {
      const r = el('label', 'cal-dist-row');
      r.appendChild(el('span', 'cal-dist-day', `${dd.key.slice(8, 10)}/${dd.key.slice(5, 7)}${dd.tier === 'alto' ? ' · ALTO' : ''} · hoje ${money(dd.plannedC)}`));
      const inp = el('input', 'plan-input cal-dist-in');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.placeholder = '0,00';
      inp.value = dist.manual[dd.key] ? fmtInputC(dist.manual[dd.key]) : '';
      inp.setAttribute('aria-label', `Somar em ${dd.key.slice(8, 10)}/${dd.key.slice(5, 7)}`);
      inp.addEventListener('input', () => {
        const c = parseMoneyC(inp.value);
        inp.classList.toggle('cal-dist-in-bad', c === null);
        if (c === null) return;
        if (c > 0) dist.manual[dd.key] = c; else delete dist.manual[dd.key];
        refresh();
      });
      r.appendChild(el('span', 'cal-dist-plus', '+R$'));
      r.appendChild(inp);
      manualBox.appendChild(r);
    });
    manualBox.appendChild(counter);
  };
  const drawChips = () => {
    chips.replaceChildren();
    DIST_MODES.forEach(([id, label]) => {
      const b = button(label, `plan-chip${dist.mode === id ? ' active' : ''}`, () => {
        dist.mode = id;
        if (id === 'manual' && !Object.keys(dist.manual).length) dist.manual = proportionalShares(days, leftC);
        drawChips();
        drawManual();
        refresh();
      });
      b.setAttribute('aria-pressed', dist.mode === id ? 'true' : 'false');
      chips.appendChild(b);
    });
  };
  drawChips();
  wrap.appendChild(chips);
  wrap.appendChild(manualBox);
  wrap.appendChild(note);
  drawManual();
  refresh();
  return wrap;
}

async function commitStops(d, items) {
  if (busy) return false;
  busy = true;
  let res;
  try {
    res = await stopTodayInPlace(state.currentUid, items.map(i => ({ platformId: i.platformId, stop: i.stop, newDoc: i.newDoc })));
  } finally {
    busy = false;
  }
  if (!res.ok) {
    const names = (ids) => ids.map(id => (items.find(i => i.platformId === id) || {}).name || id).join(', ');
    if (res.error === 'already') await showAppAlert(`Já encerrado hoje: ${names(res.already)}. Nada foi gravado — recarregue a tela.`);
    else if (res.error === 'missing') await showAppAlert(`Sem meta de hoje no plano: ${names(res.missing)}. Nada foi gravado.`);
    else await showAppAlert(res.error);
    return false;
  }
  if (!mounted) return true;
  renderAll();
  const days = computeMonth();
  if (days.has(d.key)) openDayDetail(days.get(d.key));
  return true;
}

// ↩️ Desfazer o 🏁 de hoje (o resto volta pra hoje; os dias somados voltam).
async function undoStop(d, x) {
  if (busy) return;
  const raw = activeStop(getPlanLogEntry(d.key, x.platformId));
  if (!raw) { await showAppAlert('O 🏁 de hoje não foi encontrado — recarregue a tela.'); return; }
  const saved = getSavedPlan(x.platformId);
  let restoredDoc = null;
  let info = { restored: 0, skipped: 0 };
  if (raw.spread && saved) {
    info = unspreadLeftoverOnPlan(saved, raw.spread);
    if (info.restored) restoredDoc = { ...saved, days: info.days, totals: info.totals, updatedAt: new Date().toISOString() };
  }
  const backC = Math.max(0, (x.plan.originalC || 0) - x.plan.realC);
  const ok = await showAppConfirm(`Desfazer o 🏁 de ${x.name}? Hoje volta a cobrar ${money(backC)}${restoredDoc ? ` e os próximos dias perdem o que tinha sido somado (${info.restored} dia(s))` : ''}.${info.skipped ? ` ${info.skipped} dia(s) mudaram depois (plano refeito) e ficam como estão — confira no 🔄 Atualizar.` : ''}`);
  if (!ok || !mounted) return;
  busy = true;
  let res;
  try {
    res = await undoStopTodayInPlace(state.currentUid, x.platformId, restoredDoc);
  } finally {
    busy = false;
  }
  if (!res.ok) { await showAppAlert(res.error); return; }
  if (!mounted) return;
  renderAll();
  const days = computeMonth();
  if (days.has(d.key)) openDayDetail(days.get(d.key));
}

// (29) 🏁 Encerrar o dia: resumo + motivo. (32) grava ali mesmo.
function openStopDay(d, x) {
  if (detailClose) detailClose(); // o Esc/toque fora fica só com este contêiner
  const row = x.plan;
  const leftC = Math.max(0, row.plannedC - row.realC);
  const rb = row.rbC || 0;
  const overlay = el('div', 'cal-overlay cal-stop-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', 'cal-box plan-choice-box');
  overlay.appendChild(box);
  const head = el('div', 'cal-box-head');
  head.appendChild(el('h3', 'cal-box-title', `🏁 Encerrar o dia · ${x.name}`));
  const close = button('✕', 'cal-box-close', () => done());
  close.setAttribute('aria-label', 'Cancelar');
  head.appendChild(close);
  box.appendChild(head);
  const nums = el('div', 'pu-nums');
  const line = (l, r) => { const dd = el('div', 'pu-line'); dd.appendChild(el('span', 'pu-l', l)); dd.appendChild(el('span', 'pu-r', r)); nums.appendChild(dd); };
  line('Apostado hoje', `${money(row.realC)} de ${money(row.plannedC)}`);
  line('Falta (vai pros próximos dias)', money(leftC));
  line('📈 R.B. do dia', `${rb > 0 ? '+' : (rb < 0 ? '−' : '')}${money(Math.abs(rb))}`);
  if (row.realC > 0 && rb > 0) line('Multiplicador', `${fmtX(rb / row.realC)} o apostado`);
  if (row.realC > 0 && rb < 0) line('Perda ÷ apostado', `${fmtX(rb / row.realC)} o apostado`); // (33)
  box.appendChild(nums);
  // (36) 📅 para onde vai o resto (automático / próximo / altos / por dia / não distribuir)
  const dist = newDist();
  let distItem = null;
  let go = null;
  box.appendChild(distEditor(x, dist, (item) => { distItem = item; if (go) go.disabled = !distValid(item, dist); }));
  box.appendChild(el('span', 'plan-label', 'Motivo'));
  // (31) sugestão pelo resultado (prêmio / perda / perda excessiva)
  let reason = suggestStopReason(rb, row.plannedC);
  const chips = el('div', 'plan-chips cal-stop-reasons');
  // form: null | { id|null (novo), emoji, label, kind } ; kindForm: idem p/ tipo
  // manage: lista de edição (motivos e tipos criados)
  let form = null;
  let kindForm = null;
  let manage = false;
  let saving = false;
  const canEdit = isPlannerLoaded(state.currentUid);
  const drawChips = () => {
    chips.replaceChildren();
    const customs = getCustomStopReasons();
    const kinds = getCustomStopKinds();
    if (!customs.some(c => c.id === reason) && !BUILTIN_STOP_REASONS.some(r => r.id === reason)) reason = 'outro';
    const all = [...BUILTIN_STOP_REASONS.filter(r => !r.hidden), ...customs];
    all.forEach(r => {
      const b = button(`${r.emoji} ${r.label}`, `plan-chip${reason === r.id ? ' active' : ''}`, () => { reason = r.id; drawChips(); });
      b.setAttribute('aria-pressed', reason === r.id ? 'true' : 'false');
      chips.appendChild(b);
    });
    const editing = !!form || !!kindForm;
    if (canEdit && !editing) {
      if (customs.length < CUSTOM_STOP_REASON_MAX) {
        const add = button('+ Motivo', 'plan-chip plan-chip-ghost cal-stop-add', () => { form = { id: null, emoji: '', label: '', kind: 'neutral' }; manage = false; drawChips(); });
        add.setAttribute('aria-label', 'Adicionar motivo');
        chips.appendChild(add);
      }
      if (customs.length || kinds.length) {
        chips.appendChild(button(manage ? '✓ Pronto' : '✏️ Meus motivos e tipos', 'plan-chip plan-chip-ghost', () => { manage = !manage; drawChips(); }));
      }
    }
    if (manage && !editing) chips.appendChild(manageList(customs, kinds));
    if (form) chips.appendChild(reasonForm(customs, kinds));
    else if (kindForm) chips.appendChild(kindFormEl(kinds));
  };

  const saveAll = async (reasons, kinds) => {
    saving = true;
    const res = await saveCustomStopReasons(state.currentUid, reasons, kinds);
    saving = false;
    if (!res.ok) await showAppAlert(res.error);
    return res.ok;
  };

  // Lista dos motivos e tipos criados: ✏️ editar / 🗑️ excluir.
  const manageList = (customs, kinds) => {
    const wrap = el('div', 'cal-stop-manage');
    if (customs.length) wrap.appendChild(el('span', 'plan-label', 'Motivos'));
    customs.forEach(c => {
      const line = el('div', 'cal-stop-mrow');
      line.appendChild(el('span', 'cal-stop-mname', `${c.emoji} ${c.label} · ${stopKindText(c.kind, kinds)}`));
      const e = button('✏️', 'rt-mini-btn', () => { form = { id: c.id, emoji: c.emoji, label: c.label, kind: c.kind }; drawChips(); });
      e.setAttribute('aria-label', `Editar ${c.label}`);
      const del = button('🗑️', 'rt-mini-btn', async () => {
        if (saving) return;
        const ok = await showAppConfirm(`Excluir o motivo "${c.label}"? Os dias já encerrados com ele continuam com o nome gravado.`);
        if (!ok) return;
        if (!(await saveAll(getCustomStopReasons().filter(x => x.id !== c.id), getCustomStopKinds()))) return;
        if (reason === c.id) reason = 'outro';
        if (!getCustomStopReasons().length && !getCustomStopKinds().length) manage = false;
        drawChips();
      });
      del.setAttribute('aria-label', `Excluir ${c.label}`);
      line.appendChild(e);
      line.appendChild(del);
      wrap.appendChild(line);
    });
    if (kinds.length) wrap.appendChild(el('span', 'plan-label', 'Tipos'));
    kinds.forEach(k => {
      const line = el('div', 'cal-stop-mrow');
      const uses = customs.filter(c => c.kind === k.id).length;
      line.appendChild(el('span', 'cal-stop-mname', `${k.emoji} ${k.label}${uses ? ` · ${uses} motivo(s)` : ''}`));
      const e = button('✏️', 'rt-mini-btn', () => { kindForm = { id: k.id, emoji: k.emoji, label: k.label, inReason: false }; drawChips(); });
      e.setAttribute('aria-label', `Editar tipo ${k.label}`);
      const del = button('🗑️', 'rt-mini-btn', async () => {
        if (saving) return;
        const ok = await showAppConfirm(`Excluir o tipo "${k.label}"?${uses ? ` ${uses} motivo(s) com esse tipo passam pra ➖ Neutro.` : ''} Os dias já encerrados continuam com o nome gravado.`);
        if (!ok) return;
        const reasons = getCustomStopReasons().map(c => (c.kind === k.id ? { ...c, kind: 'neutral' } : c));
        if (!(await saveAll(reasons, getCustomStopKinds().filter(x => x.id !== k.id)))) return;
        if (!getCustomStopReasons().length && !getCustomStopKinds().length) manage = false;
        drawChips();
      });
      del.setAttribute('aria-label', `Excluir tipo ${k.label}`);
      line.appendChild(e);
      line.appendChild(del);
      wrap.appendChild(line);
    });
    return wrap;
  };

  // Campos emoji + nome (+ sugestões de emoji) — motivo e tipo usam igual.
  const nameFields = (target, placeholder, defEmoji) => {
    const frag = el('div', 'cal-stop-fields');
    const rowIn = el('div', 'cal-stop-frow');
    const emo = document.createElement('input');
    emo.className = 'plan-input cal-stop-emoji';
    emo.type = 'text';
    emo.maxLength = 16;
    emo.placeholder = defEmoji;
    emo.value = target.emoji;
    emo.setAttribute('aria-label', 'Emoji');
    emo.addEventListener('input', () => { target.emoji = emo.value; });
    const name = document.createElement('input');
    name.className = 'plan-input cal-stop-name';
    name.type = 'text';
    name.maxLength = STOP_LABEL_MAX;
    name.placeholder = placeholder;
    name.value = target.label;
    name.setAttribute('aria-label', 'Nome');
    name.addEventListener('input', () => { target.label = name.value; });
    rowIn.appendChild(emo);
    rowIn.appendChild(name);
    frag.appendChild(rowIn);
    const sug = el('div', 'plan-chips cal-stop-emojis');
    STOP_EMOJI_SUGGESTIONS.forEach(e2 => {
      const b = button(e2, `plan-chip cal-stop-emo${target.emoji === e2 ? ' active' : ''}`, () => { target.emoji = e2; emo.value = e2; sug.querySelectorAll('.cal-stop-emo').forEach(x => x.classList.toggle('active', x.textContent === e2)); });
      b.setAttribute('aria-label', `Usar ${e2}`);
      sug.appendChild(b);
    });
    frag.appendChild(sug);
    return { frag, name };
  };
  const cleanName = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const cleanEmoji = (t, def) => Array.from(String(t || '').trim()).slice(0, STOP_EMOJI_MAX).join('') || def;

  // Criar / editar um tipo (sozinho ou dentro do formulário do motivo).
  const kindFormEl = (kinds) => {
    const f = el('div', 'cal-stop-form cal-stop-kform');
    f.appendChild(el('span', 'plan-label', kindForm.id ? 'Editar tipo' : 'Novo tipo'));
    const { frag, name } = nameFields(kindForm, 'Nome do tipo (ex.: Emocional)', DEFAULT_KIND_EMOJI);
    f.appendChild(frag);
    const acts = el('div', 'plan-choice-actions');
    acts.appendChild(button(kindForm.id ? 'Salvar tipo' : 'Adicionar tipo', 'plan-choice-btn', async () => {
      if (saving) return;
      const label = cleanName(kindForm.label);
      if (!label) { await showAppAlert('Digite o nome do tipo.'); name.focus(); return; }
      if (isDuplicateKindLabel(label, kinds, kindForm.id)) { await showAppAlert(`Já existe um tipo "${label}".`); return; }
      const emoji = cleanEmoji(kindForm.emoji, DEFAULT_KIND_EMOJI);
      const list = getCustomStopKinds();
      let id = kindForm.id;
      if (id) {
        const i = list.findIndex(x => x.id === id);
        if (i < 0) { await showAppAlert('Esse tipo não existe mais.'); kindForm = null; drawChips(); return; }
        list[i] = { ...list[i], emoji, label };
      } else {
        if (list.length >= CUSTOM_STOP_KIND_MAX) { await showAppAlert(`No máximo ${CUSTOM_STOP_KIND_MAX} tipos criados.`); return; }
        id = newCustomStopKindId();
        list.push({ id, emoji, label, createdAt: new Date().toISOString() });
      }
      if (!(await saveAll(getCustomStopReasons(), list))) return;
      if (kindForm.inReason && form) form.kind = id; // o novo já fica escolhido no motivo
      kindForm = null;
      drawChips();
    }));
    acts.appendChild(button('Cancelar', 'plan-choice-btn', () => { kindForm = null; drawChips(); }));
    f.appendChild(acts);
    setTimeout(() => name.focus(), 0);
    return f;
  };

  // Criar / editar um motivo.
  const reasonForm = (customs, kinds) => {
    const f = el('div', 'cal-stop-form');
    f.appendChild(el('span', 'plan-label', form.id ? 'Editar motivo' : 'Novo motivo'));
    const { frag, name } = nameFields(form, 'Nome (ex.: Cansado)', DEFAULT_CUSTOM_EMOJI);
    f.appendChild(frag);
    f.appendChild(el('span', 'plan-label', 'Tipo (ajuda nas análises)'));
    const kchips = el('div', 'plan-chips');
    [...BUILTIN_STOP_KINDS, ...kinds].forEach(k => {
      const b = button(`${k.emoji} ${k.label}`, `plan-chip${form.kind === k.id ? ' active' : ''}`, () => { form.kind = k.id; drawChips(); });
      b.setAttribute('aria-pressed', form.kind === k.id ? 'true' : 'false');
      kchips.appendChild(b);
    });
    if (!kindForm && kinds.length < CUSTOM_STOP_KIND_MAX) {
      const addK = button('+ Tipo', 'plan-chip plan-chip-ghost cal-stop-add', () => { kindForm = { id: null, emoji: '', label: '', inReason: true }; drawChips(); });
      addK.setAttribute('aria-label', 'Adicionar tipo');
      kchips.appendChild(addK);
    }
    f.appendChild(kchips);
    if (kindForm) {
      f.appendChild(kindFormEl(kinds));
      return f; // termina o tipo primeiro
    }
    const acts = el('div', 'plan-choice-actions');
    acts.appendChild(button(form.id ? 'Salvar' : 'Adicionar', 'plan-choice-btn', async () => {
      if (saving) return;
      const label = cleanName(form.label);
      if (!label) { await showAppAlert('Digite o nome do motivo.'); name.focus(); return; }
      if (label.length > STOP_LABEL_MAX) { await showAppAlert(`Nome com no máximo ${STOP_LABEL_MAX} letras.`); return; }
      if (isDuplicateStopLabel(label, customs, form.id)) { await showAppAlert(`Já existe um motivo "${label}".`); return; }
      const emoji = cleanEmoji(form.emoji, DEFAULT_CUSTOM_EMOJI);
      const list = getCustomStopReasons();
      let id = form.id;
      if (id) {
        const i = list.findIndex(x => x.id === id);
        if (i < 0) { await showAppAlert('Esse motivo não existe mais.'); form = null; drawChips(); return; }
        list[i] = { ...list[i], emoji, label, kind: form.kind };
      } else {
        id = newCustomStopReasonId();
        list.push({ id, emoji, label, kind: form.kind, createdAt: new Date().toISOString() });
      }
      if (!(await saveAll(list, getCustomStopKinds()))) return;
      if (!form.id) reason = id; // o novo já fica escolhido
      form = null;
      drawChips();
    }));
    acts.appendChild(button('Cancelar', 'plan-choice-btn', () => { form = null; drawChips(); }));
    f.appendChild(acts);
    if (!form.id && !form.label) setTimeout(() => name.focus(), 0);
    return f;
  };
  drawChips();
  box.appendChild(chips);
  box.appendChild(el('p', 'plan-hint', 'O dia conta como cumprido (🏁). O que faltava vai pros próximos dias SÓ desta plataforma — o Rollover, o plano das outras (mesmo do grupo) e a meta de hoje das outras não mudam. Dá pra ↩️ desfazer hoje.'));
  const actions = el('div', 'plan-choice-actions');
  go = button('🏁 Encerrar', 'plan-choice-btn', async () => {
    if (busy || saving) return;
    // (31) id do motivo + cópia do nome/tipo; (32) + o que foi somado em cada dia
    const item = buildStopItem(x, reason, dist);
    if (!distValid(item, dist)) { await showAppAlert(dist.mode === 'manual' ? 'A soma dos dias precisa fechar com o que faltava hoje.' : (SPREAD_NOTE[item.sp.error] || 'Escolha outra opção de distribuição.')); return; }
    go.disabled = true;
    const ok = await commitStops(d, [item]);
    if (ok) done();
    else go.disabled = false;
  });
  if (distItem) go.disabled = !distValid(distItem, dist);
  actions.appendChild(go);
  actions.appendChild(button('Cancelar', 'plan-choice-btn', () => done()));
  box.appendChild(actions);
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('appModal');
    if (modal && modal.style.display === 'flex') return; // (31) a confirmação cuida do Esc
    e.preventDefault(); e.stopPropagation(); done();
  }
  function done() { document.removeEventListener('keydown', onKey, true); overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  go.focus();
}

// Um cartão por plataforma no contêiner do dia.
// (32) 🏁 Encerrar várias: lista DESMARCADA, um motivo pra todas, a
// confirmação diz quais. Cada uma soma o próprio resto nos próprios dias.
function openStopMany(d, open) {
  if (detailClose) detailClose();
  // (36) cada plataforma com a própria distribuição (montada só quando aberta)
  const items = open.map(x => { const dist = newDist(); return { x, dist, preview: buildStopItem(x, 'outro', dist) }; });
  const picked = new Set();
  let reason = 'outro';
  const overlay = el('div', 'cal-overlay cal-stop-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', 'cal-box plan-choice-box');
  overlay.appendChild(box);
  let goBtn = null; // (36) o editor avisa antes do botão existir
  let chosenNow = [];
  const updateGo = () => { if (goBtn) goBtn.disabled = !chosenNow.length || chosenNow.some(it => !distValid(it.preview, it.dist)); };
  const draw = () => {
    box.replaceChildren();
    goBtn = null;
    chosenNow = items.filter(it => picked.has(it.x.platformId));
    const head = el('div', 'cal-box-head');
    head.appendChild(el('h3', 'cal-box-title', '🏁 Encerrar várias'));
    const cl = button('✕', 'cal-box-close', () => done());
    cl.setAttribute('aria-label', 'Cancelar');
    head.appendChild(cl);
    box.appendChild(head);
    box.appendChild(el('p', 'plan-hint', 'Marque só as plataformas em que você parou por hoje. Nada vem marcado. O resto de cada uma vai pros próximos dias dela.'));
    const listEl = el('div', 'cal-stop-many');
    items.forEach(it => {
      const on = picked.has(it.x.platformId);
      const rowEl = el('div', `cal-stop-many-item${on ? ' cal-stop-many-on' : ''}`);
      const lab = el('label', 'cal-stop-many-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = on;
      cb.setAttribute('aria-label', `Encerrar ${it.x.name}`);
      cb.addEventListener('change', () => { if (cb.checked) picked.add(it.x.platformId); else { picked.delete(it.x.platformId); it.dist.open = false; } draw(); });
      lab.appendChild(cb);
      const txt = el('div', 'cal-stop-many-txt');
      txt.appendChild(el('span', 'cal-stop-many-name', `${it.x.name} · falta ${money(it.preview.leftC)}`));
      const noteEl = el('span', 'cal-stop-many-note', spreadText(it.preview));
      txt.appendChild(noteEl);
      lab.appendChild(txt);
      rowEl.appendChild(lab);
      // (36) distribuição desta plataforma: só monta quando aberta
      if (on && it.preview.leftC > 0) {
        const label = (DIST_MODES.find(m => m[0] === it.dist.mode) || DIST_MODES[0])[1];
        const tg = button(`📅 ${label} ${it.dist.open ? '▴' : '▾'}`, `plan-chip plan-chip-ghost cal-dist-toggle${distValid(it.preview, it.dist) ? '' : ' cal-dist-toggle-bad'}`, () => { it.dist.open = !it.dist.open; draw(); });
        rowEl.appendChild(tg);
        if (it.dist.open) {
          rowEl.appendChild(distEditor(it.x, it.dist, (item) => {
            it.preview = item;
            noteEl.textContent = spreadText(item);
            const ok = distValid(item, it.dist);
            tg.textContent = `📅 ${(DIST_MODES.find(m => m[0] === it.dist.mode) || DIST_MODES[0])[1]} ▴`;
            tg.classList.toggle('cal-dist-toggle-bad', !ok);
            updateGo();
          }));
        }
      }
      listEl.appendChild(rowEl);
    });
    box.appendChild(listEl);
    box.appendChild(el('span', 'plan-label', 'Motivo (vale pra todas as marcadas)'));
    const chips = el('div', 'plan-chips cal-stop-reasons');
    [...BUILTIN_STOP_REASONS.filter(r => !r.hidden), ...getCustomStopReasons()].forEach(r => {
      const b = button(`${r.emoji} ${r.label}`, `plan-chip${reason === r.id ? ' active' : ''}`, () => { reason = r.id; draw(); });
      b.setAttribute('aria-pressed', reason === r.id ? 'true' : 'false');
      chips.appendChild(b);
    });
    box.appendChild(chips);
    const chosen = items.filter(it => picked.has(it.x.platformId));
    const leftSum = chosen.reduce((s2, it) => s2 + it.preview.leftC, 0);
    box.appendChild(el('p', 'plan-hint cal-stop-many-sum', chosen.length ? `${chosen.length} marcada(s) · ${money(leftSum)} que faltava hoje vai pros próximos dias delas.` : 'Nenhuma marcada.'));
    const acts = el('div', 'plan-choice-actions');
    const go = button(chosen.length ? `🏁 Encerrar (${chosen.length})` : '🏁 Encerrar', 'plan-choice-btn', async () => {
      if (busy || !chosen.length) return;
      const bad = chosen.filter(it => !distValid(buildStopItem(it.x, reason, it.dist), it.dist));
      if (bad.length) { await showAppAlert(`Confira a distribuição de: ${bad.map(it => it.x.name).join(', ')}.`); return; }
      const ok = await showAppConfirm(`Encerrar hoje em ${chosen.length} plataforma(s): ${chosen.map(it => it.x.name).join(', ')}? Motivo: ${stopReasonText(reason, getCustomStopReasons())}. O que faltava de cada uma vai pros próximos dias dela.`);
      if (!ok) return;
      go.disabled = true;
      const done2 = await commitStops(d, chosen.map(it => buildStopItem(it.x, reason, it.dist)));
      if (done2) done();
      else go.disabled = false;
    });
    goBtn = go;
    updateGo();
    acts.appendChild(go);
    acts.appendChild(button('Cancelar', 'plan-choice-btn', () => done()));
    box.appendChild(acts);
  };
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('appModal');
    if (modal && modal.style.display === 'flex') return;
    e.preventDefault(); e.stopPropagation(); done();
  }
  function done() { document.removeEventListener('keydown', onKey, true); overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey, true);
  draw();
  document.body.appendChild(overlay);
}

function platformCard(d, x) {
  // (25) Só o dia 🙈 ignorado (📟 ligada): cartão apagado + "Voltar a contar".
  if (x.ignored && !x.plan && !x.noPlan && !x.restDay && !x.betRoutines.length && !x.routines.length && !x.deposits.length && !x.emission && !x.forbidden) {
    const card = el('div', 'cal-pf cal-pf-ignored');
    const head = el('div', 'cal-pf-head');
    head.appendChild(el('span', 'cal-pf-name', `📟 ${x.name}`));
    head.appendChild(el('span', 'cal-pf-value', `${money(x.ignored.realC)} de ${money(x.ignored.plannedC)}`));
    card.appendChild(head);
    const row = el('div', 'cal-pf-noplan-row');
    row.appendChild(el('span', 'cal-badge cal-badge-ignored', '🙈 Ignorado'));
    row.appendChild(button('Voltar a contar', 'bet-manage-btn cal-pf-open', () => toggleIgnored(d.key, x.platformId, x.name, x.ignored.plannedC, x.ignored.realC, false)));
    card.appendChild(row);
    return card;
  }
  const card = el('div', `cal-pf${x.attention ? ' cal-pf-attn' : ''}${x.noPlan ? ' cal-pf-noplan' : ''}`);
  const head = el('div', 'cal-pf-head');
  const icon = x.plan ? (STATUS_ICON[x.plan.status] || '') : (x.noPlan ? '⚠️' : (x.restDay ? '😴' : '▫️'));
  const nameEl = el('span', 'cal-pf-name', `${icon} ${x.name}`);
  // (33) hoje: saldo real ao vivo, na cor do nível (como no Financeiro)
  if (d.isToday && x.platformId !== '_') {
    const bal = liveBalanceOf(x.platformId);
    if (bal !== null) {
      const bb = el('span', 'platform-total-badge cal-pf-balance', `${contextConfirmed ? '' : '≈ '}${formatCurrency(bal)}`);
      bb.style.background = colorForLevel(bal);
      bb.title = contextConfirmed ? 'Saldo ao vivo (mesma conta do Financeiro)' : 'Saldo ao vivo aproximado — configurações de bônus ainda não carregadas';
      nameEl.appendChild(bb);
    }
  }
  head.appendChild(nameEl);
  let right = '';
  if (x.plan) right = d.isFuture ? money(x.plan.plannedC) : `${money(x.plan.realC)} de ${money(x.plan.plannedC)}`;
  else if (x.noPlan) right = 'sem plano';
  else if (x.restDay) right = 'sem aposta';
  head.appendChild(el('span', 'cal-pf-value', right));
  card.appendChild(head);

  // Selos: rotinas de aposta, emissão, dia proibido, acima do plano.
  const badges = el('div', 'cal-badges');
  x.betRoutines.forEach(it => {
    const b = el('span', `cal-badge cal-badge-bet cal-badge-${it.status}`, `🎲 ${it.emoji ? `${it.emoji} ` : ''}${it.name} ${it.status === 'due' ? '' : (RT_ICON[it.status] || '')}`.trim());
    if (it.minimum > 0) b.title = `Mínimo da rotina: ${formatCurrency(it.minimum)}`;
    badges.appendChild(b);
  });
  if (x.restDay) badges.appendChild(el('span', 'cal-badge cal-badge-rest', '😴 Folga do plano'));
  if (x.emission) badges.appendChild(el('span', 'cal-badge cal-badge-em', '🃏 Emissão'));
  if (x.forbidden) badges.appendChild(el('span', `cal-badge${x.forbidden.broken ? ' cal-badge-bad' : ' cal-badge-forb'}`, x.forbidden.broken ? '⚠️ Apostou em dia proibido' : '🚫 Não apostar'));
  if (x.plan && x.plan.overC > 0) badges.appendChild(el('span', 'cal-badge cal-badge-over', `+${money(x.plan.overC)} acima`));
  if (x.plan && x.plan.tier && !d.isToday && d.isFuture) badges.appendChild(el('span', 'cal-badge', `dia ${TIER_LABEL[x.plan.tier] || x.plan.tier}`));
  if (badges.childNodes.length) card.appendChild(badges);

  // (29) 📈 resultado já obtido no dia
  if (x.plan && !d.isFuture && (x.plan.realC > 0 || x.plan.rbC)) {
    const rb = x.plan.rbC || 0;
    // (33) ganho e perda no mesmo formato (perda em vermelho) + perda ÷ a mais
    let mult = x.plan.realC > 0 && rb !== 0 ? ` · ${fmtX(rb / x.plan.realC)} o apostado` : '';
    if (rb < 0 && x.plan.overC > 0) mult += ` · ${fmtX(rb / x.plan.overC)} o a mais`;
    card.appendChild(el('p', `cal-pf-line cal-pf-rb${rb < 0 ? ' cal-line-bad' : (rb > 0 ? ' cal-pf-rb-up' : '')}`, `📈 R.B. do dia: ${rb > 0 ? '+' : (rb < 0 ? '−' : '')}${money(Math.abs(rb))}${mult}`));
  }
  // (29) 🏁 dia encerrado
  if (x.plan && x.plan.stopped) {
    const st = x.plan.stop || {};
    const h = st.at ? new Date(st.at) : null;
    card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-stop', `🏁 Encerrado${h && !isNaN(h.getTime()) ? ` às ${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}` : ''} · ${stopReasonText(st.reason, getCustomStopReasons(), st)} · R.B. ${st.rbC >= 0 ? '+' : '−'}${money(Math.abs(st.rbC || 0))} · meta original ${money(x.plan.originalC || 0)} (o resto foi pros próximos dias)`));
    if (d.isToday) { // (32) ↩️ só no mesmo dia
      const act = el('div', 'cal-pf-actions');
      act.appendChild(button('↩️ Desfazer 🏁', 'cal-pf-ignore', () => undoStop(d, x)));
      card.appendChild(act);
    }
  }
  // 👉 o que apostar.
  if (x.plan && !x.plan.stopped) {
    if (d.isFuture) {
      if (x.plan.lines && x.plan.lines.length) card.appendChild(el('p', 'cal-pf-tip', `🎯 ${describeLines(x.plan.lines)}`));
    } else if (d.isToday) {
      const sug = suggestForRow(x.plan);
      if (sug) {
        const txt = sug.lines.length
          ? `👉 Falta ${money(sug.leftC)}: ${describeLines(sug.lines)}`
          : `👉 Falta ${money(sug.leftC)}`;
        // (29) 💡 lucro do dia ≥ meta do dia → vale encerrar
        const rb = x.plan.rbC || 0;
        if (rb > 0 && rb >= x.plan.plannedC) {
          card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-stop', `💡 Lucro de ${money(rb)} hoje — maior que a meta do dia (${money(x.plan.plannedC)}). Vale encerrar o dia?`));
        }
        card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-now', txt));
        const act = el('div', 'cal-pf-actions');
        act.appendChild(button('🏁 Encerrar o dia', `cal-pf-ignore${rb > 0 && rb >= x.plan.plannedC ? ' cal-pf-stop-hot' : ''}`, () => openStopDay(d, x)));
        card.appendChild(act);
      } else {
        card.appendChild(el('p', 'cal-pf-tip cal-pf-tip-ok', '✅ Meta de aposta do dia cumprida.'));
      }
    } else if (x.plan.lines && x.plan.lines.length && x.plan.status !== 'done') {
      card.appendChild(el('p', 'cal-pf-tip', `Planejado: ${describeLines(x.plan.lines)}`));
    }
  }
  if (x.noPlan) {
    const row = el('div', 'cal-pf-noplan-row');
    const r = x.planRange;
    let why = 'a plataforma não tem plano salvo';
    if (x.noPlanReason === 'ended') why = `o plano terminou em ${fmtDay(r.endKey)}`;
    if (x.noPlanReason === 'notStarted') why = `o plano só começa em ${fmtDay(r.startKey)}`;
    row.appendChild(el('span', 'cal-pf-warn', d.isFuture || d.isToday
      ? `⚠️ Sem plano — a rotina de aposta vale neste dia e ${why}.`
      : `⚠️ Sem plano neste dia — a rotina de aposta valia e ${why}.`));
    if (d.isFuture || d.isToday) row.appendChild(button('Abrir no Planejador', 'bet-manage-btn cal-pf-open', () => openInPlanner(x.platformId)));
    card.appendChild(row);
  }
  if (x.offPlanC > 0) card.appendChild(el('p', 'cal-pf-line cal-line-muted', `↪ ${money(x.offPlanC)} apostado fora do plano`));

  // Rotinas de depósito / lembrete / sem depósito.
  x.routines.forEach(it => {
    const r = el('div', `cal-pf-line cal-pf-rt${PROBLEM.has(it.status) ? ' cal-line-bad' : ''}`);
    const ic = RT_ACTION_ICON[it.action] || '✔️';
    r.appendChild(el('span', 'cal-line-l', `${RT_ICON[it.status] || '·'} ${ic} ${it.emoji ? `${it.emoji} ` : ''}${it.name}${it.deferredFrom ? ` · ⏭ adiado de ${it.deferredFrom.slice(8, 10)}/${it.deferredFrom.slice(5, 7)}` : ''}`));
    let info = '';
    if (it.status === 'paused') info = 'ciclo encerrado';
    else if (it.status === 'deferred') info = it.deferredFrom ? 'continua devido' : 'adiado';
    else if (it.action === 'deposit') {
      if (d.isToday && it.amount !== null && it.amount !== undefined) info = `${formatCurrency(it.amount)}${it.minimum > 0 ? ` de ${formatCurrency(it.minimum)}` : ''}`;
      else if (it.minimum > 0) info = `mín. ${formatCurrency(it.minimum)}`;
    }
    r.appendChild(el('span', 'cal-line-r', info));
    card.appendChild(r);
    // (27) Depósito pausado (ciclo encerrado) — escolha do dia (só hoje).
    if (d.isToday && it.action === 'deposit' && it.routineId && it.status !== 'done') {
      const acts = el('div', 'cal-pf-actions');
      if (it.status === 'paused') {
        acts.appendChild(button('Depositar mesmo assim', 'cal-pf-ignore', () => chooseDeposit(d.key, it.routineId, x.platformId, 'force')));
        if (!it.deferredFrom) acts.appendChild(button('⏭ Adiar', 'cal-pf-ignore', () => chooseDeposit(d.key, it.routineId, x.platformId, 'defer')));
      } else if (it.choice === 'force' || it.choice === 'defer') {
        acts.appendChild(button('Desfazer', 'cal-pf-ignore', () => chooseDeposit(d.key, it.routineId, x.platformId, null)));
      } else if (it.status === 'pending' && !it.deferredFrom) {
        // (34) qualquer depósito de hoje: ⏭ Adiar (hoje neutro, vai pro próximo dia)
        acts.appendChild(button('⏭ Adiar', 'cal-pf-ignore', () => chooseDeposit(d.key, it.routineId, x.platformId, 'defer')));
      }
      if (it.deferredFrom && !it.choice) acts.appendChild(button('Desfazer adiamento', 'cal-pf-ignore', () => chooseDeposit(it.deferredFrom, it.routineId, x.platformId, null, d.key)));
      if (acts.childNodes.length) card.appendChild(acts);
    }
  });

  // Depósitos feitos.
  if (x.deposits.length) {
    const parts = x.deposits.map(dp => {
      const kind = DEPOSIT_KINDS.find(k => k.id === dp.kind);
      return `${kind ? kind.emoji : '▫️'} ${money(dp.valueC)}`;
    });
    card.appendChild(el('p', 'cal-pf-line', `💰 Depositado ${money(x.depositC)} · ${parts.join(' · ')}`));
  }

  // (25) 🙈 dia passado com planejado no histórico / 📟 ignorado neste dia.
  if (x.plan && !d.isFuture && !d.isToday && x.plan.source === 'log') {
    const row = el('div', 'cal-pf-actions');
    row.appendChild(button('🙈 Ignorar', 'cal-pf-ignore', () => toggleIgnored(d.key, x.platformId, x.name, x.plan.plannedC, x.plan.realC, true)));
    card.appendChild(row);
  }
  if (x.ignored) {
    const row = el('div', 'cal-pf-noplan-row');
    row.appendChild(el('span', 'cal-badge cal-badge-ignored', `🙈 Plano ignorado: ${money(x.ignored.realC)} de ${money(x.ignored.plannedC)}`));
    row.appendChild(button('Voltar a contar', 'bet-manage-btn cal-pf-open', () => toggleIgnored(d.key, x.platformId, x.name, x.ignored.plannedC, x.ignored.realC, false)));
    card.appendChild(row);
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
  // (29) 📈 R.B. do dia (plataformas com plano)
  if (!d.isFuture && d.plan.rows.length) {
    const rbAll = d.plan.rows.reduce((s2, r) => s2 + (r.rbC || 0), 0);
    if (rbAll || d.plan.realC) sum.appendChild(el('span', `cal-day-chip${rbAll < 0 ? ' cal-day-chip-bad' : ''}`, `📈 R.B. ${rbAll > 0 ? '+' : (rbAll < 0 ? '−' : '')}${money(Math.abs(rbAll))}`));
  }
  if (d.deposits.totalC > 0) sum.appendChild(el('span', 'cal-day-chip', `💰 ${money(d.deposits.totalC)} depositado`));
  if (d.routines) {
    const r = d.routines;
    sum.appendChild(el('span', `cal-day-chip${r.fail ? ' cal-day-chip-bad' : ''}`, r.source === 'future' ? `✔️ ${r.total} rotina(s)` : `✔️ ${r.success} de ${r.total} rotina(s)`));
  }
  if (sum.childNodes.length) box.appendChild(sum);

  const list = buildDayPlatforms(d, { showIgnored: ui.layers.has('ended') });
  // (32) 🏁 Encerrar várias (hoje, 2+ com resto) — abre tudo DESMARCADO.
  if (d.isToday) {
    const open = list.filter(p => p.plan && !p.plan.stopped && p.plan.plannedC > p.plan.realC);
    if (open.length >= 2) {
      const bar = el('div', 'cal-pf-actions cal-stop-many-bar');
      bar.appendChild(button(`🏁 Encerrar várias (${open.length} com resto hoje)`, 'cal-pf-ignore', () => openStopMany(d, open)));
      box.appendChild(bar);
    }
  }
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
  // (33) perda ÷ apostado (sessões com perda) e perda ÷ o que jogou a mais
  box.appendChild(kpi('Perda ÷ apostado', m.lossOnWagered === null ? '—' : fmtX(m.lossOnWagered), m.lossWageredC ? `${money(m.lossC)} ÷ ${money(m.lossWageredC)} jogados` : 'sem sessão com perda', m.lossOnWagered !== null ? 'cal-kpi-bad' : ''));
  box.appendChild(kpi('Perda ÷ a mais', m.lossOnOver === null ? '—' : fmtX(m.lossOnOver), m.overLossDays ? `${money(m.overLossC)} ÷ ${money(m.overOnLossC)} a mais · ${m.overLossDays} dia(s)` : 'sem dia acima do plano com perda', m.lossOnOver !== null ? 'cal-kpi-bad' : ''));
  box.appendChild(kpi('Real × plano', m.overPlanPct === null ? '—' : `${m.overPlanPct >= 0 ? '+' : ''}${pct(m.overPlanPct, 1)}`, m.plannedC ? `${m.daysAbove} dia(s) acima · real ${money(m.realOnPlanC)} de ${money(m.plannedC)}` : 'sem dia com plano fechado', m.overPlanPct !== null && m.overPlanPct > 0 ? 'plan-kpi-vip' : ''));
  // (Sub-entrega 38) ⬆️ Rollover aumentado pela plataforma no período.
  {
    let aum = 0; let nAum = 0;
    filteredPlatforms().forEach(p => {
      const v = sumRolloverIncreases(p, range.fromKey, range.toKey);
      if (v > 0) { aum += v; nAum++; }
    });
    const aumC = Math.round(aum * 100);
    box.appendChild(kpi('⬆️ Rollover aumentado', money(aumC), nAum ? `${nAum} plataforma(s)` : 'nenhum aumento no período', aumC > 0 ? 'plan-kpi-vip' : ''));
  }
  renderGameStats(range);
  renderPvrDetail(m);
  // (29) 🏁 Paradas no período (dias encerrados com o histórico)
  {
    let n = 0; let rbStop = 0; let wStop = 0;
    const hi = range.toKey > todayKey() ? todayKey() : range.toKey;
    for (let k = range.fromKey; k <= hi; k = addDaysKey(k, 1)) {
      filteredPlatforms().forEach(p => {
        const lg = getPlanLogEntry(k, p.id);
        const st = activeStop(lg); // (32) desfeito não conta
        if (st && lg.ignored !== true) { n++; rbStop += Math.round(Number(st.rbC) || 0); wStop += Math.round(Number(st.wageredC) || 0); }
      });
    }
    if (n) box.appendChild(kpi('🏁 Paradas', `${n} · ${rbStop >= 0 ? '+' : '−'}${money(Math.abs(rbStop))}`, wStop > 0 ? `R.B. ÷ apostado: ${rbStop < 0 ? '−' : ''}${fmtX(rbStop / wStop)}` : 'sem aposta antes de parar', rbStop >= 0 ? 'plan-kpi-bonus' : ''));
  }
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
      // (25) 🙈 tirar este dia das contas
      if (r.fromLog) {
        const ig = button('🙈', 'cal-pvr-ignore', () => toggleIgnored(r.key, r.platformId, r.name, r.plannedC, r.realC, true));
        ig.setAttribute('aria-label', `Ignorar ${r.name} em ${fmtDay(r.key)}`);
        ig.title = 'Ignorar este dia';
        line.appendChild(ig);
      }
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
