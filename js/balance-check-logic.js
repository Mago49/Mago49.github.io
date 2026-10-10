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

import {
  computeLiveBalance, getWeekStart, getWeekEnd, toLocalDateString, isCurrentWeekClosed, roundMoney
} from './finance-logic.js';
import { getExpectedBonusBreakdownForDate, getEffectiveOtherBonusEntries, isFixedOtherBonus } from './bonus-ledger-logic.js';

const r2 = roundMoney;

export const BALANCE_TOLERANCE = 0.01;
export const BALANCE_MAX = 100000000;

export const BONUS_TYPE_LABELS = Object.freeze({
  vipDaily: 'VIP diário',
  vipWeekly: 'VIP semanal',
  vipMonthly: 'VIP mensal',
  obrigado: 'Obrigado',
  misterioso: 'Misterioso',
  avulso: 'Avulso'
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
  const expected = r2(live + (Number(pendingRB) || 0));
  const diff = r2(real - expected);
  const kind = Math.abs(diff) <= BALANCE_TOLERANCE ? 'match' : (diff > 0 ? 'over' : 'under');
  return { real, expected, live, pendingRB: r2(pendingRB), diff, kind };
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
  const s = Math.max(1, Math.round(Number(scale) || 1));
  const value = r2(gap.diff);
  const check = pushCheck(platform, gap, now, { resolution: 'bonus', bonusValue: value, scale: s });
  // (Sub-entrega 9) aposta com dia/hora informados: o avulso entra 1 s
  // antes DELA (nunca depois de agora).
  const anchor = before && !isNaN(new Date(before).getTime()) ? Math.min(new Date(before).getTime(), now.getTime()) : now.getTime();
  const at = new Date(anchor - 1000).toISOString();
  if (!Array.isArray(platform.otherBonusLog)) platform.otherBonusLog = [];
  platform.otherBonusLog.push({
    date: at,
    rawValue: value,
    scale: s,
    rolloverValue: r2(value * s),
    source: 'balance-check',
    checkId: check.id,
    createdAt: now.toISOString()
  });
  return check;
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
      if (v > 0) items.push({ id: `f|${key}|${type}`, kind: 'formula', dayKey: key, type, value: v, sortKey: `${key}T00:00:00` });
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
