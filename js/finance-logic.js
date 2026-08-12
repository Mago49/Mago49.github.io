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
// nenhum — é sempre CALCULADO. Saldo de plataforma nunca é negativo na
// prática — o piso é sempre R$ 0,00.
//
// FASES: quando o histórico antigo é incompleto ou tem números
// conhecidamente errados (planilha externa, período sem rastreamento de
// apostas, etc.), dá pra "virar a página" apertando "Iniciar nova fase"
// (ver startNewPhase). Isso NÃO trava um valor calculado — a fase nova
// simplesmente começa a contar DO ZERO a partir daquele momento, sem
// carregar nenhum número da fase anterior. Cada fase (inclusive as já
// fechadas) fica sempre visível e é recalculada AO VIVO a partir dos
// dados brutos (nunca um retrato congelado que possa estar errado) — ver
// computePhaseHistory. O Saldo do dia a dia (badge, Total da plataforma,
// Painel Geral) é sempre o da fase ATUAL (a mais recente).

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

// Data-fronteira da fase ATUAL (a mais recente), ou null se a plataforma
// nunca teve nenhuma fase criada (aí conta desde o início, comportamento
// padrão de antes dessa funcionalidade existir).
function getCurrentPhaseStartDate(platform) {
  const phases = platform.balancePhases || [];
  if (phases.length === 0) return null;
  return phases[phases.length - 1].date;
}

// Fecha a fase atual e começa uma nova, a partir da data escolhida
// (padrão: agora). NÃO trava nenhum valor calculado — é só uma marca no
// tempo. A partir dali, computeLiveBalance ignora tudo que aconteceu
// antes e passa a contar do zero. O resultado da fase que acabou de
// fechar continua disponível pra sempre em computePhaseHistory (nunca é
// apagado, só deixa de contar pro Saldo do dia a dia).
export function startNewPhase(platform, date = new Date()) {
  if (!platform.balancePhases) platform.balancePhases = [];
  const entry = { date: new Date(date).toISOString(), createdAt: new Date().toISOString() };
  platform.balancePhases.push(entry);
  return entry;
}

// Remove a última fronteira de fase criada — a fase mais recente se
// junta de volta com a anterior (o Saldo passa a contar de novo a partir
// da fronteira anterior a essa, ou desde o início se não sobrar nenhuma).
export function removeLastPhase(platform) {
  if (!platform.balancePhases || platform.balancePhases.length === 0) return null;
  return platform.balancePhases.pop();
}

// SALDO (Balance) AO VIVO de uma plataforma — sempre da FASE ATUAL (a
// mais recente, ou desde o início se nenhuma fase foi criada ainda):
//   Saldo = (Depósitos da fase atual) − (Saques da fase atual)
//         + (R.B. da fase atual) + (Bônus da fase atual)
// Nada de fases anteriores entra aqui — cada fase começa do zero, de
// propósito (ver nota no topo do arquivo).
//
// Usa depositLog (não deposits — que Fim/Reinício zeram de propósito pro
// ciclo VIP) e withdrawals de forma direta, porque esses dois SEMPRE
// foram registrados evento a evento, sem lacunas.
//
// R.B. é diferente: apostas registradas ANTES de existir o campo R.B. por
// aposta não têm esse valor guardado em `betEntries` — somar `betEntries`
// inteiro contaria essas apostas antigas como R.B. = 0. Por isso o R.B. é
// montado em duas partes:
//   - semanas JÁ FECHADAS dentro da fase atual: usa o R.B. travado no
//     fechamento (`financeWeeks[].resultBetting`), sempre confiável.
//   - semana ATUAL (ainda aberta): soma `betEntries` só dentro do período
//     desta semana, que já tem R.B. por aposta corretamente preenchido.
//
// PISO EM ZERO: saldo de plataforma nunca é negativo na prática — se a
// conta der um número negativo, trava em R$ 0,00.
export function computeLiveBalance(platform, refDate = new Date()) {
  const phaseStart = getCurrentPhaseStartDate(platform);
  const phaseStartDate = phaseStart ? new Date(phaseStart) : null;
  const isInCurrentPhase = (dateStr) => !phaseStartDate || new Date(dateStr) > phaseStartDate;

  const depositTotal = (platform.depositLog || [])
    .filter(d => isInCurrentPhase(d.date))
    .reduce((s, d) => s + (Number(d.value) || 0), 0);

  const withdrawalTotal = (platform.withdrawals || [])
    .filter(w => isInCurrentPhase(w.date))
    .reduce((s, w) => s + (Number(w.value) || 0), 0);

  const weeksInPhase = (platform.financeWeeks || []).filter(w => isInCurrentPhase(w.weekEnd));
  const bonusTotal = weeksInPhase.reduce((s, w) => s + (Number(w.bonus) || 0), 0);
  const closedResultBetting = weeksInPhase.reduce((s, w) => s + (Number(w.resultBetting) || 0), 0);

  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);
  const currentWeekBets = (platform.betEntries || []).filter(b => isInCurrentPhase(b.date));
  const currentWeekResultBetting = sumInRange(currentWeekBets, weekStart, weekEnd, 'resultBetting');

  const balance = depositTotal - withdrawalTotal + closedResultBetting + currentWeekResultBetting + bonusTotal;
  return Math.max(0, balance);
}

// Monta a lista de TODAS as fases de uma plataforma (inclusive a atual),
// da mais antiga pra mais nova, recalculando cada uma AO VIVO a partir
// dos dados brutos — nunca um valor congelado. Se a plataforma nunca
// teve nenhuma fase criada, retorna uma única "Fase 1" cobrindo a vida
// inteira dela (mesmo comportamento de antes dessa funcionalidade
// existir). Cada fase soma Depósito, Saque, Apostado, N° Apostas, Bônus
// e R.B. só dentro do próprio intervalo — igual computeLiveBalance faz
// pra fase atual, mas pra qualquer fase (passada ou atual).
export function computePhaseHistory(platform, refDate = new Date()) {
  const phases = platform.balancePhases || [];
  const boundaries = [null, ...phases.map(ph => ph.date)];
  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);
  const results = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1] || null;
    const isCurrent = end === null;
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;

    const inRange = (dateStr) => {
      const d = new Date(dateStr);
      if (startDate && !(d > startDate)) return false;
      if (endDate && !(d <= endDate)) return false;
      return true;
    };

    const deposit = (platform.depositLog || []).filter(d => inRange(d.date)).reduce((s, d) => s + (Number(d.value) || 0), 0);
    const withdrawal = (platform.withdrawals || []).filter(w => inRange(w.date)).reduce((s, w) => s + (Number(w.value) || 0), 0);

    const weeksInPhase = (platform.financeWeeks || []).filter(w => inRange(w.weekEnd));
    const bonus = weeksInPhase.reduce((s, w) => s + (Number(w.bonus) || 0), 0);
    let resultBetting = weeksInPhase.reduce((s, w) => s + (Number(w.resultBetting) || 0), 0);
    let wagered = weeksInPhase.reduce((s, w) => s + (Number(w.wagered) || 0), 0);
    let betCount = weeksInPhase.reduce((s, w) => s + (Number(w.betCount) || 0), 0);

    // Só a fase ATUAL pode ter uma semana ainda aberta dentro dela — fases
    // passadas, por definição, já ficaram inteiramente pra trás.
    if (isCurrent) {
      const currentWeekBets = (platform.betEntries || []).filter(b => inRange(b.date));
      resultBetting += sumInRange(currentWeekBets, weekStart, weekEnd, 'resultBetting');
      wagered += sumInRange(currentWeekBets, weekStart, weekEnd, 'wagered');
      betCount += sumInRange(currentWeekBets, weekStart, weekEnd, 'betCount');
    }

    results.push({
      phaseNumber: i + 1,
      startDate: start,
      endDate: end,
      isCurrent,
      deposit,
      withdrawal,
      difference: withdrawal - deposit,
      wagered,
      betCount,
      bonus,
      resultBetting,
      rbPlusBonus: resultBetting + bonus,
      balance: Math.max(0, deposit - withdrawal + resultBetting + bonus)
    });
  }

  return results;
}

// CONGELA a semana atual: pega os valores ao vivo (deposit, withdrawal,
// wagered, betCount, resultBetting), soma o Bônus informado na hora do
// fechamento, e grava fixo em platform.financeWeeks. O Saldo também é
// travado nesse momento — "o saldo de domingo" — somando o Bônus desta
// semana ao Saldo ao vivo da fase atual (que, neste instante, ainda não
// inclui o bônus desta semana, já que ela ainda não está em
// financeWeeks), com piso em R$ 0,00. Esse valor travado é só um RETRATO
// histórico — depois de fechada, os campos brutos podem ser corrigidos à
// mão (ver updateClosedWeek), mas o `balance` gravado aqui nunca muda.
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

// EDITA uma semana JÁ FECHADA. Os 6 campos brutos (deposit, withdrawal,
// wagered, betCount, bonus, resultBetting) podem ser corrigidos à mão.
// Diferença e R.B.+Bônus NUNCA são editados diretamente: são sempre
// recalculados aqui a partir dos outros campos. `balance` (o saldo
// travado no fechamento) não é aceito aqui de propósito — é um retrato
// fixo daquele momento e nunca é a fonte usada por Saldo/fases/Total da
// plataforma/Painel Geral; correções em bonus/resultBetting já entram
// sozinhas no próximo cálculo ao vivo.
export function updateClosedWeek(platform, weekStart, updatedFields) {
  const entry = (platform.financeWeeks || []).find(w => w.weekStart === weekStart);
  if (!entry) return null;

  const deposit = Number(updatedFields.deposit) || 0;
  const withdrawal = Number(updatedFields.withdrawal) || 0;
  const wagered = Number(updatedFields.wagered) || 0;
  const betCount = Number(updatedFields.betCount) || 0;
  const bonus = Number(updatedFields.bonus) || 0;
  const resultBetting = Number(updatedFields.resultBetting) || 0;

  entry.deposit = deposit;
  entry.withdrawal = withdrawal;
  entry.difference = withdrawal - deposit;
  entry.wagered = wagered;
  entry.betCount = betCount;
  entry.bonus = bonus;
  entry.resultBetting = resultBetting;
  entry.rbPlusBonus = resultBetting + bonus;
  entry.editedAt = new Date().toISOString();

  return entry;
}

// Soma TODAS as semanas fechadas de UMA plataforma — usado no card "Total
// da plataforma" (Página 5). Os 7 campos de fluxo só consideram semanas
// já congeladas (financeWeeks) — a semana em aberto não entra aqui de
// propósito. Saldo é diferente: é sempre o valor ATUAL ao vivo da FASE
// ATUAL (computeLiveBalance, já com piso em R$ 0,00), nunca uma soma das
// semanas nem das fases anteriores.
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
// Geral". from/to são strings 'AAAA-MM-DD' (ou null pra não filtrar),
// comparadas contra o weekStart de cada semana fechada. Saldo é somado
// por plataforma (cada uma contribui com o Saldo da SUA fase atual) e
// NUNCA é afetado pelo filtro de datas.
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
