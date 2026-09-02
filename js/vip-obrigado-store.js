// === CONFIGURAÇÃO DO BÔNUS OBRIGADO (Página 3 — VIP) ===
// Único valor persistido fora da coleção `platforms`: o valor de
// referência por aparição (ex: R$ 0,30), usado só pra dar uma PREVISÃO
// aproximada do Bônus Obrigado do mês (Ponto 7.3). Vive isolado em
// users/{uid}/meta/obrigadoConfig — mesmo padrão de isolamento já usado
// pelo doc-sentinela (users/{uid}/meta/initialized, ver
// platforms-store.js): nunca é lido/escrito junto com os documentos de
// plataforma, e nenhuma ação daqui passa perto do sentinela ou do fluxo
// de carregamento inicial.
//
// Por que não vive dentro de cada plataforma: é um valor ÚNICO,
// compartilhado por todas — repetir o mesmo número em 40 documentos só
// pra ele ser editável não faria sentido e multiplicaria escritas à toa.

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_VALUE_PER_APPEARANCE = 0.30;

function getObrigadoConfigRef(uid) {
  return doc(db, 'users', uid, 'meta', 'obrigadoConfig');
}

// Lê o valor salvo, ou devolve o padrão (0,30) se a conta ainda nunca
// configurou isso — nunca lança erro pra quem chama, sempre resolve com
// um número utilizável.
export async function loadObrigadoValuePerAppearance(uid) {
  if (!uid) return DEFAULT_VALUE_PER_APPEARANCE;
  try {
    const snap = await getDoc(getObrigadoConfigRef(uid));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.valuePerAppearance === 'number' && !isNaN(data.valuePerAppearance)) {
        return data.valuePerAppearance;
      }
    }
  } catch (err) {
    console.error('Erro ao carregar valor de referência do Bônus Obrigado:', err);
  }
  return DEFAULT_VALUE_PER_APPEARANCE;
}

// Grava o valor novo. Usa writeBatch (mesmo padrão de savePlatform em
// platforms-store.js) em vez de um setDoc solto, pra não precisar
// exportar mais nada de firebase-init.js (arquivo que nunca é tocado).
export function saveObrigadoValuePerAppearance(uid, value) {
  if (!uid) return;
  const batch = writeBatch(db);
  batch.set(getObrigadoConfigRef(uid), {
    valuePerAppearance: value,
    updatedAt: new Date().toISOString()
  });
  batch.commit().catch(err => console.error('Erro ao salvar valor de referência do Bônus Obrigado:', err));
}
