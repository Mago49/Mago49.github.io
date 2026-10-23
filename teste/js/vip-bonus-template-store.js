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
//
// (Sub-entrega A) DUAS MUDANÇAS, ambas contra template "órfão" (citado
// por plataforma mas ausente do banco):
//  1) deleteVipBonusTemplate agora é ASSÍNCRONA e, antes de excluir,
//     RELÊ as plataformas direto do Firestore. Antes só conferia
//     state.platforms desta aba — uma aba/aparelho com dados velhos
//     (que não viu a plataforma passar a usar o template) conseguia
//     excluí-lo. Se a releitura falhar, a exclusão é recusada.
//  2) restoreMissingVipBonusTemplate (nova): recria um template ausente
//     com o MESMO id e a tabela padrão desde 1970. É exatamente o que o
//     cálculo já usa hoje pra um id ausente (getVipConfigAt cai em
//     DEFAULT_VIP_LEVELS), então NENHUM valor muda — só o problema some.
//     Travas: o id precisa estar citado por alguma plataforma; não pode
//     estar carregado; e o documento precisa NÃO existir no banco
//     (confirmado por getDoc logo antes). Documento existente — válido ou
//     inválido — NUNCA é sobrescrito. Aqui a memória só muda DEPOIS do
//     commit confirmar (não é otimista), pra não mostrar como resolvido
//     algo que não chegou ao banco.

import { db, collection, doc, getDoc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import { showAppAlert } from './utils.js';
import {
  validateVipTemplate, cleanVipLevels, isVipTemplateUpdateSafe,
  isVipTemplateInUse, findVipTemplateById, collectReferencedTemplateIds,
  DEFAULT_VIP_LEVELS, VIP_TEMPLATE_FIRST_FROM, VIP_TEMPLATE_NAME_MAX
} from './vip-bonus-template-logic.js';

const IN_USE_ERROR = 'Este template é usado (ou já foi usado) por alguma plataforma. Excluir alteraria o passado dela — troque a plataforma pra outro template antes, e este fica guardado.';

function getTemplatesCollection(uid) {
  return collection(db, 'users', uid, 'vipBonusTemplates');
}

function ensureStateList() {
  if (!Array.isArray(state.vipBonusTemplates)) state.vipBonusTemplates = [];
  return state.vipBonusTemplates;
}

// id de documento aceitável (sem "/", não vazio, tamanho razoável).
function isSafeDocId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && !id.includes('/') && id !== '.' && id !== '..';
}

// Tira o id de state.vipTemplateIssues (as duas listas) depois de resolvido.
function clearTemplateIssue(templateId) {
  const issues = state.vipTemplateIssues;
  if (!issues || typeof issues !== 'object') return;
  state.vipTemplateIssues = {
    missing: (Array.isArray(issues.missing) ? issues.missing : []).filter(id => id !== templateId),
    invalid: (Array.isArray(issues.invalid) ? issues.invalid : []).filter(id => id !== templateId)
  };
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
 * (Sub-entrega A) Exclui um template — só se nenhuma plataforma o usa nem
 * usou, conferido em DOIS lugares: na memória desta aba e, logo antes de
 * excluir, numa releitura das plataformas direto do Firestore (pega o caso
 * de outra aba/aparelho ter passado a usar o template). Releitura que
 * falha = exclusão recusada (nunca exclui sem confirmar).
 * Se a exclusão falhar no banco, o template volta pra lista (mesma posição)
 * e o usuário é avisado.
 * @param {{onFailure?: () => void}} [options]
 * @returns {Promise<{ok:true} | {ok:false, error:string}>}
 */
export async function deleteVipBonusTemplate(uid, templateId, platforms = state.platforms, options = {}) {
  if (!uid || !templateId) return { ok: false, error: 'Template inválido.' };

  if (isVipTemplateInUse(platforms, templateId)) {
    return { ok: false, error: IN_USE_ERROR };
  }

  // Releitura fresca das plataformas (somente leitura — nada é gravado).
  let freshPlatforms;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'platforms'));
    freshPlatforms = snap.docs.map(d => d.data());
  } catch (err) {
    console.error('Exclusão de template: releitura das plataformas falhou — exclusão cancelada:', err);
    return { ok: false, error: 'Não foi possível confirmar no banco que nenhuma plataforma usa este template. Nada foi excluído. Verifique a internet e tente de novo.' };
  }

  // A conta pode ter mudado/saído enquanto a leitura acontecia.
  if (state.currentUid !== uid) return { ok: false, error: 'A sessão mudou — nada foi excluído.' };

  if (isVipTemplateInUse(freshPlatforms, templateId)) {
    return {
      ok: false,
      error: IN_USE_ERROR + ' (Uma plataforma passou a usá-lo em outro aparelho/aba — recarregue a página pra ver.)'
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

// Nome livre e único pro template restaurado (máx. VIP_TEMPLATE_NAME_MAX).
function buildRestoredName(templateId, list) {
  const taken = new Set(list.map(t => String(t.name || '').trim().toLowerCase()));
  const suffix = templateId.slice(-6);
  const base = `Recuperado ${suffix}`.slice(0, VIP_TEMPLATE_NAME_MAX);
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, VIP_TEMPLATE_NAME_MAX - 4)} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `Recuperado ${Date.now()}`.slice(0, VIP_TEMPLATE_NAME_MAX);
}

/**
 * (Sub-entrega A) Restaura um template AUSENTE do banco, com o mesmo id e a
 * tabela padrão desde 1970 — os mesmos valores que o cálculo já usa pra esse
 * id hoje, então nenhum valor muda. Ver nota no topo pras travas.
 * @param {string} uid
 * @param {string} templateId
 * @param {Array} [platforms]
 * @returns {Promise<{ok:true, id:string, name:string} | {ok:false, error:string}>}
 */
export async function restoreMissingVipBonusTemplate(uid, templateId, platforms = state.platforms) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isSafeDocId(templateId)) return { ok: false, error: 'Id de template inválido.' };

  if (!collectReferencedTemplateIds(platforms).has(templateId)) {
    return { ok: false, error: 'Nenhuma plataforma cita este template — nada a restaurar.' };
  }
  if (findVipTemplateById(ensureStateList(), templateId)) {
    clearTemplateIssue(templateId);
    return { ok: false, error: 'Este template já está carregado — nada a restaurar.' };
  }

  const ref = doc(getTemplatesCollection(uid), templateId);

  // Confirma no banco que o documento NÃO existe. Existe (válido ou não)
  // -> nunca sobrescreve.
  let existing;
  try {
    existing = await getDoc(ref);
  } catch (err) {
    console.error('Restaurar template: leitura de confirmação falhou:', err);
    return { ok: false, error: 'Não foi possível confirmar no banco que o template está ausente. Nada foi gravado. Verifique a internet e tente de novo.' };
  }
  if (state.currentUid !== uid) return { ok: false, error: 'A sessão mudou — nada foi gravado.' };

  if (existing.exists()) {
    const data = existing.data() || {};
    const check = validateVipTemplate({ id: templateId, name: data.name, versions: data.versions });
    return {
      ok: false,
      error: check.ok
        ? 'Este template existe no banco (provavelmente criado em outro aparelho/aba). Recarregue a página pra carregá-lo. Nada foi gravado.'
        : `Este template existe no banco mas está com dados inválidos (${check.error}). Ele NÃO foi sobrescrito — precisa de correção manual.`
    };
  }

  const list = ensureStateList();
  const template = {
    id: templateId,
    name: buildRestoredName(templateId, list),
    versions: [{ from: VIP_TEMPLATE_FIRST_FROM, levels: cleanVipLevels(DEFAULT_VIP_LEVELS) }]
  };
  const check = validateVipTemplate(template);
  if (!check.ok) return { ok: false, error: check.error };

  const batch = writeBatch(db);
  batch.set(ref, {
    name: template.name,
    versions: template.versions,
    updatedAt: new Date().toISOString(),
    restoredAt: new Date().toISOString()
  });

  try {
    await batch.commit();
  } catch (err) {
    console.error('Erro ao restaurar template do Bônus VIP:', err);
    return { ok: false, error: 'Não foi possível gravar o template restaurado no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }

  if (state.currentUid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };

  // Só agora (commit confirmado) a memória muda.
  const current = ensureStateList();
  if (!findVipTemplateById(current, templateId)) current.push(template);
  clearTemplateIssue(templateId);

  return { ok: true, id: templateId, name: template.name };
}
