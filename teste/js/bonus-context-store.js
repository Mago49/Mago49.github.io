// === CONTEXTO DE BÔNUS (Obrigado + Misterioso) — leitura ESTRITA ===
// (Sub-entrega E) Arquivo NOVO. Saldo, Rollover, "Inserir bônus hoje",
// fechamento de semana (manual e automático) e o snapshot diário dependem
// de dois dados que moram fora das plataformas:
//   - valor por aparição do Bônus Obrigado (users/{uid}/meta/obrigadoConfig)
//   - templates do Bônus Misterioso (users/{uid}/misteriosoTemplates)
// Os loaders usados pelas telas (loadObrigadoValuePerAppearance /
// loadMisteriosoTemplates) são TOLERANTES: em falha de leitura devolvem
// 0,30 / lista vazia em silêncio. Pra exibição isso é aceitável; pra
// qualquer coisa que GRAVA valor permanente, não: o Financeiro congelava
// semanas, Rollover e bônus avulso calculados sem Obrigado/Misterioso.
//
// loadBonusContextStrict LANÇA erro se qualquer uma das duas leituras
// falhar. Documento/coleção inexistente NÃO é falha (é "nunca
// configurado" -> padrão), igual às versões estritas da Sub-entrega B.
// Somente leitura — este módulo nunca grava nada.

// === (Sub-entrega 48) CACHE EM MEMÓRIA + CONFERÊNCIA EM SEGUNDO PLANO ===
// Cada leitura estrita bem-sucedida fica guardada (por uid). As telas que
// só EXIBEM (Financeiro, Gráficos, Perfil) desenham na hora com o que está
// guardado (getCachedBonusContext) e conferem o Firebase em seguida
// (refreshBonusContext → { context, changed }); se mudou, redesenham.
// Tudo que GRAVA valor calculado com o contexto (fechamento automático de
// semanas, snapshot diário) só roda DEPOIS da conferência — nunca com o
// valor guardado. Sair do VIP (onde Obrigado/templates são editados) limpa
// o cache (clearBonusContextCache): a próxima tela lê do Firebase.
// Sem cache (1ª tela da sessão, outro usuário) = leitura estrita de sempre.

import { loadObrigadoValuePerAppearanceStrict } from './vip-obrigado-store.js';
import { loadMisteriosoTemplatesStrict } from './vip-misterioso-store.js';

// Mesmo formato de ctx que bonus-ledger-logic.js/finance-logic.js já usam.
export function buildResolveCtx(obrigadoValuePerAppearance, misteriosoTemplates) {
  const templates = Array.isArray(misteriosoTemplates) ? misteriosoTemplates : [];
  return (platform) => ({
    obrigadoValuePerAppearance,
    misteriosoTemplate: templates.find(t => (t.platformIds || []).includes(platform.id)) || null
  });
}

/**
 * @returns {Promise<{obrigadoValuePerAppearance:number, misteriosoTemplates:Array, resolveCtx:Function}>}
 * @throws  em qualquer falha de leitura (nada é devolvido "pela metade").
 */
export async function loadBonusContextStrict(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const [obrigadoValuePerAppearance, misteriosoTemplates] = await Promise.all([
    loadObrigadoValuePerAppearanceStrict(uid),
    loadMisteriosoTemplatesStrict(uid)
  ]);
  if (typeof obrigadoValuePerAppearance !== 'number' || !Number.isFinite(obrigadoValuePerAppearance)) {
    throw new Error('Valor do Bônus Obrigado inválido.');
  }
  const result = {
    obrigadoValuePerAppearance,
    misteriosoTemplates,
    resolveCtx: buildResolveCtx(obrigadoValuePerAppearance, misteriosoTemplates)
  };
  cache = { uid, result, sig: contextSig(obrigadoValuePerAppearance, misteriosoTemplates) }; // (48)
  return result;
}

// ---------- (Sub-entrega 48) cache ----------
let cache = null; // { uid, result, sig }

function contextSig(value, templates) {
  try { return JSON.stringify([value, templates]); } catch (err) { return String(Math.random()); }
}

/** Contexto já confirmado nesta sessão (ou null). */
export function getCachedBonusContext(uid) {
  return cache && uid && cache.uid === uid ? cache.result : null;
}

/**
 * Lê de novo (estrito) e diz se mudou em relação ao que estava guardado.
 * @returns {Promise<{context, changed:boolean}>}  @throws como a estrita
 */
export async function refreshBonusContext(uid) {
  const prev = cache && cache.uid === uid ? cache.sig : null;
  const context = await loadBonusContextStrict(uid);
  return { context, changed: prev === null || cache.sig !== prev };
}

export function clearBonusContextCache() {
  cache = null;
}
