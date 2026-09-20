// === PREFERÊNCIAS DE EXIBIÇÃO (Item 22 + Item 25a) ===
// Documento ÚNICO e isolado — users/{uid}/meta/preferences — fora da
// coleção `platforms` e do doc-sentinela, mesmo padrão de isolamento já
// usado por announcement-store.js/card-customization-store.js. Consumido
// hoje pela View Edição; a Etapa 7 (Financeiro) reaproveita o MESMO
// documento pra "ordem manual" (Item 22 é compartilhado entre as duas
// páginas — mesma ordem em Edição e Financeiro).
//
// PURAMENTE DE EXIBIÇÃO: nenhuma relação com cycle-logic.js ou
// finance-logic.js — este módulo nunca decide valor de negócio, só a
// ORDEM e a VISIBILIDADE de badges já calculados em outro lugar.
//
// DOIS GRAVADORES INDEPENDENTES no mesmo documento: o botão ⚙️
// (Reordenar) grava `manualOrder`; o botão 👁 (Badges) grava
// `badgeVisibility`. Sem cuidado, um `set()` cheio apagaria o campo que
// o outro botão gravou por último — por isso TODA escrita aqui usa
// `{ merge: true }`, preservando os campos que a própria chamada não
// está alterando.
//
// CACHE SÍNCRONO: mesmo motivo já documentado em
// card-customization-store.js — buildRow()/getVisibleList()
// (ui-platform-manage.js) renderizam de forma síncrona a cada linha,
// não dá pra esperar uma Promise por linha. loadPreferences() é chamado
// uma vez no mount() da view, antes da primeira renderização.

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_PREFERENCES = {
  manualOrder: [],
  badgeVisibility: { totalBadge: true, cycleDayBadge: true }
};

let cachedPreferences = null;

function getPreferencesRef(uid) {
  return doc(db, 'users', uid, 'meta', 'preferences');
}

function normalizePreferences(data) {
  return {
    manualOrder: Array.isArray(data?.manualOrder) ? data.manualOrder : [],
    badgeVisibility: {
      totalBadge: data?.badgeVisibility?.totalBadge !== false,
      cycleDayBadge: data?.badgeVisibility?.cycleDayBadge !== false
    }
  };
}

// Carrega do Firestore e atualiza o cache em memória. Nunca lança erro
// pra quem chama — ausência de configuração não é um estado de erro, é
// só "nada personalizado ainda" (defaults = comportamento atual do
// sistema, sem nenhuma mudança visível pra quem nunca mexeu nisso).
export async function loadPreferences(uid) {
  if (!uid) {
    cachedPreferences = { ...DEFAULT_PREFERENCES, badgeVisibility: { ...DEFAULT_PREFERENCES.badgeVisibility } };
    return cachedPreferences;
  }
  try {
    const snap = await getDoc(getPreferencesRef(uid));
    cachedPreferences = snap.exists() ? normalizePreferences(snap.data()) : normalizePreferences(null);
  } catch (err) {
    console.error('Erro ao carregar preferências de exibição:', err);
    cachedPreferences = normalizePreferences(null);
  }
  return cachedPreferences;
}

// Leitura síncrona — usada a cada render de linha/lista. Nunca retorna
// null: se loadPreferences() ainda não rodou nesta sessão (não deveria
// acontecer, ver mount() da view), devolve os defaults em vez de quebrar
// o render.
export function getCachedPreferences() {
  return cachedPreferences || DEFAULT_PREFERENCES;
}

// Grava só `manualOrder` (Item 22) — nunca toca em `badgeVisibility`
// graças ao merge:true. Atualiza o cache ANTES do commit assíncrono
// terminar, mesmo padrão "otimista" já usado em savePlatform/
// saveCardCustomization: a tela reflete a mudança na hora.
export function saveManualOrder(uid, orderedIds) {
  if (!uid) return;
  cachedPreferences = {
    ...getCachedPreferences(),
    manualOrder: Array.isArray(orderedIds) ? orderedIds : []
  };
  const batch = writeBatch(db);
  batch.set(getPreferencesRef(uid), { manualOrder: cachedPreferences.manualOrder }, { merge: true });
  batch.commit().catch(err => console.error('Erro ao salvar ordem manual:', err));
}

// Grava só `badgeVisibility` (Item 25a) — nunca toca em `manualOrder`
// graças ao merge:true.
export function saveBadgeVisibility(uid, visibility) {
  if (!uid) return;
  const normalized = {
    totalBadge: visibility?.totalBadge !== false,
    cycleDayBadge: visibility?.cycleDayBadge !== false
  };
  cachedPreferences = { ...getCachedPreferences(), badgeVisibility: normalized };
  const batch = writeBatch(db);
  batch.set(getPreferencesRef(uid), { badgeVisibility: normalized }, { merge: true });
  batch.commit().catch(err => console.error('Erro ao salvar visibilidade de badges:', err));
}
