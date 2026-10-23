// === TELEGRAM — banco de dados (Sub-entrega 21) ===
// Tudo em users/{uid}. Quem grava o quê:
//
//   telegramDialogs/list       BOT   lista dos canais/grupos + sinal de vida.
//                                    App: só lê (ao vivo).
//   telegramSources/{chatId}   APP   canais marcados: plataforma, janela,
//                                    ligado/desligado. O bot lê ao vivo.
//   telegramFeed/{chat_msg}    BOT   mensagens do dia. App: lê (ao vivo, só
//                                    o dia de hoje) e pode EXCLUIR.
//   telegramDays/{AAAA-MM-DD}  BOT   horários de cada canal no dia. App: lê
//                                    e grava SÓ o campo `excluded` (as
//                                    regras recusam qualquer outro campo) e
//                                    pode excluir o dia inteiro.
//
// GRAVAÇÕES: writeBatch/deleteDoc de firebase-init.js (SAFE_MODE vale).
// Excluir uma mensagem = UM lote: apaga a mensagem do feed + marca os
// horários dela como excluídos nos dias dela (set com merge — se o dia
// não existir, nasce só com `excluded`). Nunca toca em plataforma.
//
// LEITURAS AO VIVO (onSnapshot): só 3 — feed de hoje, dia de hoje e a
// lista do bot. Cada uma devolve a função que desliga; ui-telegram.js
// desliga tudo ao sair da aba.

import {
  db, collection, doc, getDocs, deleteDoc, writeBatch,
  query, where, documentId, onSnapshot
} from './firebase-init.js';
import { state } from './state.js';
import { cleanSource, isChatId, isDayKey, feedKey } from './telegram-logic.js';

const SAVE_ERROR = 'Não foi possível salvar no banco de dados. Nada mudou. Verifique a internet e tente de novo.';
const DELETE_ERROR = 'Não foi possível excluir no banco de dados. Nada mudou. Verifique a internet e tente de novo.';

// { uid, sources: Map<chatId, source>, days: Map<dia, doc>, daysFrom: 'AAAA-MM-DD'|null }
let cache = null;

function col(uid, name) {
  return collection(db, 'users', uid, name);
}

function ensureCache(uid) {
  if (!cache || cache.uid !== uid) cache = { uid, sources: null, days: new Map(), daysFrom: null };
  return cache;
}

function sessionChanged(uid) {
  return !cache || cache.uid !== uid;
}

// ---------- ao vivo ----------

/** Lista de canais do bot + sinal de vida. cb(doc|null). */
export function watchDialogs(uid, cb, onError) {
  return onSnapshot(doc(col(uid, 'telegramDialogs'), 'list'),
    snap => cb(snap.exists() ? (snap.data() || {}) : null),
    err => { console.error('Telegram: lista do bot não lida:', err); if (onError) onError(err); });
}

/** Mensagens do dia `dayKey`. cb(docs[]) — cada doc com `id`. */
export function watchFeed(uid, dayKey, cb, onError) {
  const q = query(col(uid, 'telegramFeed'), where('dayKey', '==', dayKey));
  return onSnapshot(q,
    snap => cb(snap.docs.map(d => ({ ...(d.data() || {}), id: d.id }))),
    err => { console.error('Telegram: feed não lido:', err); if (onError) onError(err); });
}

/** Documento de horários do dia (pra métrica de hoje ao vivo). cb(doc|null). */
export function watchDay(uid, dayKey, cb, onError) {
  return onSnapshot(doc(col(uid, 'telegramDays'), dayKey),
    snap => {
      const data = snap.exists() ? { ...(snap.data() || {}), day: dayKey } : null;
      if (cache && cache.uid === uid) {
        if (data) cache.days.set(dayKey, data);
        else cache.days.delete(dayKey);
      }
      cb(data);
    },
    err => { console.error('Telegram: dia de hoje não lido:', err); if (onError) onError(err); });
}

// ---------- canais marcados ----------

/** LANÇA em falha. */
export async function loadSources(uid) {
  const snap = await getDocs(col(uid, 'telegramSources'));
  const c = ensureCache(uid);
  c.sources = new Map();
  snap.docs.forEach(d => { if (isChatId(d.id)) c.sources.set(d.id, cleanSource(d.data() || {})); });
}

export function isSourcesLoaded(uid = state.currentUid) {
  return !!(cache && cache.uid === uid && cache.sources);
}

/** { [chatId]: source } */
export function getSources() {
  const out = {};
  if (cache && cache.sources) cache.sources.forEach((v, k) => { out[k] = { ...v }; });
  return out;
}

/** Cria/atualiza um canal marcado. patch: title, platformId, active, kind, windowMin. */
export async function saveSource(uid, chatId, patch) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isSourcesLoaded(uid)) return { ok: false, error: 'Os canais ainda não foram carregados — recarregue a tela.' };
  if (!isChatId(chatId)) return { ok: false, error: 'Canal inválido.' };
  if (patch && patch.platformId && !state.platforms.some(p => p.id === patch.platformId)) {
    return { ok: false, error: 'Plataforma não encontrada — recarregue a tela.' };
  }
  const cur = cache.sources.get(chatId) || {};
  const next = { ...cleanSource({ ...cur, ...(patch || {}) }), updatedAt: new Date().toISOString() };
  try {
    const batch = writeBatch(db);
    batch.set(doc(col(uid, 'telegramSources'), chatId), next);
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar canal do Telegram:', err);
    return { ok: false, error: SAVE_ERROR };
  }
  if (sessionChanged(uid)) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  const { updatedAt, ...clean } = next;
  cache.sources.set(chatId, clean);
  return { ok: true };
}

/** Tira o canal da lista (o bot para de ler). O histórico de horários fica. */
export async function deleteSource(uid, chatId) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isSourcesLoaded(uid)) return { ok: false, error: 'Os canais ainda não foram carregados — recarregue a tela.' };
  if (!isChatId(chatId)) return { ok: false, error: 'Canal inválido.' };
  try {
    await deleteDoc(doc(col(uid, 'telegramSources'), chatId));
  } catch (err) {
    console.error('Erro ao excluir canal do Telegram:', err);
    return { ok: false, error: DELETE_ERROR };
  }
  if (sessionChanged(uid)) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.sources.delete(chatId);
  return { ok: true };
}

// ---------- dias (horários) ----------

/** Carrega os dias de `fromKey` em diante (só amplia o que já tem). LANÇA em falha. */
export async function loadDays(uid, fromKey) {
  const c = ensureCache(uid);
  if (c.daysFrom && c.daysFrom <= fromKey) return;
  const q = query(col(uid, 'telegramDays'), where(documentId(), '>=', fromKey));
  const snap = await getDocs(q);
  if (sessionChanged(uid)) return;
  snap.docs.forEach(d => {
    if (!isDayKey(d.id)) return;
    cache.days.set(d.id, { ...(d.data() || {}), day: d.id });
  });
  cache.daysFrom = fromKey;
}

export function getDaysFrom(uid = state.currentUid) {
  return cache && cache.uid === uid ? cache.daysFrom : null;
}

export function getDays() {
  return cache ? [...cache.days.values()] : [];
}

/** Liga/desliga a exclusão dos horários de UMA mensagem num dia. */
export async function setExcluded(uid, day, chatId, msgId, excluded) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isDayKey(day) || !isChatId(String(chatId)) || !/^\d{1,20}$/.test(String(msgId))) return { ok: false, error: 'Registro inválido.' };
  const key = feedKey(chatId, msgId);
  try {
    const batch = writeBatch(db);
    batch.set(doc(col(uid, 'telegramDays'), day), { excluded: { [key]: excluded === true } }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao marcar horários excluídos:', err);
    return { ok: false, error: SAVE_ERROR };
  }
  if (cache && cache.uid === uid && cache.days.has(day)) {
    const d = cache.days.get(day);
    d.excluded = { ...(d.excluded || {}), [key]: excluded === true };
  }
  return { ok: true };
}

/**
 * Exclui uma mensagem do feed E tira os horários dela da métrica (um lote só).
 * feedDoc: { id, chatId, msgId, slots:[{day,t}] }
 */
export async function deleteFeedMessage(uid, feedDoc) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  const chatId = String(feedDoc && feedDoc.chatId);
  const msgId = String(feedDoc && feedDoc.msgId);
  if (!isChatId(chatId) || !/^\d{1,20}$/.test(msgId) || feedDoc.id !== feedKey(chatId, msgId)) return { ok: false, error: 'Mensagem inválida.' };
  const days = [...new Set((feedDoc.slots || []).map(s => s && s.day).filter(isDayKey))];
  const key = feedKey(chatId, msgId);
  try {
    const batch = writeBatch(db);
    days.forEach(day => batch.set(doc(col(uid, 'telegramDays'), day), { excluded: { [key]: true } }, { merge: true }));
    batch.delete(doc(col(uid, 'telegramFeed'), feedDoc.id));
    await batch.commit();
  } catch (err) {
    console.error('Erro ao excluir mensagem do Telegram:', err);
    return { ok: false, error: DELETE_ERROR };
  }
  if (cache && cache.uid === uid) {
    days.forEach(day => {
      const d = cache.days.get(day);
      if (d) d.excluded = { ...(d.excluded || {}), [key]: true };
    });
  }
  return { ok: true };
}

/** Exclui o dia inteiro do histórico de horários (some da métrica). */
export async function deleteDay(uid, day) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isDayKey(day)) return { ok: false, error: 'Dia inválido.' };
  try {
    await deleteDoc(doc(col(uid, 'telegramDays'), day));
  } catch (err) {
    console.error('Erro ao excluir dia do Telegram:', err);
    return { ok: false, error: DELETE_ERROR };
  }
  if (cache && cache.uid === uid) cache.days.delete(day);
  return { ok: true };
}

// ---------- calibração ----------

/** Todos os textos guardados (semana de calibração), do mais antigo pro mais novo. LANÇA em falha. */
export async function loadCalibrationTexts(uid) {
  const snap = await getDocs(col(uid, 'telegramFeed'));
  return snap.docs.map(d => d.data() || {})
    .filter(d => typeof d.text === 'string' && d.text)
    .sort((a, b) => String(a.postedAt || '').localeCompare(String(b.postedAt || '')));
}
