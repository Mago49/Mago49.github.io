// === LÓGICA FINANCEIRA SEMANAL (Página 5 — Financeiro) ===
// Função pura (sem document.). Semana = segunda a domingo, fixa e igual
// pra todas as plataformas — independente do lastResetDate de cada uma
// (que só vale pro ciclo de nível/VIP, ver cycle-logic.js). Isso substitui
// a planilha externa: os campos brutos (depósito, saque, aposta) são
// somados AO VIVO durante a semana; no domingo, Bônus e Result Betting
// são informados e a semana é CONGELADA pra sempre em
// platform.financeWeeks — depois disso os 8 campos não recalculam mais,
// viram um retrato fixo daquela semana (igual uma linha já preenchida na
// planilha antiga).

// Segunda-feira 00:00:00 da semana que contém `date`.
export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo, 1 = segunda ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

// Domingo 23:59:59.999 da mesma semana.
export function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function sumInRange(events, weekStart, weekEnd, key) {
  return (events || [])
    .filter(e => {
      const d = new Date(e.date);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, e) => sum + (Number(e[key]) || 0), 0);
}

// Totais AO VIVO da semana em aberto — recalculados toda vez que a tela é
// aberta, a partir de deposits (já existente) + withdrawals + betEntries.
export function computeCurrentWeekLive(platform, refDate = new Date()) {
  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);

  const deposit = sumInRange(platform.deposits, weekStart, weekEnd, 'value');
  const withdrawal = sumInRange(platform.withdrawals, weekStart, weekEnd, 'value');
  const wagered = sumInRange(platform.betEntries, weekStart, weekEnd, 'wagered');
  const betCount = sumInRange(platform.betEntries, weekStart, weekEnd, 'betCount');

  return {
    weekStart,
    weekEnd,
    deposit,
    withdrawal,
    difference: withdrawal - deposit,
    wagered,
    betCount
  };
}

// Já existe um registro fechado pra semana atual?
export function isCurrentWeekClosed(platform, refDate = new Date()) {
  const weekStartStr = getWeekStart(refDate).toISOString().slice(0, 10);
  return (platform.financeWeeks || []).some(w => w.weekStart === weekStartStr);
}

// O botão "Fechar semana" só aparece aos domingos.
export function canCloseCurrentWeek(refDate = new Date()) {
  return refDate.getDay() === 0;
}

// CONGELA a semana atual: calcula os 8 campos e grava fixo em
// platform.financeWeeks. Depois de fechada, esse registro nunca mais
// muda — mesmo que novos depósitos/saques/apostas sejam lançados depois
// com data retroativa por engano.
export function closeWeek(platform, bonus, resultBetting, refDate = new Date()) {
  const live = computeCurrentWeekLive(platform, refDate);
  const bonusNum = Number(bonus) || 0;
  const resultBettingNum = Number(resultBetting) || 0;

  const entry = {
    weekStart: live.weekStart.toISOString().slice(0, 10),
    weekEnd: live.weekEnd.toISOString().slice(0, 10),
    deposit: live.deposit,
    withdrawal: live.withdrawal,
    difference: live.difference,
    wagered: live.wagered,
    betCount: live.betCount,
    bonus: bonusNum,
    resultBetting: resultBettingNum,
    rbPlusBonus: resultBettingNum + bonusNum,
    closedAt: new Date().toISOString()
  };

  if (!platform.financeWeeks) platform.financeWeeks = [];
  platform.financeWeeks.push(entry);
  return entry;
}
