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
// CACHE SÍNCRONO: diferente dos outros stores (que só expõem
// load/save assíncronos), este arquivo mantém um cache em memória
// (cachedCustomization) atualizado tanto no load() quanto no save().
// Motivo: ui-platform-cards.js precisa ler cor/marcador de cada
// plataforma DURANTE a renderização síncrona do grid de cards — não dá
// pra fazer uma leitura assíncrona ao Firestore a cada render. O cache é
// sempre a fonte usada pra pintar os cards; loadCardCustomization() é
// chamado uma vez no mount() da view (ver view-calendario.js) antes do
// primeiro render, garantindo que o cache já esteja populado.

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_CUSTOMIZATION = { colors: {}, markers: {} };

let cachedCustomization = null;

function getCustomizationRef(uid) {
  return doc(db, 'users', uid, 'meta', 'cardCustomization');
}

// Carrega do Firestore e atualiza o cache em memória. Nunca lança erro
// pra quem chama — em qualquer falha (sem conta, erro de rede, documento
// ainda não existente), resolve com a estrutura padrão vazia, já que
// personalização ausente não é um estado de erro, é só "nada configurado
// ainda" (mesmo espírito de vip-obrigado-store.js).
export async function loadCardCustomization(uid) {
  if (!uid) {
    cachedCustomization = { colors: {}, markers: {} };
    return cachedCustomization;
  }
  try {
    const snap = await getDoc(getCustomizationRef(uid));
    if (snap.exists()) {
      const data = snap.data();
      cachedCustomization = {
        colors: (data.colors && typeof data.colors === 'object') ? data.colors : {},
        markers: (data.markers && typeof data.markers === 'object') ? data.markers : {}
      };
    } else {
      cachedCustomization = { colors: {}, markers: {} };
    }
  } catch (err) {
    console.error('Erro ao carregar personalização de cards:', err);
    cachedCustomization = { colors: {}, markers: {} };
  }
  return cachedCustomization;
}

// Grava o objeto completo (substitui colors/markers inteiros — o rascunho
// em ui-card-customization.js já é a fonte de verdade completa no
// momento do clique em "Salvar", não um patch parcial). Atualiza o cache
// ANTES do commit assíncrono terminar — mesmo padrão "otimista" já usado
// em savePlatform/savePlatforms: a tela reflete a mudança na hora, sem
// esperar confirmação de rede.
export function saveCardCustomization(uid, data) {
  if (!uid) return;
  cachedCustomization = {
    colors: data.colors || {},
    markers: data.markers || {}
  };
  const batch = writeBatch(db);
  batch.set(getCustomizationRef(uid), cachedCustomization);
  batch.commit().catch(err => console.error('Erro ao salvar personalização de cards:', err));
}

// Leitura síncrona — usada por ui-platform-cards.js a cada render do grid
// de cards. Nunca retorna null/undefined: se loadCardCustomization()
// ainda não rodou nesta sessão (não deveria acontecer, ver mount() da
// view), devolve a estrutura padrão vazia em vez de quebrar o render.
export function getCachedCardCustomization() {
  return cachedCustomization || DEFAULT_CUSTOMIZATION;
}
