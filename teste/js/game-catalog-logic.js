// === BIBLIOTECA DE JOGOS — lógica pura (Sub-entrega 9) ===
// Sem DOM e sem Firestore. O jogo é uma BIBLIOTECA (catálogo) à parte; a
// aposta continua sendo UM lançamento no Financeiro (betEntries), que só
// passa a guardar QUAL jogo foi:
//   betEntries[i] = { date, wagered, betCount, resultBetting,
//                     gameId?, gameName?, gameProvider? }
// gameName/gameProvider são CÓPIA do momento do lançamento: o histórico
// continua legível mesmo se o jogo for renomeado ou excluído depois.
// Saldo, Rollover, bônus e todo o resto ignoram o jogo (nenhuma soma muda).
//
// Jogo do catálogo: { id, name, provider, stakes:[R$], emoji, notes,
//                     createdAt, updatedAt }
// Provedores: lista editável de nomes (gameConfig/providers).
//
// (Sub-entrega 11a) Características do jogo (pra IA no futuro): etiquetas
// + texto livre — traitsTags:[...], traitsText (traits-logic.js). Jogo
// antigo sem os campos = vazio.

import { parseMoneyInput } from './wager-total-logic.js';
import { cleanTags, cleanTraitsText } from './traits-logic.js';

export const GAME_NAME_MAX = 60;
export const PROVIDER_NAME_MAX = 40;
export const GAME_NOTES_MAX = 200;
export const GAME_STAKES_MAX = 40;
export const GAME_CATALOG_MAX = 1000;
export const PROVIDERS_MAX = 100;

// Provedores do print do usuário ("Popular" é categoria, não provedor).
export const DEFAULT_PROVIDERS = Object.freeze([
  'PG', 'JDB', 'Tada', 'PP', 'PANDA', 'G759', 'inout', 'FASTSPIN', 'PLAYSON', 'CP',
  'RUBYPLAY', 'FaChai', 'POPOK', 'TOPPLAYER', 'Spribe', 'PLAYNGO', 'YELLOWBAT', 'KAGAMING', 'Betby'
]);

// Pré-lista de SUGESTÕES — só aparece pra revisar; nada é gravado sem o
// usuário confirmar. Nomes conferidos em catálogos públicos de slots
// (slotcatalog.com) e nos títulos mais conhecidos de cada provedor.
export const GAME_SUGGESTIONS = Object.freeze([
  ...['Fortune Tiger', 'Fortune Ox', 'Fortune Rabbit', 'Fortune Mouse', 'Fortune Dragon', 'Fortune Snake',
    'Mahjong Ways', 'Mahjong Ways 2', 'Lucky Neko', 'Ganesha Gold', 'Dragon Hatch', 'Treasures of Aztec',
    'Wild Bandito', 'Double Fortune', 'Caishen Wins', 'Cash Mania'].map(name => ({ name, provider: 'PG' })),
  ...['Gates of Olympus', 'Sweet Bonanza', 'Sugar Rush', 'Starlight Princess', 'The Dog House', 'Big Bass Bonanza']
    .map(name => ({ name, provider: 'PP' })),
  ...['Winning Mask', 'Dancing Papa', 'Banana Saga', 'Cash Man', 'Napoleon', 'Lucky Dragons', 'Moonlight Treasure', 'Lucky Qilin']
    .map(name => ({ name, provider: 'JDB' })),
  ...['Fortune Gems 3', 'Lucky Tiger 2', 'Gold Mine Express', 'Coin of Lightning 2', 'Clover Coins 4x4']
    .map(name => ({ name, provider: 'Tada' })),
  ...['Lucky Jungle', 'Lucky Jungle 1024', 'Magic Treasures of Egypt', 'Sultan\'s Tale', 'Blazing Hot', 'Diamond Flash']
    .map(name => ({ name, provider: 'POPOK' })),
  ...['Fortune Treasure', 'Sexy Joker', 'Royal Hunter', 'Golden Aztec Mega', 'Rolling Fortune', 'Boom Boom Marmot']
    .map(name => ({ name, provider: 'YELLOWBAT' })),
  ...['Aviator', 'Mines', 'Plinko'].map(name => ({ name, provider: 'Spribe' })),
  ...['Book of Dead', 'Reactoonz', 'Moon Princess'].map(name => ({ name, provider: 'PLAYNGO' }))
]);

function clean(s, max) {
  return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Chave de comparação (sem acento, minúscula) — evita "Fortune Tiger" e
// "fortune  tiger" duplicados.
export function normalizeKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseStakesText(text) {
  const parts = String(text || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const v = parseMoneyInput(p);
    if (!Number.isFinite(v) || v <= 0 || v > 100000) return { ok: false, error: `Valor inválido: "${p}". Use ponto e vírgula entre os valores — ex.: 0,40; 0,80; 1,20` };
    out.push(Math.round(v * 100) / 100);
  }
  const unique = [...new Set(out)].sort((a, b) => a - b);
  if (unique.length > GAME_STAKES_MAX) return { ok: false, error: `Máximo de ${GAME_STAKES_MAX} valores por jogo.` };
  return { ok: true, stakes: unique };
}

export function formatStakes(stakes) {
  return (stakes || []).map(v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join('; ');
}

/** Valida e devolve a cópia limpa de um jogo (sem id/datas). */
export function cleanGame(g, existing = []) {
  const name = clean(g && g.name, GAME_NAME_MAX);
  if (!name) return { ok: false, error: 'Dê um nome ao jogo.' };
  const provider = clean(g && g.provider, PROVIDER_NAME_MAX);
  const key = normalizeKey(name);
  const dup = (existing || []).find(x => x && x.id !== (g && g.id) && normalizeKey(x.name) === key && normalizeKey(x.provider) === normalizeKey(provider));
  if (dup) return { ok: false, error: `"${dup.name}" já está na biblioteca${provider ? ` (${provider})` : ''}.` };
  const stakes = Array.isArray(g && g.stakes) ? g.stakes.filter(v => Number.isFinite(Number(v)) && Number(v) > 0).map(v => Math.round(Number(v) * 100) / 100) : [];
  if (stakes.length > GAME_STAKES_MAX) return { ok: false, error: `Máximo de ${GAME_STAKES_MAX} valores por jogo.` };
  const emoji = String((g && g.emoji) || '').slice(0, 16);
  const notes = clean(g && g.notes, GAME_NOTES_MAX);
  return {
    ok: true,
    game: {
      name, provider, stakes: [...new Set(stakes)].sort((a, b) => a - b), emoji, notes,
      traitsTags: cleanTags(g && g.traitsTags),
      traitsText: cleanTraitsText(g && g.traitsText)
    }
  };
}

export function cleanProviders(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(n => {
    const name = clean(n, PROVIDER_NAME_MAX);
    const k = normalizeKey(name);
    if (!name || seen.has(k)) return;
    seen.add(k);
    out.push(name);
  });
  return out.slice(0, PROVIDERS_MAX);
}

// Busca por nome ou provedor; recentes (usados por último) primeiro quando
// a busca está vazia.
export function searchGames(games, q, recentIds = []) {
  const key = normalizeKey(q);
  const list = (games || []).filter(g => !key || normalizeKey(g.name).includes(key) || normalizeKey(g.provider).includes(key));
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return list.sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
    if (!key && ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
  });
}

// Jogos usados por último (mais novo primeiro), pelos lançamentos.
export function recentGameIds(platforms, max = 8) {
  const last = new Map();
  (platforms || []).forEach(p => (p.betEntries || []).forEach(e => {
    if (!e || !e.gameId || !e.date) return;
    const t = new Date(e.date).getTime();
    if (!last.has(e.gameId) || t > last.get(e.gameId)) last.set(e.gameId, t);
  }));
  return [...last.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

// Cópia do jogo que vai dentro do lançamento.
export function gameStamp(game) {
  if (!game) return {};
  return { gameId: game.id, gameName: game.name, gameProvider: game.provider || '' };
}

// Aplica (ou remove, com game=null) o jogo num lançamento existente.
export function setEntryGame(entry, game) {
  if (!entry) return;
  if (!game) {
    delete entry.gameId;
    delete entry.gameName;
    delete entry.gameProvider;
    return;
  }
  Object.assign(entry, gameStamp(game));
}

/**
 * Números por jogo (ou por provedor) no período [fromKey, toKey] — chaves
 * 'AAAA-MM-DD' locais. Lançamentos sem jogo entram em "Sem jogo".
 * by: 'game' | 'provider'
 */
export function computeGameStats(platforms, fromKey, toKey, by = 'game', dayKeyOf = null) {
  const keyOf = dayKeyOf || (d => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  });
  const rows = new Map();
  (platforms || []).forEach(p => (p.betEntries || []).forEach(e => {
    if (!e || !e.date || isNaN(new Date(e.date).getTime())) return;
    const k = keyOf(e.date);
    if ((fromKey && k < fromKey) || (toKey && k > toKey)) return;
    let id;
    let label;
    if (by === 'provider') {
      label = e.gameId ? (e.gameProvider || 'Sem provedor') : 'Sem jogo';
      id = normalizeKey(label);
    } else {
      id = e.gameId || '_none';
      label = e.gameId ? (e.gameName || 'Jogo') : 'Sem jogo';
    }
    if (!rows.has(id)) rows.set(id, { id, label, provider: by === 'game' ? (e.gameProvider || '') : '', sessions: 0, wageredC: 0, rbC: 0, wins: 0, losses: 0, winC: 0, lossC: 0 });
    const r = rows.get(id);
    const rb = Math.round((Number(e.resultBetting) || 0) * 100);
    r.sessions++;
    r.wageredC += Math.round((Number(e.wagered) || 0) * 100);
    r.rbC += rb;
    if (rb > 0) { r.wins++; r.winC += rb; } else if (rb < 0) { r.losses++; r.lossC += -rb; }
  }));
  return [...rows.values()].sort((a, b) => (b.wageredC - a.wageredC) || a.label.localeCompare(b.label, 'pt-BR'));
}

// Sugestões que ainda NÃO estão na biblioteca.
export function pendingSuggestions(games) {
  const have = new Set((games || []).map(g => `${normalizeKey(g.name)}|${normalizeKey(g.provider)}`));
  return GAME_SUGGESTIONS.filter(s => !have.has(`${normalizeKey(s.name)}|${normalizeKey(s.provider)}`));
}
