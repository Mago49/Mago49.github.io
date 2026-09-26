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
  // Etapa 7, sub-entrega 5: financeBalanceBadge/financeRolloverBadge são
  // os interruptores do Financeiro (Item 25b) — vivem no MESMO objeto
  // badgeVisibility que totalBadge/cycleDayBadge (Edição, Item 25a),
  // porque o requisito confirma que os dois pares moram no mesmo
  // documento (users/{uid}/meta/preferences). Ver correção em
  // saveBadgeVisibility abaixo: sem ela, salvar um par apagaria o outro.
  badgeVisibility: { totalBadge: true, cycleDayBadge: true, financeBalanceBadge: true, financeRolloverBadge: true }
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
      cycleDayBadge: data?.badgeVisibility?.cycleDayBadge !== false,
      // Etapa 7, sub-entrega 5 — ver nota em DEFAULT_PREFERENCES.
      financeBalanceBadge: data?.badgeVisibility?.financeBalanceBadge !== false,
      financeRolloverBadge: data?.badgeVisibility?.financeRolloverBadge !== false
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

// Grava badges de visibilidade — aceita um objeto PARCIAL (só as chaves
// que mudaram) e faz merge com o que já está no cache antes de gravar.
//
// BUG CORRIGIDO (Etapa 7, sub-entrega 5): a versão anterior reconstruía
// o objeto `badgeVisibility` inteiro só com totalBadge/cycleDayBadge
// (os 2 badges da Edição) — como o Firestore, com `{merge:true}` no
// `batch.set`, substitui o CAMPO `badgeVisibility` por inteiro (não faz
// merge dentro do objeto, só no nível do documento), qualquer chave que
// não fosse totalBadge/cycleDayBadge (como os novos financeBalanceBadge/
// financeRolloverBadge do Financeiro) seria APAGADA sempre que a Edição
// salvasse suas preferências, e vice-versa. Agora o objeto salvo sempre
// parte do que já está em getCachedPreferences() — cada página só
// sobrescreve as chaves que ela própria conhece, preservando as da
// outra (mesmo espírito do `{merge:true}` já usado no documento inteiro,
// só que replicado um nível abaixo, dentro de `badgeVisibility`).
export function saveBadgeVisibility(uid, partialVisibility) {
  if (!uid) return;
  const current = getCachedPreferences().badgeVisibility || {};
  const merged = { ...current };
  Object.keys(partialVisibility || {}).forEach(key => {
    merged[key] = partialVisibility[key] !== false;
  });
  cachedPreferences = { ...getCachedPreferences(), badgeVisibility: merged };
  const batch = writeBatch(db);
  batch.set(getPreferencesRef(uid), { badgeVisibility: merged }, { merge: true });
  batch.commit().catch(err => console.error('Erro ao salvar visibilidade de badges:', err));
}
