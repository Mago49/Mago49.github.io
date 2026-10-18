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
//
// === (Sub-entrega 24) ===
// a) O fim da leitura por intervalo agora aparece escrito como \uf8ff
//    (antes era o mesmo caractere, invisível no código) — mesmo efeito:
//    pega todos os ids "AAAA-MM-DD_plataforma" do último dia.
// b) O documento guarda também as linhas de aposta do dia (lines), os
//    valores permitidos (stakes, R$) e a compra de bônus (buy) — o
//    Calendário sugere "o que falta apostar" mesmo com o plano já refeito.
//    Campos opcionais: documentos antigos continuam válidos.
// c) logPlanPastDays(..., { includeTodayFor }): congela TAMBÉM o dia de
//    HOJE das plataformas indicadas — usado quando o plano é refeito a
//    partir de amanhã (senão a meta de hoje sumiria do Calendário).
//
// === (Sub-entrega 25) 🙈 IGNORAR ===
// O documento continua só-criação, com UMA exceção (regra do Firestore):
// marcar/desmarcar `ignored` (+ `ignoredAt`). Data, plataforma e planejado
// nunca mudam; nada é apagado. Dia ignorado sai das contas (Calendário,
// Aderência, 🏆 Grupos) e só aparece com 📟 Encerrados ligado.
//   setPlanLogIgnored(uid, ids, true|false)
//   logPlanPastDays(..., { ignoreFor }) — troca de plano (individual ↔
//   grupo / excluir): os dias do plano antigo nascem (ou ficam) ignorados.
//
// === (Sub-entrega 29) 🏁 ENCERRAR O DIA ===
// logPlanPastDays(..., { stopFor: { [platformId]: stop } }): o dia de HOJE
// congelado leva `stop` = { at, reason, rbC, wageredC, plannedC } (quando
// já existia, só o campo stop é gravado — regra do Firestore). O
// Calendário conta o dia como cumprido (meta = o apostado até parar).

import { db, collection, doc, getDocs, writeBatch, query, where, orderBy, limit, documentId } from './firebase-init.js';
import { state } from './state.js';
import { toLocalDateString } from './finance-logic.js';
import { isStopReasonId, stopReasonSnapshot, isStopKindId, activeStop } from './stop-reasons.js';

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
    where(documentId(), '<=', `${toKey}\uf8ff`), // inclui os ids "toKey_…"
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
  const out = {
    date: day.key,
    platformId: String(plan.platformId),
    platformName: String(plan.platformName || ''),
    plannedC: Math.round(Number(day.plannedC) || 0),
    targetC: Math.round(Number(day.targetC) || 0),
    tier: String(day.tier || ''),
    createdAt: nowIso
  };
  // (24) linhas de aposta + valores permitidos + compra (opcionais)
  const lines = (Array.isArray(day.lines) ? day.lines : []).filter(l => l && Number(l.stakeC) > 0).slice(0, 20).map(l => (l.kind === 'buy'
    ? { kind: 'buy', stakeC: Math.round(Number(l.stakeC)), multiplier: Math.round(Number(l.multiplier) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }
    : { kind: 'spin', stakeC: Math.round(Number(l.stakeC)), count: Math.round(Number(l.count) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }));
  if (lines.length) out.lines = lines;
  const params = plan.params || {};
  const stakes = (Array.isArray(params.stakes) ? params.stakes : []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(0, 40);
  if (stakes.length) out.stakes = stakes;
  if (params.buy && params.buy.enabled && Number(params.buy.multiplier) >= 2) out.buy = { enabled: true, multiplier: Math.round(Number(params.buy.multiplier)) };
  return out;
}

/**
 * Grava (só criação) os dias PASSADOS dos planos que ainda não têm
 * documento. Lê o que existe ANTES de gravar (documento já existente
 * recusaria o lote inteiro). Espera o commit.
 * @returns {Promise<{ok:true, written:number} | {ok:false, error:string}>}
 */
//   opts.includeTodayFor  Set/array de platformId: congela também o dia de
//                         HOJE desses planos (24 — plano refeito a partir de amanhã).
export async function logPlanPastDays(uid, plans, todayKey, retentionDays = DEFAULT_PLAN_LOG_RETENTION, opts = {}) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  const cutoff = retentionCutoff(todayKey, retentionDays);
  const todayFor = new Set(opts && opts.includeTodayFor ? [...opts.includeTodayFor].map(String) : []);
  const ignoreFor = new Set(opts && opts.ignoreFor ? [...opts.ignoreFor].map(String) : []); // (25)
  const stopFor = cleanStopMap(opts && opts.stopFor, todayKey); // (29)
  const wanted = [];
  (plans || []).forEach(plan => {
    if (!plan || !Array.isArray(plan.days)) return;
    // (29b) 🏁 hoje: congela hoje também (o plano pode continuar com hoje)
    const withToday = todayFor.has(String(plan.platformId)) || stopFor.has(String(plan.platformId));
    plan.days.forEach(day => {
      if (!day || !DAY_RE.test(day.key)) return;
      if (day.key > todayKey || (day.key === todayKey && !withToday)) return;
      if (cutoff && day.key < cutoff) return;
      wanted.push({ plan, day });
    });
  });
  // (29b) 🏁 de plataforma cujo plano JÁ foi refeito a partir de amanhã: a
  // meta de hoje só existe no histórico — grava o stop no documento de hoje.
  const todayInWanted = new Set(wanted.filter(w => w.day.key === todayKey).map(w => String(w.plan.platformId)));
  const stopOnly = [...stopFor.keys()].filter(pid => !todayInWanted.has(pid));
  if (wanted.length === 0 && stopOnly.length === 0) return { ok: true, written: 0 };

  const keys = [...wanted.map(w => w.day.key), ...(stopOnly.length ? [todayKey] : [])].sort();
  let existing;
  try {
    existing = await readRange(uid, keys[0], keys[keys.length - 1]);
  } catch (err) {
    console.error('Histórico do planejado: falha ao ler antes de gravar:', err);
    return { ok: false, error: 'Não foi possível ler o histórico do planejado. Nada foi gravado — verifique a internet e tente de novo.' };
  }

  const nowIso = new Date().toISOString();
  const toWrite = [];
  const toIgnore = []; // (25) já existiam: só marca ignored
  const toStop = [];   // (29) já existiam: só grava stop
  const seen = new Set();
  wanted.forEach(({ plan, day }) => {
    const id = planLogId(day.key, plan.platformId);
    if (seen.has(id)) return;
    seen.add(id);
    const ignore = ignoreFor.has(String(plan.platformId));
    const stop = day.key === todayKey ? stopFor.get(String(plan.platformId)) || null : null; // (29)
    if (existing.has(id)) {
      if (ignore && existing.get(id).ignored !== true) toIgnore.push(id);
      if (stop) toStop.push({ id, stop });
      return;
    }
    const data = buildDoc(plan, day, nowIso);
    if (ignore) { data.ignored = true; data.ignoredAt = nowIso; }
    if (stop) data.stop = stop;
    toWrite.push({ id, data });
  });
  stopOnly.forEach(pid => {
    const id = planLogId(todayKey, pid);
    if (seen.has(id) || !existing.has(id)) return; // sem meta hoje: nada a encerrar
    seen.add(id);
    toStop.push({ id, stop: stopFor.get(pid) });
  });

  // Um lote só quando cabe (tudo ou nada); acima de 400, em partes.
  const ops = [
    ...toWrite.map(w => ({ kind: 'set', id: w.id, data: w.data })),
    ...toIgnore.map(id => ({ kind: 'update', id, data: { ignored: true, ignoredAt: nowIso } })),
    ...toStop.map(x => ({ kind: 'update', id: x.id, data: { stop: x.stop } }))
  ];
  try {
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
      const batch = writeBatch(db);
      ops.slice(i, i + BATCH_MAX).forEach(o => (o.kind === 'set'
        ? batch.set(doc(col(uid), o.id), o.data)
        : batch.update(doc(col(uid), o.id), o.data)));
      await batch.commit();
    }
  } catch (err) {
    console.error('Histórico do planejado: falha ao gravar:', err);
    return { ok: false, error: 'Não foi possível gravar o histórico do planejado no banco. Verifique a internet e tente de novo.' };
  }

  if (cache && cache.uid === uid) {
    existing.forEach((v, k) => cache.byId.set(k, v));
    toWrite.forEach(w => { if (w.data.date >= cache.fromKey && w.data.date <= cache.toKey) cache.byId.set(w.id, w.data); });
    toIgnore.forEach(id => { const cur = cache.byId.get(id); if (cur) cache.byId.set(id, { ...cur, ignored: true, ignoredAt: nowIso }); });
    toStop.forEach(x => { const cur = cache.byId.get(x.id); if (cur) cache.byId.set(x.id, { ...cur, stop: x.stop }); });
  }
  return { ok: true, written: toWrite.length, ignored: toIgnore.length + toWrite.filter(w => w.data.ignored).length, stopped: toStop.length + toWrite.filter(w => w.data.stop).length };
}

// (29) { [platformId]: stop } → Map com o stop limpo (tipos garantidos).
// (29b) 'adiado': 🔄 Atualizar com "Descontar" desligado — parou por hoje.
// (31) Motivos em stop-reasons.js (fixos + criados pelo usuário 'c_…') e
// uma cópia do nome/tipo na hora (reasonLabel/reasonKind) — apagar o motivo
// depois não muda o histórico.
function cleanStopMap(src, todayKey) {
  const out = new Map();
  if (!src || typeof src !== 'object') return out;
  Object.entries(src).forEach(([pid, st]) => {
    if (!st || typeof st !== 'object') return;
    out.set(String(pid), {
      at: typeof st.at === 'string' ? st.at : new Date().toISOString(),
      day: todayKey,
      reason: isStopReasonId(st.reason) ? st.reason : 'outro',
      reasonLabel: typeof st.reasonLabel === 'string' && st.reasonLabel.trim()
        ? st.reasonLabel.trim().slice(0, 40)
        : stopReasonSnapshot(isStopReasonId(st.reason) ? st.reason : 'outro', []).reasonLabel,
      reasonKind: isStopKindId(st.reasonKind) ? st.reasonKind
        : stopReasonSnapshot(isStopReasonId(st.reason) ? st.reason : 'outro', []).reasonKind,
      reasonKindLabel: typeof st.reasonKindLabel === 'string' && st.reasonKindLabel.trim()
        ? st.reasonKindLabel.trim().slice(0, 40)
        : stopReasonSnapshot(isStopReasonId(st.reason) ? st.reason : 'outro', []).reasonKindLabel, // (31)
      rbC: Math.round(Number(st.rbC) || 0),
      wageredC: Math.max(0, Math.round(Number(st.wageredC) || 0)),
      plannedC: Math.max(0, Math.round(Number(st.plannedC) || 0)),
      // (32) o que foi somado nos próximos dias (pro ↩️ Desfazer exato)
      ...(st.spread && typeof st.spread === 'object' ? { spread: cleanSpread(st.spread) } : {}),
      ...(typeof st.planAt === 'string' ? { planAt: st.planAt } : {}),
      ...(Number.isFinite(Number(st.movedC)) ? { movedC: Math.round(Number(st.movedC)) } : {})
    });
  });
  return out;
}

// (32) { [dayKey]: { b, a, bt, bl } } — antes/depois de cada dia somado.
function cleanSpread(src) {
  const out = {};
  Object.entries(src || {}).slice(0, 120).forEach(([k, v]) => {
    if (!DAY_RE.test(k) || !v || typeof v !== 'object') return;
    out[k] = {
      b: Math.max(0, Math.round(Number(v.b) || 0)),
      a: Math.max(0, Math.round(Number(v.a) || 0)),
      bt: Math.max(0, Math.round(Number(v.bt) || 0)),
      bl: (Array.isArray(v.bl) ? v.bl : []).filter(l => l && Number(l.stakeC) > 0).slice(0, 20).map(l => (l.kind === 'buy'
        ? { kind: 'buy', stakeC: Math.round(Number(l.stakeC)), multiplier: Math.round(Number(l.multiplier) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }
        : { kind: 'spin', stakeC: Math.round(Number(l.stakeC)), count: Math.round(Number(l.count) || 0), subtotalC: Math.round(Number(l.subtotalC) || 0) }))
    };
  });
  return out;
}

// ============================================================
// (Sub-entrega 32) 🏁 NO PRÓPRIO LUGAR — operações preparadas SEM gravar:
// quem chama (plan-store) junta histórico + planos num writeBatch só
// (tudo ou nada). Lê o dia de HOJE do banco na hora (nunca grava em cima
// do que não viu).
// ============================================================

/**
 * items: [{ platformId, plan (documento salvo ATUAL ou null), stop }]
 * @returns {Promise<{ok:true, ops} | {ok:false, error, already?, missing?}>}
 */
export async function prepareStopTodayOps(uid, items, todayKey) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  const list = Array.isArray(items) ? items : [];
  let existing;
  try {
    existing = await readRange(uid, todayKey, todayKey);
  } catch (err) {
    console.error('Histórico do planejado: falha ao ler hoje antes do 🏁:', err);
    return { ok: false, error: 'Não foi possível ler o histórico de hoje. Nada foi gravado — verifique a internet e tente de novo.' };
  }
  const stops = cleanStopMap(Object.fromEntries(list.map(i => [String(i.platformId), i.stop])), todayKey);
  const nowIso = new Date().toISOString();
  const ops = [];
  const already = [];
  const missing = [];
  list.forEach(i => {
    const pid = String(i.platformId);
    const id = planLogId(todayKey, pid);
    const stop = stops.get(pid);
    const ex = existing.get(id);
    if (ex && activeStop(ex)) { already.push(pid); return; }
    if (ex) { ops.push({ kind: 'update', id, data: { stop }, merged: { ...ex, stop } }); return; }
    const day = i.plan && Array.isArray(i.plan.days) ? i.plan.days.find(d => d && d.key === todayKey) : null;
    if (!day) { missing.push(pid); return; }
    const data = buildDoc(i.plan, day, nowIso);
    data.stop = stop;
    ops.push({ kind: 'set', id, data });
  });
  if (already.length) return { ok: false, error: 'already', already };
  if (missing.length) return { ok: false, error: 'missing', missing };
  return { ok: true, ops };
}

/**
 * ↩️ Desfazer 🏁 de hoje: o stop fica gravado com undone:true (o campo não
 * é apagado — firebase-init não exporta deleteField e o rastro serve às
 * análises). Só a chave `stop` muda (regra do Firestore).
 * @returns {Promise<{ok:true, ops, stops:{[pid]: stop}} | {ok:false, error}>}
 */
export async function prepareUndoStopOps(uid, platformIds, todayKey) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  let existing;
  try {
    existing = await readRange(uid, todayKey, todayKey);
  } catch (err) {
    console.error('Histórico do planejado: falha ao ler hoje antes de desfazer:', err);
    return { ok: false, error: 'Não foi possível ler o histórico de hoje. Nada foi alterado — verifique a internet e tente de novo.' };
  }
  const nowIso = new Date().toISOString();
  const ops = [];
  const stops = {};
  for (const pid of (platformIds || []).map(String)) {
    const id = planLogId(todayKey, pid);
    const ex = existing.get(id);
    const st = ex ? activeStop(ex) : null;
    if (!st) return { ok: false, error: 'O 🏁 de hoje não foi encontrado (já desfeito ou de outro dia). Nada foi alterado.' };
    stops[pid] = st;
    const stop = { ...st, undone: true, undoneAt: nowIso };
    ops.push({ kind: 'update', id, data: { stop }, merged: { ...ex, stop } });
  }
  return { ok: true, ops, stops };
}

export function addPlanLogOpsToBatch(batch, uid, ops) {
  (ops || []).forEach(o => (o.kind === 'set'
    ? batch.set(doc(col(uid), o.id), o.data)
    : batch.update(doc(col(uid), o.id), o.data)));
}

/** Depois do commit: a memória passa a ver o que foi gravado. */
export function applyPlanLogOps(uid, ops) {
  if (!cache || cache.uid !== uid) return;
  (ops || []).forEach(o => {
    if (o.kind === 'set') {
      if (o.data.date >= cache.fromKey && o.data.date <= cache.toKey) cache.byId.set(o.id, o.data);
    } else {
      const cur = cache.byId.get(o.id);
      if (cur) cache.byId.set(o.id, { ...cur, ...o.data });
      else if (o.merged && o.merged.date >= cache.fromKey && o.merged.date <= cache.toKey) cache.byId.set(o.id, o.merged);
    }
  });
}

/**
 * (25) 🙈 Ignorar / voltar a contar dias do histórico (documentos que JÁ
 * existem). Só os campos ignored/ignoredAt mudam (regra do Firestore).
 * Um lote só (até 400). A memória só muda depois do commit.
 */
export async function setPlanLogIgnored(uid, ids, ignored) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(id => /^\d{4}-\d{2}-\d{2}_.+$/.test(id) && !id.includes('/'));
  if (!list.length) return { ok: false, error: 'Nenhum dia pra alterar.' };
  if (list.length > BATCH_MAX) return { ok: false, error: 'Dias demais de uma vez.' };
  if (cache && cache.uid === uid && list.some(id => !cache.byId.has(id))) {
    return { ok: false, error: 'Esse dia ainda não está no histórico. Recarregue a aba e tente de novo.' };
  }
  const nowIso = new Date().toISOString();
  const data = ignored ? { ignored: true, ignoredAt: nowIso } : { ignored: false, ignoredAt: nowIso };
  try {
    const batch = writeBatch(db);
    list.forEach(id => batch.update(doc(col(uid), id), data));
    await batch.commit();
  } catch (err) {
    console.error('Histórico do planejado: falha ao marcar ignorado:', err);
    return { ok: false, error: 'Não foi possível salvar no banco. Nada mudou — verifique a internet e tente de novo.' };
  }
  if (cache && cache.uid === uid) list.forEach(id => { const cur = cache.byId.get(id); if (cur) cache.byId.set(id, { ...cur, ...data }); });
  return { ok: true, changed: list.length };
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
