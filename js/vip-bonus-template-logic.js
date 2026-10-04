// === LÓGICA PURA DOS TEMPLATES DO BÔNUS VIP ===
// Estrutura em paralelo ao Bônus Misterioso: a regra fixa continua existindo
// em cycle-logic.js (vipBonusTable), mas agora pode haver variações que
// entram por template e sobrepõem os valores padrão para uma plataforma.
//
// O objetivo é permitir "variações de valores" sem quebrar a lógica atual:
// - template válido => usa os valores do template
// - template ausente/inválido => cai em vipBonusTable
// - mesma API de leitura para o restante do sistema

export const VIP_BONUS_LEVELS = [0, 1, 2, 3, 4, 5];

export const DEFAULT_VIP_TEMPLATE = {
  id: null,
  name: 'Padrão',
  com: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  },
  sem: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  }
};

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBonusEntry(entry, fallback = { daily: 0, weekly: 0, monthly: 0 }) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    daily: normalizeNumber(base.daily, fallback.daily),
    weekly: normalizeNumber(base.weekly, fallback.weekly),
    monthly: normalizeNumber(base.monthly, fallback.monthly)
  };
}

export function normalizeVipTemplate(template) {
  const safeTemplate = template && typeof template === 'object' ? template : {};
  const out = {
    id: safeTemplate.id || null,
    name: safeTemplate.name || 'Sem nome',
    com: {},
    sem: {}
  };

  for (const group of ['com', 'sem']) {
    const source = safeTemplate[group] && typeof safeTemplate[group] === 'object'
      ? safeTemplate[group]
      : {};

    for (const level of VIP_BONUS_LEVELS) {
      const base = source[level] || DEFAULT_VIP_TEMPLATE[group][level];
      out[group][level] = normalizeBonusEntry(base, DEFAULT_VIP_TEMPLATE[group][level]);
    }
  }

  return out;
}

export function isVipTemplateValid(template) {
  if (!template || typeof template !== 'object') return false;

  for (const group of ['com', 'sem']) {
    if (!template[group] || typeof template[group] !== 'object') return false;

    for (const level of VIP_BONUS_LEVELS) {
      const entry = template[group][level];
      if (!entry || typeof entry !== 'object') return false;
      if (
        !Number.isFinite(Number(entry.daily)) ||
        !Number.isFinite(Number(entry.weekly)) ||
        !Number.isFinite(Number(entry.monthly))
      ) {
        return false;
      }
    }
  }

  return true;
}

export function getVipTemplateConfig(template, group, level) {
  const normalized = normalizeVipTemplate(template);
  const safeGroup = normalized[group] ? group : 'com';
  const safeLevel = VIP_BONUS_LEVELS.includes(Number(level)) ? Number(level) : 0;
  return normalizeBonusEntry(
    normalized[safeGroup]?.[safeLevel],
    DEFAULT_VIP_TEMPLATE[safeGroup][safeLevel]
  );
}

export function getVipTemplateConfigForPlatform(template, platformGroup, level) {
  const safeGroup = platformGroup === 'sem' ? 'sem' : 'com';
  return getVipTemplateConfig(template, safeGroup, level);
}

export function mergeVipTemplateWithDefaults(template) {
  return normalizeVipTemplate(template);
}

export function cloneVipTemplate(template) {
  return JSON.parse(JSON.stringify(normalizeVipTemplate(template)));
}
