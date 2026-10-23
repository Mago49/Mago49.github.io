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
  return {
    obrigadoValuePerAppearance,
    misteriosoTemplates,
    resolveCtx: buildResolveCtx(obrigadoValuePerAppearance, misteriosoTemplates)
  };
}
