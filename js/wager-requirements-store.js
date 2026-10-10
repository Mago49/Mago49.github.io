// === TABELAS "APOSTA NECESSÁRIA" POR TEMPLATE VIP — camada de dados ===
// (View Gráficos → Total Apostado — Sub-entrega 4)
//
// Coleção isolada: users/{uid}/wagerRequirements/{chave}
//   chave = id do template VIP (o mesmo de vipBonusTemplates) ou 'default'
//   documento = { thresholds: [V0..V5] (números, V0 = 0), updatedAt }
//
// POR QUE COLEÇÃO PRÓPRIA (e não um campo dentro do template VIP):
// cleanVipLevels (vip-bonus-template-logic.js) copia só daily/weekly/
// monthly — um campo novo seria APAGADO no próximo salvamento do template.
// Aqui nada do template VIP é lido nem gravado além do id, que já está em
// state.vipBonusTemplates e no levelHistory das plataformas.
//
// PADRÃO: sem documento 'default', vale DEFAULT_WAGER_THRESHOLDS (só em
// memória — nada é gravado sozinho). Template sem tabela própria usa a do
// Padrão (getThresholdsFor devolve de onde veio).
//
// LEITURA: loadWagerRequirements LANÇA em falha de rede/permissão (a tela
// mostra o erro e "Tentar de novo" — nunca finge que a tabela é a padrão).
// Documento inválido é ignorado e listado em `invalidKeys` (nunca vira 0).
//
// GRAVAÇÃO: passa pelo writeBatch/deleteDoc de firebase-init.js (SAFE_MODE
// continua valendo). NÃO otimista: a memória só muda DEPOIS do commit
// confirmar — a tela nunca mostra uma tabela que não chegou ao banco.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { state } from './state.js';
import { validateWagerThresholds, DEFAULT_WAGER_THRESHOLDS } from './wager-total-logic.js';

export const DEFAULT_REQUIREMENT_KEY = 'default';

// { uid, map: Map<chave, number[]>, invalidKeys: string[] } — sessão.
let cache = null;

function getCol(uid) {
  return collection(db, 'users', uid, 'wagerRequirements');
}

function isSafeKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 100
    && !key.includes('/') && key !== '.' && key !== '..';
}

function roundCents(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Lê todas as tabelas da conta. LANÇA erro em falha de leitura.
 * @returns {Promise<{map: Map<string, number[]>, invalidKeys: string[]}>}
 */
export async function loadWagerRequirements(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const snap = await getDocs(getCol(uid));
  const map = new Map();
  const invalidKeys = [];

  snap.docs.forEach(d => {
    const data = d.data() || {};
    const check = validateWagerThresholds(data.thresholds);
    if (check.ok) {
      map.set(d.id, data.thresholds.slice());
    } else {
      invalidKeys.push(d.id);
      console.error(`Tabela de Aposta Necessária "${d.id}" ignorada (inválida): ${check.error}`);
    }
  });

  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  cache = { uid, map, invalidKeys };
  return { map, invalidKeys };
}

export function isWagerRequirementsLoaded(uid = state.currentUid) {
  return !!cache && cache.uid === uid;
}

export function getInvalidRequirementKeys() {
  return cache ? cache.invalidKeys.slice() : [];
}

// Tabela própria de uma chave (ou null se não tem).
export function getOwnThresholds(key) {
  if (!cache || !cache.map.has(key)) return null;
  return cache.map.get(key).slice();
}

// Tabela que vale pra um template (null = sem template).
//   source: 'template' (tabela própria) | 'default' (Padrão gravado)
//           | 'builtin' (padrão inicial, ainda não gravado)
export function getThresholdsFor(templateId) {
  if (templateId && cache && cache.map.has(templateId)) {
    return { thresholds: cache.map.get(templateId).slice(), source: 'template', key: templateId };
  }
  if (cache && cache.map.has(DEFAULT_REQUIREMENT_KEY)) {
    return { thresholds: cache.map.get(DEFAULT_REQUIREMENT_KEY).slice(), source: 'default', key: DEFAULT_REQUIREMENT_KEY };
  }
  return { thresholds: DEFAULT_WAGER_THRESHOLDS.slice(), source: 'builtin', key: DEFAULT_REQUIREMENT_KEY };
}

/**
 * Grava (cria ou substitui) a tabela de uma chave. Espera o commit.
 * @returns {Promise<{ok:true} | {ok:false, error:string}>}
 */
export async function saveWagerRequirement(uid, key, thresholds) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isSafeKey(key)) return { ok: false, error: 'Tabela inválida.' };
  if (!isWagerRequirementsLoaded(uid)) {
    return { ok: false, error: 'As tabelas ainda não foram carregadas — recarregue a tela antes de salvar.' };
  }

  const clean = Array.isArray(thresholds) ? thresholds.map(v => (typeof v === 'number' ? roundCents(v) : v)) : thresholds;
  const check = validateWagerThresholds(clean);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    const batch = writeBatch(db);
    batch.set(doc(getCol(uid), key), { thresholds: clean, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    console.error('Erro ao salvar tabela de Aposta Necessária:', err);
    return { ok: false, error: 'Não foi possível salvar a tabela no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }

  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.map.set(key, clean);
  cache.invalidKeys = cache.invalidKeys.filter(k => k !== key);
  return { ok: true };
}

/**
 * Remove a tabela própria de um template (ele volta a usar o Padrão).
 * A tabela 'default' não é removida por aqui.
 * @returns {Promise<{ok:true} | {ok:false, error:string}>}
 */
export async function removeWagerRequirement(uid, key) {
  if (!uid) return { ok: false, error: 'Nenhum usuário logado.' };
  if (!isSafeKey(key) || key === DEFAULT_REQUIREMENT_KEY) return { ok: false, error: 'Tabela inválida.' };
  if (!isWagerRequirementsLoaded(uid)) {
    return { ok: false, error: 'As tabelas ainda não foram carregadas — recarregue a tela.' };
  }

  try {
    await deleteDoc(doc(getCol(uid), key));
  } catch (err) {
    console.error('Erro ao remover tabela de Aposta Necessária:', err);
    return { ok: false, error: 'Não foi possível remover a tabela no banco de dados. Nada mudou. Verifique a internet e tente de novo.' };
  }

  if (!cache || cache.uid !== uid) return { ok: false, error: 'A sessão mudou durante a gravação — recarregue a página.' };
  cache.map.delete(key);
  cache.invalidKeys = cache.invalidKeys.filter(k => k !== key);
  return { ok: true };
}
