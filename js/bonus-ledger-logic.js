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
//      a pessoa digita é o TOTAL recebido no dia e pode já incluir a parte
//      da fórmula — o sistema grava em otherBonusLog só a diferença
//      POSITIVA (valor zero ou menor que o já contabilizado é recusado
//      pela tela), pra nunca contar 2x. Ver "AVULSO EFETIVO" abaixo.
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
//
// === (Sub-entrega G) AVULSO EFETIVO — fim da dupla contagem ===
// PROBLEMA: o avulso gravado era "total digitado − fórmula NAQUELE
// momento". Se a fórmula do dia subisse DEPOIS do lançamento (caso típico:
// a aposta que atinge o mínimo do nível é registrada depois, liberando o
// VIP diário automaticamente), o diário entrava 2x: uma vez dentro do
// avulso (o usuário já tinha incluído no total) e outra pela fórmula.
// CORREÇÃO: cada lançamento novo guarda também `claimedTotal` (o TOTAL do
// dia que o usuário informou) e `formulaAtLog` (a fórmula naquele
// instante). O avulso EFETIVO de um dia passa a ser:
//   - dia com lançamento novo: max(0, maior claimedTotal − fórmula ATUAL)
//     => total do dia = max(fórmula atual, total informado). A liberação
//        automática do diário CONTINUA funcionando: sem lançamento no dia
//        ela soma normalmente; com lançamento, ela só soma o que passar do
//        total já informado (nunca 2x).
//   - dia só com lançamentos antigos (sem claimedTotal): Σ rawValue, igual
//     a antes — nada é reinterpretado retroativamente.
// O Rollover do avulso acompanha na mesma proporção (preserva a escala do
// botão R de cada lançamento). Nada é regravado no Firestore: o efetivo é
// sempre recalculado na leitura.

import { getVipConfigAt, computeEmissionDates, isBetDayEffective } from './cycle-logic.js';
import { getEffectiveMisteriosoValue } from './misterioso-logic.js';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function dayKeyToDate(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function isValidEntryDate(e) {
  return !!e && !!e.date && !isNaN(new Date(e.date).getTime());
}

// "Apostei hoje" já registrado pra uma data específica — usado só pro
// diário do grupo 'com', que depende do clique (grupo 'sem' recebe o
// diário todo dia, sem depender de nada, mesma regra de getVipBonus).
// Item 15b: delega pra isBetDayEffective (cycle-logic.js) — fonte única,
// mesma usada por getVipBonus e pelo badge da Edição. Garante que o
// Saldo/Rollover ao vivo (via getExpectedBonusForDate) nunca divirja do
// que a aba VIP mostra.
function hasBetOnDate(platform, date) {
  const key = toLocalDateKey(date);
  return isBetDayEffective(platform, key);
}

// === A0 — "Esperado" de UM dia, SEPARADO POR TIPO ===
// Fonte ÚNICA do cálculo. Nível/grupo vêm de getVipConfigAt (vigentes
// NAQUELE dia). getExpectedBonusForDate (abaixo) só soma este resultado,
// então o feed do Perfil e o Saldo/Rollover ao vivo nunca divergem.
export function getExpectedBonusBreakdownForDate(platform, date, ctx = {}) {
  const d = startOfDay(date);
  const { group, cfg } = getVipConfigAt(platform, d);
  const out = { vipDaily: 0, vipWeekly: 0, vipMonthly: 0, obrigado: 0, misterioso: 0 };

  // Diário — 'sem' recebe todo dia; 'com' só nos dias liberados (manual
  // ou automático via mínimo do nível vigente no dia).
  if (group === 'sem') {
    out.vipDaily = cfg.daily;
  } else if (group === 'com' && hasBetOnDate(platform, d)) {
    out.vipDaily = cfg.daily;
  }

  // Semanal — só na segunda-feira, com o nível da segunda.
  if (d.getDay() === 1) out.vipWeekly = cfg.weekly;

  // Mensal — só no dia 1, com o nível vigente no dia 1.
  if (d.getDate() === 1) out.vipMonthly = cfg.monthly;

  // Obrigado — dia fixo do mês, independente de ciclo/reset.
  const obrigadoValue = Number(ctx.obrigadoValuePerAppearance) || 0;
  if (obrigadoValue > 0 && (platform.obrigadoDays || []).includes(d.getDate())) {
    out.obrigado = obrigadoValue;
  }

  // Misterioso — só em data de emissão do ciclo ATUAL, ciclo não encerrado.
  if (ctx.misteriosoTemplate && !platform.cycleEnded) {
    const isEmissionDay = computeEmissionDates(platform, d).some(emDate =>
      startOfDay(emDate).getTime() === d.getTime()
    );
    if (isEmissionDay) {
      out.misterioso = getEffectiveMisteriosoValue(platform, toLocalDateKey(d), ctx.misteriosoTemplate) || 0;
    }
  }

  return out;
}

// Total esperado do dia — soma do detalhamento, na mesma ordem de sempre.
export function getExpectedBonusForDate(platform, date, ctx = {}) {
  const b = getExpectedBonusBreakdownForDate(platform, date, ctx);
  let total = 0;
  total += b.vipDaily;
  total += b.vipWeekly;
  total += b.vipMonthly;
  total += b.obrigado;
  total += b.misterioso;
  return total;
}

// Usado pelo botão "Inserir bônus hoje" (mostra o valor previsto antes de confirmar) e pela subtração
// em computeBonusDiffToday.
export function getExpectedBonusToday(platform, refDate = new Date(), ctx = {}) {
  return getExpectedBonusForDate(platform, refDate, ctx);
}

// ============================================================
// (Sub-entrega G) AVULSO EFETIVO — ver nota no topo do arquivo
// ============================================================

function hasClaim(e) {
  return !!e && typeof e.claimedTotal === 'number' && Number.isFinite(e.claimedTotal);
}

// Avulso efetivo de UM dia (todas as entradas daquele dia local).
// Retorna:
//   raw       — o que entra no Saldo (1:1), em centavos
//   rollover  — o que entra no Rollover (escala do botão R preservada)
//   ratio     — fator aplicado a cada entrada (1 em dia só com entradas antigas)
//   claimed   — maior total informado no dia (null se só entradas antigas)
//   formula   — fórmula ATUAL do dia (null se só entradas antigas)
//   formulaAtLog — fórmula no momento do último lançamento novo (ou null)
//   entries   — entradas do dia
export function getEffectiveOtherBonusForDay(platform, date, ctx = {}) {
  const key = toLocalDateKey(date);
  const entries = (platform.otherBonusLog || []).filter(e => isValidEntryDate(e) && toLocalDateKey(e.date) === key);
  const rawSum = entries.reduce((s, e) => s + (Number(e.rawValue) || 0), 0);
  const rolloverSum = entries.reduce((s, e) => s + (Number(e.rolloverValue) || 0), 0);

  const base = { dayKey: key, entries, rawSum: r2(rawSum), rolloverSum: r2(rolloverSum) };

  if (entries.length === 0) {
    return { ...base, raw: 0, rollover: 0, ratio: 1, claimed: null, formula: null, formulaAtLog: null };
  }

  const claims = entries.filter(hasClaim);
  if (claims.length === 0) {
    // Só lançamentos antigos: comportamento de sempre (Σ rawValue).
    return { ...base, raw: r2(rawSum), rollover: r2(rolloverSum), ratio: 1, claimed: null, formula: null, formulaAtLog: null };
  }

  const claimed = claims.reduce((max, e) => Math.max(max, e.claimedTotal), -Infinity);
  const latestClaim = [...claims].sort((a, b) => new Date(a.date) - new Date(b.date))[claims.length - 1];
  const formula = getExpectedBonusForDate(platform, dayKeyToDate(key), ctx);
  const raw = r2(Math.max(0, claimed - formula));
  const ratio = rawSum > 0 ? raw / rawSum : 0;
  const rollover = rawSum > 0 ? r2(rolloverSum * ratio) : raw;

  return {
    ...base,
    raw,
    rollover,
    ratio,
    claimed: r2(claimed),
    formula: r2(formula),
    formulaAtLog: (typeof latestClaim.formulaAtLog === 'number' && Number.isFinite(latestClaim.formulaAtLog))
      ? r2(latestClaim.formulaAtLog)
      : null
  };
}

// Soma do avulso efetivo de todos os DIAS que tenham ao menos uma entrada
// aceita por `entryFilter`. O efetivo de cada dia é calculado com todas as
// entradas daquele dia (fases e semanas sempre viram à meia-noite, então
// um filtro por período nunca corta um dia ao meio).
export function sumEffectiveOtherBonus(platform, entryFilter = () => true, ctx = {}) {
  const dayKeys = new Set();
  (platform.otherBonusLog || []).forEach(e => {
    if (isValidEntryDate(e) && entryFilter(e)) dayKeys.add(toLocalDateKey(e.date));
  });
  let raw = 0;
  let rollover = 0;
  dayKeys.forEach(key => {
    const day = getEffectiveOtherBonusForDay(platform, dayKeyToDate(key), ctx);
    raw += day.raw;
    rollover += day.rollover;
  });
  return { raw: r2(raw), rollover: r2(rollover) };
}

// Mesma coisa, mas POR ENTRADA (cada uma com o fator do seu dia) — usado
// onde o horário de cada lançamento importa (simulação sequencial do
// Rollover, feed do Perfil).
export function getEffectiveOtherBonusEntries(platform, entryFilter = () => true, ctx = {}) {
  const dayCache = new Map();
  const result = [];
  (platform.otherBonusLog || []).forEach(e => {
    if (!isValidEntryDate(e) || !entryFilter(e)) return;
    const key = toLocalDateKey(e.date);
    if (!dayCache.has(key)) dayCache.set(key, getEffectiveOtherBonusForDay(platform, dayKeyToDate(key), ctx));
    const day = dayCache.get(key);
    let raw;
    let rollover;
    if (day.rawSum > 0) {
      raw = (Number(e.rawValue) || 0) * day.ratio;
      rollover = (Number(e.rolloverValue) || 0) * day.ratio;
    } else {
      // Caso degenerado (entradas sem rawValue): o efetivo do dia vai
      // inteiro pro último lançamento do dia.
      const last = [...day.entries].sort((a, b) => new Date(a.date) - new Date(b.date))[day.entries.length - 1];
      raw = e === last ? day.raw : 0;
      rollover = e === last ? day.rollover : 0;
    }
    result.push({ entry: e, raw, rollover, day });
  });
  return result;
}

// Avulso EFETIVO já contabilizado no dia de refDate (nome mantido por
// compatibilidade). Antes era Σ rawValue; agora segue a regra do avulso
// efetivo — passe o ctx pra Obrigado/Misterioso entrarem na fórmula.
export function getAlreadyLoggedToday(platform, refDate = new Date(), ctx = {}) {
  return getEffectiveOtherBonusForDay(platform, refDate, ctx).raw;
}

// Diferença a ser gravada em otherBonusLog quando o usuário confirma
// "Inserir bônus hoje" com `valorDigitado` (o TOTAL que ele diz ter
// recebido HOJE). NUNCA grava sozinha — só calcula; quem chama decide o
// `scale` (botão R) e monta a entrada final (ver ui-finance-panel.js).
//   diferença = total digitado − (fórmula atual + avulso efetivo de hoje)
//             = total digitado − max(fórmula atual, total já informado)
// Recalculada do zero a cada chamada.
export function computeBonusDiffToday(platform, valorDigitado, refDate = new Date(), ctx = {}) {
  const expected = getExpectedBonusToday(platform, refDate, ctx);
  const alreadyLogged = getAlreadyLoggedToday(platform, refDate, ctx);
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
  return r2(total);
}

function inWeekOf(refDate) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  return (e) => {
    const d = new Date(e.date);
    return d >= weekStart && d <= weekEnd;
  };
}

// Avulso EFETIVO (Saldo, 1:1) da semana de refDate. Somado com
// computeAutoAccruedBonusForWeek, mostra quanto o sistema JÁ sabe que foi
// recebido nessa semana (campo "Bônus Acumulado"), sem dupla contagem.
export function getAccumulatedBonusThisWeek(platform, refDate = new Date(), ctx = {}) {
  return sumEffectiveOtherBonus(platform, inWeekOf(refDate), ctx).raw;
}

// Mesma soma acima, mas do Rollover (escala do botão R preservada).
export function getAccumulatedRolloverThisWeek(platform, refDate = new Date(), ctx = {}) {
  return sumEffectiveOtherBonus(platform, inWeekOf(refDate), ctx).rollover;
}
