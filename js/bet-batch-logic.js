// === APOSTAS EM LOTE — lógica pura (Sub-entrega 22) ===
// Sem DOM e sem Firestore: tudo aqui é testável no Node.
//
// ENTRADA: o texto do histórico da plataforma, colado como veio. Cada
// bloco é um jogo no dia (resumo ACUMULADO do dia por jogo):
//   KAGAMING Slot | Pinata
//   Contagem de Apostas: 23
//   Data: 2026-10-15
//   Apostas: 11,50
//   Total de Vitórias/Derrotas: -8,32
// O cabeçalho "PROVEDOR Categoria | Jogo" abre o bloco; a categoria (Slot,
// Pescaria…) é descartada. Valor pode vir na mesma linha ("Data: …") ou na
// linha de baixo. Números no formato brasileiro (11,50 · +5,20 · 1.234,56).
//
// SAÍDA: lançamentos de aposta NO MESMO FORMATO do "🎯 Registrar aposta"
// ({ date, wagered, betCount, resultBetting } + jogo) e mais 2 campos:
//   batchKey  'AAAA-MM-DD|provedor|jogo' (normalizados) — reconhece o mesmo
//             jogo no mesmo dia numa colagem seguinte;
//   noTime    true nas linhas de OUTRO dia (o texto não tem hora): entram às
//             23:58 daquele dia e ficam fora da métrica do Telegram.
//
// COLAR O MESMO DIA DE NOVO: o texto é acumulado. O sistema soma o que já
// existe com aquele batchKey e grava SÓ A DIFERENÇA, na hora da colagem nova
// — o total do jogo no dia fica igual ao último texto, sem apagar nada (os
// horários do rollover, do VIP e do Telegram continuam certos). Texto MENOR
// que o já registrado = erro na linha (confira).
//
// Dinheiro em CENTAVOS inteiros por dentro (sem erro de arredondamento).

import { normalizeKey } from './game-catalog-logic.js';

export const BATCH_MAX_ROWS = 60;
export const NO_TIME_HOUR = 23;
export const NO_TIME_MINUTE = 58;

const CATEGORY_WORDS = new Set([
  'slot', 'slots', 'pescaria', 'pesca', 'fishing', 'fish', 'cassino', 'casino', 'live', 'crash',
  'mini', 'minigame', 'arcade', 'mesa', 'table', 'bingo', 'poker', 'cartas', 'cards', 'esporte',
  'esportes', 'sport', 'sports', 'loteria', 'lottery'
]);

const pad = n => String(n).padStart(2, '0');

export function toDayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function isDayKey(k) {
  if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const toC = v => Math.round(Number(v) * 100);
const fromC = c => Math.round(c) / 100;

// ---------- números e datas ----------

/** "11,50" · "+5,20" · "-8,32" · "−1.234,56" · "R$ 9,00" · "11.50" → número (NaN se não der). */
export function parseSignedMoney(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/[−‒–—]/g, '-').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!s) return NaN;
  let sign = 1;
  if (s[0] === '+' || s[0] === '-') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1);
  }
  if (!s) return NaN;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return NaN;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return sign * Number(s);
}

/** "2026-10-15" · "15/10/2026" · "15/10" (ano de refDate) → 'AAAA-MM-DD' ou null. */
export function parseDayField(raw, refDate = new Date()) {
  const s = String(raw || '').trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  let key = null;
  if (m) key = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  else if ((m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/))) {
    let y = m[3] ? Number(m[3]) : refDate.getFullYear();
    if (y < 100) y += 2000;
    key = `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  return key && isDayKey(key) ? key : null;
}

// ---------- leitura do texto ----------

const FIELD_RES = [
  ['count', /^(contagem\s+de\s+apostas|quantidade\s+de\s+apostas|n[º°o.]?\s*de\s+apostas|n[uú]mero\s+de\s+apostas|rodadas|giros)\b/i],
  ['date', /^(data|dia)\b/i],
  ['wagered', /^(apostas|valor\s+apostado|total\s+apostado|apostado|aposta\s+total|valor\s+das\s+apostas)\b/i],
  ['rb', /^(total\s+de\s+vit[óo]rias?\s*\/\s*derrotas?|vit[óo]rias?\s*\/\s*derrotas?|ganhos?\s*\/\s*perdas?|lucro(\s*\/\s*preju[ií]zo)?|resultado|ganho\s+l[ií]quido|r\.?\s*b\.?)\b/i]
];

function fieldOf(line) {
  const idx = line.indexOf(':');
  const label = (idx >= 0 ? line.slice(0, idx) : line).trim();
  for (const [name, re] of FIELD_RES) {
    if (re.test(label)) return { name, value: idx >= 0 ? line.slice(idx + 1).trim() : '' };
  }
  return null;
}

function splitHeader(line) {
  const i = line.indexOf('|');
  const left = line.slice(0, i).trim();
  const game = line.slice(i + 1).trim();
  const words = left.split(/\s+/).filter(Boolean);
  while (words.length > 1 && CATEGORY_WORDS.has(words[words.length - 1].toLowerCase())) words.pop();
  return { provider: words.join(' ').slice(0, 40), game: game.slice(0, 60) };
}

/**
 * Lê o texto colado.
 * @returns {{ rows: object[], ignored: string[] }}
 *   row: { provider, game, count, dayKey, wagered, rb, raw:{...}, errors:[] }
 *   (os números vêm em reais; inválidos = NaN, apontados em errors)
 */
export function parseBatchText(text, refDate = new Date()) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
  const blocks = [];
  const ignored = [];
  let cur = null;
  let pending = null; // campo cujo valor veio na linha de baixo
  const open = (hdr) => { cur = { provider: hdr ? hdr.provider : '', game: hdr ? hdr.game : '', raw: {} }; blocks.push(cur); };

  lines.forEach(line => {
    if (!line) return;
    if (pending) {
      cur.raw[pending] = line;
      pending = null;
      return;
    }
    const f = fieldOf(line);
    if (f) {
      if (!cur || cur.raw[f.name] !== undefined) open(null); // campo repetido = bloco novo
      if (f.value) cur.raw[f.name] = f.value;
      else pending = f.name;
      return;
    }
    if (line.includes('|')) {
      open(splitHeader(line));
      return;
    }
    ignored.push(line);
  });

  const rows = blocks.slice(0, BATCH_MAX_ROWS).map(b => buildRow(b, refDate));
  return { rows, ignored, truncated: blocks.length > BATCH_MAX_ROWS };
}

function buildRow(b, refDate) {
  const row = {
    provider: b.provider || '',
    game: b.game || '',
    count: b.raw.count !== undefined ? Number(String(b.raw.count).replace(/\D/g, '')) : NaN,
    dayKey: parseDayField(b.raw.date, refDate),
    wagered: parseSignedMoney(b.raw.wagered),
    rb: parseSignedMoney(b.raw.rb),
    raw: { ...b.raw }
  };
  if (b.raw.count !== undefined && !/\d/.test(String(b.raw.count))) row.count = NaN;
  return row;
}

// ---------- validação ----------

/**
 * Erros de uma linha (lista vazia = ok).
 * @param {{ weekStartKey:string, todayKey:string }} lim
 */
export function rowErrors(row, lim) {
  const e = [];
  if (!row.game) e.push('sem o nome do jogo');
  if (!(Number.isInteger(row.count) && row.count > 0)) e.push('nº de apostas inválido');
  if (!(Number.isFinite(row.wagered) && row.wagered > 0)) e.push('valor apostado inválido');
  if (!Number.isFinite(row.rb)) e.push('vitórias/derrotas inválido');
  else if (Number.isFinite(row.wagered) && row.rb < -row.wagered - 0.005) e.push('perda maior que o apostado — confira');
  if (!row.dayKey) e.push('data inválida');
  else if (row.dayKey > lim.todayKey) e.push('data no futuro');
  else if (row.dayKey < lim.weekStartKey) e.push('semana fechada (só a semana aberta)');
  return e;
}

export function batchKeyOf(row) {
  return `${row.dayKey}|${normalizeKey(row.provider)}|${normalizeKey(row.game)}`;
}

/** Junta blocos repetidos (mesmo dia + provedor + jogo) somando os números. */
export function mergeDuplicates(rows) {
  const out = [];
  const byKey = new Map();
  rows.forEach(r => {
    if (!r.game || !r.dayKey) { out.push({ ...r, merged: 1 }); return; }
    const k = batchKeyOf(r);
    if (!byKey.has(k)) {
      const copy = { ...r, merged: 1 };
      byKey.set(k, copy);
      out.push(copy);
      return;
    }
    const a = byKey.get(k);
    a.count = (Number.isFinite(a.count) && Number.isFinite(r.count)) ? a.count + r.count : NaN;
    a.wagered = (Number.isFinite(a.wagered) && Number.isFinite(r.wagered)) ? fromC(toC(a.wagered) + toC(r.wagered)) : NaN;
    a.rb = (Number.isFinite(a.rb) && Number.isFinite(r.rb)) ? fromC(toC(a.rb) + toC(r.rb)) : NaN;
    a.merged++;
  });
  return out;
}

// ---------- plano (o que vai ser gravado) ----------

/** Soma do que já existe na plataforma com aquele batchKey (centavos). */
export function existingForKey(platform, key) {
  const acc = { count: 0, wageredC: 0, rbC: 0, n: 0 };
  (platform && platform.betEntries || []).forEach(e => {
    if (!e || e.batchKey !== key) return;
    acc.n++;
    acc.count += Math.round(Number(e.betCount) || 0);
    acc.wageredC += toC(Number(e.wagered) || 0);
    acc.rbC += toC(Number(e.resultBetting) || 0);
  });
  return acc;
}

/**
 * Plano do lote. NÃO mexe na plataforma.
 * @param {object} platform
 * @param {object[]} rows  linhas (já editadas na prévia)
 * @param {{ now: Date, whenTime?: 'HH:MM', weekStartKey: string }} opt
 * @returns {{ items: object[], entries: object[], totals: {count, wagered, rb}, todayEntries: object[] }}
 *   item: { row, key, status:'new'|'update'|'same'|'error', errors[], delta:{count,wagered,rb}, prev }
 */
export function planBatch(platform, rows, { now = new Date(), whenTime = null, weekStartKey } = {}) {
  const todayKey = toDayKey(now);
  const lim = { todayKey, weekStartKey: weekStartKey || todayKey };
  const merged = mergeDuplicates(rows || []);
  const items = merged.map(row => {
    const errors = rowErrors(row, lim);
    const key = row.game && row.dayKey ? batchKeyOf(row) : null;
    if (errors.length) return { row, key, status: 'error', errors, delta: null, prev: null };
    const prev = existingForKey(platform, key);
    const d = {
      count: row.count - prev.count,
      wageredC: toC(row.wagered) - prev.wageredC,
      rbC: toC(row.rb) - prev.rbC
    };
    if (prev.n > 0 && (d.count < 0 || d.wageredC < 0)) {
      return { row, key, status: 'error', errors: ['valores menores que os já registrados deste jogo hoje — confira o texto'], delta: null, prev };
    }
    if (d.count === 0 && d.wageredC === 0 && d.rbC === 0) {
      return { row, key, status: 'same', errors: [], delta: { count: 0, wagered: 0, rb: 0 }, prev };
    }
    if (d.wageredC <= 0 || d.count <= 0) {
      return { row, key, status: 'error', errors: ['só o resultado mudou, sem aposta nova — confira (ou tire esta linha)'], delta: null, prev };
    }
    return { row, key, status: prev.n > 0 ? 'update' : 'new', errors: [], delta: { count: d.count, wagered: fromC(d.wageredC), rb: fromC(d.rbC) }, prev };
  });

  // Horário: hoje = hora escolhida (padrão agora); um segundo de distância
  // entre as linhas (mantém a ordem). Outro dia = 23:58 daquele dia.
  const go = items.filter(it => it.status === 'new' || it.status === 'update');
  let base = now.getTime();
  if (whenTime && /^\d{2}:\d{2}$/.test(whenTime)) {
    const [hh, mm] = whenTime.split(':').map(Number);
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0).getTime();
    const sameMinute = now.getHours() === hh && now.getMinutes() === mm;
    if (!sameMinute && t <= now.getTime()) base = t;
  }
  const todayGo = go.filter(it => it.row.dayKey === todayKey);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const entries = [];
  const otherCount = new Map();
  go.forEach(it => {
    let ms;
    let noTime = false;
    if (it.row.dayKey === todayKey) {
      const i = todayGo.indexOf(it);
      ms = Math.max(startOfToday, base - (todayGo.length - 1 - i) * 1000);
    } else {
      const [y, m, d] = it.row.dayKey.split('-').map(Number);
      const n = otherCount.get(it.row.dayKey) || 0;
      otherCount.set(it.row.dayKey, n + 1);
      ms = new Date(y, m - 1, d, NO_TIME_HOUR, NO_TIME_MINUTE, 0, 0).getTime() + n * 1000;
      noTime = true;
    }
    const entry = {
      date: new Date(ms).toISOString(),
      wagered: it.delta.wagered,
      betCount: it.delta.count,
      resultBetting: it.delta.rb,
      batchKey: it.key
    };
    if (noTime) entry.noTime = true;
    it.entry = entry;
    entries.push(entry);
  });
  const totals = entries.reduce((a, e) => ({
    count: a.count + e.betCount,
    wageredC: a.wageredC + toC(e.wagered),
    rbC: a.rbC + toC(e.resultBetting)
  }), { count: 0, wageredC: 0, rbC: 0 });
  return {
    items,
    entries,
    todayEntries: entries.filter(e => !e.noTime),
    totals: { count: totals.count, wagered: fromC(totals.wageredC), rb: fromC(totals.rbC) },
    errorCount: items.filter(it => it.status === 'error').length
  };
}

// ---------- jogos ----------

/** Acha o jogo da biblioteca: nome + provedor; senão, nome único. */
export function matchGame(games, name, provider) {
  const nk = normalizeKey(name);
  const pk = normalizeKey(provider);
  const list = (games || []).filter(g => g && normalizeKey(g.name) === nk);
  return list.find(g => normalizeKey(g.provider) === pk) || (list.length === 1 ? list[0] : null);
}

/** Jogos que ainda não existem na biblioteca (sem repetir). */
export function missingGames(games, rows) {
  const out = [];
  const seen = new Set();
  (rows || []).forEach(r => {
    if (!r.game) return;
    if (matchGame(games, r.game, r.provider)) return;
    const k = `${normalizeKey(r.game)}|${normalizeKey(r.provider)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name: r.game, provider: r.provider || '' });
  });
  return out;
}

/** Texto da pergunta do VIP quando é o próprio lote que libera o bônus. */
export function batchVipQuestion() {
  return 'Este lote atinge o mínimo do nível e libera o bônus VIP diário de hoje. Confirme: você já coletou esse bônus? (Sim = ele entra no Rollover antes das apostas do lote; Não = entra no fim do dia.)';
}
