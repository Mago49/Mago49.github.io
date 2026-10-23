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
//
// === (Sub-entrega 29) 📥 COLAR TABELA DE CICLOS ===
// parseCycleTable(texto, plataformas, hojeKey): lê linhas coladas de
// planilha/anotação (separador tab, ; | , ou 2+ espaços), com ou sem
// cabeçalho. Tipo de cada data: pela coluna do cabeçalho (Reinício/Início
// × Fim/Encerrou), por palavra junto da data ("Fim 12/10", "R 01/10") ou,
// sem nada, em sequência Reinício → Fim → Reinício… (marcado como
// "pela ordem" na revisão). Datas: 16/10, 16/10/26, 16/10/2026,
// 2026-10-16, 16-10-2026, 16.10. Sem ano: o ano de hoje (data futura = ano
// anterior). Data no futuro = inválida. Nada é gravado aqui — a tela
// revisa e grava pelo savePlatform de sempre (só cycleHistory).

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
    // (Sub-entrega 19) Só a parte da data (dia LOCAL) — '...Z' ou só a
    // data viravam o dia anterior no Brasil.
    const raw = String(platform.lastResetDate);
    const k = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : dayKeyOf(platform.lastResetDate);
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


// ---------- (29) 📥 tabela de ciclos ----------

function stripAccents(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normName(t) {
  return stripAccents(t).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const RESET_WORD = /\b(rein[ií]cio|reinicio|reiniciou|in[ií]cio|inicio|come[cç]o|comecou|reset|abriu|r)\b/i;
const END_WORD = /\b(fim|encerr\w*|termin\w*|t[eé]rmino|acabou|end|f)\b/i;
const DATE_TOKEN = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/g;

// Uma data do texto → 'AAAA-MM-DD' (ou null).
export function parseLooseDate(y4, mA, dA, d, m, y, todayKey) {
  let year;
  let month;
  let day;
  if (y4) { year = Number(y4); month = Number(mA); day = Number(dA); }
  else {
    day = Number(d); month = Number(m);
    if (y) year = String(y).length === 2 ? 2000 + Number(y) : Number(y);
    else {
      year = Number(String(todayKey).slice(0, 4));
      const k0 = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (k0 > todayKey) year -= 1;
    }
  }
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100)) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function splitCells(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes('|')) return line.split('|');
  if (/\s{2,}/.test(line.trim())) return line.trim().split(/\s{2,}/);
  // vírgula só separa quando não é decimal (datas não têm vírgula)
  if (line.includes(',')) return line.split(',');
  return [line];
}

function cellType(text) {
  const t = stripAccents(text).toLowerCase();
  // a palavra mais perto da data vale (a última no texto antes dela)
  const lastReset = Math.max(t.lastIndexOf('rein'), t.lastIndexOf('inicio'), t.lastIndexOf('comec'), t.lastIndexOf('reset'), t.lastIndexOf('abriu'));
  const lastEnd = Math.max(t.lastIndexOf('fim'), t.lastIndexOf('encerr'), t.lastIndexOf('termin'), t.lastIndexOf('acabou'), /\bend\b/.test(t) ? t.lastIndexOf('end') : -1);
  if (lastReset >= 0 || lastEnd >= 0) return lastReset > lastEnd ? 'reset' : 'end';
  // "R 01/10" / "F: 12/10" — letra sozinha logo antes da data
  if (/(^|\s)r\s*:?\s*$/.test(t)) return 'reset';
  if (/(^|\s)f\s*:?\s*$/.test(t)) return 'end';
  return null;
}

/**
 * Lê a tabela colada.
 * @returns {{ rows: Array<{ lineNo, raw, name, platformId, entries: Array<{type, date, how, status}>, problems: string[] }>, header: boolean }}
 *   how: 'coluna' | 'palavra' | 'ordem'; status: 'nova' | 'existe' | 'futura'
 */
export function parseCycleTable(text, platforms, todayKey) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/ /g, ' ')).filter(l => l.trim());
  const plats = (platforms || []).map(p => ({ id: p.id, key: normName(p.name), p }));
  // (29b) Grade por mês: cabeçalho com 2+ meses ("Restart(April)", "Maio"…).
  const gridAt = lines.findIndex(l => splitCells(l).filter(c => monthOfHeader(c)).length >= 2);
  if (gridAt >= 0) {
    const res = parseMonthGrid(lines, gridAt, plats, todayKey);
    res.rows.forEach(r => refreshCycleRowStatus(r, platforms, todayKey));
    return res;
  }
  let header = null;
  const rows = [];
  lines.forEach((line, idx) => {
    const cells = splitCells(line).map(c => c.trim());
    const hasDate = new RegExp(DATE_TOKEN.source).test(line);
    // Cabeçalho: sem data e com nomes de coluna.
    if (!hasDate && !header && cells.some(c => cellType(c))) {
      header = cells.map(c => cellType(c) || (/(plat|nome|casa|site)/i.test(stripAccents(c)) ? 'name' : null));
      return;
    }
    if (!hasDate) {
      rows.push({ lineNo: idx + 1, raw: line, name: line.trim(), platformId: null, entries: [], problems: ['Linha sem data.'] });
      return;
    }
    // Nome: coluna "name" do cabeçalho; senão a primeira célula sem data.
    let name = '';
    if (header && header.includes('name')) name = cells[header.indexOf('name')] || '';
    if (!name) {
      const c0 = cells.find(c => !new RegExp(DATE_TOKEN.source).test(c) && !cellType(c));
      if (c0) name = c0;
      else {
        // "1UUU 01/10 12/10": texto antes da primeira data
        const m0 = line.search(new RegExp(DATE_TOKEN.source));
        name = line.slice(0, m0).replace(RESET_WORD, '').replace(END_WORD, '').replace(/[:;|,\t-]+$/g, '').trim();
      }
    }
    const entries = [];
    const problems = [];
    let nextSeq = 'reset';
    cells.forEach((cell, ci) => {
      const colType = header ? (header[ci] === 'reset' || header[ci] === 'end' ? header[ci] : null) : null;
      const re = new RegExp(DATE_TOKEN.source, 'g');
      let mm;
      let last = 0;
      while ((mm = re.exec(cell))) {
        const before = cell.slice(last, mm.index);
        last = mm.index + mm[0].length;
        const date = parseLooseDate(mm[1], mm[2], mm[3], mm[4], mm[5], mm[6], todayKey);
        if (!date) { problems.push(`Data inválida: "${mm[0]}".`); continue; }
        let type = null;
        let how = 'ordem';
        const wordType = cellType(before) || (ci > 0 && !colType && !before.trim() ? cellType(cells[ci - 1] && !new RegExp(DATE_TOKEN.source).test(cells[ci - 1]) ? cells[ci - 1] : '') : null);
        if (colType) { type = colType; how = 'coluna'; }
        else if (wordType) { type = wordType; how = 'palavra'; }
        else { type = nextSeq; how = 'ordem'; }
        nextSeq = type === 'reset' ? 'end' : 'reset';
        entries.push({ type, date, how });
      }
    });
    // Plataforma: nome igual (sem espaço/acento/maiúscula); senão começo único.
    const key = normName(name);
    let match = plats.find(x => x.key === key);
    if (!match && key) {
      const cands = plats.filter(x => x.key.startsWith(key) || key.startsWith(x.key));
      if (cands.length === 1) match = cands[0];
    }
    if (!match) problems.push(name ? `Plataforma "${name}" não encontrada — escolha na lista.` : 'Sem nome de plataforma — escolha na lista.');
    rows.push({ lineNo: idx + 1, raw: line, name, platformId: match ? match.id : null, entries, problems });
  });
  rows.forEach(r => refreshCycleRowStatus(r, platforms, todayKey));
  return { rows, header: !!header };
}

// ---------- (29b) grade por mês ----------

const MONTH_WORDS = {
  jan: 1, janeiro: 1, january: 1,
  fev: 2, fevereiro: 2, feb: 2, february: 2,
  mar: 3, marco: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  mai: 5, maio: 5, may: 5,
  jun: 6, junho: 6, june: 6,
  jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, setembro: 9, sep: 9, sept: 9, september: 9,
  out: 10, outubro: 10, oct: 10, october: 10,
  nov: 11, novembro: 11, november: 11,
  dez: 12, dezembro: 12, dec: 12, december: 12,
};
export const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Mês citado no título da coluna (1–12) ou 0.
export function monthOfHeader(cell) {
  const words = stripAccents(cell).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const w of words) if (MONTH_WORDS[w]) return MONTH_WORDS[w];
  return 0;
}

function keyOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function validKey(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? keyOf(y, m, d) : null;
}

/**
 * Grade: 1 linha por plataforma, 1 coluna por mês. Célula = dia ("18"),
 * dia/mês ("06/08") ou vazio/"x" (sem data naquele mês). Coluna sem título
 * logo depois do último mês = mês seguinte, marcada como palpite.
 * Tipo pela coluna: título com Fim/Encerr/End → Fim; senão Reinício.
 */
function parseMonthGrid(lines, gridAt, plats, todayKey) {
  const headCells = splitCells(lines[gridAt]).map(c => c.trim());
  const ty = Number(String(todayKey).slice(0, 4));
  const tm = Number(String(todayKey).slice(5, 7));
  const cols = headCells.map(c => {
    const m = monthOfHeader(c);
    if (!m) return null;
    const isEnd = /\b(fim|encerr\w*|termin\w*|end\w*)\b/.test(stripAccents(c).toLowerCase());
    return { month: m, year: m <= tm ? ty : ty - 1, type: isEnd ? 'end' : 'reset', guess: false, title: c };
  });
  const nameCol = Math.max(0, headCells.findIndex(c => /(plat|nome|casa|site)/i.test(stripAccents(c))));
  const lastMonthCol = cols.reduce((a, c, i) => (c ? i : a), -1);
  const firstMonth = cols.find(Boolean);
  const monthsRead = cols.filter(Boolean).map(c => MONTH_NAMES_PT[c.month - 1]);
  // Colunas sem título depois do último mês: palpite = mês seguinte.
  function colFor(ci) {
    if (cols[ci]) return cols[ci];
    if (ci <= lastMonthCol || headCells[ci]) return null;
    const base = cols[lastMonthCol];
    let m = base.month + (ci - lastMonthCol);
    let y = base.year;
    while (m > 12) { m -= 12; y += 1; }
    return { month: m, year: y, type: base.type, guess: true, title: '' };
  }
  const rows = [];
  let skippedEmpty = 0;
  lines.forEach((line, idx) => {
    if (idx <= gridAt) return;
    const cells = splitCells(line).map(c => c.trim());
    const name = cells[nameCol] || '';
    const entries = [];
    const problems = [];
    cells.forEach((cell, ci) => {
      if (ci === nameCol || !cell || /^[x\-–—]+$/i.test(cell)) return;
      const col = colFor(ci);
      if (!col) {
        problems.push(`"${cell}" está numa coluna sem mês — ignorado.`);
        return;
      }
      const colName = col.guess ? `${MONTH_NAMES_PT[col.month - 1]} (coluna sem título)` : MONTH_NAMES_PT[col.month - 1];
      let date = null;
      let warn = '';
      if (/^\d+$/.test(cell)) {
        date = validKey(col.year, col.month, Number(cell));
        if (!date) {
          problems.push(Number(cell) > 31 ? `"${cell}" em ${colName} não é um dia — ignorado.` : `Dia ${cell} não existe em ${colName} — ignorado.`);
          return;
        }
      } else {
        const mm = cell.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
        if (!mm) {
          problems.push(`"${cell}" em ${colName} não é data — ignorado.`);
          return;
        }
        const d = Number(mm[1]);
        const m = Number(mm[2]);
        let y = mm[3] ? (mm[3].length === 2 ? 2000 + Number(mm[3]) : Number(mm[3])) : col.year;
        // dia/mês de outro mês perto da virada do ano (ex.: 02/01 na coluna Dezembro)
        if (!mm[3] && Math.abs(m - col.month) > 6) y += m < col.month ? 1 : -1;
        date = validKey(y, m, d);
        if (!date) {
          problems.push(`Data inválida "${cell}" em ${colName} — ignorada.`);
          return;
        }
        if (m !== col.month) warn = `está na coluna ${colName}`;
      }
      if (col.guess) warn = warn ? `${warn}; coluna sem título lida como ${MONTH_NAMES_PT[col.month - 1]}` : `coluna sem título lida como ${MONTH_NAMES_PT[col.month - 1]}`;
      entries.push({ type: col.type, date, how: 'coluna', warn });
    });
    if (!entries.length && !problems.length) { skippedEmpty++; return; }
    const key = normName(name);
    let match = plats.find(x => x.key === key);
    if (!match && key) {
      const cands = plats.filter(x => x.key.startsWith(key) || key.startsWith(x.key));
      if (cands.length === 1) match = cands[0];
    }
    if (!match) problems.push(name ? `Plataforma "${name}" não encontrada — escolha na lista.` : 'Sem nome de plataforma — escolha na lista.');
    rows.push({ lineNo: idx + 1, raw: line, name, platformId: match ? match.id : null, entries, problems });
  });
  return {
    rows,
    header: true,
    grid: { months: monthsRead, firstMonth: firstMonth ? firstMonth.month : 0, skippedEmpty },
  };
}

// Situação de cada data da linha (nova / já existe / futura).
export function refreshCycleRowStatus(row, platforms, todayKey) {
  const p = (platforms || []).find(x => x.id === row.platformId) || null;
  const have = new Set(p ? sortedHistory(p).map(e => `${e.type}|${e.date}`) : []);
  const seen = new Set();
  row.entries.forEach(e => {
    const k = `${e.type}|${e.date}`;
    if (e.date > todayKey) e.status = 'futura';
    else if (have.has(k) || seen.has(k)) e.status = 'existe';
    else e.status = 'nova';
    seen.add(k);
  });
  return row;
}
