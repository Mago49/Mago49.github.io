// === CALENDÁRIO DO BÔNUS MISTERIOSO (grade própria, leve) ===
// (Sub-entrega 49) Substitui o FullCalendar (baixado de CDN e pesado pra
// montar) por uma grade feita aqui, no mesmo espírito do calendário do
// Planejador. A disposição continua a mesma de antes:
//   - visões month / week / day, botões ‹ › e "today", título do período;
//   - mês com 6 semanas, domingo primeiro, dias de outros meses apagados,
//     hoje destacado;
//   - cada emissão = "pílula" com o nome da plataforma, na cor da faixa de
//     depósito (colorForLevel) e BORDA VERMELHA no dia 30;
//   - plataformas do dia em ordem ALFABÉTICA (era a ordem do FullCalendar);
//   - janela de emissões: de 10 dias atrás até 40 dias à frente;
//   - filtro por card (filterCalendarByPlatform / showAllBonusCalendar).
// As funções exportadas têm os MESMOS nomes de antes: view-calendario.js e
// ui-platform-cards.js não precisam saber que o motor mudou.
//
// 👁 VALORES (novo, opcional): botão "👁 Valores" mostra em cada pílula o
// depósito que define a faixa (até o fim da véspera da emissão — mesma regra
// da cor) e o bônus esperado do Misterioso (getEffectiveMisteriosoValue,
// com o template da plataforma). Desligado por padrão; a escolha fica neste
// aparelho (localStorage). Os templates vêm do contexto de bônus já
// confirmado na sessão (Sub 48) ou de uma leitura em segundo plano — sem
// eles, o bônus aparece como "—". Só exibição: nada é gravado.
//
// (Sub-entrega H) COR DO EVENTO = MESMO PATAMAR DO MISTERIOSO.
// (Sub-entrega 20) A emissão sai à 00:00 e vale pelos depósitos até o fim do
// dia ANTERIOR. Valor e cor param em 23:59:59.999 da véspera.
// (Sub-entrega 11c) "🚫 Sem ciclo do Misterioso" fica fora do calendário.
//
// SEGURANÇA: nome de plataforma só por textContent.
import { state } from './state.js';
import { computeEmissionDates, sumDepositsUpTo, colorForLevel } from './cycle-logic.js';
import { getEffectiveMisteriosoValue } from './misterioso-logic.js';
import { getCachedBonusContext, loadBonusContextStrict } from './bonus-context-store.js';
import { formatCurrency } from './utils.js';

const WEEKDAYS_SHORT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const VIEWS = [['month', 'month'], ['week', 'week'], ['day', 'day']];
const VALUES_KEY = 'calShowValues';

let rootEl = null;
let bodyEl = null;
let titleEl = null;
let todayBtn = null;
let eyeBtn = null;
let viewBtns = [];
let viewType = 'month';
let cursor = startOfDay(new Date());
let events = [];            // { id, key, platformId, name, color, isDay30, totalAtEmission }
let filterId = null;        // null = todas
let showValues = readShowValues();
let ctxLoading = false;

// Chave de dia LOCAL (AAAA-MM-DD). toISOString() converte pra UTC e
// desloca o dia em alguns fusos.
function toLocalDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function readShowValues() {
  try { return window.localStorage.getItem(VALUES_KEY) === '1'; } catch (err) { return false; }
}

function saveShowValues(on) {
  try { window.localStorage.setItem(VALUES_KEY, on ? '1' : '0'); } catch (err) { /* aparelho sem armazenamento: só não lembra */ }
}

// ---------- montagem ----------

// Cria o calendário e guarda em state.calendar (mesmo contrato de antes:
// state.calendar existe enquanto a view está montada; destroy() limpa).
// Chamar uma única vez, depois que #calendar já existe no DOM.
export function createCalendar() {
  rootEl = document.getElementById('calendar');
  if (!rootEl) return null;
  rootEl.replaceChildren();
  rootEl.classList.add('mcal');
  viewType = 'month';
  cursor = startOfDay(new Date());
  filterId = null;

  const toolbar = el('div', 'mcal-toolbar');
  const nav = el('div', 'mcal-nav');
  const prev = el('button', 'mcal-btn', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Anterior');
  prev.addEventListener('click', () => move(-1));
  const next = el('button', 'mcal-btn', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Próximo');
  next.addEventListener('click', () => move(1));
  nav.appendChild(prev);
  nav.appendChild(next);
  toolbar.appendChild(nav);

  todayBtn = el('button', 'mcal-btn mcal-today', 'today');
  todayBtn.type = 'button';
  todayBtn.addEventListener('click', () => {
    cursor = startOfDay(new Date());
    render();
    if (viewType === 'month') scrollToCurrentWeek();
  });
  toolbar.appendChild(todayBtn);

  eyeBtn = el('button', 'mcal-btn mcal-eye');
  eyeBtn.type = 'button';
  eyeBtn.addEventListener('click', () => {
    showValues = !showValues;
    saveShowValues(showValues);
    if (showValues) ensureBonusContext();
    render();
  });
  toolbar.appendChild(eyeBtn);
  rootEl.appendChild(toolbar);

  titleEl = el('h2', 'mcal-title');
  rootEl.appendChild(titleEl);

  const views = el('div', 'mcal-views');
  viewBtns = VIEWS.map(([id, label]) => {
    const b = el('button', 'mcal-btn mcal-view', label);
    b.type = 'button';
    b.dataset.view = id;
    b.addEventListener('click', () => {
      if (viewType === id) return;
      viewType = id;
      render();
    });
    views.appendChild(b);
    return b;
  });
  rootEl.appendChild(views);

  bodyEl = el('div', 'mcal-body');
  rootEl.appendChild(bodyEl);

  if (showValues) ensureBonusContext();

  state.calendar = {
    get view() { return { type: viewType === 'month' ? 'dayGridMonth' : (viewType === 'week' ? 'timeGridWeek' : 'timeGridDay') }; },
    render,
    destroy() {
      if (rootEl) { rootEl.replaceChildren(); rootEl.classList.remove('mcal'); }
      rootEl = null; bodyEl = null; titleEl = null; todayBtn = null; eyeBtn = null; viewBtns = [];
      events = [];
      filterId = null;
    }
  };
  render();
  return state.calendar;
}

function move(dir) {
  if (viewType === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  else if (viewType === 'week') cursor = addDays(cursor, 7 * dir);
  else cursor = addDays(cursor, dir);
  render();
}

// Ao abrir a página: rola até a semana atual (só a visão mensal).
export function scrollToCurrentWeek() {
  if (!rootEl) return;
  requestAnimationFrame(() => {
    const row = rootEl && rootEl.querySelector('.mcal-week-row.has-today');
    if (row) row.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
}

// ---------- eventos (emissões) ----------

export function updateCalendarEvents(onDone) {
  if (!state.calendar) return;
  const now = new Date();
  const windowFrom = new Date(now); windowFrom.setDate(windowFrom.getDate() - 10);
  const windowTo = new Date(now); windowTo.setDate(windowTo.getDate() + 40);
  const list = [];

  state.platforms.forEach(platform => {
    // (Sub-entrega 11c) "🚫 Sem ciclo do Misterioso" não aparece.
    if (platform.cycleEnded || platform.misteriosoCycle === 'no') return;
    const emissionDates = computeEmissionDates(platform, now);
    emissionDates.forEach((emDate, emIndex) => {
      if (emDate >= windowFrom && emDate <= windowTo) {
        // (Sub-entrega 20) Faixa = depósitos até o fim do dia ANTERIOR.
        const totalAtEmission = sumDepositsUpTo(platform, new Date(emDate.getTime() - 1));
        const key = toLocalDayKey(emDate);
        list.push({
          id: `emit_${platform.id}_${key}`,
          key,
          platformId: platform.id,
          name: String(platform.name || ''),
          color: colorForLevel(totalAtEmission),
          isDay30: emIndex === emissionDates.length - 1, // último item = bônus do dia 30
          totalAtEmission
        });
      }
    });
  });
  // Mesma ordem do FullCalendar: por nome.
  events = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  render();
  if (typeof onDone === 'function') onDone();
}

export function filterCalendarByPlatform(platformId) {
  if (!state.calendar) return;
  filterId = platformId;
  render();
}

export function showAllBonusCalendar() {
  if (!state.calendar) return;
  filterId = null;
  render();
}

// ---------- 👁 bônus esperado ----------

function ensureBonusContext() {
  if (ctxLoading || getCachedBonusContext(state.currentUid)) return;
  ctxLoading = true;
  loadBonusContextStrict(state.currentUid)
    .then(() => { ctxLoading = false; if (rootEl && showValues) render(); })
    .catch(err => { ctxLoading = false; console.warn('Calendário: templates do Misterioso não carregados — bônus esperado fica "—".', err); });
}

function expectedBonus(ev) {
  const ctx = getCachedBonusContext(state.currentUid);
  if (!ctx) return null;
  const platform = state.platforms.find(p => p.id === ev.platformId);
  if (!platform) return null;
  const tpl = (ctx.resolveCtx(platform) || {}).misteriosoTemplate || null;
  if (!tpl) return null;
  try { return getEffectiveMisteriosoValue(platform, ev.key, tpl); } catch (err) { return null; }
}

// ---------- desenho ----------

function eventsOn(key) {
  return events.filter(ev => ev.key === key && (filterId === null || ev.platformId === filterId));
}

function compactMoney(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n)
    ? n.toLocaleString('pt-BR')
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pill(ev) {
  const p = el('div', `mcal-ev${ev.isDay30 ? ' mcal-ev-30' : ''}`);
  p.style.background = ev.color;
  p.title = `${ev.name}${ev.isDay30 ? ' · dia 30' : ''}`;
  p.appendChild(el('span', 'mcal-ev-name', ev.name));
  if (showValues) {
    const bonus = expectedBonus(ev);
    // Mês/semana (célula estreita no celular): número curto, sem "R$".
    // Dia: valor completo.
    const fmt = viewType === 'day' ? formatCurrency : compactMoney;
    const vals = el('span', 'mcal-ev-vals');
    vals.appendChild(el('span', '', `💰${fmt(ev.totalAtEmission)}`));
    vals.appendChild(el('span', '', `🃏${bonus === null ? '—' : fmt(bonus)}`));
    p.appendChild(vals);
  }
  return p;
}

function render() {
  if (!rootEl || !bodyEl) return;
  const today = startOfDay(new Date());
  const todayKey = toLocalDayKey(today);
  viewBtns.forEach(b => {
    const on = b.dataset.view === viewType;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  eyeBtn.textContent = showValues ? '👁 Valores ✓' : '👁 Valores';
  eyeBtn.classList.toggle('active', showValues);
  eyeBtn.setAttribute('aria-pressed', showValues ? 'true' : 'false');
  bodyEl.replaceChildren();
  bodyEl.dataset.view = viewType;

  if (viewType === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    titleEl.textContent = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    todayBtn.disabled = today.getFullYear() === first.getFullYear() && today.getMonth() === first.getMonth();
    const gridStart = addDays(first, -first.getDay()); // domingo
    const head = el('div', 'mcal-head');
    WEEKDAYS_SHORT.forEach(w => head.appendChild(el('div', 'mcal-head-cell', w)));
    bodyEl.appendChild(head);
    for (let w = 0; w < 6; w++) {
      const row = el('div', 'mcal-week-row');
      for (let i = 0; i < 7; i++) {
        const d = addDays(gridStart, w * 7 + i);
        const key = toLocalDayKey(d);
        const cell = el('div', `mcal-cell${d.getMonth() !== first.getMonth() ? ' mcal-other' : ''}${key === todayKey ? ' mcal-is-today' : ''}`);
        if (key === todayKey) row.classList.add('has-today');
        cell.appendChild(el('div', 'mcal-daynum', String(d.getDate())));
        const evs = el('div', 'mcal-events');
        eventsOn(key).forEach(ev => evs.appendChild(pill(ev)));
        cell.appendChild(evs);
        row.appendChild(cell);
      }
      bodyEl.appendChild(row);
    }
    return;
  }

  if (viewType === 'week') {
    const start = addDays(cursor, -cursor.getDay());
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    titleEl.textContent = sameMonth
      ? `${start.getDate()} – ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    todayBtn.disabled = today >= start && today <= end;
    const head = el('div', 'mcal-head');
    const row = el('div', 'mcal-week-row mcal-week-tall');
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const key = toLocalDayKey(d);
      head.appendChild(el('div', `mcal-head-cell${key === todayKey ? ' mcal-is-today' : ''}`, `${WEEKDAYS_SHORT[i]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`));
      const cell = el('div', `mcal-cell${key === todayKey ? ' mcal-is-today' : ''}`);
      const evs = el('div', 'mcal-events');
      eventsOn(key).forEach(ev => evs.appendChild(pill(ev)));
      cell.appendChild(evs);
      row.appendChild(cell);
    }
    bodyEl.appendChild(head);
    bodyEl.appendChild(row);
    return;
  }

  // day
  const key = toLocalDayKey(cursor);
  titleEl.textContent = cursor.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  todayBtn.disabled = key === todayKey;
  bodyEl.appendChild(el('div', `mcal-head mcal-head-day${key === todayKey ? ' mcal-is-today' : ''}`, cursor.toLocaleDateString('pt-BR', { weekday: 'long' })));
  const list = el('div', `mcal-day-list${key === todayKey ? ' mcal-is-today' : ''}`);
  const evs = eventsOn(key);
  if (!evs.length) list.appendChild(el('p', 'mcal-empty', 'Nenhuma emissão neste dia.'));
  evs.forEach(ev => list.appendChild(pill(ev)));
  bodyEl.appendChild(list);
}
