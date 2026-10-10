// === CALENDÁRIO — PLANEJADO × REAL (Gráficos → Calendário — Sub-entrega 8b) ===
// Função pura: sem DOM e sem Firestore. Tudo que vem do banco entra por
// parâmetro (planos salvos, histórico do planejado, rotinas).
//
// PLANEJADO DE UM DIA (por plataforma):
//   dia que já passou → histórico congelado (planLog); se ainda não houver
//                       (dia fechando agora), o próprio plano salvo;
//   hoje / futuro     → plano salvo.
// REAL = soma do "valor apostado" lançado no Financeiro naquele dia.
//
// STATUS (decisão do usuário):
//   ✅ done    real ≥ planejado
//   🟡 partial real ≥ limite% do planejado (padrão 50%, editável)
//   ❌ miss    abaixo do limite
//   ⏳ today   hoje ainda em aberto (mostra o andamento, não reprova)
//   ·  future  dia futuro
// Apostou ACIMA do plano: continua ✅, e a diferença vira métrica (% acima).
//
// MÉTRICAS DE RESULTADO REAL (por LANÇAMENTO — cada lançamento do
// Financeiro é uma sessão):
//   vitórias = lançamentos com R.B. > 0 (quantidade e valor);
//   derrotas = lançamentos com R.B. < 0 (quantidade e valor);
//   multiplicador de perda = derrotas ÷ depositado no período;
//   giro = apostado ÷ depositado;
//   % acima do plano = (real − planejado) ÷ planejado, só dias com plano;
//   % acima do limite = 🎲 Depósitos de Aposta do mês acima do limite
//                       mensal (contenção da aba Misterioso).
//
// (Sub-entrega 11c) Camada 🃏: plataforma "🚫 Sem ciclo do Misterioso"
// (misteriosoCycle === 'no') não mostra emissões.

import { toLocalDateString } from './finance-logic.js';
import { computeEmissionDates } from './cycle-logic.js';
import { getDepositKindId } from './deposit-kinds.js';
import {
  evaluateRoutineDay, summarizeItems, forbiddenBetDays
} from './routine-logic.js';

export const DEFAULT_PARTIAL_THRESHOLD = 50;
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function toC(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function keyOf(d) {
  return toLocalDateString(d);
}

function entryKey(e) {
  if (!e || !e.date) return null;
  const d = new Date(e.date);
  return isNaN(d.getTime()) ? null : keyOf(d);
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + n));
}

export function monthKeyOf(key) {
  return key.slice(0, 7);
}

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthTitle(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { fromKey: `${ym}-01`, toKey: keyOf(new Date(y, m, 0)) };
}

// Semanas do mês, segunda a domingo (dias de fora do mês marcados).
export function buildMonthGrid(ym) {
  const { fromKey, toKey } = monthRange(ym);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const shift = (first.getDay() + 6) % 7; // segunda = 0
  let cursor = addDaysKey(fromKey, -shift);
  const weeks = [];
  let guard = 0;
  while (cursor <= toKey && guard < 7) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ key: cursor, day: Number(cursor.slice(8, 10)), inMonth: cursor >= fromKey && cursor <= toKey });
      cursor = addDaysKey(cursor, 1);
    }
    weeks.push(week);
    guard++;
  }
  return weeks;
}

export function dayStatus(plannedC, realC, thresholdPct = DEFAULT_PARTIAL_THRESHOLD) {
  if (!(plannedC > 0)) return null;
  if (realC >= plannedC) return 'done';
  if (realC * 100 >= plannedC * thresholdPct) return 'partial';
  return 'miss';
}

export function realWageredC(platform, dayKey) {
  return (platform.betEntries || []).reduce((s, e) => (entryKey(e) === dayKey ? s + toC(e.wagered) : s), 0);
}

/**
 * Planejado de (dia, plataforma), em centavos (null = sem plano no dia).
 * world: { todayKey, getPlanLog(dayKey, pid), plans: Map(pid → plano salvo) }
 */
export function plannedFor(dayKey, platformId, world) {
  if (dayKey < world.todayKey) {
    const log = world.getPlanLog ? world.getPlanLog(dayKey, platformId) : null;
    if (log) return Math.round(Number(log.plannedC) || 0);
  }
  const plan = world.plans ? world.plans.get(platformId) : null;
  const day = plan && Array.isArray(plan.days) ? plan.days.find(d => d.key === dayKey) : null;
  return day ? Math.round(Number(day.plannedC) || 0) : null;
}

/**
 * Tudo que cada dia do mês mostra.
 * world: { todayKey, platforms (já filtradas), getPlanLog, plans,
 *          thresholdPct, routines, routineLogs (Map dia → log),
 *          marksToday, hasMisterioso(platform) }
 */
export function buildCalendarMonth(ym, world) {
  const { fromKey, toKey } = monthRange(ym);
  const platforms = world.platforms || [];
  const threshold = world.thresholdPct || DEFAULT_PARTIAL_THRESHOLD;
  const days = new Map();
  for (let k = fromKey; k <= toKey; k = addDaysKey(k, 1)) {
    days.set(k, {
      key: k,
      isToday: k === world.todayKey,
      isFuture: k > world.todayKey,
      plan: { plannedC: 0, realC: 0, rows: [], status: null },
      offPlan: [],
      deposits: { semanal: 0, mensal: 0, aposta: 0, none: 0, totalC: 0, rows: [] },
      emissions: [],
      routines: null,
      forbidden: []
    });
  }
  const ids = new Set(platforms.map(p => p.id));

  platforms.forEach(p => {
    // Planejado × real
    days.forEach(d => {
      const plannedC = plannedFor(d.key, p.id, world);
      const realC = d.isFuture ? 0 : realWageredC(p, d.key);
      if (plannedC !== null && plannedC > 0) {
        const status = d.isFuture ? 'future' : (d.isToday && realC < plannedC ? 'today' : dayStatus(plannedC, realC, threshold));
        d.plan.plannedC += plannedC;
        d.plan.realC += realC;
        d.plan.rows.push({ platformId: p.id, name: String(p.name || ''), plannedC, realC, status, overC: Math.max(0, realC - plannedC) });
      } else if (realC > 0) {
        d.offPlan.push({ platformId: p.id, name: String(p.name || ''), realC });
      }
    });

    // Depósitos por tipo
    (p.depositLog || []).forEach(e => {
      const k = entryKey(e);
      if (!k || !days.has(k)) return;
      const d = days.get(k);
      const kind = getDepositKindId(e) || 'none';
      const c = toC(e.value);
      d.deposits[kind] += c;
      d.deposits.totalC += c;
      d.deposits.rows.push({ platformId: p.id, name: String(p.name || ''), kind, valueC: c });
    });

    // Emissões do Misterioso (ciclo daquele mês / ciclo atual)
    // (11c) "🚫 Sem ciclo do Misterioso" fica fora da camada.
    if (!p.cycleEnded && p.misteriosoCycle !== 'no' && (!world.hasMisterioso || world.hasMisterioso(p))) {
      const [y, m] = ym.split('-').map(Number);
      const ref = new Date(y, m - 1, 15, 12, 0, 0);
      computeEmissionDates(p, ref).forEach(date => {
        const k = keyOf(date);
        if (days.has(k)) days.get(k).emissions.push({ platformId: p.id, name: String(p.name || '') });
      });
    }

    // Dias proibidos (rotinas "Não apostar")
    if (Array.isArray(world.routines) && world.routines.length) {
      forbiddenBetDays(world.routines, p, fromKey, toKey).forEach(k => {
        const d = days.get(k);
        if (!d) return;
        d.forbidden.push({ platformId: p.id, name: String(p.name || ''), broken: !d.isFuture && realWageredC(p, k) > 0 });
      });
    }
  });

  // Rotinas: passado = histórico congelado; hoje = ao vivo; futuro = quantas valem.
  if (Array.isArray(world.routines)) {
    days.forEach(d => {
      const items = [];
      if (d.key < world.todayKey) {
        const log = world.routineLogs ? world.routineLogs.get(d.key) : null;
        if (!log || !log.routines) return;
        Object.values(log.routines).forEach(lr => {
          Object.entries(lr.items || {}).forEach(([pid, it]) => {
            if (pid !== '_' && !ids.has(pid)) return;
            items.push({ name: lr.name, emoji: lr.emoji, platformName: it.name, status: it.status });
          });
        });
        if (items.length) d.routines = { source: 'log', items, ...summarizeItems(items) };
      } else {
        world.routines.forEach(r => {
          evaluateRoutineDay(r, platforms, d.key, d.isToday ? world.todayKey : null, d.isToday ? (world.marksToday || {}) : {})
            .forEach(it => items.push({ name: r.name, emoji: r.emoji, platformName: it.platformName, status: d.isToday ? it.status : 'due' }));
        });
        if (items.length) {
          d.routines = d.isToday
            ? { source: 'live', items, ...summarizeItems(items) }
            : { source: 'future', items, total: items.length, success: 0, fail: 0, pending: items.length };
        }
      }
    });
  }

  days.forEach(d => {
    if (d.plan.rows.length) {
      d.plan.status = d.isFuture ? 'future'
        : (d.isToday && d.plan.realC < d.plan.plannedC ? 'today' : dayStatus(d.plan.plannedC, d.plan.realC, threshold));
    }
  });
  return days;
}

/** Resumo planejado × real do mês (até hoje) + série acumulada pro gráfico. */
export function summarizePlanVsReal(days, todayKey) {
  const s = { done: 0, partial: 0, miss: 0, plannedC: 0, realC: 0, overDays: 0, overC: 0, planDays: 0, labels: [], plannedCum: [], realCum: [] };
  let pc = 0;
  let rc = 0;
  [...days.values()].forEach(d => {
    s.labels.push(d.key.slice(8, 10));
    pc += d.plan.plannedC;
    s.plannedCum.push(pc / 100);
    if (d.key <= todayKey) {
      rc += d.plan.realC;
      s.realCum.push(rc / 100);
    } else {
      s.realCum.push(null);
    }
    if (!d.plan.rows.length || d.key > todayKey) return;
    if (d.key < todayKey || d.plan.status === 'done') {
      s.planDays++;
      if (d.plan.status === 'done') s.done++;
      else if (d.plan.status === 'partial') s.partial++;
      else if (d.plan.status === 'miss') s.miss++;
      s.plannedC += d.plan.plannedC;
      s.realC += d.plan.realC;
    }
    d.plan.rows.forEach(r => { if (r.overC > 0) { s.overDays++; s.overC += r.overC; } });
  });
  s.rate = s.planDays ? s.done / s.planDays : null;
  s.deviationC = s.realC - s.plannedC;
  return s;
}

/**
 * Métricas de resultado real no período [fromKey, toKey] (até hoje).
 * opts: { todayKey, world (pro planejado), betLimitReais, limitMonthKey }
 */
export function computeRealMetrics(platforms, fromKey, toKey, opts = {}) {
  const todayKey = opts.todayKey;
  const hi = todayKey && toKey > todayKey ? todayKey : toKey;
  const m = {
    fromKey, toKey: hi,
    sessions: 0, wins: 0, winC: 0, losses: 0, lossC: 0, even: 0,
    wageredC: 0, rbC: 0, depositC: 0, betDepositC: 0,
    plannedC: 0, realOnPlanC: 0, daysAbove: 0
  };
  if (!fromKey || !hi || fromKey > hi) return finish(m, opts);
  (platforms || []).forEach(p => {
    (p.betEntries || []).forEach(e => {
      const k = entryKey(e);
      if (!k || k < fromKey || k > hi) return;
      const rb = toC(e.resultBetting);
      m.sessions++;
      m.wageredC += toC(e.wagered);
      m.rbC += rb;
      if (rb > 0) { m.wins++; m.winC += rb; } else if (rb < 0) { m.losses++; m.lossC += -rb; } else m.even++;
    });
    (p.depositLog || []).forEach(e => {
      const k = entryKey(e);
      if (!k || k < fromKey || k > hi) return;
      m.depositC += toC(e.value);
    });
    if (opts.world) {
      for (let k = fromKey; k <= hi; k = addDaysKey(k, 1)) {
        const planned = plannedFor(k, p.id, opts.world);
        if (!(planned > 0)) continue;
        if (k === todayKey) continue; // hoje ainda em aberto
        const real = realWageredC(p, k);
        m.plannedC += planned;
        m.realOnPlanC += real;
        if (real > planned) m.daysAbove++;
      }
    }
  });
  // Contenção: 🎲 do mês de referência × limite.
  if (opts.limitMonthKey) {
    (platforms || []).forEach(p => (p.depositLog || []).forEach(e => {
      const k = entryKey(e);
      if (!k || monthKeyOf(k) !== opts.limitMonthKey || (todayKey && k > todayKey)) return;
      if (getDepositKindId(e) === 'aposta') m.betDepositC += toC(e.value);
    }));
  }
  return finish(m, opts);
}

function finish(m, opts) {
  const limitC = toC(opts.betLimitReais);
  return {
    ...m,
    lossMultiple: m.depositC > 0 ? m.lossC / m.depositC : null,
    turnover: m.depositC > 0 ? m.wageredC / m.depositC : null,
    overPlanPct: m.plannedC > 0 ? (m.realOnPlanC - m.plannedC) / m.plannedC : null,
    limitC,
    overLimitPct: limitC > 0 ? Math.max(0, m.betDepositC - limitC) / limitC : null,
    limitUse: limitC > 0 ? m.betDepositC / limitC : null
  };
}

/**
 * Aderência de UMA plataforma nos últimos N dias fechados (Planejador).
 */
export function computeAdherence(platform, world, lookback = 14) {
  const out = { days: [], done: 0, partial: 0, miss: 0, plannedC: 0, realC: 0 };
  if (!platform) return out;
  const threshold = world.thresholdPct || DEFAULT_PARTIAL_THRESHOLD;
  for (let i = lookback; i >= 1; i--) {
    const k = addDaysKey(world.todayKey, -i);
    const planned = plannedFor(k, platform.id, world);
    if (!(planned > 0)) continue;
    const real = realWageredC(platform, k);
    const status = dayStatus(planned, real, threshold);
    out.days.push({ key: k, plannedC: planned, realC: real, status });
    out[status]++;
    out.plannedC += planned;
    out.realC += real;
  }
  out.rate = out.days.length ? out.done / out.days.length : null;
  out.deviationC = out.realC - out.plannedC;
  return out;
}
