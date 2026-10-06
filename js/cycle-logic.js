// === LÓGICA DE CICLOS E BÔNUS VIP ===
// Regras de negócio puras: datas de emissão, cálculo de bônus, cor por nível.
// Não mexe no DOM (exceto leitura de variáveis CSS em colorForLevel, que
// agora é feita uma única vez e guardada em cache — ver getLevelColors()).

import { state } from './state.js';
import { DEFAULT_VIP_LEVELS, findVipTemplateById, getVipTemplateLevelValues } from './vip-bonus-template-logic.js';

// Tabela padrão (plataforma SEM template). A fonte única dos valores é
// DEFAULT_VIP_LEVELS (vip-bonus-template-logic.js); com/sem seguem iguais
// entre si, como sempre foram. Plataforma com template usa a tabela do
// template — ver getVipConfigAt.
export const vipBonusTable = {
  com: DEFAULT_VIP_LEVELS,
  sem: DEFAULT_VIP_LEVELS
};

// === ITEM 15b — MÍNIMO DE APOSTA POR NÍVEL (só grupo 'com') ===
// Fixo, igual espírito de vipBonusTable/LEVEL_INFO — não é por plataforma,
// é por nível VIP (0-5). Abaixo do mínimo do dia, "Apostei hoje" não conta.
export const BET_MINIMUM_BY_LEVEL = { 0: 0, 1: 0, 2: 10, 3: 12, 4: 16, 5: 20 };

function toLocalDayKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// === A0 — NÍVEL/GRUPO COM VIGÊNCIA ===
// levelHistory: [{ date:'AAAA-MM-DD', level, group, vipTemplateId? }], em ordem
// crescente. vipTemplateId (opcional) = template de Bônus VIP vigente (null/
// ausente = tabela padrão) — mesma vigência por dia de nível/grupo.
// Cada entrada vale a partir das 00:00 do dia dela. Sem histórico, vale
// p.level/p.group (plataformas antigas nada reescrevem).
export function getLevelAt(platform, refDate = new Date()) {
  const hist = platform.levelHistory;
  if (!Array.isArray(hist) || hist.length === 0) {
    return { level: platform.level ?? null, group: platform.group ?? null, vipTemplateId: null };
  }
  const key = toLocalDayKey(refDate);
  let found = hist[0];
  for (const entry of hist) {
    if (entry.date <= key) found = entry; else break;
  }
  return { level: found.level ?? null, group: found.group ?? null, vipTemplateId: found.vipTemplateId ?? null };
}

const warnedMissingVipTemplates = new Set();

// Config VIP (valores unitários) + grupo vigentes num dia específico.
export function getVipConfigAt(platform, refDate = new Date()) {
  const { level, group, vipTemplateId } = getLevelAt(platform, refDate);

  // Template VIP: só vale com grupo (com/sem) E nível definidos — plataforma
  // "não configurada" nunca recebe bônus, com ou sem template. A versão do
  // template é a vigente NAQUELE dia (nunca retroage). Todo cálculo do
  // sistema (aba VIP, Saldo/Rollover, Histórico, Gráficos) passa por aqui,
  // então todos enxergam o mesmo valor.
  let raw = null;
  if (vipTemplateId && (group === 'com' || group === 'sem') && level !== null && level !== undefined) {
    const template = findVipTemplateById(state.vipBonusTemplates, vipTemplateId);
    if (template) {
      raw = getVipTemplateLevelValues(template, level, toLocalDayKey(refDate));
    } else if (!warnedMissingVipTemplates.has(vipTemplateId)) {
      warnedMissingVipTemplates.add(vipTemplateId);
      console.error(`Template VIP "${vipTemplateId}" não encontrado — usando a tabela padrão pra ${platform.name}.`);
    }
  }
  if (!raw) raw = vipBonusTable[group]?.[level] || { daily: 0, weekly: 0, monthly: 0 };
  return {
    level, group,
    cfg: {
      daily: Number(raw.daily) || 0,
      weekly: Number(raw.weekly) || 0,
      monthly: Number(raw.monthly) || 0
    }
  };
}

// Template VIP vigente HOJE (última entrada do histórico) — null = padrão.
export function getCurrentVipTemplateId(platform) {
  const hist = platform.levelHistory;
  if (!Array.isArray(hist) || hist.length === 0) return null;
  return hist[hist.length - 1].vipTemplateId ?? null;
}

// Registra a troca de nível/grupo/template. CHAMAR ANTES de atribuir p.level/
// p.group. Devolve true se houve mudança. Primeira mudança empilha antes a
// entrada-base (valor antigo, data 1970) pra não perder o passado. Duas
// trocas no mesmo dia substituem a entrada do dia.
// newTemplateId: id do template VIP, null = padrão, undefined (omitido) =
// mantém o template atual — assim trocar só nível/grupo nunca solta o template.
export function recordLevelChange(platform, newLevel, newGroup, refDate = new Date(), newTemplateId = undefined) {
  const oldLevel = platform.level ?? null;
  const oldGroup = platform.group ?? null;
  const oldTemplate = getCurrentVipTemplateId(platform);
  const nl = newLevel ?? null;
  const ng = newGroup ?? null;
  const nt = newTemplateId === undefined ? oldTemplate : (newTemplateId || null);
  if (oldLevel === nl && oldGroup === ng && oldTemplate === nt) return false;

  if (!Array.isArray(platform.levelHistory)) platform.levelHistory = [];
  const hist = platform.levelHistory;
  if (hist.length === 0) hist.push({ date: '1970-01-01', level: oldLevel, group: oldGroup, vipTemplateId: oldTemplate });

  const key = toLocalDayKey(refDate);
  const last = hist[hist.length - 1];
  if (last.date === key) { last.level = nl; last.group = ng; last.vipTemplateId = nt; }
  else hist.push({ date: key, level: nl, group: ng, vipTemplateId: nt });
  return true;
}

// Todos os dias, dentro de [start, end], em que "Apostei hoje" está
// EFETIVAMENTE liberado pra essa plataforma: manual (platform.betDays) OU
// automático (soma de betEntries.wagered daquele dia >= mínimo do nível).
// Recalculado ao vivo a partir de betEntries — nunca grava nada em
// betDays sozinho, então uma correção pra baixo no valor apostado remove
// o efeito imediatamente, sem estado "preso". Fonte ÚNICA usada por
// getVipBonus (total do Bônus VIP) e pelo badge "🎲 X dia(s)" da Edição —
// os dois precisam bater sempre, nunca divergir.
export function getEffectiveBetDayKeys(platform, start, end) {
  const manualKeys = (platform.betDays || [])
    .filter(dateStr => {
      const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
      return d >= start && d <= end;
    })
    .map(dateStr => dateStr.slice(0, 10));

  // A0: grupo e mínimo vêm do nível/grupo VIGENTES em cada dia.
  const wageredByDay = {};
  (platform.betEntries || []).forEach(e => {
    const d = new Date(e.date);
    if (d < start || d > end) return;
    const key = toLocalDayKey(e.date);
    wageredByDay[key] = (wageredByDay[key] || 0) + (Number(e.wagered) || 0);
  });

  const autoKeys = [];
  Object.keys(wageredByDay).forEach(key => {
    const { level, group } = getLevelAt(platform, new Date(`${key}T00:00:00`));
    if (group !== 'com') return;
    const minimo = BET_MINIMUM_BY_LEVEL[level] || 0;
    if (minimo > 0 && wageredByDay[key] >= minimo) autoKeys.push(key);
  });

  return new Set([...manualKeys, ...autoKeys]);
}

// Açúcar sintático — "esse dia específico está liberado?" (usado por
// bonus-ledger-logic.js). dateKey: 'AAAA-MM-DD' local.
export function isBetDayEffective(platform, dateKey) {
  // CORRIGIDO: a janela cobre o DIA INTEIRO (00:00 -> 23:59:59.999).
  // Antes start=end=meia-noite, e qualquer aposta feita depois das 00:00
  // caia em `d > end` e era descartada (Saldo/Rollover/Historico divergiam
  // da aba VIP).
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(`${dateKey}T23:59:59.999`);
  return getEffectiveBetDayKeys(platform, start, end).has(dateKey);
}

export function getCycleStart(platform, refDate = new Date()) {
  if (platform.lastResetDate) {
    const resetDate = new Date(platform.lastResetDate);
    resetDate.setHours(0, 0, 0, 0);
    return resetDate;
  }
  return new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
}

// Início do mês atual (local, meia-noite) — base FIXA usada só pra contar
// dias de aposta do bônus VIP diário ("Apostei hoje"). Diferente de
// getCycleStart: NÃO depende de lastResetDate/Reinício — o bônus diário é
// mensal por definição, então não pode reiniciar quando o ciclo manual de
// depósito/nível é reiniciado (ver buildBetSection/renderBetList em
// ui-platform-manage.js, que usam esta função em vez de getCycleStart).
export function getMonthStart(refDate = new Date()) {
  return new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
}

export function getCurrentCycleDay(platform, refDate = new Date()) {
  const cycleStart = getCycleStart(platform, refDate);
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);

  const daysSinceCycleStart = Math.round((today - cycleStart) / (1000 * 60 * 60 * 24));

  if (daysSinceCycleStart < 0) return 0;
  return daysSinceCycleStart + 1;
}

// Data do depósito mais recente registrado em depositLog (histórico
// PERMANENTE — nunca é zerado por Fim/Reinício, ao contrário de
// `deposits`). Retorna null se a plataforma nunca recebeu nenhum
// depósito. Usada só pra alimentar o badge "Depósito: X dias" (ver
// getDaysSinceLastDeposit logo abaixo).
export function getLastDepositDate(platform) {
  const log = platform.depositLog || [];
  if (log.length === 0) return null;
  return log.reduce((latest, d) => {
    const dt = new Date(d.date);
    return (!latest || dt > latest) ? dt : latest;
  }, null);
}

// Dias desde o último depósito registrado (dia do depósito = Dia 1),
// contado sempre a partir de depositLog — por isso NÃO reseta quando a
// plataforma passa por "Fim" ou "Reinício" (que só zeram `deposits`,
// nunca `depositLog`). Retorna null se a plataforma nunca recebeu
// nenhum depósito; quem chama decide o que fazer nesse caso (ver
// buildRow em ui-platform-manage.js, que omite o badge).
export function getDaysSinceLastDeposit(platform, refDate = new Date()) {
  const lastDate = getLastDepositDate(platform);
  if (!lastDate) return null;

  const start = new Date(lastDate);
  start.setHours(0, 0, 0, 0);

  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);

  const daysSince = Math.round((today - start) / (1000 * 60 * 60 * 24));
  return daysSince + 1;
}

// Dias do ciclo em que o bônus é emitido (2°, 3°, 7°, 15°, 30°)
// cycleStart = Dia 1, por isso subtraímos 1 pra achar o deslocamento em dias.
export function computeEmissionDates(platform, refDate = new Date()) {
  const cycleStart = getCycleStart(platform, refDate);
  const EMISSION_DAYS = [2, 3, 7, 15, 30];
  return EMISSION_DAYS.map(day => {
    const d = new Date(cycleStart);
    d.setDate(d.getDate() + (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export function sumDepositsUpTo(platform, toDate) {
  const cycleStart = getCycleStart(platform, toDate);
  return (platform.deposits || [])
    .filter(d => {
      const depositDate = new Date(d.date);
      return depositDate >= cycleStart && depositDate <= toDate;
    })
    .reduce((s, d) => s + (Number(d.value) || 0), 0);
}

export function getTotalDepositsSinceCycle(platform) {
  return sumDepositsUpTo(platform, new Date());
}

// Faixas de valor por nível — fonte única usada tanto pra pintar
// calendário/lista quanto pra montar a legenda dinâmica (ver ui-hero.js).
export const LEVEL_INFO = [
  { min: 0,    label: '1–29' },
  { min: 30,   label: '30–69' },
  { min: 70,   label: '70–149' },
  { min: 150,  label: '150–299' },
  { min: 300,  label: '300–599' },
  { min: 600,  label: '600–999' },
  { min: 1000, label: '1.000–1.999' },
  { min: 2000, label: '2.000–5.000' }
];

export function levelForAmount(amount) {
  const v = Number(amount);
  const value = isNaN(v) ? 0 : v;
  for (let level = LEVEL_INFO.length - 1; level >= 0; level--) {
    if (value >= LEVEL_INFO[level].min) return level;
  }
  return 0;
}

let cachedLevelColors = null;

function getLevelColors() {
  if (!cachedLevelColors) {
    const root = getComputedStyle(document.documentElement);
    cachedLevelColors = LEVEL_INFO.map((_, level) =>
      root.getPropertyValue(`--level-${level}`).trim()
    );
  }
  return cachedLevelColors;
}

export function colorForLevel(value) {
  const lvlVars = getLevelColors();
  return lvlVars[levelForAmount(value)];
}

export function getEventsForDate(targetDate, platforms = state.platforms) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const targetTime = target.getTime();
  return platforms.filter(platform =>
    !platform.cycleEnded &&
    computeEmissionDates(platform, target).some(date => date.getTime() === targetTime)
  );
}

// === ESTATÍSTICAS DO RESUMO (Hero + Legenda) ===
// Função pura: calcula tudo que o resumo do topo (Página 1) e a legenda
// (Página 2) precisam, sem tocar no DOM. ui-hero.js só recebe o resultado
// e escreve nos elementos — cada página chama só o renderizador que usa.
export function computeHeroStats(platforms) {
  const totalPlatforms = platforms.length;
  const totalDeposits = platforms.reduce((sum, platform) => sum + getTotalDepositsSinceCycle(platform), 0);
  const bonusToday = getEventsForDate(new Date(), platforms).length;
  const activeCycles = platforms.filter(platform => !platform.cycleEnded && platform.lastResetDate && getCurrentCycleDay(platform) > 0).length;
  const topPlatform = [...platforms]
    .filter(platform => !platform.cycleEnded)
    .sort((a, b) => getTotalDepositsSinceCycle(b) - getTotalDepositsSinceCycle(a))[0] || null;
  const topPlatformTotal = topPlatform ? getTotalDepositsSinceCycle(topPlatform) : 0;
  const maxLevel = levelForAmount(topPlatformTotal);

  return { totalPlatforms, totalDeposits, bonusToday, activeCycles, topPlatform, topPlatformTotal, maxLevel };
}

export function getVipBonus(platform, refDate = new Date()) {
  const hoje = new Date(refDate);
  hoje.setHours(23, 59, 59, 999);

  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  // "Apostei hoje" conta sempre a partir do dia 1 do mês (getMonthStart),
  // independente de Reinício — regra inalterada.
  const betKeys = getEffectiveBetDayKeys(platform, getMonthStart(hoje), hoje);

  // A0: soma dia a dia, cada dia com o nível/grupo vigentes NAQUELE dia.
  // Sem aposta: diário todo dia do mês (projeção, como sempre).
  // Com aposta: diário só nos dias liberados, até hoje.
  // Semanal: nas segundas, com o nível da segunda.
  //
  // SUB-ENTREGA 6.2 — byGroup: os mesmos valores, separados pelo grupo
  // (com/sem) que valia em CADA dia. Quem troca de "com aposta" pra "sem
  // aposta" no meio do mês tem os dias antes da troca contados em "com" e
  // os dias depois em "sem" (o Histórico Mensal usava só o grupo ATUAL e
  // jogava o mês inteiro num lado só). A soma de byGroup.com + byGroup.sem
  // é sempre igual a daily/weekly/monthly — nenhum valor existente muda.
  let dailyTotal = 0;
  let weeklyTotal = 0;
  const byGroup = {
    com: { daily: 0, weekly: 0, monthly: 0 },
    sem: { daily: 0, weekly: 0, monthly: 0 }
  };
  for (let d = 1; d <= diasNoMes; d++) {
    const day = new Date(ano, mes, d);
    const { group, cfg } = getVipConfigAt(platform, day);
    if (group === 'sem') {
      dailyTotal += cfg.daily;
      byGroup.sem.daily += cfg.daily;
    } else if (group === 'com' && day <= hoje && betKeys.has(toLocalDayKey(day))) {
      dailyTotal += cfg.daily;
      byGroup.com.daily += cfg.daily;
    }
    if (day.getDay() === 1) {
      weeklyTotal += cfg.weekly;
      if (group === 'com' || group === 'sem') byGroup[group].weekly += cfg.weekly;
    }
  }

  // Mensal: creditado no dia 1, com o nível vigente no dia 1.
  const monthStartCfg = getVipConfigAt(platform, new Date(ano, mes, 1));
  const monthlyTotal = monthStartCfg.cfg.monthly;
  if (monthStartCfg.group === 'com' || monthStartCfg.group === 'sem') {
    byGroup[monthStartCfg.group].monthly += monthlyTotal;
  }

  return {
    daily: dailyTotal,
    weekly: weeklyTotal,
    monthly: monthlyTotal,
    total: dailyTotal + weeklyTotal + monthlyTotal,
    byGroup
  };
}
