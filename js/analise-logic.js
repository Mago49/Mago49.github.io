// === LÓGICA DA ABA "ANÁLISES" (View Gráficos — Sub-entrega 1) ===
// Função pura: sem DOM e sem Firestore. Mesmo espírito de isolamento de
// analytics-logic.js / finance-logic.js.
//
// REGRA DE OURO: nenhuma fórmula de negócio nova mora aqui. Tudo que é
// Saldo/Rollover/Bônus/totais por período vem de funções que JÁ existem:
//   - computeOverallTotalsPeriod (finance-logic.js): totais por período,
//     já tratando semana fechada coberta (valor congelado, bônus real),
//     semana cortada (estimada) e backfill cortado (excluído);
//   - computeRolloverLive (finance-logic.js): Rollover ao vivo da fase;
//   - getExpectedBonusBreakdownForDate (bonus-ledger-logic.js): fórmula
//     de bônus de um dia, separada por tipo.
// analytics-logic.js NÃO é tocado nem importado por este arquivo.
//
// FILTRO DE PERÍODO: só as análises que dependem de um intervalo de datas
// recebem from/to (Caixa acumulado, Mês a mês, RTP observado). Previsão
// do Rollover (estado atual) e Bônus previsto (projeção futura) nunca
// recebem período — de propósito.
//
// CACHE: computeOverallTotalsPeriod também calcula Saldo/Rollover ao vivo
// de cada plataforma (simulação sequencial) — é a função mais cara do
// sistema. createAnaliseCache() devolve um Map descartável, criado UMA vez
// por renderização da aba, que evita repetir a mesma chamada (mesmas
// plataformas + mesmo período) dentro dessa renderização. Nunca é
// reaproveitado entre renderizações (os dados podem ter mudado).
//
// FORMATO DE DATA: from/to são sempre strings 'AAAA-MM-DD' (dia LOCAL),
// mesma convenção de computeOverallTotalsPeriod. from = null = "desde o
// primeiro registro".
//
// === (Sub-entrega 3) SALDO E ROLLOVER DIÁRIOS ===
// buildDailyBalanceSeries monta a série a partir dos documentos de
// dailySnapshots JÁ LIDOS (a leitura mora em daily-snapshot-store.js — este
// arquivo continua sem Firestore). Dia sem retrato = lacuna (null), nunca
// valor estimado/interpolado. Valor não numérico = lacuna, nunca 0.

import {
  toLocalDateString, getWeekStart, getWeekEnd, roundMoney,
  computeOverallTotalsPeriod, computeRolloverLive
} from './finance-logic.js';
import { getExpectedBonusBreakdownForDate } from './bonus-ledger-logic.js';

// Apostado mínimo no período pra uma plataforma entrar no ranking de RTP —
// abaixo disso, 1 ou 2 giros distorcem o percentual e o ranking vira ruído.
export const RTP_MIN_WAGERED = 100;

// Janela (em dias, contando hoje) usada pra medir o ritmo de apostas na
// Previsão de liberação do Rollover.
export const ROLLOVER_PACE_DAYS = 14;

// Mês a mês: no máximo os 24 meses mais recentes do período.
export const MONTHLY_MAX_MONTHS = 24;

// Caixa acumulado: acima disso, os pontos passam a ser semanais (segunda-
// feira) em vez de diários, pra o gráfico continuar legível no celular.
export const CASHFLOW_MAX_DAILY_POINTS = 400;

const r2 = roundMoney;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_LOOP_GUARD = 5000; // ~13 anos de dias — trava contra laço infinito

function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

function isValidDateKey(key) {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false;
  const d = dayKeyToDate(key);
  return !isNaN(d.getTime()) && toLocalDateString(d) === key;
}

function entryDayKey(e) {
  if (!e || !e.date) return null;
  const d = new Date(e.date);
  if (isNaN(d.getTime())) return null;
  return toLocalDateString(d);
}

function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}

function monthStartKey(monthKey) {
  return `${monthKey}-01`;
}

function monthEndKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return toLocalDateString(new Date(y, m, 0)); // dia 0 do mês seguinte = último dia deste
}

function nextMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Dia do primeiro registro de QUALQUER plataforma (logs brutos + semanas
// fechadas). null = nenhuma plataforma tem registro nenhum.
export function earliestActivityKey(platforms) {
  let earliest = null;
  const consider = (key) => { if (key && (earliest === null || key < earliest)) earliest = key; };
  (platforms || []).forEach(p => {
    ['depositLog', 'withdrawals', 'betEntries', 'otherBonusLog'].forEach(field => {
      (p[field] || []).forEach(e => consider(entryDayKey(e)));
    });
    (p.financeWeeks || []).forEach(w => { if (isValidDateKey(w.weekStart)) consider(w.weekStart); });
  });
  return earliest;
}

// ---------- PERÍODO ----------

// Converte um preset em { ok, from, to }. 'to' nunca passa de hoje.
//   '30d' | '90d'     — últimos N dias, contando hoje
//   'mes'             — dia 1 do mês atual até hoje
//   'mes-anterior'    — mês anterior inteiro
//   'tudo'            — from = null (desde o primeiro registro) até hoje
//   'custom'          — custom.from / custom.to ('AAAA-MM-DD'), validados
export function resolvePeriodPreset(preset, refDate = new Date(), custom = {}) {
  const todayKey = toLocalDateString(refDate);
  const y = refDate.getFullYear();
  const m = refDate.getMonth();

  switch (preset) {
    case '30d':
      return { ok: true, from: addDaysKey(todayKey, -29), to: todayKey };
    case '90d':
      return { ok: true, from: addDaysKey(todayKey, -89), to: todayKey };
    case 'mes':
      return { ok: true, from: toLocalDateString(new Date(y, m, 1)), to: todayKey };
    case 'mes-anterior':
      return {
        ok: true,
        from: toLocalDateString(new Date(y, m - 1, 1)),
        to: toLocalDateString(new Date(y, m, 0))
      };
    case 'tudo':
      return { ok: true, from: null, to: todayKey };
    case 'custom': {
      const from = custom && custom.from;
      const to = custom && custom.to;
      if (!isValidDateKey(from) || !isValidDateKey(to)) {
        return { ok: false, error: 'Informe as duas datas do período.' };
      }
      if (from > to) {
        return { ok: false, error: 'A data inicial é depois da data final.' };
      }
      if (from > todayKey) {
        return { ok: false, error: 'O período começa no futuro.' };
      }
      return { ok: true, from, to: to > todayKey ? todayKey : to };
    }
    default:
      return { ok: false, error: 'Período inválido.' };
  }
}

// ---------- CACHE (por renderização) ----------

export function createAnaliseCache() {
  return new Map();
}

function periodTotals(cache, cacheKey, platforms, from, to, resolveCtx, refDate) {
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey);
  const res = computeOverallTotalsPeriod(platforms, from, to, resolveCtx, refDate, null, 'total');
  if (cache) cache.set(cacheKey, res);
  return res;
}

// ---------- 1) CAIXA ACUMULADO (Saques − Depósitos) — com período ----------
// Fonte: depositLog + withdrawals (logs PERMANENTES). Semanas de backfill
// já criam eventos espelho nesses dois logs (addHistoricalWeek), então
// entram sem nenhum tratamento especial. Acumulado começa em 0 no início
// do período.
export function computeCashFlowSeries(platforms, from = null, to = null) {
  const empty = { granularity: 'day', points: [], deposit: 0, withdrawal: 0, result: 0, from: null, to: null };
  const lo = from || earliestActivityKey(platforms);
  const hi = to;
  if (!lo || !hi || lo > hi) return empty;

  const byDay = new Map(); // dayKey -> { deposit, withdrawal }
  const add = (key, field, value) => {
    if (!key || key < lo || key > hi) return;
    if (!byDay.has(key)) byDay.set(key, { deposit: 0, withdrawal: 0 });
    byDay.get(key)[field] += Number(value) || 0;
  };

  (platforms || []).forEach(p => {
    (p.depositLog || []).forEach(e => add(entryDayKey(e), 'deposit', e.value));
    (p.withdrawals || []).forEach(e => add(entryDayKey(e), 'withdrawal', e.value));
  });

  const dayKeys = [];
  let cursor = lo;
  let guard = 0;
  while (cursor <= hi && guard < DAY_LOOP_GUARD) {
    dayKeys.push(cursor);
    cursor = addDaysKey(cursor, 1);
    guard++;
  }

  const granularity = dayKeys.length > CASHFLOW_MAX_DAILY_POINTS ? 'week' : 'day';
  const buckets = new Map(); // bucketKey -> { deposit, withdrawal }
  dayKeys.forEach(key => {
    const bucketKey = granularity === 'week' ? toLocalDateString(getWeekStart(dayKeyToDate(key))) : key;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { deposit: 0, withdrawal: 0 });
    const day = byDay.get(key);
    if (day) {
      buckets.get(bucketKey).deposit += day.deposit;
      buckets.get(bucketKey).withdrawal += day.withdrawal;
    }
  });

  let cumulative = 0;
  let totalDeposit = 0;
  let totalWithdrawal = 0;
  const points = [...buckets.entries()].map(([key, v]) => {
    const net = v.withdrawal - v.deposit;
    cumulative += net;
    totalDeposit += v.deposit;
    totalWithdrawal += v.withdrawal;
    return { key, deposit: r2(v.deposit), withdrawal: r2(v.withdrawal), net: r2(net), cumulative: r2(cumulative) };
  });

  return {
    granularity,
    points,
    deposit: r2(totalDeposit),
    withdrawal: r2(totalWithdrawal),
    result: r2(totalWithdrawal - totalDeposit),
    from: lo,
    to: hi
  };
}

// ---------- 2) COMPARATIVO MÊS A MÊS — com período ----------
// Cada mês = computeOverallTotalsPeriod no recorte (mês ∩ período). Semana
// fechada que atravessa a virada do mês é somada dia a dia (bônus pela
// fórmula + avulso, não o bônus real) — computeOverallTotalsPeriod já
// sinaliza isso em estimatedWeeks, que é repassado pra tela.
export function computeMonthlyComparison(platforms, from = null, to = null, resolveCtx = () => ({}), refDate = new Date(), cache = null) {
  const result = { months: [], truncated: false, estimatedCount: 0, excludedCount: 0 };
  const lo = from || earliestActivityKey(platforms);
  const hi = to;
  if (!lo || !hi || lo > hi) return result;

  let monthKeys = [];
  let mk = monthKeyOf(lo);
  const lastMk = monthKeyOf(hi);
  let guard = 0;
  while (mk <= lastMk && guard < 600) {
    monthKeys.push(mk);
    mk = nextMonthKey(mk);
    guard++;
  }
  if (monthKeys.length > MONTHLY_MAX_MONTHS) {
    monthKeys = monthKeys.slice(-MONTHLY_MAX_MONTHS);
    result.truncated = true;
  }

  monthKeys.forEach(monthKey => {
    const mStart = monthStartKey(monthKey);
    const mEnd = monthEndKey(monthKey);
    const mFrom = mStart > lo ? mStart : lo;
    const mTo = mEnd < hi ? mEnd : hi;
    if (mFrom > mTo) return;

    const res = periodTotals(cache, `ALL|${mFrom}|${mTo}`, platforms, mFrom, mTo, resolveCtx, refDate);
    result.estimatedCount += res.estimatedWeeks.length;
    result.excludedCount += res.excludedBackfill.length;

    result.months.push({
      month: monthKey,
      from: mFrom,
      to: mTo,
      partial: mFrom !== mStart || mTo !== mEnd,
      deposit: res.totals.deposit,
      withdrawal: res.totals.withdrawal,
      bonus: res.totals.bonus,
      resultBetting: res.totals.resultBetting
    });
  });

  return result;
}

// ---------- 3) RTP OBSERVADO POR PLATAFORMA — com período ----------
// RTP observado = (Apostado + R.B.) ÷ Apostado — quanto voltou de cada
// R$ 1,00 apostado no período. Totais por plataforma vêm de
// computeOverallTotalsPeriod([p], ...), a mesma fonte do Painel Geral.
// Só entram no ranking plataformas com Apostado ≥ minWagered; o RTP
// geral (overall) soma TODAS as plataformas, inclusive as que ficaram
// fora do ranking.
export function computeObservedRtp(platforms, from = null, to = null, resolveCtx = () => ({}), refDate = new Date(), cache = null, minWagered = RTP_MIN_WAGERED) {
  const rows = [];
  let wageredAll = 0;
  let resultAll = 0;
  let belowMinimum = 0;
  let estimatedCount = 0;
  let excludedCount = 0;

  (platforms || []).forEach(p => {
    const res = periodTotals(cache, `${p.id}|${from}|${to}`, [p], from, to, resolveCtx, refDate);
    const wagered = Number(res.totals.wagered) || 0;
    const resultBetting = Number(res.totals.resultBetting) || 0;
    wageredAll += wagered;
    resultAll += resultBetting;
    estimatedCount += res.estimatedWeeks.length;
    excludedCount += res.excludedBackfill.length;

    if (wagered <= 0) return;
    if (wagered < minWagered) { belowMinimum++; return; }

    rows.push({
      id: p.id,
      name: p.name,
      wagered: r2(wagered),
      resultBetting: r2(resultBetting),
      rtp: (wagered + resultBetting) / wagered
    });
  });

  rows.sort((a, b) => b.rtp - a.rtp);

  return {
    rows,
    overall: {
      wagered: r2(wageredAll),
      resultBetting: r2(resultAll),
      rtp: wageredAll > 0 ? (wageredAll + resultAll) / wageredAll : null
    },
    belowMinimum,
    minWagered,
    estimatedCount,
    excludedCount
  };
}

// ---------- 4) PREVISÃO DE LIBERAÇÃO DO ROLLOVER — SEM período ----------
// Rollover = computeRolloverLive (valor ao vivo da fase atual, mesmo do
// Financeiro). Ritmo = apostado nos últimos `paceDays` dias (contando hoje)
// ÷ paceDays. Dias estimados = Rollover ÷ ritmo, arredondado pra cima.
// Sem apostas na janela, `days` = null (nunca divide por zero).
export function computeRolloverForecast(platforms, resolveCtx = () => ({}), refDate = new Date(), paceDays = ROLLOVER_PACE_DAYS) {
  const windowStart = new Date(refDate);
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (paceDays - 1));
  const windowEnd = new Date(refDate);

  const rows = [];
  let totalRollover = 0;

  (platforms || []).forEach(p => {
    const rollover = computeRolloverLive(p, refDate, resolveCtx(p));
    if (!(rollover > 0)) return;

    const wageredInWindow = (p.betEntries || []).reduce((sum, e) => {
      if (!e || !e.date) return sum;
      const d = new Date(e.date);
      if (isNaN(d.getTime()) || d < windowStart || d > windowEnd) return sum;
      return sum + (Number(e.wagered) || 0);
    }, 0);

    const dailyPace = wageredInWindow / paceDays;
    totalRollover += rollover;
    rows.push({
      id: p.id,
      name: p.name,
      rollover: r2(rollover),
      dailyPace: r2(dailyPace),
      days: dailyPace > 0 ? Math.ceil(rollover / dailyPace) : null
    });
  });

  rows.sort((a, b) => b.rollover - a.rollover);
  return { rows, totalRollover: r2(totalRollover), paceDays };
}

// ---------- 5) BÔNUS PREVISTO — SEM período ----------
// Soma a fórmula de cada dia de AMANHÃ até domingo e de AMANHÃ até o fim
// do mês. Começa amanhã porque HOJE já está dentro do acumulado ao vivo
// (computeAutoAccruedBonusForWeek soma de segunda até hoje) — nunca conta
// o mesmo dia duas vezes. É PROJEÇÃO: o diário do grupo COM só entra em
// dia com aposta registrada, então dias futuros nunca o incluem.
export function computeUpcomingBonus(platforms, resolveCtx = () => ({}), refDate = new Date()) {
  const tomorrow = new Date(refDate);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekEnd = getWeekEnd(getWeekStart(refDate));
  const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const lastDay = weekEnd > monthEnd ? weekEnd : monthEnd;

  const rows = [];
  const totals = { week: 0, month: 0 };
  const monthByType = { vip: 0, obrigado: 0, misterioso: 0 };

  (platforms || []).forEach(p => {
    const ctx = resolveCtx(p) || {};
    let week = 0;
    let month = 0;

    const cursor = new Date(tomorrow);
    let guard = 0;
    while (cursor <= lastDay && guard < 60) {
      const b = getExpectedBonusBreakdownForDate(p, cursor, ctx);
      const vip = (b.vipDaily || 0) + (b.vipWeekly || 0) + (b.vipMonthly || 0);
      const dayTotal = vip + (b.obrigado || 0) + (b.misterioso || 0);

      if (cursor <= weekEnd) week += dayTotal;
      if (cursor <= monthEnd) {
        month += dayTotal;
        monthByType.vip += vip;
        monthByType.obrigado += b.obrigado || 0;
        monthByType.misterioso += b.misterioso || 0;
      }
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }

    totals.week += week;
    totals.month += month;
    if (week > 0 || month > 0) {
      rows.push({ id: p.id, name: p.name, week: r2(week), month: r2(month) });
    }
  });

  rows.sort((a, b) => b.month - a.month || b.week - a.week);

  return {
    rows,
    totals: { week: r2(totals.week), month: r2(totals.month) },
    monthByType: {
      vip: r2(monthByType.vip),
      obrigado: r2(monthByType.obrigado),
      misterioso: r2(monthByType.misterioso)
    },
    fromKey: toLocalDateString(tomorrow),
    weekEndKey: toLocalDateString(weekEnd),
    monthEndKey: toLocalDateString(monthEnd)
  };
}

// ============================================================
// 6) SALDO E ROLLOVER DIÁRIOS (dailySnapshots) — com período
// ============================================================

// Máximo de dias lidos/mostrados — mesmo teto da leitura
// (DAILY_SNAPSHOT_READ_MAX em daily-snapshot-store.js).
export const DAILY_SNAPSHOT_MAX_DAYS = 400;

// Valor do seletor "Todas as plataformas".
export const ALL_PLATFORMS = '__all__';

// Limita o período aos últimos DAILY_SNAPSHOT_MAX_DAYS dias até `to`.
// from = null ("Tudo") também vira essa janela. clamped = houve corte.
export function clampDailyRange(from, to) {
  const minFrom = addDaysKey(to, -(DAILY_SNAPSHOT_MAX_DAYS - 1));
  if (!from || from < minFrom) return { from: minFrom, to, clamped: true };
  return { from, to, clamped: false };
}

function finiteOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function isPlainMap(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Opções do seletor: plataformas atuais (nome atual) + plataformas que só
// existem nos retratos (excluídas depois — nome do retrato mais recente).
export function listSnapshotPlatforms(docs, currentPlatforms = []) {
  const map = new Map();
  (currentPlatforms || []).forEach(p => {
    if (p && p.id) map.set(p.id, { id: p.id, name: String(p.name || p.id), current: true });
  });
  (docs || []).forEach(d => {
    if (!d || !isPlainMap(d.platforms)) return;
    Object.entries(d.platforms).forEach(([id, v]) => {
      const existing = map.get(id);
      if (existing && existing.current) return;
      const name = v && typeof v.name === 'string' && v.name ? v.name : id;
      map.set(id, { id, name, current: false });
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

// docs: [{ day:'AAAA-MM-DD', platforms:{ [id]: { balance, rollover, ... } } }]
// (saída de loadDailySnapshotsRange). Um ponto por dia de from a to.
// live (opcional): { dayKey, platforms:{ [id]: { balance, rollover } } } —
// SUBSTITUI o retrato daquele dia (usado pro dia de hoje, valor ao vivo).
// platformId = ALL_PLATFORMS soma todas; senão, só aquela plataforma.
// Na soma, plataforma com valor não numérico fica fora e o dia é marcado
// `partial` (nunca entra como 0).
export function buildDailyBalanceSeries(docs, from, to, platformId = ALL_PLATFORMS, live = null) {
  const result = { points: [], daysWithData: 0, totalDays: 0, partialDays: 0, liveUsed: false, last: null };
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return result;

  const byDay = new Map();
  (docs || []).forEach(d => {
    if (d && isValidDateKey(d.day) && isPlainMap(d.platforms)) byDay.set(d.day, d.platforms);
  });

  let key = from;
  let guard = 0;
  while (key <= to && guard < DAY_LOOP_GUARD) {
    let source = byDay.get(key) || null;
    let isLive = false;
    if (live && live.dayKey === key && isPlainMap(live.platforms)) {
      source = live.platforms;
      isLive = true;
    }

    let balance = null;
    let rollover = null;
    let partial = false;

    if (source) {
      if (platformId === ALL_PLATFORMS) {
        let b = 0; let r = 0; let nb = 0; let nr = 0; let bad = 0;
        Object.values(source).forEach(v => {
          const vb = finiteOrNull(v && v.balance);
          const vr = finiteOrNull(v && v.rollover);
          if (vb === null || vr === null) bad++;
          if (vb !== null) { b += vb; nb++; }
          if (vr !== null) { r += vr; nr++; }
        });
        balance = nb > 0 ? r2(b) : null;
        rollover = nr > 0 ? r2(r) : null;
        partial = bad > 0 && (nb > 0 || nr > 0);
      } else {
        const v = source[platformId];
        const vb = finiteOrNull(v && v.balance);
        const vr = finiteOrNull(v && v.rollover);
        balance = vb === null ? null : r2(vb);
        rollover = vr === null ? null : r2(vr);
      }
    }

    const hasData = balance !== null || rollover !== null;
    if (hasData) result.daysWithData++;
    if (partial) result.partialDays++;
    if (isLive && hasData) result.liveUsed = true;

    const point = { key, balance, rollover, live: isLive && hasData, partial };
    result.points.push(point);
    if (hasData) result.last = point;

    key = addDaysKey(key, 1);
    guard++;
  }

  result.totalDays = result.points.length;
  return result;
}
