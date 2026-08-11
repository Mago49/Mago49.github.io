// === LÓGICA FINANCEIRA SEMANAL (Página 5 — Financeiro) ===
// Função pura (sem document.). Semana = segunda a domingo, fixa e igual
// pra todas as plataformas — independente do lastResetDate de cada uma
// (que só vale pro ciclo de nível/VIP, ver cycle-logic.js). Isso substitui
// a planilha externa: os campos brutos (depósito, saque, aposta, R.B. por
// aposta) são somados AO VIVO durante a semana; no domingo, só falta
// informar o Bônus e a semana é CONGELADA pra sempre em
// platform.financeWeeks — depois disso os campos não recalculam mais
// sozinhos (só editando manualmente, ver updateClosedWeek), viram um
// retrato fixo daquela semana (igual uma linha já preenchida na planilha
// antiga).
//
// SALDO (Balance): fluxo Depósito → Saldo → Aposta → Resultado → Saldo →
// (domingo) + Bônus → Saldo. Por isso o Saldo NÃO é digitado em lugar
// nenhum — é sempre CALCULADO (ver computeLiveBalance), vitalício (soma
// desde o início, nunca reseta com Fim/Reinício do ciclo VIP, que mexe só
// em `deposits`, nunca em depositLog/withdrawals/betEntries/financeWeeks).
// Saldo de plataforma nunca é negativo na prática — o piso é sempre
// R$ 0,00, aplicado em todo lugar onde o Saldo é calculado ou salvo (ver
// Math.max(0, ...) em computeLiveBalance, closeWeek e updateClosedWeek).

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
// aberta, a partir de depositLog (histórico permanente, nunca zerado por
// Fim/Reinício — ver ui-platform-manage.js) + withdrawals + betEntries.
// R.B. também é ao vivo: cada "Registrar aposta" já pede o R.B. daquela
// aposta, então dá pra somar a semana toda igual Apostado/N° de apostas —
// só o Bônus continua exigindo espera até domingo, porque é a plataforma
// que informa esse valor de uma vez.
export function computeCurrentWeekLive(platform, refDate = new Date()) {
  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);

  const deposit = sumInRange(platform.depositLog, weekStart, weekEnd, 'value');
  const withdrawal = sumInRange(platform.withdrawals, weekStart, weekEnd, 'value');
  const wagered = sumInRange(platform.betEntries, weekStart, weekEnd, 'wagered');
  const betCount = sumInRange(platform.betEntries, weekStart, weekEnd, 'betCount');
  const resultBetting = sumInRange(platform.betEntries, weekStart, weekEnd, 'resultBetting');

  return {
    weekStart,
    weekEnd,
    deposit,
    withdrawal,
    difference: withdrawal - deposit,
    wagered,
    betCount,
    resultBetting
  };
}

// Já existe um registro fechado pra semana atual?
export function isCurrentWeekClosed(platform, refDate = new Date()) {
  const weekStartStr = getWeekStart(refDate).toISOString().slice(0, 10);
  return (platform.financeWeeks || []).some(w => w.weekStart === weekStartStr);
}

// O bloco "Fechar semana" (que hoje só pede o Bônus — R.B. já vem somado
// ao vivo, Saldo é calculado sozinho) só aparece aos domingos: é o dia em
// que normalmente dá pra saber o valor total do bônus da semana na
// plataforma.
export function canCloseCurrentWeek(refDate = new Date()) {
  return refDate.getDay() === 0;
}

// SALDO (Balance) AO VIVO de uma plataforma — vitalício, calculado a
// partir de tudo que já aconteceu com ela desde o início:
//   Saldo = (todos os Depósitos) − (todos os Saques)
//         + (R.B. de todas as semanas) + (todos os Bônus já recebidos)
// Usa depositLog (não deposits — que Fim/Reinício zeram de propósito pro
// ciclo VIP) e withdrawals de forma direta, porque esses dois SEMPRE
// foram registrados evento a evento, sem lacunas.
//
// R.B. é diferente: apostas registradas ANTES de existir o campo R.B. por
// aposta (ver changelog) não têm esse valor guardado em `betEntries` —
// somar `betEntries` inteiro contaria essas apostas antigas como R.B. = 0
// e subestimaria o Saldo. Por isso o R.B. é montado em duas partes:
//   - semanas JÁ FECHADAS: usa o R.B. travado no fechamento
//     (`financeWeeks[].resultBetting`), que é sempre confiável — tanto
//     pras apostas antigas (que tiveram R.B. informado direto no
//     fechamento, no modelo anterior) quanto pras novas (somadas das
//     apostas daquela semana no momento de fechar).
//   - semana ATUAL (ainda aberta): soma `betEntries` só dentro do período
//     desta semana, que já tem R.B. por aposta corretamente preenchido.
//
// PISO EM ZERO: saldo de plataforma nunca é negativo na prática — se a
// conta der um número negativo (dado histórico incompleto, saque
// registrado antes do depósito correspondente, etc.), trava em R$ 0,00
// em vez de mostrar um valor que não existe de verdade.
export function computeLiveBalance(platform, refDate = new Date()) {
  const depositTotal = (platform.depositLog || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
  const withdrawalTotal = (platform.withdrawals || []).reduce((s, w) => s + (Number(w.value) || 0), 0);
  const bonusTotal = (platform.financeWeeks || []).reduce((s, w) => s + (Number(w.bonus) || 0), 0);
  const closedResultBetting = (platform.financeWeeks || []).reduce((s, w) => s + (Number(w.resultBetting) || 0), 0);

  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);
  const currentWeekResultBetting = sumInRange(platform.betEntries, weekStart, weekEnd, 'resultBetting');

  const balance = depositTotal - withdrawalTotal + closedResultBetting + currentWeekResultBetting + bonusTotal;
  return Math.max(0, balance);
}

// CONGELA a semana atual: pega os valores ao vivo (deposit, withdrawal,
// wagered, betCount, resultBetting), soma o Bônus informado na hora do
// fechamento, e grava fixo em platform.financeWeeks. O Saldo também é
// travado nesse momento — "o saldo de domingo" — somando o Bônus desta
// semana ao Saldo ao vivo (que, neste instante, ainda não inclui o bônus
// desta semana, já que ela ainda não está em financeWeeks), com piso em
// R$ 0,00. Depois de fechada, esse registro só muda se o usuário editar
// manualmente (ver updateClosedWeek) — nunca recalcula sozinho.
export function closeWeek(platform, bonus, refDate = new Date()) {
  const live = computeCurrentWeekLive(platform, refDate);
  const bonusNum = Number(bonus) || 0;
  const balanceAtClose = Math.max(0, computeLiveBalance(platform, refDate) + bonusNum);

  const entry = {
    weekStart: live.weekStart.toISOString().slice(0, 10),
    weekEnd: live.weekEnd.toISOString().slice(0, 10),
    deposit: live.deposit,
    withdrawal: live.withdrawal,
    difference: live.difference,
    wagered: live.wagered,
    betCount: live.betCount,
    bonus: bonusNum,
    resultBetting: live.resultBetting,
    rbPlusBonus: live.resultBetting + bonusNum,
    balance: balanceAtClose,
    closedAt: new Date().toISOString()
  };

  if (!platform.financeWeeks) platform.financeWeeks = [];
  platform.financeWeeks.push(entry);
  return entry;
}

// EDITA uma semana JÁ FECHADA. Os 7 campos brutos (deposit, withdrawal,
// wagered, betCount, bonus, resultBetting, balance) podem ser corrigidos
// à mão — por exemplo, se algum valor foi digitado errado no fechamento
// ou numa das apostas da semana, ou se o Saldo travado precisa de ajuste.
// Diferença e R.B.+Bônus NUNCA são editados diretamente: são sempre
// recalculados aqui a partir dos outros campos, pra nunca ficarem
// inconsistentes com o resto do registro. Saldo também tem piso em
// R$ 0,00 aqui — mesma regra de sempre, mesmo em edição manual.
export function updateClosedWeek(platform, weekStart, updatedFields) {
  const entry = (platform.financeWeeks || []).find(w => w.weekStart === weekStart);
  if (!entry) return null;

  const deposit = Number(updatedFields.deposit) || 0;
  const withdrawal = Number(updatedFields.withdrawal) || 0;
  const wagered = Number(updatedFields.wagered) || 0;
  const betCount = Number(updatedFields.betCount) || 0;
  const bonus = Number(updatedFields.bonus) || 0;
  const resultBetting = Number(updatedFields.resultBetting) || 0;
  const balance = Number(updatedFields.balance) || 0;

  entry.deposit = deposit;
  entry.withdrawal = withdrawal;
  entry.difference = withdrawal - deposit;
  entry.wagered = wagered;
  entry.betCount = betCount;
  entry.bonus = bonus;
  entry.resultBetting = resultBetting;
  entry.rbPlusBonus = resultBetting + bonus;
  entry.balance = Math.max(0, balance);
  entry.editedAt = new Date().toISOString();

  return entry;
}

// Soma TODAS as semanas fechadas de UMA plataforma — usado no card "Total
// da plataforma" (Página 5). Os 7 campos de fluxo (deposit, withdrawal,
// difference, wagered, betCount, bonus, resultBetting, rbPlusBonus) só
// consideram semanas já congeladas (financeWeeks); a semana em aberto não
// entra aqui de propósito, porque ainda pode mudar até ser fechada.
// Saldo é diferente: é sempre o valor ATUAL ao vivo (computeLiveBalance,
// já com piso em R$ 0,00), nunca uma soma das semanas.
export function computePlatformTotals(platform) {
  const totals = (platform.financeWeeks || []).reduce((acc, w) => {
    acc.deposit += w.deposit;
    acc.withdrawal += w.withdrawal;
    acc.difference += w.difference;
    acc.wagered += w.wagered;
    acc.betCount += w.betCount;
    acc.bonus += w.bonus;
    acc.resultBetting += w.resultBetting;
    acc.rbPlusBonus += w.rbPlusBonus;
    return acc;
  }, { deposit: 0, withdrawal: 0, difference: 0, wagered: 0, betCount: 0, bonus: 0, resultBetting: 0, rbPlusBonus: 0 });

  totals.balance = computeLiveBalance(platform);
  return totals;
}

// Soma as semanas fechadas de TODAS as plataformas — usado no "Painel
// Geral" no topo da Página 5. from/to são strings 'AAAA-MM-DD' (ou null
// pra não filtrar), comparadas contra o weekStart de cada semana fechada
// — comparação de texto funciona porque o formato ISO já ordena igual a
// uma data de verdade. Saldo é somado por plataforma (cada uma contribui
// com seu Saldo atual, ao vivo, já com piso em R$ 0,00) e NUNCA é afetado
// pelo filtro de datas — representa "quanto tem parado agora em todas as
// plataformas juntas", não uma métrica de um período específico.
export function computeOverallTotals(platforms, from = null, to = null) {
  const totals = { deposit: 0, withdrawal: 0, difference: 0, wagered: 0, betCount: 0, bonus: 0, resultBetting: 0, rbPlusBonus: 0, balance: 0 };

  (platforms || []).forEach(platform => {
    (platform.financeWeeks || []).forEach(w => {
      if (from && w.weekStart < from) return;
      if (to && w.weekStart > to) return;
      totals.deposit += w.deposit;
      totals.withdrawal += w.withdrawal;
      totals.difference += w.difference;
      totals.wagered += w.wagered;
      totals.betCount += w.betCount;
      totals.bonus += w.bonus;
      totals.resultBetting += w.resultBetting;
      totals.rbPlusBonus += w.rbPlusBonus;
    });

    totals.balance += computeLiveBalance(platform);
  });

  return totals;
}
