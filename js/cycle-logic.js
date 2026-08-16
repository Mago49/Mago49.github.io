// === LÓGICA DE CICLOS E BÔNUS VIP ===
// Regras de negócio puras: datas de emissão, cálculo de bônus, cor por nível.
// Não mexe no DOM (exceto leitura de variáveis CSS em colorForLevel, que
// agora é feita uma única vez e guardada em cache — ver getLevelColors()).

import { state } from './state.js';

export const vipBonusTable = {
  com: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  },
  sem: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  }
};

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

  const daysSinceCycleStart = Math.floor((today - cycleStart) / (1000 * 60 * 60 * 24));

  if (daysSinceCycleStart < 0) return 0;
  return daysSinceCycleStart + 1;
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
  { min: 1000, label: '1.000–1.099' },
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

export function colorForLevel(valueOrLevel) {
  const lvlVars = getLevelColors();

  const v = Number(valueOrLevel);
  if (Number.isInteger(v) && v >= 0 && v < lvlVars.length) {
    return lvlVars[v];
  }

  return lvlVars[levelForAmount(valueOrLevel)];
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

export function getVipBonus(platform) {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);

  const cfg = vipBonusTable[platform.group]?.[platform.level] || {
    daily: 0,
    weekly: 0,
    monthly: 0
  };

  const daily = Number(cfg.daily) || 0;
  const weekly = Number(cfg.weekly) || 0;
  const monthly = Number(cfg.monthly) || 0;

  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let segundasNoMes = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(ano, mes, d).getDay() === 1) {
      segundasNoMes++;
    }
  }

  const weeklyTotal = weekly * segundasNoMes;
  const monthlyTotal = monthly;

  let dailyTotal = daily * diasNoMes;

  // apenas o diário das plataformas "com" depende do botão "Apostei hoje".
  // Conta SEMPRE a partir do dia 1 do mês (getMonthStart) — não do ciclo
  // manual (getCycleStart) — porque o bônus diário é mensal por definição
  // e não pode ser afetado por um Reinício no meio do mês.
  if (platform.group === 'com') {
    const start = getMonthStart(hoje);
    const uniqueBetDays = new Set(
      (platform.betDays || [])
        .filter(dateStr => {
          // Força interpretação LOCAL da data. Uma string só-de-data
          // ("2026-08-16") seria lida pelo JS como meia-noite UTC — 3h
          // ANTES da meia-noite local no Brasil — empurrando o dia pra
          // trás na comparação. Anexar "T00:00:00" corrige isso.
          const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
          return d >= start && d <= hoje;
        })
        .map(dateStr => dateStr.slice(0, 10))
    );

    dailyTotal = daily * uniqueBetDays.size;
  }

  return {
    daily: dailyTotal,
    weekly: weeklyTotal,
    monthly: monthlyTotal,
    total: dailyTotal + weeklyTotal + monthlyTotal
  };
}
