// === NOVAS PLATAFORMAS + CAIXA DO PERÍODO — lógica pura (Sub-entrega 11b) ===
// Sem DOM e sem Firestore. Nada aqui é lançamento: é RESERVA/PREVISÃO de
// dinheiro. Saldo, Rollover e bônus não mudam.
//
// 1) NOVAS PLATAFORMAS (plataformas que AINDA NÃO estão cadastradas) —
//    plannerConfig/newPlatforms, orçamento SEPARADO do Misterioso:
//      { enabled, count, totalBudget, intervalDays, startKey, level, seed,
//        maintValue, maintEvery, slots:[{ id, name, value, level, target,
//        maintValue, maintEvery, linkedPlatformId }] }
//    - uma ativação a cada `intervalDays`, a partir de `startKey`;
//    - nível: 1º..8º (patamares do Misterioso R$ 30…5.000) ou 'random'
//      (sorteio com semente — "🎲 Sortear de novo" troca a semente);
//    - cada plataforma prevista pode ter valor próprio (substitui o do
//      nível), nível próprio e EMISSÃO ALVO (2/3/7/15/30): o depósito
//      precisa estar feito até o dia dessa emissão (dia 1 = ativação);
//    - manutenção PERPÉTUA depois da ativação (padrão R$ 10 a cada 8 dias,
//      editável por plataforma);
//    - vinculada a uma plataforma real = sai do Caixa (aí valem as rotinas
//      dela).
//
// 2) CAIXA DO PERÍODO (de hoje até o fim do dia/semana/mês/ano):
//      🗓️ Ativação semanal necessária — rotinas "Depositar" do tipo 🗓️
//         (só quem tem rotina; as outras aparecem num aviso)
//      ⬆️ A mais — orçamento do Misterioso (subir faixas; já existente)
//      🎲 Depósito de aposta — limite mensal (editável; já existente)
//      🆕 Novas plataformas — ativações + manutenção previstas
//      = total que precisa ter na conta.
//
// (Sub-entrega 11c — ajuste) A ativação semanal é PERPÉTUA. Fora do ciclo
// (🏁 Fim) só as plataformas "COM aposta" saem da conta até a volta
// prevista (sem previsão = ficam fora) — aparecem em "pausadas". As "SEM
// aposta" continuam: emitem o Bônus VIP semanal, que é alto.

import { MISTERIOSO_DEPOSIT_THRESHOLDS } from './misterioso-logic.js';
import { depositRoutineInflows } from './routine-logic.js';
import { getDepositKindId } from './deposit-kinds.js';
import { toLocalDateString, getWeekStart, getWeekEnd } from './finance-logic.js';
import { predictCycle, cycleState } from './cycle-history-logic.js';

export const NEW_PLATFORMS_MAX = 20;
export const EMISSION_TARGETS = Object.freeze([2, 3, 7, 15, 30]);
export const DEFAULT_MAINT = Object.freeze({ value: 10, every: 8 });
export const NP_NAME_MAX = 30;
export const NP_MONEY_MAX = 1000000;
export const CASH_PERIODS = Object.freeze([
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' }
]);

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toC(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

function money(v, max = NP_MONEY_MAX) {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
}

function intIn(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function levelThreshold(level) {
  return MISTERIOSO_DEPOSIT_THRESHOLDS[level - 1] || 0;
}

export const LEVEL_OPTIONS = Object.freeze(MISTERIOSO_DEPOSIT_THRESHOLDS.map((v, i) => ({ level: i + 1, value: v })));

function cleanLevel(l, allowInherit) {
  if (l === 'random') return 'random';
  if (allowInherit && (l === null || l === undefined || l === '' || l === 'inherit')) return null;
  const n = Math.round(Number(l));
  return n >= 1 && n <= MISTERIOSO_DEPOSIT_THRESHOLDS.length ? n : (allowInherit ? null : 1);
}

export function newSlotId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultNewPlatformsConfig(todayKey) {
  return {
    enabled: false,
    count: 1,
    totalBudget: 0,
    intervalDays: 8,
    startKey: todayKey ? addDaysKey(todayKey, 1) : '',
    level: 1,
    seed: 1,
    maintValue: DEFAULT_MAINT.value,
    maintEvery: DEFAULT_MAINT.every,
    slots: []
  };
}

export function sanitizeNewPlatformsConfig(c, todayKey = null) {
  const d = defaultNewPlatformsConfig(todayKey);
  const src = c && typeof c === 'object' ? c : {};
  const count = intIn(src.count, 1, NEW_PLATFORMS_MAX, d.count);
  const slotsIn = Array.isArray(src.slots) ? src.slots : [];
  const slots = [];
  for (let i = 0; i < count; i++) {
    const s = slotsIn[i] && typeof slotsIn[i] === 'object' ? slotsIn[i] : {};
    slots.push({
      id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : `n${i + 1}`,
      name: String(s.name || '').replace(/\s+/g, ' ').trim().slice(0, NP_NAME_MAX),
      value: money(s.value) || null,
      level: cleanLevel(s.level, true),
      target: EMISSION_TARGETS.includes(Number(s.target)) ? Number(s.target) : 2,
      maintValue: s.maintValue === null || s.maintValue === undefined || s.maintValue === '' ? null : Math.max(0, Math.round(Number(s.maintValue) * 100) / 100 || 0),
      maintEvery: s.maintEvery === null || s.maintEvery === undefined || s.maintEvery === '' ? null : intIn(s.maintEvery, 1, 90, null),
      linkedPlatformId: typeof s.linkedPlatformId === 'string' && s.linkedPlatformId ? s.linkedPlatformId.slice(0, 100) : null
    });
  }
  return {
    enabled: src.enabled === true,
    count,
    totalBudget: money(src.totalBudget),
    intervalDays: intIn(src.intervalDays, 1, 90, d.intervalDays),
    startKey: KEY_RE.test(String(src.startKey || '')) ? String(src.startKey) : d.startKey,
    level: cleanLevel(src.level, false),
    seed: intIn(src.seed, 1, 2147483646, 1),
    maintValue: src.maintValue === undefined ? d.maintValue : Math.max(0, Math.round(Number(src.maintValue) * 100) / 100 || 0),
    maintEvery: intIn(src.maintEvery, 1, 90, d.maintEvery),
    slots
  };
}

// Gerador com semente (mulberry32).
function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolve cada plataforma prevista: data de ativação, nível, valor,
 * prazo do depósito (emissão alvo), manutenção, e se cabe no orçamento.
 * @returns {{ slots:[...], activationC, budgetC, overC, warnings:[] }}
 */
export function resolveNewPlatforms(cfgIn, todayKey) {
  const cfg = sanitizeNewPlatformsConfig(cfgIn, todayKey);
  const budgetC = toC(cfg.totalBudget);
  const rand = rng(cfg.seed);
  const warnings = [];
  // 1º: quem tem valor ou nível fixo (consome o orçamento antes do sorteio).
  let fixedC = 0;
  const pre = cfg.slots.map((s, i) => {
    const level = s.level === null ? cfg.level : s.level;
    const activationKey = addDaysKey(cfg.startKey, i * cfg.intervalDays);
    const base = {
      ...s,
      index: i,
      label: s.name || `Nova ${i + 1}`,
      activationKey,
      depositByKey: addDaysKey(activationKey, s.target - 1),
      maintValue: s.maintValue === null ? cfg.maintValue : s.maintValue,
      maintEvery: s.maintEvery === null ? cfg.maintEvery : s.maintEvery,
      levelMode: level === 'random' && !s.value ? 'random' : 'fixed'
    };
    if (base.levelMode === 'fixed') {
      const lv = level === 'random' ? null : level;
      base.level = lv;
      base.valueC = s.value ? toC(s.value) : toC(levelThreshold(lv || 1));
      if (!s.value && !lv) base.level = 1;
      if (!s.linkedPlatformId) fixedC += base.valueC;
    }
    return base;
  });
  // 2º: sorteio dentro do que sobrou do orçamento (aleatório de verdade,
  // com semente — o mesmo sorteio até você pedir outro).
  let leftC = budgetC - fixedC;
  pre.forEach(s => {
    if (s.levelMode !== 'random') return;
    const fits = LEVEL_OPTIONS.filter(o => toC(o.value) <= leftC);
    let pick;
    if (budgetC <= 0) {
      pick = LEVEL_OPTIONS[0];
    } else if (fits.length) {
      pick = fits[Math.floor(rand() * fits.length)];
    } else {
      pick = LEVEL_OPTIONS[0];
    }
    s.level = pick.level;
    s.valueC = toC(pick.value);
    if (!s.linkedPlatformId) leftC -= s.valueC;
  });
  if (pre.some(s => s.levelMode === 'random') && budgetC <= 0) warnings.push('Aleatório sem valor destinado: sorteio usa só o 1º nível. Informe o valor destinado.');
  // Cabe no orçamento? (na ordem das ativações)
  let acc = 0;
  pre.forEach(s => {
    if (s.linkedPlatformId) { s.fits = true; return; }
    acc += s.valueC;
    s.fits = budgetC <= 0 || acc <= budgetC;
  });
  const activationC = pre.filter(s => !s.linkedPlatformId).reduce((t, s) => t + s.valueC, 0);
  const overC = budgetC > 0 ? Math.max(0, activationC - budgetC) : 0;
  if (overC > 0) warnings.push('A soma das ativações passa do valor destinado.');
  return { config: cfg, slots: pre, activationC, budgetC, overC, warnings };
}

/** Eventos de dinheiro das novas plataformas entre fromKey e toKey. */
export function newPlatformEvents(cfgIn, todayKey, fromKey, toKey) {
  const r = resolveNewPlatforms(cfgIn, todayKey);
  const out = [];
  if (!r.config.enabled) return out;
  r.slots.forEach(s => {
    if (s.linkedPlatformId) return;
    if (s.depositByKey >= fromKey && s.depositByKey <= toKey) {
      out.push({ key: s.depositByKey, kind: 'activation', slotId: s.id, label: s.label, level: s.level, valueC: s.valueC });
    }
    if (s.maintValue > 0 && s.maintEvery > 0) {
      let k = addDaysKey(s.activationKey, s.maintEvery);
      let guard = 0;
      while (k <= toKey && guard < 400) {
        if (k >= fromKey) out.push({ key: k, kind: 'maintenance', slotId: s.id, label: s.label, valueC: toC(s.maintValue) });
        k = addDaysKey(k, s.maintEvery);
        guard++;
      }
    }
  });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// ---------- Caixa do período ----------

export function cashRange(period, now = new Date()) {
  const today = toLocalDateString(now);
  let toKey = today;
  if (period === 'week') toKey = toLocalDateString(getWeekEnd(getWeekStart(now)));
  else if (period === 'month') toKey = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  else if (period === 'year') toKey = `${now.getFullYear()}-12-31`;
  return { fromKey: today, toKey };
}

function daysInMonth(now) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/** Plataformas incluídas em alguma rotina "Depositar" do tipo 🗓️. */
export function weeklyRoutinePlatformIds(routines) {
  const ids = new Set();
  (routines || []).forEach(r => {
    if (r && r.action === 'deposit' && r.depositKind === 'semanal') (r.platformIds || []).forEach(id => ids.add(id));
  });
  return ids;
}

/**
 * @param o { platforms, routines, strategy (buildMisteriosoStrategy),
 *            betLimitReais, newConfig, period, now }
 */
export function computeCash(o) {
  const now = o.now || new Date();
  const period = CASH_PERIODS.some(p => p.id === o.period) ? o.period : 'week';
  const { fromKey, toKey } = cashRange(period, now);
  const platforms = o.platforms || [];

  // 🗓️ Ativação semanal (só rotinas do tipo semanal).
  const weeklyRoutines = (o.routines || []).filter(r => r && r.action === 'deposit' && r.depositKind === 'semanal');
  const withRoutine = weeklyRoutinePlatformIds(o.routines);
  const weeklyRows = [];
  let weeklyC = 0;
  let unknown = 0;
  const paused = [];
  platforms.forEach(p => {
    if (!withRoutine.has(p.id)) return;
    let from = fromKey;
    if (p.cycleEnded && cycleState(p) !== 'no' && p.group === 'com') {
      const pred = predictCycle(p, fromKey);
      if (!pred.expectedReturnKey || pred.overdue || pred.expectedReturnKey > toKey) {
        paused.push({ name: String(p.name || ''), returnKey: pred.overdue ? null : pred.expectedReturnKey });
        return;
      }
      if (pred.expectedReturnKey > from) from = pred.expectedReturnKey;
      paused.push({ name: String(p.name || ''), returnKey: pred.expectedReturnKey, partial: true });
    }
    const inf = depositRoutineInflows(weeklyRoutines, p, from, toKey);
    unknown += inf.unknown;
    const c = inf.items.reduce((s, x) => s + x.valueC, 0);
    if (c > 0) weeklyRows.push({ platformId: p.id, name: String(p.name || ''), valueC: c, count: inf.items.length, next: inf.items[0] ? inf.items[0].key : null });
    weeklyC += c;
  });
  weeklyRows.sort((a, b) => (a.next || '').localeCompare(b.next || '') || b.valueC - a.valueC);
  const missing = platforms.filter(p => !withRoutine.has(p.id) && !p.cycleEnded).map(p => String(p.name || ''));

  // ⬆️ A mais (orçamento do Misterioso).
  const st = o.strategy || null;
  let extraC = 0;
  let extraNote = 'Orçamento do Misterioso não definido.';
  if (st && st.budgetC > 0) {
    const monthsLeft = 11 - now.getMonth();
    if (period === 'day' || period === 'week') {
      extraC = st.plan ? st.plan.spendC : 0;
      extraNote = 'Depósitos sugeridos agora pelo plano do Misterioso.';
    } else if (period === 'month') {
      extraC = st.remainingC;
      extraNote = 'O que sobra do orçamento do Misterioso.';
    } else {
      extraC = st.remainingC + st.budgetC * monthsLeft;
      extraNote = `Sobra deste ${st.settings.budgetMode === 'cycle' ? 'ciclo' : 'mês'} + orçamento × ${monthsLeft} mês(es).`;
    }
  }

  // 🎲 Depósito de aposta (limite mensal — já existente).
  const limitC = toC(o.betLimitReais);
  let betC = 0;
  let betUsedC = 0;
  if (limitC > 0) {
    const ms = new Date(now.getFullYear(), now.getMonth(), 1);
    platforms.forEach(p => (p.depositLog || []).forEach(e => {
      const d = new Date(e && e.date);
      if (isNaN(d.getTime()) || d < ms || d > now || getDepositKindId(e) !== 'aposta') return;
      betUsedC += toC(e.value);
    }));
    const leftMonthC = Math.max(0, limitC - betUsedC);
    const dim = daysInMonth(now);
    const daysLeft = dim - now.getDate() + 1;
    const share = (n) => Math.round(leftMonthC * Math.min(1, n / Math.max(1, daysLeft)));
    if (period === 'day') betC = share(1);
    else if (period === 'week') betC = share(Math.round((keyToDate(toKey) - keyToDate(fromKey)) / 86400000) + 1);
    else if (period === 'month') betC = leftMonthC;
    else betC = leftMonthC + limitC * (11 - now.getMonth());
  }

  // 🆕 Novas plataformas.
  const events = newPlatformEvents(o.newConfig, fromKey, fromKey, toKey);
  const newC = events.reduce((s, e) => s + e.valueC, 0);

  return {
    period,
    fromKey,
    toKey,
    weekly: { totalC: weeklyC, rows: weeklyRows, missing, unknown, paused },
    extra: { totalC: extraC, note: extraNote },
    bet: { totalC: betC, limitC, usedC: betUsedC },
    newPlatforms: { totalC: newC, events, enabled: !!(o.newConfig && o.newConfig.enabled) },
    totalC: weeklyC + extraC + betC + newC
  };
}
