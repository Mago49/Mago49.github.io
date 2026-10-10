// === ESTRATÉGIA DO MISTERIOSO + CONTENÇÃO (Gráficos → Misterioso — Sub-entrega 7b) ===
// Função pura: sem DOM e sem Firestore. Lê plataformas e templates (só
// leitura) e devolve números — quem grava é sempre um *-store.
//
// REGRAS DO MISTERIOSO (as MESMAS do sistema — nada aqui muda o cálculo
// oficial, que continua em misterioso-logic.js / bonus-ledger-logic.js):
//   - ciclo: lastResetDate (Reinício) ou dia 1 do mês;
//   - emissões nos dias 2, 3, 7, 15 e 30 do ciclo (computeEmissionDates);
//   - faixa pelo total depositado no ciclo (`deposits`, que Fim/Reinício
//     zeram) até o fim do dia da emissão — QUALQUER tipo de depósito conta;
//   - valor de referência = MÍNIMO da faixa (decisão do usuário). Emissão já
//     editada à mão (misteriosoBonusLog) vale o valor editado.
//
// O QUE ESTE ARQUIVO RESPONDE:
//   1) analyzeMisteriosoPlatform: pra cada faixa acima da atual, quanto falta
//      depositar AGORA, quanto isso rende a mais nas emissões que ainda faltam
//      no ciclo (ganho encadeado: cada emissão restante passa a pagar o mínimo
//      da faixa nova em vez do da atual) e quanto entra a mais no Rollover
//      (depósito 1:1 + bônus 1:1 — mesma regra de computeRolloverLive).
//   2) optimizeMisteriosoBudget: a MELHOR combinação (no máximo uma faixa por
//      plataforma) que cabe no que sobra do orçamento — mochila exata em
//      reais inteiros (custo arredondado PRA CIMA, nunca estoura o orçamento).
//   3) computeBudgetUsage: quanto do orçamento já foi usado — soma dos
//      depósitos 🎁 Ativação Mensal no período (ciclo de cada plataforma OU mês
//      do calendário, escolha do usuário).
//   4) computeDepositKindMonthly / computeContention: depósitos por tipo, mês a
//      mês, e o limite mensal dos 🎲 Depósitos de Aposta (contenção é por mês).
//   5) projectMisteriosoInflows: bônus do Misterioso que ainda vão ENTRAR no
//      Rollover no período do Planejador (só o que o Rollover ao vivo ainda não
//      conta — a emissão de hoje já está nele; só a diferença entra).
//
// CENTAVOS: contas de dinheiro em centavos inteiros (sufixo C).
//
// === (Sub-entrega 11a) PRIORIDADE POR VELOCIDADE ===
// optimizeMisteriosoBudget/buildMisteriosoStrategy aceitam priorityOf
// (platformId → peso de hoje, speed-logic.js). A mochila maximiza
// ganho × peso; ganho, custo e Rollover mostrados continuam os REAIS.
// Sem priorityOf (ou peso 1 pra todas) = exatamente o resultado de antes.

import { getCycleStart, computeEmissionDates } from './cycle-logic.js';
import { MISTERIOSO_DEPOSIT_THRESHOLDS, findMisteriosoTierIndex } from './misterioso-logic.js';
import { toLocalDateString } from './finance-logic.js';
import { DEPOSIT_KINDS, getDepositKindId } from './deposit-kinds.js';

export const BUDGET_MODES = Object.freeze([
  { id: 'cycle', label: 'Por ciclo' },
  { id: 'month', label: 'Por mês' }
]);

export const DEFAULT_STRATEGY_SETTINGS = Object.freeze({ budget: 0, budgetMode: 'cycle', betDepositMonthlyLimit: 0 });
export const STRATEGY_MONEY_MAX = 10000000;      // R$ 10 milhões — teto defensivo
export const OPTIMIZER_CAPACITY_MAX = 20000;     // reais inteiros na mochila exata
export const CONTENTION_MONTHS = 6;

const DAY_MS = 86400000;

function toC(reais) {
  const n = Number(reais);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromC(c) {
  return Math.round(Number(c) || 0) / 100;
}

function dayKey(d) {
  return toLocalDateString(d);
}

function entryDate(e) {
  if (!e || !e.date) return null;
  const d = new Date(e.date);
  return isNaN(d.getTime()) ? null : d;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function monthKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]}/${String(y).slice(2)}`;
}

// Configurações limpas (tipos garantidos) — usada pelo store e pela tela.
export function sanitizeStrategySettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const money = v => {
    const n = Math.round((Number(v) || 0) * 100) / 100;
    return Number.isFinite(n) && n >= 0 && n <= STRATEGY_MONEY_MAX ? n : 0;
  };
  return {
    budget: money(src.budget),
    budgetMode: src.budgetMode === 'month' ? 'month' : 'cycle',
    betDepositMonthlyLimit: money(src.betDepositMonthlyLimit)
  };
}

function validRanges(template) {
  return !!template && Array.isArray(template.bonusRanges)
    && template.bonusRanges.length === MISTERIOSO_DEPOSIT_THRESHOLDS.length
    && template.bonusRanges.every(r => r && Number.isFinite(Number(r.min)) && Number(r.min) >= 0);
}

function minC(template, tierIndex) {
  if (tierIndex < 0) return 0;
  return toC(template.bonusRanges[tierIndex].min);
}

// Depósitos do ciclo atual (array `deposits`) até `until`, em centavos.
function cycleDepositsC(platform, now, until) {
  const cs = getCycleStart(platform, now);
  let total = 0;
  (platform.deposits || []).forEach(e => {
    const d = entryDate(e);
    if (!d || d < cs || d > until) return;
    total += toC(e.value);
  });
  return total;
}

function loggedEmissionValue(platform, key) {
  const log = (platform.misteriosoBonusLog || []).find(e => e && e.date === key);
  return log ? toC(log.value) : null;
}

// Emissões do ciclo atual (chaves 'AAAA-MM-DD'), em ordem.
export function cycleEmissionKeys(platform, now = new Date()) {
  return computeEmissionDates(platform, now).map(dayKey);
}

/**
 * Situação de UMA plataforma no Misterioso.
 * status: 'ok' | 'no-template' | 'bad-template' | 'ended' | 'no-emissions'
 */
export function analyzeMisteriosoPlatform(platform, template, now = new Date()) {
  const base = { platformId: platform.id, name: String(platform.name || ''), options: [] };
  if (!template) return { ...base, status: 'no-template' };
  if (!validRanges(template)) return { ...base, status: 'bad-template', templateName: template.name || '' };
  if (platform.cycleEnded) return { ...base, status: 'ended', templateName: template.name || '' };
  // (11c) Marcada "🚫 Sem ciclo do Misterioso" na Edição.
  if (platform.misteriosoCycle === 'no') return { ...base, status: 'no-cycle', templateName: template.name || '' };

  const todayKey = dayKey(now);
  const keys = cycleEmissionKeys(platform, now);
  const remaining = keys.filter(k => k >= todayKey);
  const totalC = cycleDepositsC(platform, now, now);
  const tierIndex = findMisteriosoTierIndex(fromC(totalC));
  const tierMinC = minC(template, tierIndex);
  const cycleStartKey = dayKey(getCycleStart(platform, now));

  const info = {
    ...base,
    templateName: template.name || '',
    cycleStartKey,
    emissionKeys: keys,
    remainingKeys: remaining,
    nextEmissionKey: remaining[0] || null,
    totalC,
    tierIndex,
    tierMinC,
    // Emissões restantes já editadas à mão não mudam com depósito.
    lockedKeys: remaining.filter(k => loggedEmissionValue(platform, k) !== null),
    autoReset: !platform.lastResetDate
  };

  if (remaining.length === 0) return { ...info, status: 'no-emissions' };

  const free = remaining.filter(k => !info.lockedKeys.includes(k));
  for (let j = tierIndex + 1; j < MISTERIOSO_DEPOSIT_THRESHOLDS.length; j++) {
    const needC = toC(MISTERIOSO_DEPOSIT_THRESHOLDS[j]) - totalC;
    if (!(needC > 0)) continue;
    const perC = minC(template, j) - tierMinC;
    if (!(perC > 0)) continue;
    const gainC = perC * free.length;
    if (!(gainC > 0)) continue;
    info.options.push({
      platformId: platform.id,
      name: info.name,
      tier: j,
      thresholdC: toC(MISTERIOSO_DEPOSIT_THRESHOLDS[j]),
      needC,
      perEmissionC: perC,
      emissions: free.length,
      gainC,
      newMinC: minC(template, j),
      efficiency: gainC / needC,
      rolloverAddC: needC + gainC
    });
  }
  return { ...info, status: 'ok' };
}

export function analyzeAllMisterioso(platforms, resolveCtx = () => ({}), now = new Date()) {
  return (platforms || []).map(p => {
    let template = null;
    try { template = (resolveCtx(p) || {}).misteriosoTemplate || null; } catch (err) { template = null; }
    return analyzeMisteriosoPlatform(p, template, now);
  });
}

// Melhor opção de cada plataforma (maior eficiência), ordenadas.
export function rankByEfficiency(analyses) {
  const best = [];
  (analyses || []).forEach(a => {
    if (a.status !== 'ok' || a.options.length === 0) return;
    const top = [...a.options].sort((x, y) => (y.efficiency - x.efficiency) || (x.needC - y.needC))[0];
    best.push(top);
  });
  return best.sort((x, y) => (y.efficiency - x.efficiency) || (x.needC - y.needC) || x.name.localeCompare(y.name, 'pt-BR', { numeric: true }));
}

/**
 * Melhor combinação dentro do orçamento disponível (R$). No máximo uma
 * faixa por plataforma. Maximiza o ganho; empate = gasta menos.
 * Custos arredondados PRA CIMA em reais inteiros (nunca passa do orçamento).
 */
export function optimizeMisteriosoBudget(analyses, availableReais, priorityOf = null) {
  const prio = (id) => {
    if (typeof priorityOf !== 'function') return 1;
    const m = Number(priorityOf(id));
    return Number.isFinite(m) && m > 0 ? m : 1;
  };
  const groups = (analyses || []).filter(a => a.status === 'ok' && a.options.length > 0);
  const empty = { picks: [], spendC: 0, gainC: 0, rolloverAddC: 0, capped: false };
  const avail = Math.floor(Math.max(0, Number(availableReais) || 0) + 1e-9);
  if (groups.length === 0 || avail <= 0) return empty;

  const capped = avail > OPTIMIZER_CAPACITY_MAX;
  const cap = Math.min(avail, OPTIMIZER_CAPACITY_MAX);
  const NEG = -1;
  let dp = new Float64Array(cap + 1); // ganho máximo (centavos) gastando no máximo c
  const choice = groups.map(() => new Int8Array(cap + 1).fill(-1));

  groups.forEach((g, gi) => {
    const next = Float64Array.from(dp); // opção "não escolher"
    g.options.forEach((o, oi) => {
      const cost = Math.ceil(o.needC / 100);
      if (cost > cap) return;
      for (let c = cap; c >= cost; c--) {
        const v = dp[c - cost] + o.gainC * prio(o.platformId);
        if (v > next[c] + 1e-9) {
          next[c] = v;
          choice[gi][c] = oi;
        }
      }
    });
    dp = next;
  });

  // Menor capacidade que atinge o ganho máximo (empate = gasta menos).
  let bestC = 0;
  for (let c = 1; c <= cap; c++) if (dp[c] > dp[bestC] + 1e-9) bestC = c;
  if (dp[bestC] <= 0) return { ...empty, capped };

  const picks = [];
  let c = bestC;
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const oi = choice[gi][c];
    if (oi === NEG) continue;
    const o = groups[gi].options[oi];
    picks.push(o);
    c -= Math.ceil(o.needC / 100);
  }
  picks.sort((x, y) => (y.efficiency - x.efficiency) || x.name.localeCompare(y.name, 'pt-BR', { numeric: true }));
  return {
    picks,
    spendC: picks.reduce((s, o) => s + o.needC, 0),
    gainC: picks.reduce((s, o) => s + o.gainC, 0),
    rolloverAddC: picks.reduce((s, o) => s + o.rolloverAddC, 0),
    capped
  };
}

/**
 * Uso do orçamento = depósitos 🎁 Ativação Mensal no período.
 *   'month' → depositLog (permanente) do mês do calendário.
 *   'cycle' → `deposits` do ciclo ATUAL de cada plataforma (cada uma com o
 *             seu início). Plataforma com ciclo encerrado não soma.
 */
export function computeBudgetUsage(platforms, mode = 'cycle', now = new Date()) {
  const byPlatform = [];
  let usedC = 0;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  (platforms || []).forEach(p => {
    let c = 0;
    if (mode === 'month') {
      (p.depositLog || []).forEach(e => {
        const d = entryDate(e);
        if (!d || d < monthStart || d > now || getDepositKindId(e) !== 'mensal') return;
        c += toC(e.value);
      });
    } else if (!p.cycleEnded) {
      const cs = getCycleStart(p, now);
      (p.deposits || []).forEach(e => {
        const d = entryDate(e);
        if (!d || d < cs || d > now || getDepositKindId(e) !== 'mensal') return;
        c += toC(e.value);
      });
    }
    if (c > 0) byPlatform.push({ platformId: p.id, name: String(p.name || ''), valueC: c });
    usedC += c;
  });
  byPlatform.sort((a, b) => b.valueC - a.valueC);
  return { mode: mode === 'month' ? 'month' : 'cycle', usedC, byPlatform, monthKey: monthKeyOf(now) };
}

/**
 * Tudo que a tela precisa de uma vez (mesma conta em Misterioso, Agenda e
 * Planejador — nunca três versões diferentes).
 */
export function buildMisteriosoStrategy(platforms, resolveCtx, settings, now = new Date(), priorityOf = null) {
  const s = sanitizeStrategySettings(settings);
  const analyses = analyzeAllMisterioso(platforms, resolveCtx, now);
  const usage = computeBudgetUsage(platforms, s.budgetMode, now);
  const remainingC = Math.max(0, toC(s.budget) - usage.usedC);
  const plan = s.budget > 0 ? optimizeMisteriosoBudget(analyses, fromC(remainingC), priorityOf) : { picks: [], spendC: 0, gainC: 0, rolloverAddC: 0, capped: false };
  return {
    settings: s,
    analyses,
    ranking: rankByEfficiency(analyses),
    usage,
    budgetC: toC(s.budget),
    remainingC,
    plan,
    emissionsToday: analyses.filter(a => a.status === 'ok' && a.remainingKeys[0] === dayKey(now))
  };
}

// ---------- contenção ----------

const KIND_IDS = DEPOSIT_KINDS.map(k => k.id);

/**
 * Depósitos por tipo, mês a mês (depositLog — permanente), últimos N meses
 * terminando no mês de `now`. Semanas antigas adicionadas à mão (backfill)
 * entram como "Sem tipo".
 */
export function computeDepositKindMonthly(platforms, months = CONTENTION_MONTHS, now = new Date()) {
  const n = Math.max(1, Math.min(24, Math.round(Number(months) || CONTENTION_MONTHS)));
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const rows = new Map(keys.map(k => [k, { monthKey: k, label: monthLabel(k), semanal: 0, mensal: 0, aposta: 0, none: 0, total: 0 }]));
  (platforms || []).forEach(p => (p.depositLog || []).forEach(e => {
    const d = entryDate(e);
    if (!d || d > now) return;
    const row = rows.get(monthKeyOf(d));
    if (!row) return;
    const kind = getDepositKindId(e) || 'none';
    const c = toC(e.value);
    row[kind] += c;
    row.total += c;
  }));
  return keys.map(k => rows.get(k));
}

/** Contenção do mês atual: 🎲 Depósitos de Aposta × limite mensal. */
export function computeContention(platforms, limitReais, now = new Date()) {
  const ym = monthKeyOf(now);
  const byPlatform = [];
  let usedC = 0;
  (platforms || []).forEach(p => {
    let c = 0;
    (p.depositLog || []).forEach(e => {
      const d = entryDate(e);
      if (!d || d > now || monthKeyOf(d) !== ym || getDepositKindId(e) !== 'aposta') return;
      c += toC(e.value);
    });
    if (c > 0) byPlatform.push({ platformId: p.id, name: String(p.name || ''), valueC: c });
    usedC += c;
  });
  byPlatform.sort((a, b) => b.valueC - a.valueC);
  const limitC = toC(limitReais);
  const ratio = limitC > 0 ? usedC / limitC : null;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  return {
    monthKey: ym,
    usedC,
    limitC,
    ratio,
    status: limitC <= 0 ? 'unset' : (usedC > limitC ? 'over' : (ratio >= 0.8 ? 'near' : 'ok')),
    leftC: limitC > 0 ? Math.max(0, limitC - usedC) : null,
    perDayLeftC: limitC > 0 && daysLeft > 0 ? Math.floor(Math.max(0, limitC - usedC) / daysLeft) : null,
    daysLeft,
    byPlatform
  };
}

export { KIND_IDS };

// ---------- projeção pro Planejador ----------

/**
 * Bônus do Misterioso que ainda vão ENTRAR no Rollover, por dia, até toKey.
 * extraDeposits: [{ key, valueC }] depósitos previstos (rotinas, sugestão)
 *   a partir de hoje — sobem a faixa das emissões seguintes.
 * Emissão de HOJE: o Rollover ao vivo já conta o valor de hoje; só a
 *   diferença causada pelos depósitos previstos de hoje entra.
 * Emissão editada à mão (misteriosoBonusLog) nunca muda.
 * Só o ciclo ATUAL (o próximo depende de Reinício / virada do mês).
 */
export function projectMisteriosoInflows(platform, template, extraDeposits = [], toKey = null, now = new Date()) {
  if (!platform || !validRanges(template) || platform.cycleEnded) return [];
  const todayKey = dayKey(now);
  const keys = cycleEmissionKeys(platform, now).filter(k => k >= todayKey && (!toKey || k <= toKey));
  if (keys.length === 0) return [];
  const actualC = cycleDepositsC(platform, now, now);
  const extras = (extraDeposits || []).filter(x => x && typeof x.key === 'string' && x.key >= todayKey && Number(x.valueC) > 0);
  const out = [];
  keys.forEach(k => {
    if (loggedEmissionValue(platform, k) !== null) return; // valor fixado à mão
    const projectedC = actualC + extras.filter(x => x.key <= k).reduce((s, x) => s + Math.round(x.valueC), 0);
    const valueC = minC(template, findMisteriosoTierIndex(fromC(projectedC)));
    const baselineC = k === todayKey ? minC(template, findMisteriosoTierIndex(fromC(actualC))) : 0;
    const deltaC = valueC - baselineC;
    if (deltaC > 0) out.push({ key: k, valueC: deltaC });
  });
  return out;
}

// Dias entre hoje e uma chave (0 = hoje).
export function daysUntil(key, now = new Date()) {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  return Math.round((keyToDate(key) - t) / DAY_MS);
}
