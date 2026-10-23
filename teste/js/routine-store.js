// === ROTINAS — camada de dados (View Gráficos → Rotinas — Sub-entrega 6) ===
// Três coleções isoladas, FORA do documento das plataformas:
//
//   users/{uid}/routines/{id}            a rotina (editável e excluível)
//   users/{uid}/routineLog/{AAAA-MM-DD}  histórico do dia — CRIADO UMA VEZ,
//                                        nunca alterado nem apagado (regra
//                                        do Firestore garante, mesmo padrão
//                                        do vipHistory). Excluir rotina NÃO
//                                        apaga o histórico (decisão do usuário).
//   users/{uid}/routineMarks/{AAAA-MM-DD} marcações à mão dos lembretes do
//                                        dia: { marks: { [rotina]: { [plataforma|'_']: true } } }
//
// LEITURAS estritas (lançam em falha): a tela mostra o motivo e "Tentar de
// novo" — nunca grava histórico em cima do que não conseguiu ler.
// GRAVAÇÕES: writeBatch/deleteDoc de firebase-init.js (SAFE_MODE vale),
// NÃO otimistas — a memória só muda depois do commit confirmar.
//
// === (Sub-entrega 19) GRUPO ENCERRADO ===
//   users/{uid}/groupArchive/{routineId}
//     { name, emoji, color, action, memberPeriods[], createdAt, archivedAt, updatedAt }
// Excluir uma rotina que participa da competição (🏆) NÃO apaga o grupo:
// num ÚNICO lote, o grupo é guardado aqui (períodos fechados no dia) e a
// rotina sai — ou acontecem as duas coisas, ou nenhuma. O grupo encerrado
// continua na aba 🏆 Grupos (editável/excluível lá). Nenhuma outra tela lê
// esta coleção (Planejador, Caixa, Agenda e Hoje continuam iguais).
//
// Leitura por intervalo de dia usa query/where/documentId (reexportados em
// firebase-init.js desde a Sub-entrega 3).

import {
  db, collection, doc, getDocs, deleteDoc, writeBatch,
  query, where, orderBy, limit, documentId
} from './firebase-init.js';
import { state } from './state.js';
import {
  validateRoutine, cleanRoutine, routineCompetes, getMemberPeriods, closeAllPeriods,
  validateMemberPeriods, cleanMemberPeriods, ROUTINE_NAME_MAX
} from './routine-logic.js';
import { toLocalDateString } from './finance-logic.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// { uid, routines: [], logs: Map<dia, doc>, marks: Map<dia, marks>, invalid }
let cache = null;

function col(uid, name) {
  return collection(db, 'users', uid, name);
}

function isSafeId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && !id.includes('/') && id !== '.' && id !== '..';
}

async function readRange(uid, name, fromKey, toKey) {
  const q = query(
    col(uid, name),
    where(documentId(), '>=', fromKey),
    where(documentId(), '<=', toKey),
    orderBy(documentId()),
    limit(400)
  );
  const snap = await getDocs(q);
  return snap.docs.filter(d => DAY_RE.test(d.id)).map(d => ({ id: d.id, data: d.data() || {} }));
}

/**
 * Lê rotinas + histórico + marcações do intervalo. LANÇA em falha.
 */
export async function loadRoutineData(uid, fromKey, toKey) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const [routinesSnap, logs, marks] = await Promise.all([
    getDocs(col(uid, 'routines')),
    readRange(uid, 'routineLog', fromKey, toKey),
    readRange(uid, 'routineMarks', fromKey, toKey)
  ]);

  const routines = [];
  let invalid = 0;
  routinesSnap.docs.forEach(d => {
    const data = d.data() || {};
    const candidate = { ...data, id: d.id };
    if (validateRoutine(candidate).ok && typeof data.createdAt === 'string') routines.push(candidate);
    else {
      invalid++;
      console.error(`Rotina "${d.id}" ignorada (dados inválidos).`);
    }
  });
  routines.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));

  const logMap = new Map();
  logs.forEach(l => { if (l.data.routines && typeof l.data.routines === 'object') logMap.set(l.id, l.data); });
  const markMap = new Map();
  marks.forEach(m => { if (m.data.marks && typeof m.data.marks === 'object') markMap.set(m.id, m.data.marks); });

  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, routines, logs: logMap, marks: markMap, invalid, fromKey, toKey };
  return cache;
}

export function isRoutinesLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getRoutines() {
  return cache ? cache.routines.slice() : [];
}

export function getRoutineLogs() {
  return cache ? new Map(cache.logs) : new Map();
}

export function getMarks(dayKey) {
  return cache && cache.marks.has(dayKey) ? JSON.parse(JSON.stringify(cache.marks.get(dayKey))) : {};
}

export function getInvalidRoutineCount() {
  return cache ? cache.invalid : 0;
}

function newRoutineId() {
  return `rt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Cria (sem id) ou atualiza (com id). Espera o commit.
 * @returns {Promise<{ok:true, id} | {ok:false, error}>}
 */
export async function saveRoutine(uid, routine) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isRoutinesLoaded(uid)) return { ok: false, error: 'As rotinas ainda não foram carregadas — recarregue a tela.' };
  const check = validateRoutine(routine);
  if (!check.ok) return check;

  const isUpdate = !!routine.id;
  const previous = isUpdate ? cache.routines.find(r => r.id === routine.id) : null;
  if (isUpdate && !previous) return { ok: false, error: 'Rotina não encontrada — recarregue a tela antes de editar.' };
  if (isUpdate && !isSafeId(routine.id)) return { ok: false, error: 'Rotina inválida.' };

  const id = isUpdate ? routine.id : newRoutineId();
  const nowIso = new Date().toISOString();
  const data = { ...cleanRoutine(routine), createdAt: previous ? previous.createdAt : nowIso, updatedAt: nowIso };

  try {
    const batch = writeBatch(db);
    batch.set(doc(col(uid, 'routines'), id), data);
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar rotina:', err);
    return { ok: false, error: 'Não foi possível salvar a rotina no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  const stored = { ...data, id };
  const idx = cache.routines.findIndex(r => r.id === id);
  if (idx === -1) cache.routines.push(stored); else cache.routines[idx] = stored;
  cache.routines.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
  return { ok: true, id };
}

/** Exclui a rotina. O histórico (routineLog) FICA. (19) Rotina 🏆 vira
 *  grupo encerrado no MESMO lote (archived: true no retorno). */
export async function deleteRoutine(uid, routineId) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isRoutinesLoaded(uid)) return { ok: false, error: 'As rotinas ainda não foram carregadas — recarregue a tela.' };
  if (!isSafeId(routineId)) return { ok: false, error: 'Rotina inválida.' };
  const routine = cache.routines.find(r => r.id === routineId) || null;
  const archive = routine && routineCompetes(routine) ? buildArchiveDoc(routine) : null;
  try {
    const batch = writeBatch(db);
    if (archive) batch.set(doc(col(uid, 'groupArchive'), routineId), archive);
    batch.delete(doc(col(uid, 'routines'), routineId));
    await batch.commit();
  } catch (err) {
    console.error('Erro ao excluir rotina:', err);
    return { ok: false, error: 'Não foi possível excluir a rotina no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.routines = cache.routines.filter(r => r.id !== routineId);
  if (archive && archiveCache && archiveCache.uid === uid) archiveCache.groups.set(routineId, { ...archive, id: routineId });
  return { ok: true, archived: !!archive };
}

// ---------- (Sub-entrega 19) grupos encerrados ----------

let archiveCache = null; // { uid, groups: Map<id, doc> }

function buildArchiveDoc(routine) {
  const today = toLocalDateString(new Date());
  const nowIso = new Date().toISOString();
  return {
    name: String(routine.name || '').slice(0, ROUTINE_NAME_MAX) || 'Grupo',
    emoji: String(routine.emoji || '').slice(0, 16),
    color: /^#[0-9a-fA-F]{6}$/.test(String(routine.color || '')) ? routine.color : '#475569',
    action: String(routine.action || ''),
    memberPeriods: closeAllPeriods(getMemberPeriods(routine), today),
    createdAt: typeof routine.createdAt === 'string' ? routine.createdAt : nowIso,
    archivedAt: nowIso,
    updatedAt: nowIso
  };
}

function isValidArchive(data) {
  return !!data && typeof data.name === 'string' && data.name.length > 0 && Array.isArray(data.memberPeriods)
    && typeof data.archivedAt === 'string' && validateMemberPeriods(data.memberPeriods).ok;
}

/** Lê os grupos encerrados. LANÇA em falha (quem chama decide). */
export async function loadGroupArchive(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const snap = await getDocs(col(uid, 'groupArchive'));
  const groups = new Map();
  let invalid = 0;
  snap.docs.forEach(d => {
    const data = d.data() || {};
    if (isValidArchive(data)) groups.set(d.id, { ...data, id: d.id, memberPeriods: cleanMemberPeriods(data.memberPeriods) });
    else { invalid++; console.error(`Grupo encerrado "${d.id}" ignorado (dados inválidos).`); }
  });
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  archiveCache = { uid, groups, invalid };
  return archiveCache;
}

export function isGroupArchiveLoaded(uid = state.currentUid) {
  return !!archiveCache && archiveCache.uid === uid;
}

export function getArchivedGroups() {
  return archiveCache ? [...archiveCache.groups.values()].map(g => ({ ...g, memberPeriods: g.memberPeriods.map(x => ({ ...x })) })) : [];
}

/** Edita um grupo encerrado (nome e/ou períodos). Espera o commit. */
export async function updateArchivedGroup(uid, id, patch) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isGroupArchiveLoaded(uid)) return { ok: false, error: 'Os grupos encerrados ainda não foram carregados — recarregue a tela.' };
  if (!isSafeId(id) || !archiveCache.groups.has(id)) return { ok: false, error: 'Grupo não encontrado — recarregue a tela.' };
  const cur = archiveCache.groups.get(id);
  const next = { ...cur };
  delete next.id;
  if (patch && 'name' in patch) {
    const name = String(patch.name || '').trim();
    if (!name || name.length > ROUTINE_NAME_MAX) return { ok: false, error: `Nome de 1 a ${ROUTINE_NAME_MAX} caracteres.` };
    next.name = name;
  }
  if (patch && 'memberPeriods' in patch) {
    const chk = validateMemberPeriods(patch.memberPeriods);
    if (!chk.ok) return chk;
    if (patch.memberPeriods.some(x => !x.to)) return { ok: false, error: 'Grupo encerrado: todo período precisa ter data de fim.' };
    next.memberPeriods = cleanMemberPeriods(patch.memberPeriods);
  }
  next.updatedAt = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(col(uid, 'groupArchive'), id), next);
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar grupo encerrado:', err);
    return { ok: false, error: 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!archiveCache || archiveCache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  archiveCache.groups.set(id, { ...next, id });
  return { ok: true };
}

/** Exclui DE VEZ um grupo encerrado (sai do histórico da competição). */
export async function deleteArchivedGroup(uid, id) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isGroupArchiveLoaded(uid)) return { ok: false, error: 'Os grupos encerrados ainda não foram carregados — recarregue a tela.' };
  if (!isSafeId(id)) return { ok: false, error: 'Grupo inválido.' };
  try {
    await deleteDoc(doc(col(uid, 'groupArchive'), id));
  } catch (err) {
    console.error('Erro ao excluir grupo encerrado:', err);
    return { ok: false, error: 'Não foi possível excluir no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }
  if (!archiveCache || archiveCache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  archiveCache.groups.delete(id);
  return { ok: true };
}

/**
 * Grava o histórico de dias FECHADOS que ainda não têm documento.
 * Cada documento é criado uma única vez (a regra recusa update). Se outro
 * aparelho gravou o mesmo dia antes, o lote inteiro é recusado — aí a tela
 * relê na próxima abertura (nada se perde: os dias continuam calculáveis).
 * @param {Array<{date, routines}>} dayDocs
 */
export async function writeDayLogs(uid, dayDocs) {
  if (!uid || !Array.isArray(dayDocs) || dayDocs.length === 0) return { ok: true, written: 0 };
  if (!isRoutinesLoaded(uid)) return { ok: false, error: 'Rotinas não carregadas.' };
  const todo = dayDocs.filter(d => DAY_RE.test(d.date) && !cache.logs.has(d.date));
  if (todo.length === 0) return { ok: true, written: 0 };
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    todo.forEach(d => batch.set(doc(col(uid, 'routineLog'), d.date), { date: d.date, routines: d.routines, createdAt: nowIso }));
    await batch.commit();
  } catch (err) {
    console.error('Erro ao gravar o histórico das rotinas:', err);
    return { ok: false, error: 'Não foi possível gravar o histórico das rotinas agora. Ele será gravado na próxima abertura.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação.' };
  todo.forEach(d => cache.logs.set(d.date, { date: d.date, routines: d.routines, createdAt: nowIso }));
  return { ok: true, written: todo.length };
}

// Grava o mapa de marcas do dia (documento inteiro: date + marks). A
// memória só muda depois do commit.
async function writeMarks(uid, dayKey, marks, what) {
  try {
    const batch = writeBatch(db);
    batch.set(doc(col(uid, 'routineMarks'), dayKey), { date: dayKey, marks, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error(`Erro ao salvar ${what}:`, err);
    return { ok: false, error: 'Não foi possível salvar a marcação. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação.' };
  cache.marks.set(dayKey, marks);
  return { ok: true };
}

/**
 * Marca/desmarca um lembrete no dia. Grava o documento do dia inteiro
 * (o mapa lido da memória — as escolhas de depósito do dia vão junto).
 */
export async function setReminderMark(uid, dayKey, routineId, platformKey, checked) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isRoutinesLoaded(uid)) return { ok: false, error: 'Rotinas não carregadas.' };
  if (!DAY_RE.test(dayKey) || !isSafeId(routineId) || !isSafeId(platformKey)) return { ok: false, error: 'Marcação inválida.' };

  const marks = getMarks(dayKey);
  if (!marks[routineId]) marks[routineId] = {};
  if (checked) marks[routineId][platformKey] = true;
  else delete marks[routineId][platformKey];
  if (Object.keys(marks[routineId]).length === 0) delete marks[routineId];
  return writeMarks(uid, dayKey, marks, 'lembrete');
}

/**
 * (Sub-entrega 27) Depósito pausado (ciclo do Misterioso encerrado):
 * choice 'force' (depositar mesmo assim) | 'defer' (⏭ adiar) | null
 * (desfazer). Mesmo documento/mapa dos lembretes (regra do Firestore
 * inalterada: marks é um mapa).
 */
export async function setDepositChoice(uid, dayKey, routineId, platformId, choice) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isRoutinesLoaded(uid)) return { ok: false, error: 'Rotinas não carregadas.' };
  if (!DAY_RE.test(dayKey) || !isSafeId(routineId) || !isSafeId(platformId) || platformId === '_') return { ok: false, error: 'Escolha inválida.' };
  if (choice !== null && choice !== 'force' && choice !== 'defer') return { ok: false, error: 'Escolha inválida.' };
  const marks = getMarks(dayKey);
  if (!marks[routineId]) marks[routineId] = {};
  if (choice) marks[routineId][platformId] = choice;
  else delete marks[routineId][platformId];
  if (Object.keys(marks[routineId]).length === 0) delete marks[routineId];
  return writeMarks(uid, dayKey, marks, 'escolha do depósito');
}
