// === CONFERÊNCIA DE SALDO REAL + BÔNUS DA SEMANA (Sub-entrega 8a) ===
// Função pura: sem DOM e sem Firestore. Mexe só no objeto da plataforma
// em memória — quem grava é sempre a tela, com savePlatform (o documento
// inteiro, como todas as outras ações do Financeiro).
//
// POR QUE EXISTE: bônus avulso que a plataforma paga no meio da semana só
// era conhecido no fechamento de domingo. Até lá o Saldo ficava abaixo do
// real e o Rollover ao vivo zerava cedo demais (aposta "consumia" um
// Rollover que o sistema não sabia que existia) — Planejador, Misterioso
// e Agenda decidiam em cima de número errado.
//
// COMO FUNCIONA:
//   esperado  = Saldo ao vivo (computeLiveBalance) [+ R.B. da sessão que
//               está sendo registrada, quando a conferência é pedida na
//               hora de registrar a aposta]
//   diferença = saldo real informado − esperado
//   ≈ 0 (até 1 centavo) → conferido, nada muda;
//   > 0 → BÔNUS AVULSO que entrou sem ser lançado: vira uma entrada em
//         otherBonusLog com source:'balance-check' (conta sempre inteiro —
//         ver bonus-ledger-logic.js), Saldo 1:1 e Rollover na escala
//         escolhida (padrão 1:1). O Rollover sobe na hora.
//   < 0 → DIVERGENTE: o usuário pode marcar bônus esperados da semana
//         aberta que NÃO recebeu (bonusExclusions) — saem do Saldo, do
//         Rollover, da aba VIP, do Histórico, dos Gráficos e do Misterioso
//         ao mesmo tempo. Ou registrar assim mesmo (nada muda).
//
// SÓ A SEMANA ABERTA: semana fechada fica travada (o fechamento de domingo
// já corrige pelo bônus real). Por isso o gerenciador "Bônus da semana"
// lista só de segunda até hoje — leve, nunca carrega o passado inteiro.
//
// DOMINGO: o bônus real digitado desconta fórmula (já sem os excluídos) +
// avulsos (inclusive os da conferência). Só a diferença entra — sem
// dupla contagem.
//
// Campos da plataforma (normalizePlatformData + GUARDED_FIELDS):
//   balanceChecks:   [{ id, date, dayKey, real, expected, diff, pendingRB,
//                       resolution:'match'|'bonus'|'excluded'|'divergent',
//                       bonusValue, scale, excludedTotal }]
//   bonusExclusions: [{ id, dayKey, type, value, prevLog, checkId, createdAt }]

// === (Sub-entrega 13) ===
// a) SALDO DO SISTEMA NEGATIVO: o Saldo exibido tem piso em zero, mas a
//    soma da fase pode ficar negativa quando falta lançamento (ou o Saldo
//    Inicial da fase está errado). Antes a conferência comparava com o
//    zero exibido e o negativo escondido "comia" o bônus lançado (o Saldo
//    não batia com o real depois). Agora computeBalanceGap compara com o
//    valor SEM piso e marca `negative` — a tela avisa antes de seguir. Se
//    o usuário continuar, o Saldo fica igual ao real.
// b) 💎 BÔNUS ALTO na lista "Bônus da semana": tipo 'alto', com Editar
//    (valor + escala) e Excluir. Não tem "Não recebi" (é valor real).
//
// === (Sub-entrega 14) ESCALA DO ROLLOVER (R) EM TODOS OS BÔNUS ===
// Escala 0 = "sem rollover" (soma no Saldo, não no Rollover).
//   setFormulaScale  — R de um bônus de fórmula num dia (bonusScales);
//   setAvulsoScale   — R de um avulso já lançado (rolloverValue recalculado);
//   applyPositiveGap / updateHighBonusEntry — aceitam 0.
// Os itens da lista trazem `scale` pra tela mostrar e editar.
//
// === (Sub-entrega 16) ➗ DIVIDIR ===
// applyPositiveGap aceita, no lugar da escala, uma lista de partes
// [{ value, scale }] (normalizeBonusParts): cada parte vira um avulso
// próprio (mesmo checkId, createdAt +i ms), com o seu R.
//
// === (Sub-entrega 17) ⬇️ ABATIMENTO DE ROLLOVER ===
// platform.rolloverAdjustments: baixa de rollover que a plataforma deu sem
// aposta. planRolloverTarget decide, a partir do rollover que o sistema
// terá depois das mudanças desta tela (previewRollover), quanto abater:
//   abatido informado  -> abate esse valor (nunca mais que o rollover);
//   rollover real      -> abate (sistema − real) quando o real é MENOR;
//                         real MAIOR = só bônus com escala maior sobe o
//                         rollover -> erro 'above' (nada é lançado).
// Aparece no "Bônus da semana" (kind 'abatido', Excluir).
//
// === (Sub-entrega 37) ⬆️ AUMENTO DE ROLLOVER ===
// Rollover real MAIOR que o sistema deixa de ser erro: 'above' traz a
// diferença (value) e a pergunta. Confirmado com o marcador "Aumento",
// grava platform.rolloverIncreases (addRolloverIncrease). Ou o usuário
// sobe o R do bônus. Aparece no "Bônus da semana" (kind 'aumento', Excluir).

import {
  computeLiveBalance, computeLiveBalanceRaw, getWeekStart, getWeekEnd, toLocalDateString, isCurrentWeekClosed, roundMoney,
  computeRolloverAt
} from './finance-logic.js';
import {
  getExpectedBonusBreakdownForDate, getEffectiveOtherBonusEntries, isFixedOtherBonus, getHighBonusEntries, highBonusRollover,
  normalizeRolloverScale, getFormulaScale
} from './bonus-ledger-logic.js';

const r2 = roundMoney;

export const BALANCE_TOLERANCE = 0.01;
export const BALANCE_MAX = 100000000;

export const BONUS_TYPE_LABELS = Object.freeze({
  vipDaily: 'VIP diário',
  vipWeekly: 'VIP semanal',
  vipMonthly: 'VIP mensal',
  obrigado: 'Obrigado',
  misterioso: 'Misterioso',
  alto: 'Bônus Alto',
  avulso: 'Avulso',
  abatido: 'Rollover abatido',
  aumento: 'Rollover aumentado' // (37)
});

// Grupo do filtro (VIP / Misterioso / Obrigado / Avulso).
export function bonusTypeGroup(type) {
  if (type === 'vipDaily' || type === 'vipWeekly' || type === 'vipMonthly') return 'vip';
  return type;
}

const FORMULA_TYPES = ['vipDaily', 'vipWeekly', 'vipMonthly', 'obrigado', 'misterioso'];

function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

// ---------- conferência ----------

export function getBalanceChecks(platform) {
  return Array.isArray(platform && platform.balanceChecks) ? platform.balanceChecks : [];
}

export function getLastBalanceCheck(platform) {
  const list = getBalanceChecks(platform);
  let last = null;
  list.forEach(c => { if (c && c.date && (!last || c.date > last.date)) last = c; });
  return last;
}

// Já houve conferência hoje? (2ª aposta do dia não pede de novo)
export function hasBalanceCheckToday(platform, now = new Date()) {
  const today = toLocalDateString(now);
  return getBalanceChecks(platform).some(c => c && c.dayKey === today);
}

export function parseRealBalance(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > BALANCE_MAX) return null;
  return r2(n);
}

/**
 * Compara o saldo real com o esperado.
 * pendingRB: R.B. da sessão que ainda vai ser gravada (conferência pedida
 * na hora de registrar a aposta — o saldo da plataforma JÁ inclui ela).
 */
export function computeBalanceGap(platform, realBalance, ctx = {}, now = new Date(), pendingRB = 0) {
  const real = r2(realBalance);
  const live = computeLiveBalance(platform, now, ctx);
  // (13) soma SEM o piso: negativa = falta lançamento na fase.
  const raw = computeLiveBalanceRaw(platform, now, ctx);
  const negative = raw < -BALANCE_TOLERANCE;
  const base = negative ? raw : live;
  const expected = r2(base + (Number(pendingRB) || 0));
  const diff = r2(real - expected);
  const kind = Math.abs(diff) <= BALANCE_TOLERANCE ? 'match' : (diff > 0 ? 'over' : 'under');
  return { real, expected, live, raw: r2(raw), negative, pendingRB: r2(pendingRB), diff, kind };
}

function pushCheck(platform, gap, now, extra) {
  if (!Array.isArray(platform.balanceChecks)) platform.balanceChecks = [];
  const check = {
    id: newId('bc'),
    date: now.toISOString(),
    dayKey: toLocalDateString(now),
    real: gap.real,
    expected: gap.expected,
    diff: gap.diff,
    pendingRB: gap.pendingRB || 0,
    resolution: 'match',
    ...extra
  };
  platform.balanceChecks.push(check);
  return check;
}

// Conferido (diferença ≈ 0) ou divergente registrado assim mesmo.
export function recordBalanceCheck(platform, gap, resolution = 'match', now = new Date()) {
  return pushCheck(platform, gap, now, { resolution });
}

/**
 * Diferença positiva → bônus avulso. A entrada nasce 1 segundo ANTES de
 * `now` (o instante da aposta, quando a conferência vem do registro dela),
 * pra que a aposta registrada em seguida já enxergue esse Rollover.
 */
export function applyPositiveGap(platform, gap, scale = 1, now = new Date(), before = null) {
  if (!(gap.diff > BALANCE_TOLERANCE)) return null;
  const value = r2(gap.diff);
  // (16) `scale` pode ser uma lista de partes [{ value, scale }] (➗ Dividir).
  const parts = normalizeBonusParts(scale, value);
  if (!parts) return null;
  const single = parts.length === 1;
  const check = pushCheck(platform, gap, now, {
    resolution: 'bonus',
    bonusValue: value,
    scale: single ? parts[0].scale : null,
    ...(single ? {} : { parts: parts.map(p => ({ value: p.value, scale: p.scale })) })
  });
  // (Sub-entrega 9) aposta com dia/hora informados: o avulso entra 1 s
  // antes DELA (nunca depois de agora).
  const anchor = before && !isNaN(new Date(before).getTime()) ? Math.min(new Date(before).getTime(), now.getTime()) : now.getTime();
  const at = new Date(anchor - 1000).toISOString();
  if (!Array.isArray(platform.otherBonusLog)) platform.otherBonusLog = [];
  parts.forEach((part, i) => {
    platform.otherBonusLog.push({
      date: at,
      rawValue: part.value,
      scale: part.scale,
      rolloverValue: r2(part.value * part.scale),
      source: 'balance-check',
      checkId: check.id,
      // (16) createdAt distinto por parte (+i ms): cada parte é um item
      // próprio no "Bônus da semana" (R e Excluir separados).
      createdAt: new Date(now.getTime() + i).toISOString(),
      ...(single ? {} : { splitPart: i + 1, splitOf: parts.length })
    });
  });
  return check;
}

/**
 * (Sub-entrega 16) Normaliza as partes de um bônus dividido:
 *   número/indefinido → [{ value: total, scale }] (uma parte só);
 *   lista [{ value, scale }] → valida (cada parte > 0) e ajusta a ÚLTIMA
 *   pra soma bater exatamente com `total` (centavo de arredondamento).
 * null = partes inválidas (nada deve ser gravado).
 */
export function normalizeBonusParts(scaleOrParts, total) {
  const t = r2(total);
  if (!Array.isArray(scaleOrParts)) return [{ value: t, scale: normalizeRolloverScale(scaleOrParts) }];
  const parts = scaleOrParts
    .map(p => ({ value: r2(p && p.value), scale: normalizeRolloverScale(p && p.scale) }));
  if (!parts.length || parts.some(p => !(p.value > 0))) return null;
  const sum = r2(parts.reduce((acc, p) => acc + p.value, 0));
  const diff = r2(t - sum);
  if (Math.abs(diff) > 0.05) return null; // não bate com o total
  parts[parts.length - 1].value = r2(parts[parts.length - 1].value + diff);
  if (!(parts[parts.length - 1].value > 0)) return null;
  return parts;
}
// ---------- bônus da semana aberta ----------

export function getOpenWeekRange(now = new Date()) {
  const ws = getWeekStart(now);
  return { startKey: toLocalDateString(ws), endKey: toLocalDateString(getWeekEnd(ws)), todayKey: toLocalDateString(now), weekStart: ws };
}

export function isOpenWeekEditable(platform, now = new Date()) {
  return !isCurrentWeekClosed(platform, now);
}

function inOpenWeek(dayKey, now) {
  const { startKey, todayKey } = getOpenWeekRange(now);
  return typeof dayKey === 'string' && dayKey >= startKey && dayKey <= todayKey;
}

/**
 * Bônus da semana aberta (segunda até hoje), do mais novo pro mais antigo:
 *   formula — esperado pela fórmula (VIP/Obrigado/Misterioso), excluível;
 *   excluded — marcado como não recebido (pode Desfazer);
 *   avulso — lançamentos de otherBonusLog (conferência ou "Inserir bônus").
 * Semana já fechada → lista vazia (nada a ajustar).
 */
export function listOpenWeekBonusItems(platform, ctx = {}, now = new Date()) {
  if (!platform || !isOpenWeekEditable(platform, now)) return [];
  const { startKey, todayKey } = getOpenWeekRange(now);
  const items = [];

  let key = startKey;
  let guard = 0;
  while (key <= todayKey && guard < 8) {
    const b = getExpectedBonusBreakdownForDate(platform, dayKeyToDate(key), ctx);
    FORMULA_TYPES.forEach(type => {
      const v = r2(b[type]);
      if (v > 0) items.push({ id: `f|${key}|${type}`, kind: 'formula', dayKey: key, type, value: v, scale: getFormulaScale(platform, key, type), sortKey: `${key}T00:00:00` });
    });
    key = addDaysKey(key, 1);
    guard++;
  }

  (platform.bonusExclusions || []).forEach(e => {
    if (!e || !inOpenWeek(e.dayKey, now)) return;
    items.push({ id: `x|${e.id}`, kind: 'excluded', dayKey: e.dayKey, type: e.type, value: r2(e.value), exclusionId: e.id, checkId: e.checkId || null, sortKey: `${e.dayKey}T00:00:00` });
  });

  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(weekStart);

  // (13) 💎 bônus alto da semana aberta (até hoje — o bônus nasce 1 s
  // depois do depósito, então não se compara com o instante exato).
  getHighBonusEntries(platform).forEach(e => {
    const d = new Date(e.date);
    if (d < weekStart || d > weekEnd || !inOpenWeek(toLocalDateString(d), now)) return;
    items.push({
      id: `h|${e.id || e.date}`,
      kind: 'alto',
      dayKey: toLocalDateString(d),
      type: 'alto',
      value: r2(e.value),
      scale: normalizeRolloverScale(e.scale),
      rollover: r2(highBonusRollover(e)),
      entry: e,
      sortKey: e.date
    });
  });

  // (17) ⬇️ abatimentos de rollover da semana aberta.
  (platform.rolloverAdjustments || []).forEach(e => {
    if (!e || !e.date) return;
    const d = new Date(e.date);
    if (isNaN(d.getTime()) || d < weekStart || d > weekEnd) return;
    items.push({
      id: `r|${e.id || e.date}`,
      kind: 'abatido',
      dayKey: toLocalDateString(d),
      type: 'abatido',
      value: r2(e.value),
      entry: e,
      sortKey: e.date
    });
  });

  // (37) ⬆️ aumentos de rollover da semana aberta.
  (platform.rolloverIncreases || []).forEach(e => {
    if (!e || !e.date) return;
    const d = new Date(e.date);
    if (isNaN(d.getTime()) || d < weekStart || d > weekEnd) return;
    items.push({
      id: `u|${e.id || e.date}`,
      kind: 'aumento',
      dayKey: toLocalDateString(d),
      type: 'aumento',
      value: r2(e.value),
      entry: e,
      sortKey: e.date
    });
  });

  getEffectiveOtherBonusEntries(platform, e => {
    const d = new Date(e.date);
    return d >= weekStart && d <= weekEnd;
  }, ctx).forEach(({ entry, raw }) => {
    const d = new Date(entry.date);
    items.push({
      id: `a|${entry.date}|${entry.createdAt || ''}`,
      kind: 'avulso',
      dayKey: toLocalDateString(d),
      type: 'avulso',
      value: r2(raw),
      rawValue: r2(entry.rawValue),
      scale: normalizeRolloverScale(entry.scale),
      fromCheck: isFixedOtherBonus(entry),
      entry,
      sortKey: entry.date
    });
  });

  return items.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)) || a.type.localeCompare(b.type));
}

/**
 * Marca bônus esperados como NÃO recebidos. items: itens 'formula' de
 * listOpenWeekBonusItems. Misterioso: grava valor 0 em misteriosoBonusLog
 * (guarda o registro anterior pra Desfazer). Devolve o total excluído.
 */
export function excludeBonusItems(platform, items, { checkId = null, now = new Date() } = {}) {
  if (!Array.isArray(platform.bonusExclusions)) platform.bonusExclusions = [];
  let total = 0;
  (items || []).forEach(it => {
    if (!it || it.kind !== 'formula' || !FORMULA_TYPES.includes(it.type) || !inOpenWeek(it.dayKey, now)) return;
    if (platform.bonusExclusions.some(e => e && e.dayKey === it.dayKey && e.type === it.type)) return;
    const exclusion = {
      id: newId('bx'),
      dayKey: it.dayKey,
      type: it.type,
      value: r2(it.value),
      prevLog: null,
      checkId,
      createdAt: now.toISOString()
    };
    if (it.type === 'misterioso') {
      if (!Array.isArray(platform.misteriosoBonusLog)) platform.misteriosoBonusLog = [];
      const existing = platform.misteriosoBonusLog.find(e => e && e.date === it.dayKey);
      if (existing) {
        exclusion.prevLog = { value: Number(existing.value) || 0, edited: existing.edited === true };
        existing.value = 0;
        existing.edited = true;
        existing.excludedBy = exclusion.id;
      } else {
        platform.misteriosoBonusLog.push({ date: it.dayKey, value: 0, edited: true, excludedBy: exclusion.id });
      }
    }
    platform.bonusExclusions.push(exclusion);
    total += it.value;
  });
  return r2(total);
}

/**
 * Desfaz uma exclusão. Devolve a lista de campos que DIMINUÍRAM (pra
 * savePlatform allowShrink) ou null se não achou.
 */
export function restoreExclusion(platform, exclusionId) {
  const list = Array.isArray(platform.bonusExclusions) ? platform.bonusExclusions : [];
  const idx = list.findIndex(e => e && e.id === exclusionId);
  if (idx === -1) return null;
  const [ex] = list.splice(idx, 1);
  const shrink = ['bonusExclusions'];
  if (ex.type === 'misterioso' && Array.isArray(platform.misteriosoBonusLog)) {
    const li = platform.misteriosoBonusLog.findIndex(e => e && e.date === ex.dayKey && e.excludedBy === ex.id);
    if (li !== -1) {
      if (ex.prevLog) {
        const entry = platform.misteriosoBonusLog[li];
        entry.value = ex.prevLog.value;
        entry.edited = ex.prevLog.edited;
        delete entry.excludedBy;
      } else {
        platform.misteriosoBonusLog.splice(li, 1);
        shrink.push('misteriosoBonusLog');
      }
    }
  }
  return shrink;
}

/** Remove um lançamento avulso (otherBonusLog). true se removeu. */
export function removeAvulsoEntry(platform, entry) {
  const list = Array.isArray(platform.otherBonusLog) ? platform.otherBonusLog : [];
  const idx = list.indexOf(entry);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ---------- (Sub-entrega 13) 💎 bônus alto ----------

// O "Inserir bônus hoje" lançado DEPOIS do bônus alto já incluía o valor
// antigo dele no total informado. Ao editar/excluir o bônus alto, esse
// total acompanha a diferença — senão o avulso "cobriria" a mudança e o
// Saldo não mudaria.
function shiftLaterClaims(platform, entry, delta) {
  if (!delta) return;
  const key = toLocalDateString(new Date(entry.date));
  const since = new Date(entry.createdAt || entry.date).getTime();
  (platform.otherBonusLog || []).forEach(e => {
    if (!e || typeof e.claimedTotal !== 'number' || !Number.isFinite(e.claimedTotal)) return;
    if (e.source === 'balance-check') return;
    if (toLocalDateString(new Date(e.date)) !== key) return;
    if (new Date(e.createdAt || e.date).getTime() < since) return;
    e.claimedTotal = r2(Math.max(0, e.claimedTotal + delta));
  });
}

/** Remove um bônus alto (highBonusLog). true se removeu. */
export function removeHighBonusEntry(platform, entry) {
  const list = Array.isArray(platform.highBonusLog) ? platform.highBonusLog : [];
  const idx = list.indexOf(entry);
  if (idx === -1) return false;
  shiftLaterClaims(platform, entry, -r2(entry.value));
  list.splice(idx, 1);
  return true;
}

/** Edita valor e escala de um bônus alto. true se mudou. */
export function updateHighBonusEntry(platform, entry, { value, scale }) {
  const list = Array.isArray(platform.highBonusLog) ? platform.highBonusLog : [];
  if (!list.includes(entry)) return false;
  const v = r2(value);
  if (!(v > 0) || v > BALANCE_MAX) return false;
  const s = normalizeRolloverScale(scale); // (14) 0 = sem rollover
  shiftLaterClaims(platform, entry, r2(v - (Number(entry.value) || 0)));
  entry.value = v;
  entry.scale = s;
  entry.rolloverValue = r2(v * s);
  entry.editedAt = new Date().toISOString();
  return true;
}

// ---------- (Sub-entrega 14) R — escala do Rollover ----------

/**
 * R de um bônus de fórmula (VIP/Obrigado/Misterioso) num dia da semana
 * aberta. Grava/atualiza platform.bonusScales (nunca remove — voltar pra
 * 1:1 grava 1). true se mudou.
 */
export function setFormulaScale(platform, dayKey, type, scale, now = new Date()) {
  if (!FORMULA_TYPES.includes(type) || !inOpenWeek(dayKey, now)) return false;
  const s = normalizeRolloverScale(scale);
  if (!Array.isArray(platform.bonusScales)) platform.bonusScales = [];
  const hit = platform.bonusScales.find(e => e && e.dayKey === dayKey && e.type === type);
  if (hit) {
    if (normalizeRolloverScale(hit.scale) === s) return false;
    hit.scale = s;
    hit.updatedAt = now.toISOString();
    return true;
  }
  if (s === 1) return false; // já é o padrão
  platform.bonusScales.push({ id: newId('bs'), dayKey, type, scale: s, updatedAt: now.toISOString() });
  return true;
}

/** R de um avulso já lançado (inclusive o da conferência). true se mudou. */
export function setAvulsoScale(platform, entry, scale) {
  const list = Array.isArray(platform.otherBonusLog) ? platform.otherBonusLog : [];
  if (!list.includes(entry)) return false;
  const s = normalizeRolloverScale(scale);
  const raw = Number(entry.rawValue) || 0;
  const rv = r2(raw * s);
  if (normalizeRolloverScale(entry.scale) === s && r2(Number(entry.rolloverValue) || 0) === rv) return false;
  entry.scale = s;
  entry.rolloverValue = rv;
  entry.scaleEditedAt = new Date().toISOString();
  return true;
}

// ---------- (Sub-entrega 17) ⬇️ abatimento de rollover ----------

export const ROLLOVER_TOLERANCE = 0.01;

/** Grava um abatimento (value > 0). `at` = instante dele (padrão: now). */
export function addRolloverAdjustment(platform, value, { at = null, now = new Date(), source = 'manual', checkId = null } = {}) {
  const v = r2(value);
  if (!(v > 0) || v > BALANCE_MAX) return null;
  if (!Array.isArray(platform.rolloverAdjustments)) platform.rolloverAdjustments = [];
  const when = at && !isNaN(new Date(at).getTime()) ? new Date(at) : now;
  const entry = {
    id: newId('ra'),
    date: when.toISOString(),
    value: v,
    source,
    ...(checkId ? { checkId } : {}),
    createdAt: now.toISOString()
  };
  platform.rolloverAdjustments.push(entry);
  return entry;
}

/** (37) Grava um aumento de rollover (value > 0). */
export function addRolloverIncrease(platform, value, { at = null, now = new Date(), source = 'check', checkId = null } = {}) {
  const v = r2(value);
  if (!(v > 0) || v > BALANCE_MAX) return null;
  if (!Array.isArray(platform.rolloverIncreases)) platform.rolloverIncreases = [];
  const when = at && !isNaN(new Date(at).getTime()) ? new Date(at) : now;
  const entry = {
    id: newId('ru'),
    date: when.toISOString(),
    value: v,
    source,
    ...(checkId ? { checkId } : {}),
    createdAt: now.toISOString()
  };
  platform.rolloverIncreases.push(entry);
  return entry;
}

// === (Sub-entrega 41) 🧹 REVISAR AJUSTES DE ROLLOVER ===
// Lista os ⬆️ aumentos e ⬇️ abatimentos de um período e marca/desmarca
// statsIgnored (🙈 fora das estatísticas — o Rollover continua contando)
// ou exclui. Puro: quem grava é a tela (savePlatform, com allowShrink só
// quando exclui).
export const ROLLOVER_SOURCE_LABELS = Object.freeze({
  check: 'conferência de saldo',
  session: 'conferência da sessão',
  batch: 'conferência em lote',
  manual: 'lançado à mão'
});

/** [{ kind:'aumento'|'abatido', entry, dayKey, value, ignored }] mais novo primeiro. */
export function listRolloverEntries(platform, loKey = null, hiKey = null) {
  const out = [];
  const add = (list, kind) => (Array.isArray(list) ? list : []).forEach(e => {
    if (!e || !e.date) return;
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return;
    const k = toLocalDateString(d);
    if (loKey && k < loKey) return;
    if (hiKey && k > hiKey) return;
    out.push({ kind, entry: e, dayKey: k, value: r2(e.value), ignored: e.statsIgnored === true, t: d.getTime() });
  });
  add(platform && platform.rolloverIncreases, 'aumento');
  add(platform && platform.rolloverAdjustments, 'abatido');
  return out.sort((a, b) => b.t - a.t);
}

/** Marca (ignored=true) ou desmarca os itens. Devolve quantos mudaram. */
export function setRolloverEntriesIgnored(items, ignored, now = new Date()) {
  let n = 0;
  (items || []).forEach(it => {
    const e = it && it.entry;
    if (!e) return;
    if (ignored) {
      if (e.statsIgnored === true) return;
      e.statsIgnored = true;
      e.statsIgnoredAt = now.toISOString();
      n++;
    } else if (e.statsIgnored === true) {
      delete e.statsIgnored;
      delete e.statsIgnoredAt;
      n++;
    }
  });
  return n;
}

/** Exclui os itens. Devolve a lista de campos que encolheram (allowShrink). */
export function removeRolloverEntries(platform, items) {
  const shrink = new Set();
  (items || []).forEach(it => {
    if (!it || !it.entry) return;
    if (it.kind === 'aumento' && removeRolloverIncrease(platform, it.entry)) shrink.add('rolloverIncreases');
    if (it.kind === 'abatido' && removeRolloverAdjustment(platform, it.entry)) shrink.add('rolloverAdjustments');
  });
  return [...shrink];
}

/** (37) Remove um aumento. true se removeu. */
export function removeRolloverIncrease(platform, entry) {
  const list = Array.isArray(platform.rolloverIncreases) ? platform.rolloverIncreases : [];
  const idx = list.indexOf(entry);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/** Remove um abatimento. true se removeu. */
export function removeRolloverAdjustment(platform, entry) {
  const list = Array.isArray(platform.rolloverAdjustments) ? platform.rolloverAdjustments : [];
  const idx = list.indexOf(entry);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/**
 * Rollover que o sistema tem NO INSTANTE `at` (computeRolloverAt) depois de
 * `mutate(copia)` — sem mexer na plataforma de verdade (cópia profunda).
 * É esse o número comparável ao que a plataforma mostra agora.
 */
export function previewRollover(platform, ctx = {}, at = new Date(), mutate = null) {
  const copy = JSON.parse(JSON.stringify(platform));
  if (typeof mutate === 'function') mutate(copy);
  return r2(computeRolloverAt(copy, at, ctx));
}

/**
 * Decide o abatimento a partir do rollover do sistema (`systemRollover`,
 * já com as mudanças da tela) e do que o usuário informou:
 *   { abated } ou { real } (números; NaN/undefined = vazio).
 * Devolve { kind:'none'|'abate'|'above'|'match'|'error', value, after, error }.
 */
export function planRolloverTarget(systemRollover, { abated, real } = {}) {
  const sys = r2(systemRollover);
  const hasAbated = Number.isFinite(abated);
  const hasReal = Number.isFinite(real);
  if (!hasAbated && !hasReal) return { kind: 'none', value: 0, after: sys };
  if (hasAbated) {
    const v = r2(abated);
    if (!(v > 0)) return { kind: 'error', error: 'O valor abatido precisa ser maior que zero.', value: 0, after: sys };
    if (v > sys + ROLLOVER_TOLERANCE) return { kind: 'error', error: `O abatimento (${fmtBR(v)}) passa do rollover do sistema (${fmtBR(sys)}).`, value: 0, after: sys };
    const val = r2(Math.min(v, sys));
    return { kind: 'abate', value: val, after: r2(sys - val) };
  }
  const rr = r2(real);
  if (rr < 0) return { kind: 'error', error: 'O rollover não pode ser negativo.', value: 0, after: sys };
  const diff = r2(sys - rr);
  if (Math.abs(diff) <= ROLLOVER_TOLERANCE) return { kind: 'match', value: 0, after: sys };
  if (diff > 0) return { kind: 'abate', value: diff, after: rr };
  // (37) acima do sistema: diferença + pergunta (Aumento ou R do bônus)
  return {
    kind: 'above',
    value: r2(-diff),
    after: rr,
    error: `O valor do rollover está ${fmtBR(-diff)} acima do sistema (${fmtBR(sys)} → ${fmtBR(rr)}). A plataforma multiplicou o rollover do bônus ou aumentou desde a última conferência?`
  };
}

function fmtBR(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
