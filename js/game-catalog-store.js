// === BIBLIOTECA DE JOGOS — camada de dados (Sub-entrega 9) ===
//   users/{uid}/gameCatalog/{gameId}
//     { name, provider, stakes:[R$], emoji, notes, createdAt, updatedAt }
//   users/{uid}/gameConfig/providers
//     { names:[...], updatedAt } — sem documento: DEFAULT_PROVIDERS (memória)
//
// Coleções isoladas: nada aqui toca plataformas. O jogo escolhido numa
// aposta é copiado pra dentro do lançamento (ver game-catalog-logic.js) —
// excluir um jogo daqui NUNCA muda nem apaga aposta nenhuma.
//
// LEITURA estrita (lança em falha). GRAVAÇÃO espera o commit; a memória só
// muda depois (writeBatch/deleteDoc de firebase-init.js — SAFE_MODE vale).

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import { cleanGame, cleanProviders, DEFAULT_PROVIDERS, GAME_CATALOG_MAX } from './game-catalog-logic.js';

let cache = null; // { uid, games:[], providers:[], providersSaved }

function gamesCol(uid) {
  return collection(db, 'users', uid, 'gameCatalog');
}

function configCol(uid) {
  return collection(db, 'users', uid, 'gameConfig');
}

function newGameId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function sortGames(list) {
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

export async function loadGameCatalog(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const [gamesSnap, configSnap] = await Promise.all([getDocs(gamesCol(uid)), getDocs(configCol(uid))]);
  const games = [];
  gamesSnap.docs.forEach(d => {
    const data = d.data() || {};
    const c = cleanGame(data, []);
    if (c.ok) games.push({ id: d.id, ...c.game, createdAt: data.createdAt || null, updatedAt: data.updatedAt || null });
    else console.error(`Jogo "${d.id}" ignorado (dados inválidos).`);
  });
  const provDoc = configSnap.docs.find(d => d.id === 'providers');
  const saved = provDoc ? cleanProviders((provDoc.data() || {}).names) : null;
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, games: sortGames(games), providers: saved && saved.length ? saved : DEFAULT_PROVIDERS.slice(), providersSaved: !!provDoc };
  return cache;
}

export function isGameCatalogLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getGames() {
  return cache ? cache.games.slice() : [];
}

export function getGame(id) {
  return cache ? cache.games.find(g => g.id === id) || null : null;
}

export function getProviders() {
  return cache ? cache.providers.slice() : DEFAULT_PROVIDERS.slice();
}

function guard(uid) {
  if (!uid) return 'Nenhum usuário logado.';
  if (!isGameCatalogLoaded(uid)) return 'A biblioteca ainda não foi carregada — recarregue a tela.';
  return null;
}

/** Cria (sem id) ou atualiza (com id). Devolve { ok, game } ou { ok:false, error }. */
export async function saveGame(uid, input) {
  const err = guard(uid);
  if (err) return { ok: false, error: err };
  const c = cleanGame(input, cache.games);
  if (!c.ok) return c;
  const isNew = !input.id;
  if (isNew && cache.games.length >= GAME_CATALOG_MAX) return { ok: false, error: `Máximo de ${GAME_CATALOG_MAX} jogos na biblioteca.` };
  const id = input.id || newGameId();
  const prev = cache.games.find(g => g.id === id);
  if (!isNew && !prev) return { ok: false, error: 'Este jogo não está mais na biblioteca — recarregue a tela.' };
  const nowIso = new Date().toISOString();
  const data = { ...c.game, createdAt: prev ? prev.createdAt || nowIso : nowIso, updatedAt: nowIso };
  try {
    const batch = writeBatch(db);
    batch.set(doc(gamesCol(uid), id), data);
    await batch.commit();
  } catch (e) {
    console.error('Erro ao salvar jogo:', e);
    return { ok: false, error: 'Não foi possível salvar o jogo no banco. Nada mudou — verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  const game = { id, ...data };
  cache.games = sortGames([...cache.games.filter(g => g.id !== id), game]);
  if (game.provider && !cache.providers.some(p => p.toLowerCase() === game.provider.toLowerCase())) {
    // Provedor novo digitado no jogo: aparece na lista da tela (grava junto
    // na próxima vez que a lista de provedores for salva).
    cache.providers = [...cache.providers, game.provider];
  }
  return { ok: true, game };
}

export async function deleteGame(uid, id) {
  const err = guard(uid);
  if (err) return { ok: false, error: err };
  try {
    await deleteDoc(doc(gamesCol(uid), id));
  } catch (e) {
    console.error('Erro ao excluir jogo:', e);
    return { ok: false, error: 'Não foi possível excluir o jogo no banco. Nada mudou — verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.games = cache.games.filter(g => g.id !== id);
  return { ok: true };
}

/** Importa vários de uma vez (sugestões). Ignora os que já existem. */
export async function addGamesBulk(uid, list) {
  const err = guard(uid);
  if (err) return { ok: false, error: err };
  const nowIso = new Date().toISOString();
  const toAdd = [];
  const pool = cache.games.slice();
  (list || []).forEach(item => {
    const c = cleanGame(item, pool);
    if (!c.ok) return;
    const game = { id: newGameId() + toAdd.length, ...c.game, createdAt: nowIso, updatedAt: nowIso };
    toAdd.push(game);
    pool.push(game);
  });
  if (toAdd.length === 0) return { ok: true, added: 0 };
  if (cache.games.length + toAdd.length > GAME_CATALOG_MAX) return { ok: false, error: `Passaria de ${GAME_CATALOG_MAX} jogos na biblioteca.` };
  try {
    for (let i = 0; i < toAdd.length; i += 400) {
      const batch = writeBatch(db);
      toAdd.slice(i, i + 400).forEach(g => {
        const { id, ...data } = g;
        batch.set(doc(gamesCol(uid), id), data);
      });
      await batch.commit();
    }
  } catch (e) {
    console.error('Erro ao importar jogos:', e);
    return { ok: false, error: 'Não foi possível importar no banco. Verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.games = sortGames([...cache.games, ...toAdd]);
  return { ok: true, added: toAdd.length };
}

export async function saveProviders(uid, names) {
  const err = guard(uid);
  if (err) return { ok: false, error: err };
  const list = cleanProviders(names);
  try {
    const batch = writeBatch(db);
    batch.set(doc(configCol(uid), 'providers'), { names: list, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (e) {
    console.error('Erro ao salvar provedores:', e);
    return { ok: false, error: 'Não foi possível salvar os provedores. Nada mudou — verifique a internet e tente de novo.' };
  }
  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.providers = list;
  cache.providersSaved = true;
  return { ok: true };
}
