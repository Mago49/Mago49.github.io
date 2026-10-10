// === MOTOR DO MODULADOR DE APOSTAS (View Gráficos → Planejador — Sub 5) ===
// Função pura: sem DOM e sem Firestore. Mesmo princípio dos outros *-logic:
// nada aqui grava nada — a tela chama, mostra a prévia e o store grava.
//
// O QUE FAZ: distribui uma META (normalmente o Rollover da plataforma) por
// um período, dia a dia, seguindo uma CURVA (dias altos e baixos), e quebra
// cada dia em giros de valores reais da paleta (+ compra de bônus opcional).
//
// CENTAVOS: todas as contas internas são em centavos INTEIROS — nunca soma
// de ponto flutuante. Saída também em centavos (sufixo C).
//
// GARANTIA DE FECHAMENTO (decisão do usuário): com valores fixos de aposta
// nem sempre dá pra bater a meta exata (R$ 0,40 não forma R$ 0,10). O plano
// SEMPRE cobre a meta e passa dela no máximo pelo valor de 1 giro do menor
// valor permitido. A diferença é carregada de um dia pro seguinte, então a
// sobra NÃO se acumula ao longo do período. Exceção explícita: se o PISO
// diário obrigar um dia a ficar acima do que a curva pedia, a sobra final
// pode passar disso — `excessC` sempre mostra o valor real, sem esconder.
//
// COMPRA DE BÔNUS: conta 100% como apostado (decisão do usuário). Só nos
// dias ALTOS: usa o MAIOR valor da paleta cujo custo (valor × multiplicador)
// cabe em até 60% do dia — o resto do dia vira giros.
//
// DETERMINÍSTICO: mesmos parâmetros => mesmo plano, sempre (inclusive a
// curva "Caos", que usa um gerador com SEMENTE). É isso que permite salvar
// só os parâmetros + os dias e regerar igual depois.
//
// === (Sub-entrega 5b) ===
// a) DIAS PROIBIDOS / SEGUIR ROTINA: params.excludeKeys (dias que o plano
//    pula — vêm das rotinas "Não apostar") e params.onlyKeys (só esses dias
//    — "Seguir rotina" de aposta). A tela resolve as datas a partir das
//    rotinas e grava a lista PRONTA nos parâmetros: o plano salvo regera
//    igual mesmo que a rotina mude depois.
// b) META DE GANHO (opcional): params.goal = { mode:'none'|'value'|'percent',
//    value, baseBalance }. Só referência visual — progresso = R.B. das
//    apostas lançadas desde o 1º dia do plano (computeGoalProgress).
// c) SEMANA DE CAUTELA: regra do usuário — Lucro real (R.B. + Bônus) da
//    semana passada acima do limite => cautela. computeCautionStats mede no
//    histórico do próprio usuário quantas vezes a semana seguinte foi
//    negativa (a regra vira estatística, não impressão).
//
// === (Sub-entrega 7b) ROLLOVER PROJETADO ===
// computePlanProjections aceita world.inflows = [{ key, valueC }]: o que
// ainda vai ENTRAR no Rollover (depósitos de rotina, depósito sugerido do
// Misterioso, bônus do Misterioso nas próximas emissões). A linha passa a
// ser: Rollover de hoje + entradas até o dia − apostado planejado até o dia.
// Entrada antes do 1º dia do plano soma no 1º dia. Sem inflows = igual antes.
//
// === (Sub-entrega 11a) ===
// a) DIAS DE EMISSÃO DO MISTERIOSO: params.skipEmissions (subconjunto de
//    2/3/7/15/30) + params.skipKeys (as datas já resolvidas pelo ciclo da
//    plataforma — emissionKeysInRange). O plano não distribui aposta
//    nesses dias. As datas vão GRAVADAS (o plano regera igual depois).
// b) VELOCIDADE / ÉPOCAS: params.dayBoost = { 'AAAA-MM-DD': multiplicador }
//    (speed-logic.js dayBoostsFor). O peso da curva do dia é multiplicado
//    — dias de época recebem fatia maior da MESMA meta. Sem dayBoost =
//    igual antes.
//
// === (Sub-entrega 11c) FORA DO CICLO ===
// params.pauseKeys: dias em que a plataforma está fora do ciclo do
// Misterioso (encerrada até a volta prevista) ou perto da virada do mês
// (instável) — cycle-history-logic.js offCycleKeys. Pulados como os
// outros; gravados no plano.

import { toLocalDateString, getWeekStart } from './finance-logic.js';
import { getCycleStart } from './cycle-logic.js';

// (11a) Dias do ciclo com emissão do Misterioso (mesma lista de
// computeEmissionDates em cycle-logic.js).
export const EMISSION_CYCLE_DAYS = Object.freeze([2, 3, 7, 15, 30]);

export const PLAN_MAX_DAYS = 120;
export const PLAN_MIN_SPINS = 10;            // giros mínimos do valor principal do dia
export const PLAN_BUY_MAX_SHARE = 0.6;       // compra de bônus: até 60% do dia
export const PLAN_TARGET_MAX_C = 100000000;  // R$ 1.000.000,00 — teto defensivo

// Paleta inicial (decisão do usuário) — editável no Planejador.
export const DEFAULT_STAKES = Object.freeze([0.4, 0.45, 0.5, 0.6, 1, 2, 3, 10, 20, 60, 100, 500]);
export const DEFAULT_BUY_MULTIPLIERS = Object.freeze([50, 75, 100]);

export const CURVES = Object.freeze([
  { id: 'onda', label: 'Onda', usesRhythm: true },
  { id: 'pulso', label: 'Pulso', usesRhythm: true },
  { id: 'escada-up', label: 'Escada ↑', usesRhythm: false },
  { id: 'escada-down', label: 'Escada ↓', usesRhythm: false },
  { id: 'caos', label: 'Caos', usesRhythm: false, usesSeed: true },
  { id: 'uniforme', label: 'Uniforme', usesRhythm: false }
]);

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- utilidades ----------

export function toCents(reais) {
  return Math.round((Number(reais) || 0) * 100);
}

export function fromCents(c) {
  return Math.round(Number(c) || 0) / 100;
}

function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function isValidDayKey(key) {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false;
  const d = dayKeyToDate(key);
  return !isNaN(d.getTime()) && toLocalDateString(d) === key;
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + n));
}

// Gerador pseudoaleatório com semente (mulberry32) — determinístico.
function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paleta limpa: só valores > 0, finitos, sem repetição, em ordem, centavos.
export function normalizeStakes(list) {
  const set = new Set();
  (Array.isArray(list) ? list : []).forEach(v => {
    const c = toCents(v);
    if (Number.isFinite(c) && c > 0 && c <= 10000000) set.add(c);
  });
  return [...set].sort((a, b) => a - b);
}

export function normalizeMultipliers(list) {
  const set = new Set();
  (Array.isArray(list) ? list : []).forEach(v => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 2 && n <= 1000) set.add(n);
  });
  return [...set].sort((a, b) => a - b);
}

// ---------- dias e pesos ----------

// Dias ativos de startKey a endKey (inclusivos), menos os dias da semana de
// folga (0 = domingo ... 6 = sábado).
// (5b) onlyKeys: se for lista não vazia, só esses dias. excludeKeys: pula.
export function listActiveDays(startKey, endKey, weekdaysOff = [], onlyKeys = null, excludeKeys = null) {
  const off = new Set((weekdaysOff || []).map(Number));
  const only = Array.isArray(onlyKeys) && onlyKeys.length ? new Set(onlyKeys) : null;
  const skip = new Set(Array.isArray(excludeKeys) ? excludeKeys : []);
  const days = [];
  if (!isValidDayKey(startKey) || !isValidDayKey(endKey) || startKey > endKey) return days;
  let key = startKey;
  let guard = 0;
  while (key <= endKey && guard < 400) {
    const wd = dayKeyToDate(key).getDay();
    if (!off.has(wd) && !skip.has(key) && (!only || only.has(key))) days.push({ key, weekday: wd });
    key = addDaysKey(key, 1);
    guard++;
  }
  return days;
}

// Peso de cada dia (1 = dia mais baixo possível, k = mais alto).
export function computeWeights(n, curve, intensity, rhythm, seed) {
  const k = Math.max(1, Math.min(10, Number(intensity) || 1));
  const r = Math.max(2, Math.min(14, Math.round(Number(rhythm) || 4)));
  const w = [];
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    let v = 1;
    if (curve === 'onda') v = 1 + (k - 1) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / r));
    else if (curve === 'pulso') v = (i % r === r - 1) ? k : 1;
    else if (curve === 'escada-up') v = n === 1 ? k : 1 + ((k - 1) * i) / (n - 1);
    else if (curve === 'escada-down') v = n === 1 ? k : k - ((k - 1) * i) / (n - 1);
    else if (curve === 'caos') v = 1 + (k - 1) * rand();
    w.push(v);
  }
  return { weights: w, k };
}

// Faixa do dia pelo peso relativo.
function tierOf(weight, k) {
  if (k <= 1) return 'medio';
  const t = (weight - 1) / (k - 1);
  if (t < 1 / 3) return 'baixo';
  if (t < 2 / 3) return 'medio';
  return 'alto';
}

// Distribui targetC pelos pesos respeitando piso/teto (centavos inteiros).
// Devolve { ok, amounts } ou { ok:false, error }.
export function distributeCents(targetC, weights, floorC = 0, capC = null) {
  const n = weights.length;
  if (n === 0) return { ok: false, error: 'Nenhum dia ativo no período.' };
  if (floorC * n > targetC) {
    return { ok: false, error: `O piso diário × ${n} dia(s) passa da meta. Diminua o piso, encurte o período ou aumente a meta.` };
  }
  if (capC !== null && capC * n < targetC) {
    return { ok: false, error: `O teto diário × ${n} dia(s) não alcança a meta. Aumente o teto ou o período.` };
  }

  const fixed = new Array(n).fill(null);
  for (let iter = 0; iter < n + 2; iter++) {
    let remaining = targetC;
    let wFree = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i] !== null) remaining -= fixed[i];
      else wFree += weights[i];
    }
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (fixed[i] !== null) continue;
      const share = wFree > 0 ? (remaining * weights[i]) / wFree : 0;
      if (share < floorC) { fixed[i] = floorC; changed = true; }
      else if (capC !== null && share > capC) { fixed[i] = capC; changed = true; }
    }
    if (!changed) break;
  }

  // Valores finais (reais), depois arredonda pra centavos sem perder nenhum.
  let remaining = targetC;
  let wFree = 0;
  for (let i = 0; i < n; i++) {
    if (fixed[i] !== null) remaining -= fixed[i];
    else wFree += weights[i];
  }
  const raw = weights.map((w, i) => (fixed[i] !== null ? fixed[i] : (wFree > 0 ? (remaining * w) / wFree : 0)));
  const floored = raw.map(v => Math.floor(v));
  let left = targetC - floored.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter(o => fixed[o.i] === null)
    .sort((a, b) => b.frac - a.frac);
  for (let j = 0; left > 0 && order.length; j = (j + 1) % order.length) {
    floored[order[j].i] += 1;
    left--;
  }
  return { ok: true, amounts: floored };
}

// Parte da paleta usada por cada faixa (terços; paleta curta usa tudo).
function stakesForTier(stakesC, tier) {
  const n = stakesC.length;
  if (n < 3) return stakesC.slice();
  const a = Math.ceil(n / 3);
  const b = Math.ceil((2 * n) / 3);
  if (tier === 'baixo') return stakesC.slice(0, a);
  if (tier === 'medio') return stakesC.slice(a, b);
  return stakesC.slice(b);
}

// Quebra a necessidade do dia (needC) em linhas de giro/compra. Sempre
// cobre needC; passa no máximo pelo menor valor permitido.
function buildDayLines(needC, tier, stakesC, buy) {
  const lines = [];
  if (needC <= 0) return { lines, plannedC: 0 };
  const smallest = stakesC[0];
  let rest = needC;

  // Compra de bônus (só dia ALTO): o MAIOR valor da paleta cujo custo
  // (valor × multiplicador) cabe em até PLAN_BUY_MAX_SHARE do dia.
  if (buy && buy.enabled && tier === 'alto' && buy.multiplier >= 2) {
    const limit = needC * PLAN_BUY_MAX_SHARE;
    const buyStake = [...stakesC].reverse().find(s => s * buy.multiplier <= limit);
    if (buyStake) {
      const cost = buyStake * buy.multiplier;
      lines.push({ kind: 'buy', stakeC: buyStake, multiplier: buy.multiplier, subtotalC: cost });
      rest -= cost;
    }
  }

  // Valor principal (sobre o que sobrou): o maior da faixa com pelo menos
  // PLAN_MIN_SPINS giros; senão o maior abaixo da faixa que caiba; senão o menor.
  const tierStakes = stakesForTier(stakesC, tier);
  const fits = s => Math.floor(rest / s) >= PLAN_MIN_SPINS;
  let main = [...tierStakes].reverse().find(fits);
  if (!main) main = [...stakesC].reverse().find(s => s <= (tierStakes[0] || smallest) && fits(s));
  if (!main) main = smallest;

  const count = Math.floor(rest / main);
  if (count > 0) {
    lines.push({ kind: 'spin', stakeC: main, count, subtotalC: count * main });
    rest -= count * main;
  }
  if (rest > 0) {
    const fine = Math.ceil(rest / smallest);
    const existing = lines.find(l => l.kind === 'spin' && l.stakeC === smallest);
    if (existing) {
      existing.count += fine;
      existing.subtotalC = existing.count * smallest;
    } else {
      lines.push({ kind: 'spin', stakeC: smallest, count: fine, subtotalC: fine * smallest });
    }
  }
  const plannedC = lines.reduce((s, l) => s + l.subtotalC, 0);
  return { lines, plannedC };
}

// ---------- validação dos parâmetros ----------

// todayKey: o plano nunca começa no passado.
export function validatePlanParams(params, todayKey) {
  const p = params || {};
  if (!isValidDayKey(p.startKey) || !isValidDayKey(p.endKey)) return { ok: false, error: 'Informe o início e o fim do período.' };
  if (p.startKey > p.endKey) return { ok: false, error: 'O início é depois do fim.' };
  if (todayKey && p.startKey < todayKey) return { ok: false, error: 'O plano não pode começar no passado.' };
  const span = Math.round((dayKeyToDate(p.endKey) - dayKeyToDate(p.startKey)) / 86400000) + 1;
  if (span > PLAN_MAX_DAYS) return { ok: false, error: `Período máximo de ${PLAN_MAX_DAYS} dias.` };
  if (!CURVES.some(c => c.id === p.curve)) return { ok: false, error: 'Escolha uma curva.' };
  const targetC = toCents(p.target);
  if (!(targetC > 0)) return { ok: false, error: 'Informe a meta (valor maior que zero).' };
  if (targetC > PLAN_TARGET_MAX_C) return { ok: false, error: 'Meta alta demais — confira o valor.' };
  if (normalizeStakes(p.stakes).length === 0) return { ok: false, error: 'Selecione pelo menos um valor de aposta.' };
  if ((Number(p.floor) || 0) < 0) return { ok: false, error: 'O piso não pode ser negativo.' };
  if (p.cap !== null && p.cap !== undefined && p.cap !== '' && !(Number(p.cap) > 0)) return { ok: false, error: 'Teto inválido.' };
  if (p.cap && Number(p.floor) && Number(p.cap) < Number(p.floor)) return { ok: false, error: 'O teto é menor que o piso.' };
  return { ok: true };
}

// ---------- o plano ----------

/**
 * params: { startKey, endKey, weekdaysOff[], target (R$), curve, intensity,
 *           rhythm, seed, floor (R$), cap (R$|null), stakes[R$],
 *           buy: { enabled, multiplier } }
 * Devolve { ok, days[], totals, warnings[] } ou { ok:false, error }.
 */
export function buildPlan(params, todayKey = null) {
  const check = validatePlanParams(params, todayKey);
  if (!check.ok) return check;

  const p = params;
  if (p.followRoutineId && !(Array.isArray(p.onlyKeys) && p.onlyKeys.length)) {
    return { ok: false, error: 'A rotina escolhida não tem nenhum dia neste período.' };
  }
  // (11a) Dias de emissão do Misterioso marcados pra não apostar.
  const skipKeys = Array.isArray(p.skipKeys) ? p.skipKeys : [];
  const pauseKeys = Array.isArray(p.pauseKeys) ? p.pauseKeys : []; // (11c)
  const excluded = [...(Array.isArray(p.excludeKeys) ? p.excludeKeys : []), ...skipKeys, ...pauseKeys];
  const days = listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, excluded);
  if (days.length === 0) return { ok: false, error: 'Nenhum dia ativo no período (folgas, dias proibidos, dias de emissão ou rotina sem dias).' };
  const baseDays = listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, null).length;
  const skippedForbidden = baseDays - listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, p.excludeKeys).length;
  const withEmission = [...(Array.isArray(p.excludeKeys) ? p.excludeKeys : []), ...skipKeys];
  const skippedEmission = listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, p.excludeKeys).length - listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, withEmission).length;
  const skippedPause = listActiveDays(p.startKey, p.endKey, p.weekdaysOff, p.onlyKeys, withEmission).length - days.length;

  const stakesC = normalizeStakes(p.stakes);
  const targetC = toCents(p.target);
  const floorC = toCents(p.floor || 0);
  const capC = (p.cap === null || p.cap === undefined || p.cap === '' || !(Number(p.cap) > 0)) ? null : toCents(p.cap);
  const { weights, k } = computeWeights(days.length, p.curve, p.intensity, p.rhythm, p.seed);
  // (11a) Épocas: multiplica o peso dos dias cobertos.
  const boost = p.dayBoost && typeof p.dayBoost === 'object' ? p.dayBoost : null;
  let boostedDays = 0;
  if (boost) {
    days.forEach((d, i) => {
      const m = Number(boost[d.key]);
      if (Number.isFinite(m) && m > 0 && m !== 1) { weights[i] *= m; boostedDays++; }
    });
  }

  const dist = distributeCents(targetC, weights, floorC, capC);
  if (!dist.ok) return dist;

  const buy = p.buy && p.buy.enabled ? { enabled: true, multiplier: Math.round(Number(p.buy.multiplier) || 0) } : null;
  const warnings = [];
  if (buy && !(buy.multiplier >= 2)) warnings.push('Multiplicador da compra de bônus inválido — compra ignorada.');
  if (skippedForbidden > 0) warnings.push(`${skippedForbidden} dia(s) proibido(s) pelas rotinas foram pulados.`);
  if (skippedEmission > 0) warnings.push(`${skippedEmission} dia(s) de emissão do Misterioso pulado(s).`);
  if (skippedPause > 0) warnings.push(`${skippedPause} dia(s) fora do ciclo (encerrado ou virada do mês instável) pulado(s).`);
  if (boostedDays > 0) warnings.push(`${boostedDays} dia(s) em época de velocidade recebem fatia maior da meta.`);

  // Fechamento carregado: cada dia cobre o que falta até o acumulado
  // desejado — a sobra de um dia abate o seguinte (nunca se acumula).
  let desiredCum = 0;
  let plannedCum = 0;
  const out = days.map((d, i) => {
    desiredCum += dist.amounts[i];
    const tier = tierOf(weights[i], k);
    const need = Math.max(desiredCum - plannedCum, floorC, 0);
    const { lines, plannedC } = buildDayLines(need, tier, stakesC, buy);
    plannedCum += plannedC;
    return {
      key: d.key,
      weekday: d.weekday,
      weight: Math.round(weights[i] * 1000) / 1000,
      tier,
      targetC: dist.amounts[i],
      plannedC,
      lines
    };
  });

  const planned = out.map(d => d.plannedC);
  const excessC = plannedCum - targetC;
  if (excessC >= stakesC[0] && floorC > 0) {
    warnings.push('O piso diário forçou alguns dias acima da curva — a sobra final passou de 1 giro.');
  }
  if (buy && !out.some(d => d.lines.some(l => l.kind === 'buy'))) {
    warnings.push('A compra de bônus não coube em nenhum dia alto (custo acima de 60% do dia).');
  }

  return {
    ok: true,
    days: out,
    totals: {
      targetC,
      plannedC: plannedCum,
      excessC,
      activeDays: out.length,
      maxDayC: Math.max(...planned),
      minDayC: Math.min(...planned),
      buys: out.reduce((s, d) => s + d.lines.filter(l => l.kind === 'buy').length, 0),
      spins: out.reduce((s, d) => s + d.lines.filter(l => l.kind === 'spin').reduce((a, l) => a + l.count, 0), 0)
    },
    warnings
  };
}

// ---------- projeções ----------

/**
 * Projeções do plano (puro — o "mundo" entra por parâmetro):
 *   startRolloverC   Rollover atual em centavos (ou null = desconhecido)
 *   wagerTotalNow    Total Apostado real agora, em R$ (ou null)
 *   thresholds       tabela Aposta Necessária V0..V5 em R$ (ou null)
 *   levelNow         nível VIP cadastrado agora (número ou null)
 *   group            'com' | 'sem' | null
 *   betMinimumByLevel  { nível: R$ }
 *   dailyBonusAt(dayKey) -> R$ do Bônus Diário vigente naquele dia
 */
export function computePlanProjections(days, world = {}) {
  const res = { rollover: [], rolloverZeroKey: null, vipReach: [], unlockDays: null, unlockBonus: null, bonusMode: null, inflowC: 0, inflowInPlanC: 0 };
  const startRolloverC = Number.isFinite(world.startRolloverC) ? world.startRolloverC : null;
  const inflows = (Array.isArray(world.inflows) ? world.inflows : [])
    .filter(x => x && isValidDayKey(x.key) && Number(x.valueC) > 0)
    .map(x => ({ key: x.key, valueC: Math.round(Number(x.valueC)) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const lastKey = days.length ? days[days.length - 1].key : null;
  res.inflowC = inflows.reduce((s, x) => s + x.valueC, 0);
  res.inflowInPlanC = inflows.filter(x => lastKey && x.key <= lastKey).reduce((s, x) => s + x.valueC, 0);

  let cum = 0;
  let inCum = 0;
  let ii = 0;
  days.forEach(d => {
    cum += d.plannedC;
    while (ii < inflows.length && inflows[ii].key <= d.key) { inCum += inflows[ii].valueC; ii++; }
    if (startRolloverC !== null) {
      const left = Math.max(0, startRolloverC + inCum - cum);
      res.rollover.push(left);
    }
  });
  // Zerado = a partir do dia em que fica em 0 e não volta a subir (uma
  // entrada prevista depois do zero "reabre" o Rollover).
  if (res.rollover.length === days.length && days.length) {
    let i = res.rollover.length;
    while (i > 0 && res.rollover[i - 1] === 0) i--;
    if (i < res.rollover.length) res.rolloverZeroKey = days[i].key;
  }

  // VIP: primeiro dia em que Total Apostado + acumulado do plano passa de cada nível.
  const t = Array.isArray(world.thresholds) ? world.thresholds : null;
  if (t && Number.isFinite(world.wagerTotalNow)) {
    const nowC = toCents(world.wagerTotalNow);
    let levelReached = 0;
    t.forEach((v, i) => { if (nowC >= toCents(v)) levelReached = i; });
    let acc = nowC;
    days.forEach(d => {
      acc += d.plannedC;
      for (let lv = levelReached + 1; lv < t.length; lv++) {
        if (acc >= toCents(t[lv]) && !res.vipReach.some(r => r.level === lv)) {
          res.vipReach.push({ level: lv, key: d.key });
          levelReached = lv;
        }
      }
    });
  }

  // Bônus Diário (grupo COM depende do mínimo do nível; SEM independe).
  if (world.group === 'sem') {
    res.bonusMode = 'sem';
  } else if (world.group === 'com') {
    const lv = Number.isInteger(world.levelNow) ? world.levelNow : null;
    const minimo = lv !== null && world.betMinimumByLevel ? (Number(world.betMinimumByLevel[lv]) || 0) : 0;
    if (lv === null) {
      res.bonusMode = 'sem-nivel';
    } else if (minimo <= 0) {
      res.bonusMode = 'manual';
    } else {
      res.bonusMode = 'com';
      res.minimumC = toCents(minimo);
      let count = 0;
      let bonus = 0;
      days.forEach(d => {
        if (d.plannedC >= res.minimumC) {
          count++;
          if (typeof world.dailyBonusAt === 'function') bonus += Number(world.dailyBonusAt(d.key)) || 0;
        }
      });
      res.unlockDays = count;
      res.unlockBonus = Math.round(bonus * 100) / 100;
    }
  }
  return res;
}

// ---------- formato gravado (compacto) ----------

// Plano -> documento (só números/strings/listas — nada de undefined).
export function planToDoc(platform, params, plan, nowIso) {
  return {
    platformId: platform.id,
    platformName: String(platform.name || ''),
    createdAt: nowIso,
    updatedAt: nowIso,
    params: sanitizeParams(params),
    totals: {
      targetC: plan.totals.targetC,
      plannedC: plan.totals.plannedC,
      excessC: plan.totals.excessC,
      activeDays: plan.totals.activeDays
    },
    days: plan.days.map(d => ({
      key: d.key,
      tier: d.tier,
      targetC: d.targetC,
      plannedC: d.plannedC,
      lines: d.lines.map(l => (l.kind === 'buy'
        ? { kind: 'buy', stakeC: l.stakeC, multiplier: l.multiplier, subtotalC: l.subtotalC }
        : { kind: 'spin', stakeC: l.stakeC, count: l.count, subtotalC: l.subtotalC }))
    }))
  };
}

// Parâmetros limpos (tipos garantidos) — usado pra gravar e pra comparar.
function cleanKeyList(list, startKey, endKey) {
  return [...new Set((Array.isArray(list) ? list : []).filter(k => isValidDayKey(k) && (!startKey || k >= startKey) && (!endKey || k <= endKey)))].sort();
}

function cleanGoal(g) {
  const mode = g && ['value', 'percent'].includes(g.mode) ? g.mode : 'none';
  const value = mode === 'none' ? 0 : Math.max(0, fromCents(toCents(g.value)));
  const baseBalance = mode === 'percent' ? Math.max(0, fromCents(toCents(g.baseBalance))) : 0;
  if (mode !== 'none' && !(value > 0)) return { mode: 'none', value: 0, baseBalance: 0 };
  return { mode, value, baseBalance };
}

export function sanitizeParams(p) {
  const cap = (p.cap === null || p.cap === undefined || p.cap === '' || !(Number(p.cap) > 0)) ? null : fromCents(toCents(p.cap));
  const startKey = String(p.startKey || '');
  const endKey = String(p.endKey || '');
  return {
    startKey,
    endKey,
    weekdaysOff: [...new Set((p.weekdaysOff || []).map(Number).filter(n => n >= 0 && n <= 6))].sort(),
    target: fromCents(toCents(p.target)),
    curve: String(p.curve || 'onda'),
    intensity: Math.max(1, Math.min(10, Math.round(Number(p.intensity) || 1))),
    rhythm: Math.max(2, Math.min(14, Math.round(Number(p.rhythm) || 4))),
    seed: Math.max(1, Math.round(Number(p.seed) || 1)),
    floor: fromCents(toCents(p.floor || 0)),
    cap,
    stakes: normalizeStakes(p.stakes).map(fromCents),
    buy: { enabled: !!(p.buy && p.buy.enabled), multiplier: Math.round(Number(p.buy && p.buy.multiplier) || 0) },
    // (5b)
    excludeKeys: cleanKeyList(p.excludeKeys, startKey, endKey),
    onlyKeys: p.followRoutineId ? cleanKeyList(p.onlyKeys, startKey, endKey) : [],
    followRoutineId: p.followRoutineId ? String(p.followRoutineId) : null,
    goal: cleanGoal(p.goal),
    // (11a)
    skipEmissions: [...new Set((Array.isArray(p.skipEmissions) ? p.skipEmissions : []).map(Number).filter(n => EMISSION_CYCLE_DAYS.includes(n)))].sort((a, b) => a - b),
    skipKeys: cleanKeyList(p.skipKeys, startKey, endKey),
    pauseKeys: cleanKeyList(p.pauseKeys, startKey, endKey),
    dayBoost: cleanBoost(p.dayBoost, startKey, endKey)
  };
}

function cleanBoost(b, startKey, endKey) {
  const out = {};
  if (!b || typeof b !== 'object') return out;
  Object.keys(b).sort().forEach(k => {
    if (!isValidDayKey(k) || (startKey && k < startKey) || (endKey && k > endKey)) return;
    const m = Math.round(Number(b[k]) * 100) / 100;
    if (Number.isFinite(m) && m > 0 && m !== 1) out[k] = Math.min(5, Math.max(0.25, m));
  });
  return out;
}

/**
 * (11a) Datas de emissão do Misterioso da plataforma entre startKey e
 * endKey, só dos dias do ciclo escolhidos (2/3/7/15/30).
 *   - ciclo encerrado (🏁 Fim): nenhuma;
 *   - com Reinício (lastResetDate): as emissões DESSE ciclo (o próximo
 *     Reinício ainda não é conhecido);
 *   - sem Reinício: ciclo mensal — dia 1 de cada mês do período.
 */
export function emissionKeysInRange(platform, startKey, endKey, cycleDays = EMISSION_CYCLE_DAYS) {
  const wanted = (cycleDays || []).map(Number).filter(n => EMISSION_CYCLE_DAYS.includes(n));
  if (!platform || platform.cycleEnded || !wanted.length || !isValidDayKey(startKey) || !isValidDayKey(endKey) || startKey > endKey) return [];
  const starts = [];
  if (platform.lastResetDate) {
    starts.push(getCycleStart(platform, dayKeyToDate(startKey)));
  } else {
    const a = dayKeyToDate(startKey);
    const b = dayKeyToDate(endKey);
    // Mês anterior também: o dia 30 de um mês curto pode cair no seguinte.
    for (let d = new Date(a.getFullYear(), a.getMonth() - 1, 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      starts.push(new Date(d));
    }
  }
  const out = new Set();
  starts.forEach(cs => wanted.forEach(day => {
    const k = toLocalDateString(new Date(cs.getFullYear(), cs.getMonth(), cs.getDate() + day - 1));
    if (k >= startKey && k <= endKey) out.add(k);
  }));
  return [...out].sort();
}

export function sameParams(a, b) {
  return JSON.stringify(sanitizeParams(a || {})) === JSON.stringify(sanitizeParams(b || {}));
}

// ============================================================
// (Sub-entrega 5b) META DE GANHO e SEMANA DE CAUTELA — puro, só leitura
// ============================================================

export const DEFAULT_CAUTION_THRESHOLD = 500;

function weekLucro(w) {
  const v = Number(w && w.rbPlusBonus);
  if (Number.isFinite(v)) return v;
  return (Number(w && w.resultBetting) || 0) + (Number(w && w.bonus) || 0);
}

// Meta de ganho: alvo em R$ e progresso pelo R.B. das apostas lançadas
// desde o 1º dia do plano (00:00) até agora. null = sem meta.
export function computeGoalProgress(platform, startKey, goal, now = new Date()) {
  const g = cleanGoal(goal);
  if (g.mode === 'none' || !isValidDayKey(startKey)) return null;
  const target = g.mode === 'value' ? g.value : (g.baseBalance > 0 ? Math.round(g.baseBalance * g.value) / 100 : 0);
  if (!(target > 0)) return { mode: g.mode, target: 0, result: 0, progress: 0, reached: false, started: false, invalid: true };
  const start = dayKeyToDate(startKey).getTime();
  const end = now.getTime();
  let rbC = 0;
  (platform && platform.betEntries || []).forEach(e => {
    if (!e || !e.date) return;
    const t = new Date(e.date).getTime();
    if (isNaN(t) || t < start || t > end) return;
    rbC += toCents(e.resultBetting);
  });
  const result = fromCents(rbC);
  return {
    mode: g.mode,
    percent: g.mode === 'percent' ? g.value : null,
    baseBalance: g.mode === 'percent' ? g.baseBalance : null,
    target,
    result,
    progress: Math.max(0, Math.min(1, result / target)),
    reached: result >= target,
    started: end >= start
  };
}

// Status de cautela da plataforma: olha a semana fechada IMEDIATAMENTE
// anterior à semana de refDate. Semana mais antiga (sem fechamento da
// passada) = sem informação, nunca "cautela" por dado velho.
export function getCautionStatus(platform, threshold = DEFAULT_CAUTION_THRESHOLD, refDate = new Date()) {
  const prevWeekKey = toLocalDateString(getWeekStart(new Date(getWeekStart(refDate).getTime() - 86400000)));
  const w = (platform && platform.financeWeeks || []).find(x => x && x.weekStart === prevWeekKey);
  if (!w) return { status: 'unknown', weekStart: prevWeekKey, lucro: null, pending: false };
  const lucro = Math.round(weekLucro(w) * 100) / 100;
  return {
    status: lucro > threshold ? 'caution' : 'ok',
    weekStart: prevWeekKey,
    lucro,
    pending: w.bonusPending === true
  };
}

// Estatística da regra no histórico: em quantas semanas o Lucro passou do
// limite e, dessas (com a semana seguinte fechada), quantas vezes a
// seguinte foi negativa. platforms = todas (geral) ou [uma] (só ela).
export function computeCautionStats(platforms, threshold = DEFAULT_CAUTION_THRESHOLD) {
  let triggers = 0;
  let negatives = 0;
  let baseWeeks = 0;
  let baseNegatives = 0;
  (platforms || []).forEach(p => {
    const byStart = new Map();
    (p.financeWeeks || []).forEach(w => { if (w && isValidDayKey(w.weekStart)) byStart.set(w.weekStart, w); });
    byStart.forEach((w, key) => {
      const next = byStart.get(addDaysKey(key, 7));
      if (!next) return;
      baseWeeks++;
      if (weekLucro(next) < 0) baseNegatives++;
      if (weekLucro(w) > threshold) {
        triggers++;
        if (weekLucro(next) < 0) negatives++;
      }
    });
  });
  return {
    triggers,
    negatives,
    rate: triggers > 0 ? negatives / triggers : null,
    // Comparação justa: com que frequência QUALQUER semana é seguida de negativa.
    baseRate: baseWeeks > 0 ? baseNegatives / baseWeeks : null,
    baseWeeks
  };
}

// Preset de proteção sugerido na semana de cautela (a tela aplica só se o
// usuário tocar).
export const CAUTION_PRESET = Object.freeze({ intensity: 2, curve: 'uniforme', buyEnabled: false });
