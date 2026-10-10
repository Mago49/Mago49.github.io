// === UI DA ABA "ROTINAS" (View Gráficos — Sub-entrega 6) ===
// Três visões: HOJE (checklist conferido sozinho), ROTINAS (criar, editar,
// excluir — tudo editável) e HISTÓRICO (dias gravados + hoje ao vivo).
//
// BANCO: só routine-store.js (routines, routineLog, routineMarks). Nunca
// grava plataforma. Ao abrir, grava UMA vez o histórico dos dias fechados
// que ainda não têm documento (até 30 dias pra trás) — o resultado de cada
// dia passado fica congelado; editar uma rotina só vale dali pra frente.
//
// Leitura estrita: falha = tela bloqueada com "Tentar de novo" (nunca grava
// histórico em cima do que não conseguiu ler).
//
// SEGURANÇA: tudo do usuário (nomes, emojis, observações) entra por
// textContent/value — nenhum dado do usuário vai em innerHTML.
//
// === (Sub-entrega 7b) ===
// a) TIPO DO DEPÓSITO no editor ("Depositar" / "Não depositar"): "Qualquer
//    tipo" ou só 🗓️/🎁/🎲 (routine-logic.js confere e projeta por tipo).
// b) AGENDA DO DIA no topo de "Hoje": emissões do Misterioso de hoje,
//    sugestão de depósito (dentro do orçamento — mesma conta da aba
//    Misterioso), aposta planejada de hoje nos planos salvos, depósitos de
//    rotina pendentes e alerta de contenção. Só leitura. Planos/orçamento vêm
//    de plan-store.js (leitura TOLERANTE aqui — sem eles, a agenda avisa e
//    mostra o resto); o Misterioso precisa do contexto de bônus confirmado.
//
// === (Sub-entregas 11a/11b) ===
// - Agenda: o plano do Misterioso usa a prioridade por velocidade
//   (getStrategyPriority — plannerConfig/speed).
// - Lista: aviso das plataformas sem rotina 🗓️ de ativação semanal (ficam
//   fora do "Caixa do período" do Planejador).

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { toLocalDateString } from './finance-logic.js';
import { parseMoneyInput } from './wager-total-logic.js';
import {
  ROUTINE_ACTIONS, SCHEDULE_TYPES, STATUS_INFO, ROUTINE_COLOR_SUGGESTIONS, ROUTINE_EMOJI_SUGGESTIONS,
  ROUTINE_NAME_MAX, ROUTINE_NOTES_MAX, ROUTINE_HISTORY_DAYS, ROUTINE_DATES_MAX,
  evaluateRoutineDay, summarizeItems, summarizeLogRoutine, buildDayLog, listMissingLogDays,
  validateRoutine, addDaysKey
} from './routine-logic.js';
import {
  loadRoutineData, isRoutinesLoaded, getRoutines, getRoutineLogs, getMarks, getInvalidRoutineCount,
  saveRoutine, deleteRoutine, writeDayLogs, setReminderMark
} from './routine-store.js';
import { DEPOSIT_KINDS, getDepositKindInfo } from './deposit-kinds.js';
import { MISTERIOSO_DEPOSIT_THRESHOLDS } from './misterioso-logic.js';
import { buildMisteriosoStrategy, computeContention } from './strategy-logic.js';
import { weeklyRoutinePlatformIds } from './newplatform-logic.js';
import { loadPlannerData, isPlannerLoaded, getSavedPlanIds, getSavedPlan, getStrategySettings, getStrategyPriority } from './plan-store.js';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HISTORY_COLUMNS = 14;

let rootEl = null;
let mounted = false;
let busy = false;
let loadStatus = 'idle';
let loadToken = 0;
let view = 'hoje';      // sessão
let draft = null;       // rotina em edição (null = lista)
let pickerSearch = '';
let historyNote = '';
let resolveCtx = () => ({});     // (7b) contexto de bônus (templates do Misterioso)
let contextConfirmed = false;
let plannerFailed = false;       // (7b) planos/orçamento não carregados (agenda avisa)

// ---------- helpers ----------

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function todayKey() {
  return toLocalDateString(new Date());
}

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function fmtShort(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function fmtMoneyInput(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

function actionInfo(id) {
  return ROUTINE_ACTIONS.find(a => a.id === id) || ROUTINE_ACTIONS[0];
}

function sortedPlatforms() {
  return [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
}

export function describeSchedule(r) {
  const s = r.schedule || {};
  switch (s.type) {
    case 'daily': return 'Todo dia';
    case 'weekdays': return WEEK_ORDER.filter(d => (s.weekdays || []).includes(d)).map(d => WEEKDAY_LABELS[d]).join(', ');
    case 'every': return `A cada ${s.everyDays} dia(s), desde ${fmtShort(s.fromKey)}`;
    case 'since-last': return `A cada ${s.everyDays} dia(s) desde ${r.action === 'deposit' ? 'o último depósito' : 'a última aposta'}`;
    case 'dates': return `${(s.dates || []).length} data(s) escolhida(s)`;
    default: return '—';
  }
}

function describeMin(r) {
  const kind = describeKind(r);
  if (!actionInfo(r.action).usesMin) return kind;
  let out = 'qualquer valor';
  if (r.minMode === 'value') out = `mín. ${formatCurrency(r.minValue)}`;
  if (r.minMode === 'level') out = 'mín. do nível';
  return kind ? `${out} · ${kind}` : out;
}

// (7b) "só 🗓️ Ativação Semanal" — vazio quando conta qualquer tipo.
function describeKind(r) {
  if (!['deposit', 'no-deposit'].includes(r.action) || !r.depositKind) return '';
  const info = getDepositKindInfo(r.depositKind);
  return info.id ? `só ${info.emoji} ${info.label}` : '';
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="rtLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="rtRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <section id="rtMain" class="card-shell graficos-section app-hidden" aria-label="Rotinas">
      <div class="section-heading" style="padding:0 0 0.8rem;">
        <div>
          <h2>Rotinas</h2>
          <p>Regras do dia a dia por plataforma. O app confere sozinho com os depósitos e apostas lançados.</p>
        </div>
      </div>
      <div id="rtViews" class="plan-chips rt-views" role="tablist" aria-label="Visão"></div>
      <div id="rtBody" class="rt-body"></div>
    </section>
  `;
  const retry = $('rtRetry');
  if (retry) retry.addEventListener('click', () => loadData(true));
}

function renderLoadState() {
  const note = $('rtLoadNote');
  const retry = $('rtRetry');
  const main = $('rtMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando rotinas…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar as rotinas. Pra não gravar histórico em cima do que não foi lido, a aba fica bloqueada. Verifique a internet e tente de novo.';
  if (loadStatus === 'ok') {
    const parts = [];
    if (getInvalidRoutineCount() > 0) parts.push(`${getInvalidRoutineCount()} rotina(s) com dados inválidos foram ignoradas.`);
    if (historyNote) parts.push(historyNote);
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
  historyNote = '';
  if (force || !isRoutinesLoaded(uid)) {
    loadStatus = 'loading';
    renderLoadState();
    try {
      await loadRoutineData(uid, addDaysKey(today, -ROUTINE_HISTORY_DAYS), today);
    } catch (err) {
      if (token !== loadToken || !mounted) return;
      console.error('Rotinas: falha ao carregar:', err);
      loadStatus = 'error';
      renderLoadState();
      return;
    }
    if (token !== loadToken || !mounted) return;
  }
  loadStatus = 'ok';
  // (7b) Planos + orçamento pra Agenda do dia — tolerante (só leitura aqui).
  if (!isPlannerLoaded(uid)) {
    try {
      await loadPlannerData(uid);
      plannerFailed = false;
    } catch (err) {
      console.warn('Rotinas: planos/orçamento não carregados — a agenda mostra só o resto.', err);
      plannerFailed = true;
    }
    if (token !== loadToken || !mounted) return;
  } else {
    plannerFailed = false;
  }
  await closeMissingDays();
  if (token !== loadToken || !mounted) return;
  renderLoadState();
  renderAll();
}

// Grava o histórico dos dias fechados que ainda não têm documento.
async function closeMissingDays() {
  const today = todayKey();
  const routines = getRoutines();
  const missing = listMissingLogDays(routines, today, [...getRoutineLogs().keys()]);
  if (missing.length === 0) return;
  const docs = missing.map(k => buildDayLog(routines, state.platforms, k, getMarks(k)));
  const result = await writeDayLogs(state.currentUid, docs);
  if (!result.ok) historyNote = result.error;
}

// ---------- visões ----------

function renderViews() {
  const box = $('rtViews');
  if (!box) return;
  box.replaceChildren();
  [['hoje', 'Hoje'], ['rotinas', `Rotinas (${getRoutines().length})`], ['historico', 'Histórico']].forEach(([id, label]) => {
    const b = button(label, `plan-chip${view === id ? ' active' : ''}`, () => {
      if (busy) return;
      view = id;
      draft = null;
      renderAll();
    });
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', view === id ? 'true' : 'false');
    box.appendChild(b);
  });
}

function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  renderViews();
  const body = $('rtBody');
  if (!body) return;
  body.replaceChildren();
  if (view === 'hoje') renderToday(body);
  else if (view === 'rotinas') (draft ? renderEditor(body) : renderList(body));
  else renderHistory(body);
}

// ---------- HOJE ----------

function itemDetail(routine, item) {
  if (routine.action === 'deposit' || routine.action === 'bet') {
    const verb = routine.action === 'deposit' ? 'depositado' : 'apostado';
    const minText = item.minimum > 0 ? ` de ${formatCurrency(item.minimum)}` : '';
    return `${formatCurrency(item.amount)} ${verb}${minText}`;
  }
  if (item.status === 'broken') return `${routine.action === 'no-bet' ? 'aposta' : 'depósito'} de ${formatCurrency(item.amount)} lançado`;
  if (routine.action === 'reminder') return item.status === 'done' ? 'marcado' : 'toque pra marcar';
  if (item.status === 'ok') return routine.action === 'no-bet' ? 'nenhuma aposta até agora' : 'nenhum depósito até agora';
  return '';
}

// ---------- (7b) AGENDA DO DIA ----------

function sumTodayWagered(platform, today) {
  return (platform.betEntries || []).reduce((s, e) => {
    if (!e || !e.date) return s;
    const d = new Date(e.date);
    return !isNaN(d.getTime()) && toLocalDateString(d) === today ? s + (Number(e.wagered) || 0) : s;
  }, 0);
}

function agendaItem(list, icon, text, detail, cls = '') {
  const li = el('li', `rt-agenda-item${cls ? ` ${cls}` : ''}`);
  li.appendChild(el('span', 'rt-agenda-icon', icon));
  const box = el('span', 'rt-agenda-text');
  box.appendChild(el('span', 'rt-agenda-main', text));
  if (detail) box.appendChild(el('span', 'rt-agenda-detail', detail));
  li.appendChild(box);
  list.appendChild(li);
}

function renderAgenda(body, today, active) {
  const card = el('div', 'rt-agenda');
  card.appendChild(el('div', 'rt-agenda-title', `📋 Agenda do dia · ${fmtDay(today)}`));
  const list = el('ul', 'rt-agenda-list');
  const now = new Date();
  const byId = new Map(state.platforms.map(p => [p.id, p]));
  const plannerOk = isPlannerLoaded(state.currentUid);
  const settings = plannerOk ? getStrategySettings() : null;

  // Misterioso — emissões de hoje + sugestão dentro do orçamento.
  if (contextConfirmed) {
    const strategy = buildMisteriosoStrategy(state.platforms, resolveCtx, settings || {}, now, getStrategyPriority(now));
    if (strategy.emissionsToday.length) {
      agendaItem(list, '🎁', `Emissão do Misterioso hoje (${strategy.emissionsToday.length})`,
        strategy.emissionsToday.map(a => `${a.name}${a.tierIndex >= 0 ? ` · mín. ${formatCurrency(a.tierMinC / 100)}` : ' · sem faixa'}`).join(' · '));
    }
    if (settings && strategy.budgetC > 0) {
      const picks = strategy.plan.picks;
      if (picks.length) {
        const shown = picks.slice(0, 3).map(o => `${o.name}: depositar ${formatCurrency(o.needC / 100)} → faixa ${formatCurrency(MISTERIOSO_DEPOSIT_THRESHOLDS[o.tier])} (+${formatCurrency(o.gainC / 100)})`);
        if (picks.length > 3) shown.push(`+${picks.length - 3} na aba Misterioso`);
        agendaItem(list, '💡', `Sugestão do Misterioso · disponível ${formatCurrency(strategy.remainingC / 100)}`, shown.join(' · '));
      } else {
        agendaItem(list, '💡', `Orçamento do Misterioso: ${formatCurrency(strategy.usage.usedC / 100)} de ${formatCurrency(strategy.budgetC / 100)} usados`,
          strategy.remainingC > 0 ? 'Nenhuma subida de faixa cabe no que sobra.' : 'Orçamento do período já usado.');
      }
    }
  }

  // Planos de aposta salvos — o dia de hoje.
  if (plannerOk) {
    getSavedPlanIds().forEach(pid => {
      const plan = getSavedPlan(pid);
      const platform = byId.get(pid);
      if (!plan || !platform) return;
      const day = (plan.days || []).find(d => d.key === today);
      if (!day) return;
      const wagered = sumTodayWagered(platform, today);
      const planned = (Number(day.plannedC) || 0) / 100;
      const done = wagered >= planned - 0.004;
      agendaItem(list, done ? '✅' : '🎯', `${platform.name}: apostar ${formatCurrency(planned)}`,
        `apostado hoje ${formatCurrency(wagered)}${done ? ' · feito' : ` · falta ${formatCurrency(Math.max(0, planned - wagered))}`}`, done ? 'rt-agenda-done' : '');
    });
  }

  // Depósitos de rotina pendentes hoje.
  let pendingCount = 0;
  let pendingValue = 0;
  const names = [];
  active.forEach(({ r, items }) => {
    if (r.action !== 'deposit') return;
    items.forEach(i => {
      if (i.status !== 'pending') return;
      pendingCount++;
      pendingValue += Math.max(0, (Number(i.minimum) || 0) - (Number(i.amount) || 0));
      if (names.length < 6) names.push(i.platformName);
    });
  });
  if (pendingCount) {
    agendaItem(list, '💰', `Depósitos de rotina pendentes: ${pendingCount}${pendingValue > 0 ? ` (${formatCurrency(pendingValue)})` : ''}`,
      names.join(' · ') + (pendingCount > names.length ? ' …' : ''));
  }

  // Contenção (só quando perto ou acima do limite).
  if (settings && settings.betDepositMonthlyLimit > 0) {
    const c = computeContention(state.platforms, settings.betDepositMonthlyLimit, now);
    if (c.status === 'over' || c.status === 'near') {
      agendaItem(list, c.status === 'over' ? '⛔' : '⚠️', `🎲 Depósitos de Aposta no mês: ${formatCurrency(c.usedC / 100)} de ${formatCurrency(c.limitC / 100)}`,
        c.status === 'over' ? 'Limite do mês ultrapassado.' : `Restam ${formatCurrency(c.leftC / 100)} até o fim do mês.`, 'rt-agenda-warn');
    }
  }

  if (list.children.length === 0) {
    list.appendChild(el('li', 'rt-agenda-empty', 'Nada programado pra hoje além das rotinas.'));
  }
  card.appendChild(list);
  const notes = [];
  if (!contextConfirmed) notes.push('Misterioso fora da agenda (templates não carregados).');
  if (plannerFailed) notes.push('Planos e orçamento não carregados.');
  if (notes.length) card.appendChild(el('p', 'plan-hint', notes.join(' ')));
  body.appendChild(card);
}

function renderToday(body) {
  const today = todayKey();
  const routines = getRoutines();
  if (routines.length === 0) {
    renderAgenda(body, today, []);
    body.appendChild(el('p', 'graficos-note', 'Nenhuma rotina ainda. Crie a primeira na visão "Rotinas".'));
    body.appendChild(button('+ Nova rotina', 'btn-confirm rt-cta', () => { view = 'rotinas'; startDraft(null); }));
    return;
  }
  const marks = getMarks(today);
  const active = [];
  const notToday = [];
  routines.forEach(r => {
    const items = evaluateRoutineDay(r, state.platforms, today, today, marks);
    if (items.length) active.push({ r, items, sum: summarizeItems(items) });
    else notToday.push(r);
  });

  renderAgenda(body, today, active);

  const total = active.reduce((s, a) => ({
    total: s.total + a.sum.total, success: s.success + a.sum.success, fail: s.fail + a.sum.fail, pending: s.pending + a.sum.pending
  }), { total: 0, success: 0, fail: 0, pending: 0 });

  const cards = el('div', 'plan-kpis rt-kpis');
  const card = (label, value, extra = '') => {
    const c = el('div', `summary-card plan-kpi${extra ? ` ${extra}` : ''}`);
    c.appendChild(el('span', 'summary-label', label));
    c.appendChild(el('span', 'summary-value', value));
    return c;
  };
  cards.appendChild(card('Rotinas hoje', String(active.length)));
  cards.appendChild(card('Feitos', `${total.success} de ${total.total}`, 'plan-kpi-bonus'));
  cards.appendChild(card('Pendentes', String(total.pending)));
  cards.appendChild(card('Quebras', String(total.fail), total.fail ? 'rt-kpi-bad' : ''));
  body.appendChild(cards);

  // Pendentes e quebras primeiro.
  active.sort((a, b) => (b.sum.fail - a.sum.fail) || (b.sum.pending - a.sum.pending) || String(a.r.name).localeCompare(String(b.r.name), 'pt-BR'));
  active.forEach(({ r, items, sum }) => {
    const box = el('div', 'rt-card');
    box.style.borderLeftColor = r.color;
    const head = el('div', 'rt-card-head');
    head.appendChild(el('span', 'rt-emoji', r.emoji || actionInfo(r.action).emoji));
    head.appendChild(el('span', 'rt-name', r.name));
    head.appendChild(el('span', `rt-count${sum.fail ? ' rt-count-bad' : (sum.pending ? '' : ' rt-count-ok')}`, `${sum.success}/${sum.total}`));
    box.appendChild(head);
    box.appendChild(el('p', 'plan-hint', `${actionInfo(r.action).label} · ${describeSchedule(r)}${describeMin(r) ? ` · ${describeMin(r)}` : ''}`));
    if (r.notes) box.appendChild(el('p', 'plan-hint rt-notes', r.notes));

    const list = el('ul', 'rt-items');
    items.forEach(item => {
      const li = el('li', `rt-item rt-item-${item.status}`);
      li.appendChild(el('span', 'rt-item-icon', STATUS_INFO[item.status].icon));
      li.appendChild(el('span', 'rt-item-name', item.platformName));
      li.appendChild(el('span', 'rt-item-detail', itemDetail(r, item)));
      if (r.action === 'reminder') {
        li.classList.add('rt-item-click');
        li.setAttribute('role', 'button');
        li.tabIndex = 0;
        const toggle = () => onToggleReminder(r.id, item.platformId, item.status !== 'done');
        li.addEventListener('click', toggle);
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      list.appendChild(li);
    });
    box.appendChild(list);
    body.appendChild(box);
  });

  if (notToday.length) {
    const det = el('details', 'rt-not-today');
    det.appendChild(el('summary', '', `Não valem hoje (${notToday.length})`));
    notToday.forEach(r => det.appendChild(el('p', 'plan-hint', `${r.emoji || ''} ${r.name} — ${describeSchedule(r)}`)));
    body.appendChild(det);
  }
}

async function onToggleReminder(routineId, platformKey, checked) {
  if (busy) return;
  busy = true;
  try {
    const result = await setReminderMark(state.currentUid, todayKey(), routineId, platformKey, checked);
    if (!result.ok) await showAppAlert(result.error);
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- LISTA ----------

function renderList(body) {
  body.appendChild(button('+ Nova rotina', 'btn-confirm rt-cta', () => startDraft(null)));
  const routines = getRoutines();
  if (routines.length === 0) {
    body.appendChild(el('p', 'graficos-note', 'Nenhuma rotina criada.'));
    return;
  }
  // (11b) Plataformas sem rotina 🗓️ de ativação semanal ficam fora do
  // Caixa do Planejador — aviso aqui pra completar.
  const weeklyIds = weeklyRoutinePlatformIds(routines);
  const noWeekly = state.platforms.filter(p => !p.cycleEnded && !weeklyIds.has(p.id)).map(p => p.name);
  if (noWeekly.length) {
    const warn = el('details', 'rt-weekly-warn');
    warn.appendChild(el('summary', '', `⚠ ${noWeekly.length} plataforma(s) sem rotina 🗓️ de ativação semanal`));
    warn.appendChild(el('p', 'plan-hint', `Não entram no "Caixa do período" do Planejador: ${noWeekly.join(', ')}. Crie uma rotina "Depositar" com o tipo 🗓️ Ativação Semanal e inclua elas.`));
    body.appendChild(warn);
  }
  const byId = new Map(state.platforms.map(p => [p.id, p]));
  routines.forEach(r => {
    const box = el('div', 'rt-card');
    box.style.borderLeftColor = r.color;
    const head = el('div', 'rt-card-head');
    head.appendChild(el('span', 'rt-emoji', r.emoji || actionInfo(r.action).emoji));
    head.appendChild(el('span', 'rt-name', r.name));
    box.appendChild(head);
    const count = (r.platformIds || []).filter(id => byId.has(id)).length;
    box.appendChild(el('p', 'plan-hint',
      `${actionInfo(r.action).label} · ${describeSchedule(r)}${describeMin(r) ? ` · ${describeMin(r)}` : ''} · ${r.action === 'reminder' && count === 0 ? 'geral' : `${count} plataforma(s)`}`));
    if (r.notes) box.appendChild(el('p', 'plan-hint rt-notes', r.notes));
    const actions = el('div', 'rt-actions');
    actions.appendChild(button('Editar', 'bet-manage-btn', () => startDraft(r)));
    actions.appendChild(button('Duplicar', 'bet-manage-btn', () => startDraft({ ...r, id: null, name: `${r.name} (cópia)`.slice(0, ROUTINE_NAME_MAX) })));
    actions.appendChild(button('Excluir', 'btn-remove-modal', (e) => onDelete(r, e.target)));
    box.appendChild(actions);
    body.appendChild(box);
  });
}

async function onDelete(routine, btn) {
  if (busy) return;
  const ok = await showAppConfirm(`Excluir a rotina "${routine.name}"? O histórico dos dias já gravados continua guardado.`);
  if (!ok || !mounted) return;
  busy = true;
  btn.disabled = true;
  try {
    const result = await deleteRoutine(state.currentUid, routine.id);
    if (!result.ok) await showAppAlert(result.error);
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- EDITOR ----------

function startDraft(routine) {
  const base = routine ? JSON.parse(JSON.stringify(routine)) : null;
  draft = base ? {
    ...base,
    schedule: { type: 'daily', weekdays: [], everyDays: 8, fromKey: todayKey(), dates: [], ...(base.schedule || {}) },
    perPlatformMin: { ...(base.perPlatformMin || {}) },
    minValueText: fmtMoneyInput(base.minValue)
  } : {
    id: null,
    name: '',
    emoji: '💰',
    color: ROUTINE_COLOR_SUGGESTIONS[0],
    notes: '',
    action: 'deposit',
    minMode: 'value',
    minValue: 10,
    minValueText: '10,00',
    perPlatformMin: {},
    platformIds: [],
    depositKind: 'semanal',
    schedule: { type: 'since-last', weekdays: [], everyDays: 8, fromKey: todayKey(), dates: [] }
  };
  if (!draft.schedule.everyDays) draft.schedule.everyDays = 8;
  if (!draft.schedule.fromKey) draft.schedule.fromKey = todayKey();
  pickerSearch = '';
  view = 'rotinas';
  renderAll();
}

function field(label, content, hint) {
  const f = el('div', 'plan-field rt-field');
  f.appendChild(el('span', 'plan-label', label));
  (Array.isArray(content) ? content : [content]).forEach(c => f.appendChild(c));
  if (hint) f.appendChild(el('p', 'plan-hint', hint));
  return f;
}

function textInput(value, placeholder, onInput, attrs = {}) {
  const i = el('input', 'plan-input');
  i.type = attrs.type || 'text';
  i.value = value;
  if (placeholder) i.placeholder = placeholder;
  Object.entries(attrs).forEach(([k, v]) => { if (k !== 'type') i.setAttribute(k, v); });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function chipRow(options, isActive, onPick) {
  const row = el('div', 'plan-chips');
  options.forEach(o => row.appendChild(button(o.label, `plan-chip${isActive(o) ? ' active' : ''}`, () => onPick(o))));
  return row;
}

function renderEditor(body) {
  const d = draft;
  const action = actionInfo(d.action);
  body.appendChild(el('h3', 'rt-editor-title', d.id ? 'Editar rotina' : 'Nova rotina'));

  // Nome
  body.appendChild(field('Nome', textInput(d.name, 'Ex.: Depósito de 8 dias', v => { d.name = v; }, { maxlength: String(ROUTINE_NAME_MAX) })));

  // Emoji
  const emojiInput = textInput(d.emoji, '🙂', v => { d.emoji = v.slice(0, 16); }, { maxlength: '16' });
  emojiInput.classList.add('rt-emoji-input');
  body.appendChild(field('Emoji', [emojiInput, chipRow(ROUTINE_EMOJI_SUGGESTIONS.map(e => ({ label: e })), o => o.label === d.emoji, o => { d.emoji = o.label; renderAll(); })]));

  // Cor
  const colorRow = el('div', 'plan-chips');
  ROUTINE_COLOR_SUGGESTIONS.forEach(c => {
    const b = button('', `rt-swatch${d.color === c ? ' active' : ''}`, () => { d.color = c; renderAll(); });
    b.style.background = c;
    b.setAttribute('aria-label', `Cor ${c}`);
    colorRow.appendChild(b);
  });
  const custom = el('input', 'rt-color-input');
  custom.type = 'color';
  custom.value = d.color;
  custom.setAttribute('aria-label', 'Outra cor');
  custom.addEventListener('change', () => { d.color = custom.value; renderAll(); });
  colorRow.appendChild(custom);
  body.appendChild(field('Cor', colorRow));

  // Ação
  body.appendChild(field('Ação', chipRow(ROUTINE_ACTIONS.map(a => ({ ...a, label: `${a.emoji} ${a.label}` })), o => o.id === d.action, o => {
    // Emoji acompanha a ação só se o usuário ainda não escolheu outro.
    if (!d.emoji || d.emoji === actionInfo(d.action).emoji) d.emoji = o.emoji;
    d.action = o.id;
    if (!o.usesMin) d.minMode = 'none';
    else if (d.minMode === 'none' && o.id === 'deposit') d.minMode = 'value';
    if (d.minMode === 'level' && o.id !== 'bet') d.minMode = 'value';
    if (d.schedule.type === 'since-last' && !['deposit', 'bet'].includes(o.id)) d.schedule.type = 'daily';
    if (!['deposit', 'no-deposit'].includes(o.id)) d.depositKind = null;
    renderAll();
  }), action.auto ? 'Conferido sozinho com os lançamentos do Financeiro.' : 'Marcado à mão na visão Hoje.'));

  // Mínimo
  if (action.usesMin) {
    const modes = [{ id: 'none', label: 'Qualquer valor' }, { id: 'value', label: 'Valor mínimo' }];
    if (d.action === 'bet') modes.push({ id: 'level', label: 'Mínimo do nível' });
    const parts = [chipRow(modes, o => o.id === d.minMode, o => { d.minMode = o.id; renderAll(); })];
    if (d.minMode === 'value') {
      parts.push(textInput(d.minValueText || '', 'Ex.: 10,00', v => { d.minValueText = v; }, { inputmode: 'decimal', autocomplete: 'off' }));
    }
    body.appendChild(field('Mínimo', parts, d.minMode === 'level' ? 'Usa o mínimo do Bônus Diário do nível vigente em cada dia.' : 'Plataformas podem ter valor próprio na lista abaixo.'));
  }

  // (7b) Tipo do depósito
  if (d.action === 'deposit' || d.action === 'no-deposit') {
    const kinds = [{ id: null, label: 'Qualquer tipo' }, ...DEPOSIT_KINDS.map(k => ({ id: k.id, label: `${k.emoji} ${k.label}` }))];
    body.appendChild(field('Tipo do depósito', chipRow(kinds, o => o.id === (d.depositKind || null), o => { d.depositKind = o.id; renderAll(); }),
      d.depositKind
        ? (d.action === 'deposit'
          ? 'Só depósitos deste tipo contam (e o "desde o último" olha só eles).'
          : 'Só depósitos deste tipo quebram a regra.')
        : 'Qualquer depósito conta.'));
  }

  // Quando vale
  const schedTypes = SCHEDULE_TYPES.filter(t => t.id !== 'since-last' || ['deposit', 'bet'].includes(d.action));
  const sParts = [chipRow(schedTypes, o => o.id === d.schedule.type, o => { d.schedule.type = o.id; renderAll(); })];
  let sHint = '';
  if (d.schedule.type === 'weekdays') {
    sParts.push(chipRow(WEEK_ORDER.map(n => ({ id: n, label: WEEKDAY_LABELS[n] })), o => d.schedule.weekdays.includes(o.id), o => {
      const set = new Set(d.schedule.weekdays);
      if (set.has(o.id)) set.delete(o.id); else set.add(o.id);
      d.schedule.weekdays = [...set];
      renderAll();
    }));
  }
  if (d.schedule.type === 'every' || d.schedule.type === 'since-last') {
    const row = el('div', 'plan-row');
    row.appendChild(el('span', 'plan-sep', 'A cada'));
    row.appendChild(textInput(String(d.schedule.everyDays || ''), '8', v => { d.schedule.everyDays = Number(v); }, { type: 'number', min: '1', max: '365', inputmode: 'numeric' }));
    row.appendChild(el('span', 'plan-sep', 'dia(s)'));
    sParts.push(row);
    if (d.schedule.type === 'every') {
      const from = el('div', 'plan-row');
      from.appendChild(el('span', 'plan-sep', 'contando de'));
      from.appendChild(textInput(d.schedule.fromKey || '', '', v => { d.schedule.fromKey = v; }, { type: 'date' }));
      sParts.push(from);
      sHint = 'Data fixa: vale na data de início e depois de N em N dias.';
    } else {
      sHint = 'Cada plataforma tem seu relógio: vence quando já passaram N dias desde o último lançamento dela.';
    }
  }
  if (d.schedule.type === 'dates') {
    const one = el('div', 'plan-row');
    const dateIn = el('input', 'plan-input');
    dateIn.type = 'date';
    one.appendChild(dateIn);
    one.appendChild(button('Adicionar', 'bet-manage-btn plan-btn-inline', () => addDates([dateIn.value])));
    sParts.push(one);
    const range = el('div', 'plan-row');
    const r1 = el('input', 'plan-input'); r1.type = 'date'; r1.setAttribute('aria-label', 'De');
    const r2 = el('input', 'plan-input'); r2.type = 'date'; r2.setAttribute('aria-label', 'Até');
    range.appendChild(r1);
    range.appendChild(el('span', 'plan-sep', 'até'));
    range.appendChild(r2);
    range.appendChild(button('+ Intervalo', 'bet-manage-btn plan-btn-inline', () => {
      if (!r1.value || !r2.value || r1.value > r2.value) { showAppAlert('Escolha o início e o fim do intervalo.'); return; }
      const keys = [];
      for (let k = r1.value, g = 0; k <= r2.value && g < ROUTINE_DATES_MAX; k = addDaysKey(k, 1), g++) keys.push(k);
      addDates(keys);
    }));
    sParts.push(range);
    const chips = el('div', 'plan-chips rt-date-chips');
    (d.schedule.dates || []).slice().sort().forEach(k => chips.appendChild(button(`${fmtShort(k)} ✕`, 'plan-chip active', () => {
      d.schedule.dates = d.schedule.dates.filter(x => x !== k);
      renderAll();
    })));
    sParts.push(chips);
    sHint = `${(d.schedule.dates || []).length} data(s). Toque numa data pra tirar.`;
  }
  body.appendChild(field('Quando vale', sParts, sHint));

  // Plataformas
  body.appendChild(field(d.action === 'reminder' ? 'Plataformas (opcional — vazio = lembrete geral)' : 'Plataformas', renderPicker(d)));

  // Observação
  const notes = el('textarea', 'plan-input rt-notes-input');
  notes.rows = 2;
  notes.maxLength = ROUTINE_NOTES_MAX;
  notes.value = d.notes || '';
  notes.placeholder = 'Opcional';
  notes.addEventListener('input', () => { d.notes = notes.value; });
  body.appendChild(field('Observação', notes));

  const actions = el('div', 'plan-actions');
  actions.appendChild(button('Cancelar', 'bet-manage-btn', () => { draft = null; renderAll(); }));
  actions.appendChild(button(d.id ? 'Salvar alterações' : 'Criar rotina', 'btn-confirm', (e) => onSaveDraft(e.target)));
  body.appendChild(actions);
}

function addDates(keys) {
  const valid = keys.filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (!valid.length) { showAppAlert('Escolha uma data.'); return; }
  const set = new Set([...(draft.schedule.dates || []), ...valid]);
  if (set.size > ROUTINE_DATES_MAX) { showAppAlert(`Máximo de ${ROUTINE_DATES_MAX} datas.`); return; }
  draft.schedule.dates = [...set].sort();
  renderAll();
}

function renderPicker(d) {
  const wrap = el('div', 'rt-picker');
  const search = el('input', 'plan-input');
  search.type = 'search';
  search.placeholder = 'Buscar plataforma';
  search.value = pickerSearch;
  wrap.appendChild(search);

  const tools = el('div', 'rt-actions');
  const listBox = el('div', 'rt-picker-list');
  const usesMin = actionInfo(d.action).usesMin;

  const visible = () => {
    const q = pickerSearch.trim().toLowerCase();
    return sortedPlatforms().filter(p => !q || String(p.name).toLowerCase().includes(q));
  };

  const drawList = () => {
    listBox.replaceChildren();
    const sel = new Set(d.platformIds);
    visible().forEach(p => {
      const row = el('label', `rt-pick${sel.has(p.id) ? ' on' : ''}`);
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = sel.has(p.id);
      cb.addEventListener('change', () => {
        if (cb.checked) d.platformIds = [...new Set([...d.platformIds, p.id])];
        else {
          d.platformIds = d.platformIds.filter(x => x !== p.id);
          delete d.perPlatformMin[p.id];
        }
        drawList();
        countEl.textContent = `${d.platformIds.length} selecionada(s)`;
      });
      row.appendChild(cb);
      row.appendChild(el('span', 'rt-pick-name', p.name));
      if (usesMin && cb.checked) {
        const own = el('input', 'plan-input rt-pick-own');
        own.type = 'text';
        own.inputMode = 'decimal';
        own.placeholder = 'valor próprio';
        own.value = fmtMoneyInput(d.perPlatformMin[p.id]);
        own.setAttribute('aria-label', `Valor próprio de ${p.name}`);
        own.addEventListener('click', e => e.preventDefault());
        own.addEventListener('input', () => {
          const v = parseMoneyInput(own.value);
          if (Number.isFinite(v) && v > 0) d.perPlatformMin[p.id] = v;
          else delete d.perPlatformMin[p.id];
        });
        row.appendChild(own);
      }
      listBox.appendChild(row);
    });
  };

  const countEl = el('span', 'plan-hint', `${d.platformIds.length} selecionada(s)`);
  tools.appendChild(button('Marcar visíveis', 'bet-manage-btn', () => {
    d.platformIds = [...new Set([...d.platformIds, ...visible().map(p => p.id)])];
    drawList();
    countEl.textContent = `${d.platformIds.length} selecionada(s)`;
  }));
  tools.appendChild(button('Limpar', 'bet-manage-btn', () => {
    d.platformIds = [];
    d.perPlatformMin = {};
    drawList();
    countEl.textContent = '0 selecionada(s)';
  }));
  tools.appendChild(countEl);
  search.addEventListener('input', () => { pickerSearch = search.value; drawList(); });

  wrap.appendChild(tools);
  wrap.appendChild(listBox);
  drawList();
  return wrap;
}

async function onSaveDraft(btn) {
  if (busy || !draft) return;
  const d = draft;
  const candidate = {
    id: d.id || undefined,
    name: d.name,
    emoji: d.emoji,
    color: d.color,
    notes: d.notes || '',
    action: d.action,
    minMode: actionInfo(d.action).usesMin ? d.minMode : 'none',
    minValue: d.minMode === 'value' ? parseMoneyInput(d.minValueText) : 0,
    perPlatformMin: d.perPlatformMin,
    platformIds: d.platformIds.filter(id => state.platforms.some(p => p.id === id)),
    depositKind: ['deposit', 'no-deposit'].includes(d.action) ? (d.depositKind || null) : null,
    schedule: { ...d.schedule, everyDays: Number(d.schedule.everyDays) }
  };
  if (!candidate.id) delete candidate.id;
  const check = validateRoutine(candidate);
  if (!check.ok) { await showAppAlert(check.error); return; }

  busy = true;
  btn.disabled = true;
  let saved = false;
  try {
    const result = await saveRoutine(state.currentUid, candidate);
    if (!result.ok) { await showAppAlert(result.error); return; }
    saved = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (saved && mounted) { draft = null; renderAll(); }
  }
}

// ---------- HISTÓRICO ----------

function renderHistory(body) {
  const today = todayKey();
  const logs = getRoutineLogs();
  const routines = getRoutines();
  const days = [];
  for (let i = HISTORY_COLUMNS - 1; i >= 0; i--) days.push(addDaysKey(today, -i));

  // Linhas: rotinas atuais + rotinas excluídas que aparecem no histórico.
  const rows = new Map();
  routines.forEach(r => rows.set(r.id, { id: r.id, name: r.name, emoji: r.emoji, color: r.color, deleted: false }));
  logs.forEach(log => Object.entries(log.routines || {}).forEach(([rid, lr]) => {
    if (!rows.has(rid)) rows.set(rid, { id: rid, name: lr.name, emoji: lr.emoji, color: lr.color, deleted: true });
  }));

  if (rows.size === 0) {
    body.appendChild(el('p', 'graficos-note', 'Sem histórico ainda. Os dias são gravados quando terminam.'));
    return;
  }

  body.appendChild(el('p', 'plan-hint rt-history-legend', `Últimos ${HISTORY_COLUMNS} dias · 🟩 tudo feito · 🟨 parcial · 🟥 nada feito · ⬜ não valia · hoje ao vivo`));
  const todayMarks = getMarks(today);

  rows.forEach(row => {
    const card = el('div', 'rt-card');
    card.style.borderLeftColor = row.color || '#94a3b8';
    const head = el('div', 'rt-card-head');
    head.appendChild(el('span', 'rt-emoji', row.emoji || '•'));
    head.appendChild(el('span', 'rt-name', row.deleted ? `${row.name} (excluída)` : row.name));
    card.appendChild(head);

    const strip = el('div', 'rt-strip');
    let due = 0;
    let success = 0;
    let streak = 0;
    let streakOpen = true;
    const cells = days.map(k => {
      let sum = null;
      if (k === today) {
        const r = routines.find(x => x.id === row.id);
        if (r) {
          const items = evaluateRoutineDay(r, state.platforms, k, today, todayMarks);
          if (items.length) sum = summarizeItems(items);
        }
      } else if (logs.has(k) && logs.get(k).routines && logs.get(k).routines[row.id]) {
        sum = summarizeLogRoutine(logs.get(k).routines[row.id]);
      }
      return { k, sum };
    });
    cells.forEach(({ k, sum }) => {
      const cell = el('span', 'rt-cell');
      let cls = 'rt-cell-none';
      let title = `${fmtDay(k)}: não valia`;
      if (sum && sum.total > 0) {
        if (k !== today) { due += sum.total; success += sum.success; }
        if (sum.success === sum.total) cls = 'rt-cell-full';
        else if (sum.success > 0 || sum.pending > 0) cls = 'rt-cell-part';
        else cls = 'rt-cell-fail';
        title = `${fmtDay(k)}: ${sum.success} de ${sum.total}${sum.pending ? ` (${sum.pending} pendente)` : ''}`;
      } else if (k !== today && !logs.has(k)) {
        cls = 'rt-cell-unknown';
        title = `${fmtDay(k)}: sem registro`;
      }
      cell.className = `rt-cell ${cls}${k === today ? ' rt-cell-today' : ''}`;
      cell.title = title;
      cell.setAttribute('aria-label', title);
      strip.appendChild(cell);
    });
    // Sequência: dias seguidos com tudo feito, de ontem pra trás (hoje conta se já estiver completo).
    for (let i = cells.length - 1; i >= 0 && streakOpen; i--) {
      const { k, sum } = cells[i];
      if (!sum || sum.total === 0) continue;
      if (k === today && sum.success !== sum.total) continue;
      if (sum.success === sum.total) streak++;
      else streakOpen = false;
    }
    card.appendChild(strip);
    const rate = due > 0 ? Math.round((success / due) * 100) : null;
    card.appendChild(el('p', 'plan-hint', `${rate === null ? 'Sem dias fechados no período' : `Cumprimento: ${rate}% (${success} de ${due})`} · Sequência: ${streak} dia(s)`));
    body.appendChild(card);
  });
}

// ---------- API pública (view-graficos.js) ----------

export function mountRotinas(root, options = {}) {
  if (!root) return;
  unmountRotinas();
  rootEl = root;
  mounted = true;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba / virada do dia: fecha dias novos e redesenha.
export async function refreshRotinas() {
  if (!mounted || loadStatus !== 'ok' || busy) return;
  await closeMissingDays();
  if (!mounted) return;
  renderLoadState();
  if (!draft) renderAll();
}

export function unmountRotinas() {
  loadToken++;
  mounted = false;
  rootEl = null;
  busy = false;
  draft = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
