// === HISTÓRICO E PREVISÃO DE CICLOS DO MISTERIOSO — lógica pura (Sub 11c) ===
// Sem DOM e sem Firestore.
//
// CAMPOS NA PLATAFORMA (platforms-store.js normaliza):
//   misteriosoCycle: 'yes' (padrão) | 'no' (sem ciclo) | 'unstable'
//   cycleHistory: [{ type:'reset'|'end', date:'AAAA-MM-DD', at, source }]
//     source: 'auto' (botões Fim/Reinício, a partir de agora) |
//             'rebuild' (reconstruído pelas fotos diárias, conferido por
//             você) | 'manual' (lançado à mão)
//
// RECONSTRUÇÃO: as fotos diárias (dailySnapshots) guardam, por dia e por
// plataforma, o "Dia X" do ciclo e se estava encerrado. Quando o Dia não
// segue a sequência, houve Reinício (data = dia − (Dia X − 1)); quando
// aparece "encerrado", houve Fim. Dias sem foto viram LACUNA: a data fica
// marcada como aproximada. Reinício que cai no dia 1 com o ciclo andando
// junto do mês é a virada automática (sem Reinício manual) — vem
// desmarcado na revisão.
//
// PREVISÃO: aprende o PADRÃO de cada plataforma pelos intervalos entre
// Reinícios (e pela duração das pausas Fim → Reinício) — sem número fixo
// de "regular/irregular" (decisão do usuário: cada plataforma tem o seu):
//   - alternância (ex.: 4, 3, 4, 3 → depois de 3 vem 4) quando os últimos
//     intervalos alternam entre dois valores;
//   - senão, o intervalo MAIS FREQUENTE (empate = o mais recente);
//   - sempre junto da faixa já observada (mín–máx) e de quantas vezes
//     cada intervalo aconteceu. Quanto mais meses registrados, mais firme.

export const CYCLE_STATES = Object.freeze([
  { id: 'yes', label: '✅ Tem ciclo' },
  { id: 'no', label: '🚫 Sem ciclo' },
  { id: 'unstable', label: '⚠️ Instável' }
]);
export const CYCLE_HISTORY_MAX = 400;
export const UNSTABLE_MARGIN_DAYS = 2; // dias antes/depois da virada do mês

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function dayKeyOf(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function addDaysKey(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dayKeyOf(d);
}

export function diffDays(a, b) {
  return Math.round((keyToDate(b) - keyToDate(a)) / 86400000);
}

export function cycleState(platform) {
  const v = platform && platform.misteriosoCycle;
  return v === 'no' || v === 'unstable' ? v : 'yes';
}

export function cleanHistoryEntry(e) {
  if (!e || !['reset', 'end'].includes(e.type) || !KEY_RE.test(String(e.date))) return null;
  return {
    type: e.type,
    date: String(e.date),
    at: typeof e.at === 'string' ? e.at : null,
    source: ['auto', 'rebuild', 'manual'].includes(e.source) ? e.source : 'manual',
    ...(e.approx ? { approx: true } : {})
  };
}

export function sortedHistory(platform) {
  return (Array.isArray(platform && platform.cycleHistory) ? platform.cycleHistory : [])
    .map(cleanHistoryEntry).filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'end' ? -1 : 1));
}

/**
 * Registra um Fim/Reinício na plataforma (em memória — quem chama grava).
 * Não duplica o mesmo tipo na mesma data.
 */
export function recordCycleEvent(platform, type, dateKey, source = 'auto', now = new Date()) {
  if (!platform || !['reset', 'end'].includes(type) || !KEY_RE.test(String(dateKey))) return false;
  if (!Array.isArray(platform.cycleHistory)) platform.cycleHistory = [];
  if (platform.cycleHistory.some(e => e && e.type === type && e.date === dateKey)) return false;
  platform.cycleHistory.push({ type, date: dateKey, at: now.toISOString(), source });
  if (platform.cycleHistory.length > CYCLE_HISTORY_MAX) platform.cycleHistory.splice(0, platform.cycleHistory.length - CYCLE_HISTORY_MAX);
  return true;
}

/** Reinícios conhecidos: histórico + o lastResetDate atual (se faltar). */
export function knownResets(platform) {
  const set = new Set(sortedHistory(platform).filter(e => e.type === 'reset').map(e => e.date));
  if (platform && platform.lastResetDate) {
    const k = dayKeyOf(platform.lastResetDate);
    if (KEY_RE.test(k)) set.add(k);
  }
  return [...set].sort();
}

/**
 * Padrão de uma sequência de intervalos (em ordem cronológica).
 * { n, mean, min, max, freq:[{days,count}], predicted, how:'alternate'|'mode'|'single' }
 */
export function learnPattern(list) {
  if (!list || !list.length) return null;
  const n = list.length;
  const mean = list.reduce((s, v) => s + v, 0) / n;
  const counts = new Map();
  list.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  const freq = [...counts.entries()].map(([days, count]) => ({ days, count })).sort((a, b) => b.count - a.count || a.days - b.days);
  let predicted;
  let how;
  const tail = list.slice(-4);
  const alternates = tail.length >= 4 && new Set(tail).size === 2 && tail.every((v, i) => i < 2 || v === tail[i - 2]) && tail[tail.length - 1] !== tail[tail.length - 2];
  if (n === 1) {
    predicted = list[0];
    how = 'single';
  } else if (alternates) {
    predicted = tail[tail.length - 2];
    how = 'alternate';
  } else {
    const top = freq[0].count;
    const tied = new Set(freq.filter(f => f.count === top).map(f => f.days));
    for (let i = n - 1; i >= 0; i--) if (tied.has(list[i])) { predicted = list[i]; break; }
    how = 'mode';
  }
  return { n, mean, min: Math.min(...list), max: Math.max(...list), freq, predicted, how };
}

function patternText(pt, noun = 'dias') {
  if (!pt) return '';
  if (pt.how === 'single') return `1 intervalo conhecido: ${pt.predicted} ${noun}`;
  const f = pt.freq.slice(0, 3).map(x => `${x.days}d ${x.count}×`).join(', ');
  if (pt.how === 'alternate') {
    const vals = [...new Set(pt.freq.map(x => x.days))].slice(0, 2).join('/');
    return `padrão: alterna ${vals} ${noun} (${f})`;
  }
  return `mais comum ${pt.predicted} ${noun} (${f})${pt.min !== pt.max ? ` · já variou ${pt.min}–${pt.max}` : ''}`;
}

/**
 * Situação e previsão do ciclo.
 * status: 'no-cycle' | 'ended' | 'active'
 */
export function predictCycle(platform, todayKey) {
  const state = cycleState(platform);
  const hist = sortedHistory(platform);
  const resets = knownResets(platform);
  const ends = hist.filter(e => e.type === 'end').map(e => e.date);
  const intervals = [];
  for (let i = 1; i < resets.length; i++) {
    const d = diffDays(resets[i - 1], resets[i]);
    if (d > 0) intervals.push(d);
  }
  // Pausas: cada Fim até o Reinício seguinte.
  const pauses = [];
  ends.forEach(e => {
    const next = resets.find(r => r >= e);
    if (next) pauses.push(Math.max(0, diffDays(e, next)));
  });
  // Intervalo muito maior que o normal (> 2× a mediana) costuma ser
  // Reinício que não foi registrado no meio — fica fora do padrão.
  const clean = (list) => {
    if (list.length < 3) return { kept: list, dropped: 0 };
    const sorted = [...list].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)];
    const kept = list.filter(v => v <= med * 2);
    return { kept, dropped: list.length - kept.length };
  };
  const ci = clean(intervals);
  const iv = learnPattern(ci.kept);
  const ps = learnPattern(pauses);
  const lastReset = resets.length ? resets[resets.length - 1] : null;
  const lastEnd = ends.length ? ends[ends.length - 1] : null;
  const out = {
    state,
    status: state === 'no' ? 'no-cycle' : (platform && platform.cycleEnded ? 'ended' : 'active'),
    lastResetKey: lastReset,
    lastEndKey: lastEnd,
    intervals: iv,
    pauses: ps,
    nextResetKey: null,
    rangeFrom: null,
    rangeTo: null,
    expectedReturnKey: null,
    returnFrom: null,
    returnTo: null,
    samples: resets.length,
    gapsIgnored: ci.dropped
  };
  if (out.status === 'no-cycle') return out;
  if (iv && lastReset) {
    out.nextResetKey = addDaysKey(lastReset, iv.predicted);
    out.rangeFrom = addDaysKey(lastReset, iv.min);
    out.rangeTo = addDaysKey(lastReset, iv.max);
  }
  if (out.status === 'ended') {
    const since = lastEnd || todayKey;
    out.endedSinceKey = since;
    if (ps) {
      out.expectedReturnKey = addDaysKey(since, ps.predicted);
      out.returnFrom = addDaysKey(since, ps.min);
      out.returnTo = addDaysKey(since, ps.max);
    } else if (out.nextResetKey && out.nextResetKey > since) {
      out.expectedReturnKey = out.nextResetKey;
      out.returnFrom = out.rangeFrom;
      out.returnTo = out.rangeTo;
    }
    // Já passou da data prevista e não voltou: previsão "atrasada".
    if (out.expectedReturnKey && todayKey && out.expectedReturnKey < todayKey) out.overdue = true;
  }
  return out;
}

/** Perto da virada do mês (instável). */
export function nearMonthTurn(dayKey, margin = UNSTABLE_MARGIN_DAYS) {
  const d = keyToDate(dayKey);
  const day = d.getDate();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return day <= margin || day > last - margin;
}

/**
 * Dias em que o Planejador NÃO deve planejar aposta/depósito:
 *   - ciclo encerrado: de hoje até a volta prevista (sem previsão = o
 *     período todo);
 *   - instável: os dias perto da virada do mês.
 * Sem ciclo ('no') não pausa nada (a plataforma opera normal, só fora do
 * Misterioso).
 */
export function offCycleKeys(platform, fromKey, toKey, todayKey) {
  const out = [];
  if (!platform || !KEY_RE.test(String(fromKey)) || !KEY_RE.test(String(toKey)) || fromKey > toKey) return out;
  const p = predictCycle(platform, todayKey);
  let k = fromKey;
  let guard = 0;
  while (k <= toKey && guard < 400) {
    if (p.status === 'ended' && k >= todayKey && (!p.expectedReturnKey || p.overdue || k < p.expectedReturnKey)) out.push(k);
    else if (p.state === 'unstable' && nearMonthTurn(k)) out.push(k);
    k = addDaysKey(k, 1);
    guard++;
  }
  return out;
}

/**
 * Reconstrói Fins/Reinícios pelas fotos diárias.
 * snapshots: [{ day, platforms: { [id]: { cycleDay, cycleEnded } } }]
 * Devolve { [platformId]: [{ type, date, approx, monthTurn, gapDays }] }
 * (sem os que já estão no histórico).
 */
export function rebuildFromSnapshots(snapshots, platforms) {
  const out = {};
  const days = (snapshots || []).filter(s => s && KEY_RE.test(String(s.day)) && s.platforms).sort((a, b) => a.day.localeCompare(b.day));
  (platforms || []).forEach(p => {
    const seq = days.map(s => ({ day: s.day, v: s.platforms[p.id] })).filter(x => x.v && typeof x.v === 'object');
    const found = [];
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      const gap = diffDays(a.day, b.day);
      const aEnded = a.v.cycleEnded === true;
      const bEnded = b.v.cycleEnded === true;
      const aDay = Number(a.v.cycleDay) || 0;
      const bDay = Number(b.v.cycleDay) || 0;
      if (!aEnded && bEnded) {
        found.push({ type: 'end', date: b.day, approx: gap > 1, gapDays: gap - 1 });
        continue;
      }
      if (bEnded || bDay <= 0) continue;
      const continues = !aEnded && aDay > 0 && bDay === aDay + gap;
      if (continues) continue;
      const resetKey = addDaysKey(b.day, -(bDay - 1));
      // Virada automática: começa no dia 1 e o ciclo anterior andava junto
      // com o dia do mês (plataforma sem Reinício manual).
      const monthTurn = keyToDate(resetKey).getDate() === 1 && !aEnded && aDay === keyToDate(a.day).getDate();
      found.push({ type: 'reset', date: resetKey, approx: gap > 1 && resetKey <= a.day, gapDays: gap - 1, monthTurn });
    }
    const have = new Set(sortedHistory(p).map(e => `${e.type}|${e.date}`));
    const list = found.filter((e, i, arr) => !have.has(`${e.type}|${e.date}`) && arr.findIndex(x => x.type === e.type && x.date === e.date) === i);
    if (list.length) out[p.id] = list;
  });
  return out;
}

export function describePrediction(p, fmt = (k) => k) {
  if (!p) return '';
  if (p.status === 'no-cycle') return 'Sem ciclo do Misterioso.';
  const parts = [];
  if (p.status === 'ended') {
    parts.push(`Encerrado desde ${fmt(p.endedSinceKey)}`);
    if (p.expectedReturnKey) {
      parts.push(`volta prevista ${fmt(p.expectedReturnKey)}${p.returnFrom !== p.returnTo ? ` (faixa já vista ${fmt(p.returnFrom)}–${fmt(p.returnTo)})` : ''}`);
      if (p.overdue) parts.push('(já passou da previsão)');
      if (p.pauses) parts.push(`pausa: ${patternText(p.pauses)}`);
    } else parts.push('sem dados pra prever a volta');
  } else if (p.nextResetKey) {
    parts.push(`próximo Reinício previsto ${fmt(p.nextResetKey)}`);
  } else {
    parts.push(p.samples ? 'só 1 Reinício conhecido — previsão a partir do 2º' : 'sem Reinício registrado');
  }
  if (p.intervals) parts.push(`ciclo: ${patternText(p.intervals)}`);
  if (p.gapsIgnored) parts.push(`${p.gapsIgnored} intervalo(s) muito longo(s) ignorado(s) — provável Reinício sem registro`);
  if (p.state === 'unstable') parts.push('⚠️ instável na virada do mês');
  return parts.join(' · ');
}
