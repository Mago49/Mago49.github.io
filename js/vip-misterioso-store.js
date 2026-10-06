// === TEMPLATES DO BÔNUS MISTERIOSO (Página 3 — aba Bônus Misterioso) ===
// Coleção isolada (users/{uid}/misteriosoTemplates), fora de `platforms`
// — cada template agrupa um conjunto de plataformas que pagam pelo MESMO
// padrão de 8 patamares fixos de depósito (ver misterioso-logic.js); só o
// intervalo de bônus (min/max) por patamar muda de template pra template.
// Nunca toca no doc-sentinela nem na coleção `platforms`. Usa só funções
// já exportadas por firebase-init.js (collection, doc, getDocs, deleteDoc,
// writeBatch) — nenhuma mudança lá.
//
// (Sub-entrega B) loadMisteriosoTemplatesStrict: mesma leitura, mas LANÇA
// erro se a leitura falhar, em vez de devolver []. Usada SÓ pelo
// fechamento do Histórico Mensal (vip-history-store.js), que grava um
// retrato PERMANENTE — lá, "lista vazia porque a internet caiu" gravaria
// Misterioso = 0 pra sempre. As telas continuam usando a versão tolerante.
//
// (Sub-entrega C) GRAVAÇÃO ATÔMICA COM EXCLUSIVIDADE:
// saveMisteriosoTemplateAtomic grava, num ÚNICO batch, o template salvo e
// todos os outros templates que perderam plataformas pela regra de
// exclusividade (uma plataforma pertence a no máximo UM template — Bloco
// E, item 14). Antes eram vários batches separados, e a tela já mudava a
// memória antes de qualquer um confirmar: uma falha no meio deixava a
// plataforma em dois templates ou em nenhum, no banco e na tela. Agora é
// tudo ou nada, e a memória só muda DEPOIS do commit confirmar (a função
// devolve a lista nova; os objetos recebidos nunca são alterados).
// deleteMisteriosoTemplate passa a devolver uma Promise com o resultado,
// pra tela só tirar o template da lista quando o banco confirmar.

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

// (Sub-entrega B) Igual à anterior, mas falha de leitura LANÇA erro.
// Coleção vazia continua sendo [] (isso é "nenhum template", não falha).
export async function loadMisteriosoTemplatesStrict(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const snap = await getDocs(getTemplatesCollection(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Cria (sem id) ou atualiza (com id) um template. bonusRanges precisa ter
// exatamente 8 itens ({min, max}), na mesma ordem de
// MISTERIOSO_DEPOSIT_THRESHOLDS — validado antes de gravar, pra nunca
// salvar uma tabela incompleta ou fora de ordem. Retorna o id usado.
// (Sub-entrega C) Mantida por compatibilidade — a tela usa
// saveMisteriosoTemplateAtomic.
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

function isValidRange(range) {
  return range && typeof range === 'object' &&
    typeof range.min === 'number' && Number.isFinite(range.min) && range.min >= 0 &&
    typeof range.max === 'number' && Number.isFinite(range.max) && range.max >= 0;
}

// Documento gravado (mesmo formato de sempre: name, bonusRanges, platformIds).
function toDocData(template) {
  return {
    name: template.name,
    bonusRanges: template.bonusRanges.map(r => ({ min: r.min, max: r.max })),
    platformIds: [...template.platformIds]
  };
}

/**
 * (Sub-entrega C) Cria/atualiza um template aplicando a exclusividade, tudo
 * num único batch. Não mexe em nada recebido.
 * @param {string} uid
 * @param {{id?:string, name:string, bonusRanges:Array<{min:number,max:number}>, platformIds:string[]}} template
 * @param {Array} currentTemplates lista atual da tela
 * @returns {Promise<{ok:true, id:string, templates:Array} | {ok:false, error:string}>}
 */
export async function saveMisteriosoTemplateAtomic(uid, template, currentTemplates) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };

  const name = typeof template?.name === 'string' ? template.name.trim() : '';
  if (!name) return { ok: false, error: 'Digite um nome pro template.' };

  const ranges = template.bonusRanges;
  if (!Array.isArray(ranges) || ranges.length !== MISTERIOSO_DEPOSIT_THRESHOLDS.length) {
    return { ok: false, error: `O template precisa de exatamente ${MISTERIOSO_DEPOSIT_THRESHOLDS.length} faixas.` };
  }
  if (!ranges.every(isValidRange)) {
    return { ok: false, error: 'Há faixa com valor inválido ou negativo.' };
  }

  const list = Array.isArray(currentTemplates) ? currentTemplates : [];
  const id = template.id || ('mt' + Date.now());
  if (template.id && !list.some(t => t.id === id)) {
    return { ok: false, error: 'Este template não está mais carregado — recarregue a página antes de editar.' };
  }

  const selected = [...new Set((template.platformIds || []).filter(pid => typeof pid === 'string' && pid))];
  const selectedSet = new Set(selected);
  const saved = { id, name, bonusRanges: ranges.map(r => ({ min: r.min, max: r.max })), platformIds: selected };

  // Exclusividade: os outros templates perdem as plataformas selecionadas.
  const changedOthers = [];
  const nextList = list.map(t => {
    if (t.id === id) return saved;
    const before = Array.isArray(t.platformIds) ? t.platformIds : [];
    const filtered = before.filter(pid => !selectedSet.has(pid));
    if (filtered.length === before.length) return t;
    const updated = { ...t, platformIds: filtered };
    changedOthers.push(updated);
    return updated;
  });
  if (!template.id) nextList.push(saved);

  // Outro template alterado precisa ser gravável no formato completo.
  for (const t of changedOthers) {
    if (!Array.isArray(t.bonusRanges) || t.bonusRanges.length !== MISTERIOSO_DEPOSIT_THRESHOLDS.length || !t.bonusRanges.every(isValidRange)) {
      return { ok: false, error: `O template "${t.name || t.id}" está com faixas inválidas no banco — corrija-o antes de mover plataformas dele.` };
    }
  }

  try {
    const batch = writeBatch(db);
    const colRef = getTemplatesCollection(uid);
    changedOthers.forEach(t => {
      batch.set(doc(colRef, t.id), toDocData({ ...t, name: t.name || 'Sem nome' }));
    });
    batch.set(doc(colRef, id), toDocData(saved));
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar template do Bônus Misterioso (nada foi gravado):', err);
    return { ok: false, error: 'Não foi possível salvar o template no banco de dados. Nada foi alterado — verifique a internet e tente de novo.' };
  }

  return { ok: true, id, templates: nextList };
}

/**
 * Exclui um template.
 * (Sub-entrega C) Devolve Promise<{ok:true} | {ok:false, error}> — a tela
 * só tira o template da lista quando o banco confirma.
 */
export function deleteMisteriosoTemplate(uid, templateId) {
  if (!uid || !templateId) return Promise.resolve({ ok: false, error: 'Template inválido.' });
  return deleteDoc(doc(db, 'users', uid, 'misteriosoTemplates', templateId))
    .then(() => ({ ok: true }))
    .catch(err => {
      console.error('Erro ao remover template do Bônus Misterioso:', err);
      return { ok: false, error: 'Não foi possível excluir o template no banco de dados. Nada foi alterado — verifique a internet e tente de novo.' };
    });
}
