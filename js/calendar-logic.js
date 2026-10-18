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
//
// === (Sub-entrega 23) CONTÊINER DO DIA ===
// a) planDayFor: o dia planejado completo (valor, faixa, linhas de aposta,
//    valores permitidos) — o contêiner mostra o que apostar.
//    Hoje/futuro SEM o dia no plano salvo (plano recalculado a partir de
//    amanhã — Sub 24) => usa o histórico: o dia de hoje fica congelado lá.
// b) Itens de rotina levam platformId/action/amount/minimum.
// c) buildDayPlatforms: UMA lista por plataforma (plano = meta de aposta;
//    rotina de aposta vira só selo; rotina de aposta sem plano no dia =
//    "⚠️ Sem plano"). Pendências primeiro.
// d) suggestForRow: 👉 o que falta apostar, em giros da paleta do plano.
// f) (correção) O PLANO decide os dias de aposta (curva, Intercalar,
//    escala do grupo); a rotina de aposta só dá o calendário geral. Dia
//    DENTRO do período do plano salvo e sem aposta nele = 😴 folga do
//    plano (sem selo da rotina, sem pendência). Dia ANTES do início do plano
//    = a plataforma só aparece na data dela (a rotina de aposta some; sem
//    mais nada no dia, a plataforma sai da lista). "⚠️ Sem plano" só quando
//    a plataforma não tem plano salvo ou o plano já terminou.
// g) (25) 🙈 Dia IGNORADO no histórico: fora de todas as contas
//    (plannedFor devolve null — Calendário, Aderência e 🏆 Grupos leem por
//    ele). Fica em d.ignored só pra camada 📟 Encerrados mostrar.
// h) (27) Depósito ⏸ pausado / ⏭ adiado (ciclo encerrado): neutros —
//    não deixam a plataforma em "Pendentes" (routine-logic.js).
// i) (29) 🏁 Dia ENCERRADO (log.stop): a meta do dia vira o que foi
//    apostado até parar — o dia conta como cumprido em tudo (Calendário,
//    Aderência, 🏆 Grupos); a meta original fica em originalC. Linhas do
//    plano levam rbC (R.B. do dia) pro "resultado já obtido".
// e) computeRealMetrics devolve planRows: os dias × plataformas que formam
//    o planejado do "Real × plano".

import { toLocalDateString } from './finance-logic.js';
import { computeEmissionDates } from './cycle-logic.js';
import { getDepositKindId } from './deposit-kinds.js';
import {
  evaluateRoutineDay, summarizeItems, forbiddenBetDays
} from './routine-logic.js';
import { buildDayLines, normalizeStakes } from './plan-logic.js';

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

function cleanLines(list) {
  return (Array.isArray(list) ? list : []).filter(l => l && Number(l.stakeC) > 0).map(l => (l.kind === 'buy'
    ? { kind: 'buy', stakeC: Math.round(Number(l.stakeC)), multiplier: Math.round(Number(l.multiplier) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }
    : { kind: 'spin', stakeC: Math.round(Number(l.stakeC)), count: Math.round(Number(l.count) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }));
}

// Valores de aposta usados nas linhas (quando não há a paleta do plano).
export function stakesFromLines(lines) {
  return [...new Set(cleanLines(lines).map(l => l.stakeC))].sort((a, b) => a - b);
}

function cleanBuy(b) {
  return b && b.enabled && Number(b.multiplier) >= 2 ? { enabled: true, multiplier: Math.round(Number(b.multiplier)) } : null;
}

/**
 * (23) Dia planejado de (dia, plataforma) — null = sem plano no dia.
 * world: { todayKey, getPlanLog(dayKey, pid), plans: Map(pid → plano salvo) }
 *   passado     → histórico congelado (planLog); sem ele, o plano salvo;
 *   hoje/futuro → plano salvo; sem o dia no plano, o histórico (o plano foi
 *                 refeito a partir de amanhã e hoje ficou congelado).
 * @returns {{plannedC, targetC, tier, lines, stakesC, buy, source:'plan'|'log'} | null}
 */
export function planDayFor(dayKey, platformId, world) {
  const plan = world.plans ? world.plans.get(platformId) : null;
  const pday = plan && Array.isArray(plan.days) ? plan.days.find(d => d && d.key === dayKey) : null;
  const log = world.getPlanLog ? world.getPlanLog(dayKey, platformId) : null;
  const fromPlan = () => {
    const params = plan.params || {};
    const lines = cleanLines(pday.lines);
    const stakesC = normalizeStakes(params.stakes);
    return {
      plannedC: Math.round(Number(pday.plannedC) || 0),
      targetC: Math.round(Number(pday.targetC) || 0),
      tier: String(pday.tier || ''),
      lines,
      stakesC: stakesC.length ? stakesC : stakesFromLines(lines),
      buy: cleanBuy(params.buy),
      source: 'plan'
    };
  };
  const fromLog = () => {
    const lines = cleanLines(log.lines);
    const stakesC = Array.isArray(log.stakes) ? normalizeStakes(log.stakes) : [];
    return {
      plannedC: Math.round(Number(log.plannedC) || 0),
      targetC: Math.round(Number(log.targetC) || 0),
      tier: String(log.tier || ''),
      lines,
      stakesC: stakesC.length ? stakesC : stakesFromLines(lines),
      buy: cleanBuy(log.buy),
      source: 'log',
      ignored: log.ignored === true, // (25)
      ...stopInfo(log) // (29)
    };
  };
  if (dayKey < world.todayKey) {
    if (log) return fromLog();
    return pday ? fromPlan() : null;
  }
  // (29b) hoje 🏁 encerrado vale mesmo com o plano ainda tendo hoje
  if (pday) return log && log.stop ? fromLog() : fromPlan();
  return log ? fromLog() : null;
}

// (29) 🏁 Dia encerrado: meta efetiva = o apostado até parar.
function stopInfo(log) {
  const st = log && log.stop && typeof log.stop === 'object' ? log.stop : null;
  if (!st) return {};
  const original = Math.round(Number(log.plannedC) || 0);
  const upto = Math.max(0, Math.round(Number(st.wageredC) || 0));
  return {
    stopped: true,
    stop: { at: String(st.at || ''), reason: String(st.reason || 'outro'), rbC: Math.round(Number(st.rbC) || 0), wageredC: upto },
    originalC: original,
    plannedC: Math.min(original, upto)
  };
}

/** R.B. (resultado) lançado no dia, em centavos. */
export function realRBC(platform, dayKey) {
  return (platform.betEntries || []).reduce((s2, e) => (entryKey(e) === dayKey ? s2 + toC(e.resultBetting) : s2), 0);
}

/** Planejado de (dia, plataforma), em centavos (null = sem plano no dia ou 🙈 ignorado). */
export function plannedFor(dayKey, platformId, world) {
  const d = planDayFor(dayKey, platformId, world);
  return d && !d.ignored ? d.plannedC : null;
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
      // (Sub-entrega 13) inclui 💎 alto.
      deposits: { semanal: 0, mensal: 0, aposta: 0, alto: 0, none: 0, totalC: 0, rows: [] },
      emissions: [],
      routines: null,
      forbidden: [],
      ignored: [] // (25) 🙈 dias ignorados (só pra 📟 Encerrados)
    });
  }
  const ids = new Set(platforms.map(p => p.id));
  // (23f) Período de cada plano salvo — um Map só, compartilhado pelos dias.
  const planRanges = new Map();
  platforms.forEach(p => {
    const r = planRangeOf(world.plans ? world.plans.get(p.id) : null);
    if (r) planRanges.set(p.id, r);
  });
  days.forEach(d => { d.planRanges = planRanges; });

  platforms.forEach(p => {
    // Planejado × real
    days.forEach(d => {
      const pd0 = planDayFor(d.key, p.id, world);
      const realC = d.isFuture ? 0 : realWageredC(p, d.key);
      // (25) 🙈 ignorado: fora das contas; o real do dia vira "fora do plano".
      if (pd0 && pd0.ignored) {
        d.ignored.push({ platformId: p.id, name: String(p.name || ''), plannedC: pd0.plannedC, realC });
        if (realC > 0) d.offPlan.push({ platformId: p.id, name: String(p.name || ''), realC });
        return;
      }
      const pd = pd0;
      const plannedC = pd ? pd.plannedC : null;
      if (plannedC !== null && plannedC > 0) {
        const status = d.isFuture ? 'future' : (d.isToday && realC < plannedC ? 'today' : dayStatus(plannedC, realC, threshold));
        d.plan.plannedC += plannedC;
        d.plan.realC += realC;
        // (23) faixa, linhas e valores permitidos — o contêiner do dia sugere a aposta.
        d.plan.rows.push({
          platformId: p.id, name: String(p.name || ''), plannedC, realC, status, overC: Math.max(0, realC - plannedC),
          tier: pd.tier, lines: pd.lines, stakesC: pd.stakesC, buy: pd.buy, source: pd.source,
          rbC: d.isFuture ? 0 : realRBC(p, d.key), // (29) resultado já obtido
          ...(pd.stopped ? { stopped: true, stop: pd.stop, originalC: pd.originalC } : {})
        });
      } else if (pd && pd.stopped && !d.isFuture) {
        // (29b) 🏁 encerrado sem ter apostado nada: conta como cumprido (R$ 0 de R$ 0)
        d.plan.realC += realC;
        d.plan.rows.push({
          platformId: p.id, name: String(p.name || ''), plannedC: 0, realC, status: 'done', overC: realC,
          tier: pd.tier, lines: pd.lines, stakesC: pd.stakesC, buy: pd.buy, source: pd.source,
          rbC: realRBC(p, d.key), stopped: true, stop: pd.stop, originalC: pd.originalC
        });
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
      d.deposits[kind] = (d.deposits[kind] || 0) + c;
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
        Object.entries(log.routines).forEach(([rid, lr]) => {
          Object.entries((lr && lr.items) || {}).forEach(([pid, it]) => {
            if (pid !== '_' && !ids.has(pid)) return;
            items.push({ routineId: rid, name: lr.name, emoji: lr.emoji, action: lr.action || null, platformId: pid, platformName: it.name, status: it.status });
          });
        });
        if (items.length) d.routines = { source: 'log', items, ...summarizeItems(items) };
      } else {
        world.routines.forEach(r => {
          evaluateRoutineDay(r, platforms, d.key, d.isToday ? world.todayKey : null, d.isToday ? (world.marksToday || {}) : {}, d.isToday && world.marksFor ? { marksFor: world.marksFor } : {})
            .forEach(it => items.push({
              routineId: r.id, name: r.name, emoji: r.emoji, action: r.action || null,
              platformId: it.platformId, platformName: it.platformName,
              status: d.isToday ? it.status : 'due',
              amount: d.isToday ? it.amount : null, minimum: it.minimum,
              choice: d.isToday ? (it.choice || null) : null, // (27) depósito pausado: escolha do dia
              deferredFrom: it.deferredFrom || null
            }));
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
        : (!(d.plan.plannedC > 0) && d.plan.rows.every(r => r.stopped) ? 'done' // (29b) só 🏁 com R$ 0
          : (d.isToday && d.plan.realC < d.plan.plannedC ? 'today' : dayStatus(d.plan.plannedC, d.plan.realC, threshold)));
    }
  });
  return days;
}

// ============================================================
// (Sub-entrega 23) CONTÊINER DO DIA — uma lista por plataforma
// ============================================================

const PROBLEM_RT = new Set(['missed', 'broken']);

// (23f) Período do plano salvo: { startKey, endKey } ou null.
export function planRangeOf(plan) {
  if (!plan) return null;
  const params = plan.params || {};
  const days = Array.isArray(plan.days) ? plan.days.filter(x => x && typeof x.key === 'string').map(x => x.key).sort() : [];
  const startKey = typeof params.startKey === 'string' && params.startKey ? params.startKey : days[0];
  const endKey = typeof params.endKey === 'string' && params.endKey ? params.endKey : days[days.length - 1];
  return startKey && endKey ? { startKey, endKey } : null;
}

/**
 * Junta tudo do dia por plataforma. Plano = meta de aposta do dia; rotina
 * de APOSTA vira só selo (betRoutines); rotina de aposta que vale no dia
 * sem plano = noPlan ("⚠️ Sem plano"). "Não apostar" entra como forbidden
 * (uma vez só). attention = pendente (hoje) / com problema (passado) /
 * sem plano (hoje e futuro) — vem primeiro.
 * @returns {Array<{platformId, name, plan, offPlanC, deposits, depositC,
 *   betRoutines, routines, emission, forbidden, noPlan, attention}>}
 */
// opts.showIgnored (25): inclui os dias 🙈 ignorados (camada 📟 ligada).
export function buildDayPlatforms(d, opts = {}) {
  const map = new Map();
  const get = (pid, name) => {
    const id = pid || '_';
    if (!map.has(id)) {
      map.set(id, {
        platformId: id, name: id === '_' ? 'Geral' : String(name || ''),
        plan: null, offPlanC: 0, deposits: [], depositC: 0,
        betRoutines: [], routines: [], emission: false, forbidden: null, noPlan: false, attention: false, ignored: null
      });
    }
    const row = map.get(id);
    if (!row.name && name) row.name = String(name);
    return row;
  };
  d.plan.rows.forEach(r => { get(r.platformId, r.name).plan = r; });
  d.offPlan.forEach(r => { get(r.platformId, r.name).offPlanC += r.realC; });
  if (opts.showIgnored) (d.ignored || []).forEach(r => { get(r.platformId, r.name).ignored = r; });
  d.deposits.rows.forEach(r => { const x = get(r.platformId, r.name); x.deposits.push(r); x.depositC += r.valueC; });
  d.emissions.forEach(e => { get(e.platformId, e.name).emission = true; });
  d.forbidden.forEach(f => { get(f.platformId, f.name).forbidden = { broken: !!f.broken }; });
  if (d.routines) {
    d.routines.items.forEach(it => {
      const x = get(it.platformId, it.platformName);
      if (it.action === 'no-bet') {
        if (!x.forbidden) x.forbidden = { broken: it.status === 'broken' };
        else if (it.status === 'broken') x.forbidden.broken = true;
        return;
      }
      if (it.action === 'bet') x.betRoutines.push(it);
      else x.routines.push(it);
    });
  }
  const out = [...map.values()];
  out.forEach(x => {
    // (23f) O plano manda na aposta: dia dentro do período do plano e sem
    // aposta nele = folga do plano (a rotina de aposta não cobra nada).
    const range = d.planRanges ? d.planRanges.get(x.platformId) || null : null;
    const covered = !!range && range.startKey <= d.key && d.key <= range.endKey;
    x.planRange = range;
    const upcoming = !!range && d.key < range.startKey; // plano começa depois
    x.restDay = !x.plan && covered && x.betRoutines.length > 0;
    if (x.restDay || (upcoming && !x.plan)) x.betRoutines = [];
    x.noPlan = !x.plan && !covered && !upcoming && x.betRoutines.length > 0 && x.platformId !== '_';
    x.noPlanReason = !x.noPlan ? null : (!range ? 'none' : 'ended');
    // Com plano no dia, a meta é a do plano (a rotina de aposta só vira selo).
    const betCounts = x.noPlan;
    const rts = betCounts ? [...x.betRoutines, ...x.routines] : x.routines;
    if (d.isFuture) {
      x.attention = x.noPlan;
    } else if (d.isToday) {
      x.attention = (!!x.plan && x.plan.status === 'today')
        || rts.some(it => it.status === 'pending' || PROBLEM_RT.has(it.status))
        || (!!x.forbidden && x.forbidden.broken);
    } else {
      x.attention = (!!x.plan && (x.plan.status === 'miss' || x.plan.status === 'partial'))
        || x.routines.some(it => PROBLEM_RT.has(it.status))
        || (!!x.forbidden && x.forbidden.broken);
    }
  });
  // Sem nada no dia (ex.: só a rotina de aposta de um plano que ainda não começou): fora da lista.
  const hasSomething = x => !!x.plan || x.offPlanC > 0 || x.deposits.length > 0 || x.betRoutines.length > 0
    || x.routines.length > 0 || x.emission || !!x.forbidden || x.restDay || !!x.ignored;
  return out.filter(hasSomething).sort((a, b) => {
    if (a.attention !== b.attention) return a.attention ? -1 : 1;
    if ((a.platformId === '_') !== (b.platformId === '_')) return a.platformId === '_' ? 1 : -1;
    return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
  });
}

/**
 * 👉 O que falta apostar no dia (linha do plano). null = nada falta.
 * Nada apostado ainda = as linhas do próprio plano; já começou = o que
 * falta, em giros dos valores permitidos do plano (sem compra de bônus).
 * @returns {{ leftC, lines, exact } | null}
 */
export function suggestForRow(row) {
  if (!row || !(row.plannedC > 0)) return null;
  const leftC = row.plannedC - (Number(row.realC) || 0);
  if (leftC <= 0) return null;
  const lines = Array.isArray(row.lines) ? row.lines : [];
  if (!(row.realC > 0) && lines.length) return { leftC, lines, exact: true };
  const stakesC = Array.isArray(row.stakesC) && row.stakesC.length ? row.stakesC : stakesFromLines(lines);
  if (!stakesC.length) return { leftC, lines: [], exact: false };
  const tier = ['baixo', 'medio', 'alto'].includes(row.tier) ? row.tier : 'medio';
  return { leftC, lines: buildDayLines(leftC, tier, stakesC, null).lines, exact: false };
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
    plannedC: 0, realOnPlanC: 0, daysAbove: 0,
    planRows: [] // (23) dias × plataformas que formam o planejado
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
        m.planRows.push({ key: k, platformId: p.id, name: String(p.name || ''), plannedC: planned, realC: real, fromLog: !!(opts.world.getPlanLog && opts.world.getPlanLog(k, p.id)) });
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
  m.planRows.sort((a, b) => a.key.localeCompare(b.key) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
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
