// === IMPORTADOR DE DADOS DA PLANILHA (Financeiro) ===
// Parser puro: não acessa DOM, state, Firebase ou finance-logic.
// Recebe texto tabular copiado da planilha e devolve os dados normalizados
// por plataforma. A gravação continua sendo responsabilidade do
// ui-finance-panel.js, usando addHistoricalWeek() como regra financeira única.

const FIELD_ALIASES = new Map([
  ['deposit', 'deposit'],
  ['deposito', 'deposit'],
  ['depósito', 'deposit'],

  ['withdrawal', 'withdrawal'],
  ['saque', 'withdrawal'],

  ['difference', 'difference'],
  ['diferenca', 'difference'],
  ['diferença', 'difference'],

  ['bonus', 'bonus'],
  ['bônus', 'bonus'],

  ['balance', 'balance'],
  ['saldo', 'balance'],

  ['amount wagered', 'wagered'],
  ['amount wagered ', 'wagered'],
  ['wagered', 'wagered'],
  ['aposta', 'wagered'],
  ['apostado', 'wagered'],

  ['n° betting', 'betCount'],
  ['nº betting', 'betCount'],
  ['n° apostas', 'betCount'],
  ['nº apostas', 'betCount'],
  ['n apostas', 'betCount'],
  ['nº de apostas', 'betCount'],
  ['numero de apostas', 'betCount'],
  ['número de apostas', 'betCount'],
  ['betting count', 'betCount'],

  ['result betting', 'resultBetting'],
  ['result betting (r.b.)', 'resultBetting'],
  ['result betting (rb)', 'resultBetting'],
  ['r.b.', 'resultBetting'],
  ['rb', 'resultBetting'],
  ['r.b', 'resultBetting'],

  ['r.b. + bonus', 'rbPlusBonus'],
  ['r.b. + bônus', 'rbPlusBonus'],
  ['rb + bonus', 'rbPlusBonus'],
  ['rb + bônus', 'rbPlusBonus']
]);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeFieldLabel(value) {
  const normalized = normalizeText(value);
  if (FIELD_ALIASES.has(normalized)) return FIELD_ALIASES.get(normalized);

  // Aceita pequenas variações da planilha sem abrir mão da lista de campos
  // conhecidos. Campos calculados continuam deliberadamente separados.
  if (/^deposit/.test(normalized) || /^dep[oó]sit/.test(normalized)) return 'deposit';
  if (/^withdraw/.test(normalized) || /^saque/.test(normalized)) return 'withdrawal';
  if (/^difference/.test(normalized) || /^diferen/.test(normalized)) return 'difference';
  if (/^bonus|^b[oô]nus/.test(normalized)) return 'bonus';
  if (/^balance|^saldo/.test(normalized)) return 'balance';
  if (/amount.*wager|^wagered|^apostad/.test(normalized)) return 'wagered';
  if (/^n[°º]?\s*(de\s*)?apostas|^n[°º]?\s*betting/.test(normalized)) return 'betCount';
  if (/result.*betting|^r\.?b\.?$/.test(normalized)) return 'resultBetting';
  if (/r\.?b\.?\s*\+\s*(bonus|b[oô]nus)/.test(normalized)) return 'rbPlusBonus';

  return null;
}

function parseLocaleNumber(value) {
  if (value === null || value === undefined) return NaN;
  let text = String(value).trim();
  if (!text) return NaN;

  // Remove símbolos de moeda e espaços, preservando sinal, ponto e vírgula.
  text = text.replace(/R\$|US\$|€|£/gi, '').replace(/\s/g, '');

  // Formato brasileiro: 1.234,56 -> 1234.56
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato internacional: 1,234.56 -> 1234.56
      text = text.replace(/,/g, '');
    }
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  // Evita que texto residual vire um número silenciosamente.
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return NaN;
  return Number(text);
}

function splitClipboardRows(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.split('\t').map(cell => cell.trim()))
    .filter(row => row.some(cell => cell !== ''));
}

function isLikelyPlatformHeader(value, platformNames) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return platformNames.some(name => normalizeText(name) === normalized);
}

/**
 * Interpreta uma seleção tabular copiada da planilha.
 *
 * Espera a estrutura da planilha mostrada pelo usuário:
 *   [vazio] | PP11 | DDUU | NNZZ | 83H
 *   Deposit | 42   | 227  | 15   | 20
 *   Withdrawal | ...
 *   Difference | ...
 *   Bonus | ...
 *   Balance | ...
 *   Amount wagered | ...
 *   N° Betting | ...
 *   Result Betting | ...
 *   R.B. + Bonus | ...
 *
 * Campos calculados (Difference, Balance e R.B. + Bonus) são reconhecidos
 * apenas para validação/diagnóstico e nunca são enviados à lógica financeira.
 */
export function parseFinanceSpreadsheet(text, platformNames = []) {
  const rows = splitClipboardRows(text);
  const result = {
    ok: false,
    platforms: [],
    warnings: [],
    errors: [],
    ignoredFields: [],
    rowCount: rows.length
  };

  if (rows.length < 2) {
    result.errors.push('Cole pelo menos o cabeçalho das plataformas e uma linha de dados.');
    return result;
  }

  const knownNames = platformNames.map(String);
  const header = rows[0];
  const columnIndexes = [];

  for (let col = 0; col < header.length; col++) {
    const name = header[col] || '';
    if (!isLikelyPlatformHeader(name, knownNames)) continue;
    const platformName = knownNames.find(n => normalizeText(n) === normalizeText(name));
    columnIndexes.push({ col, platformName });
  }

  if (columnIndexes.length === 0) {
    result.errors.push('Nenhuma plataforma reconhecida no cabeçalho da planilha. Copie também a linha com os nomes das plataformas.');
    return result;
  }

  const parsed = new Map();
  columnIndexes.forEach(({ platformName }) => {
    parsed.set(platformName, {
      platformName,
      fields: {},
      sourceRows: {},
      missing: [],
      invalid: []
    });
  });

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const field = normalizeFieldLabel(row[0]);
    if (!field) {
      if (row.some(cell => cell !== '')) {
        result.warnings.push(`Linha ${rowIndex + 1}: rótulo não reconhecido; foi ignorada.`);
      }
      continue;
    }

    if (['difference', 'balance', 'rbPlusBonus'].includes(field)) {
      if (!result.ignoredFields.includes(field)) result.ignoredFields.push(field);
      continue;
    }

    columnIndexes.forEach(({ col, platformName }) => {
      const item = parsed.get(platformName);
      const raw = row[col] ?? '';
      item.sourceRows[field] = rowIndex + 1;

      if (raw === '') {
        item.missing.push(field);
        return;
      }

      const value = parseLocaleNumber(raw);
      if (!Number.isFinite(value)) {
        item.invalid.push({ field, raw, row: rowIndex + 1 });
        return;
      }

      item.fields[field] = value;
    });
  }

  const required = ['deposit', 'withdrawal', 'wagered', 'betCount', 'bonus', 'resultBetting'];

  for (const item of parsed.values()) {
    const missing = [...new Set(item.missing)];
    const invalid = item.invalid.slice();

    // A linha pode existir na planilha, mas sem valor. Isso não é permitido
    // para uma importação fechada: a semana precisa dos 6 campos brutos.
    required.forEach(field => {
      if (!(field in item.fields) && !missing.includes(field)) missing.push(field);
    });

    item.missing = missing;
    item.invalid = invalid;

    result.platforms.push({
      platformName: item.platformName,
      fields: { ...item.fields },
      missing: item.missing,
      invalid: item.invalid,
      valid: item.missing.length === 0 && item.invalid.length === 0
    });
  }

  result.ok = result.platforms.some(p => p.valid);
  return result;
}

export function formatImportedFieldName(field) {
  return {
    deposit: 'Depósito',
    withdrawal: 'Saque',
    wagered: 'Apostado',
    betCount: 'N° de apostas',
    bonus: 'Bônus',
    resultBetting: 'R.B.'
  }[field] || field;
}

export function formatImportedNumber(value) {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
