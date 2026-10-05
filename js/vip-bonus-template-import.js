// === IMPORTADOR DE TEMPLATE DO BÔNUS VIP ===
// Parser puro: sem DOM, sem Firestore. Aceita o texto no formato da
// planilha do usuário, 6 linhas (VIP 0 a 5), uma por nível:
//
//   Vip 0 BD 0,00 BS 0,00 BM 0,00
//   Vip 2 BD 0,50 BS 1,00 BM 1,00
//
// Também aceita, por tolerância de colagem: sem a palavra "Vip", sem os
// rótulos BD/BS/BM (nesse caso a ordem é BD, BS, BM), rótulos em qualquer
// ordem, separação por espaço/tab/";".
//
// NUNCA usa vírgula como separador de campo — no formato pt-BR ela é o
// separador DECIMAL ("0,50"). Mesmo cuidado já tomado em
// misterioso-template-import.js.
//
// Nada é preenchido com padrão em silêncio: faltou nível, nível repetido,
// linha ilegível ou valor negativo => erro com mensagem específica.

import { VIP_BONUS_LEVELS, validateVipLevels } from './vip-bonus-template-logic.js';

const LABEL_TO_FIELD = { bd: 'daily', bs: 'weekly', bm: 'monthly' };

function parseLocaleNumber(value) {
  if (value === null || value === undefined) return NaN;
  let text = String(value).trim();
  if (!text) return NaN;
  text = text.replace(/R\$/gi, '').replace(/\s/g, '');
  // Formato brasileiro (1.234,56) vs internacional (1,234.56) — mesma
  // regra de finance-spreadsheet-import.js/misterioso-template-import.js.
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

// -> { level, daily, weekly, monthly } ou null se a linha for ilegível.
function parseLine(line) {
  const tokens = String(line ?? '').trim().split(/[\s;]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const first = tokens[0].toLowerCase();
  if (first === 'vip') {
    tokens.shift();
  } else {
    const glued = /^vip(\d+)$/.exec(first); // "Vip3"
    if (glued) tokens[0] = glued[1];
  }
  if (tokens.length === 0 || !/^\d+$/.test(tokens[0])) return null;

  const level = Number(tokens.shift());
  if (!VIP_BONUS_LEVELS.includes(level)) return null;

  const raw = {};
  if (tokens.length === 3) {
    raw.daily = tokens[0];
    raw.weekly = tokens[1];
    raw.monthly = tokens[2];
  } else if (tokens.length === 6) {
    for (let i = 0; i < 6; i += 2) {
      const field = LABEL_TO_FIELD[tokens[i].toLowerCase()];
      if (!field || field in raw) return null;
      raw[field] = tokens[i + 1];
    }
  } else {
    return null;
  }

  const daily = parseLocaleNumber(raw.daily);
  const weekly = parseLocaleNumber(raw.weekly);
  const monthly = parseLocaleNumber(raw.monthly);
  if (![daily, weekly, monthly].every(Number.isFinite)) return null;

  return { level, daily, weekly, monthly };
}

/**
 * Retorna { ok:true, levels } (levels = { 0:{daily,weekly,monthly}, ... 5 })
 * ou { ok:false, error } — nunca lança exceção.
 */
export function parseVipTemplatePaste(text) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');

  if (lines.length !== VIP_BONUS_LEVELS.length) {
    return { ok: false, error: `Esperado ${VIP_BONUS_LEVELS.length} linhas (VIP 0 a 5), recebi ${lines.length}.` };
  }

  const levels = {};
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i]);
    if (!parsed) {
      return { ok: false, error: `Linha ${i + 1} não reconhecida. Formato: Vip 2 BD 0,50 BS 1,00 BM 1,00` };
    }
    if (levels[parsed.level]) {
      return { ok: false, error: `VIP ${parsed.level} aparece repetido.` };
    }
    levels[parsed.level] = { daily: parsed.daily, weekly: parsed.weekly, monthly: parsed.monthly };
  }

  const check = validateVipLevels(levels); // pega faltantes e negativos
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, levels };
}

function fmt(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

// Texto no mesmo formato aceito acima — usado pra pré-preencher a edição
// de um template e como exemplo na tela.
export function formatVipLevelsAsPasteText(levels) {
  return VIP_BONUS_LEVELS
    .map(l => `Vip ${l} BD ${fmt(levels[l].daily)} BS ${fmt(levels[l].weekly)} BM ${fmt(levels[l].monthly)}`)
    .join('\n');
}

export function getVipTemplateImportExample() {
  return [
    'Vip 0 BD 0,00 BS 0,00 BM 0,00',
    'Vip 1 BD 0,00 BS 0,00 BM 0,00',
    'Vip 2 BD 0,50 BS 1,00 BM 1,00',
    'Vip 3 BD 0,60 BS 2,00 BM 3,00',
    'Vip 4 BD 0,80 BS 3,00 BM 5,00',
    'Vip 5 BD 1,00 BS 5,00 BM 8,00'
  ].join('\n');
}
