// === TEMPLATES DO BÔNUS VIP — camada de dados (Firestore) ===
// Coleção isolada users/{uid}/vipBonusTemplates, fora de `platforms` e do
// doc-sentinela (mesmo padrão de vip-misterioso-store.js).
//
// Documento: { name, versions:[{from, levels}], updatedAt }  (o id é o do
// documento). Ver vip-bonus-template-logic.js pro contrato completo.
//
// DIFERENÇAS DE COMPORTAMENTO EM RELAÇÃO AOS OUTROS STORES (de propósito,
// o dado aqui mexe em DINHEIRO calculado — Saldo/Rollover/VIP):
//  - loadVipBonusTemplates LANÇA erro se a leitura falhar. Devolver []
//    em silêncio faria toda plataforma voltar pra tabela padrão sem
//    ninguém perceber. Quem decide o que fazer é o auth-guard.js.
//  - saveVipBonusTemplate recusa qualquer alteração que apague ou mude
//    uma versão do PASSADO, e recusa gravar um id que não está carregado
//    em memória (nunca sobrescreve o que não viu).
//  - deleteVipBonusTemplate recusa excluir template que alguma plataforma
//    usa ou já usou (excluir mudaria o passado dela).
//
// state.vipBonusTemplates é atualizado de forma OTIMISTA, antes do commit
// assíncrono — mesmo padrão de card-customization-store.js. É essa lista
// que cycle-logic.js lê, de forma síncrona, pra calcular o bônus.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import {
  validateVipTemplate, cleanVipLevels, isVipTemplateUpdateSafe,
  isVipTemplateInUse, findVipTemplateById
} from './vip-bonus-template-logic.js';

function getTemplatesCollection(uid) {
  return collection(db, 'users', uid, 'vipBonusTemplates');
}

function ensureStateList() {
  if (!Array.isArray(state.vipBonusTemplates)) state.vipBonusTemplates = [];
  return state.vipBonusTemplates;
}

/**
 * Lê todos os templates. LANÇA erro em falha de leitura (ver nota no topo).
 * Documento inválido NÃO derruba a carga: é ignorado e o id vai em
 * `invalidIds` pra quem chama avisar.
 * @returns {Promise<{templates: Array, invalidIds: string[]}>}
 */
export async function loadVipBonusTemplates(uid) {
  if (!uid) return { templates: [], invalidIds: [] };

  const snap = await getDocs(getTemplatesCollection(uid));
  const templates = [];
  const invalidIds = [];

  snap.docs.forEach(d => {
    const data = d.data();
    const candidate = { id: d.id, name: data.name, versions: data.versions };
    const check = validateVipTemplate(candidate);
    if (check.ok) {
      templates.push(candidate);
    } else {
      invalidIds.push(d.id);
      console.error(`Template do Bônus VIP "${d.id}" ignorado (inválido): ${check.error}`);
    }
  });

  return { templates, invalidIds };
}

/**
 * Cria (sem id) ou atualiza (com id) um template.
 * @returns {{ok:true, id:string} | {ok:false, error:string}}
 */
export function saveVipBonusTemplate(uid, template) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };

  const check = validateVipTemplate(template);
  if (!check.ok) return { ok: false, error: check.error };

  const list = ensureStateList();
  const isUpdate = !!template.id;

  if (isUpdate) {
    const previous = findVipTemplateById(list, template.id);
    if (!previous) {
      return { ok: false, error: 'Template não está carregado — recarregue a página antes de editar.' };
    }
    const safe = isVipTemplateUpdateSafe(previous, template);
    if (!safe.ok) return { ok: false, error: safe.error };
  }

  const id = isUpdate ? template.id : ('vbt' + Date.now());
  const clean = {
    name: template.name.trim(),
    versions: template.versions.map(v => ({ from: v.from, levels: cleanVipLevels(v.levels) }))
  };

  const batch = writeBatch(db);
  batch.set(doc(getTemplatesCollection(uid), id), { ...clean, updatedAt: new Date().toISOString() });
  batch.commit().catch(err => console.error('Erro ao salvar template do Bônus VIP:', err));

  const stored = { id, ...clean };
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) list.push(stored); else list[idx] = stored;

  return { ok: true, id };
}

/**
 * Exclui um template — só se nenhuma plataforma o usa nem usou.
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function deleteVipBonusTemplate(uid, templateId, platforms = state.platforms) {
  if (!uid || !templateId) return { ok: false, error: 'Template inválido.' };

  if (isVipTemplateInUse(platforms, templateId)) {
    return {
      ok: false,
      error: 'Este template é usado (ou já foi usado) por alguma plataforma. Excluir alteraria o passado dela — troque a plataforma pra outro template antes, e este fica guardado.'
    };
  }

  deleteDoc(doc(db, 'users', uid, 'vipBonusTemplates', templateId))
    .catch(err => console.error('Erro ao remover template do Bônus VIP:', err));

  state.vipBonusTemplates = ensureStateList().filter(t => t.id !== templateId);
  return { ok: true };
}
