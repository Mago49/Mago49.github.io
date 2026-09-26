// === LÓGICA FINANCEIRA SEMANAL (View Financeiro — Etapa 7) ===
// Função pura (sem document.). Semana = segunda a domingo, fixa e igual
// pra todas as plataformas — independente do lastResetDate de cada uma
// (que só vale pro ciclo de nível/VIP, ver cycle-logic.js).
//
// === ETAPA 7 — O QUE MUDOU EM RELAÇÃO AO SISTEMA 1 ===
//
// 1) BÔNUS DEIXA DE SER "SÓ DE DOMINGO" (Bloco F, Item 16).
//    No Sistema 1, o Saldo só recebia bônus no fechamento de domingo
//    (financeWeeks[].bonus). Agora, o bônus VIP diário/semanal/mensal +
//    Obrigado + Misterioso — tudo que já é uma FÓRMULA que o sistema já
//    conhece — passa a somar no Saldo E no Rollover TODO DIA, ao vivo,
//    sem precisar de nenhum clique (ver computeAutoAccruedBonusForWeek,
//    bonus-ledger-logic.js). O usuário também pode lançar manualmente
//    ("Inserir bônus hoje") um bônus AVULSO — o sistema desconta o que a
//    fórmula já contava sozinha pra nunca somar 2x (ver
//    computeBonusDiffToday, bonus-ledger-logic.js), e grava só a
//    diferença num novo log permanente: `otherBonusLog`.
//
//    No domingo, o campo de Bônus continua existindo e continua manual —
//    é o valor REAL total da semana, pro relatório. Só que agora, no
//    momento do fechamento, ele SUBSTITUI o que a fórmula vinha somando
//    ao vivo (nunca soma os dois) — ver closeWeek().
//
// 2) ROLLOVER (Bloco P) — novo contador ao vivo, nunca armazenado por
//    semana (mesmo espírito do Saldo): mostra quanto ainda falta apostar
//    pra "quitar" o que entrou como depósito/bônus.
//      Rollover = Inicial(fase) + Depósito(fase, 1:1)
//               + Bônus 1 (fórmula, sempre 1:1)
//               + Bônus 2 (avulso via otherBonusLog, escala do botão R)
//               − Apostado(fase), piso R$ 0,00.
//
// 3) FASES SÓ PODEM COMEÇAR NA SEGUNDA-FEIRA (correção do Item 24 —
//    bug de fronteira de fase já observado em produção: R.B./Bônus
//    duplicando ou sumindo quando uma fase nova começava NO MEIO de uma
//    semana, porque uma semana fechada é uma unidade indivisível
//    (financeWeeks[]) mas era atribuída inteira a UMA fase só pela data
//    de weekEnd — se a fase mudasse no meio da semana, os dias de ANTES
//    da virada ficavam invisíveis por alguns dias e depois eram
//    contados inteiros na fase ERRADA no fechamento de domingo).
//    Travando toda fase nova pra começar exatamente numa segunda-feira
//    00:00 (mesmo instante em que toda semana também começa), NENHUMA
//    semana fechada nunca mais atravessa duas fases — o bug desaparece
//    por construção, sem precisar de nenhuma lógica especial de "semana
//    de fronteira" dentro de computeLiveBalance/computePhaseHistory.
//    startNewPhase() recusa qualquer data que não seja segunda-feira
//    (ver comentário na função) — a UI (ui-finance-panel.js) também
//    valida antes de chamar, mas a trava aqui é a de verdade.
//
// 4) SALDO INICIAL e ROLLOVER INICIAL são OBRIGATÓRIOS ao abrir fase nova
//    (nunca 0 "por omissão" vindo da UI — a validação de obrigatoriedade
//    em si é feita na UI, que não deixa confirmar sem os dois valores;
//    aqui os dois só têm um piso defensivo em 0 caso cheguem inválidos).
//
// 5) CICLO ENCERRADO (`cycleEnded`) NÃO bloqueia nada neste arquivo — nem
//    Saldo, nem Rollover, nem lançamento de bônus/depósito. Essa trava
//    vale só pra: progressão de nível no Calendário, contagem de "Dias
//    Depósito" e entrada no Histórico Mensal — nenhuma dessas 3 coisas
//    é calculada aqui. (Misterioso é exceção parcial: `cycleEnded` já
//    impede a PRÓPRIA fórmula de considerar datas de emissão, ver
//    bonus-ledger-logic.js — isso não é uma trava nova, é herdada do
//    comportamento que a aba VIP já tinha pro Misterioso.)
//
// FASES (Sistema 1, sem alteração de espírito): quando o histórico antigo
// é incompleto, "Iniciar nova fase" fecha a fase atual (resultado sempre
// visível em "Fases do Saldo") e pede Saldo Inicial + Rollover Inicial.
// Cada fase é recalculada AO VIVO a partir dos dados brutos + os dois
// campos Iniciais daquela fase — nunca um retrato congelado que possa
// estar errado (ver computePhaseHistory).
//
// BACKFILL ("Adicionar semana antiga", addHistoricalWeek): SEM NENHUMA
// MUDANÇA nesta etapa — continua inserindo só os 6 campos brutos de
// sempre, sem Rollover Inicial nem bonusRollover. Ele não abre fase
// nenhuma, só insere uma semana fechada dentro da fase já aberta.

import { computeAutoAccruedBonusForWeek } from './bonus-ledger-logic.js';

// Função auxiliar para formatar a data como YYYY-MM-DD mantendo o fuso horário local
export function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Igual toLocalDateString, mas incluindo hora:minuto — formato aceito
// pelo input type="datetime-local" ("AAAA-MM-DDTHH:mm"). Local (não
// toISOString), pelo mesmo motivo de sempre: evita pular de dia em fusos
// atrás de UTC como o Brasil.
export function toLocalDateTimeString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

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
// Fim/Reinício) + withdrawals + betEntries. Sem mudança nesta etapa: R.B.
// e os brutos de aposta continuam exatamente como no Sistema 1 — a
// diferença de bônus mora só em computeLiveBalance/computePhaseHistory/
// closeWeek, nunca aqui.
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

export function isCurrentWeekClosed(platform, refDate = new Date()) {
  const weekStartStr = toLocalDateString(getWeekStart(refDate));
  return (platform.financeWeeks || []).some(w => w.weekStart === weekStartStr);
}

// O bloco "Fechar semana" (Bônus + tudo mais já ao vivo) só aparece aos
// domingos: é o dia em que normalmente dá pra saber o valor total real
// do bônus da semana na plataforma.
export function canCloseCurrentWeek(refDate = new Date()) {
  return refDate.getDay() === 0;
}

// Data-fronteira da fase ATUAL (a mais recente), ou null se a plataforma
// nunca teve nenhuma fase criada (aí conta desde o início).
function getCurrentPhaseStartDate(platform) {
  const phases = platform.balancePhases || [];
  if (phases.length === 0) return null;
  return phases[phases.length - 1].date;
}

// Saldo Inicial da fase ATUAL — 0 se a plataforma nunca teve nenhuma fase
// criada.
function getCurrentPhaseInitialBalance(platform) {
  const phases = platform.balancePhases || [];
  if (phases.length === 0) return 0;
  return Number(phases[phases.length - 1].initialBalance) || 0;
}

// Rollover Inicial da fase ATUAL — mesmo padrão de
// getCurrentPhaseInitialBalance, campo novo desta etapa. 0 pra fases
// antigas (criadas antes desta funcionalidade existir) ou pra quem nunca
// abriu nenhuma fase.
function getCurrentPhaseInitialRollover(platform) {
  const phases = platform.balancePhases || [];
  if (phases.length === 0) return 0;
  return Number(phases[phases.length - 1].initialRollover) || 0;
}

// Fecha a fase atual e começa uma nova. `date` PRECISA cair numa
// segunda-feira (ver nota no topo do arquivo, item 3) — qualquer outro
// dia é recusado aqui, na função pura, mesmo que a UI já valide antes de
// chamar (defesa em profundidade: nunca confiar só na validação de tela).
// `initialBalance`/`initialRollover` são obrigatórios do lado da UI; aqui
// só recebem um piso defensivo em 0 se vierem inválidos.
//
// Retorna { ok: false, reason: 'not-monday' } em caso de recusa, ou
// { ok: true, entry } em caso de sucesso — mesmo formato já usado por
// addHistoricalWeek(), pra manter o padrão de retorno do arquivo.
export function startNewPhase(platform, date = new Date(), initialBalance = 0, initialRollover = 0) {
  const chosenDate = new Date(date);
  if (chosenDate.getDay() !== 1) {
    return { ok: false, reason: 'not-monday' };
  }

  if (!platform.balancePhases) platform.balancePhases = [];
  const safeInitialBalance = Math.max(0, Number(initialBalance) || 0);
  const safeInitialRollover = Math.max(0, Number(initialRollover) || 0);
  const entry = {
    date: chosenDate.toISOString(),
    createdAt: new Date().toISOString(),
    initialBalance: safeInitialBalance,
    initialRollover: safeInitialRollover
  };
  platform.balancePhases.push(entry);
  return { ok: true, entry };
}

// Remove a última fronteira de fase criada — a fase mais recente se
// junta de volta com a anterior. Sem mudança nesta etapa: o Rollover
// Inicial dessa fase removida some junto, mesmo espírito do Saldo
// Inicial.
export function removeLastPhase(platform) {
  if (!platform.balancePhases || platform.balancePhases.length === 0) return null;
  return platform.balancePhases.pop();
}

// SALDO (Balance) AO VIVO de uma plataforma — sempre da FASE ATUAL:
//   Saldo = Saldo Inicial (da fase atual, 0 se não houver)
//         + (Depósitos da fase atual) − (Saques da fase atual)
//         + (R.B. da fase atual)
//         + (Bônus 1 — fórmula, semanas fechadas via financeWeeks[].bonus
//            + semana aberta via computeAutoAccruedBonusForWeek, AO VIVO)
//         + (Bônus 2 — avulso via otherBonusLog, semana aberta,
//            1:1 no Saldo — a escala do botão R só afeta o Rollover)
//
// `ctx` (opcional): { obrigadoValuePerAppearance, misteriosoTemplate } —
// repassado pra bonus-ledger-logic.js pra o acúmulo automático também
// considerar Obrigado/Misterioso, além de VIP diário/semanal/mensal (que
// já funciona mesmo sem ctx, já que não depende de nenhum dado externo).
//
// PISO EM ZERO: saldo nunca é negativo na prática — trava em R$ 0,00.
export function computeLiveBalance(platform, refDate = new Date(), ctx = {}) {
  const phaseStart = getCurrentPhaseStartDate(platform);
  const phaseStartDate = phaseStart ? new Date(phaseStart) : null;
  const isInCurrentPhase = (dateStr) => !phaseStartDate || new Date(dateStr) > phaseStartDate;
  const initialBalance = getCurrentPhaseInitialBalance(platform);

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

  // GUARDA — mesma classe de bug do Item 24 (fronteira de fase), só que
  // por outro caminho: sem isso, no MESMO dia em que uma semana é
  // fechada, o cálculo "ao vivo" abaixo somaria de novo o que
  // `financeWeeks[].bonus`/`resultBetting` (fechada) já contam — a
  // semana só deixa de contribuir "ao vivo" quando já tem uma entrada
  // congelada pra ela em `financeWeeks` (isCurrentWeekClosed).
  const weekAlreadyClosed = isCurrentWeekClosed(platform, refDate);

  const currentWeekBets = (platform.betEntries || []).filter(b => isInCurrentPhase(b.date));
  const currentWeekResultBetting = weekAlreadyClosed ? 0 : sumInRange(currentWeekBets, weekStart, weekEnd, 'resultBetting');

  // Bônus 1 (fórmula) — ao vivo, só enquanto a semana ainda está aberta.
  // Como toda fase agora só começa numa segunda-feira (ver nota do topo,
  // item 3), a semana em aberto pertence INTEIRA à fase atual por
  // construção — não precisa de filtro isInCurrentPhase aqui.
  const autoAccruedThisWeek = weekAlreadyClosed ? 0 : computeAutoAccruedBonusForWeek(platform, refDate, ctx);

  // Bônus 2 (avulso, "Inserir bônus hoje") — ao vivo, só enquanto a
  // semana ainda está aberta, sempre 1:1 no Saldo (a escala do botão R
  // nunca afeta o Saldo).
  const currentWeekOtherBonus = (platform.otherBonusLog || []).filter(e => isInCurrentPhase(e.date));
  const currentWeekOtherBonusRaw = weekAlreadyClosed ? 0 : sumInRange(currentWeekOtherBonus, weekStart, weekEnd, 'rawValue');

  const balance = initialBalance + depositTotal - withdrawalTotal
    + closedResultBetting + currentWeekResultBetting
    + bonusTotal + autoAccruedThisWeek + currentWeekOtherBonusRaw;

  return Math.max(0, balance);
}

// ROLLOVER (novo, Bloco P) AO VIVO — nunca armazenado por semana, sempre
// recalculado a partir dos dados brutos + Rollover Inicial da fase atual:
//   Rollover = Rollover Inicial (da fase atual)
//            + Depósitos da fase atual (1:1)
//            + Bônus 1 (fórmula, 1:1 — semanas fechadas via
//              financeWeeks[].bonusRollover + semana aberta AO VIVO)
//            + Bônus 2 (avulso, semana aberta, JÁ escalado —
//              rolloverValue de otherBonusLog, semanas fechadas via
//              financeWeeks[].bonusRollover)
//            − Apostado da fase atual (fechadas + semana aberta)
// PISO EM ZERO, mesmo espírito do Saldo.
export function computeRolloverLive(platform, refDate = new Date(), ctx = {}) {
  const phaseStart = getCurrentPhaseStartDate(platform);
  const phaseStartDate = phaseStart ? new Date(phaseStart) : null;
  const isInCurrentPhase = (dateStr) => !phaseStartDate || new Date(dateStr) > phaseStartDate;
  const initialRollover = getCurrentPhaseInitialRollover(platform);

  const depositTotal = (platform.depositLog || [])
    .filter(d => isInCurrentPhase(d.date))
    .reduce((s, d) => s + (Number(d.value) || 0), 0);

  const weeksInPhase = (platform.financeWeeks || []).filter(w => isInCurrentPhase(w.weekEnd));
  const closedBonusRollover = weeksInPhase.reduce((s, w) => s + (Number(w.bonusRollover) || 0), 0);
  const closedWagered = weeksInPhase.reduce((s, w) => s + (Number(w.wagered) || 0), 0);

  const weekStart = getWeekStart(refDate);
  const weekEnd = getWeekEnd(weekStart);

  // Mesma guarda de computeLiveBalance — ver comentário lá.
  const weekAlreadyClosed = isCurrentWeekClosed(platform, refDate);

  // Bônus 1 (fórmula), ao vivo, 1:1 — só enquanto a semana ainda está
  // aberta, sempre da fase atual por construção (ver nota do Saldo acima
  // sobre fases só em segunda-feira).
  const autoAccruedThisWeek = weekAlreadyClosed ? 0 : computeAutoAccruedBonusForWeek(platform, refDate, ctx);

  // Bônus 2 (avulso), ao vivo, já escalado — só enquanto a semana ainda
  // está aberta.
  const currentWeekOtherBonus = (platform.otherBonusLog || []).filter(e => isInCurrentPhase(e.date));
  const currentWeekRollover = weekAlreadyClosed ? 0 : sumInRange(currentWeekOtherBonus, weekStart, weekEnd, 'rolloverValue');

  const currentWeekBets = (platform.betEntries || []).filter(b => isInCurrentPhase(b.date));
  const currentWeekWagered = weekAlreadyClosed ? 0 : sumInRange(currentWeekBets, weekStart, weekEnd, 'wagered');

  const rollover = initialRollover + depositTotal
    + closedBonusRollover + autoAccruedThisWeek + currentWeekRollover
    - closedWagered - currentWeekWagered;

  return Math.max(0, rollover);
}

// Monta a lista de TODAS as fases de uma plataforma (inclusive a atual),
// da mais antiga pra mais nova, recalculando cada uma AO VIVO a partir
// dos dados brutos + Saldo Inicial/Rollover Inicial daquela fase — nunca
// um valor congelado. Se a plataforma nunca teve nenhuma fase criada,
// retorna uma única "Fase 1" cobrindo a vida inteira dela, com os dois
// Iniciais em R$ 0,00 (comportamento padrão de antes dessa
// funcionalidade existir).
export function computePhaseHistory(platform, refDate = new Date(), ctx = {}) {
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

    // Saldo Inicial/Rollover Inicial desta fase: gravados na fronteira
    // que ABRIU ela, ou seja, phases[i - 1]. A "Fase 1" (i === 0) nunca
    // tem fronteira anterior, então começa sempre em R$ 0,00 nos dois.
    const initialBalance = i === 0 ? 0 : (Number(phases[i - 1].initialBalance) || 0);
    const initialRollover = i === 0 ? 0 : (Number(phases[i - 1].initialRollover) || 0);

    const inRange = (dateStr) => {
      const d = new Date(dateStr);
      if (startDate && !(d > startDate)) return false;
      if (endDate && !(d <= endDate)) return false;
      return true;
    };

    const deposit = (platform.depositLog || []).filter(d => inRange(d.date)).reduce((s, d) => s + (Number(d.value) || 0), 0);
    const withdrawal = (platform.withdrawals || []).filter(w => inRange(w.date)).reduce((s, w) => s + (Number(w.value) || 0), 0);

    const weeksInPhase = (platform.financeWeeks || []).filter(w => inRange(w.weekEnd));
    let bonus = weeksInPhase.reduce((s, w) => s + (Number(w.bonus) || 0), 0);
    let bonusRollover = weeksInPhase.reduce((s, w) => s + (Number(w.bonusRollover) || 0), 0);
    let resultBetting = weeksInPhase.reduce((s, w) => s + (Number(w.resultBetting) || 0), 0);
    let wagered = weeksInPhase.reduce((s, w) => s + (Number(w.wagered) || 0), 0);
    let betCount = weeksInPhase.reduce((s, w) => s + (Number(w.betCount) || 0), 0);

    // Só a fase ATUAL pode ter uma semana ainda aberta dentro dela — fases
    // passadas, por definição, já ficaram inteiramente pra trás. Como
    // toda fase só começa numa segunda-feira, a semana em aberto nunca
    // fica "cortada" entre duas fases (Item 24 resolvido por construção).
    // GUARDA extra (mesma de computeLiveBalance): se a semana atual JÁ
    // fechou hoje mesmo, ela já está dentro de `weeksInPhase` acima —
    // sem este `if`, seria somada 2x.
    if (isCurrent && !isCurrentWeekClosed(platform, refDate)) {
      const currentWeekBets = (platform.betEntries || []).filter(b => inRange(b.date));
      resultBetting += sumInRange(currentWeekBets, weekStart, weekEnd, 'resultBetting');
      wagered += sumInRange(currentWeekBets, weekStart, weekEnd, 'wagered');
      betCount += sumInRange(currentWeekBets, weekStart, weekEnd, 'betCount');

      const currentWeekOtherBonus = (platform.otherBonusLog || []).filter(e => inRange(e.date));
      bonus += sumInRange(currentWeekOtherBonus, weekStart, weekEnd, 'rawValue');
      bonusRollover += sumInRange(currentWeekOtherBonus, weekStart, weekEnd, 'rolloverValue');

      // Bônus 1 (fórmula), ao vivo — mesma fonte usada em
      // computeLiveBalance/computeRolloverLive, 1:1 nos dois.
      const autoAccruedThisWeek = computeAutoAccruedBonusForWeek(platform, refDate, ctx);
      bonus += autoAccruedThisWeek;
      bonusRollover += autoAccruedThisWeek;
    }

    results.push({
      phaseNumber: i + 1,
      startDate: start,
      endDate: end,
      isCurrent,
      initialBalance,
      initialRollover,
      deposit,
      withdrawal,
      difference: withdrawal - deposit,
      wagered,
      betCount,
      bonus,
      bonusRollover,
      resultBetting,
      rbPlusBonus: resultBetting + bonus,
      balance: Math.max(0, initialBalance + deposit - withdrawal + resultBetting + bonus),
      rollover: Math.max(0, initialRollover + deposit + bonusRollover - wagered)
    });
  }

  return results;
}

// CONGELA a semana atual: pega os valores ao vivo (deposit, withdrawal,
// wagered, betCount, resultBetting), soma o Bônus REAL informado na hora
// do fechamento (valor total da semana, pro relatório), e grava fixo em
// platform.financeWeeks.
//
// === POR QUE NÃO É SÓ "computeLiveBalance() + bonusNum" (como no
//     Sistema 1) ===
// No Sistema 1, o Saldo nunca somava nada de bônus antes do fechamento —
// por isso bastava somar o bônus digitado em cima do Saldo ao vivo na
// hora de fechar. Agora, `computeLiveBalance()` JÁ vem somando o bônus
// da semana em aberto (fórmula + avulso) o tempo todo — se eu simplesmente
// somasse `bonusNum` por cima do Saldo ao vivo aqui, a semana seria
// contada DUAS vezes (uma pela fórmula/log ao vivo, outra pelo número
// final de domingo). A correção: pega o Saldo ao vivo de AGORA, TIRA o
// que essa semana especificamente já vinha contribuindo (autoAccrued +
// otherBonusRaw), e só DEPOIS soma o valor real digitado — uma
// substituição, não uma soma.
export function closeWeek(platform, bonus, refDate = new Date(), ctx = {}) {
  const live = computeCurrentWeekLive(platform, refDate);
  const bonusNum = Number(bonus) || 0;

  // Retrato do Rollover no exato momento do fechamento — precisa ser
  // calculado ANTES de empurrar `entry` pra financeWeeks (senão
  // computeRolloverLive já veria a semana como fechada e excluiria a
  // própria contribuição dela, dando um retrato incompleto). Diferente
  // do Bônus, o Rollover não tem "valor real de domingo" que o
  // substitua — o que já foi somado ao vivo (fórmula + avulso, cada um
  // com sua escala) já É o valor final; este campo é só um RETRATO pra
  // exibição no card do histórico, mesmo espírito do `balance` abaixo.
  const rolloverAtClose = computeRolloverLive(platform, refDate, ctx);

  // O que a fórmula (Bônus 1) já vinha somando sozinha pro Saldo/Rollover
  // ao vivo durante esta semana.
  const autoAccruedThisWeek = computeAutoAccruedBonusForWeek(platform, refDate, ctx);

  // O que foi lançado manualmente via "Inserir bônus hoje" (Bônus 2)
  // durante esta semana — rawValue pro Saldo, rolloverValue pro Rollover.
  const weekOtherBonus = (platform.otherBonusLog || []).filter(e => {
    const d = new Date(e.date);
    return d >= live.weekStart && d <= live.weekEnd;
  });
  const otherBonusRawThisWeek = weekOtherBonus.reduce((s, e) => s + (Number(e.rawValue) || 0), 0);
  const otherBonusRolloverThisWeek = weekOtherBonus.reduce((s, e) => s + (Number(e.rolloverValue) || 0), 0);

  // Saldo ao vivo de AGORA (já inclui a contribuição desta semana) menos
  // essa mesma contribuição, mais o valor REAL digitado agora.
  const liveBalanceNow = computeLiveBalance(platform, refDate, ctx);
  const balanceAtClose = Math.max(0, liveBalanceNow - autoAccruedThisWeek - otherBonusRawThisWeek + bonusNum);

  // bonusRollover: Bônus 1 (fórmula, sempre 1:1) + Bônus 2 (avulso, já
  // escalado pelo botão R de cada lançamento) — CONGELADO aqui pra
  // sempre, porque depois do fechamento não há mais como reconstituir
  // qual parte do valor final de domingo tinha escala diferente de 1:1.
  const bonusRollover = autoAccruedThisWeek + otherBonusRolloverThisWeek;

  const entry = {
    weekStart: toLocalDateString(live.weekStart),
    weekEnd: toLocalDateString(live.weekEnd),
    deposit: live.deposit,
    withdrawal: live.withdrawal,
    difference: live.difference,
    wagered: live.wagered,
    betCount: live.betCount,
    bonus: bonusNum,
    bonusRollover,
    resultBetting: live.resultBetting,
    rbPlusBonus: live.resultBetting + bonusNum,
    balance: balanceAtClose,
    rolloverAtClose,
    closedAt: new Date().toISOString()
  };

  if (!platform.financeWeeks) platform.financeWeeks = [];
  platform.financeWeeks.push(entry);
  return entry;
}

// EDITA uma semana JÁ FECHADA. Os 6 campos brutos (deposit, withdrawal,
// wagered, betCount, bonus, resultBetting) podem ser corrigidos à mão —
// SEM MUDANÇA nesta etapa. `bonusRollover`, assim como `balance`, NÃO é
// aceito aqui de propósito: é um retrato fixo do momento do fechamento,
// calculado a partir de dados (otherBonusLog + fórmula do dia) que já
// deixaram de existir separadamente depois que a semana fechou — não tem
// como reconstituir a escala certa de cada lançamento a partir só do
// número final. Pra corrigir uma semana com bonusRollover errado, o
// caminho é excluir e fechar de novo (ver deleteClosedWeek).
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

// Remove uma semana FECHADA do histórico. SEM MUDANÇA nesta etapa —
// bonusRollover não precisa de nenhuma limpeza extra ao excluir: ele
// nunca foi sintetizado em outro log (diferente de deposit/withdrawal
// backfilled, que criam eventos espelho em depositLog/withdrawals), é só
// um campo próprio dentro do próprio financeWeeks[].
export function deleteClosedWeek(platform, weekStart) {
  const list = platform.financeWeeks || [];
  const index = list.findIndex(w => w.weekStart === weekStart);
  if (index === -1) return false;

  const entry = list[index];

  if (entry.backfilled) {
    const eventDate = new Date(weekStart);
    eventDate.setHours(12, 0, 0, 0);
    const eventDateStr = eventDate.toISOString();

    if (platform.depositLog) {
      const di = platform.depositLog.findIndex(d => d.date === eventDateStr && Number(d.value) === entry.deposit);
      if (di !== -1) platform.depositLog.splice(di, 1);
    }
    if (platform.withdrawals) {
      const wi = platform.withdrawals.findIndex(w => w.date === eventDateStr && Number(w.value) === entry.withdrawal);
      if (wi !== -1) platform.withdrawals.splice(wi, 1);
    }
  }

  list.splice(index, 1);
  return true;
}

// Insere uma semana ANTIGA já fechada direto no histórico — SEM MUDANÇA
// nesta etapa (backfill continua exatamente como no Sistema 1, sem
// Rollover Inicial nem bonusRollover: ele não abre fase, só insere uma
// semana fechada dentro da fase já aberta).
export function addHistoricalWeek(platform, dateInWeek, fields, refDate = new Date()) {
  const weekStart = getWeekStart(new Date(dateInWeek));
  const weekEnd = getWeekEnd(weekStart);
  const weekStartStr = toLocalDateString(weekStart);

  const currentWeekStartStr = toLocalDateString(getWeekStart(refDate));
  if (weekStartStr === currentWeekStartStr) {
    return { ok: false, reason: 'current-week' };
  }

  const alreadyExists = (platform.financeWeeks || []).some(w => w.weekStart === weekStartStr);
  if (alreadyExists) {
    return { ok: false, reason: 'duplicate' };
  }

  const deposit = Number(fields.deposit) || 0;
  const withdrawal = Number(fields.withdrawal) || 0;
  const wagered = Number(fields.wagered) || 0;
  const betCount = Number(fields.betCount) || 0;
  const bonus = Number(fields.bonus) || 0;
  const resultBetting = Number(fields.resultBetting) || 0;

  const entry = {
    weekStart: weekStartStr,
    weekEnd: toLocalDateString(weekEnd),
    deposit,
    withdrawal,
    difference: withdrawal - deposit,
    wagered,
    betCount,
    bonus,
    resultBetting,
    rbPlusBonus: resultBetting + bonus,
    balance: 0,
    closedAt: new Date().toISOString(),
    backfilled: true
  };

  if (!platform.financeWeeks) platform.financeWeeks = [];
  platform.financeWeeks.push(entry);

  const eventDate = new Date(weekStart);
  eventDate.setHours(12, 0, 0, 0);

  if (deposit > 0) {
    if (!platform.depositLog) platform.depositLog = [];
    platform.depositLog.push({ date: eventDate.toISOString(), value: deposit });
  }
  if (withdrawal > 0) {
    if (!platform.withdrawals) platform.withdrawals = [];
    platform.withdrawals.push({ date: eventDate.toISOString(), value: withdrawal });
  }

  return { ok: true, entry };
}

// Soma TODAS as semanas fechadas de UMA plataforma — usado no card "Total
// da plataforma". Os 7 campos de fluxo (+ agora Rollover) só consideram
// semanas já congeladas (financeWeeks) — a semana em aberto não entra
// aqui de propósito. Saldo/Rollover são diferentes: são sempre o valor
// ATUAL ao vivo da FASE ATUAL, nunca uma soma das semanas nem das fases
// anteriores.
export function computePlatformTotals(platform, ctx = {}, refDate = new Date()) {
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

  totals.balance = computeLiveBalance(platform, refDate, ctx);
  totals.rollover = computeRolloverLive(platform, refDate, ctx);
  return totals;
}

// Soma as semanas fechadas de TODAS as plataformas — usado no "Painel
// Geral". from/to são strings 'AAAA-MM-DD' (ou null pra não filtrar),
// comparadas contra o weekStart de cada semana fechada. Saldo/Rollover
// são somados por plataforma (cada uma contribui com o valor da SUA fase
// atual) e NUNCA são afetados pelo filtro de datas.
//
// `resolveCtx(platform)`: função opcional que devolve o ctx certo PRA
// CADA plataforma (o `misteriosoTemplate` é por plataforma, nunca um
// valor único pra todas — ver findTemplateForPlatform em
// ui-vip-panel.js). Sem essa função, ctx vira {} pra todas (Obrigado/
// Misterioso não contribuem, VIP diário/semanal/mensal continuam
// funcionando normalmente).
export function computeOverallTotals(platforms, from = null, to = null, resolveCtx = () => ({}), refDate = new Date()) {
  const totals = { deposit: 0, withdrawal: 0, difference: 0, wagered: 0, betCount: 0, bonus: 0, resultBetting: 0, rbPlusBonus: 0, balance: 0, rollover: 0 };

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

    const ctx = resolveCtx(platform);
    totals.balance += computeLiveBalance(platform, refDate, ctx);
    totals.rollover += computeRolloverLive(platform, refDate, ctx);
  });

  return totals;
}

// Soma só o Rollover de todas as plataformas — sem filtro de data, igual
// ao Saldo (P2.4). Mesmo `resolveCtx` opcional do computeOverallTotals.
export function computeOverallRollover(platforms, refDate = new Date(), resolveCtx = () => ({})) {
  return (platforms || []).reduce((sum, p) => sum + computeRolloverLive(p, refDate, resolveCtx(p)), 0);
}
