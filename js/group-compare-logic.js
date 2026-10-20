// === 🏆 GRUPOS — COMPARAÇÃO E COMPETIÇÃO (Sub-entrega 19) ===
// Função pura: sem DOM e sem Firestore. NUNCA grava nada — tudo aqui é
// derivado dos lançamentos que o sistema já tem, pela MESMA fonte do
// Financeiro/Saldo:
//   - depósitos (depositLog), saques (withdrawals), apostas (betEntries:
//     wagered e resultBetting) — dados reais, dia a dia;
//   - bônus do dia = fórmula (VIP/Obrigado/Misterioso) + 💎 bônus alto
//     (getExpectedBonusBreakdownForDate) + avulso EFETIVO
//     (getEffectiveOtherBonusForDay) + a diferença informada no fechamento
//     da semana (financeWeeks[].bonusAdjustment, no domingo da semana) —
//     o mesmo bônus que entra no Saldo;
//   - aderência = planejado (plano salvo/histórico planLog) × apostado,
//     mesmo critério do Calendário (calendar-logic.js dayStatus);
//   - Rollover restante = Rollover ao vivo de hoje das plataformas que
//     ainda participam (quem chama passa a função).
//   - (Sub-entrega 20) ⬇️ Abatimento = rollover abatido no período
//     (rolloverAdjustments: à mão, conferência de saldo, sessão ou lote).
//
// GRUPO = rotina que participa da competição (routineCompetes) ou grupo
// encerrado (groupArchive). Cada plataforma conta SÓ nos dias em que fazia
// parte do grupo (memberPeriods — routine-logic.js). Plataforma em 2+
// grupos conta em todos (marcada 🔁).
//
// Dinheiro em CENTAVOS inteiros. Dias futuros nunca entram.

import { toLocalDateString } from './finance-logic.js';
import { getExpectedBonusBreakdownForDate, getEffectiveOtherBonusForDay } from './bonus-ledger-logic.js';
import { plannedFor, realWageredC, dayStatus, DEFAULT_PARTIAL_THRESHOLD } from './calendar-logic.js';

export const RANK_METRICS = Object.freeze([
  { id: 'roi', label: 'Retorno %', kind: 'pct', better: 'high', hint: 'Lucro ÷ depositado — justo entre grupos de tamanhos diferentes.' },
  { id: 'lucro', label: 'Lucro R$', kind: 'money', better: 'high', hint: 'Resultado (R.B.) + bônus recebido.' },
  { id: 'bonus', label: 'Bônus', kind: 'money', better: 'high', hint: 'Bônus recebido no período (o mesmo que entra no Saldo).' },
  { id: 'apostado', label: 'Apostado', kind: 'money', better: 'high', hint: 'Total apostado no período.' },
  { id: 'aderencia', label: 'Aderência', kind: 'pct', better: 'high', hint: 'Dias do plano cumpridos (✅) ÷ dias com plano.' },
  { id: 'rollover', label: 'Rollover restante', kind: 'money', better: 'low', hint: 'Quanto ainda falta apostar hoje — menos é melhor.' },
  { id: 'abatimento', label: 'Abatimento', kind: 'money', better: 'high', hint: 'Rollover abatido no período (à mão, conferência de saldo ou em lote).' },
  // (Sub-entrega 38) aumento de rollover pela plataforma — menos é melhor.
  { id: 'aumento', label: 'Aumento', kind: 'money', better: 'low', hint: 'Rollover aumentado pela plataforma no período (conferência de saldo ou em lote) — menos é melhor.' }
]);

export const PERIODS = Object.freeze([
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'plan', label: 'Desde o plano' },
  { id: 'custom', label: 'Datas' }
]);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 732;

function toC(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

function entryKey(e) {
  if (!e || !e.date) return null;
  const d = new Date(e.date);
  return isNaN(d.getTime()) ? null : toLocalDateString(d);
}

export function isDayKey(k) {
  return typeof k === 'string' && DAY_RE.test(k) && toLocalDateString(keyToDate(k)) === k;
}

/** Segunda-feira da semana (seg–dom, como o Financeiro). */
export function weekMonday(key) {
  const back = (keyToDate(key).getDay() + 6) % 7;
  return addDaysKey(key, -back);
}

/**
 * Intervalo do filtro. 'plan' depende do grupo (início do plano dele) —
 * aqui devolve null e quem chama resolve por grupo (planStartFor).
 */
export function periodRange(id, todayKey, custom = {}) {
  if (id === 'week') return { fromKey: weekMonday(todayKey), toKey: todayKey };
  if (id === 'month') return { fromKey: `${todayKey.slice(0, 8)}01`, toKey: todayKey };
  if (id === 'custom') {
    const a = isDayKey(custom.fromKey) ? custom.fromKey : null;
    const b = isDayKey(custom.toKey) ? custom.toKey : null;
    if (!a || !b || a > b) return null;
    return { fromKey: a, toKey: b > todayKey ? todayKey : b };
  }
  return null;
}

/** Início do plano do grupo: o menor início dos planos salvos com este grupo. */
export function planStartFor(groupId, plans) {
  let first = null;
  (plans || []).forEach(p => {
    const g = p && p.params && p.params.group;
    if (!g || g.routineId !== groupId) return;
    const k = p.params.startKey;
    if (isDayKey(k) && (!first || k < first)) first = k;
  });
  return first;
}

// ---------- índice por plataforma (uma passada em cada lista) ----------

function buildIndex(platform) {
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
  const dep = new Map();
  const wd = new Map();
  const bet = new Map();
  const rb = new Map();
  const adj = new Map();
  const ab = new Map();
  const au = new Map(); // (38)
  (platform.rolloverIncreases || []).forEach(e => { const k = entryKey(e); if (k) add(au, k, toC(e.value)); });
  (platform.rolloverAdjustments || []).forEach(e => { const k = entryKey(e); if (k) add(ab, k, toC(e.value)); });
  (platform.depositLog || []).forEach(e => { const k = entryKey(e); if (k) add(dep, k, toC(e.value)); });
  (platform.withdrawals || []).forEach(e => { const k = entryKey(e); if (k) add(wd, k, toC(e.value)); });
  (platform.betEntries || []).forEach(e => {
    const k = entryKey(e);
    if (!k) return;
    add(bet, k, toC(e.wagered));
    add(rb, k, toC(e.resultBetting));
  });
  (platform.financeWeeks || []).forEach(w => {
    const a = Number(w && w.bonusAdjustment);
    if (!w || !isDayKey(w.weekEnd) || !Number.isFinite(a) || a === 0) return;
    add(adj, w.weekEnd, toC(a));
  });
  return { dep, wd, bet, rb, adj, ab, au };
}

/**
 * Métricas de UMA plataforma num dia (centavos). Usa cache por
 * plataforma×dia (a mesma plataforma pode estar em vários grupos).
 */
function dayMetrics(platform, key, ctx, idx) {
  const d = keyToDate(key);
  let bonusC = 0;
  try {
    const b = getExpectedBonusBreakdownForDate(platform, d, ctx);
    bonusC += toC(b.vipDaily) + toC(b.vipWeekly) + toC(b.vipMonthly) + toC(b.obrigado) + toC(b.misterioso) + toC(b.alto);
    bonusC += toC(getEffectiveOtherBonusForDay(platform, new Date(`${key}T12:00:00`), ctx).raw);
  } catch (err) {
    // Plataforma com dado inválido: o dia conta sem bônus (nunca derruba a tela).
  }
  bonusC += idx.adj.get(key) || 0;
  return {
    depositC: idx.dep.get(key) || 0,
    withdrawC: idx.wd.get(key) || 0,
    wageredC: idx.bet.get(key) || 0,
    rbC: idx.rb.get(key) || 0,
    bonusC,
    abatC: idx.ab.get(key) || 0,
    aumC: idx.au ? (idx.au.get(key) || 0) : 0
  };
}

function emptyTotals() {
  return { depositC: 0, withdrawC: 0, wageredC: 0, rbC: 0, bonusC: 0, abatC: 0, aumC: 0, planDays: 0, done: 0, partial: 0, miss: 0, plannedC: 0, realOnPlanC: 0 };
}

function finishTotals(t) {
  const lucroC = t.rbC + t.bonusC;
  return {
    ...t,
    lucroC,
    roi: t.depositC > 0 ? lucroC / t.depositC : null,
    aderencia: t.planDays > 0 ? t.done / t.planDays : null
  };
}

/**
 * Estatísticas de todos os grupos no período.
 *   groups    [{ id, name, emoji, color, periods, archived, action }]
 *   platforms todas as plataformas (state.platforms)
 *   range     { fromKey, toKey } | null (null + periodId 'plan' = por grupo)
 *   opts      { todayKey, periodId, resolveCtx(platform), plans (array dos
 *               planos salvos), getPlanLog(dayKey, pid), thresholdPct,
 *               rolloverOf(platform) -> centavos|null }
 * @returns Array<{ group, fromKey, toKey, noRange, totals, members[], series[], shared:Set }>
 */
export function computeGroupStats(groups, platforms, range, opts = {}) {
  const todayKey = opts.todayKey;
  const byId = new Map((platforms || []).map(p => [p.id, p]));
  const resolveCtx = typeof opts.resolveCtx === 'function' ? opts.resolveCtx : () => ({});
  const plansArr = Array.isArray(opts.plans) ? opts.plans : [];
  const world = {
    todayKey,
    getPlanLog: opts.getPlanLog || null,
    plans: new Map(plansArr.map(p => [p.platformId, p]))
  };
  const threshold = opts.thresholdPct || DEFAULT_PARTIAL_THRESHOLD;
  const idxCache = new Map();
  const ctxCache = new Map();
  const dayCache = new Map();
  const getIdx = p => { if (!idxCache.has(p.id)) idxCache.set(p.id, buildIndex(p)); return idxCache.get(p.id); };
  const getCtx = p => { if (!ctxCache.has(p.id)) ctxCache.set(p.id, resolveCtx(p) || {}); return ctxCache.get(p.id); };
  const getDay = (p, k) => {
    const ck = `${p.id}|${k}`;
    if (!dayCache.has(ck)) dayCache.set(ck, dayMetrics(p, k, getCtx(p), getIdx(p)));
    return dayCache.get(ck);
  };

  // 🔁 plataformas em 2+ grupos (participação atual ou passada).
  const count = new Map();
  (groups || []).forEach(g => {
    new Set((g.periods || []).map(x => x.platformId)).forEach(pid => count.set(pid, (count.get(pid) || 0) + 1));
  });
  const shared = new Set([...count.entries()].filter(([, n]) => n > 1).map(([pid]) => pid));

  return (groups || []).map(g => {
    let fromKey = range ? range.fromKey : null;
    let toKey = range ? range.toKey : null;
    if (!range && opts.periodId === 'plan') {
      fromKey = planStartFor(g.id, plansArr);
      toKey = todayKey;
    }
    const out = { group: g, fromKey, toKey, noRange: !fromKey || !toKey || fromKey > toKey, totals: finishTotals(emptyTotals()), members: [], series: [], shared };
    if (out.noRange) return out;
    if (toKey > todayKey) toKey = todayKey;
    out.toKey = toKey;
    const t = emptyTotals();
    const perP = new Map();
    let cum = 0;
    let k = fromKey;
    let guard = 0;
    while (k <= toKey && guard < MAX_DAYS) {
      let dayLucro = 0;
      (g.periods || []).forEach(x => {
        if (x.from > k || (x.to !== null && x.to < k)) return;
        const p = byId.get(x.platformId);
        if (!p) return;
        const m = getDay(p, k);
        if (!perP.has(p.id)) perP.set(p.id, { platformId: p.id, name: p.name, ...emptyTotals() });
        const pt = perP.get(p.id);
        ['depositC', 'withdrawC', 'wageredC', 'rbC', 'bonusC', 'abatC', 'aumC'].forEach(f => { t[f] += m[f] || 0; pt[f] += m[f] || 0; });
        dayLucro += m.rbC + m.bonusC;
        // Aderência: só dias fechados (hoje ainda em aberto).
        if (k < todayKey) {
          const planned = plannedFor(k, p.id, world);
          if (planned > 0) {
            const real = realWageredC(p, k);
            const st = dayStatus(planned, real, threshold);
            [t, pt].forEach(o => { o.planDays++; o[st]++; o.plannedC += planned; o.realOnPlanC += real; });
          }
        }
      });
      cum += dayLucro;
      out.series.push({ key: k, lucroC: cum });
      k = addDaysKey(k, 1);
      guard++;
    }
    out.totals = finishTotals(t);
    // Rollover restante: quem participa HOJE (grupo encerrado: não se aplica).
    if (!g.archived && typeof opts.rolloverOf === 'function') {
      let sum = 0;
      let known = 0;
      new Set((g.periods || []).filter(x => x.to === null).map(x => x.platformId)).forEach(pid => {
        const p = byId.get(pid);
        if (!p) return;
        const v = opts.rolloverOf(p);
        if (Number.isFinite(v)) { sum += v; known++; }
      });
      out.totals.rolloverC = known ? sum : null;
    } else {
      out.totals.rolloverC = null;
    }
    out.members = [...perP.values()].map(finishTotals)
      .sort((a, b) => (b.lucroC - a.lucroC) || String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
    return out;
  });
}

/** Valor da métrica (número comparável) — null = sem dado. */
export function metricValue(stat, metricId) {
  const t = stat && stat.totals;
  if (!t || stat.noRange) return null;
  switch (metricId) {
    case 'roi': return t.roi;
    case 'lucro': return t.lucroC;
    case 'bonus': return t.bonusC;
    case 'apostado': return t.wageredC;
    case 'aderencia': return t.aderencia;
    case 'rollover': return t.rolloverC;
    case 'abatimento': return t.abatC;
    case 'aumento': return t.aumC || 0;
    default: return null;
  }
}

/** Ranking: melhor primeiro; sem dado sempre no fim. Empate: pelo nome. */
export function rankGroups(stats, metricId) {
  const m = RANK_METRICS.find(x => x.id === metricId) || RANK_METRICS[0];
  const sign = m.better === 'low' ? 1 : -1;
  return (stats || []).slice().sort((a, b) => {
    const va = metricValue(a, m.id);
    const vb = metricValue(b, m.id);
    if (va === null && vb === null) return String(a.group.name).localeCompare(String(b.group.name), 'pt-BR', { numeric: true });
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va !== vb) return sign * (va - vb);
    return String(a.group.name).localeCompare(String(b.group.name), 'pt-BR', { numeric: true });
  });
}
