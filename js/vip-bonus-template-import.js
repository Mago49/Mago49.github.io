// === IMPORTADOR DE TEMPLATES DO BÔNUS VIP ===
// Parser puro: lê um texto colado e transforma em template válido do VIP.
// Baseado no mesmo padrão do Bônus Misterioso, mas com uma estrutura um
// pouco diferente: 12 linhas (6 níveis x 2 grupos), cada linha com
// "grupo nível daily weekly monthly" ou separação por tab/space/vírgula.
//
// Exemplo de entrada esperado:
// com 0 0 0 0
// com 1 0 0 1
// com 2 0.5 1 1
// ...
// sem 5 1 5 8

import {
  VIP_BONUS_LEVELS,
  DEFAULT_VIP_TEMPLATE,
  normalizeVipTemplate,
  isVipTemplateValid
} from './vip-bonus-template-logic.js';

function parseLocaleNumber(value) {
  if (value === null || value === undefined) return NaN;
  let text = String(value).trim();
  if (!text) return NaN;

  text = text.replace(/R\$/gi, '').replace(/\s/g, '');

  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return NaN;
  return Number(text);
}

function parseLine(line) {
  const cleaned = String(line ?? '').trim();
  if (!cleaned) return null;

  const parts = cleaned
    .replace(/\t+/g, ' ')
    .split(/\s+|,|;/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 4) return null;

  const group = String(parts[0]).toLowerCase();
  const level = Number(parts[1]);
  const daily = parseLocaleNumber(parts[2]);
  const weekly = parseLocaleNumber(parts[3]);
  const monthly = parseLocaleNumber(parts[4] ?? parts[3]);

  if (!['com', 'sem'].includes(group)) return null;
  if (!VIP_BONUS_LEVELS.includes(level)) return null;
  if (![daily, weekly, monthly].every(value => Number.isFinite(value))) return null;

  return {
    group,
    level,
    daily,
    weekly,
    monthly
  };
}

export function parseVipTemplatePaste(text) {
  const rawLines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');

  if (rawLines.length !== 12) {
    return { ok: false, error: 'Reinsira os dados.' };
  }

  const template = {
    name: 'Template importado',
    com: {},
    sem: {}
  };

  for (const line of rawLines) {
    const parsed = parseLine(line);
    if (!parsed) {
      return { ok: false, error: 'Reinsira os dados.' };
    }

    if (!template[parsed.group]) template[parsed.group] = {};
    template[parsed.group][parsed.level] = {
      daily: parsed.daily,
      weekly: parsed.weekly,
      monthly: parsed.monthly
    };
  }

  const normalized = normalizeVipTemplate(template);
  if (!isVipTemplateValid(normalized)) {
    return { ok: false, error: 'Reinsira os dados.' };
  }

  return { ok: true, template: normalized };
}

export function buildVipTemplateFromRows(rows) {
  const text = Array.isArray(rows) ? rows.join('\n') : String(rows ?? '');
  return parseVipTemplatePaste(text);
}

export function getVipTemplateImportExample() {
  return [
    'com 0 0 0 0',
    'com 1 0 0 1',
    'com 2 0.5 1 1',
    'com 3 0.6 2 3',
    'com 4 0.8 3 5',
    'com 5 1 5 8',
    'sem 0 0 0 0',
    'sem 1 0 0 1',
    'sem 2 0.5 1 1',
    'sem 3 0.6 2 3',
    'sem 4 0.8 3 5',
    'sem 5 1 5 8'
  ].join('\n');
}

export function buildEmptyVipTemplate(name = 'Template') {
  return normalizeVipTemplate({
    name,
    com: { ...DEFAULT_VIP_TEMPLATE.com },
    sem: { ...DEFAULT_VIP_TEMPLATE.sem }
  });
}
