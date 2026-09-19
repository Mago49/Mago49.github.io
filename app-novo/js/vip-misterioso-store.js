// === TEMPLATES DO BÔNUS MISTERIOSO (Página 3 — aba Bônus Misterioso) ===
// Coleção isolada (users/{uid}/misteriosoTemplates), fora de `platforms`
// — cada template agrupa um conjunto de plataformas que pagam pelo MESMO
// padrão de 8 patamares fixos de depósito (ver misterioso-logic.js); só o
// intervalo de bônus (min/max) por patamar muda de template pra template.
// Nunca toca no doc-sentinela nem na coleção `platforms`. Usa só funções
// já exportadas por firebase-init.js (collection, doc, getDocs, deleteDoc,
// writeBatch) — nenhuma mudança lá.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { MISTERIOSO_DEPOSIT_THRESHOLDS } from './misterioso-logic.js';

function getTemplatesCollection(uid) {
  return collection(db, 'users', uid, 'misteriosoTemplates');
}

export async function loadMisteriosoTemplates(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(getTemplatesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Erro ao carregar templates do Bônus Misterioso:', err);
    return [];
  }
}

// Cria (sem id) ou atualiza (com id) um template. bonusRanges precisa ter
// exatamente 8 itens ({min, max}), na mesma ordem de
// MISTERIOSO_DEPOSIT_THRESHOLDS — validado antes de gravar, pra nunca
// salvar uma tabela incompleta ou fora de ordem. Retorna o id usado.
export function saveMisteriosoTemplate(uid, template) {
  if (!uid) return null;
  if (!Array.isArray(template.bonusRanges) || template.bonusRanges.length !== MISTERIOSO_DEPOSIT_THRESHOLDS.length) {
    console.error(
      'Template do Bônus Misterioso inválido — precisa de exatamente',
      MISTERIOSO_DEPOSIT_THRESHOLDS.length,
      'faixas.'
    );
    return null;
  }
  const id = template.id || ('mt' + Date.now());
  const batch = writeBatch(db);
  batch.set(doc(getTemplatesCollection(uid), id), {
    name: template.name || 'Sem nome',
    bonusRanges: template.bonusRanges,
    platformIds: Array.isArray(template.platformIds) ? template.platformIds : []
  });
  batch.commit().catch(err => console.error('Erro ao salvar template do Bônus Misterioso:', err));
  return id;
}

export function deleteMisteriosoTemplate(uid, templateId) {
  if (!uid) return;
  deleteDoc(doc(db, 'users', uid, 'misteriosoTemplates', templateId))
    .catch(err => console.error('Erro ao remover template do Bônus Misterioso:', err));
}
