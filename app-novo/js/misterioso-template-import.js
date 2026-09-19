// === IMPORTADOR DE TEMPLATE DO BÔNUS MISTERIOSO — Bloco E (Item 13a-e) ===
// Parser puro: não acessa DOM, state, Firebase ou misterioso-logic.js (só
// importa a CONSTANTE MISTERIOSO_DEPOSIT_THRESHOLDS, pra validar a
// quantidade de linhas esperada — nenhuma lógica de negócio aqui além
// disso). Mesmo espírito de isolamento já usado por
// finance-spreadsheet-import.js, mas MUITO mais simples: aqui a estrutura
// é sempre fixa — 8 linhas, uma por patamar, na mesma ordem de
// MISTERIOSO_DEPOSIT_THRESHOLDS, cada linha com "mínimo" e "máximo"
// separados por TAB (colado de uma planilha) ou espaço.
//
// Item 13e: em caso de erro (linha faltando, número inválido, mais/menos
// de 8 linhas), a mensagem é sempre genérica — "Reinsira os dados." — sem
// tentar adivinhar qual linha específica falhou, pra manter o parser
// simples e a UI não precisar de uma prévia linha a linha como a do
// Financeiro.

import { MISTERIOSO_DEPOSIT_THRESHOLDS } from './misterioso-logic.js';

function parseLocaleNumber(value) {
  if (value === null || value === undefined) return NaN;
  let text = String(value).trim();
  if (!text) return NaN;
  text = text.replace(/R\$/gi, '').replace(/\s/g, '');
  // Formato brasileiro (1.234,56) vs internacional (1,234.56) — mesma
  // regra já usada em finance-spreadsheet-import.js.
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

/**
 * Espera exatamente 8 linhas (uma por patamar de
 * MISTERIOSO_DEPOSIT_THRESHOLDS, na mesma ordem), cada uma com dois
 * números (mínimo e máximo) separados por tab, vírgula ou espaço.
 *
 * Retorna { ok: true, bonusRanges: [{min,max}, ...8] } ou
 * { ok: false, error: 'Reinsira os dados.' } — nunca lança exceção.
 */
export function parseMisteriosoTemplatePaste(text) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');

  if (lines.length !== MISTERIOSO_DEPOSIT_THRESHOLDS.length) {
    return { ok: false, error: 'Reinsira os dados.' };
  }

  const bonusRanges = [];

  for (const line of lines) {
    // Nunca usar vírgula como separador de campo: no formato pt-BR ela é
    // o separador DECIMAL (ex: "30,00"), então splitar por vírgula
    // quebraria um único número em dois pedaços. TAB é o separador
    // confiável de uma planilha colada; ";" como alternativa; espaço só
    // como último recurso.
    let fields;
    if (line.includes('\t')) {
      fields = line.split('\t').map(p => p.trim()).filter(p => p !== '');
    } else if (line.includes(';')) {
      fields = line.split(';').map(p => p.trim()).filter(p => p !== '');
    } else {
      fields = line.split(/\s+/).filter(p => p !== '');
    }

    if (fields.length !== 2) {
      return { ok: false, error: 'Reinsira os dados.' };
    }

    const min = parseLocaleNumber(fields[0]);
    const max = parseLocaleNumber(fields[1]);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ok: false, error: 'Reinsira os dados.' };
    }

    bonusRanges.push({ min, max });
  }

  return { ok: true, bonusRanges };
}
