// === TELEGRAM — lógica pura (Sub-entrega 21) ===
// Sem DOM e sem Firestore: tudo aqui é testável no Node.
//
// DE ONDE VEM: o bot (repositório privado, ver LEIA-ME.md do bot) lê SÓ os
// canais marcados na aba 📨 Telegram e grava em users/{uid}:
//   telegramFeed/{canal_msg}  mensagens de HOJE (texto, horários, links);
//   telegramDays/{AAAA-MM-DD} SÓ os horários de cada canal no dia:
//     { day, updatedAt,
//       sources: { [chatId]: { title, platformId, msgs: { [msgId]: ['HH:MM'] } } },
//       excluded: { 'chatId_msgId': true } }   <- único campo gravado pelo app
//
// SINAL = um horário sugerido por um canal num dia. Janela = do minuto do
// horário até + windowMin (5/10/15, escolhido por canal no app).
//
// MÉTRICA DE ACERTO (cruzando com as apostas registradas — betEntries):
//   testado  = há aposta naquela plataforma com dia/hora DENTRO da janela;
//   acerto   = testado e R.B. somado da janela > 0;
//   erro     = testado e R.B. < 0;   empate = R.B. = 0 (testado, não acerto);
//   % acerto = acertos ÷ testados;
//   dentro × fora = retorno (R.B. ÷ apostado) das apostas do dia DENTRO de
//   alguma janela do canal contra as de FORA (mesma plataforma, só dias em
//   que o canal mandou horários). É o número que mostra se o canal ajuda.
//   Horário que ainda não chegou = "em breve" (fora da conta); janela
//   aberta agora sem aposta = "agora".
//
// PLATAFORMA DO CANAL: vale a escolhida HOJE em ⚙️ Canais (corrigiu o
// vínculo, o histórico acompanha). Canal que não está mais na lista usa a
// plataforma gravada no dia.
//
// Dinheiro em CENTAVOS inteiros (sem erro de arredondamento).

export const WINDOW_OPTIONS = Object.freeze([5, 10, 15]);
export const DEFAULT_WINDOW = 5;
export const TITLE_MAX = 128;
export const SINCE_ALWAYS_KEY = '2000-01-01';
export const HEARTBEAT_OK_MIN = 12; // sinal de vida a cada 5 min — 12 dá folga pra 2 falhas

export const PERIODS = Object.freeze([
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'all', label: 'Tudo' }
]);

export const STATUS = Object.freeze({
  hit: { icon: '✅', label: 'Acerto' },
  miss: { icon: '❌', label: 'Erro' },
  even: { icon: '➖', label: 'Empate' },
  untested: { icon: '⚪', label: 'Sem aposta' },
  live: { icon: '⏳', label: 'Agora' },
  upcoming: { icon: '🕒', label: 'Em breve' }
});

// ---------- datas (dia LOCAL, nunca UTC) ----------

const pad = n => String(n).padStart(2, '0');

export function toDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDayKey(k) {
  if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDaysKey(k, n) {
  const [y, m, d] = k.split('-').map(Number);
  return toDayKey(new Date(y, m - 1, d + n));
}

export function isTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function periodRange(id, todayKey) {
  switch (id) {
    case 'today': return { fromKey: todayKey, toKey: todayKey };
    case '7d': return { fromKey: addDaysKey(todayKey, -6), toKey: todayKey };
    case '30d': return { fromKey: addDaysKey(todayKey, -29), toKey: todayKey };
    case '90d': return { fromKey: addDaysKey(todayKey, -89), toKey: todayKey };
    default: return { fromKey: SINCE_ALWAYS_KEY, toKey: todayKey };
  }
}

/** Início da janela (ms) do horário 'HH:MM' no dia 'AAAA-MM-DD' (hora local). */
export function windowStart(day, t) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

// ---------- fontes (canais marcados) ----------

export function isChatId(id) {
  return typeof id === 'string' && /^-?\d{1,20}$/.test(id);
}

export function cleanWindow(n) {
  const v = Math.round(Number(n));
  return WINDOW_OPTIONS.includes(v) ? v : DEFAULT_WINDOW;
}

/** Documento de telegramSources/{chatId}, já no formato que as regras aceitam. */
export function cleanSource(raw = {}) {
  const pid = typeof raw.platformId === 'string' && raw.platformId.trim() ? raw.platformId.trim().slice(0, 100) : null;
  return {
    title: String(raw.title || '').slice(0, TITLE_MAX),
    platformId: pid,
    active: raw.active === true,
    kind: raw.kind === 'group' ? 'group' : 'channel',
    windowMin: cleanWindow(raw.windowMin)
  };
}

export function sourceWindow(sources, chatId) {
  const s = sources && sources[chatId];
  return s ? cleanWindow(s.windowMin) : DEFAULT_WINDOW;
}

export function sourcePlatformId(sources, chatId, storedPid) {
  const s = sources && sources[chatId];
  if (s) return s.platformId || null;
  return storedPid || null;
}

// ---------- sinais do dia ----------

/**
 * Sinais de um documento telegramDays.
 * @returns [{ day, chatId, title, platformId, times: [{ t, msgIds:[], excluded }] }]
 *   excluded = todas as mensagens que trazem esse horário foram excluídas no app.
 */
export function daySignals(dayDoc, sources = {}) {
  if (!dayDoc || !isDayKey(dayDoc.day)) return [];
  const excluded = dayDoc.excluded && typeof dayDoc.excluded === 'object' ? dayDoc.excluded : {};
  const out = [];
  Object.entries(dayDoc.sources || {}).forEach(([chatId, src]) => {
    if (!src || typeof src !== 'object') return;
    const byTime = new Map();
    Object.entries(src.msgs || {}).forEach(([msgId, times]) => {
      const ex = excluded[`${chatId}_${msgId}`] === true;
      (Array.isArray(times) ? times : []).filter(isTime).forEach(t => {
        const cur = byTime.get(t) || { t, msgIds: [], live: 0 };
        cur.msgIds.push(msgId);
        if (!ex) cur.live++;
        byTime.set(t, cur);
      });
    });
    if (!byTime.size) return;
    const times = [...byTime.values()]
      .sort((a, b) => a.t.localeCompare(b.t))
      .map(x => ({ t: x.t, msgIds: x.msgIds.sort(), excluded: x.live === 0 }));
    const title = sources[chatId] && sources[chatId].title ? sources[chatId].title : String(src.title || '');
    out.push({ day: dayDoc.day, chatId, title, platformId: sourcePlatformId(sources, chatId, src.platformId), times });
  });
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// ---------- apostas ----------

const cents = v => Math.round((Number(v) || 0) * 100);

/**
 * Apostas (betEntries) da plataforma no dia, com instante em ms.
 * (Sub-entrega 22) Apostas "sem hora" (noTime — lote colado de outro dia,
 * entram às 23:58) ficam FORA: sem hora real, distorceriam o dentro × fora.
 */
export function betsOfDay(platform, day) {
  if (!platform) return [];
  return (platform.betEntries || [])
    .filter(e => e && e.noTime !== true)
    .map(e => {
      const ms = e && e.date ? new Date(e.date).getTime() : NaN;
      return { ms, wageredC: cents(e && e.wagered), rbC: cents(e && e.resultBetting) };
    })
    .filter(b => Number.isFinite(b.ms) && toDayKey(new Date(b.ms)) === day);
}

function emptyAgg() {
  return { bets: 0, wageredC: 0, rbC: 0 };
}

function addBet(agg, b) {
  agg.bets++;
  agg.wageredC += b.wageredC;
  agg.rbC += b.rbC;
}

export function ret(agg) {
  return agg && agg.wageredC > 0 ? agg.rbC / agg.wageredC : null;
}

/**
 * Avalia um canal num dia.
 * @param {{day, times:[{t,excluded}], windowMin, platform, nowMs}} p
 * @returns {{ signals:[{t, excluded, status, startMs, endMs, bets, wageredC, rbC}], inside, outside }}
 */
export function evaluateSourceDay({ day, times, windowMin, platform, nowMs }) {
  const w = cleanWindow(windowMin) * 60000;
  const bets = betsOfDay(platform, day);
  const counted = (times || []).filter(x => !x.excluded && isTime(x.t));
  const inAny = new Set();
  const signals = (times || []).filter(x => isTime(x.t)).map(x => {
    const startMs = windowStart(day, x.t);
    const endMs = startMs + w;
    const agg = emptyAgg();
    bets.forEach((b, i) => {
      if (b.ms >= startMs && b.ms < endMs) {
        addBet(agg, b);
        if (!x.excluded) inAny.add(i);
      }
    });
    let status;
    if (agg.bets > 0) status = agg.rbC > 0 ? 'hit' : (agg.rbC < 0 ? 'miss' : 'even');
    else if (Number.isFinite(nowMs) && nowMs < startMs) status = 'upcoming';
    else if (Number.isFinite(nowMs) && nowMs < endMs) status = 'live';
    else status = 'untested';
    return { t: x.t, excluded: !!x.excluded, status, startMs, endMs, ...agg };
  });
  const inside = emptyAgg();
  const outside = emptyAgg();
  if (counted.length) bets.forEach((b, i) => addBet(inAny.has(i) ? inside : outside, b));
  return { signals, inside, outside };
}

function emptyTotals() {
  return { signals: 0, tested: 0, hits: 0, misses: 0, even: 0, untested: 0, pending: 0, inside: emptyAgg(), outside: emptyAgg() };
}

function addCounts(tot, ev) {
  ev.signals.forEach(s => {
    if (s.excluded) return;
    tot.signals++;
    if (s.status === 'hit') { tot.tested++; tot.hits++; }
    else if (s.status === 'miss') { tot.tested++; tot.misses++; }
    else if (s.status === 'even') { tot.tested++; tot.even++; }
    else if (s.status === 'untested') tot.untested++;
    else tot.pending++;
  });
  ['bets', 'wageredC', 'rbC'].forEach(k => {
    tot.inside[k] += ev.inside[k];
    tot.outside[k] += ev.outside[k];
  });
}

export function finishTotals(tot) {
  return {
    ...tot,
    hitRate: tot.tested > 0 ? tot.hits / tot.tested : null,
    insideRet: ret(tot.inside),
    outsideRet: ret(tot.outside)
  };
}

/**
 * Métrica de acerto no período.
 * @param {{ days: object[], sources: object, platforms: object[], range: {fromKey,toKey},
 *           chatFilter?: string|null, platformFilter?: string|null, nowMs: number }} p
 * @returns {{ totals, bySource: object[], byDay: object[] }}
 */
export function computeAcerto({ days, sources = {}, platforms = [], range, chatFilter = null, platformFilter = null, nowMs }) {
  const pById = new Map((platforms || []).map(p => [p.id, p]));
  const totals = emptyTotals();
  const bySrc = new Map();
  const byDay = [];
  (days || [])
    .filter(d => d && isDayKey(d.day) && (!range || (d.day >= range.fromKey && d.day <= range.toKey)))
    .sort((a, b) => b.day.localeCompare(a.day))
    .forEach(doc => {
      const rows = [];
      daySignals(doc, sources).forEach(s => {
        if (chatFilter && s.chatId !== chatFilter) return;
        if (platformFilter && s.platformId !== platformFilter) return;
        const platform = s.platformId ? pById.get(s.platformId) : null;
        const ev = evaluateSourceDay({ day: s.day, times: s.times, windowMin: sourceWindow(sources, s.chatId), platform, nowMs });
        const c = emptyTotals();
        addCounts(c, ev);
        addCounts(totals, ev);
        if (!bySrc.has(s.chatId)) bySrc.set(s.chatId, { chatId: s.chatId, title: s.title, platformId: s.platformId, platformMissing: false, days: 0, ...emptyTotals() });
        const agg = bySrc.get(s.chatId);
        agg.title = s.title || agg.title;
        agg.platformId = s.platformId;
        if (!platform) agg.platformMissing = true;
        if (c.signals > 0) agg.days++; // dia com tudo excluído não conta como dia do canal
        addCounts(agg, ev);
        rows.push({ chatId: s.chatId, title: s.title, platformId: s.platformId, platformMissing: !platform, times: s.times, ev, counts: finishTotals(c) });
      });
      if (rows.length) byDay.push({ day: doc.day, rows });
    });
  const bySource = [...bySrc.values()].map(finishTotals)
    .sort((a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.signals - a.signals || a.title.localeCompare(b.title));
  return { totals: finishTotals(totals), bySource, byDay };
}

// ---------- feed de hoje ----------

/** Mensagens do feed ordenadas da mais nova pra mais antiga (válidas só). */
export function sortFeed(docs) {
  return (docs || [])
    .filter(d => d && isChatId(String(d.chatId)) && Number.isFinite(Number(d.msgId)))
    .sort((a, b) => String(b.postedAt || '').localeCompare(String(a.postedAt || '')));
}

export function feedKey(chatId, msgId) {
  return `${chatId}_${msgId}`;
}

/** Situação do bot pelo sinal de vida (heartbeatAt, ISO). */
export function botStatus(dialogsDoc, nowMs) {
  const hb = dialogsDoc && dialogsDoc.heartbeatAt ? new Date(dialogsDoc.heartbeatAt).getTime() : NaN;
  if (!Number.isFinite(hb)) return { state: 'never', minutes: null };
  const minutes = Math.max(0, Math.round((nowMs - hb) / 60000));
  return { state: minutes <= HEARTBEAT_OK_MIN ? 'ok' : 'down', minutes };
}

/** Lista de canais pra tela ⚙️ Canais: os do bot + os já marcados que sumiram da lista. */
export function mergeChannelList(dialogsDoc, sources = {}) {
  const items = Array.isArray(dialogsDoc && dialogsDoc.items) ? dialogsDoc.items : [];
  const seen = new Set();
  const out = [];
  items.forEach(it => {
    const id = String(it && it.id);
    if (!isChatId(id) || seen.has(id)) return;
    seen.add(id);
    out.push({ id, title: String(it.title || '').slice(0, TITLE_MAX) || id, kind: it.kind === 'group' ? 'group' : 'channel', missing: false, source: sources[id] || null });
  });
  Object.entries(sources).forEach(([id, s]) => {
    if (seen.has(id)) return;
    out.push({ id, title: s.title || id, kind: s.kind === 'group' ? 'group' : 'channel', missing: true, source: s });
  });
  return out.sort((a, b) => (b.source && b.source.active ? 1 : 0) - (a.source && a.source.active ? 1 : 0) || a.title.localeCompare(b.title));
}
