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
//
// === (Sub-entrega 8a) CONFERÊNCIA DE SALDO + BÔNUS NÃO RECEBIDO ===
// a) EXCLUSÕES: getExpectedBonusBreakdownForDate zera os tipos marcados
//    como não recebidos em platform.bonusExclusions (VIP diário/semanal/
//    mensal e Obrigado). Misterioso excluído já chega 0 pelo
//    misteriosoBonusLog. Como Saldo, Rollover, fechamento de semana, Perfil
//    e Análises passam todos por aqui, todos enxergam a mesma coisa.
// b) AVULSO DA CONFERÊNCIA (otherBonusLog com source:'balance-check'):
//    é a diferença POSITIVA entre o saldo real informado e o esperado. Conta
//    SEMPRE inteiro (é um valor medido, não um "total do dia"). A regra do
//    total do dia informado ("Inserir bônus hoje") passa a descontar também
//    esse avulso: total do dia = max(fórmula + conferência, total
//    informado). Sem conferência no dia, nada muda em relação a antes.
//
// === (Correção 12b) ORDEM ENTRE "INSERIR BÔNUS HOJE" E A CONFERÊNCIA ===
// PROBLEMA: o total informado descontava TODA conferência do dia, inclusive
// a feita DEPOIS dele. Mas a conferência feita depois mede o saldo real
// contra um esperado que JÁ incluía o avulso informado — ela é um valor
// A MAIS, não parte daquele total. Resultado: o avulso informado zerava e
// Saldo/Rollover ficavam abaixo do real exatamente nesse valor (ex.: total
// 7,00 → avulso 6,40; conferência +34,61; o 6,40 sumia e o Saldo ficava
// 33,60 em vez de 40,00).
// CORREÇÃO: o total informado só desconta as conferências REGISTRADAS
// ANTES dele (createdAt; sem createdAt, a data do lançamento). A que vem
// depois soma inteira, por cima. Nenhum dado é regravado — o efetivo é
// recalculado na leitura, então os dias afetados se corrigem sozinhos.
//
// === (Sub-entrega 13) 💎 BÔNUS ALTO ===
// Bônus alto coletado junto com um depósito do tipo 💎 (deposit-kinds.js).
// Mora em platform.highBonusLog:
//   { id, date, value, scale, rolloverValue, depositDate, createdAt }
// É um bônus CONHECIDO (valor exato informado na hora), então entra no
// ESPERADO do dia — getExpectedBonusBreakdownForDate(...).alto — junto com
// VIP/Obrigado/Misterioso. Consequências (todas automáticas, mesma fonte):
//   - Saldo ao vivo, fechamento de semana, Painel, Perfil: 1:1 pelo esperado;
//   - "Inserir bônus hoje": o total do dia já inclui o bônus alto (ele é
//     descontado como fórmula — o avulso nunca o conta de novo);
//   - conferência de saldo: o esperado já o inclui.
// ROLLOVER: o esperado entra no Rollover 1:1 no início do dia; o bônus
// alto NÃO — ele entra no horário dele, com a escala escolhida
// (rolloverValue). Por isso finance-logic.js tira `alto` do lote do dia e
// usa getHighBonusEntries / sumHighBonusForWeek. NÃO é afetado por "Não
// recebi" (é lançamento real — corrige-se editando ou excluindo).
//
// === (Sub-entrega 14) ESCALA DO ROLLOVER POR BÔNUS (botão R) ===
// Escala 0 = "sem rollover": o bônus soma no Saldo e no bônus recebido,
// mas NÃO no Rollover (bônus que a plataforma dá de presente, sem exigir
// aposta). Vale de 0 a 100 em todo lugar que tem R.
//   - Fórmula (VIP diário/semanal/mensal, Obrigado, Misterioso): 1:1 por
//     padrão; o R de cada item no "Bônus da semana" grava
//     platform.bonusScales = [{ id, dayKey, type, scale, updatedAt }].
//     getExpectedRolloverForDate soma valor × escala de cada tipo.
//   - Avulso e bônus alto: escala própria em cada lançamento (rolloverValue).
// O SALDO nunca muda com a escala (sempre 1:1).
//
// === (Sub-entrega 15) VIP DIÁRIO "COM APOSTA" NO HORÁRIO DA COLETA ===
// Nas plataformas do grupo 'com', o VIP diário só é liberado pela aposta
// mínima e só é COLETADO na plataforma depois da sessão. Por isso, no
// ROLLOVER (só nele — o Saldo é soma, horário não importa), ele deixa de
// entrar às 00:00 e passa a entrar:
//   - 1 s antes da aposta marcada com `vipCollectedBefore: true` (resposta
//     SIM no "Registrar aposta" — ui-vip-collect.js), quando existir;
//   - senão, no fim do dia (23:59:59.999), depois de todas as apostas.
// getExpectedRolloverForDate(..., { splitTimed: true }) devolve o lote do
// dia SEM esse VIP; getTimedVipDailyRollover devolve o evento dele.
// Grupo 'sem' não muda (00:00).

import { getVipConfigAt, computeEmissionDates, isBetDayEffective, getBonusExclusionSet, getLevelAt, BET_MINIMUM_BY_LEVEL } from './cycle-logic.js';
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
  const out = { vipDaily: 0, vipWeekly: 0, vipMonthly: 0, obrigado: 0, misterioso: 0, alto: 0 };

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

  // (8a) Bônus marcados como NÃO recebidos ficam de fora.
  if (Array.isArray(platform.bonusExclusions) && platform.bonusExclusions.length) {
    const excluded = getBonusExclusionSet(platform);
    const key = toLocalDateKey(d);
    ['vipDaily', 'vipWeekly', 'vipMonthly', 'obrigado'].forEach(type => {
      if (excluded.has(`${key}|${type}`)) out[type] = 0;
    });
  }

  // (13) Bônus alto lançado nesse dia (valor exato, 1:1 no Saldo).
  out.alto = sumHighBonusOnDay(platform, d);

  return out;
}

// ============================================================
// (Sub-entrega 13) BÔNUS ALTO — ver nota no topo do arquivo
// ============================================================

export function getHighBonusEntries(platform) {
  return (platform && Array.isArray(platform.highBonusLog) ? platform.highBonusLog : [])
    .filter(e => isValidEntryDate(e) && Number(e.value) > 0);
}

export function highBonusRollover(e) {
  const rv = Number(e && e.rolloverValue);
  if (Number.isFinite(rv) && rv >= 0) return rv;
  return (Number(e && e.value) || 0) * normalizeRolloverScale(e && e.scale);
}

// (14) Escala do R: inteiro de 0 (sem rollover) a 100. Ausente/inválida = 1.
export const ROLLOVER_SCALE_MAX = 100;
export function normalizeRolloverScale(value, fallback = 1) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(ROLLOVER_SCALE_MAX, Math.round(n)));
}
export function formatRolloverScale(scale) {
  const s = normalizeRolloverScale(scale);
  return s === 0 ? 'sem rollover' : `${s}:1`;
}

export const FORMULA_BONUS_TYPES = Object.freeze(['vipDaily', 'vipWeekly', 'vipMonthly', 'obrigado', 'misterioso']);

// (14) Escala do Rollover de um bônus de fórmula num dia (padrão 1:1).
export function getFormulaScale(platform, dayKey, type) {
  const list = platform && Array.isArray(platform.bonusScales) ? platform.bonusScales : [];
  const hit = list.find(e => e && e.dayKey === dayKey && e.type === type);
  return hit ? normalizeRolloverScale(hit.scale) : 1;
}

// (14) Quanto a fórmula do dia põe no ROLLOVER (cada tipo × sua escala).
// O bônus alto fica de fora — entra no horário dele (finance-logic.js).
export function getExpectedRolloverForDate(platform, date, ctx = {}, { splitTimed = false } = {}) {
  const b = getExpectedBonusBreakdownForDate(platform, date, ctx);
  const key = toLocalDateKey(date);
  // (15) VIP diário "com aposta" entra no horário da coleta (ver nota).
  const skipDaily = splitTimed && isVipDailyTimed(platform, date);
  let total = 0;
  FORMULA_BONUS_TYPES.forEach(type => {
    if (skipDaily && type === 'vipDaily') return;
    const v = Number(b[type]) || 0;
    if (v > 0) total += v * getFormulaScale(platform, key, type);
  });
  return total;
}

// ============================================================
// (Sub-entrega 15) VIP DIÁRIO "COM APOSTA" — ver nota no topo
// ============================================================

function dayEndTs(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** O VIP diário desse dia depende de aposta (grupo 'com' vigente)? */
export function isVipDailyTimed(platform, date) {
  const { group } = getVipConfigAt(platform, startOfDay(date));
  return group === 'com';
}

/**
 * Instante em que o VIP diário do dia foi LIBERADO (ms), ou null se não
 * foi: aposta que atingiu o mínimo do nível (acumulado do dia, em ordem)
 * ou marcação manual antiga (betDays com hora; sem hora = 00:00).
 */
export function getVipDailyUnlockTs(platform, dayKey) {
  const candidates = [];
  (platform.betDays || []).forEach(entry => {
    const str = String(entry);
    if (str.slice(0, 10) !== dayKey) return;
    const t = str.length > 10 ? new Date(str).getTime() : NaN;
    const [y, m, d] = dayKey.split('-').map(Number);
    candidates.push(Number.isFinite(t) ? t : new Date(y, m - 1, d).getTime());
  });
  const [y, m, d] = dayKey.split('-').map(Number);
  const { level } = getLevelAt(platform, new Date(y, m - 1, d));
  const minimo = BET_MINIMUM_BY_LEVEL[level] || 0;
  if (minimo > 0) {
    const dayBets = (platform.betEntries || [])
      .filter(e => e && isValidEntryDate(e) && toLocalDateKey(e.date) === dayKey)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let acc = 0;
    for (const e of dayBets) {
      acc += Number(e.wagered) || 0;
      if (acc >= minimo) { candidates.push(new Date(e.date).getTime()); break; }
    }
  }
  return candidates.length ? Math.min(...candidates) : null;
}

/** Primeira aposta do dia marcada "coletei o VIP antes desta" (ou null). */
export function getVipCollectBet(platform, dayKey) {
  return (platform.betEntries || [])
    .filter(e => e && e.vipCollectedBefore === true && isValidEntryDate(e) && toLocalDateKey(e.date) === dayKey)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

/** Horário (ms) em que o VIP diário "com aposta" entra no Rollover. */
export function getVipDailyRolloverTs(platform, dayKey) {
  const bet = getVipCollectBet(platform, dayKey);
  return bet ? new Date(bet.date).getTime() - 1000 : dayEndTs(dayKey);
}

/**
 * Evento do VIP diário "com aposta" no Rollover: { t, v } (v já na escala
 * do R) ou null (grupo 'sem', não liberado, não recebido ou escala 0).
 */
export function getTimedVipDailyRollover(platform, date, ctx = {}) {
  if (!isVipDailyTimed(platform, date)) return null;
  const b = getExpectedBonusBreakdownForDate(platform, date, ctx);
  const key = toLocalDateKey(date);
  const v = (Number(b.vipDaily) || 0) * getFormulaScale(platform, key, 'vipDaily');
  if (!(v > 0)) return null;
  return { t: getVipDailyRolloverTs(platform, key), v };
}

/**
 * Pergunta do "Registrar aposta": o VIP diário de hoje já foi liberado por
 * aposta anterior, entra no Rollover e ainda não foi marcado como
 * coletado? Devolve { value, betNumber } (betNumber = nº desta aposta no
 * dia) ou null.
 */
export function getVipCollectPrompt(platform, now = new Date(), ctx = {}) {
  const key = toLocalDateKey(now);
  if (!isVipDailyTimed(platform, now)) return null;
  if (getVipCollectBet(platform, key)) return null;
  const unlock = getVipDailyUnlockTs(platform, key);
  if (unlock === null || unlock > now.getTime()) return null;
  const ev = getTimedVipDailyRollover(platform, now, ctx);
  if (!ev) return null;
  const betsToday = (platform.betEntries || [])
    .filter(e => e && isValidEntryDate(e) && toLocalDateKey(e.date) === key).length;
  const b = getExpectedBonusBreakdownForDate(platform, now, ctx);
  return { value: r2(b.vipDaily), betNumber: betsToday + 1 };
}

// (14) Rollover da fórmula + bônus alto da semana de refDate (segunda até
// o fim do dia de refDate) — par de computeAutoAccruedBonusForWeek.
export function computeAutoAccruedRolloverForWeek(platform, refDate = new Date(), ctx = {}) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  const today = startOfDay(refDate);
  const lastDay = today < weekEnd ? today : weekEnd;
  let total = 0;
  const cursor = new Date(weekStart);
  while (cursor <= lastDay) {
    total += getExpectedRolloverForDate(platform, cursor, ctx);
    cursor.setDate(cursor.getDate() + 1);
  }
  return r2(total + sumHighBonusForWeek(platform, refDate).rollover);
}

// Monta a entrada de highBonusLog. O bônus nasce 1 s DEPOIS do depósito
// (o depósito libera o bônus) — no Rollover, entra logo após ele.
export function buildHighBonusEntry({ depositDate, value, scale = 1, now = new Date() }) {
  const v = r2(value);
  const s = normalizeRolloverScale(scale); // (14) 0 = sem rollover
  const base = depositDate && !isNaN(new Date(depositDate).getTime()) ? new Date(depositDate).getTime() : now.getTime();
  return {
    id: `hb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    date: new Date(base + 1000).toISOString(),
    value: v,
    scale: s,
    rolloverValue: r2(v * s),
    depositDate: depositDate || null,
    createdAt: now.toISOString()
  };
}

function sumHighBonusOnDay(platform, date) {
  const key = toLocalDateKey(date);
  return r2(getHighBonusEntries(platform)
    .filter(e => toLocalDateKey(e.date) === key)
    .reduce((s, e) => s + (Number(e.value) || 0), 0));
}

// Bônus alto da semana de refDate, de segunda até o FIM do dia de refDate
// (mesmo intervalo de computeAutoAccruedBonusForWeek).
export function sumHighBonusForWeek(platform, refDate = new Date()) {
  const weekStart = getWeekStartLocal(refDate);
  const weekEnd = getWeekEndLocal(weekStart);
  const dayEnd = new Date(refDate);
  dayEnd.setHours(23, 59, 59, 999);
  const last = dayEnd < weekEnd ? dayEnd : weekEnd;
  let raw = 0;
  let rollover = 0;
  getHighBonusEntries(platform).forEach(e => {
    const d = new Date(e.date);
    if (d < weekStart || d > last) return;
    raw += Number(e.value) || 0;
    rollover += highBonusRollover(e);
  });
  return { raw: r2(raw), rollover: r2(rollover) };
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
  total += b.alto;
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

// (8a) Avulso medido pela conferência de saldo — conta sempre inteiro.
export function isFixedOtherBonus(e) {
  return !!e && e.source === 'balance-check';
}

// (12b) Instante em que o lançamento foi REGISTRADO (createdAt); entradas
// antigas sem createdAt usam a própria data.
function recordedAt(e) {
  const t = new Date(e && e.createdAt ? e.createdAt : e && e.date).getTime();
  return Number.isFinite(t) ? t : new Date(e.date).getTime();
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
  // (8a) Avulso da conferência: sempre inteiro, fora da regra do total.
  const fixed = entries.filter(isFixedOtherBonus);
  const flex = entries.filter(e => !isFixedOtherBonus(e));
  const fixedRaw = r2(fixed.reduce((s, e) => s + (Number(e.rawValue) || 0), 0));
  const fixedRollover = r2(fixed.reduce((s, e) => s + (Number(e.rolloverValue) || 0), 0));
  const rawSum = flex.reduce((s, e) => s + (Number(e.rawValue) || 0), 0);
  const rolloverSum = flex.reduce((s, e) => s + (Number(e.rolloverValue) || 0), 0);

  const base = { dayKey: key, entries, rawSum: r2(rawSum), rolloverSum: r2(rolloverSum), fixedRaw, fixedRollover };

  if (entries.length === 0) {
    return { ...base, raw: 0, rollover: 0, ratio: 1, claimed: null, formula: null, formulaAtLog: null };
  }

  const claims = flex.filter(hasClaim);
  if (claims.length === 0) {
    // Só lançamentos antigos (+ conferência): comportamento de sempre (Σ rawValue).
    return { ...base, raw: r2(rawSum + fixedRaw), rollover: r2(rolloverSum + fixedRollover), ratio: 1, claimed: null, formula: null, formulaAtLog: null };
  }

  // (12b) Total que vale = o maior informado (empate: o registrado por
  // último). Ele só desconta as conferências registradas ANTES dele.
  const governing = claims.reduce((best, e) => (
    !best || e.claimedTotal > best.claimedTotal
      || (e.claimedTotal === best.claimedTotal && recordedAt(e) >= recordedAt(best))
      ? e : best
  ), null);
  const claimed = governing.claimedTotal;
  const claimAt = recordedAt(governing);
  const fixedBeforeClaim = r2(fixed
    .filter(e => recordedAt(e) <= claimAt)
    .reduce((s, e) => s + (Number(e.rawValue) || 0), 0));
  const latestClaim = [...claims].sort((a, b) => new Date(a.date) - new Date(b.date))[claims.length - 1];
  const formula = getExpectedBonusForDate(platform, dayKeyToDate(key), ctx);
  // Total do dia = max(fórmula + conferências anteriores, total informado)
  // + conferências posteriores (estas entram inteiras via fixedRaw).
  const flexRaw = r2(Math.max(0, claimed - formula - fixedBeforeClaim));
  const ratio = rawSum > 0 ? flexRaw / rawSum : 0;
  const flexRollover = rawSum > 0 ? r2(rolloverSum * ratio) : flexRaw;

  return {
    ...base,
    raw: r2(flexRaw + fixedRaw),
    rollover: r2(flexRollover + fixedRollover),
    flexRaw,
    flexRollover,
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
    if (isFixedOtherBonus(e)) {
      // (8a) conferência de saldo: sempre inteiro.
      raw = Number(e.rawValue) || 0;
      rollover = Number(e.rolloverValue) || 0;
    } else if (day.rawSum > 0) {
      raw = (Number(e.rawValue) || 0) * day.ratio;
      rollover = (Number(e.rolloverValue) || 0) * day.ratio;
    } else {
      // Caso degenerado (entradas sem rawValue): o efetivo flexível do dia
      // vai inteiro pro último lançamento (não-conferência) do dia.
      const flex = day.entries.filter(x => !isFixedOtherBonus(x));
      const last = [...flex].sort((a, b) => new Date(a.date) - new Date(b.date))[flex.length - 1];
      const flexRaw = day.flexRaw !== undefined ? day.flexRaw : r2(day.raw - day.fixedRaw);
      const flexRollover = day.flexRollover !== undefined ? day.flexRollover : r2(day.rollover - day.fixedRollover);
      raw = e === last ? flexRaw : 0;
      rollover = e === last ? flexRollover : 0;
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
