// === TEMPLATES DO BÔNUS VIP (Página 3 — aba VIP) ===
// Coleção isolada (users/{uid}/vipBonusTemplates), fora de `platforms` e do
// doc-sentinela. Cada template agrupa valores por nível/grupo, num formato
// compatível com vip-bonus-template-logic.js.
//
// O contrato do template é:
// {
//   id?: string,
//   name: string,
//   com: {
//     0: { daily, weekly, monthly },
//     1: { daily, weekly, monthly },
//     ...
//     5: { daily, weekly, monthly }
//   },
//   sem: {
//     0: { daily, weekly, monthly },
//     ...
//     5: { daily, weekly, monthly }
//   }
// }

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';
import { VIP_BONUS_LEVELS, normalizeVipTemplate, isVipTemplateValid } from './vip-bonus-template-logic.js';

function getTemplatesCollection(uid) {
  return collection(db, 'users', uid, 'vipBonusTemplates');
}

export async function loadVipBonusTemplates(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(getTemplatesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Erro ao carregar templates do Bônus VIP:', err);
    return [];
  }
}

export function saveVipBonusTemplate(uid, template) {
  if (!uid) return null;

  const normalized = normalizeVipTemplate(template);
  if (!isVipTemplateValid(normalized)) {
    console.error('Template do Bônus VIP inválido.');
    return null;
  }

  const id = template?.id || ('vbt' + Date.now());
  const batch = writeBatch(db);

  batch.set(doc(getTemplatesCollection(uid), id), {
    name: normalized.name || 'Sem nome',
    com: normalized.com,
    sem: normalized.sem,
    platformIds: Array.isArray(template?.platformIds) ? template.platformIds : []
  });

  batch.commit().catch(err => console.error('Erro ao salvar template do Bônus VIP:', err));
  return id;
}

export function deleteVipBonusTemplate(uid, templateId) {
  if (!uid || !templateId) return;
  deleteDoc(doc(db, 'users', uid, 'vipBonusTemplates', templateId))
    .catch(err => console.error('Erro ao remover template do Bônus VIP:', err));
}

export function getVipTemplateById(templates, templateId) {
  if (!Array.isArray(templates)) return null;
  return templates.find(t => t.id === templateId) || null;
}

export function buildDefaultVipTemplate() {
  return normalizeVipTemplate({
    name: 'Padrão',
    com: {},
    sem: {}
  });
}

export function validateVipTemplateStructure(payload) {
  const normalized = normalizeVipTemplate(payload);
  return {
    ok: isVipTemplateValid(normalized),
    template: normalized
  };
}

export function ensureVipTemplateLevels(template) {
  const normalized = normalizeVipTemplate(template);
  for (const group of ['com', 'sem']) {
    for (const level of VIP_BONUS_LEVELS) {
      if (!normalized[group][level]) {
        normalized[group][level] = { daily: 0, weekly: 0, monthly: 0 };
      }
    }
  }
  return normalized;
}
