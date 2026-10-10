// === PLANEJADOR — camada de dados (View Gráficos → Planejador — Sub 5) ===
// Duas coleções isoladas, FORA do documento das plataformas (nada aqui
// toca platforms, normalizePlatformData nem savePlatform):
//
//   users/{uid}/betPlans/{platformId}
//     1 plano por plataforma (decisão do usuário): o id do documento É o id
//     da plataforma — salvar um plano novo substitui o anterior (a tela
//     pede confirmação antes).
//     { platformId, platformName, createdAt, updatedAt, params, totals, days[] }
//
//   users/{uid}/plannerConfig/palette
//     { stakes:[R$], buyMultipliers:[n], updatedAt } — paleta de valores.
//     Sem documento: vale a paleta inicial (DEFAULT_STAKES), só em memória.
//
//   users/{uid}/plannerConfig/settings   (Sub-entrega 5b)
//     { cautionThreshold: R$, updatedAt } — limite da "semana de cautela".
//     Sem documento: vale DEFAULT_CAUTION_THRESHOLD (R$ 500), só em memória.
//
//   users/{uid}/plannerConfig/strategy   (Sub-entrega 7b — aba Misterioso)
//     { budget: R$, budgetMode: 'cycle'|'month', betDepositMonthlyLimit: R$,
//       updatedAt } — orçamento do Misterioso e limite mensal (contenção) dos
//     🎲 Depósitos de Aposta. Documento SEPARADO de propósito: gravar um
//     nunca apaga o campo do outro (cada batch.set grava o documento inteiro).
//     Sem documento: DEFAULT_STRATEGY_SETTINGS (tudo zero = não configurado).
//
//   users/{uid}/plannerConfig/calendar   (Sub-entrega 8b — aba Calendário)
//     { partialThreshold: % (1..99), retentionDays: 90|180|365|0, updatedAt }
//     — limite do 🟡 (parcial) e prazo do histórico do planejado (planLog).
//     Sem documento: 50% e 180 dias.
//
//   users/{uid}/plannerConfig/speed   (Sub-entrega 11a — Velocidade)
//     { platforms: { [platformId]: { base, epochs:[{id,label,from,to,mult}] } },
//       updatedAt } — peso de investimento por plataforma e épocas
//     (speed-logic.js). Sem documento: todas ×1.
//
//   users/{uid}/plannerConfig/newPlatforms   (Sub-entrega 11b)
//     Reserva pra ativar plataformas AINDA NÃO cadastradas (orçamento
//     separado do Misterioso) — newplatform-logic.js. Sem documento:
//     desligado.
//
// (8b) ANTES de substituir ou excluir um plano, os dias que já passaram do
// plano antigo são gravados no histórico (plan-log-store.js). Se isso
// falhar, o plano NÃO é substituído/excluído — nunca perde o planejado.
//
// LEITURA: loadPlannerData LANÇA em falha (a tela mostra o motivo e
// "Tentar de novo" e NÃO deixa salvar — nunca grava em cima do que não viu).
// Documento inválido é ignorado e contado em `invalidPlans`.
//
// GRAVAÇÃO: writeBatch/deleteDoc de firebase-init.js (SAFE_MODE vale).
// NÃO otimista: a memória só muda depois do commit confirmar.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import {
  DEFAULT_STAKES, DEFAULT_BUY_MULTIPLIERS, PLAN_MAX_DAYS, DEFAULT_CAUTION_THRESHOLD,
  normalizeStakes, normalizeMultipliers, fromCents
} from './plan-logic.js';
import { DEFAULT_STRATEGY_SETTINGS, sanitizeStrategySettings, STRATEGY_MONEY_MAX } from './strategy-logic.js';
import { toLocalDateString } from './finance-logic.js';
import { sanitizeSpeedConfig, priorityResolver } from './speed-logic.js';
import { sanitizeNewPlatformsConfig } from './newplatform-logic.js';
import { logPlanPastDays, DEFAULT_PLAN_LOG_RETENTION, PLAN_LOG_RETENTION_OPTIONS } from './plan-log-store.js';

const PALETTE_ID = 'palette';
const SETTINGS_ID = 'settings';
const STRATEGY_ID = 'strategy';
const CALENDAR_ID = 'calendar';
const SPEED_ID = 'speed';
const NEWPLAT_ID = 'newPlatforms';
export const DEFAULT_CALENDAR_SETTINGS = Object.freeze({ partialThreshold: 50, retentionDays: DEFAULT_PLAN_LOG_RETENTION });

export function sanitizeCalendarSettings(src) {
  const s = src && typeof src === 'object' ? src : {};
  const t = Math.round(Number(s.partialThreshold));
  const r = Number(s.retentionDays);
  return {
    partialThreshold: Number.isFinite(t) && t >= 1 && t <= 99 ? t : DEFAULT_CALENDAR_SETTINGS.partialThreshold,
    retentionDays: PLAN_LOG_RETENTION_OPTIONS.includes(r) ? r : DEFAULT_CALENDAR_SETTINGS.retentionDays
  };
}

// { uid, plans: Map<platformId, doc>, palette:{stakes, buyMultipliers, saved}, invalidPlans }
let cache = null;

function plansCol(uid) {
  return collection(db, 'users', uid, 'betPlans');
}

function configCol(uid) {
  return collection(db, 'users', uid, 'plannerConfig');
}

function isSafeId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && !id.includes('/') && id !== '.' && id !== '..';
}

function isValidPlanDoc(id, data) {
  return !!data && data.platformId === id
    && data.params && typeof data.params === 'object'
    && Array.isArray(data.days) && data.days.length > 0 && data.days.length <= PLAN_MAX_DAYS
    && data.days.every(d => d && typeof d.key === 'string' && Number.isFinite(d.plannedC) && Array.isArray(d.lines));
}

function paletteFrom(data) {
  const stakes = normalizeStakes(data && data.stakes).map(fromCents);
  const buyMultipliers = normalizeMultipliers(data && data.buyMultipliers);
  return {
    stakes: stakes.length ? stakes : DEFAULT_STAKES.slice(),
    buyMultipliers: buyMultipliers.length ? buyMultipliers : DEFAULT_BUY_MULTIPLIERS.slice()
  };
}

/**
 * Lê planos + paleta. LANÇA erro em falha de leitura.
 */
export async function loadPlannerData(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const [plansSnap, configSnap] = await Promise.all([getDocs(plansCol(uid)), getDocs(configCol(uid))]);

  const plans = new Map();
  let invalidPlans = 0;
  plansSnap.docs.forEach(d => {
    const data = d.data();
    if (isValidPlanDoc(d.id, data)) plans.set(d.id, data);
    else {
      invalidPlans++;
      console.error(`Plano de apostas "${d.id}" ignorado (dados inválidos).`);
    }
  });

  const paletteDoc = configSnap.docs.find(d => d.id === PALETTE_ID);
  const palette = { ...paletteFrom(paletteDoc ? paletteDoc.data() : null), saved: !!paletteDoc };

  const settingsDoc = configSnap.docs.find(d => d.id === SETTINGS_ID);
  const rawThreshold = settingsDoc ? Number((settingsDoc.data() || {}).cautionThreshold) : NaN;
  const settings = {
    cautionThreshold: Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : DEFAULT_CAUTION_THRESHOLD,
    saved: !!settingsDoc
  };

  // (7b) Estratégia do Misterioso / contenção.
  const strategyDoc = configSnap.docs.find(d => d.id === STRATEGY_ID);
  const strategy = {
    ...sanitizeStrategySettings(strategyDoc ? strategyDoc.data() : DEFAULT_STRATEGY_SETTINGS),
    saved: !!strategyDoc,
    updatedAt: strategyDoc && typeof (strategyDoc.data() || {}).updatedAt === 'string' ? strategyDoc.data().updatedAt : null
  };

  // (8b) Calendário: limite do 🟡 e prazo do histórico.
  const calendarDoc = configSnap.docs.find(d => d.id === CALENDAR_ID);
  const calendar = { ...sanitizeCalendarSettings(calendarDoc ? calendarDoc.data() : null), saved: !!calendarDoc };

  // (11a) Velocidade / épocas.
  const speedDoc = configSnap.docs.find(d => d.id === SPEED_ID);
  const speed = { ...sanitizeSpeedConfig(speedDoc ? speedDoc.data() : null), saved: !!speedDoc };

  // (11b) Novas plataformas.
  const npDoc = configSnap.docs.find(d => d.id === NEWPLAT_ID);
  const newPlatforms = { ...sanitizeNewPlatformsConfig(npDoc ? npDoc.data() : null, toLocalDateString(new Date())), saved: !!npDoc };

  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, plans, palette, settings, strategy, calendar, speed, newPlatforms, invalidPlans };
  return cache;
}

export function isPlannerLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getSavedPlan(platformId) {
  return cache && cache.plans.has(platformId) ? cache.plans.get(platformId) : null;
}

export function getSavedPlanIds() {
  return cache ? [...cache.plans.keys()] : [];
}

export function getPalette() {
  return cache ? { ...cache.palette, stakes: cache.palette.stakes.slice(), buyMultipliers: cache.palette.buyMultipliers.slice() }
    : { stakes: DEFAULT_STAKES.slice(), buyMultipliers: DEFAULT_BUY_MULTIPLIERS.slice(), saved: false };
}

export function getInvalidPlanCount() {
  return cache ? cache.invalidPlans : 0;
}

/**
 * Grava (substitui) o plano da plataforma. Espera o commit.
 * planDoc vem pronto de planToDoc (plan-logic.js). Mantém createdAt do
 * plano anterior só se ele for da mesma plataforma (substituição).
 */
export async function savePlan(uid, planDoc) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela antes de salvar.' };
  if (!planDoc || !isSafeId(planDoc.platformId)) return { ok: false, error: 'Plano inválido.' };
  if (!isValidPlanDoc(planDoc.platformId, planDoc)) return { ok: false, error: 'Plano inválido (sem dias ou longo demais).' };

  const toWrite = { ...planDoc };
  // (8b) Guarda os dias passados do plano que vai ser substituído.
  const previous = cache.plans.get(planDoc.platformId);
  if (previous) {
    const logged = await logPlanPastDays(uid, [previous], toLocalDateString(new Date()), getCalendarSettings().retentionDays);
    if (!logged.ok) return { ok: false, error: `${logged.error} O plano não foi substituído.` };
  }
  try {
    const batch = writeBatch(db);
    batch.set(doc(plansCol(uid), planDoc.platformId), toWrite);
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar plano de apostas:', err);
    return { ok: false, error: 'Não foi possível salvar o plano no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.plans.set(planDoc.platformId, toWrite);
  return { ok: true };
}

export async function deletePlan(uid, platformId) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  if (!isSafeId(platformId)) return { ok: false, error: 'Plano inválido.' };
  // (8b) Guarda os dias passados antes de excluir.
  const previous = cache.plans.get(platformId);
  if (previous) {
    const logged = await logPlanPastDays(uid, [previous], toLocalDateString(new Date()), getCalendarSettings().retentionDays);
    if (!logged.ok) return { ok: false, error: `${logged.error} O plano não foi excluído.` };
  }
  try {
    await deleteDoc(doc(plansCol(uid), platformId));
  } catch (err) {
    console.error('Erro ao excluir plano de apostas:', err);
    return { ok: false, error: 'Não foi possível excluir o plano no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.plans.delete(platformId);
  return { ok: true };
}

/**
 * Grava a paleta. stakes em R$, buyMultipliers inteiros (2..1000).
 */
export async function savePalette(uid, stakes, buyMultipliers) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'A paleta ainda não foi carregada — recarregue a tela.' };
  const cleanStakes = normalizeStakes(stakes).map(fromCents);
  const cleanMult = normalizeMultipliers(buyMultipliers);
  if (cleanStakes.length === 0) return { ok: false, error: 'Informe pelo menos um valor de aposta.' };
  if (cleanStakes.length > 40) return { ok: false, error: 'Máximo de 40 valores na paleta.' };
  if (cleanMult.length > 20) return { ok: false, error: 'Máximo de 20 multiplicadores.' };

  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), PALETTE_ID), {
      stakes: cleanStakes,
      buyMultipliers: cleanMult,
      updatedAt: new Date().toISOString()
    });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar a paleta do Planejador:', err);
    return { ok: false, error: 'Não foi possível salvar a paleta no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.palette = { stakes: cleanStakes, buyMultipliers: cleanMult.length ? cleanMult : DEFAULT_BUY_MULTIPLIERS.slice(), saved: true };
  return { ok: true };
}

// (Sub-entrega 5b) Configurações do Planejador.
export function getPlannerSettings() {
  return cache ? { ...cache.settings } : { cautionThreshold: DEFAULT_CAUTION_THRESHOLD, saved: false };
}

export async function savePlannerSettings(uid, { cautionThreshold }) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  const v = Math.round(Number(cautionThreshold) * 100) / 100;
  if (!Number.isFinite(v) || v < 0 || v > 1e7) return { ok: false, error: 'Limite inválido.' };
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), SETTINGS_ID), { cautionThreshold: v, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar as configurações do Planejador:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.settings = { cautionThreshold: v, saved: true };
  return { ok: true };
}

// ============================================================
// (Sub-entrega 7b) ESTRATÉGIA DO MISTERIOSO / CONTENÇÃO
// ============================================================

export function getStrategySettings() {
  return cache && cache.strategy
    ? { ...cache.strategy }
    : { ...DEFAULT_STRATEGY_SETTINGS, saved: false, updatedAt: null };
}

/**
 * Grava orçamento/modo/limite. Recebe só os campos que mudam — o resto vem
 * do que já está salvo (o documento é sempre gravado completo). Espera o
 * commit; a memória só muda depois.
 */
export async function saveStrategySettings(uid, patch) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  const p = patch && typeof patch === 'object' ? patch : {};
  for (const field of ['budget', 'betDepositMonthlyLimit']) {
    if (field in p) {
      const v = Number(p[field]);
      if (!Number.isFinite(v) || v < 0 || v > STRATEGY_MONEY_MAX) return { ok: false, error: 'Valor inválido.' };
    }
  }
  if ('budgetMode' in p && !['cycle', 'month'].includes(p.budgetMode)) return { ok: false, error: 'Modo do orçamento inválido.' };

  const current = getStrategySettings();
  const next = sanitizeStrategySettings({ ...current, ...p });
  const updatedAt = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), STRATEGY_ID), { ...next, updatedAt });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar a estratégia do Misterioso:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.strategy = { ...next, saved: true, updatedAt };
  return { ok: true };
}

// ============================================================
// (Sub-entrega 8b) CALENDÁRIO
// ============================================================

export function getCalendarSettings() {
  return cache && cache.calendar ? { ...cache.calendar } : { ...DEFAULT_CALENDAR_SETTINGS, saved: false };
}

export function getSavedPlans() {
  return cache ? [...cache.plans.values()] : [];
}

export async function saveCalendarSettings(uid, patch) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  const p = patch && typeof patch === 'object' ? patch : {};
  if ('partialThreshold' in p) {
    const t = Math.round(Number(p.partialThreshold));
    if (!(t >= 1 && t <= 99)) return { ok: false, error: 'O limite do parcial precisa ser de 1% a 99%.' };
  }
  if ('retentionDays' in p && !PLAN_LOG_RETENTION_OPTIONS.includes(Number(p.retentionDays))) {
    return { ok: false, error: 'Prazo inválido.' };
  }
  const next = sanitizeCalendarSettings({ ...getCalendarSettings(), ...p });
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), CALENDAR_ID), { ...next, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar as configurações do Calendário:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.calendar = { ...next, saved: true };
  return { ok: true };
}

// ---------- (Sub-entrega 11a) Velocidade / épocas ----------

export function getSpeedConfig() {
  const sp = cache && cache.speed ? cache.speed : { platforms: {} };
  return sanitizeSpeedConfig(sp);
}

/** Prioridade de hoje por plataforma (otimizador do Misterioso). */
export function getStrategyPriority(now = new Date()) {
  return priorityResolver(getSpeedConfig(), toLocalDateString(now));
}

/** Grava a velocidade de UMA plataforma (o resto do documento é mantido). */
export async function savePlatformSpeed(uid, platformId, speed) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  if (!isSafeId(platformId)) return { ok: false, error: 'Plataforma inválida.' };
  const cur = getSpeedConfig();
  const next = sanitizeSpeedConfig({ platforms: { ...cur.platforms, [platformId]: speed } });
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), SPEED_ID), { platforms: next.platforms, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar a velocidade:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.speed = { ...next, saved: true };
  return { ok: true };
}

// ---------- (Sub-entrega 11b) Novas plataformas ----------

export function getNewPlatformsConfig() {
  const today = toLocalDateString(new Date());
  return cache && cache.newPlatforms ? sanitizeNewPlatformsConfig(cache.newPlatforms, today) : sanitizeNewPlatformsConfig(null, today);
}

export async function saveNewPlatformsConfig(uid, cfg) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  const next = sanitizeNewPlatformsConfig(cfg, toLocalDateString(new Date()));
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), NEWPLAT_ID), { ...next, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar novas plataformas:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.newPlatforms = { ...next, saved: true };
  return { ok: true };
}
