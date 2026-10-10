// === LÓGICA DAS ROTINAS (View Gráficos → Rotinas — Sub-entrega 6) ===
// Função pura: sem DOM e sem Firestore. Lê os dados das plataformas (só
// leitura) pra conferir sozinha se cada rotina foi cumprida num dia.
//
// ROTINA (tudo editável e excluível pelo usuário):
//   { id, name, emoji, color, notes, action, minMode, minValue,
//     perPlatformMin: { [platformId]: R$ }, platformIds: [],
//     schedule: { type, weekdays[], everyDays, fromKey, dates[] },
//     createdAt, updatedAt }
//
// AÇÕES — conferidas com dados que já existem:
//   deposit     depósito no dia >= mínimo (depositLog, permanente)
//   bet         apostado no dia >= mínimo (betEntries) — mínimo pode ser
//               "do nível" (BET_MINIMUM_BY_LEVEL do nível VIGENTE no dia)
//   no-bet      nenhuma aposta no dia (aposta = quebrou)
//   no-deposit  nenhum depósito no dia
//   reminder    marcado à mão (routineMarks) — único tipo manual
//
// AGENDAS (quando a rotina vale):
//   daily       todo dia
//   weekdays    dias da semana escolhidos (0 = domingo ... 6 = sábado)
//   every       a cada N dias, DATA FIXA, contando de fromKey (fromKey,
//               fromKey+N, fromKey+2N...)
//   since-last  a cada N dias DESDE O ÚLTIMO depósito/aposta, por
//               plataforma (cada uma com seu próprio relógio). Só pra
//               deposit/bet. Nunca teve -> vence.
//   dates       datas específicas (ex.: dias proibidos dos próximos meses)
//
// STATUS de um item (rotina × plataforma × dia):
//   done     cumpriu (✅)            pending  ainda não, hoje (⏳)
//   missed   não cumpriu, passado (❌) broken   quebrou proibição (⚠️)
//   ok       proibição respeitada até agora, hoje (🟢)
//   Sucesso = done | ok. Falha = missed | broken. pending = em aberto.
//
// === (Sub-entrega 7b) TIPO DO DEPÓSITO ===
// Campo opcional `depositKind` ('semanal' | 'mensal' | 'aposta' | null) nas
// rotinas "Depositar" e "Não depositar": "contar só o tipo X". Com ele, a
// conferência, o "desde o último" e a projeção olham SÓ os depósitos daquele
// tipo (deposit-kinds.js). null/ausente = qualquer tipo (rotinas antigas
// continuam iguais). Ex.: "🗓️ a cada 8 dias desde a última Ativação
// Semanal" não é zerado por um depósito de aposta no meio do caminho.
// depositRoutineInflows: depósitos de rotina previstos (pro Rollover
// projetado do Planejador) — só leitura.

import { toLocalDateString, roundMoney } from './finance-logic.js';
import { getLevelAt, BET_MINIMUM_BY_LEVEL } from './cycle-logic.js';
import { isDepositKind, getDepositKindId } from './deposit-kinds.js';

const r2 = roundMoney;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const ROUTINE_NAME_MAX = 40;
export const ROUTINE_NOTES_MAX = 200;
export const ROUTINE_DATES_MAX = 366;
export const ROUTINE_HISTORY_DAYS = 30;

export const ROUTINE_ACTIONS = Object.freeze([
  { id: 'deposit', label: 'Depositar', emoji: '💰', usesMin: true, auto: true },
  { id: 'bet', label: 'Apostar', emoji: '🎯', usesMin: true, auto: true },
  { id: 'no-bet', label: 'Não apostar', emoji: '🚫', usesMin: false, auto: true },
  { id: 'no-deposit', label: 'Não depositar', emoji: '⛔', usesMin: false, auto: true },
  { id: 'reminder', label: 'Lembrete', emoji: '☑️', usesMin: false, auto: false }
]);

export const SCHEDULE_TYPES = Object.freeze([
  { id: 'daily', label: 'Todo dia' },
  { id: 'weekdays', label: 'Dias da semana' },
  { id: 'every', label: 'A cada N dias (data fixa)' },
  { id: 'since-last', label: 'A cada N dias (desde o último)' },
  { id: 'dates', label: 'Datas específicas' }
]);

// Sugestões iniciais (o usuário escolhe qualquer cor/emoji).
export const ROUTINE_COLOR_SUGGESTIONS = Object.freeze(['#2563eb', '#15803d', '#dc2626', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#475569']);
export const ROUTINE_EMOJI_SUGGESTIONS = Object.freeze(['💰', '🎯', '🚫', '⛔', '☑️', '📅', '🔥', '🛡️', '⭐', '🎁', '⏰', '💎']);

export const STATUS_INFO = Object.freeze({
  done: { icon: '✅', label: 'Feito', success: true },
  ok: { icon: '🟢', label: 'Respeitado até agora', success: true },
  pending: { icon: '⏳', label: 'Pendente', success: null },
  missed: { icon: '❌', label: 'Não feito', success: false },
  broken: { icon: '⚠️', label: 'Quebrou', success: false }
});

// ---------- datas ----------

function isValidDayKey(key) {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return !isNaN(dt.getTime()) && toLocalDateString(dt) === key;
}

function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

export function diffDays(fromKey, toKey) {
  return Math.round((dayKeyToDate(toKey) - dayKeyToDate(fromKey)) / 86400000);
}

function entryDayKey(e) {
  if (!e || !e.date) return null;
  const d = new Date(e.date);
  return isNaN(d.getTime()) ? null : toLocalDateString(d);
}

function sumOnDay(list, dayKey, field) {
  return (list || []).reduce((s, e) => (entryDayKey(e) === dayKey ? s + (Number(e[field]) || 0) : s), 0);
}

// Último dia ANTES de dayKey com valor > 0 no campo (null se nunca).
function lastPositiveDayBefore(list, dayKey, field) {
  let last = null;
  (list || []).forEach(e => {
    const k = entryDayKey(e);
    if (!k || k >= dayKey || !((Number(e[field]) || 0) > 0)) return;
    if (last === null || k > last) last = k;
  });
  return last;
}

// (7b) Depósitos que contam pra esta rotina (filtro de tipo, se houver).
export function routineDepositKind(routine) {
  return routine && ['deposit', 'no-deposit'].includes(routine.action) && isDepositKind(routine.depositKind)
    ? routine.depositKind
    : null;
}

function depositsFor(routine, platform) {
  const list = (platform && platform.depositLog) || [];
  const kind = routineDepositKind(routine);
  return kind ? list.filter(e => getDepositKindId(e) === kind) : list;
}

// ---------- validação ----------

export function validateRoutine(r) {
  if (!r || typeof r !== 'object') return { ok: false, error: 'Rotina inválida.' };
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return { ok: false, error: 'Dê um nome à rotina.' };
  if (name.length > ROUTINE_NAME_MAX) return { ok: false, error: `Nome muito longo (máx. ${ROUTINE_NAME_MAX}).` };
  if (typeof r.emoji !== 'string' || r.emoji.length > 16) return { ok: false, error: 'Emoji inválido.' };
  if (!COLOR_RE.test(String(r.color || ''))) return { ok: false, error: 'Cor inválida.' };
  if (typeof r.notes !== 'string' || r.notes.length > ROUTINE_NOTES_MAX) return { ok: false, error: `Observação muito longa (máx. ${ROUTINE_NOTES_MAX}).` };
  const action = ROUTINE_ACTIONS.find(a => a.id === r.action);
  if (!action) return { ok: false, error: 'Escolha a ação da rotina.' };
  if (!Array.isArray(r.platformIds)) return { ok: false, error: 'Plataformas inválidas.' };
  if (r.action !== 'reminder' && r.platformIds.length === 0) return { ok: false, error: 'Escolha pelo menos uma plataforma.' };
  if (r.platformIds.length > 300) return { ok: false, error: 'Plataformas demais.' };

  if (action.usesMin) {
    if (!['none', 'value', 'level'].includes(r.minMode)) return { ok: false, error: 'Mínimo inválido.' };
    if (r.minMode === 'level' && r.action !== 'bet') return { ok: false, error: '"Mínimo do nível" só vale pra apostas.' };
    if (r.minMode === 'value' && !(Number(r.minValue) > 0)) return { ok: false, error: 'Informe o valor mínimo.' };
  }
  if (r.depositKind !== undefined && r.depositKind !== null) {
    if (!isDepositKind(r.depositKind)) return { ok: false, error: 'Tipo de depósito inválido.' };
    if (!['deposit', 'no-deposit'].includes(r.action)) return { ok: false, error: 'O tipo de depósito só vale pra "Depositar" ou "Não depositar".' };
  }
  if (r.perPlatformMin && typeof r.perPlatformMin === 'object') {
    for (const [pid, v] of Object.entries(r.perPlatformMin)) {
      if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) return { ok: false, error: 'Valor próprio de plataforma inválido.' };
      if (!r.platformIds.includes(pid)) return { ok: false, error: 'Valor próprio pra plataforma fora da rotina.' };
    }
  }

  const s = r.schedule || {};
  const type = SCHEDULE_TYPES.find(t => t.id === s.type);
  if (!type) return { ok: false, error: 'Escolha quando a rotina vale.' };
  if (s.type === 'weekdays' && !(Array.isArray(s.weekdays) && s.weekdays.length > 0)) return { ok: false, error: 'Escolha pelo menos um dia da semana.' };
  if (s.type === 'every' || s.type === 'since-last') {
    const n = Number(s.everyDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, error: 'O intervalo precisa ser de 1 a 365 dias.' };
  }
  if (s.type === 'every' && !isValidDayKey(s.fromKey)) return { ok: false, error: 'Informe a data de início da contagem.' };
  if (s.type === 'since-last' && !['deposit', 'bet'].includes(r.action)) {
    return { ok: false, error: '"Desde o último" só vale pra depositar ou apostar.' };
  }
  if (s.type === 'dates') {
    if (!Array.isArray(s.dates) || s.dates.length === 0) return { ok: false, error: 'Escolha pelo menos uma data.' };
    if (s.dates.length > ROUTINE_DATES_MAX) return { ok: false, error: `Máximo de ${ROUTINE_DATES_MAX} datas.` };
    if (!s.dates.every(isValidDayKey)) return { ok: false, error: 'Data inválida na lista.' };
  }
  return { ok: true };
}

// Cópia limpa pra gravar (sem undefined, tipos garantidos).
export function cleanRoutine(r) {
  const s = r.schedule || {};
  const action = ROUTINE_ACTIONS.find(a => a.id === r.action);
  const per = {};
  if (r.perPlatformMin && typeof r.perPlatformMin === 'object') {
    Object.entries(r.perPlatformMin).forEach(([pid, v]) => {
      if ((r.platformIds || []).includes(pid) && Number(v) > 0) per[pid] = r2(Number(v));
    });
  }
  return {
    name: String(r.name || '').trim(),
    emoji: String(r.emoji || ''),
    color: String(r.color || '#2563eb'),
    notes: String(r.notes || ''),
    action: r.action,
    minMode: action && action.usesMin ? r.minMode : 'none',
    minValue: action && action.usesMin && r.minMode === 'value' ? r2(Number(r.minValue)) : 0,
    perPlatformMin: action && action.usesMin ? per : {},
    platformIds: [...new Set((r.platformIds || []).map(String))],
    // (7b) null = qualquer tipo.
    depositKind: routineDepositKind(r),
    schedule: {
      type: s.type,
      weekdays: s.type === 'weekdays' ? [...new Set((s.weekdays || []).map(Number))].filter(n => n >= 0 && n <= 6).sort() : [],
      everyDays: (s.type === 'every' || s.type === 'since-last') ? Math.round(Number(s.everyDays)) : 0,
      fromKey: s.type === 'every' ? String(s.fromKey) : '',
      dates: s.type === 'dates' ? [...new Set(s.dates)].filter(isValidDayKey).sort() : []
    }
  };
}

// ---------- agenda ----------

function createdDayKey(routine) {
  const d = new Date(routine.createdAt);
  return isNaN(d.getTime()) ? null : toLocalDateString(d);
}

// A rotina vale neste dia, pra esta plataforma? (platform = null no lembrete geral)
export function isRoutineDue(routine, platform, dayKey) {
  const s = routine.schedule || {};
  switch (s.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return (s.weekdays || []).includes(dayKeyToDate(dayKey).getDay());
    case 'every': {
      if (!isValidDayKey(s.fromKey) || dayKey < s.fromKey) return false;
      return diffDays(s.fromKey, dayKey) % s.everyDays === 0;
    }
    case 'since-last': {
      if (!platform) return false;
      const field = routine.action === 'deposit' ? 'value' : 'wagered';
      const list = routine.action === 'deposit' ? depositsFor(routine, platform) : platform.betEntries;
      const last = lastPositiveDayBefore(list, dayKey, field);
      return last === null || diffDays(last, dayKey) >= s.everyDays;
    }
    case 'dates':
      return (s.dates || []).includes(dayKey);
    default:
      return false;
  }
}

// Mínimo que vale pra esta plataforma neste dia (R$; 0 = qualquer valor > 0).
export function getRoutineMinimum(routine, platform, dayKey) {
  if (platform && routine.perPlatformMin && Number(routine.perPlatformMin[platform.id]) > 0) {
    return Number(routine.perPlatformMin[platform.id]);
  }
  if (routine.minMode === 'value') return Number(routine.minValue) || 0;
  if (routine.minMode === 'level' && platform) {
    const { level } = getLevelAt(platform, dayKeyToDate(dayKey));
    return Number(BET_MINIMUM_BY_LEVEL[level]) || 0;
  }
  return 0;
}

// ---------- conferência ----------

// Status de UM item. marks: { [routineId]: { [platformId|'_']: true } } do dia.
export function evaluateItem(routine, platform, dayKey, todayKey, marks = {}) {
  const isToday = dayKey === todayKey;
  const pid = platform ? platform.id : '_';

  if (routine.action === 'reminder') {
    const marked = !!(marks[routine.id] && marks[routine.id][pid]);
    return { status: marked ? 'done' : (isToday ? 'pending' : 'missed'), amount: null, minimum: null };
  }

  if (routine.action === 'deposit' || routine.action === 'bet') {
    const amount = routine.action === 'deposit'
      ? sumOnDay(depositsFor(routine, platform), dayKey, 'value')
      : sumOnDay(platform.betEntries, dayKey, 'wagered');
    const minimum = getRoutineMinimum(routine, platform, dayKey);
    const ok = minimum > 0 ? amount >= minimum - 0.004 : amount > 0;
    return { status: ok ? 'done' : (isToday ? 'pending' : 'missed'), amount: r2(amount), minimum: r2(minimum) };
  }

  // Proibições
  const amount = routine.action === 'no-bet'
    ? sumOnDay(platform.betEntries, dayKey, 'wagered')
    : sumOnDay(depositsFor(routine, platform), dayKey, 'value');
  if (amount > 0) return { status: 'broken', amount: r2(amount), minimum: null };
  return { status: isToday ? 'ok' : 'done', amount: 0, minimum: null };
}

// Todos os itens de uma rotina num dia (só onde ela vale).
export function evaluateRoutineDay(routine, platforms, dayKey, todayKey, marks = {}) {
  const created = createdDayKey(routine);
  if (created && dayKey < created) return [];
  if (routine.action === 'reminder' && (!routine.platformIds || routine.platformIds.length === 0)) {
    if (!isRoutineDue(routine, null, dayKey)) return [];
    return [{ platformId: '_', platformName: 'Geral', ...evaluateItem(routine, null, dayKey, todayKey, marks) }];
  }
  const byId = new Map((platforms || []).map(p => [p.id, p]));
  const items = [];
  (routine.platformIds || []).forEach(pid => {
    const p = byId.get(pid);
    if (!p) return; // plataforma excluída
    if (!isRoutineDue(routine, p, dayKey)) return;
    items.push({ platformId: p.id, platformName: p.name, ...evaluateItem(routine, p, dayKey, todayKey, marks) });
  });
  return items.sort((a, b) => String(a.platformName).localeCompare(String(b.platformName), 'pt-BR', { numeric: true }));
}

export function summarizeItems(items) {
  const s = { total: items.length, success: 0, fail: 0, pending: 0 };
  items.forEach(i => {
    const info = STATUS_INFO[i.status];
    if (!info) return;
    if (info.success === true) s.success++;
    else if (info.success === false) s.fail++;
    else s.pending++;
  });
  return s;
}

// Documento do histórico de UM dia (gravado uma vez, nunca reescrito).
// Guarda cópia de nome/emoji/cor — o histórico continua legível depois de
// editar ou excluir a rotina.
export function buildDayLog(routines, platforms, dayKey, marks = {}) {
  const out = {};
  (routines || []).forEach(r => {
    const items = evaluateRoutineDay(r, platforms, dayKey, null, marks);
    if (items.length === 0) return;
    const itemMap = {};
    items.forEach(i => { itemMap[i.platformId] = { name: String(i.platformName || ''), status: i.status }; });
    out[r.id] = { name: r.name, emoji: r.emoji, color: r.color, action: r.action, items: itemMap };
  });
  return { date: dayKey, routines: out };
}

// Dias de histórico que ainda faltam gravar: de max(hoje-30, criação mais
// antiga) até ontem, sem documento.
export function listMissingLogDays(routines, todayKey, existingKeys) {
  if (!routines || routines.length === 0) return [];
  const created = routines.map(createdDayKey).filter(Boolean).sort();
  if (created.length === 0) return [];
  let from = addDaysKey(todayKey, -ROUTINE_HISTORY_DAYS);
  if (created[0] > from) from = created[0];
  const yesterday = addDaysKey(todayKey, -1);
  const have = new Set(existingKeys || []);
  const out = [];
  let k = from;
  let guard = 0;
  while (k <= yesterday && guard < 400) {
    if (!have.has(k)) out.push(k);
    k = addDaysKey(k, 1);
    guard++;
  }
  return out;
}

// Resumo de um dia a partir do log gravado (ou de itens ao vivo).
export function summarizeLogRoutine(logRoutine) {
  const items = Object.values((logRoutine && logRoutine.items) || {});
  return summarizeItems(items);
}

// ---------- ligação com o Planejador (só leitura) ----------

// Dias PROIBIDOS de aposta pra plataforma no intervalo: rotinas "Não
// apostar" que incluem a plataforma e valem no dia.
export function forbiddenBetDays(routines, platform, fromKey, toKey) {
  const out = new Set();
  if (!platform || !fromKey || !toKey || fromKey > toKey) return [];
  (routines || []).filter(r => r.action === 'no-bet' && (r.platformIds || []).includes(platform.id)).forEach(r => {
    let k = fromKey;
    let guard = 0;
    while (k <= toKey && guard < 400) {
      if (isRoutineDue(r, platform, k)) out.add(k);
      k = addDaysKey(k, 1);
      guard++;
    }
  });
  return [...out].sort();
}

// Dias em que uma rotina de APOSTA vale, no intervalo — pro "Seguir rotina".
// "Desde o último" é projetado: próximo vencimento = último dia com aposta
// + N (ou o início, se já venceu), depois de N em N, supondo que cada
// aposta planejada é feita.
export function routineBetDays(routine, platform, fromKey, toKey) {
  return routineActionDays(routine, platform, fromKey, toKey);
}

// (7b) Generalização de routineBetDays pra depósito também (respeita o
// filtro de tipo). Mesmo comportamento de antes pra apostas.
export function routineActionDays(routine, platform, fromKey, toKey) {
  if (!routine || !platform || !fromKey || !toKey || fromKey > toKey) return [];
  const s = routine.schedule || {};
  const out = [];
  if (s.type === 'since-last') {
    const last = routine.action === 'deposit'
      ? lastPositiveDayBefore(depositsFor(routine, platform), fromKey, 'value')
      : lastPositiveDayBefore(platform.betEntries, fromKey, 'wagered');
    let k = last ? addDaysKey(last, s.everyDays) : fromKey;
    if (k < fromKey) k = fromKey;
    let guard = 0;
    while (k <= toKey && guard < 400) {
      out.push(k);
      k = addDaysKey(k, s.everyDays);
      guard++;
    }
    return out;
  }
  let k = fromKey;
  let guard = 0;
  while (k <= toKey && guard < 400) {
    if (isRoutineDue(routine, platform, k)) out.push(k);
    k = addDaysKey(k, 1);
    guard++;
  }
  return out;
}

// Rotinas de aposta que incluem a plataforma (opções do "Seguir rotina").
export function betRoutinesFor(routines, platformId) {
  return (routines || []).filter(r => r.action === 'bet' && (r.platformIds || []).includes(platformId));
}

// ---------- (7b) depósitos de rotina previstos ----------

/**
 * Depósitos que as rotinas "Depositar" ainda vão gerar pra plataforma, de
 * HOJE até toKey (pro Rollover projetado do Planejador e pro Misterioso).
 * Hoje só entra se a rotina vale hoje e ainda não foi cumprida. Valor = o
 * mínimo da rotina pra plataforma (sem mínimo definido = não dá pra prever;
 * conta em `unknown`). "Desde o último" é projetado a partir do último
 * depósito (do tipo, se houver filtro) — contando o de hoje, se já houve.
 * @returns {{ items: Array<{key, valueC, routineId, name}>, unknown: number }}
 */
export function depositRoutineInflows(routines, platform, todayKey, toKey) {
  const out = { items: [], unknown: 0 };
  if (!platform || !isValidDayKey(todayKey) || !isValidDayKey(toKey) || todayKey > toKey) return out;
  (routines || []).filter(r => r.action === 'deposit' && (r.platformIds || []).includes(platform.id)).forEach(r => {
    const created = createdDayKey(r);
    const s = r.schedule || {};
    let keys = [];
    if (s.type === 'since-last') {
      const list = depositsFor(r, platform);
      // Vence hoje (relógio pelo último ANTES de hoje)? Então hoje entra se
      // ainda não foi cumprido, e o relógio recomeça hoje. Senão, o próximo
      // é último depósito (inclusive o de hoje) + N.
      const lastBefore = lastPositiveDayBefore(list, todayKey, 'value');
      const dueToday = lastBefore === null || diffDays(lastBefore, todayKey) >= s.everyDays;
      let k;
      if (dueToday) {
        if (evaluateItem(r, platform, todayKey, todayKey).status !== 'done') keys.push(todayKey);
        k = addDaysKey(todayKey, s.everyDays);
      } else {
        const lastIncl = lastPositiveDayBefore(list, addDaysKey(todayKey, 1), 'value');
        k = addDaysKey(lastIncl, s.everyDays);
      }
      let guard = 0;
      while (k <= toKey && guard < 400) {
        keys.push(k);
        k = addDaysKey(k, s.everyDays);
        guard++;
      }
    } else {
      keys = routineActionDays(r, platform, todayKey, toKey);
      if (keys[0] === todayKey && evaluateItem(r, platform, todayKey, todayKey).status === 'done') keys = keys.slice(1);
    }
    if (created) keys = keys.filter(k => k >= created);
    keys.forEach(k => {
      const minimum = getRoutineMinimum(r, platform, k);
      if (!(minimum > 0)) { out.unknown++; return; }
      // Hoje: só o que falta pro mínimo (pode já ter depositado parte).
      let value = minimum;
      if (k === todayKey) value = Math.max(0, minimum - sumOnDay(depositsFor(r, platform), k, 'value'));
      if (value > 0) out.items.push({ key: k, valueC: Math.round(value * 100), routineId: r.id, name: r.name });
    });
  });
  out.items.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}
