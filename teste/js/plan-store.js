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
//   users/{uid}/plannerConfig/stopReasons   (Sub-entrega 31)
//     { reasons:[{id:'c_…', emoji, label, kind, createdAt}],
//       kinds:[{id:'k_…', emoji, label, createdAt}], updatedAt } —
//     motivos e tipos do 🏁 criados pelo usuário (stop-reasons.js). Sem
//     documento: só os fixos.
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
// (Sub-entrega 19) saveGroupPlans/deleteGroupPlans: plano de GRUPO —
// continua 1 documento por plataforma (params.group marca o grupo), mas
// todos gravados/excluídos num ÚNICO lote (tudo ou nada).
//
// (Sub-entrega 24) CONGELA HOJE: ao substituir um plano por outro que NÃO
// tem o dia de hoje (refeito a partir de amanhã — "Recalcular" ou
// "🔄 Atualizar planos"), o dia de hoje do plano antigo também vai pro
// histórico (planLog), junto com os passados — a meta de hoje continua no
// Calendário. savePlansBatch: vários planos (individuais e de grupos) num
// ÚNICO lote, mesmo protocolo do saveGroupPlans (tudo ou nada).
//
// (Sub-entrega 25) 🙈 Troca de tipo de plano (individual ↔ grupo) e
// excluir: opção de mandar os dias do plano antigo pro histórico já
// IGNORADOS (fora das contas) — mesmo protocolo: histórico primeiro; falhou,
// nada é gravado.
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
import {
  logPlanPastDays, DEFAULT_PLAN_LOG_RETENTION, PLAN_LOG_RETENTION_OPTIONS,
  prepareStopTodayOps, prepareUndoStopOps, addPlanLogOpsToBatch, applyPlanLogOps
} from './plan-log-store.js';
import { sanitizeCustomStopReasons, sanitizeCustomStopKinds, CUSTOM_STOP_REASON_MAX, CUSTOM_STOP_KIND_MAX } from './stop-reasons.js';

const PALETTE_ID = 'palette';
const SETTINGS_ID = 'settings';
const STRATEGY_ID = 'strategy';
const CALENDAR_ID = 'calendar';
const SPEED_ID = 'speed';
const NEWPLAT_ID = 'newPlatforms';
const STOP_REASONS_ID = 'stopReasons'; // (31)
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

  // (31) Motivos do 🏁 criados pelo usuário.
  const srDoc = configSnap.docs.find(d => d.id === STOP_REASONS_ID);
  const stopKinds = sanitizeCustomStopKinds(srDoc ? (srDoc.data() || {}).kinds : []);
  const stopReasons = sanitizeCustomStopReasons(srDoc ? (srDoc.data() || {}).reasons : [], stopKinds);

  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, plans, palette, settings, strategy, calendar, speed, newPlatforms, stopReasons, stopKinds, invalidPlans };
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
// (24) Plataformas cujo dia de HOJE precisa ser congelado: o plano antigo
// tem hoje e o novo não.
function todayFreezeIds(docs, todayKey) {
  const out = new Set();
  docs.forEach(d => {
    const prev = cache.plans.get(d.platformId);
    if (!prev || !Array.isArray(prev.days) || !prev.days.some(x => x && x.key === todayKey)) return;
    if (Array.isArray(d.days) && d.days.some(x => x && x.key === todayKey)) return;
    out.add(d.platformId);
  });
  return out;
}

// (25) opts.ignorePast: os dias do plano ANTIGO vão pro histórico já 🙈
// ignorados (troca de tipo de plano — individual ↔ grupo).
export async function savePlan(uid, planDoc, opts = {}) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela antes de salvar.' };
  if (!planDoc || !isSafeId(planDoc.platformId)) return { ok: false, error: 'Plano inválido.' };
  if (!isValidPlanDoc(planDoc.platformId, planDoc)) return { ok: false, error: 'Plano inválido (sem dias ou longo demais).' };

  const toWrite = { ...planDoc };
  // (8b) Guarda os dias passados do plano que vai ser substituído.
  const previous = cache.plans.get(planDoc.platformId);
  if (previous) {
    const today = toLocalDateString(new Date());
    const logged = await logPlanPastDays(uid, [previous], today, getCalendarSettings().retentionDays, {
      includeTodayFor: todayFreezeIds([planDoc], today),
      ignoreFor: opts.ignorePast ? [planDoc.platformId] : []
    });
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

// (25) opts.ignorePast: os dias passados do plano excluído ficam 🙈 ignorados.
export async function deletePlan(uid, platformId, opts = {}) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  if (!isSafeId(platformId)) return { ok: false, error: 'Plano inválido.' };
  // (8b) Guarda os dias passados antes de excluir.
  const previous = cache.plans.get(platformId);
  if (previous) {
    const logged = await logPlanPastDays(uid, [previous], toLocalDateString(new Date()), getCalendarSettings().retentionDays, { ignoreFor: opts.ignorePast ? [platformId] : [] });
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

// ============================================================
// (Sub-entrega 19) PLANO DE GRUPO — gravação ÚNICA (tudo ou nada)
// ============================================================
// 1) confere todos os documentos; 2) guarda no histórico (planLog) os dias
// passados dos planos que vão ser substituídos/excluídos — falhou, NADA é
// gravado; 3) um writeBatch só com todos os set/delete (máx. 300 < 500 do
// Firestore). A memória só muda depois do commit.

// (25) opts.ignoreFor: plataformas cujo plano ANTIGO (de outro tipo) fica 🙈.
export async function saveGroupPlans(uid, planDocs, opts = {}) {
  return saveManyPlans(uid, planDocs, 'grupo', opts);
}

// (24) 🔄 Atualizar planos: individuais + grupos num lote só.
// (29) opts.stopFor: { [platformId]: stop } — 🏁 o dia de hoje encerrado.
export async function savePlansBatch(uid, planDocs, opts = {}) {
  return saveManyPlans(uid, planDocs, 'lote', opts);
}

async function saveManyPlans(uid, planDocs, kind, opts = {}) {
  const what = kind === 'grupo' ? 'o plano do grupo' : 'os planos';
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela antes de salvar.' };
  const docs = Array.isArray(planDocs) ? planDocs : [];
  if (docs.length === 0) return { ok: false, error: 'Nenhum plano pra salvar.' };
  if (docs.length > 300) return { ok: false, error: kind === 'grupo' ? 'Plataformas demais no grupo.' : 'Planos demais de uma vez (máximo 300).' };
  const ids = new Set();
  for (const d of docs) {
    if (!d || !isSafeId(d.platformId) || !isValidPlanDoc(d.platformId, d)) return { ok: false, error: `Plano inválido (${d && d.platformName ? d.platformName : 'plataforma'}). Nada foi salvo.` };
    if (ids.has(d.platformId)) return { ok: false, error: `Plataforma repetida ${kind === 'grupo' ? 'no grupo' : 'no lote'}. Nada foi salvo.` };
    ids.add(d.platformId);
  }
  // (29b) 🏁 de plataforma cujo plano NÃO vai ser trocado (ficou como está):
  // só o dia de hoje vai pro histórico, encerrado.
  const extraStop = Object.keys(opts.stopFor || {}).filter(pid => !ids.has(pid)).map(pid => cache.plans.get(pid)).filter(Boolean);
  const previous = [...docs.map(d => cache.plans.get(d.platformId)).filter(Boolean), ...extraStop];
  if (previous.length) {
    const today = toLocalDateString(new Date());
    const logged = await logPlanPastDays(uid, previous, today, getCalendarSettings().retentionDays, { includeTodayFor: todayFreezeIds(docs, today), ignoreFor: opts.ignoreFor || [], stopFor: opts.stopFor || null });
    if (!logged.ok) return { ok: false, error: `${logged.error} Nenhum plano foi substituído.` };
  }
  try {
    const batch = writeBatch(db);
    docs.forEach(d => batch.set(doc(plansCol(uid), d.platformId), { ...d }));
    await batch.commit();
  } catch (err) {
    console.error(`Erro ao salvar ${what}:`, err);
    return { ok: false, error: `Não foi possível salvar ${what} no banco de dados. Nada mudou. Verifique a internet e tente de novo.` };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  docs.forEach(d => cache.plans.set(d.platformId, { ...d }));
  return { ok: true, saved: docs.length };
}

// (29b) 🏁 só o dia de hoje (o plano não muda): { [platformId]: stop }.
// Grava/atualiza o documento de hoje do histórico; nada mais é tocado.
export async function stopTodayOnly(uid, stopFor) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  const plans = Object.keys(stopFor || {}).filter(isSafeId).map(pid => cache.plans.get(pid)).filter(Boolean);
  if (!plans.length) return { ok: false, error: 'Nenhum plano pra encerrar hoje.' };
  const today = toLocalDateString(new Date());
  const logged = await logPlanPastDays(uid, plans, today, getCalendarSettings().retentionDays, { stopFor });
  if (!logged.ok) return { ok: false, error: `${logged.error} Hoje não foi encerrado.` };
  return { ok: true, stopped: logged.stopped || 0 };
}

// ============================================================
// (Sub-entrega 32) 🏁 NO PRÓPRIO LUGAR (Calendário) — sem o Planejador
// ============================================================
// Grava NUM writeBatch só (tudo ou nada): o 🏁 no histórico de hoje
// (planLog) + o plano de cada plataforma com o resto de hoje somado nos
// próximos dias (newDoc). newDoc null = só encerra hoje (plano sem dia
// depois de hoje, resto menor que 1 giro...). O Rollover e as OUTRAS
// plataformas (mesmo do grupo) não são tocados. Memória só depois do commit.

/**
 * items: [{ platformId, stop, newDoc|null }]
 * @returns {Promise<{ok:true} | {ok:false, error, already?, missing?}>}
 */
export async function stopTodayInPlace(uid, items) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { ok: false, error: 'Nenhuma plataforma marcada.' };
  if (list.length > 150) return { ok: false, error: 'Plataformas demais de uma vez (máximo 150).' };
  const seen = new Set();
  for (const it of list) {
    if (!it || !isSafeId(it.platformId) || seen.has(it.platformId)) return { ok: false, error: 'Plataforma inválida ou repetida. Nada foi gravado.' };
    seen.add(it.platformId);
    if (it.newDoc && (!cache.plans.has(it.platformId) || !isValidPlanDoc(it.platformId, it.newDoc))) {
      return { ok: false, error: 'Plano inválido. Nada foi gravado.' };
    }
  }
  const today = toLocalDateString(new Date());
  const prep = await prepareStopTodayOps(uid, list.map(it => ({
    platformId: it.platformId, plan: cache.plans.get(it.platformId) || null, stop: it.stop
  })), today);
  if (!prep.ok) return prep;
  try {
    const batch = writeBatch(db);
    addPlanLogOpsToBatch(batch, uid, prep.ops);
    list.forEach(it => { if (it.newDoc) batch.set(doc(plansCol(uid), it.platformId), { ...it.newDoc }); });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao encerrar o dia:', err);
    return { ok: false, error: 'Não foi possível gravar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  applyPlanLogOps(uid, prep.ops);
  list.forEach(it => { if (it.newDoc) cache.plans.set(it.platformId, { ...it.newDoc }); });
  return { ok: true };
}

/**
 * ↩️ Desfazer o 🏁 de hoje: o stop fica com undone:true e o plano volta
 * (restoredDoc, ou null se não havia nada a devolver) — num lote só.
 * @returns {Promise<{ok:true} | {ok:false, error}>}
 */
export async function undoStopTodayInPlace(uid, platformId, restoredDoc) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  if (!isSafeId(platformId)) return { ok: false, error: 'Plataforma inválida.' };
  if (restoredDoc && (!cache.plans.has(platformId) || !isValidPlanDoc(platformId, restoredDoc))) return { ok: false, error: 'Plano inválido. Nada foi alterado.' };
  const today = toLocalDateString(new Date());
  const prep = await prepareUndoStopOps(uid, [platformId], today);
  if (!prep.ok) return prep;
  try {
    const batch = writeBatch(db);
    addPlanLogOpsToBatch(batch, uid, prep.ops);
    if (restoredDoc) batch.set(doc(plansCol(uid), platformId), { ...restoredDoc });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao desfazer o 🏁:', err);
    return { ok: false, error: 'Não foi possível gravar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  applyPlanLogOps(uid, prep.ops);
  if (restoredDoc) cache.plans.set(platformId, { ...restoredDoc });
  return { ok: true };
}

// (25) opts.ignorePast: os dias passados dos planos excluídos ficam 🙈 ignorados.
export async function deleteGroupPlans(uid, platformIds, opts = {}) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'Os planos ainda não foram carregados — recarregue a tela.' };
  const ids = [...new Set((platformIds || []).filter(isSafeId))].filter(id => cache.plans.has(id));
  if (ids.length === 0) return { ok: true, deleted: 0 };
  if (ids.length > 300) return { ok: false, error: 'Plataformas demais.' };
  const previous = ids.map(id => cache.plans.get(id));
  const logged = await logPlanPastDays(uid, previous, toLocalDateString(new Date()), getCalendarSettings().retentionDays, { ignoreFor: opts.ignorePast ? ids : [] });
  if (!logged.ok) return { ok: false, error: `${logged.error} Nenhum plano foi excluído.` };
  try {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(plansCol(uid), id)));
    await batch.commit();
  } catch (err) {
    console.error('Erro ao excluir o plano do grupo:', err);
    return { ok: false, error: 'Não foi possível excluir o plano do grupo no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  ids.forEach(id => cache.plans.delete(id));
  return { ok: true, deleted: ids.length };
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

// ---------- (Sub-entrega 31) Motivos do 🏁 ----------

export function getCustomStopReasons() {
  return cache && Array.isArray(cache.stopReasons) ? cache.stopReasons.map(r => ({ ...r })) : [];
}

export function getCustomStopKinds() {
  return cache && Array.isArray(cache.stopKinds) ? cache.stopKinds.map(k => ({ ...k })) : [];
}

/**
 * Grava as listas INTEIRAS (criar/editar/excluir motivos e tipos) num
 * documento só — motivos e tipos sempre juntos e coerentes. Não otimista.
 * kinds omitido = mantém os tipos atuais.
 */
export async function saveCustomStopReasons(uid, list, kindsList = null) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlannerLoaded(uid)) return { ok: false, error: 'As configurações ainda não foram carregadas — recarregue a tela.' };
  const raw = Array.isArray(list) ? list : [];
  const rawKinds = Array.isArray(kindsList) ? kindsList : getCustomStopKinds();
  if (raw.length > CUSTOM_STOP_REASON_MAX) return { ok: false, error: `No máximo ${CUSTOM_STOP_REASON_MAX} motivos criados.` };
  if (rawKinds.length > CUSTOM_STOP_KIND_MAX) return { ok: false, error: `No máximo ${CUSTOM_STOP_KIND_MAX} tipos criados.` };
  const kinds = sanitizeCustomStopKinds(rawKinds);
  if (kinds.length !== rawKinds.length) return { ok: false, error: 'Tipo inválido (o nome é obrigatório). Nada foi salvo.' };
  const next = sanitizeCustomStopReasons(raw, kinds);
  if (next.length !== raw.length) return { ok: false, error: 'Motivo inválido (o nome é obrigatório). Nada foi salvo.' };
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), STOP_REASONS_ID), { reasons: next, kinds, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar os motivos do 🏁:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.stopReasons = next;
  cache.stopKinds = kinds;
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
