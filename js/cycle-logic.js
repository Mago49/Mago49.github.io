// === LÓGICA DE CICLOS E BÔNUS VIP ===
// Regras de negócio puras: datas de emissão, cálculo de bônus, cor por nível.
// Não mexe no DOM (exceto leitura de variáveis CSS em colorForLevel).

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

export function colorForLevel(valueOrLevel) {
  const root = getComputedStyle(document.documentElement);
  const lvlVars = [
    root.getPropertyValue('--level-0').trim(),
    root.getPropertyValue('--level-1').trim(),
    root.getPropertyValue('--level-2').trim(),
    root.getPropertyValue('--level-3').trim(),
    root.getPropertyValue('--level-4').trim()
  ];

  const v = Number(valueOrLevel);
  if (Number.isInteger(v) && v >= 0 && v <= 4) {
    return lvlVars[v];
  }

  const amount = isNaN(v) ? 0 : v;
  if (amount >= 300) return lvlVars[4];
  if (amount >= 150) return lvlVars[3];
  if (amount >= 70) return lvlVars[2];
  if (amount >= 30) return lvlVars[1];
  return lvlVars[0];
}

export function getEventsForDate(targetDate) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const targetTime = target.getTime();
  return state.platforms.filter(platform =>
    !platform.cycleEnded &&
    computeEmissionDates(platform).some(date => date.getTime() === targetTime)
  );
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

  const cycleStart = getCycleStart(platform, hoje);
  const start = new Date(cycleStart);
  start.setHours(0, 0, 0, 0);

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

  // apenas o diário das plataformas "com" depende do botão "Apostei hoje"
  if (platform.group === 'com') {
    const uniqueBetDays = new Set(
      (platform.betDays || [])
        .filter(dateStr => {
          const d = new Date(dateStr);
          d.setHours(0, 0, 0, 0);
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
