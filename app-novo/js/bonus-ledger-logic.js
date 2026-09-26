// === MÓDULO-PONTE: BÔNUS -> SALDO / ROLLOVER (Bloco F Item 16 + Bloco P) ===
// Único arquivo do sistema que importa de cycle-logic.js E misterioso-logic.js
// ao mesmo tempo, e que é importado por finance-logic.js. Nem cycle-logic.js
// nem misterioso-logic.js importam nada daqui nem de finance-logic.js —
// fluxo de dependência sempre numa única direção (ver roteiro-execucao-fusao.md).
//
// DE PROPÓSITO este arquivo NÃO importa nada de finance-logic.js (nem
// getWeekStart/getWeekEnd/toLocalDateString) — evita import circular, já
// que finance-logic.js importa DESTE arquivo. Por isso getWeekStartLocal/
// getWeekEndLocal/toLocalDateKey abaixo são cópias INTENCIONAIS do mesmo
// algoritmo já usado em finance-logic.js: se um dia mudar a regra de
// "semana" (segunda a domingo) lá, precisa mudar aqui também.
//
// Função: traduzir "quanto de bônus VIP/Obrigado/Misterioso o sistema já
// sabe, pela fórmula, que é devido num dia/semana" — usado em 3 lugares:
//   1) Somado AO VIVO no Saldo e no Rollover da semana em aberto
//      (finance-logic.js) — o bônus deixa de ser só "visual" na aba VIP
//      e passa a ser valor real, todo dia, sem precisar de nenhum clique.
//   2) Como base de subtração no botão "Inserir bônus hoje": o valor que
//      a pessoa digita pode já incluir a parte formulaica do dia — o
//      sistema subtrai o que já é automático e grava só a diferença
//      (positiva ou negativa) em otherBonusLog, pra nunca contar 2x,
//      não importa a ordem entre "Apostei hoje" e "Inserir bônus hoje".
//   3) Recalculado dentro de closeWeek() (finance-logic.js) no domingo,
//      pra descontar do Saldo ao vivo o que a fórmula já tinha somado
//      sozinha durante a semana, antes de somar o valor real digitado.
//
// ctx (contexto) é SEMPRE passado por quem chama (ui-finance-panel.js) —
// este arquivo nunca fala com Firestore:
//   ctx.obrigadoValuePerAppearance : number (vip-obrigado-store.js)
//   ctx.misteriosoTemplate         : template já resolvido pra ESTA
//                                     plataforma (vip-misterioso-store.js
//                                     + findTemplateForPlatform), ou null
// Sem ctx (ou com ctx vazio), Obrigado/Misterioso simplesmente não
// contribuem em nada — VIP diário/semanal/mensal continuam funcionando
// normalmente, porque não dependem de ctx (só de platform.group/level).

import { vipBonusTable, computeEmissionDates } from './cycle-logic.js';
import { getEffectiveMisteriosoValue } from './misterioso-logic.js';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Cópia intencional do algoritmo de getWeekStart (finance-logic.js) — ver
// nota no topo do arquivo sobre por que não é importado.
function getWeekStartLocal(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo, 1 = segunda ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

// Cópia intencional do algoritmo de getWeekEnd (finance-logic.js).
function getWeekEndLocal(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Cópia intencional do algoritmo de toLocalDateString (finance-logic.js),
// usada aqui só pra comparar "mesmo dia local" sem depender de fuso.
function toLocalDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Config VIP (daily/weekly/monthly) da plataforma — valores UNITÁRIOS
// (por ocorrência), a mesma tabela que cycle-logic.js já usa dentro de
// getVipBonus, só que aqui precisamos do valor de UM dia/UMA semana/UM
// mês, não do total acumulado do mês inteiro que getVipBonus devolve.
// Reaproveita vipBonusTable (exportada por cycle-logic.js) pra nunca
// duplicar os números da tabela em dois lugares.
function getVipUnitConfig(platform) {
  return vipBonusTable[platform.group]?.[platform.level] || { daily: 0, weekly: 0, monthly: 0 };
}

// "Apostei hoje" já registrado pra uma data específica — usado só pro
// diário do grupo 'com', que depende do clique (grupo 'sem' recebe o
// diário todo dia, sem depender de nada, mesma regra de getVipBonus).
function hasBetOnDate(platform, date) {
  const key = toLocalDateKey(date);
  return (platform.betDays || []).some(d => d.slice(0, 10) === key);
}

// === "Esperado" de UM dia específico — soma tudo que a fórmula já sabe
//      que é devido NAQUELE dia, pra essa plataforma. ===
// Base tanto do "esperado hoje" (subtração do botão "Inserir bônus
// hoje") quanto do acúmulo automático da semana inteira (soma dia a dia,
// ver computeAutoAccruedBonusForWeek).
export function getExpectedBonusForDate(platform, date, ctx = {}) {
  const d = startOfDay(date);
  const cfg = getVipUnitConfig(platform);
  let total = 0;

  // Diário — 'sem' recebe todo dia; 'com' só nos dias em que "Apostei
  // hoje" já foi registrado (mesma condição usada em getVipBonus).
  if (platform.group === 'sem') {
    total += Number(cfg.daily) || 0;
  } else if (platform.group === 'com' && hasBetOnDate(platform, d)) {
    total += Number(cfg.daily) || 0;
  }

  // Semanal — só na segunda-feira. Vale pros dois grupos (mesma regra já
  // usada em getVipBonus, que não distingue grupo pro semanal/mensal).
  if (d.getDay() === 1) {
    total += Number(cfg.weekly) || 0;
  }

  // Mensal — só no dia 1.
  if (d.getDate() === 1) {
    total += Number(cfg.monthly) || 0;
  }

  // Obrigado — dia fixo do mês (1-31), independente de ciclo/reset
  // (mesma regra de ui-vip-panel.js: obrigadoDays nunca é filtrado por
  // cycleEnded).
  const obrigadoValue = Number(ctx.obrigadoValuePerAppearance) || 0;
  if (obrigadoValue > 0 && (platform.obrigadoDays || []).includes(d.getDate())) {
    total += obrigadoValue;
  }

  // Misterioso — só se `d` é uma data de emissão do ciclo ATUAL e o
  // ciclo não está encerrado (mesma trava já usada em
  // computeMisteriosoForecast/getEditableMisteriosoEvents,
  // ui-vip-panel.js — datas de emissão de um ciclo encerrado não
  // representam bônus real).
  if (ctx.misteriosoTemplate && !platform.cycleEnded) {
    const isEmissionDay = computeEmissionDates(platform, d).some(emDate =>
      startOfDay(emDate).getTime() === d.getTime()
    );
    if (isEmissionDay) {
      const dateKey = toLocalDateKey(d);
      total += getEffectiveMisteriosoValue(platform, dateKey, ctx.misteriosoTemplate) || 0;
    }
  }

  return total;
}

// Açúcar sintático — "esperado de hoje". Usado pelo botão "Inserir bônus
// hoje" (mostra o valor previsto antes de confirmar) e pela subtração
// em computeBonusDiffToday.
export function getExpectedBonusToday(platform, refDate = new Date(), ctx = {}) {
  return getExpectedBonusForDate(platform, refDate, ctx);
}

// Soma tudo que JÁ FOI LANÇADO em otherBonusLog no dia de refDate — usado
// pra permitir mais de um clique em "Inserir bônus hoje" no mesmo dia sem
// duplicar: cada novo clique subtrai também o que entradas anteriores do
// MESMO dia já registraram.
export function getAlreadyLoggedToday(platform, refDate = new Date()) {
  const key = toLocalDateKey(refDate);
  return (platform.otherBonusLog || [])
    .filter(e => e.date && e.date.slice(0, 10) === key)
    .reduce((sum, e) => sum + (Number(e.rawValue) || 0), 0);
}

// Diferença a ser gravada em otherBonusLog quando o usuário confirma
// "Inserir bônus hoje" com `valorDigitado` (o total que ele diz ter
// recebido HOJE). NUNCA grava sozinha — só calcula; quem chama decide o
// `scale` (botão R) e monta a entrada final (ver ui-finance-panel.js).
// Recalculada do zero a cada chamada — nunca depende de um valor
// anterior "congelado", por isso a ordem entre "Apostei hoje" e
// "Inserir bônus hoje" nunca gera diferença errada, em nenhum sentido.
export function computeBonusDiffToday(platform, valorDigitado, refDate = new Date(), ctx = {}) {
  const expected = getExpectedBonusToday(platform, refDate, ctx);
  const alreadyLogged = getAlreadyLoggedToday(platform, refDate);
  return (Number(valorDigitado) || 0) - expected - alreadyLogged;
}

// === ACÚMULO AUTOMÁTICO DA SEMANA — o que "alimenta os cálculos"
//     sozinho, sem nenhum clique do usuário. Soma getExpectedBonusForDate
//     de cada dia corrido, de segunda-feira até refDate (ou até domingo,
//     o que vier primeiro). ===
// Usado AO VIVO por computeLiveBalance/computeRolloverLive
// (finance-logic.js) pra semana em aberto, e recalculado dentro de
// closeWeek() no momento do fechamento — nunca armazenado por si só.
export function computeAutoAccruedBonusForWeek(platform, refDate = new Date(), ctx = {}) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  const today = startOfDay(refDate);
  const lastDay = today < weekEnd ? today : weekEnd;

  let total = 0;
  const cursor = new Date(weekStart);
  while (cursor <= lastDay) {
    total += getExpectedBonusForDate(platform, cursor, ctx);
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

// Soma de otherBonusLog (rawValue, sem escala — o que entra no Saldo) da
// semana em aberto. Usado pelo novo campo só-leitura "Bônus Acumulado"
// no domingo: somado com computeAutoAccruedBonusForWeek, mostra pro
// usuário quanto o sistema JÁ sabe que foi recebido nessa semana, antes
// dele digitar o valor real final.
export function getAccumulatedBonusThisWeek(platform, refDate = new Date()) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  return (platform.otherBonusLog || [])
    .filter(e => {
      const d = new Date(e.date);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, e) => sum + (Number(e.rawValue) || 0), 0);
}

// Mesma soma acima, mas em rolloverValue (já escalado pelo botão R de
// cada lançamento) — usado ao vivo por computeRolloverLive e congelado
// dentro de closeWeek() junto com o acúmulo automático (que entra 1:1,
// "Bônus 1", sempre).
export function getAccumulatedRolloverThisWeek(platform, refDate = new Date()) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  return (platform.otherBonusLog || [])
    .filter(e => {
      const d = new Date(e.date);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, e) => sum + (Number(e.rolloverValue) || 0), 0);
}
