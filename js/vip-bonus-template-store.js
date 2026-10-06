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
//
// (6.3b) FALHA DE GRAVAÇÃO: se o commit for recusado/falhar, a lista em
// memória VOLTA ao que era antes (senão a tela e os cálculos de bônus
// continuariam usando um template que não existe no banco — e o próximo
// login abriria sem ele) e o usuário recebe um aviso claro pra tentar de
// novo. O aviso genérico de firebase-init.js (showSaveFailureToast)
// continua existindo; este é o aviso ESPECÍFICO, que diz o que foi
// desfeito. `options.onFailure` deixa a tela se redesenhar depois do
// desfazer. A reversão só acontece se a lista ainda tem EXATAMENTE o que
// esta gravação colocou — se o usuário já salvou outra versão do mesmo
// template nesse meio tempo, a mais nova é preservada.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import { showAppAlert } from './utils.js';
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

// Desfaz na memória uma gravação que falhou. Devolve true se desfez.
function rollbackSave(id, stored, previous) {
  const list = ensureStateList();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1 || list[idx] !== stored) return false; // já mudou depois — não mexe
  if (previous) list[idx] = previous; else list.splice(idx, 1);
  return true;
}

/**
 * Cria (sem id) ou atualiza (com id) um template.
 * @param {string} uid
 * @param {Object} template
 * @param {{onFailure?: () => void}} [options] onFailure: chamado depois que
 *        uma gravação FALHOU e a memória foi desfeita (pra redesenhar a tela).
 * @returns {{ok:true, id:string} | {ok:false, error:string}}
 */
export function saveVipBonusTemplate(uid, template, options = {}) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };

  const check = validateVipTemplate(template);
  if (!check.ok) return { ok: false, error: check.error };

  const list = ensureStateList();
  const isUpdate = !!template.id;
  let previous = null;

  if (isUpdate) {
    previous = findVipTemplateById(list, template.id);
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

  // O batch é montado ANTES de mexer na memória: se montar falhar, nada mudou.
  const batch = writeBatch(db);
  batch.set(doc(getTemplatesCollection(uid), id), { ...clean, updatedAt: new Date().toISOString() });

  const stored = { id, ...clean };
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) list.push(stored); else list[idx] = stored;

  batch.commit().catch(err => {
    console.error('Erro ao salvar template do Bônus VIP:', err);
    const undone = rollbackSave(id, stored, previous);
    showAppAlert(
      `Não foi possível salvar o template "${clean.name}" no banco de dados` +
      (undone ? ' — a alteração foi desfeita na tela.' : '.') +
      ' Verifique a internet e tente salvar de novo.'
    );
    if (undone && typeof options.onFailure === 'function') options.onFailure();
  });

  return { ok: true, id };
}

/**
 * Exclui um template — só se nenhuma plataforma o usa nem usou.
 * Se a exclusão falhar no banco, o template volta pra lista (mesma posição)
 * e o usuário é avisado.
 * @param {{onFailure?: () => void}} [options]
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function deleteVipBonusTemplate(uid, templateId, platforms = state.platforms, options = {}) {
  if (!uid || !templateId) return { ok: false, error: 'Template inválido.' };

  if (isVipTemplateInUse(platforms, templateId)) {
    return {
      ok: false,
      error: 'Este template é usado (ou já foi usado) por alguma plataforma. Excluir alteraria o passado dela — troque a plataforma pra outro template antes, e este fica guardado.'
    };
  }

  const list = ensureStateList();
  const removedIndex = list.findIndex(t => t.id === templateId);
  const removed = removedIndex === -1 ? null : list[removedIndex];

  state.vipBonusTemplates = list.filter(t => t.id !== templateId);

  deleteDoc(doc(db, 'users', uid, 'vipBonusTemplates', templateId))
    .catch(err => {
      console.error('Erro ao remover template do Bônus VIP:', err);
      let restored = false;
      const current = ensureStateList();
      if (removed && !current.some(t => t.id === templateId)) {
        current.splice(Math.min(removedIndex, current.length), 0, removed);
        restored = true;
      }
      showAppAlert(
        `Não foi possível excluir o template${removed ? ` "${removed.name}"` : ''} no banco de dados` +
        (restored ? ' — ele voltou pra lista.' : '.') +
        ' Verifique a internet e tente de novo.'
      );
      if (restored && typeof options.onFailure === 'function') options.onFailure();
    });

  return { ok: true };
}
