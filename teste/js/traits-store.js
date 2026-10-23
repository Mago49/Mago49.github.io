// === CARACTERÍSTICAS DAS PLATAFORMAS — camada de dados (Sub-entrega 11a) ===
//   users/{uid}/platformTraits/{platformId}
//     { tags:[...], text, updatedAt }
// Coleção PRÓPRIA, fora do documento da plataforma: não pesa no limite de
// 1 MB, não passa pelo savePlatform nem pela trava de campos. Excluir a
// plataforma não apaga isto (fica como histórico; a tela ignora órfãos).
//
// LEITURA estrita (lança em falha) — uma leitura só pra todas.
// GRAVAÇÃO espera o commit; a memória muda depois. Texto vazio + sem
// etiquetas = documento apagado.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import { cleanTraits, isEmptyTraits } from './traits-logic.js';

let cache = null; // { uid, map: Map<platformId, traits> }

function col(uid) {
  return collection(db, 'users', uid, 'platformTraits');
}

function isSafeId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && !id.includes('/');
}

export async function loadPlatformTraits(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const snap = await getDocs(col(uid));
  const map = new Map();
  snap.docs.forEach(d => map.set(d.id, { ...cleanTraits(d.data()), updatedAt: (d.data() || {}).updatedAt || null }));
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, map };
  return cache;
}

export function isPlatformTraitsLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getPlatformTraits(platformId) {
  const t = cache ? cache.map.get(platformId) : null;
  return t ? { tags: t.tags.slice(), text: t.text, updatedAt: t.updatedAt } : { tags: [], text: '', updatedAt: null };
}

export function getAllPlatformTraits() {
  return cache ? [...cache.map.values()].map(t => ({ tags: t.tags.slice(), text: t.text })) : [];
}

export async function savePlatformTraits(uid, platformId, traits) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isPlatformTraitsLoaded(uid)) return { ok: false, error: 'As características ainda não foram carregadas — tente de novo.' };
  if (!isSafeId(platformId)) return { ok: false, error: 'Plataforma inválida.' };
  const clean = cleanTraits(traits);
  const nowIso = new Date().toISOString();
  try {
    if (isEmptyTraits(clean)) {
      if (cache.map.has(platformId)) await deleteDoc(doc(col(uid), platformId));
    } else {
      const batch = writeBatch(db);
      batch.set(doc(col(uid), platformId), { ...clean, updatedAt: nowIso });
      await batch.commit();
    }
  } catch (err) {
    console.error('Erro ao salvar características:', err);
    return { ok: false, error: 'Não foi possível salvar as características. Nada mudou — verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  if (isEmptyTraits(clean)) cache.map.delete(platformId);
  else cache.map.set(platformId, { ...clean, updatedAt: nowIso });
  return { ok: true };
}
