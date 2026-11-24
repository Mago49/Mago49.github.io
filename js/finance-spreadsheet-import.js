// === IMPORTADOR DE DADOS DA PLANILHA (Financeiro) ===
// Parser puro: não acessa DOM, state, Firebase ou finance-logic.
// Recebe texto tabular copiado da planilha (ou texto compactado sem tabulações)
// e devolve os dados normalizados por plataforma. A gravação continua sendo
// responsabilidade do ui-finance-panel.js, usando addHistoricalWeek() como
// regra financeira única.

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

// Rótulos conhecidos ordenados do mais longo para o mais curto para evitar
// correspondência parcial (ex.: "R.B. + Bonus" antes de "R.B." ou "Bonus").
const COMPACT_FIELD_PATTERNS = [
  'r\.b\.\s*\+\s*b[oô]nus',
  'r\.b\.\s*\+\s*bonus',
  'rb\s*\+\s*b[oô]nus',
  'rb\s*\+\s*bonus',
  'result\s*betting\s*\(r\.b\.\)',
  'result\s*betting\s*\(rb\)',
  'result\s*betting',
  'r\.b\.',
  'r\.b',
  'rb',
  'amount\s*wagered',
  'wagered',
  'apostado',
  'aposta',
  'n[°º]?\s*de\s*apostas',
  'n[°º]?\s*apostas',
  'n[°º]?\s*betting',
  'n[úu]mero\s*de\s*apostas',
  'betting\s*count',
  'dep[oó]sito',
  'deposit',
  'withdrawal',
  'saque',
  'diferen[cç]a',
  'difference',
  'b[oô]nus',
  'bonus',
  'balance',
  'saldo'
];

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/**
 * Divide uma sequência numérica colada sem separadores (ex.: "12585" ou "11,489,74")
 * em `count` colunas de plataformas quando possível.
 *
 * Estratégia:
 * 1. Tenta extrair tokens numéricos explícitos (com sinais, decimais ou milhares).
 * 2. Quando os números vieram totalmente grudados (ex.: "12585" para 2 colunas ou
 *    "11,489,74" para 2 colunas), testa partições possíveis e escolhe a mais plausível.
 */
function splitCompactNumericCells(rawSegment, expectedCount) {
  const cleaned = String(rawSegment ?? '').trim();
  if (!cleaned) return Array(expectedCount).fill('');

  // Caso 1: já existe separação por espaço/tabulação/ponto-e-vírgula
  const whitespaceParts = cleaned.split(/[\s;|]+/).filter(Boolean);
  if (whitespaceParts.length === expectedCount) {
    return whitespaceParts;
  }

  // Caso 2: números com sinal explícito ou decimais completos separados (ex.: "-1632" -> ["-16", "32"] ou "11,489,74" -> ["11,48", "9,74"])
  if (expectedCount === 2) {
    // Se houver um sinal no meio (ex.: "109-117" ou "-16-32")
    const signedSplit = cleaned.match(/^([+-]?[\d.,]+)([+-][\d.,]+)$/);
    if (signedSplit) {
      return [signedSplit[1], signedSplit[2]];
    }

    // Se houver duas vírgulas decimais no estilo BR (ex.: "11,489,74" -> "11,48" e "9,74")
    const twoBrDecimals = cleaned.match(/^([+-]?\d+,\d{2})([+-]?\d+,\d{2})$/);
    if (twoBrDecimals) {
      return [twoBrDecimals[1], twoBrDecimals[2]];
    }

    // Se houver dois pontos decimais (ex.: "11.489.74" -> "11.48" e "9.74")
    const twoDotDecimals = cleaned.match(/^([+-]?\d+\.\d{2})([+-]?\d+\.\d{2})$/);
    if (twoDotDecimals) {
      return [twoDotDecimals[1], twoDotDecimals[2]];
    }
  }

  // Caso 3: backtracking genérico para dividir string compacta em `expectedCount` números válidos
  const tokenRegex = /^[+-]?(?:\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:,\d{3})+\.\d{1,2}|\d+[.,]\d{1,2}|\d+)$/;
  const candidates = [];

  function backtrack(startIdx, parts) {
    if (parts.length === expectedCount) {
      if (startIdx === cleaned.length) {
        candidates.push([...parts]);
      }
      return;
    }

    const remainingParts = expectedCount - parts.length;
    const maxEnd = cleaned.length - (remainingParts - 1);

    for (let endIdx = startIdx + 1; endIdx <= maxEnd; endIdx++) {
      const slice = cleaned.slice(startIdx, endIdx);
      // Evita zeros à esquerda inválidos como "05" (mas permite "0" ou "0,50")
      if (/^[+-]?0\d/.test(slice)) continue;
      if (tokenRegex.test(slice)) {
        parts.push(slice);
        backtrack(endIdx, parts);
        parts.pop();
      }
    }
  }

  backtrack(0, []);

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    // Prefere divisões com tamanhos de dígitos mais equilibrados (ex.: "12585" -> ["125", "85"] em vez de ["1", "2585"])
    candidates.sort((a, b) => {
      const score = arr => {
        const lengths = arr.map(s => s.replace(/[^\d]/g, '').length);
        const maxLen = Math.max(...lengths);
        const minLen = Math.min(...lengths);
        const hasDecimalBonus = arr.filter(s => /[.,]/.test(s)).length * -2;
        return (maxLen - minLen) + hasDecimalBonus;
      };
      return score(a) - score(b);
    });
    return candidates[0];
  }

  // Fallback: retorna o bloco inteiro na primeira coluna para que o validador aponte o campo ausente/inválido
  return [cleaned, ...Array(expectedCount - 1).fill('')];
}

/**
 * Pré-processa textos colados de forma compacta/achatada (ex.: copiados de PDF,
 * mobile ou webview onde \n e \t foram perdidos):
 *   "17/08/2025 (Last 7 days)PP11DDUUDeposit12585Withdrawal109117..."
 *
 * Se o texto já estiver tabulado em múltiplas linhas, retorna sem alterações.
 */
function preprocessCompactClipboard(text, platformNames = []) {
  const raw = String(text ?? '').trim();
  if (!raw) return raw;

  const hasMultipleLines = raw.includes('\n') || raw.includes('\r');
  const hasTabs = raw.includes('\t');
  if (hasMultipleLines && hasTabs) {
    return raw;
  }

  const knownNames = platformNames
    .map(String)
    .map(s => s.trim())
    .filter(Boolean)
    // Ordena do maior para o menor para evitar match parcial
    .sort((a, b) => b.length - a.length);

  if (knownNames.length === 0) return raw;

  const fieldUnionPattern = COMPACT_FIELD_PATTERNS.join('|');
  const firstFieldRegex = new RegExp(`(${fieldUnionPattern})`, 'i');
  const firstFieldMatch = raw.match(firstFieldRegex);

  // Se não encontrar nenhum rótulo de campo conhecido, devolve original
  if (!firstFieldMatch || firstFieldMatch.index === undefined) {
    return raw;
  }

  const headerZone = raw.slice(0, firstFieldMatch.index);
  const bodyZone = raw.slice(firstFieldMatch.index);

  // Extrai todas as plataformas conhecidas presentes na zona do cabeçalho na ordem em que aparecem
  const platformPattern = new RegExp(
    `(${knownNames.map(escapeRegExp).join('|')})`,
    'gi'
  );

  const detectedPlatforms = [];
  let pMatch;
  while ((pMatch = platformPattern.exec(headerZone)) !== null) {
    const matchedText = pMatch[1];
    const canonical = knownNames.find(n => normalizeText(n) === normalizeText(matchedText));
    if (canonical && !detectedPlatforms.includes(canonical)) {
      detectedPlatforms.push(canonical);
    }
  }

  if (detectedPlatforms.length === 0) {
    return raw;
  }

  // Separa os blocos de cada campo dentro do corpo (ex.: "Deposit12585", "Withdrawal109117")
  const fieldSplitRegex = new RegExp(`(${fieldUnionPattern})`, 'gi');
  const tokens = bodyZone.split(fieldSplitRegex).filter(part => part !== '');

  const lines = [['Plataforma', ...detectedPlatforms].join('\t')];

  for (let i = 0; i < tokens.length; i++) {
    const labelCandidate = tokens[i];
    const normalizedField = normalizeFieldLabel(labelCandidate);
    if (!normalizedField) continue;

    const valueChunk = (i + 1 < tokens.length) ? tokens[i + 1] : '';
    // Consome o próximo token se ele não for outro rótulo de campo
    if (i + 1 < tokens.length && !normalizeFieldLabel(tokens[i + 1])) {
      i++;
    }

    const cells = splitCompactNumericCells(valueChunk, detectedPlatforms.length);
    lines.push([labelCandidate.trim(), ...cells].join('\t'));
  }

  return lines.length > 1 ? lines.join('\n') : raw;
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
 * Interpreta uma seleção tabular copiada da planilha (ou texto compactado).
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
  const preprocessedText = preprocessCompactClipboard(text, platformNames);
  const rows = splitClipboardRows(preprocessedText);
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

    // Saldo (balance) NÃO é mais ignorado: é lido como campo OPCIONAL
    // (retrato da semana, vem da planilha do usuário). Difference e
    // R.B. + Bonus continuam calculados pelo sistema.
    if (['difference', 'rbPlusBonus'].includes(field)) {
      if (!result.ignoredFields.includes(field)) result.ignoredFields.push(field);
      continue;
    }

    columnIndexes.forEach(({ col, platformName }) => {
      const item = parsed.get(platformName);
      const raw = row[col] ?? '';
      item.sourceRows[field] = rowIndex + 1;

      if (raw === '') {
        // Saldo em branco não invalida a plataforma (campo opcional).
        if (field !== 'balance') item.missing.push(field);
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
    resultBetting: 'R.B.',
    balance: 'Saldo'
  }[field] || field;
}

export function formatImportedNumber(value) {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
