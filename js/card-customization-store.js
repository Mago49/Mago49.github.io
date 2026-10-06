// === PERSONALIZAÇÃO DE CARDS (Página 2 — Calendário) — Bloco L ===
// Documento isolado, fora da coleção `platforms` e do doc-sentinela,
// mesmo padrão de isolamento já usado por vip-obrigado-store.js e
// announcement-store.js. Nunca é lido/escrito junto com os documentos de
// plataforma, e nenhuma ação daqui passa perto do fluxo de carregamento
// inicial (loadPlatformsFromFirestore) nem de savePlatform/savePlatforms.
//
// Estrutura salva em users/{uid}/meta/cardCustomization:
//   {
//     colors:  { [platformId]: { hex: "#e9d8fd", motivo: "texto livre" } },
//     markers: { [platformId]: "🎯" }
//   }
//
// PURAMENTE ESTÉTICO: nenhuma relação com colorForLevel()/LEVEL_INFO
// (cycle-logic.js) nem com qualquer cálculo de ciclo/bônus. Escolha livre
// do usuário, sem efeito em nenhuma lógica de negócio existente.
//
// CACHE SÍNCRONO: este arquivo mantém um cache em memória
// (cachedCustomization), porque ui-platform-cards.js precisa ler
// cor/marcador de cada plataforma DURANTE a renderização síncrona do grid
// de cards. loadCardCustomization() é chamado uma vez no mount() da view
// (ver view-calendario.js) antes do primeiro render.
//
// === (Sub-entrega H) NUNCA APAGAR A PERSONALIZAÇÃO POR ENGANO ===
// ANTES: falha de leitura virava "nada configurado" em silêncio; o painel
// abria vazio e o primeiro "Salvar" SUBSTITUÍA o documento inteiro por
// esse rascunho vazio (+ o que fosse editado) — todas as cores/marcadores
// salvos eram apagados pra sempre. E o save era otimista: a tela mostrava
// como salvo mesmo quando o commit falhava.
// AGORA:
//  a) loadStatus registra se a última leitura deu certo ('ok') ou falhou
//     ('failed'). Documento inexistente NÃO é falha ('ok', vazio).
//     Os cards continuam abrindo (sem personalização) quando falha.
//  b) saveCardCustomization RECUSA gravar se a leitura não foi confirmada
//     (reason 'not-loaded') — nunca substitui o documento a partir de um
//     rascunho montado sobre uma leitura que falhou.
//  c) save é async e ESPERA o commit; o cache só muda depois da
//     confirmação. Devolve { ok, reason?, error? }.
//  d) Dados sanitizados na leitura e na gravação: cor só em formato
//     #RRGGBB, motivo até 80 caracteres, marcador não vazio até 16
//     caracteres. Entradas de plataformas que não existem mais são
//     descartadas ao salvar (quando a lista de ids válidos é informada).

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_CUSTOMIZATION = Object.freeze({ colors: Object.freeze({}), markers: Object.freeze({}) });
const HEX_RE = /^#[0-9a-f]{6}$/i;
const MOTIVO_MAX = 80;
const MARKER_MAX = 16;

let cachedCustomization = null;
let loadStatus = 'idle'; // 'idle' | 'ok' | 'failed'

function getCustomizationRef(uid) {
  return doc(db, 'users', uid, 'meta', 'cardCustomization');
}

// Limpa colors/markers. validIds (Set) opcional: se informado, descarta
// entradas de plataformas fora dele.
function sanitizeCustomization(data, validIds = null) {
  const colors = {};
  const markers = {};
  const srcColors = (data && data.colors && typeof data.colors === 'object') ? data.colors : {};
  const srcMarkers = (data && data.markers && typeof data.markers === 'object') ? data.markers : {};

  Object.keys(srcColors).forEach(id => {
    if (validIds && !validIds.has(id)) return;
    const entry = srcColors[id];
    if (!entry || typeof entry !== 'object') return;
    const hex = String(entry.hex || '').trim();
    if (!HEX_RE.test(hex)) return;
    colors[id] = { hex: hex.toLowerCase(), motivo: String(entry.motivo || '').slice(0, MOTIVO_MAX) };
  });

  Object.keys(srcMarkers).forEach(id => {
    if (validIds && !validIds.has(id)) return;
    const value = String(srcMarkers[id] ?? '').trim();
    if (!value) return;
    markers[id] = value.slice(0, MARKER_MAX);
  });

  return { colors, markers };
}

// Carrega do Firestore e atualiza o cache. Nunca lança erro pra quem
// chama — mas registra o resultado em loadStatus (ver nota no topo).
export async function loadCardCustomization(uid) {
  if (!uid) {
    cachedCustomization = { colors: {}, markers: {} };
    loadStatus = 'failed';
    return cachedCustomization;
  }
  try {
    const snap = await getDoc(getCustomizationRef(uid));
    cachedCustomization = snap.exists()
      ? sanitizeCustomization(snap.data())
      : { colors: {}, markers: {} };
    loadStatus = 'ok';
  } catch (err) {
    console.error('Erro ao carregar personalização de cards:', err);
    cachedCustomization = { colors: {}, markers: {} };
    loadStatus = 'failed';
  }
  return cachedCustomization;
}

// true só se a última leitura foi confirmada (documento lido ou inexistente).
export function isCardCustomizationLoaded() {
  return loadStatus === 'ok';
}

/**
 * Grava o objeto completo (substitui colors/markers inteiros — o rascunho
 * do painel é a fonte de verdade completa no momento do "Salvar").
 * @param {string} uid
 * @param {{colors:Object, markers:Object}} data
 * @param {Set<string>|null} validIds ids das plataformas existentes (opcional)
 * @returns {Promise<{ok:boolean, reason?:string, error?:any, saved?:Object}>}
 */
export async function saveCardCustomization(uid, data, validIds = null) {
  if (!uid) return { ok: false, reason: 'no-user' };
  if (loadStatus !== 'ok') return { ok: false, reason: 'not-loaded' };

  const clean = sanitizeCustomization(data, validIds && validIds.size > 0 ? validIds : null);
  try {
    const batch = writeBatch(db);
    batch.set(getCustomizationRef(uid), clean);
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar personalização de cards:', err);
    return { ok: false, reason: 'commit-failed', error: err };
  }
  cachedCustomization = clean;
  return { ok: true, saved: clean };
}

// Leitura síncrona — usada por ui-platform-cards.js a cada render do grid
// de cards. Nunca retorna null/undefined.
export function getCachedCardCustomization() {
  return cachedCustomization || DEFAULT_CUSTOMIZATION;
}
