// === HISTÓRICO DO PLANEJADO (planLog) — Sub-entrega 8b ===
// users/{uid}/planLog/{AAAA-MM-DD}_{platformId}
//   { date, platformId, platformName, plannedC, targetC, tier, createdAt }
//
// POR QUE EXISTE: o plano é 1 por plataforma e "Salvar"/"Recalcular" o
// SUBSTITUI — o planejado dos dias que já passaram sumia do banco, e o
// Calendário não teria com o que comparar o real. Aqui cada dia vira um
// documento próprio, CONGELADO:
//   - criado uma vez, NUNCA alterado (regra do Firestore: update = false);
//   - apagado só pela limpeza do prazo (padrão 180 dias, editável: 90 /
//     180 / 365 / sempre) — ou pelo dono, nunca por outra coisa.
//
// QUANDO GRAVA:
//   1) closeMissingPlanDays — ao abrir o Calendário/Planejador: dias que já
//      passaram dos planos salvos e ainda não têm documento;
//   2) logPlanPastDays — ANTES de substituir ou excluir um plano
//      (plan-store.js): os dias passados do plano antigo. Se não conseguir
//      gravar, o plano NÃO é substituído (nunca perde o histórico).
// Um documento por dia × plataforma (e não um por dia) porque é só-criação:
// um documento do dia criado pra uma plataforma não poderia receber outra
// depois.
//
// LEITURA por intervalo de id (o id começa pela data) com teto. Falha de
// leitura LANÇA — quem chama mostra o erro e não grava nada por cima.

import { db, collection, doc, getDocs, writeBatch, query, where, orderBy, limit, documentId } from './firebase-init.js';
import { state } from './state.js';
import { toLocalDateString } from './finance-logic.js';

export const PLAN_LOG_RETENTION_OPTIONS = Object.freeze([90, 180, 365, 0]); // 0 = sempre
export const DEFAULT_PLAN_LOG_RETENTION = 180;
const READ_MAX = 5000;
const BATCH_MAX = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

let cache = null; // { uid, fromKey, toKey, byId: Map }

function col(uid) {
  return collection(db, 'users', uid, 'planLog');
}

export function planLogId(dayKey, platformId) {
  return `${dayKey}_${platformId}`;
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

export function retentionCutoff(todayKey, retentionDays) {
  const r = Number(retentionDays) || 0;
  return r > 0 ? addDaysKey(todayKey, -r) : null;
}

function isValidLog(id, data) {
  return !!data && DAY_RE.test(String(data.date)) && typeof data.platformId === 'string'
    && id === planLogId(data.date, data.platformId) && Number.isFinite(Number(data.plannedC));
}

async function readRange(uid, fromKey, toKey) {
  const q = query(
    col(uid),
    where(documentId(), '>=', fromKey),
    where(documentId(), '<=', `${toKey}`),
    orderBy(documentId()),
    limit(READ_MAX)
  );
  const snap = await getDocs(q);
  const map = new Map();
  snap.docs.forEach(d => {
    const data = d.data();
    if (isValidLog(d.id, data)) map.set(d.id, data);
  });
  return map;
}

/** Lê o histórico do intervalo (dias, inclusivos). LANÇA em falha. */
export async function loadPlanLogs(uid, fromKey, toKey) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const byId = await readRange(uid, fromKey, toKey);
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, fromKey, toKey, byId };
  return cache;
}

export function isPlanLogLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getPlanLogRange() {
  return cache ? { fromKey: cache.fromKey, toKey: cache.toKey } : null;
}

export function getPlanLogEntry(dayKey, platformId) {
  return cache ? cache.byId.get(planLogId(dayKey, platformId)) || null : null;
}

// Todos os registros carregados entre fromKey e toKey.
export function getPlanLogsInRange(fromKey, toKey) {
  if (!cache) return [];
  return [...cache.byId.values()].filter(e => e.date >= fromKey && e.date <= toKey);
}

function buildDoc(plan, day, nowIso) {
  return {
    date: day.key,
    platformId: String(plan.platformId),
    platformName: String(plan.platformName || ''),
    plannedC: Math.round(Number(day.plannedC) || 0),
    targetC: Math.round(Number(day.targetC) || 0),
    tier: String(day.tier || ''),
    createdAt: nowIso
  };
}

/**
 * Grava (só criação) os dias PASSADOS dos planos que ainda não têm
 * documento. Lê o que existe ANTES de gravar (documento já existente
 * recusaria o lote inteiro). Espera o commit.
 * @returns {Promise<{ok:true, written:number} | {ok:false, error:string}>}
 */
export async function logPlanPastDays(uid, plans, todayKey, retentionDays = DEFAULT_PLAN_LOG_RETENTION) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  const cutoff = retentionCutoff(todayKey, retentionDays);
  const wanted = [];
  (plans || []).forEach(plan => {
    if (!plan || !Array.isArray(plan.days)) return;
    plan.days.forEach(day => {
      if (!day || !DAY_RE.test(day.key) || day.key >= todayKey) return;
      if (cutoff && day.key < cutoff) return;
      wanted.push({ plan, day });
    });
  });
  if (wanted.length === 0) return { ok: true, written: 0 };

  const keys = wanted.map(w => w.day.key).sort();
  let existing;
  try {
    existing = await readRange(uid, keys[0], keys[keys.length - 1]);
  } catch (err) {
    console.error('Histórico do planejado: falha ao ler antes de gravar:', err);
    return { ok: false, error: 'Não foi possível ler o histórico do planejado. Nada foi gravado — verifique a internet e tente de novo.' };
  }

  const nowIso = new Date().toISOString();
  const toWrite = [];
  const seen = new Set();
  wanted.forEach(({ plan, day }) => {
    const id = planLogId(day.key, plan.platformId);
    if (existing.has(id) || seen.has(id)) return;
    seen.add(id);
    toWrite.push({ id, data: buildDoc(plan, day, nowIso) });
  });

  try {
    for (let i = 0; i < toWrite.length; i += BATCH_MAX) {
      const batch = writeBatch(db);
      toWrite.slice(i, i + BATCH_MAX).forEach(w => batch.set(doc(col(uid), w.id), w.data));
      await batch.commit();
    }
  } catch (err) {
    console.error('Histórico do planejado: falha ao gravar:', err);
    return { ok: false, error: 'Não foi possível gravar o histórico do planejado no banco. Verifique a internet e tente de novo.' };
  }

  if (cache && cache.uid === uid) {
    existing.forEach((v, k) => cache.byId.set(k, v));
    toWrite.forEach(w => { if (w.data.date >= cache.fromKey && w.data.date <= cache.toKey) cache.byId.set(w.id, w.data); });
  }
  return { ok: true, written: toWrite.length };
}

/**
 * Apaga os dias mais antigos que o prazo (só quando o prazo não é "sempre").
 * No máximo 400 por chamada (o resto sai nas próximas aberturas).
 */
export async function purgeOldPlanLogs(uid, todayKey, retentionDays = DEFAULT_PLAN_LOG_RETENTION) {
  const cutoff = retentionCutoff(todayKey, retentionDays);
  if (!uid || !cutoff) return { ok: true, deleted: 0 };
  try {
    const q = query(col(uid), where(documentId(), '<', cutoff), orderBy(documentId()), limit(BATCH_MAX));
    const snap = await getDocs(q);
    if (snap.docs.length === 0) return { ok: true, deleted: 0 };
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(doc(col(uid), d.id)));
    await batch.commit();
    if (cache && cache.uid === uid) snap.docs.forEach(d => cache.byId.delete(d.id));
    return { ok: true, deleted: snap.docs.length };
  } catch (err) {
    console.error('Histórico do planejado: limpeza pelo prazo falhou (tenta de novo depois):', err);
    return { ok: false, deleted: 0 };
  }
}
