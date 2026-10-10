// === UI DA ABA "PLANEJADOR" — Modulador de Apostas (View Gráficos — Sub 5) ===
// Montada SOB DEMANDA por view-graficos.js: na primeira abertura da aba,
// depois do Chart.js carregado e com o painel visível (mesmo cuidado da
// aba Análises — canvas em painel oculto nasce com tamanho 0).
//
// FLUXO: escolhe a plataforma -> ajusta meta/período/curva/limites/valores
// -> a prévia (gráfico + indicadores + dias) se redesenha AO VIVO ->
// "Salvar plano". Toda conta vem de plan-logic.js (puro).
//
// BANCO DE DADOS: só plan-store.js (coleções betPlans e plannerConfig).
// Esta tela NUNCA grava plataforma. Leituras: planos + paleta (estritas —
// falha = tela bloqueada com "Tentar de novo", nada é salvo em cima do que
// não foi lido) e tabelas de Aposta Necessária (tolerante — falha só
// esconde a projeção de nível VIP).
//
// DADOS DO SISTEMA (só leitura): Rollover ao vivo (computeRolloverLive —
// exige contexto de bônus confirmado; sem ele, "Usar Rollover" fica
// desligado), Total Apostado (computeWagerTotal), nível/grupo da plataforma
// e Bônus Diário vigente (getVipConfigAt), mínimo do nível
// (BET_MINIMUM_BY_LEVEL). Promoções futuras de nível NÃO são simuladas:
// a projeção do Bônus Diário usa o nível de hoje (avisado na tela).
//
// ESTADO DO FORMULÁRIO: guardado em variável de módulo (sobrevive à troca
// de aba/rota durante a sessão).
//
// SEGURANÇA: nome de plataforma só entra por textContent (opções do select
// e textos); nenhum dado do usuário vai em innerHTML.
//
// === (Sub-entrega 5b) ===
// - RADAR no topo da prévia: Semana de cautela (Lucro real da semana
//   passada × limite editável, + estatística da regra no histórico do
//   usuário + botão "Aplicar proteção") e Meta de ganho (opcional).
// - META DE GANHO: R$ fixo ou % do Saldo. A base do % é o Saldo do momento
//   em que o % é escolhido — fica congelada no plano (não muda sozinha).
//   Exige o contexto de bônus (Saldo depende dele).
// - ROTINAS (routine-store.js, leitura tolerante): dias "Não apostar" da
//   plataforma são pulados sozinhos; "Seguir rotina" usa só os dias de uma
//   rotina de aposta. Rotinas não carregadas = aviso explícito (o plano
//   pode cair num dia proibido).
//
// === (Sub-entrega 7b) ROLLOVER PROJETADO ===
// Além do Rollover de hoje, a tela soma o que ainda vai ENTRAR no Rollover
// até o fim do período (computeInflows):
//   - depósitos das rotinas "Depositar" da plataforma (mínimo da rotina);
//   - depósito sugerido pelo Misterioso pra plataforma (plano da aba
//     Misterioso, dentro do orçamento) — entra hoje;
//   - bônus do Misterioso nas emissões do período, pela faixa que esses
//     depósitos alcançam (só o que o Rollover ao vivo ainda não conta).
// A linha do gráfico vira "Rollover previsto" (hoje + entradas − apostado)
// e o botão "Usar projetado" põe na Meta o Rollover + entradas do período.
// Só leitura: nada disso é gravado no plano (a meta é o que você salvar).
//
// === (Sub-entrega 8b) ADERÊNCIA ===
// Card no radar: dos últimos 14 dias fechados com plano, quantos foram
// cumpridos (✅/🟡/❌ — mesmo critério do Calendário) e o desvio do real
// pro planejado. O planejado dos dias passados vem do histórico congelado
// (planLog — leitura tolerante aqui; sem ele, usa o plano salvo).
//
// === (Sub-entrega 11a) ===
// a) "Não apostar nos dias de emissão do Misterioso": atalhos 2/3/7/15/30.
//    As datas saem do ciclo da plataforma (emissionKeysInRange) e vão
//    gravadas no plano (params.skipEmissions + params.skipKeys).
// b) "⚡ Velocidade": peso da plataforma + épocas (ui-speed.js →
//    plannerConfig/speed). Dias de época recebem fatia maior da meta
//    (params.dayBoost, gravado no plano); "Usar Rollover/projetado" sugere
//    a meta × peso. O otimizador do Misterioso também usa o peso.
//
// === (Sub-entrega 11b) 💼 CAIXA DO PERÍODO ===
// Card no topo (newplatform-logic.js computeCash), de hoje até o fim do
// Dia/Semana/Mês/Ano: 🗓️ ativação semanal necessária (rotinas 🗓️ — quem
// não tem rotina aparece no aviso), ⬆️ a mais (orçamento do Misterioso),
// 🎲 depósito de aposta (limite mensal — editável aqui, MESMO campo da aba
// Misterioso), 🆕 novas plataformas (ui-new-platform.js →
// plannerConfig/newPlatforms) e o total que precisa ter na conta. Só
// previsão: nada aqui é lançamento. O plano da plataforma avisa quando ela
// não tem rotina 🗓️.
//
// === (Sub-entrega 11c) CICLOS ===
// - Card "🚫 Não depositar agora": plataformas com ciclo encerrado (e a
//   volta prevista pelo histórico de ciclos), instáveis perto da virada do
//   mês e as "sem ciclo"; botão "🔁 Reconstruir ciclos" (todas, pelas
//   fotos diárias — ui-cycle-history.js).
// - Plano: dias fora do ciclo (params.pauseKeys) são pulados; a previsão
//   do ciclo aparece abaixo da plataforma.
// - Caixa: ciclo encerrado não conta ativação semanal até a volta prevista.

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { toLocalDateString, computeRolloverLive, computeLiveBalance } from './finance-logic.js';
import { getCurrentVipTemplateId, getVipConfigAt, BET_MINIMUM_BY_LEVEL } from './cycle-logic.js';
import { computeWagerTotal, parseMoneyInput } from './wager-total-logic.js';
import { loadWagerRequirements, isWagerRequirementsLoaded, getThresholdsFor } from './wager-requirements-store.js';
import {
  CURVES, WEEKDAY_LABELS, PLAN_MAX_DAYS, CAUTION_PRESET,
  buildPlan, computePlanProjections, planToDoc, sanitizeParams, sameParams,
  computeGoalProgress, getCautionStatus, computeCautionStats,
  addDaysKey, toCents, fromCents, EMISSION_CYCLE_DAYS, emissionKeysInRange
} from './plan-logic.js';
import { getPlatformSpeed, dayBoostsFor, formatMult } from './speed-logic.js';
import { openSpeedEditor } from './ui-speed.js';
import { computeCash, CASH_PERIODS, weeklyRoutinePlatformIds } from './newplatform-logic.js';
import { openNewPlatformEditor } from './ui-new-platform.js';
import { predictCycle, describePrediction, offCycleKeys, cycleState, nearMonthTurn } from './cycle-history-logic.js';
import { openCycleRebuildAll } from './ui-cycle-history.js';
import {
  loadPlannerData, isPlannerLoaded, getSavedPlan, getSavedPlanIds, getPalette,
  getInvalidPlanCount, savePlan, deletePlan, savePalette,
  getPlannerSettings, savePlannerSettings, getStrategySettings, getCalendarSettings, getSavedPlans,
  getStrategyPriority, getSpeedConfig, getNewPlatformsConfig, saveStrategySettings
} from './plan-store.js';
import { loadRoutineData, isRoutinesLoaded, getRoutines } from './routine-store.js';
import { forbiddenBetDays, routineBetDays, betRoutinesFor, ROUTINE_HISTORY_DAYS, depositRoutineInflows } from './routine-logic.js';
import { buildMisteriosoStrategy, projectMisteriosoInflows } from './strategy-logic.js';
import { computeAdherence } from './calendar-logic.js';
import { loadPlanLogs, isPlanLogLoaded, getPlanLogEntry } from './plan-log-store.js';

const PREVIEW_DEBOUNCE_MS = 120;
const DAYS_COLLAPSED = 7;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // chips de seg a dom
const TIER_LABEL = { baixo: 'BAIXO', medio: 'MÉDIO', alto: 'ALTO' };
const TIER_COLOR = { baixo: '#93c5fd', medio: '#3b82f6', alto: '#1e3a8a' };

let rootEl = null;
let mounted = false;
let busy = false;
let resolveCtx = () => ({});
let contextConfirmed = false;
let loadStatus = 'idle'; // 'idle' | 'loading' | 'ok' | 'error'
let loadToken = 0;
let previewTimer = null;
let chart = null;
let showAllDays = false;
let lastPlan = null;   // último resultado de buildPlan (pra salvar exatamente o que está na tela)
let world = null;      // dados do sistema da plataforma escolhida
let routinesFailed = false; // (5b) rotinas não carregadas
let cashPeriod = 'week';     // (11b) período do Caixa (sessão)

// Formulário (sessão). Datas preenchidas no primeiro mount.
const form = {
  platformId: null,
  target: '',
  startKey: null,
  endKey: null,
  weekdaysOff: [],
  curve: 'onda',
  intensity: 4,
  rhythm: 4,
  seed: 1,
  floorMode: 'auto', // 'auto' (mínimo do nível) | 'manual' | 'none'
  floor: '',
  cap: '',
  stakes: null,      // null = todos da paleta
  buy: { enabled: false, multiplier: 100 },
  // (5b)
  followRoutineId: null,
  goal: { mode: 'none', valueText: '', baseBalance: 0 },
  // (11a) dias do ciclo com emissão do Misterioso em que NÃO apostar
  skipEmissions: []
};

// ---------- helpers ----------

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function todayKey() {
  return toLocalDateString(new Date());
}

function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function fmtDay(key) {
  const [, m, d] = key.split('-');
  return `${WEEKDAY_LABELS[dayKeyToDate(key).getDay()]} ${d}/${m}`;
}

function fmtShort(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function fmtFull(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function fmtMoneyInput(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtStake(reais) {
  return Number(reais).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function findPlatform(id) {
  return state.platforms.find(p => p.id === id) || null;
}

function sortedPlatforms() {
  return [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
}

function newSeed() {
  return Math.floor(Math.random() * 1e9) + 1;
}

// ---------- mundo da plataforma (só leitura) ----------

function computeWorld(platform) {
  if (!platform) return null;
  const now = new Date();
  let rolloverC = null;
  if (contextConfirmed) {
    try {
      rolloverC = toCents(computeRolloverLive(platform, now, resolveCtx(platform) || {}));
    } catch (err) {
      console.error('Planejador: falha ao calcular o Rollover:', err);
      rolloverC = null;
    }
  }
  const wagerTotalNow = computeWagerTotal(platform, now).total;
  let balance = null;
  if (contextConfirmed) {
    try { balance = computeLiveBalance(platform, now, resolveCtx(platform) || {}); } catch (err) { balance = null; }
  }
  const thresholds = isWagerRequirementsLoaded(state.currentUid)
    ? getThresholdsFor(getCurrentVipTemplateId(platform)).thresholds
    : null;
  const rawLevel = platform.level;
  const levelNow = (rawLevel === null || rawLevel === undefined || rawLevel === '') ? null : Number(rawLevel);
  const group = platform.group === 'com' || platform.group === 'sem' ? platform.group : null;
  const minimum = group === 'com' && Number.isInteger(levelNow) ? (Number(BET_MINIMUM_BY_LEVEL[levelNow]) || 0) : 0;
  // (7b) Misterioso: template da plataforma + sugestão do plano da aba
  // Misterioso (mesma conta, dentro do orçamento salvo).
  let misteriosoTemplate = null;
  let misteriosoPick = null;
  if (contextConfirmed) {
    try {
      misteriosoTemplate = (resolveCtx(platform) || {}).misteriosoTemplate || null;
      if (misteriosoTemplate && isPlannerLoaded(state.currentUid)) {
        const strategy = buildMisteriosoStrategy(state.platforms, resolveCtx, getStrategySettings(), now, getStrategyPriority(now));
        misteriosoPick = strategy.plan.picks.find(o => o.platformId === platform.id) || null;
      }
    } catch (err) {
      console.error('Planejador: falha ao calcular o Misterioso:', err);
      misteriosoTemplate = null;
      misteriosoPick = null;
    }
  }
  return {
    rolloverC,
    misteriosoTemplate,
    misteriosoPick,
    balance,
    wagerTotalNow,
    thresholds,
    levelNow: Number.isInteger(levelNow) ? levelNow : null,
    group,
    minimum,
    dailyBonusAt: (key) => getVipConfigAt(platform, dayKeyToDate(key)).cfg.daily
  };
}

// (7b) O que ainda vai entrar no Rollover de hoje até endKey.
function computeInflows(platform, endKey) {
  const empty = { items: [], routineC: 0, suggestionC: 0, misteriosoC: 0, unknown: 0, pick: null };
  if (!platform || !world || world.rolloverC === null || !endKey) return empty;
  const today = todayKey();
  if (endKey < today) return empty;
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  const routine = depositRoutineInflows(routines, platform, today, endKey);
  const items = routine.items.map(x => ({ key: x.key, valueC: x.valueC }));
  const out = { ...empty, unknown: routine.unknown, routineC: items.reduce((s, x) => s + x.valueC, 0) };
  if (world.misteriosoTemplate && !platform.cycleEnded) {
    const extras = items.slice();
    if (world.misteriosoPick) {
      out.pick = world.misteriosoPick;
      out.suggestionC = world.misteriosoPick.needC;
      extras.push({ key: today, valueC: world.misteriosoPick.needC });
    }
    const bonus = projectMisteriosoInflows(platform, world.misteriosoTemplate, extras, endKey, new Date());
    out.misteriosoC = bonus.reduce((s, x) => s + x.valueC, 0);
    out.items = [...extras, ...bonus];
  } else {
    out.items = items;
  }
  return out;
}

function currentFloor() {
  if (form.floorMode === 'none') return 0;
  if (form.floorMode === 'auto') return world ? world.minimum : 0;
  const v = parseMoneyInput(form.floor);
  return Number.isFinite(v) ? v : 0;
}

function currentParams() {
  const palette = getPalette();
  const stakes = Array.isArray(form.stakes) && form.stakes.length
    ? form.stakes.filter(s => palette.stakes.includes(s))
    : palette.stakes.slice();
  const target = parseMoneyInput(form.target);
  const cap = parseMoneyInput(form.cap);
  return {
    startKey: form.startKey,
    endKey: form.endKey,
    weekdaysOff: form.weekdaysOff.slice(),
    target: Number.isFinite(target) ? target : 0,
    curve: form.curve,
    intensity: form.intensity,
    rhythm: form.rhythm,
    seed: form.seed,
    floor: currentFloor(),
    cap: Number.isFinite(cap) && cap > 0 ? cap : null,
    stakes,
    buy: { enabled: form.buy.enabled, multiplier: form.buy.multiplier },
    ...routineKeysFor(form.startKey, form.endKey),
    goal: currentGoal(),
    // (11a)
    ...speedAndEmissionKeys(form.startKey, form.endKey)
  };
}

// (11a) Dias de emissão a pular + multiplicadores das épocas no período.
function speedAndEmissionKeys(startKey, endKey) {
  const platform = findPlatform(form.platformId);
  const out = { skipEmissions: form.skipEmissions.slice(), skipKeys: [], dayBoost: {}, pauseKeys: [] };
  if (!platform || !startKey || !endKey || startKey > endKey) return out;
  out.pauseKeys = offCycleKeys(platform, startKey, endKey, todayKey()); // (11c)
  out.skipKeys = emissionKeysInRange(platform, startKey, endKey, form.skipEmissions);
  out.dayBoost = dayBoostsFor(getSpeedConfig(), platform.id, startKey, endKey);
  return out;
}

// (11a) Peso normal da plataforma (×1 sem configuração).
function speedBase() {
  return form.platformId ? getPlatformSpeed(getSpeedConfig(), form.platformId).base : 1;
}

// (5b) Dias proibidos (rotinas "Não apostar") e dias da rotina seguida.
function routineKeysFor(startKey, endKey) {
  const platform = findPlatform(form.platformId);
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  const out = { excludeKeys: [], onlyKeys: [], followRoutineId: null };
  if (!platform || !startKey || !endKey || startKey > endKey) return out;
  out.excludeKeys = forbiddenBetDays(routines, platform, startKey, endKey);
  if (form.followRoutineId) {
    const r = routines.find(x => x.id === form.followRoutineId && (x.platformIds || []).includes(platform.id));
    if (r) {
      out.followRoutineId = r.id;
      out.onlyKeys = routineBetDays(r, platform, startKey, endKey);
    } else {
      form.followRoutineId = null;
    }
  }
  return out;
}

function currentGoal() {
  const v = parseMoneyInput(form.goal.valueText);
  if (form.goal.mode === 'none' || !Number.isFinite(v) || v <= 0) return { mode: 'none', value: 0, baseBalance: 0 };
  return { mode: form.goal.mode, value: v, baseBalance: form.goal.mode === 'percent' ? form.goal.baseBalance : 0 };
}

// Preenche o formulário a partir de parâmetros salvos.
function applyParamsToForm(params) {
  const p = sanitizeParams(params);
  form.target = fmtMoneyInput(p.target);
  form.startKey = p.startKey;
  form.endKey = p.endKey;
  form.weekdaysOff = p.weekdaysOff.slice();
  form.curve = p.curve;
  form.intensity = p.intensity;
  form.rhythm = p.rhythm;
  form.seed = p.seed;
  form.floorMode = p.floor > 0 ? 'manual' : 'none';
  form.floor = p.floor > 0 ? fmtMoneyInput(p.floor) : '';
  form.cap = p.cap ? fmtMoneyInput(p.cap) : '';
  form.stakes = p.stakes.slice();
  form.buy = { enabled: p.buy.enabled, multiplier: p.buy.multiplier || 100 };
  form.followRoutineId = p.followRoutineId || null;
  form.skipEmissions = (p.skipEmissions || []).slice();
  form.goal = {
    mode: p.goal.mode,
    valueText: p.goal.mode === 'percent' ? String(p.goal.value).replace('.', ',') : fmtMoneyInput(p.goal.value),
    baseBalance: p.goal.baseBalance || 0
  };
}

// ---------- esqueleto ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="planLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="planRetryBtn" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>

    <div id="planMain" class="plan-grid app-hidden">
      <section id="planCash" class="card-shell graficos-section plan-cash" aria-label="Caixa do período"></section>
      <section id="planCycles" class="card-shell graficos-section plan-cash" aria-label="Ciclos"></section>
      <section class="card-shell graficos-section plan-controls" aria-label="Controles do plano">
        <div class="section-heading" style="padding:0 0 0.9rem;">
          <div>
            <h2>Modulador de Apostas</h2>
            <p>Distribua o Rollover em dias altos e baixos. A prévia muda enquanto você ajusta.</p>
          </div>
        </div>

        <div class="plan-field">
          <label for="planPlatform">Plataforma</label>
          <select id="planPlatform" class="plan-input"></select>
          <p id="planPlatformInfo" class="plan-hint"></p>
          <p id="planCycleInfo" class="plan-hint"></p>
        </div>

        <div class="plan-field">
          <label for="planTarget">Meta (R$)</label>
          <div class="plan-row">
            <input type="text" id="planTarget" class="plan-input" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.500,00" />
            <button type="button" id="planUseRollover" class="bet-manage-btn plan-btn-inline">Usar Rollover</button>
          </div>
          <button type="button" id="planUseProjected" class="bet-manage-btn app-hidden">Usar projetado</button>
          <p id="planRolloverHint" class="plan-hint"></p>
        </div>

        <div class="plan-field">
          <span class="plan-label">Período</span>
          <div class="plan-row">
            <input type="date" id="planStart" class="plan-input" aria-label="Início" />
            <span class="plan-sep">até</span>
            <input type="date" id="planEnd" class="plan-input" aria-label="Fim" />
          </div>
          <div id="planQuickSpan" class="plan-chips" role="group" aria-label="Duração rápida"></div>
        </div>

        <div class="plan-field">
          <span class="plan-label">Dias de aposta <small>(toque pra marcar folga)</small></span>
          <div id="planWeekdays" class="plan-chips" role="group" aria-label="Dias da semana"></div>
        </div>

        <div class="plan-field">
          <label for="planFollow">Seguir rotina <small>opcional</small></label>
          <select id="planFollow" class="plan-input"></select>
          <p id="planFollowHint" class="plan-hint"></p>
        </div>

        <div class="plan-field">
          <span class="plan-label">Não apostar nos dias de emissão do Misterioso <small>dia do ciclo</small></span>
          <div id="planSkipEm" class="plan-chips" role="group" aria-label="Dias de emissão a pular"></div>
          <p id="planSkipHint" class="plan-hint"></p>
        </div>

        <div class="plan-field">
          <span class="plan-label">⚡ Velocidade</span>
          <div class="plan-row">
            <span id="planSpeedInfo" class="plan-hint plan-speed-info"></span>
            <button type="button" id="planSpeedEdit" class="bet-manage-btn plan-btn-inline">Editar</button>
          </div>
        </div>

        <div class="plan-field">
          <span class="plan-label">Curva</span>
          <div id="planCurves" class="plan-chips" role="group" aria-label="Curva"></div>
        </div>

        <div class="plan-field">
          <label for="planIntensity" class="plan-label">Intensidade <strong id="planIntensityVal"></strong></label>
          <input type="range" id="planIntensity" min="1" max="10" step="1" class="plan-range" />
        </div>

        <div class="plan-field" id="planRhythmWrap">
          <label for="planRhythm" class="plan-label">Ritmo <strong id="planRhythmVal"></strong></label>
          <input type="range" id="planRhythm" min="2" max="10" step="1" class="plan-range" />
        </div>

        <div class="plan-field app-hidden" id="planSeedWrap">
          <span class="plan-label">Semente do Caos <strong id="planSeedVal"></strong></span>
          <button type="button" id="planReseed" class="bet-manage-btn">🎲 Sortear outro</button>
        </div>

        <div class="plan-field">
          <span class="plan-label">Piso diário</span>
          <div id="planFloorModes" class="plan-chips" role="group" aria-label="Piso diário"></div>
          <input type="text" id="planFloor" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" placeholder="Ex.: 12,00" aria-label="Piso diário manual" />
          <p id="planFloorHint" class="plan-hint"></p>
        </div>

        <div class="plan-field">
          <label for="planCap">Teto diário (R$) <small>opcional</small></label>
          <input type="text" id="planCap" class="plan-input" inputmode="decimal" autocomplete="off" placeholder="Sem teto" />
        </div>

        <div class="plan-field">
          <span class="plan-label">Valores de aposta permitidos</span>
          <div id="planStakes" class="plan-chips" role="group" aria-label="Valores de aposta"></div>
          <details class="plan-palette">
            <summary>Editar paleta</summary>
            <label for="planPaletteStakes">Valores (separe com ponto e vírgula)</label>
            <input type="text" id="planPaletteStakes" class="plan-input" autocomplete="off" />
            <label for="planPaletteMult">Multiplicadores da compra de bônus</label>
            <input type="text" id="planPaletteMult" class="plan-input" autocomplete="off" />
            <button type="button" id="planPaletteSave" class="btn-confirm">Salvar paleta</button>
          </details>
        </div>

        <div class="plan-field">
          <label class="plan-toggle"><input type="checkbox" id="planBuy" /> Compra de bônus nos dias altos</label>
          <div id="planBuyMult" class="plan-chips app-hidden" role="group" aria-label="Multiplicador"></div>
        </div>

        <div class="plan-field">
          <span class="plan-label">Meta de ganho <small>opcional — só referência</small></span>
          <div id="planGoalModes" class="plan-chips" role="group" aria-label="Meta de ganho"></div>
          <input type="text" id="planGoalValue" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" aria-label="Valor da meta de ganho" />
          <p id="planGoalHint" class="plan-hint"></p>
        </div>
      </section>

      <section class="card-shell graficos-section plan-preview" aria-label="Prévia do plano">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div>
            <h2>Prévia</h2>
            <p id="planStatusLine" class="plan-hint"></p>
          </div>
        </div>
        <div class="plan-radar">
          <div id="planCaution"></div>
          <div id="planAdherence"></div>
          <div id="planGoalCard"></div>
        </div>
        <div id="planKpis" class="plan-kpis"></div>
        <p id="planError" class="graficos-note graficos-note-warn app-hidden"></p>
        <div id="planWarnings"></div>
        <div id="planChartWrap" class="chart-wrap plan-chart"><canvas id="planChart"></canvas></div>
        <div id="planDays" class="plan-days"></div>
        <div class="plan-actions">
          <button type="button" id="planSave" class="btn-confirm">💾 Salvar plano</button>
          <button type="button" id="planRecalc" class="bet-manage-btn app-hidden">↻ Recalcular a partir de amanhã</button>
          <button type="button" id="planDelete" class="btn-remove-modal app-hidden">Excluir plano</button>
        </div>
      </section>
    </div>
  `;
}

// ---------- carga ----------

function renderLoadState() {
  const note = $('planLoadNote');
  const retry = $('planRetryBtn');
  const main = $('planMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando planos e paleta…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar os planos e a paleta. Pra não salvar nada em cima do que não foi lido, o Planejador fica bloqueado. Verifique a internet e tente de novo.';
  if (loadStatus === 'ok' && getInvalidPlanCount() > 0) msg = `${getInvalidPlanCount()} plano(s) com dados inválidos no banco foram ignorados.`;
  if (loadStatus === 'ok' && routinesFailed) {
    msg = (msg ? `${msg} ` : '') + '⚠ Rotinas não carregadas: os dias proibidos NÃO estão sendo pulados.';
  }
  if (loadStatus === 'ok' && !contextConfirmed) {
    msg = (msg ? `${msg} ` : '') + '⚠ Configurações de Obrigado/Misterioso não carregadas: "Usar Rollover" fica desligado e a linha do Rollover não aparece.';
  }
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error' || (loadStatus === 'ok' && !!msg));
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  if (!force && isPlannerLoaded(uid)) {
    loadStatus = 'ok';
  } else {
    loadStatus = 'loading';
    renderLoadState();
    try {
      await loadPlannerData(uid);
      if (token !== loadToken || !mounted) return;
      loadStatus = 'ok';
    } catch (err) {
      if (token !== loadToken || !mounted) return;
      console.error('Planejador: falha ao carregar planos/paleta:', err);
      loadStatus = 'error';
      renderLoadState();
      return;
    }
  }
  // (5b) Rotinas: tolerante — sem elas, aviso explícito (dias proibidos
  // não seriam pulados).
  if (!isRoutinesLoaded(uid)) {
    try {
      const t = todayKey();
      await loadRoutineData(uid, addDaysKey(t, -ROUTINE_HISTORY_DAYS), t);
      routinesFailed = false;
    } catch (err) {
      console.warn('Planejador: rotinas não carregadas — dias proibidos não serão pulados.', err);
      routinesFailed = true;
    }
    if (token !== loadToken || !mounted) return;
  } else {
    routinesFailed = false;
  }
  // (8b) Histórico do planejado: tolerante (só o card de aderência usa).
  if (!isPlanLogLoaded(uid)) {
    try {
      const t = todayKey();
      await loadPlanLogs(uid, addDaysKey(t, -30), t);
    } catch (err) {
      console.warn('Planejador: histórico do planejado não carregado — aderência usa o plano salvo.', err);
    }
    if (token !== loadToken || !mounted) return;
  }
  // Tabelas de Aposta Necessária: tolerante (só a projeção de VIP depende).
  if (!isWagerRequirementsLoaded(uid)) {
    try {
      await loadWagerRequirements(uid);
    } catch (err) {
      console.warn('Planejador: tabelas de Aposta Necessária não carregadas — projeção de VIP escondida.', err);
    }
    if (token !== loadToken || !mounted) return;
  }
  renderLoadState();
  initControls();
}

// ---------- controles ----------

function chip(label, active, onClick, extraClass = '') {
  const b = el('button', `plan-chip${active ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}`, label);
  b.type = 'button';
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.addEventListener('click', onClick);
  return b;
}

function fillPlatformSelect() {
  const select = $('planPlatform');
  if (!select) return;
  const saved = new Set(getSavedPlanIds());
  select.replaceChildren();
  const ph = el('option', '', 'Escolha a plataforma…');
  ph.value = '';
  select.appendChild(ph);
  sortedPlatforms().forEach(p => {
    const o = el('option', '', saved.has(p.id) ? `${p.name} • plano salvo` : p.name);
    o.value = p.id;
    select.appendChild(o);
  });
  if (form.platformId && !findPlatform(form.platformId)) form.platformId = null;
  select.value = form.platformId || '';
}

function renderChips() {
  // Duração rápida
  const quick = $('planQuickSpan');
  if (quick) {
    quick.replaceChildren();
    [7, 14, 21, 30].forEach(n => quick.appendChild(chip(`${n} dias`, false, () => {
      form.endKey = addDaysKey(form.startKey, n - 1);
      syncInputs();
      schedulePreview(0);
    })));
  }
  // Dias da semana (ativo = dia de aposta)
  const wd = $('planWeekdays');
  if (wd) {
    wd.replaceChildren();
    WEEK_ORDER.forEach(d => {
      const isOff = form.weekdaysOff.includes(d);
      wd.appendChild(chip(WEEKDAY_LABELS[d], !isOff, () => {
        form.weekdaysOff = isOff ? form.weekdaysOff.filter(x => x !== d) : [...form.weekdaysOff, d];
        renderChips();
        schedulePreview(0);
      }));
    });
  }
  // (11a) Dias de emissão a pular
  const skip = $('planSkipEm');
  if (skip) {
    skip.replaceChildren();
    EMISSION_CYCLE_DAYS.forEach(d => {
      const on = form.skipEmissions.includes(d);
      skip.appendChild(chip(`Dia ${d}`, on, () => {
        form.skipEmissions = on ? form.skipEmissions.filter(x => x !== d) : [...form.skipEmissions, d].sort((a, b) => a - b);
        renderChips();
        syncInputs();
        schedulePreview(0);
      }));
    });
  }
  // Curvas
  const curves = $('planCurves');
  if (curves) {
    curves.replaceChildren();
    CURVES.forEach(c => curves.appendChild(chip(c.label, form.curve === c.id, () => {
      form.curve = c.id;
      renderChips();
      syncInputs();
      schedulePreview(0);
    })));
  }
  // Piso
  const floors = $('planFloorModes');
  if (floors) {
    floors.replaceChildren();
    [['auto', 'Mínimo do nível'], ['manual', 'Valor'], ['none', 'Sem piso']].forEach(([id, label]) => {
      floors.appendChild(chip(label, form.floorMode === id, () => {
        form.floorMode = id;
        renderChips();
        syncInputs();
        schedulePreview(0);
      }));
    });
  }
  // Valores de aposta
  const stakesBox = $('planStakes');
  const palette = getPalette();
  if (stakesBox) {
    stakesBox.replaceChildren();
    const selected = Array.isArray(form.stakes) && form.stakes.length ? form.stakes : palette.stakes;
    palette.stakes.forEach(s => {
      const on = selected.includes(s);
      stakesBox.appendChild(chip(fmtStake(s), on, () => {
        const base = Array.isArray(form.stakes) && form.stakes.length ? form.stakes.slice() : palette.stakes.slice();
        const next = on ? base.filter(x => x !== s) : [...base, s];
        if (next.length === 0) return; // pelo menos 1 valor
        form.stakes = next.sort((a, b) => a - b);
        renderChips();
        schedulePreview(0);
      }, 'plan-chip-money'));
    });
    stakesBox.appendChild(chip('Todos', false, () => {
      form.stakes = null;
      renderChips();
      schedulePreview(0);
    }, 'plan-chip-ghost'));
  }
  // (5b) Meta de ganho
  const goalModes = $('planGoalModes');
  if (goalModes) {
    goalModes.replaceChildren();
    [['none', 'Sem meta'], ['value', 'Valor (R$)'], ['percent', '% do saldo']].forEach(([id, label]) => {
      goalModes.appendChild(chip(label, form.goal.mode === id, () => {
        if (id === 'percent') {
          if (!world || world.balance === null || !(world.balance > 0)) {
            showAppAlert('"% do saldo" precisa do Saldo da plataforma (escolha a plataforma; as configurações de bônus precisam estar carregadas e o Saldo maior que zero).');
            return;
          }
          if (form.goal.mode !== 'percent') form.goal.baseBalance = Math.round(world.balance * 100) / 100;
        }
        if (id !== form.goal.mode) form.goal.valueText = '';
        form.goal.mode = id;
        renderChips();
        syncInputs();
        schedulePreview(0);
      }));
    });
  }
  // Multiplicadores
  const mult = $('planBuyMult');
  if (mult) {
    mult.replaceChildren();
    mult.classList.toggle('app-hidden', !form.buy.enabled);
    const list = palette.buyMultipliers;
    if (!list.includes(form.buy.multiplier)) form.buy.multiplier = list[list.length - 1] || 100;
    list.forEach(m => mult.appendChild(chip(`${m}×`, form.buy.multiplier === m, () => {
      form.buy.multiplier = m;
      renderChips();
      schedulePreview(0);
    })));
  }
}

function syncInputs() {
  const set = (id, v) => { const e = $(id); if (e && e.value !== v) e.value = v; };
  set('planTarget', form.target);
  set('planStart', form.startKey || '');
  set('planEnd', form.endKey || '');
  set('planFloor', form.floor);
  set('planCap', form.cap);
  const start = $('planStart');
  const end = $('planEnd');
  const minKey = todayKey();
  if (start) start.min = minKey;
  if (end) {
    end.min = form.startKey || minKey;
    end.max = form.startKey ? addDaysKey(form.startKey, PLAN_MAX_DAYS - 1) : '';
  }

  const intensity = $('planIntensity');
  if (intensity) intensity.value = String(form.intensity);
  const iv = $('planIntensityVal');
  if (iv) iv.textContent = `1 : ${form.intensity}`;
  const rhythm = $('planRhythm');
  if (rhythm) rhythm.value = String(form.rhythm);
  const rv = $('planRhythmVal');
  if (rv) rv.textContent = form.curve === 'pulso' ? `pico a cada ${form.rhythm} dias` : `ciclo de ${form.rhythm} dias`;
  const curve = CURVES.find(c => c.id === form.curve);
  const rw = $('planRhythmWrap');
  if (rw) rw.classList.toggle('app-hidden', !(curve && curve.usesRhythm));
  const sw = $('planSeedWrap');
  if (sw) sw.classList.toggle('app-hidden', !(curve && curve.usesSeed));
  const sv = $('planSeedVal');
  if (sv) sv.textContent = `#${form.seed}`;

  const floorInput = $('planFloor');
  if (floorInput) floorInput.classList.toggle('app-hidden', form.floorMode !== 'manual');
  const floorHint = $('planFloorHint');
  if (floorHint) {
    let txt = '';
    if (form.floorMode === 'auto') {
      if (!world) txt = 'Escolha a plataforma.';
      else if (world.group === 'com' && world.minimum > 0) txt = `${formatCurrency(world.minimum)} por dia — libera o Bônus Diário do V${world.levelNow} (grupo COM).`;
      else if (world.group === 'sem') txt = 'Grupo SEM: o Bônus Diário não depende de aposta — sem piso.';
      else txt = 'Este nível não tem mínimo de aposta — sem piso.';
    }
    floorHint.textContent = txt;
  }

  const buy = $('planBuy');
  if (buy) buy.checked = form.buy.enabled;

  // (5b) Meta de ganho
  const goalInput = $('planGoalValue');
  if (goalInput) {
    goalInput.classList.toggle('app-hidden', form.goal.mode === 'none');
    goalInput.placeholder = form.goal.mode === 'percent' ? 'Ex.: 5' : 'Ex.: 25,00';
    if (document.activeElement !== goalInput && goalInput.value !== form.goal.valueText) goalInput.value = form.goal.valueText;
  }
  const goalHint = $('planGoalHint');
  if (goalHint) {
    const g = currentGoal();
    let txt = '';
    if (form.goal.mode === 'percent') {
      txt = g.mode === 'percent'
        ? `${String(g.value).replace('.', ',')}% de ${formatCurrency(form.goal.baseBalance)} (Saldo quando a meta foi definida) = ${formatCurrency(Math.round(form.goal.baseBalance * g.value) / 100)}`
        : `Base: Saldo de ${formatCurrency(form.goal.baseBalance)} (congelado ao escolher %).`;
    } else if (form.goal.mode === 'value') {
      txt = 'Medida pelo Resultado (R.B.) das apostas lançadas desde o 1º dia do plano.';
    }
    goalHint.textContent = txt;
  }

  // (5b) Seguir rotina
  fillFollowSelect();

  // (11a) Dias de emissão e velocidade
  const skipHint = $('planSkipHint');
  const platformNow = findPlatform(form.platformId);
  if (skipHint) {
    let txt = '';
    if (!platformNow) txt = 'Escolha a plataforma.';
    else if (platformNow.cycleEnded) txt = 'Ciclo encerrado (🏁 Fim) — sem emissões previstas.';
    else if (form.skipEmissions.length) {
      const keys = emissionKeysInRange(platformNow, form.startKey, form.endKey, form.skipEmissions);
      txt = keys.length ? `Sem aposta em: ${keys.map(fmtShort).join(', ')}.` : 'Nenhum desses dias cai no período.';
      if (platformNow.lastResetDate) txt += ' (Ciclo com Reinício: só as emissões do ciclo atual.)';
    } else txt = 'Toque nos dias do ciclo em que o plano não deve apostar.';
    skipHint.textContent = txt;
  }
  const speedInfo = $('planSpeedInfo');
  const speedBtn = $('planSpeedEdit');
  if (speedInfo) {
    if (!platformNow) {
      speedInfo.textContent = 'Escolha a plataforma.';
    } else {
      const sp = getPlatformSpeed(getSpeedConfig(), platformNow.id);
      const t = todayKey();
      const active = sp.epochs.filter(e => e.from <= t && t <= e.to);
      const future = sp.epochs.filter(e => e.from > t);
      const parts = [`Peso ${formatMult(sp.base)}`];
      if (active.length) parts.push(`época agora: ${active.map(e => `${e.label || 'sem nome'} ${formatMult(e.mult)} até ${fmtShort(e.to)}`).join(', ')}`);
      if (future.length) parts.push(`${future.length} época(s) futura(s)`);
      speedInfo.textContent = parts.join(' · ');
    }
  }
  if (speedBtn) speedBtn.disabled = !platformNow;

  const palette = getPalette();
  const ps = $('planPaletteStakes');
  if (ps && document.activeElement !== ps) ps.value = palette.stakes.map(fmtStake).join('; ');
  const pm = $('planPaletteMult');
  if (pm && document.activeElement !== pm) pm.value = palette.buyMultipliers.join('; ');
}

function fillFollowSelect() {
  const select = $('planFollow');
  const hint = $('planFollowHint');
  if (!select) return;
  const routines = isRoutinesLoaded(state.currentUid) ? betRoutinesFor(getRoutines(), form.platformId) : [];
  select.replaceChildren();
  const none = el('option', '', 'Não seguir — usar o período');
  none.value = '';
  select.appendChild(none);
  routines.forEach(r => {
    const o = el('option', '', `${r.emoji || ''} ${r.name}`.trim());
    o.value = r.id;
    select.appendChild(o);
  });
  if (form.followRoutineId && !routines.some(r => r.id === form.followRoutineId)) form.followRoutineId = null;
  select.value = form.followRoutineId || '';
  select.disabled = routines.length === 0;
  if (hint) {
    if (routinesFailed) hint.textContent = 'Rotinas não carregadas.';
    else if (!form.platformId) hint.textContent = '';
    else if (routines.length === 0) hint.textContent = 'Nenhuma rotina de aposta inclui esta plataforma.';
    else if (form.followRoutineId) {
      const keys = routineKeysFor(form.startKey, form.endKey).onlyKeys;
      hint.textContent = `${keys.length} dia(s) da rotina no período — o plano usa só esses dias.`;
    } else hint.textContent = 'Opcional: usa só os dias de uma rotina de aposta.';
  }
}

// (11b) 💼 Caixa do período.
function renderCash() {
  const box = $('planCash');
  if (!box) return;
  box.replaceChildren();
  const now = new Date();
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  let strategy = null;
  if (contextConfirmed) {
    try {
      strategy = buildMisteriosoStrategy(state.platforms, resolveCtx, getStrategySettings(), now, getStrategyPriority(now));
    } catch (err) {
      console.error('Caixa: falha no Misterioso:', err);
      strategy = null;
    }
  }
  const betLimit = getStrategySettings().betDepositMonthlyLimit;
  const c = computeCash({ platforms: state.platforms, routines, strategy, betLimitReais: betLimit, newConfig: getNewPlatformsConfig(), period: cashPeriod, now });
  const money = (cents) => formatCurrency(fromCents(cents));

  const head = el('div', 'section-heading');
  head.style.padding = '0 0 0.6rem';
  const ht = el('div');
  ht.appendChild(el('h2', '', '💼 Caixa do período'));
  ht.appendChild(el('p', '', `O que precisa ter na conta de hoje até ${fmtShort(c.toKey)}. Só previsão — nada é lançado.`));
  head.appendChild(ht);
  box.appendChild(head);

  const chips = el('div', 'plan-chips cash-periods');
  CASH_PERIODS.forEach(p => chips.appendChild(chip(p.label, cashPeriod === p.id, () => { cashPeriod = p.id; renderCash(); })));
  box.appendChild(chips);

  const list = el('div', 'cash-list');
  const row = (icon, label, valueC, note, extra = null, cls = '') => {
    const r = el('div', `cash-row${cls ? ` ${cls}` : ''}`);
    const top = el('div', 'cash-row-top');
    top.appendChild(el('span', 'cash-row-label', `${icon} ${label}`));
    top.appendChild(el('span', 'cash-row-value', money(valueC)));
    r.appendChild(top);
    if (note) r.appendChild(el('span', 'cash-row-note', note));
    if (extra) r.appendChild(extra);
    list.appendChild(r);
  };

  // 🗓️ semanal
  let weeklyExtra = null;
  if (c.weekly.rows.length || c.weekly.missing.length || c.weekly.paused.length) {
    weeklyExtra = el('details', 'cash-details');
    weeklyExtra.appendChild(el('summary', '', `${c.weekly.rows.length} plataforma(s)${c.weekly.missing.length ? ` · ⚠ ${c.weekly.missing.length} sem rotina` : ''}`));
    c.weekly.rows.forEach(w => weeklyExtra.appendChild(el('span', 'cash-sub', `${w.name} · ${w.count}× · próximo ${fmtShort(w.next)} · ${money(w.valueC)}`)));
    if (c.weekly.missing.length) weeklyExtra.appendChild(el('span', 'cash-sub cash-warn', `Sem rotina 🗓️ (não entram): ${c.weekly.missing.join(', ')}`));
    if (c.weekly.paused.length) weeklyExtra.appendChild(el('span', 'cash-sub', `⏸ Fora do ciclo — com aposta (sem aposta continua, pelo VIP semanal): ${c.weekly.paused.map(x => `${x.name}${x.returnKey ? ` (volta ~${fmtShort(x.returnKey)})` : ' (sem previsão)'}`).join(', ')}`));
  }
  row('🗓️', 'Ativação semanal necessária', c.weekly.totalC,
    routinesFailed ? 'Rotinas não carregadas.' : (c.weekly.unknown ? `${c.weekly.unknown} depósito(s) de rotina sem valor mínimo ficaram fora.` : 'Rotinas "Depositar" do tipo 🗓️.'),
    weeklyExtra);

  // ⬆️ a mais
  row('⬆️', 'A mais — subir níveis do Misterioso', c.extra.totalC,
    contextConfirmed ? c.extra.note : 'Configurações do Misterioso não carregadas.');

  // 🎲 depósito de aposta (editável — mesmo campo da aba Misterioso)
  const betEdit = el('div', 'plan-row cash-bet-edit');
  const betIn = el('input', 'plan-input');
  betIn.type = 'text';
  betIn.inputMode = 'decimal';
  betIn.placeholder = 'Limite mensal';
  betIn.value = betLimit > 0 ? fmtMoneyInput(betLimit) : '';
  betIn.setAttribute('aria-label', 'Limite mensal do depósito de aposta');
  const betSave = el('button', 'bet-manage-btn plan-btn-inline', 'Salvar');
  betSave.type = 'button';
  betSave.addEventListener('click', async () => {
    const v = betIn.value.trim() === '' ? 0 : parseMoneyInput(betIn.value);
    if (!Number.isFinite(v) || v < 0) { await showAppAlert('Valor inválido.'); return; }
    betSave.disabled = true;
    const r = await saveStrategySettings(state.currentUid, { betDepositMonthlyLimit: v });
    betSave.disabled = false;
    if (!r.ok) { await showAppAlert(r.error); return; }
    if (mounted) renderCash();
  });
  betEdit.appendChild(betIn);
  betEdit.appendChild(betSave);
  row('🎲', 'Depósito de aposta', c.bet.totalC,
    c.bet.limitC > 0 ? `Limite ${money(c.bet.limitC)}/mês · já usado ${money(c.bet.usedC)} este mês` : 'Sem limite definido — informe o valor mensal.',
    betEdit);

  // 🆕 novas plataformas
  const npBox = el('div', 'cash-np');
  if (c.newPlatforms.enabled) {
    const acts = c.newPlatforms.events.filter(e => e.kind === 'activation');
    const maints = c.newPlatforms.events.filter(e => e.kind === 'maintenance');
    if (acts.length) npBox.appendChild(el('span', 'cash-sub', `Ativações: ${acts.map(e => `${e.label} ${fmtShort(e.key)} (${e.level ? `${e.level}º · ` : ''}${money(e.valueC)})`).join(' · ')}`));
    if (maints.length) npBox.appendChild(el('span', 'cash-sub', `Manutenção: ${maints.length}× · ${money(maints.reduce((s2, e) => s2 + e.valueC, 0))}`));
  }
  const npBtn = el('button', 'bet-manage-btn cash-np-btn', '🆕 Nova plataforma');
  npBtn.type = 'button';
  npBtn.addEventListener('click', async () => {
    npBtn.disabled = true;
    try {
      const r = await openNewPlatformEditor();
      if (r.status === 'saved' && mounted) renderCash();
    } finally {
      npBtn.disabled = false;
    }
  });
  npBox.appendChild(npBtn);
  row('🆕', 'Novas plataformas', c.newPlatforms.totalC,
    c.newPlatforms.enabled ? 'Reserva separada (ainda não cadastradas).' : 'Desligado — toque em "Nova plataforma" pra planejar.',
    npBox);

  box.appendChild(list);
  const total = el('div', 'cash-total');
  total.appendChild(el('span', '', 'Total que precisa ter na conta'));
  total.appendChild(el('strong', '', money(c.totalC)));
  box.appendChild(total);
}

// (11c) 🚫 Não depositar agora.
function renderCycles() {
  const box = $('planCycles');
  if (!box) return;
  box.replaceChildren();
  const t = todayKey();
  const ended = [];
  const unstableNow = [];
  const noCycle = [];
  sortedPlatforms().forEach(p => {
    const st = cycleState(p);
    if (st === 'no') { noCycle.push(p.name); return; }
    const pred = predictCycle(p, t);
    if (p.cycleEnded) ended.push({ p, pred });
    else if (st === 'unstable' && nearMonthTurn(t)) unstableNow.push(p.name);
  });
  const head = el('div', 'section-heading');
  head.style.padding = '0 0 0.6rem';
  const ht = el('div');
  ht.appendChild(el('h2', '', '🚫 Não depositar agora'));
  ht.appendChild(el('p', '', 'Fora do ciclo do Misterioso o Planejador não planeja aposta nem depósito.'));
  head.appendChild(ht);
  box.appendChild(head);
  const list = el('div', 'cash-list');
  if (!ended.length && !unstableNow.length) list.appendChild(el('p', 'plan-hint', 'Nenhuma plataforma fora do ciclo agora.'));
  ended.forEach(({ p, pred }) => {
    const r = el('div', 'cash-row cycle-row-ended');
    r.appendChild(el('span', 'cash-row-label', `⏸ ${p.name}`));
    r.appendChild(el('span', 'cash-row-note', describePrediction(pred, fmtShort)));
    list.appendChild(r);
  });
  if (unstableNow.length) {
    const r = el('div', 'cash-row cycle-row-unstable');
    r.appendChild(el('span', 'cash-row-label', '⚠️ Instáveis — virada do mês'));
    r.appendChild(el('span', 'cash-row-note', unstableNow.join(', ')));
    list.appendChild(r);
  }
  if (noCycle.length) list.appendChild(el('p', 'plan-hint', `🚫 Sem ciclo do Misterioso (operam normal, fora do Misterioso): ${noCycle.join(', ')}`));
  box.appendChild(list);
  const actions = el('div', 'plan-actions cycle-actions');
  const rb = el('button', 'bet-manage-btn', '🔁 Reconstruir ciclos pelas fotos diárias');
  rb.type = 'button';
  rb.addEventListener('click', async () => {
    rb.disabled = true;
    try {
      const r = await openCycleRebuildAll();
      if (r.changed && mounted) { renderCycles(); syncInputs(); schedulePreview(0); }
    } finally {
      rb.disabled = false;
    }
  });
  actions.appendChild(rb);
  box.appendChild(actions);
}

// (5b) Card da Semana de cautela — redesenhado só na troca de plataforma,
// na volta pra aba e ao salvar o limite (não a cada ajuste, pra não apagar
// o que está sendo digitado no limite).
// (8b) Aderência dos últimos 14 dias fechados.
function renderAdherence() {
  const box = $('planAdherence');
  if (!box) return;
  box.replaceChildren();
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  const a = computeAdherence(platform, {
    todayKey: todayKey(),
    getPlanLog: isPlanLogLoaded(state.currentUid) ? getPlanLogEntry : null,
    plans: new Map(getSavedPlans().map(p => [p.platformId, p])),
    thresholdPct: getCalendarSettings().partialThreshold
  }, 14);
  if (!a.days.length) return;
  const card = el('div', `plan-radar-card${a.rate !== null && a.rate >= 0.8 ? ' plan-radar-goal-ok' : ''}`);
  const head = el('div', 'plan-radar-head');
  head.appendChild(el('strong', '', '📅 Aderência ao plano (14 dias)'));
  head.appendChild(el('span', 'plan-radar-value', `${Math.round((a.rate || 0) * 100)}%`));
  card.appendChild(head);
  const icon = { done: '✅', partial: '🟡', miss: '❌' };
  card.appendChild(el('p', 'plan-hint', `✅ ${a.done} · 🟡 ${a.partial} · ❌ ${a.miss} · real ${formatCurrency(a.realC / 100)} de ${formatCurrency(a.plannedC / 100)} (${a.deviationC >= 0 ? '+' : ''}${formatCurrency(a.deviationC / 100)})`));
  card.appendChild(el('p', 'plan-hint plan-adherence-strip', a.days.map(d => icon[d.status]).join('')));
  box.appendChild(card);
}

function renderCaution() {
  renderAdherence();
  const box = $('planCaution');
  if (!box) return;
  box.replaceChildren();
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  const { cautionThreshold } = getPlannerSettings();
  const st = getCautionStatus(platform, cautionThreshold, new Date());

  const card = el('div', `plan-radar-card${st.status === 'caution' ? ' plan-radar-caution' : ''}`);
  const head = el('div', 'plan-radar-head');
  if (st.status === 'caution') head.appendChild(el('strong', '', '🛡️ Semana de cautela'));
  else if (st.status === 'ok') head.appendChild(el('strong', '', '✓ Semana normal'));
  else head.appendChild(el('strong', '', '… Semana passada sem fechamento'));
  card.appendChild(head);

  if (st.status !== 'unknown') {
    card.appendChild(el('p', 'plan-hint', `Lucro real (R.B. + Bônus) da semana de ${st.weekStart.split('-').reverse().slice(0, 2).join('/')}: ${formatCurrency(st.lucro)} · limite ${formatCurrency(cautionThreshold)}${st.pending ? ' · bônus ainda a confirmar' : ''}`));
  }

  const own = computeCautionStats([platform], cautionThreshold);
  const all = computeCautionStats(state.platforms, cautionThreshold);
  const pct = r => (r === null ? '—' : `${Math.round(r * 100)}%`);
  const statText = all.triggers === 0
    ? 'Seu histórico ainda não tem semana acima do limite seguida de outra semana fechada.'
    : `Seu histórico (todas as plataformas): depois de semanas acima do limite, a seguinte foi negativa em ${all.negatives} de ${all.triggers} (${pct(all.rate)}). Em geral, ${pct(all.baseRate)} das semanas são seguidas de semana negativa.` +
      (own.triggers ? ` Nesta plataforma: ${own.negatives} de ${own.triggers} (${pct(own.rate)}).` : '');
  card.appendChild(el('p', 'plan-hint', statText));

  const row = el('div', 'plan-row plan-radar-row');
  if (st.status === 'caution') {
    const apply = el('button', 'btn-confirm', 'Aplicar proteção');
    apply.type = 'button';
    apply.addEventListener('click', () => {
      form.intensity = CAUTION_PRESET.intensity;
      form.curve = CAUTION_PRESET.curve;
      form.buy.enabled = CAUTION_PRESET.buyEnabled;
      renderChips();
      syncInputs();
      schedulePreview(0);
    });
    row.appendChild(apply);
  }
  const lim = el('input', 'plan-input plan-radar-limit');
  lim.type = 'text';
  lim.inputMode = 'decimal';
  lim.value = fmtMoneyInput(cautionThreshold);
  lim.setAttribute('aria-label', 'Limite da semana de cautela');
  const save = el('button', 'bet-manage-btn plan-btn-inline', 'Salvar limite');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const v = parseMoneyInput(lim.value);
    if (!Number.isFinite(v) || v < 0) { await showAppAlert('Limite inválido.'); return; }
    save.disabled = true;
    const result = await savePlannerSettings(state.currentUid, { cautionThreshold: v });
    save.disabled = false;
    if (!result.ok) { await showAppAlert(result.error); return; }
    if (mounted) renderCaution();
  });
  row.appendChild(lim);
  row.appendChild(save);
  card.appendChild(row);
  box.appendChild(card);
}

// (5b) Card da Meta de ganho — acompanha os parâmetros da tela.
function renderGoalCard(platform, params) {
  const box = $('planGoalCard');
  if (!box) return;
  box.replaceChildren();
  if (!platform || !params) return;
  const g = computeGoalProgress(platform, params.startKey, params.goal, new Date());
  if (!g) return;
  const card = el('div', `plan-radar-card${g.reached ? ' plan-radar-goal-ok' : ''}`);
  if (g.invalid) {
    card.appendChild(el('p', 'plan-hint', 'Meta de ganho sem valor válido.'));
    box.appendChild(card);
    return;
  }
  const head = el('div', 'plan-radar-head');
  head.appendChild(el('strong', '', g.reached ? '✅ Meta de ganho batida' : '🎯 Meta de ganho'));
  head.appendChild(el('span', 'plan-radar-value', `${formatCurrency(g.result)} de ${formatCurrency(g.target)}`));
  card.appendChild(head);
  const track = el('div', 'wager-progress-track');
  const fill = el('div', 'wager-progress-fill');
  fill.style.width = `${Math.round(g.progress * 100)}%`;
  track.appendChild(fill);
  card.appendChild(track);
  let note;
  if (!g.started) note = `Começa a contar em ${fmtDay(params.startKey)}.`;
  else if (g.reached) note = 'Pode parar. O que não for apostado continua no Rollover — use "Recalcular a partir de amanhã" pra redistribuir nos próximos dias.';
  else note = `Resultado (R.B.) desde ${fmtDay(params.startKey)}. Faltam ${formatCurrency(Math.max(0, g.target - g.result))}.`;
  card.appendChild(el('p', 'plan-hint', note));
  box.appendChild(card);
}

function renderPlatformInfo() {
  const cyc = $('planCycleInfo');
  if (cyc) {
    const pl = findPlatform(form.platformId);
    cyc.textContent = pl ? `🔄 ${describePrediction(predictCycle(pl, todayKey()), fmtShort)}` : '';
  }
  const info = $('planPlatformInfo');
  const hint = $('planRolloverHint');
  const useBtn = $('planUseRollover');
  const platform = findPlatform(form.platformId);
  if (info) {
    if (!platform) info.textContent = '';
    else {
      const saved = getSavedPlan(platform.id);
      const lv = world && world.levelNow !== null ? `V${world.levelNow}` : 'sem nível';
      const gr = world && world.group ? world.group.toUpperCase() : 'sem grupo';
      // (11b) Sem rotina 🗓️ = fora do Caixa.
      const noWeekly = isRoutinesLoaded(state.currentUid) && !weeklyRoutinePlatformIds(getRoutines()).has(platform.id);
      info.textContent = `${lv} · grupo ${gr} · apostado ${formatCurrency(world ? world.wagerTotalNow : 0)}` +
        (saved ? ` · plano salvo em ${fmtFull(saved.updatedAt)}` : '') +
        (noWeekly ? ' · ⚠ sem rotina 🗓️ de ativação semanal — fora do Caixa' : '');
    }
  }
  if (hint && useBtn) {
    if (!platform) {
      hint.textContent = '';
      useBtn.disabled = true;
    } else if (!contextConfirmed || !world || world.rolloverC === null) {
      hint.textContent = 'Rollover indisponível (configurações de bônus não carregadas).';
      useBtn.disabled = true;
    } else {
      const sb = speedBase();
      hint.textContent = `Rollover atual: ${formatCurrency(fromCents(world.rolloverC))}${sb !== 1 ? ` · peso ${formatMult(sb)} → sugestão ${formatCurrency(fromCents(Math.round(world.rolloverC * sb)))}` : ''}`;
      useBtn.disabled = world.rolloverC <= 0;
    }
  }
  renderProjectedHint();
}

// (7b) "Rollover previsto até o fim do período" + botão "Usar projetado".
function renderProjectedHint() {
  const hint = $('planRolloverHint');
  const btn = $('planUseProjected');
  const platform = findPlatform(form.platformId);
  if (!btn) return;
  const inf = platform ? computeInflows(platform, form.endKey) : null;
  const total = inf ? inf.items.reduce((s, x) => s + x.valueC, 0) : 0;
  btn.classList.toggle('app-hidden', !(inf && total > 0));
  if (!inf || total <= 0 || !hint || !world || world.rolloverC === null) return;
  const parts = [];
  if (inf.routineC) parts.push(`rotinas ${formatCurrency(fromCents(inf.routineC))}`);
  if (inf.suggestionC) parts.push(`depósito sugerido do Misterioso ${formatCurrency(fromCents(inf.suggestionC))}`);
  if (inf.misteriosoC) parts.push(`bônus Misterioso ${formatCurrency(fromCents(inf.misteriosoC))}`);
  const projected = world.rolloverC + total;
  const sb = speedBase();
  hint.textContent = `Rollover atual: ${formatCurrency(fromCents(world.rolloverC))} · previsto até ${fmtShort(form.endKey)}: ${formatCurrency(fromCents(projected))} (+${parts.join(' + ')})${sb !== 1 ? ` · peso ${formatMult(sb)}` : ''}`;
  btn.textContent = `Usar projetado (${formatCurrency(fromCents(Math.round(projected * sb)))})`;
}

function selectPlatform(id) {
  form.platformId = id || null;
  const platform = findPlatform(form.platformId);
  world = computeWorld(platform);
  showAllDays = false;
  const saved = platform ? getSavedPlan(platform.id) : null;
  form.followRoutineId = null;
  form.skipEmissions = [];
  if (saved) {
    applyParamsToForm(saved.params);
  } else if (platform && world && world.rolloverC !== null && world.rolloverC > 0 && !parseMoneyInput(form.target)) {
    form.target = fmtMoneyInput(fromCents(Math.round(world.rolloverC * speedBase())));
  }
  renderChips();
  syncInputs();
  renderPlatformInfo();
  renderCaution();
  schedulePreview(0);
}

let controlsBound = false;

function initControls() {
  if (!form.startKey) {
    form.startKey = addDaysKey(todayKey(), 1); // decisão: começa amanhã
    form.endKey = addDaysKey(form.startKey, 13);
    form.seed = newSeed();
  }
  fillPlatformSelect();
  world = computeWorld(findPlatform(form.platformId));
  renderCash();
  renderCycles();
  renderChips();
  syncInputs();
  renderPlatformInfo();
  renderCaution();
  if (!controlsBound) bindControls();
  schedulePreview(0);
}

function bindControls() {
  controlsBound = true;
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };

  on('planPlatform', 'change', (e) => selectPlatform(e.target.value));
  on('planTarget', 'input', (e) => { form.target = e.target.value; schedulePreview(); });
  on('planUseRollover', 'click', () => {
    if (!world || world.rolloverC === null) return;
    form.target = fmtMoneyInput(fromCents(Math.round(world.rolloverC * speedBase())));
    syncInputs();
    schedulePreview(0);
  });
  on('planUseProjected', 'click', () => {
    const platform = findPlatform(form.platformId);
    if (!platform || !world || world.rolloverC === null) return;
    const inf = computeInflows(platform, form.endKey);
    const total = Math.round((world.rolloverC + inf.items.reduce((s, x) => s + x.valueC, 0)) * speedBase());
    if (total <= 0) return;
    form.target = fmtMoneyInput(fromCents(total));
    syncInputs();
    schedulePreview(0);
  });
  on('planStart', 'change', (e) => {
    const v = e.target.value;
    if (!v) return;
    const span = form.endKey && form.startKey ? Math.max(0, Math.round((dayKeyToDate(form.endKey) - dayKeyToDate(form.startKey)) / 86400000)) : 13;
    form.startKey = v;
    if (!form.endKey || form.endKey < v) form.endKey = addDaysKey(v, Math.min(span, PLAN_MAX_DAYS - 1));
    syncInputs();
    schedulePreview(0);
  });
  on('planEnd', 'change', (e) => { if (e.target.value) { form.endKey = e.target.value; syncInputs(); schedulePreview(0); } });
  on('planIntensity', 'input', (e) => { form.intensity = Number(e.target.value); syncInputs(); schedulePreview(); });
  on('planRhythm', 'input', (e) => { form.rhythm = Number(e.target.value); syncInputs(); schedulePreview(); });
  on('planReseed', 'click', () => { form.seed = newSeed(); syncInputs(); schedulePreview(0); });
  on('planFloor', 'input', (e) => { form.floor = e.target.value; schedulePreview(); });
  on('planCap', 'input', (e) => { form.cap = e.target.value; schedulePreview(); });
  on('planBuy', 'change', (e) => { form.buy.enabled = e.target.checked; renderChips(); schedulePreview(0); });
  on('planFollow', 'change', (e) => { form.followRoutineId = e.target.value || null; syncInputs(); schedulePreview(0); });
  on('planGoalValue', 'input', (e) => { form.goal.valueText = e.target.value; syncInputs(); schedulePreview(); });
  on('planPaletteSave', 'click', (e) => onSavePalette(e.target));
  // (11a) Velocidade
  on('planSpeedEdit', 'click', async (e) => {
    const platform = findPlatform(form.platformId);
    if (!platform || busy) return;
    e.target.disabled = true;
    try {
      const r = await openSpeedEditor({ platform });
      if (r.status === 'saved' && mounted) {
        world = computeWorld(findPlatform(form.platformId)); // prioridade do Misterioso mudou
        renderCash();
  renderCycles();
        syncInputs();
        renderPlatformInfo();
        schedulePreview(0);
      }
    } finally {
      if (mounted) e.target.disabled = !findPlatform(form.platformId);
    }
  });
  on('planSave', 'click', (e) => onSavePlan(e.target));
  on('planDelete', 'click', (e) => onDeletePlan(e.target));
  on('planRecalc', 'click', () => onRecalc());
}

// ---------- prévia ----------

function schedulePreview(delay = PREVIEW_DEBOUNCE_MS) {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    renderPreview();
  }, delay);
}

function kpi(label, value, note, extra = '') {
  const c = el('div', `summary-card plan-kpi${extra ? ` ${extra}` : ''}`);
  c.appendChild(el('span', 'summary-label', label));
  c.appendChild(el('span', 'summary-value', value));
  if (note) c.appendChild(el('span', 'summary-note', note));
  return c;
}

function describeLines(lines) {
  return lines.map(l => (l.kind === 'buy'
    ? `1 compra ${l.multiplier}× R$ ${fmtStake(fromCents(l.stakeC))}`
    : `${l.count} × R$ ${fmtStake(fromCents(l.stakeC))}`)).join(' + ');
}

function renderActions(plan) {
  const platform = findPlatform(form.platformId);
  const saved = platform ? getSavedPlan(platform.id) : null;
  const saveBtn = $('planSave');
  const delBtn = $('planDelete');
  const recalcBtn = $('planRecalc');
  const status = $('planStatusLine');
  const dirty = saved ? !sameParams(saved.params, currentParams()) : true;
  if (saveBtn) {
    saveBtn.disabled = busy || !platform || !plan || !plan.ok || (saved && !dirty);
    saveBtn.textContent = saved ? '💾 Salvar alterações' : '💾 Salvar plano';
  }
  if (delBtn) delBtn.classList.toggle('app-hidden', !saved);
  if (recalcBtn) recalcBtn.classList.toggle('app-hidden', !saved);
  if (status) {
    if (!platform) status.textContent = 'Escolha uma plataforma pra começar.';
    else if (!saved) status.textContent = 'Plano novo — ainda não salvo.';
    else status.textContent = dirty ? '● Alterações não salvas.' : `✓ Igual ao plano salvo em ${fmtFull(saved.updatedAt)}.`;
  }
}

function renderPreview() {
  if (!mounted || !rootEl || loadStatus !== 'ok') return;
  renderPlatformInfo(); // (7b) o Rollover previsto depende do fim do período
  const errEl = $('planError');
  const kpis = $('planKpis');
  const warnBox = $('planWarnings');
  const daysBox = $('planDays');
  const chartWrap = $('planChartWrap');
  const platform = findPlatform(form.platformId);

  const showError = (msg) => {
    if (errEl) { errEl.textContent = msg; errEl.classList.toggle('app-hidden', !msg); }
  };

  if (!platform) {
    lastPlan = null;
    renderGoalCard(null, null);
    showError('');
    if (kpis) kpis.replaceChildren();
    if (warnBox) warnBox.replaceChildren();
    if (daysBox) daysBox.replaceChildren();
    if (chartWrap) chartWrap.classList.add('app-hidden');
    renderActions(null);
    return;
  }

  const params = currentParams();
  // Plano salvo e SEM alterações pode já ter começado (início no passado) —
  // aí não aplica a trava "não começa no passado", senão um plano em
  // andamento nem apareceria. Qualquer alteração volta a exigir.
  const savedPlan = getSavedPlan(platform.id);
  const unchangedSaved = !!savedPlan && sameParams(savedPlan.params, params);
  const plan = buildPlan(params, unchangedSaved ? null : todayKey());
  lastPlan = plan.ok ? { params, plan } : null;
  renderGoalCard(platform, params);

  if (!plan.ok) {
    showError(plan.error);
    if (kpis) kpis.replaceChildren();
    if (warnBox) warnBox.replaceChildren();
    if (daysBox) daysBox.replaceChildren();
    if (chartWrap) chartWrap.classList.add('app-hidden');
    renderActions(plan);
    return;
  }
  showError('');

  const inflow = computeInflows(platform, plan.days[plan.days.length - 1].key);
  const proj = computePlanProjections(plan.days, {
    startRolloverC: world ? world.rolloverC : null,
    inflows: inflow.items,
    wagerTotalNow: world ? world.wagerTotalNow : null,
    thresholds: world ? world.thresholds : null,
    levelNow: world ? world.levelNow : null,
    group: world ? world.group : null,
    betMinimumByLevel: BET_MINIMUM_BY_LEVEL,
    dailyBonusAt: world ? world.dailyBonusAt : null
  });

  // Indicadores
  if (kpis) {
    kpis.replaceChildren();
    const t = plan.totals;
    kpis.appendChild(kpi('Planejado', formatCurrency(fromCents(t.plannedC)), `meta ${formatCurrency(fromCents(t.targetC))}`, 'plan-kpi-main'));
    kpis.appendChild(kpi('Sobra', formatCurrency(fromCents(t.excessC)), 'acima da meta'));
    kpis.appendChild(kpi('Dias de aposta', String(t.activeDays), `${fmtShort(plan.days[0].key)} a ${fmtShort(plan.days[plan.days.length - 1].key)}`));
    kpis.appendChild(kpi('Maior / menor dia', `${formatCurrency(fromCents(t.maxDayC))}`, `menor ${formatCurrency(fromCents(t.minDayC))}`));
    kpis.appendChild(kpi('Giros', String(t.spins), t.buys ? `+ ${t.buys} compra(s) de bônus` : ''));
    if (proj.inflowInPlanC > 0) kpis.appendChild(kpi('Entradas previstas', formatCurrency(fromCents(proj.inflowInPlanC)), 'rotinas + Misterioso, somadas ao Rollover'));
    if (proj.rolloverZeroKey) kpis.appendChild(kpi('Rollover zerado', fmtDay(proj.rolloverZeroKey), 'se o plano for cumprido'));
    else if (world && world.rolloverC !== null) kpis.appendChild(kpi('Rollover ao fim', formatCurrency(fromCents(proj.rollover[proj.rollover.length - 1] || 0)), 'ainda restante'));
    proj.vipReach.forEach(r => kpis.appendChild(kpi(`V${r.level} atingido`, fmtDay(r.key), 'pelo total apostado', 'plan-kpi-vip')));
    if (proj.bonusMode === 'com') {
      kpis.appendChild(kpi('Bônus Diário', `${proj.unlockDays} dia(s)`, `${formatCurrency(proj.unlockBonus)} garantidos (mín. ${formatCurrency(fromCents(proj.minimumC))})`, 'plan-kpi-bonus'));
    } else if (proj.bonusMode === 'sem') {
      kpis.appendChild(kpi('Bônus Diário', 'Independe', 'grupo SEM'));
    }
  }

  // Avisos
  if (warnBox) {
    warnBox.replaceChildren();
    const notes = [...plan.warnings];
    if (unchangedSaved && plan.days[0].key <= todayKey()) {
      notes.push(`Plano em andamento desde ${fmtDay(plan.days[0].key)}. A linha do Rollover parte do valor de hoje — use "Recalcular a partir de amanhã" pra replanejar os dias que faltam.`);
    }
    if (proj.bonusMode === 'com') notes.push('Bônus Diário calculado com o nível de hoje — uma promoção durante o plano muda o mínimo a partir dela.');
    if (!world || !world.thresholds) notes.push('Projeção de nível VIP indisponível (tabelas de Aposta Necessária não carregadas).');
    if (inflow.unknown > 0) notes.push(`${inflow.unknown} depósito(s) de rotina sem valor mínimo definido ficaram fora do Rollover previsto.`);
    if (inflow.pick) notes.push(`A linha do Rollover conta o depósito sugerido pelo Misterioso hoje (${formatCurrency(fromCents(inflow.pick.needC))}) — se você não fizer, ela fica acima do real.`);
    notes.forEach(n => warnBox.appendChild(el('p', 'graficos-note', n)));
  }

  // Gráfico
  if (chartWrap) chartWrap.classList.remove('app-hidden');
  renderChart(plan, proj);

  // Dias
  if (daysBox) {
    daysBox.replaceChildren();
    const vipByDay = new Map(proj.vipReach.map(r => [r.key, r.level]));
    const list = showAllDays ? plan.days : plan.days.slice(0, DAYS_COLLAPSED);
    list.forEach(d => {
      const row = el('div', `plan-day plan-day-${d.tier}`);
      const head = el('div', 'plan-day-head');
      head.appendChild(el('span', 'plan-day-date', fmtDay(d.key)));
      head.appendChild(el('span', `plan-tier plan-tier-${d.tier}`, TIER_LABEL[d.tier]));
      if (vipByDay.has(d.key)) head.appendChild(el('span', 'plan-tier plan-tier-vip', `V${vipByDay.get(d.key)}`));
      head.appendChild(el('span', 'plan-day-amount', formatCurrency(fromCents(d.plannedC))));
      row.appendChild(head);
      row.appendChild(el('div', 'plan-day-lines', describeLines(d.lines)));
      daysBox.appendChild(row);
    });
    if (plan.days.length > DAYS_COLLAPSED) {
      const more = el('button', 'bet-manage-btn plan-more', showAllDays ? 'Mostrar menos' : `Ver todos os ${plan.days.length} dias`);
      more.type = 'button';
      more.addEventListener('click', () => { showAllDays = !showAllDays; renderPreview(); });
      daysBox.appendChild(more);
    }
  }

  renderActions(plan);
}

function renderChart(plan, proj) {
  const canvas = $('planChart');
  if (!canvas || !window.Chart) return;
  const labels = plan.days.map(d => fmtShort(d.key));
  const bars = plan.days.map(d => fromCents(d.plannedC));
  const colors = plan.days.map(d => TIER_COLOR[d.tier]);
  const vipKeys = new Set(proj.vipReach.map(r => r.key));
  const borders = plan.days.map(d => (vipKeys.has(d.key) ? '#f59e0b' : 'rgba(0,0,0,0)'));
  const borderWidths = plan.days.map(d => (vipKeys.has(d.key) ? 3 : 0));
  const hasRollover = proj.rollover.length === plan.days.length;
  const line = hasRollover ? proj.rollover.map(fromCents) : [];

  const datasets = [{
    type: 'bar',
    label: 'Aposta do dia',
    data: bars,
    backgroundColor: colors,
    borderColor: borders,
    borderWidth: borderWidths,
    borderRadius: 4,
    yAxisID: 'y',
    order: 2
  }];
  if (hasRollover) {
    datasets.push({
      type: 'line',
      label: proj.inflowInPlanC > 0 ? 'Rollover previsto' : 'Rollover restante',
      data: line,
      borderColor: '#f59e0b',
      backgroundColor: '#f59e0b',
      pointRadius: plan.days.length > 30 ? 0 : 2,
      tension: 0.25,
      yAxisID: 'y1',
      order: 1
    });
  }

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.options.scales.y1.display = hasRollover;
    chart.update('none');
    return;
  }

  chart = new window.Chart(canvas, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}`,
            afterBody: (items) => {
              const d = lastPlan && lastPlan.plan.days[items[0].dataIndex];
              return d ? [TIER_LABEL[d.tier], describeLines(d.lines)] : [];
            }
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: { beginAtZero: true, position: 'left' },
        y1: { beginAtZero: true, position: 'right', display: hasRollover, grid: { drawOnChartArea: false } }
      }
    }
  });
}

// ---------- ações (gravam no banco) ----------

async function onSavePlan(btn) {
  if (busy || !lastPlan) return;
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  const { params, plan } = lastPlan;
  const saved = getSavedPlan(platform.id);
  const summary = `${plan.totals.activeDays} dia(s), ${formatCurrency(fromCents(plan.totals.plannedC))} (${fmtShort(plan.days[0].key)} a ${fmtShort(plan.days[plan.days.length - 1].key)})`;
  const ok = await showAppConfirm(saved
    ? `${platform.name} já tem um plano salvo (${fmtFull(saved.updatedAt)}). Substituir pelo novo? ${summary}. O anterior deixa de existir.`
    : `Salvar o plano de ${platform.name}? ${summary}.`);
  if (!ok || !mounted) return;

  busy = true;
  btn.disabled = true;
  try {
    const target = findPlatform(form.platformId);
    if (!target) { await showAppAlert('Plataforma não encontrada. Nada foi salvo.'); return; }
    const result = await savePlan(state.currentUid, planToDoc(target, params, plan, new Date().toISOString()));
    if (!result.ok) { await showAppAlert(result.error); return; }
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderPlatformInfo();
      renderActions(lastPlan ? lastPlan.plan : null);
    }
  }
}

async function onDeletePlan(btn) {
  if (busy) return;
  const platform = findPlatform(form.platformId);
  const saved = platform ? getSavedPlan(platform.id) : null;
  if (!saved) return;
  const ok = await showAppConfirm(`Excluir o plano salvo de ${platform.name}? A prévia continua na tela, mas o plano deixa de existir no banco.`);
  if (!ok || !mounted) return;
  busy = true;
  btn.disabled = true;
  try {
    const result = await deletePlan(state.currentUid, platform.id);
    if (!result.ok) await showAppAlert(result.error);
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderPlatformInfo();
      renderActions(lastPlan ? lastPlan.plan : null);
    }
  }
}

// Mantém curva/limites/valores e refaz a partir de amanhã com o Rollover de agora.
function onRecalc() {
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  world = computeWorld(platform);
  const span = Math.max(0, Math.round((dayKeyToDate(form.endKey) - dayKeyToDate(form.startKey)) / 86400000));
  const tomorrow = addDaysKey(todayKey(), 1);
  form.startKey = tomorrow;
  if (form.endKey < tomorrow) form.endKey = addDaysKey(tomorrow, Math.min(span, PLAN_MAX_DAYS - 1));
  if (world && world.rolloverC !== null) form.target = fmtMoneyInput(fromCents(Math.round(world.rolloverC * speedBase())));
  syncInputs();
  renderPlatformInfo();
  schedulePreview(0);
}

async function onSavePalette(btn) {
  if (busy) return;
  const stakesRaw = ($('planPaletteStakes') || {}).value || '';
  const multRaw = ($('planPaletteMult') || {}).value || '';
  const stakes = stakesRaw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(parseMoneyInput);
  const bad = stakes.findIndex(v => !Number.isFinite(v) || v <= 0);
  if (bad !== -1 || stakes.length === 0) {
    await showAppAlert('Valores inválidos. Use ponto e vírgula entre eles — ex.: 0,40; 0,50; 1; 10');
    return;
  }
  const mult = multRaw.split(/[;\s]+/).map(s => s.replace(/x$/i, '').trim()).filter(Boolean).map(Number);
  if (mult.some(m => !Number.isInteger(m) || m < 2 || m > 1000)) {
    await showAppAlert('Multiplicadores inválidos. Use números inteiros entre 2 e 1000 — ex.: 50; 75; 100');
    return;
  }
  busy = true;
  btn.disabled = true;
  try {
    const result = await savePalette(state.currentUid, stakes, mult);
    if (!result.ok) { await showAppAlert(result.error); return; }
    const palette = getPalette();
    if (Array.isArray(form.stakes)) {
      form.stakes = form.stakes.filter(s => palette.stakes.includes(s));
      if (form.stakes.length === 0) form.stakes = null;
    }
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      renderChips();
      syncInputs();
      schedulePreview(0);
    }
  }
}

// ---------- API pública (view-graficos.js) ----------

// Chamar só com window.Chart já carregado e com o painel VISÍVEL.
export function mountPlanejador(root, options = {}) {
  if (!root) return;
  unmountPlanejador();
  rootEl = root;
  mounted = true;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  renderSkeleton();
  renderLoadState();
  const retry = $('planRetryBtn');
  if (retry) retry.addEventListener('click', () => loadData(true));
  loadData(false);
}

// Virada do dia / volta pra aba: recalcula o mundo (Rollover etc.) e a prévia.
export function refreshPlanejador() {
  if (!mounted || loadStatus !== 'ok') return;
  world = computeWorld(findPlatform(form.platformId));
  renderCash();
  renderCycles();
  syncInputs();
  renderPlatformInfo();
  renderCaution();
  schedulePreview(0);
}

export function resizePlanejador() {
  if (chart) chart.resize();
}

export function unmountPlanejador() {
  loadToken++;
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (chart) { chart.destroy(); chart = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  controlsBound = false;
  lastPlan = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
