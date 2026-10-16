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
//
// === (Sub-entrega 19) ===
// a) SEMPRE ASSIM / INTERCALAR (abaixo dos dias da semana): Intercalar =
//    1 dia por semana, revezando entre os dias marcados (plan-logic.js).
//    A curva continua variando os valores nos dois modos.
// b) PLANO DE GRUPO: o seletor ganha "👥 Grupos" (rotinas com 2+
//    plataformas). Mesmos controles pra todas; por plataforma, sozinho:
//    meta = Rollover × peso (⚡), dias proibidos/emissão/fora do ciclo,
//    épocas. Escala: o pico (Onda/Pulso), o sorteio (Caos) e o revezamento
//    (Intercalar) de cada plataforma começam em pontos diferentes. Piso do
//    grupo: valor único ou sem piso. Rotina de aposta: "Seguir os dias da
//    rotina" (ligado por padrão). Prévia: total somado por dia + lista das
//    plataformas (toque pra ver os dias). Salvar/Excluir = UM lote
//    (plan-store.js saveGroupPlans/deleteGroupPlans) — 1 plano por
//    plataforma, marcado com o grupo (Calendário/Aderência leem igual).
// c) Editar SOZINHA uma plataforma que está num plano de grupo: aviso —
//    salvar tira ela do grupo.
// d) Trocar de plataforma/grupo com alterações não salvas pergunta antes.
//
// === (Sub-entrega 20) ===
// a) 🔒 GUARDAR ROLLOVER (plan-logic.js applyReserve): Não guardar · Tudo ·
//    R$ · %. Tudo = a meta cobre só os depósitos de ATIVAÇÃO previstos no
//    período (rotinas 🗓️/🎁). A meta é recalculada quando você mexe na
//    opção, em "Usar Rollover/projetado" e em "Recalcular". No GRUPO, cada
//    plataforma tem a sua (toque na linha dela) e o grupo mostra o total
//    "🔒 Guardado pra jogar depois".
// b) ↻ Recalcular grupo a partir de amanhã (metas com o Rollover de agora).
// c) GRUPO — "Base da meta": Rollover ou Projetado (Rollover + entradas
//    previstas de cada plataforma: rotinas de depósito e bônus do
//    Misterioso das próximas emissões), sempre × peso e depois o Guardar.
//    Gráfico do grupo: barras EMPILHADAS por plataforma (dá pra ver a
//    escala/ritmo de cada uma), linha do Rollover previsto do grupo e o dia
//    mais alto destacado; cada linha da lista mostra o pico da plataforma.
//
// === (Sub-entrega 24) ===
// a) ABAS: o seletor (plataforma/grupo) e o 🔄 ficam fixos no topo; os
//    controles se dividem em 💼 Caixa (caixa do período, ciclos, meta,
//    🔒 guardar, base do grupo, ⚡ velocidade, meta de ganho), 🚫 Restrições
//    (período, dias, seguir rotina, emissões, piso/teto, valores, compra) e
//    🕹️ Modulador (curva, intensidade, ritmo, semente). A Prévia fica
//    sempre embaixo. Cada aba mostra quantos ajustes estão ligados, ● com
//    alteração não salva e 🔴 quando o erro da prévia vem de um campo dela.
// b) 🔄 ATUALIZAR PLANOS: refaz TODOS os planos salvos (individuais e de
//    grupo) a partir de amanhã com o Rollover de agora — contêiner com
//    antes × depois, 🔒 guardado antes × depois, o que falta apostar hoje
//    (descontado por padrão), caixa de marcar e confirmação. Grava num
//    ÚNICO lote (plan-store savePlansBatch — tudo ou nada); o dia de HOJE
//    de cada plano fica congelado no histórico (plan-store).
// c) META DIGITADA: params.targetMode 'auto' | 'manual' | 'unknown' (plano
//    antigo). Manual/desconhecido vem DESMARCADO e com a escolha "manter a
//    meta (redistribui o que falta)" ou "usar o Rollover".
// d) AVISO ao abrir: "⚠️ Rollover mudou em N planos — 🔄 Atualizar" (só
//    metas automáticas/desconhecidas, diferença ≥ R$ 1,00 e ≥ 3%). Tocar no
//    ⚠️ recolhe a frase (fica só o emoji) e expande de novo.
// e) "↻ Recalcular a partir de amanhã" desconta o que falta apostar hoje
//    (o dia de hoje continua com a meta dele) e, com meta digitada,
//    pergunta se usa o Rollover ou mantém a meta.
// g) (25) TROCA DE TIPO DE PLANO (individual ↔ grupo / outro grupo) e
//    EXCLUIR: se o plano antigo tem dias que já passaram, pergunta (dois
//    botões iguais, "🙈 Ignorar" já selecionado) se esses dias continuam
//    contando. ✕/Esc cancela tudo. Recalcular/Atualizar não perguntam (é o
//    mesmo plano seguindo).
// f) requestPlanejadorFocus(platformId): o Calendário abre a aba já com a
//    plataforma escolhida ("Abrir no Planejador").

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
  addDaysKey, toCents, fromCents, EMISSION_CYCLE_DAYS, emissionKeysInRange,
  WEEK_MODES, buildGroupPlan, RESERVE_MODES, cleanReserve, applyReserve,
  planUpdateDiff, isSignificantChange, plannedAfterC, planDayOf
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
  getStrategyPriority, getSpeedConfig, getNewPlatformsConfig, saveStrategySettings,
  saveGroupPlans, deleteGroupPlans, savePlansBatch
} from './plan-store.js';
import { loadRoutineData, isRoutinesLoaded, getRoutines } from './routine-store.js';
import { forbiddenBetDays, routineBetDays, betRoutinesFor, ROUTINE_HISTORY_DAYS, depositRoutineInflows, isPlanGroup } from './routine-logic.js';
import { buildMisteriosoStrategy, projectMisteriosoInflows } from './strategy-logic.js';
import { computeAdherence, realWageredC } from './calendar-logic.js';
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
let lastGroup = null;        // (19) último resultado de buildGroupPlan na tela
let openGroupRows = new Set(); // (19) plataformas abertas na lista do grupo
let formSnap = null;         // (19) foto do formulário ao escolher/salvar
// (24)
const PLAN_TABS = [
  { id: 'caixa', label: '💼 Caixa' },
  { id: 'restricoes', label: '🚫 Restrições' },
  { id: 'modulador', label: '🕹️ Modulador' }
];
let activeTab = 'caixa';     // aba aberta (sessão — sobrevive à troca de plataforma)
let lastError = '';          // erro da prévia (🔴 na aba do campo)
let alertMin = false;        // aviso "Rollover mudou" recolhido (só o ⚠️)
let alertRows = null;        // planos/grupos com diferença relevante (aviso)
let pendingFocus = null;     // plataforma pedida pelo Calendário
let updateClose = null;      // contêiner 🔄 aberto

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
  skipEmissions: [],
  // (19)
  weekMode: 'all',
  groupId: null,          // rotina do plano de grupo (modo grupo)
  followGroup: true,      // grupo de rotina de aposta: seguir os dias dela
  groupFloorMode: 'none', // 'manual' | 'none'
  groupFloor: '',
  phase: 0,               // escala herdada do plano de grupo (modo plataforma)
  phaseCount: 1,
  groupRef: null,         // { routineId, name } do plano salvo (modo plataforma)
  // (20) 🔒 Guardar rollover
  reserve: { mode: 'none', valueText: '' },
  reservedC: 0,
  groupReserve: {},       // { [platformId]: { mode, valueText } } (modo grupo)
  groupBase: 'rollover',  // 'rollover' | 'projected' (modo grupo)
  // (24)
  targetMode: 'unknown',  // 'auto' | 'manual' | 'unknown' (modo plataforma)
  targetBase: 'rollover', // 'rollover' | 'projected' (modo plataforma)
  todayLeftC: 0,          // ↻ Recalcular: quanto da meta foi descontado (falta hoje)
  groupDeductToday: false // ↻ Recalcular grupo: desconta o que falta hoje
};

function isGroupMode() {
  return !!form.groupId;
}

function snapForm() {
  return JSON.stringify(form);
}

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
    ...speedAndEmissionKeys(form.startKey, form.endKey),
    // (19)
    weekMode: form.weekMode,
    phase: form.phase,
    phaseCount: form.phaseCount,
    group: form.groupRef,
    // (20)
    reserve: reserveFromForm(form.reserve),
    reservedC: form.reservedC,
    // (24)
    targetMode: form.targetMode,
    targetBase: form.targetBase
  };
}

// (20) { mode, valueText } -> { mode, value } limpo.
function reserveFromForm(r) {
  const mode = r && r.mode ? r.mode : 'none';
  const v = mode === 'pct' ? Number(String(r.valueText || '').replace(',', '.')) : parseMoneyInput(r && r.valueText);
  return cleanReserve({ mode, value: Number.isFinite(v) ? v : 0 });
}

function reserveToForm(r) {
  const c = cleanReserve(r);
  return { mode: c.mode, valueText: c.mode === 'value' ? fmtMoneyInput(c.value) : (c.mode === 'pct' ? String(c.value).replace('.', ',') : '') };
}

// (20) Depósitos de ATIVAÇÃO previstos (rotinas 🗓️ semanal / 🎁 mensal)
// da plataforma, de hoje até endKey — centavos.
function activationC(platform, endKey) {
  if (!platform || !endKey || !isRoutinesLoaded(state.currentUid)) return 0;
  const acts = getRoutines().filter(r => r.action === 'deposit' && ['semanal', 'mensal'].includes(r.depositKind));
  if (!acts.length) return 0;
  return depositRoutineInflows(acts, platform, todayKey(), endKey).items.reduce((sum, x) => sum + x.valueC, 0);
}

// (20) Aplica o "Guardar" sobre uma base (Rollover × peso, ou projetado)
// e grava meta + guardado no formulário (modo plataforma).
function setTargetFromBase(baseC, projected = false, deductC = 0) {
  const platform = findPlatform(form.platformId);
  const res = applyReserve(baseC, reserveFromForm(form.reserve), activationC(platform, form.endKey), projected);
  const targetC = Math.max(0, res.targetC - Math.max(0, deductC));
  form.reservedC = res.reservedC;
  form.target = targetC > 0 ? fmtMoneyInput(fromCents(targetC)) : '';
  // (24) meta automática (e de qual base)
  form.targetMode = 'auto';
  form.targetBase = projected ? 'projected' : 'rollover';
  form.todayLeftC = Math.max(0, deductC);
}

function reapplyReserve() {
  if (!world || world.rolloverC === null) return;
  setTargetFromBase(Math.round(world.rolloverC * speedBase()));
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
  form.weekMode = p.weekMode;
  form.phase = p.phase;
  form.phaseCount = p.phaseCount;
  form.groupRef = p.group;
  form.reserve = reserveToForm(p.reserve);
  form.reservedC = p.reservedC || 0;
  form.targetMode = p.targetMode;   // (24)
  form.targetBase = p.targetBase;
  form.todayLeftC = 0;
  form.goal = {
    mode: p.goal.mode,
    valueText: p.goal.mode === 'percent' ? String(p.goal.value).replace('.', ',') : fmtMoneyInput(p.goal.value),
    baseBalance: p.goal.baseBalance || 0
  };
}

// ---------- esqueleto ----------

function renderSkeleton() {
  // (24) Topo fixo (seletor + 🔄 + aviso + abas) · abas · Prévia sempre embaixo.
  // data-ptab = aba do bloco (caixa | restricoes | modulador).
  rootEl.innerHTML = `
    <p id="planLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="planRetryBtn" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>

    <div id="planMain" class="plan-grid app-hidden">
      <section class="card-shell graficos-section plan-top" aria-label="Plano">
        <div class="plan-top-row">
          <div class="plan-field plan-top-select">
            <label for="planPlatform">Plataforma ou grupo</label>
            <select id="planPlatform" class="plan-input"></select>
          </div>
          <button type="button" id="planUpdateAll" class="bet-manage-btn plan-update-btn">🔄 Atualizar planos</button>
        </div>
        <div id="planAlert" class="plan-alert app-hidden" role="status"></div>
        <div class="plan-top-info">
          <p id="planPlatformInfo" class="plan-hint"></p>
          <p id="planCycleInfo" class="plan-hint"></p>
          <p id="planGroupInfo" class="plan-hint app-hidden"></p>
        </div>
        <div id="planTabs" class="plan-tabs" role="tablist" aria-label="Seções do plano"></div>
      </section>

      <section id="planCash" data-ptab="caixa" class="card-shell graficos-section plan-cash" aria-label="Caixa do período"></section>
      <section id="planCycles" data-ptab="caixa" class="card-shell graficos-section plan-cash" aria-label="Ciclos"></section>

      <section class="card-shell graficos-section plan-controls" aria-label="Controles do plano">
        <div class="section-heading plan-tab-heading" data-ptab="caixa">
          <div>
            <h2>💼 Meta do plano</h2>
            <p>Quanto apostar no período — do Rollover, do projetado ou digitado.</p>
          </div>
        </div>
        <div class="section-heading plan-tab-heading" data-ptab="restricoes">
          <div>
            <h2>🚫 Restrições</h2>
            <p>Quando e com quais valores o plano pode apostar.</p>
          </div>
        </div>
        <div class="section-heading plan-tab-heading" data-ptab="modulador">
          <div>
            <h2>🕹️ Modulador de Apostas</h2>
            <p>Distribua a meta em dias altos e baixos. A prévia muda enquanto você ajusta.</p>
          </div>
        </div>

        <div class="plan-field" id="planTargetField" data-ptab="caixa">
          <label for="planTarget">Meta (R$)</label>
          <div class="plan-row">
            <input type="text" id="planTarget" class="plan-input" inputmode="decimal" autocomplete="off" placeholder="Ex.: 1.500,00" />
            <button type="button" id="planUseRollover" class="bet-manage-btn plan-btn-inline">Usar Rollover</button>
          </div>
          <button type="button" id="planUseProjected" class="bet-manage-btn app-hidden">Usar projetado</button>
          <p id="planRolloverHint" class="plan-hint"></p>
          <p id="planTargetModeHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" id="planReserveField" data-ptab="caixa">
          <span class="plan-label">🔒 Guardar rollover <small>pra jogar depois</small></span>
          <div id="planReserveModes" class="plan-chips" role="group" aria-label="Guardar rollover"></div>
          <input type="text" id="planReserveValue" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" aria-label="Quanto guardar" />
          <p id="planReserveHint" class="plan-hint"></p>
        </div>

        <div class="plan-field app-hidden" id="planGroupBaseField" data-ptab="caixa">
          <span class="plan-label">Base da meta <small>de cada plataforma</small></span>
          <div id="planGroupBase" class="plan-chips" role="group" aria-label="Base da meta"></div>
          <p id="planGroupBaseHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" id="planSpeedField" data-ptab="caixa">
          <span class="plan-label">⚡ Velocidade</span>
          <div class="plan-row">
            <span id="planSpeedInfo" class="plan-hint plan-speed-info"></span>
            <button type="button" id="planSpeedEdit" class="bet-manage-btn plan-btn-inline">Editar</button>
          </div>
        </div>

        <div class="plan-field" id="planGoalField" data-ptab="caixa">
          <span class="plan-label">Meta de ganho <small>opcional — só referência</small></span>
          <div id="planGoalModes" class="plan-chips" role="group" aria-label="Meta de ganho"></div>
          <input type="text" id="planGoalValue" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" aria-label="Valor da meta de ganho" />
          <p id="planGoalHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" data-ptab="restricoes">
          <span class="plan-label">Período</span>
          <div class="plan-row">
            <input type="date" id="planStart" class="plan-input" aria-label="Início" />
            <span class="plan-sep">até</span>
            <input type="date" id="planEnd" class="plan-input" aria-label="Fim" />
          </div>
          <div id="planQuickSpan" class="plan-chips" role="group" aria-label="Duração rápida"></div>
        </div>

        <div class="plan-field" data-ptab="restricoes">
          <span class="plan-label">Dias de aposta <small>(toque pra marcar folga)</small></span>
          <div id="planWeekdays" class="plan-chips" role="group" aria-label="Dias da semana"></div>
          <div id="planWeekMode" class="plan-chips plan-weekmode" role="group" aria-label="Como usar os dias"></div>
          <p id="planWeekModeHint" class="plan-hint"></p>
        </div>

        <div class="plan-field app-hidden" id="planGroupFollowField" data-ptab="restricoes">
          <label class="plan-toggle"><input type="checkbox" id="planGroupFollow" /> Seguir os dias desta rotina</label>
          <p id="planGroupFollowHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" id="planFollowField" data-ptab="restricoes">
          <label for="planFollow">Seguir rotina <small>opcional</small></label>
          <select id="planFollow" class="plan-input"></select>
          <p id="planFollowHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" data-ptab="restricoes">
          <span class="plan-label">Não apostar nos dias de emissão do Misterioso <small>dia do ciclo</small></span>
          <div id="planSkipEm" class="plan-chips" role="group" aria-label="Dias de emissão a pular"></div>
          <p id="planSkipHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" data-ptab="restricoes">
          <span class="plan-label">Piso diário</span>
          <div id="planFloorModes" class="plan-chips" role="group" aria-label="Piso diário"></div>
          <input type="text" id="planFloor" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" placeholder="Ex.: 12,00" aria-label="Piso diário manual" />
          <input type="text" id="planGroupFloor" class="plan-input app-hidden" inputmode="decimal" autocomplete="off" placeholder="Ex.: 5,00 (vale pra todas)" aria-label="Piso diário do grupo" />
          <p id="planFloorHint" class="plan-hint"></p>
        </div>

        <div class="plan-field" data-ptab="restricoes">
          <label for="planCap">Teto diário (R$) <small>opcional</small></label>
          <input type="text" id="planCap" class="plan-input" inputmode="decimal" autocomplete="off" placeholder="Sem teto" />
        </div>

        <div class="plan-field" data-ptab="restricoes">
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

        <div class="plan-field" data-ptab="restricoes">
          <label class="plan-toggle"><input type="checkbox" id="planBuy" /> Compra de bônus nos dias altos</label>
          <div id="planBuyMult" class="plan-chips app-hidden" role="group" aria-label="Multiplicador"></div>
        </div>

        <div class="plan-field" data-ptab="modulador">
          <span class="plan-label">Curva</span>
          <div id="planCurves" class="plan-chips" role="group" aria-label="Curva"></div>
        </div>

        <div class="plan-field" data-ptab="modulador">
          <label for="planIntensity" class="plan-label">Intensidade <strong id="planIntensityVal"></strong></label>
          <input type="range" id="planIntensity" min="1" max="10" step="1" class="plan-range" />
        </div>

        <div class="plan-field" id="planRhythmWrap" data-ptab="modulador">
          <label for="planRhythm" class="plan-label">Ritmo <strong id="planRhythmVal"></strong></label>
          <input type="range" id="planRhythm" min="2" max="10" step="1" class="plan-range" />
        </div>

        <div class="plan-field app-hidden" id="planSeedWrap" data-ptab="modulador">
          <span class="plan-label">Semente do Caos <strong id="planSeedVal"></strong></span>
          <button type="button" id="planReseed" class="bet-manage-btn">🎲 Sortear outro</button>
        </div>
      </section>

      <section class="card-shell graficos-section plan-preview" aria-label="Prévia do plano">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div>
            <h2>Prévia</h2>
            <p id="planStatusLine" class="plan-hint"></p>
          </div>
        </div>
        <div class="plan-radar" id="planRadar">
          <div id="planCaution"></div>
          <div id="planAdherence"></div>
          <div id="planGoalCard"></div>
        </div>
        <div id="planKpis" class="plan-kpis"></div>
        <p id="planError" class="graficos-note graficos-note-warn app-hidden"></p>
        <div id="planWarnings"></div>
        <div id="planChartWrap" class="chart-wrap plan-chart"><canvas id="planChart"></canvas></div>
        <div id="planGroupList" class="plan-group-list app-hidden"></div>
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

// ---------- (24) abas ----------

// Campos do formulário de cada aba (● alteração não salva).
const TAB_FORM_KEYS = {
  caixa: ['target', 'reserve', 'goal', 'groupBase', 'groupReserve'],
  restricoes: ['startKey', 'endKey', 'weekdaysOff', 'weekMode', 'followRoutineId', 'followGroup', 'skipEmissions', 'floorMode', 'floor', 'groupFloorMode', 'groupFloor', 'cap', 'stakes', 'buy'],
  modulador: ['curve', 'intensity', 'rhythm', 'seed']
};

// Aba do campo que gerou o erro da prévia (🔴).
function errorTab(msg) {
  const m = String(msg || '').toLowerCase();
  if (!m) return null;
  if (m.includes('curva')) return 'modulador';
  if (m.includes('meta') || m.includes('rollover') || m.includes('guardad')) return 'caixa';
  if (m.includes('período') || m.includes('início') || m.includes('fim') || m.includes('dia') || m.includes('rotina')
    || m.includes('valor') || m.includes('piso') || m.includes('teto')) return 'restricoes';
  return null;
}

// Quantos ajustes estão ligados em cada aba.
function tabCounts() {
  const group = isGroupMode();
  const palette = getPalette();
  let r = 0;
  if (form.weekdaysOff.length) r++;
  if (form.weekMode === 'alternate') r++;
  if (group ? (form.followGroup && currentGroup() && currentGroup().routine.action === 'bet') : !!form.followRoutineId) r++;
  if (form.skipEmissions.length) r++;
  if (group ? form.groupFloorMode === 'manual' : (form.floorMode === 'manual' || (form.floorMode === 'auto' && world && world.minimum > 0))) r++;
  if (parseMoneyInput(form.cap) > 0) r++;
  if (Array.isArray(form.stakes) && form.stakes.length && form.stakes.length < palette.stakes.length) r++;
  if (form.buy.enabled) r++;
  let c = 0;
  if (group) {
    c += Object.keys(form.groupReserve).length ? 1 : 0;
    if (form.groupBase === 'projected') c++;
  } else {
    if (form.reserve.mode !== 'none') c++;
    if (form.goal.mode !== 'none') c++;
    if (form.targetBase === 'projected') c++;
  }
  return { caixa: c, restricoes: r };
}

function dirtyTabs() {
  const out = new Set();
  if (formSnap === null) return out;
  let snap;
  try { snap = JSON.parse(formSnap); } catch (err) { return out; }
  Object.entries(TAB_FORM_KEYS).forEach(([tab, keys]) => {
    if (keys.some(k => JSON.stringify(form[k]) !== JSON.stringify(snap[k]))) out.add(tab);
  });
  return out;
}

function renderTabs() {
  const box = $('planTabs');
  if (!box) return;
  const counts = tabCounts();
  const dirty = (form.platformId || form.groupId) ? dirtyTabs() : new Set();
  const errTab = errorTab(lastError);
  const curve = CURVES.find(c => c.id === form.curve);
  box.replaceChildren();
  PLAN_TABS.forEach(t => {
    const b = el('button', `plan-tab${activeTab === t.id ? ' active' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', activeTab === t.id ? 'true' : 'false');
    b.dataset.tab = t.id;
    b.appendChild(el('span', 'plan-tab-label', t.label));
    let extra = '';
    if (t.id === 'modulador') extra = curve ? curve.label : '';
    else if (counts[t.id]) extra = String(counts[t.id]);
    if (extra) b.appendChild(el('span', 'plan-tab-count', `· ${extra}`));
    if (dirty.has(t.id)) b.appendChild(el('span', 'plan-tab-dot', '●'));
    if (errTab === t.id) b.appendChild(el('span', 'plan-tab-err', '🔴'));
    const tips = [];
    if (dirty.has(t.id)) tips.push('alteração não salva');
    if (errTab === t.id) tips.push('o erro da prévia vem desta aba');
    if (tips.length) b.title = tips.join(' · ');
    b.addEventListener('click', () => { if (activeTab !== t.id) { activeTab = t.id; applyTab(); } });
    box.appendChild(b);
  });
}

function applyTab() {
  if (!rootEl) return;
  rootEl.querySelectorAll('[data-ptab]').forEach(n => n.classList.toggle('plan-tab-off', n.dataset.ptab !== activeTab));
  renderTabs();
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
  const ph = el('option', '', 'Escolha a plataforma ou o grupo…');
  ph.value = '';
  select.appendChild(ph);
  // (19) Grupos: rotinas com 2+ plataformas que existem.
  const groups = planGroups();
  if (groups.length) {
    const og = el('optgroup');
    og.label = '👥 Grupos (rotinas com 2+ plataformas)';
    groups.forEach(g => {
      const savedAll = g.ids.length && g.ids.every(id => { const sp = getSavedPlan(id); return sp && sp.params && sp.params.group && sp.params.group.routineId === g.routine.id; });
      const o = el('option', '', `👥 ${g.routine.emoji ? `${g.routine.emoji} ` : ''}${g.routine.name} (${g.ids.length})${savedAll ? ' • plano salvo' : ''}`);
      o.value = `g:${g.routine.id}`;
      og.appendChild(o);
    });
    select.appendChild(og);
  }
  const op = el('optgroup');
  op.label = 'Plataformas';
  sortedPlatforms().forEach(p => {
    const sp = getSavedPlan(p.id);
    const tag = sp ? (sp.params && sp.params.group ? ` • grupo ${sp.params.group.name || ''}`.trimEnd() : ' • plano salvo') : '';
    const o = el('option', '', `${p.name}${tag}`);
    o.value = p.id;
    op.appendChild(o);
  });
  select.appendChild(op);
  if (form.platformId && !findPlatform(form.platformId)) form.platformId = null;
  if (form.groupId && !groups.some(g => g.routine.id === form.groupId)) form.groupId = null;
  select.value = form.groupId ? `g:${form.groupId}` : (form.platformId || '');
}

// (19) Rotinas que valem como grupo (2+ plataformas existentes), por nome.
function planGroups() {
  if (!isRoutinesLoaded(state.currentUid)) return [];
  const existing = new Set(state.platforms.map(p => p.id));
  return getRoutines()
    .filter(r => isPlanGroup(r, existing))
    .map(r => ({ routine: r, ids: (r.platformIds || []).filter(id => existing.has(id)) }))
    .sort((a, b) => String(a.routine.name).localeCompare(String(b.routine.name), 'pt-BR', { numeric: true }));
}

function currentGroup() {
  return form.groupId ? planGroups().find(g => g.routine.id === form.groupId) || null : null;
}

// Plataformas do grupo em ordem alfabética (a ordem define a escala).
function groupPlatforms(g) {
  const ids = new Set(g ? g.ids : []);
  return sortedPlatforms().filter(p => ids.has(p.id));
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
  // (20) Guardar rollover (modo plataforma)
  const rm = $('planReserveModes');
  if (rm) {
    rm.replaceChildren();
    RESERVE_MODES.forEach(m => rm.appendChild(chip(m.label, form.reserve.mode === m.id, () => {
      if (form.reserve.mode !== m.id) form.reserve = { mode: m.id, valueText: '' };
      reapplyReserve();
      renderChips();
      syncInputs();
      schedulePreview(0);
    })));
  }
  // (20) Base da meta do grupo
  const gb = $('planGroupBase');
  if (gb) {
    gb.replaceChildren();
    [['rollover', 'Rollover'], ['projected', 'Projetado']].forEach(([id, label]) => gb.appendChild(chip(label, form.groupBase === id, () => {
      form.groupBase = id;
      renderChips();
      syncInputs();
      schedulePreview(0);
    })));
  }
  // (19) Sempre assim / Intercalar
  const wm = $('planWeekMode');
  if (wm) {
    wm.replaceChildren();
    WEEK_MODES.forEach(m => wm.appendChild(chip(m.label, form.weekMode === m.id, () => {
      form.weekMode = m.id;
      renderChips();
      syncInputs();
      schedulePreview(0);
    })));
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
    if (isGroupMode()) {
      // (19) Grupo: valor único pra todas ou sem piso.
      [['manual', 'Valor (todas)'], ['none', 'Sem piso']].forEach(([id, label]) => {
        floors.appendChild(chip(label, form.groupFloorMode === id, () => {
          form.groupFloorMode = id;
          renderChips();
          syncInputs();
          schedulePreview(0);
        }));
      });
    } else {
      [['auto', 'Mínimo do nível'], ['manual', 'Valor'], ['none', 'Sem piso']].forEach(([id, label]) => {
        floors.appendChild(chip(label, form.floorMode === id, () => {
          form.floorMode = id;
          renderChips();
          syncInputs();
          schedulePreview(0);
        }));
      });
    }
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

  syncGroupInputs();

  const palette = getPalette();
  const ps = $('planPaletteStakes');
  if (ps && document.activeElement !== ps) ps.value = palette.stakes.map(fmtStake).join('; ');
  const pm = $('planPaletteMult');
  if (pm && document.activeElement !== pm) pm.value = palette.buyMultipliers.join('; ');
}

// (19) Campos do modo grupo / Intercalar.
function syncGroupInputs() {
  const group = isGroupMode();
  const g = currentGroup();
  const hide = (id, h) => { const e = $(id); if (e) e.classList.toggle('app-hidden', h); };
  hide('planTargetField', group);
  hide('planFollowField', group);
  hide('planSpeedField', group);
  hide('planGoalField', group);
  hide('planReserveField', group);
  hide('planGroupBaseField', !group);
  const gbh = $('planGroupBaseHint');
  if (gbh) gbh.textContent = (form.groupBase === 'projected'
    ? 'Projetado: Rollover de hoje + o que ainda vai entrar até o fim do período (depósitos das rotinas e bônus do Misterioso das próximas emissões), × peso ⚡, menos o 🔒 guardado.'
    : 'Rollover de hoje × peso ⚡, menos o 🔒 guardado.')
    + ' O 🔒 de cada plataforma fica na linha dela, na Prévia.'
    + (form.groupDeductToday ? ' ↻ Recalculado: a meta de cada uma desconta o que ainda falta apostar hoje.' : '');
  // (20) Guardar rollover (modo plataforma)
  const rv = $('planReserveValue');
  if (rv) {
    const needs = form.reserve.mode === 'value' || form.reserve.mode === 'pct';
    rv.classList.toggle('app-hidden', !needs);
    rv.placeholder = form.reserve.mode === 'pct' ? 'Ex.: 50 (%)' : 'Ex.: 100,00';
    if (document.activeElement !== rv && rv.value !== form.reserve.valueText) rv.value = form.reserve.valueText;
  }
  const ti = $('planTarget');
  if (ti) ti.disabled = !group && form.reserve.mode !== 'none';
  const rh = $('planReserveHint');
  if (rh) {
    const m = form.reserve.mode;
    let t = 'O plano usa todo o Rollover na meta.';
    if (m !== 'none') {
      const g = formatCurrency(fromCents(form.reservedC));
      t = m === 'all'
        ? `🔒 Rollover inteiro guardado (${g}). A meta cobre só os depósitos de ativação previstos (rotinas 🗓️/🎁) até o fim do período.`
        : `🔒 Guardado ${g} — a meta é o resto do Rollover.`;
      if (!parseMoneyInput(form.target)) t += ' Sem nada a apostar no período.';
    }
    rh.textContent = t;
  }
  // (24) Origem da meta
  const tmh = $('planTargetModeHint');
  if (tmh) {
    let t2 = '';
    if (!group && form.platformId) {
      if (form.targetMode === 'manual') t2 = '✍️ Meta digitada — o 🔄 Atualizar planos pergunta antes de trocar pelo Rollover.';
      else if (form.targetMode === 'auto') t2 = `Meta automática (${form.targetBase === 'projected' ? 'projetado' : 'Rollover'} × peso − 🔒 guardado).`;
      if (form.todayLeftC > 0) t2 += ` Descontou ${formatCurrency(fromCents(form.todayLeftC))} que ainda falta apostar hoje (hoje continua com a meta dele).`;
    }
    tmh.textContent = t2.trim();
  }
  hide('planRadar', group);
  const isBetGroup = !!(g && g.routine.action === 'bet');
  hide('planGroupFollowField', !(group && isBetGroup));
  const gf = $('planGroupFollow');
  if (gf) gf.checked = form.followGroup;
  const gfh = $('planGroupFollowHint');
  if (gfh) gfh.textContent = isBetGroup ? (form.followGroup ? 'O plano usa só os dias em que a rotina vale (pra cada plataforma).' : 'Usa o período e os dias marcados.') : '';
  const info = $('planGroupInfo');
  if (info) {
    info.classList.toggle('app-hidden', !group);
    if (group && g) {
      const plats = groupPlatforms(g);
      info.textContent = `👥 ${plats.length} plataforma(s): ${plats.map(p => p.name).join(', ')}. Meta de cada uma = Rollover × peso (⚡). Escala: cada plataforma começa num ponto diferente da curva.`;
    } else info.textContent = '';
  }
  // Piso do grupo
  const fi = $('planFloor');
  if (fi && group) fi.classList.add('app-hidden');
  const gfi = $('planGroupFloor');
  if (gfi) {
    gfi.classList.toggle('app-hidden', !(group && form.groupFloorMode === 'manual'));
    if (document.activeElement !== gfi && gfi.value !== form.groupFloor) gfi.value = form.groupFloor;
  }
  const fh = $('planFloorHint');
  if (fh && group) fh.textContent = form.groupFloorMode === 'manual' ? 'Mesmo piso diário pra todas as plataformas do grupo.' : 'Sem piso: os dias baixos ficam livres pra curva.';
  const sk = $('planSkipHint');
  if (sk && group) sk.textContent = form.skipEmissions.length ? 'Vale pra cada plataforma do grupo, pelo ciclo de cada uma.' : 'Toque nos dias do ciclo em que o plano não deve apostar (vale pra todas, pelo ciclo de cada uma).';
  // Sempre assim / Intercalar
  const wh = $('planWeekModeHint');
  if (wh) {
    wh.textContent = form.weekMode === 'alternate'
      ? 'Intercalar: 1 dia por semana, revezando entre os dias marcados (o valor da semana fica concentrado nele).'
      : 'Sempre assim: aposta em todos os dias marcados, toda semana — os valores variam pela curva.';
  }
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
        (form.groupRef ? ` · 👥 faz parte do plano do grupo ${form.groupRef.name || ''} — salvar alterações aqui tira ela do grupo` : '') +
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
  // (19) "g:<rotina>" = plano de grupo.
  if (id && String(id).startsWith('g:')) { selectGroup(String(id).slice(2)); return; }
  form.groupId = null;
  form.groupRef = null;
  form.phase = 0;
  form.phaseCount = 1;
  lastGroup = null;
  form.platformId = id || null;
  const platform = findPlatform(form.platformId);
  world = computeWorld(platform);
  showAllDays = false;
  const saved = platform ? getSavedPlan(platform.id) : null;
  form.followRoutineId = null;
  form.skipEmissions = [];
  form.reserve = { mode: 'none', valueText: '' };
  form.reservedC = 0;
  // (24) origem da meta
  form.targetMode = 'unknown';
  form.targetBase = 'rollover';
  form.todayLeftC = 0;
  if (saved) {
    applyParamsToForm(saved.params);
  } else if (platform && world && world.rolloverC !== null && world.rolloverC > 0 && !parseMoneyInput(form.target)) {
    form.target = fmtMoneyInput(fromCents(Math.round(world.rolloverC * speedBase())));
    form.targetMode = 'auto';
  } else if (parseMoneyInput(form.target) > 0) {
    form.targetMode = 'manual';
  }
  renderChips();
  syncInputs();
  renderPlatformInfo();
  renderCaution();
  formSnap = snapForm();
  schedulePreview(0);
}

// (19) Escolhe um GRUPO (rotina com 2+ plataformas).
function selectGroup(routineId) {
  form.groupId = routineId;
  form.platformId = null;
  form.groupRef = null;
  form.groupDeductToday = false; // (24)
  form.phase = 0;
  form.phaseCount = 1;
  form.followRoutineId = null;
  world = null;
  lastPlan = null;
  showAllDays = false;
  openGroupRows = new Set();
  const g = currentGroup();
  if (!g) { form.groupId = null; selectPlatform(''); return; }
  // Plano do grupo já salvo: os parâmetros comuns vêm do 1º membro salvo.
  const saved = g.ids.map(id => getSavedPlan(id)).find(sp => sp && sp.params && sp.params.group && sp.params.group.routineId === routineId);
  if (saved) {
    applyParamsToForm(saved.params);
    form.groupRef = null;
    form.phase = 0;
    form.phaseCount = 1;
    form.followRoutineId = null;
    form.goal = { mode: 'none', valueText: '', baseBalance: 0 };
    const f = Number(saved.params.floor) || 0;
    form.groupFloorMode = f > 0 ? 'manual' : 'none';
    form.groupFloor = f > 0 ? fmtMoneyInput(f) : '';
    form.followGroup = g.routine.action === 'bet' ? saved.params.followRoutineId === routineId : true;
    form.groupBase = saved.params.targetBase === 'projected' ? 'projected' : 'rollover';
  } else {
    form.followGroup = true;
    form.groupBase = 'rollover';
  }
  // (20) Guardar rollover de cada plataforma (do plano salvo dela, se for deste grupo).
  form.groupReserve = {};
  g.ids.forEach(id => {
    const sp = getSavedPlan(id);
    if (sp && sp.params && sp.params.group && sp.params.group.routineId === routineId && sp.params.reserve) {
      const r = reserveToForm(sp.params.reserve);
      if (r.mode !== 'none') form.groupReserve[id] = r;
    }
  });
  renderChips();
  syncInputs();
  renderPlatformInfo();
  renderCaution();
  formSnap = snapForm();
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
  applyTab();       // (24)
  refreshAlert();   // (24)
  schedulePreview(0);
  if (pendingFocus) consumeFocus(); // (24)
}

function bindControls() {
  controlsBound = true;
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };

  on('planPlatform', 'change', async (e) => {
    const v = e.target.value;
    // (19) Alterações não salvas: pergunta antes de trocar.
    if ((form.platformId || form.groupId) && formSnap !== null && snapForm() !== formSnap) {
      const ok = await showAppConfirm('Trocar sem salvar? As alterações feitas neste plano serão descartadas.');
      if (!ok) { e.target.value = form.groupId ? `g:${form.groupId}` : (form.platformId || ''); return; }
    }
    selectPlatform(v);
  });
  on('planGroupFollow', 'change', (e) => { form.followGroup = e.target.checked; syncInputs(); schedulePreview(0); });
  on('planGroupFloor', 'input', (e) => { form.groupFloor = e.target.value; schedulePreview(); });
  on('planReserveValue', 'input', (e) => { form.reserve.valueText = e.target.value; reapplyReserve(); syncInputs(); schedulePreview(); });
  on('planTarget', 'input', (e) => { form.target = e.target.value; form.targetMode = 'manual'; form.targetBase = 'rollover'; form.todayLeftC = 0; syncGroupInputs(); schedulePreview(); }); // (24)
  on('planUseRollover', 'click', () => {
    if (!world || world.rolloverC === null) return;
    setTargetFromBase(Math.round(world.rolloverC * speedBase())); // (20) respeita o Guardar
    syncInputs();
    schedulePreview(0);
  });
  on('planUseProjected', 'click', () => {
    const platform = findPlatform(form.platformId);
    if (!platform || !world || world.rolloverC === null) return;
    const inf = computeInflows(platform, form.endKey);
    const total = Math.round((world.rolloverC + inf.items.reduce((s, x) => s + x.valueC, 0)) * speedBase());
    if (total <= 0) return;
    setTargetFromBase(total, true); // (20) respeita o Guardar
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
  on('planUpdateAll', 'click', () => openUpdatePlans()); // (24)
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

// (24) Erro visível da prévia (🔴 na aba) + abas.
function syncTabState() {
  const err = $('planError');
  lastError = err && !err.classList.contains('app-hidden') ? err.textContent : '';
  renderTabs();
}

function renderActions(plan) {
  if (isGroupMode()) { renderGroupActions(); return; }
  syncTabState();
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
  if (recalcBtn) {
    recalcBtn.classList.toggle('app-hidden', !saved);
    recalcBtn.textContent = '↻ Recalcular a partir de amanhã';
  }
  if (status) {
    if (!platform) status.textContent = 'Escolha uma plataforma pra começar.';
    else if (!saved) status.textContent = 'Plano novo — ainda não salvo.';
    else status.textContent = dirty ? '● Alterações não salvas.' : `✓ Igual ao plano salvo em ${fmtFull(saved.updatedAt)}.`;
  }
}

function renderPreview() {
  if (!mounted || !rootEl || loadStatus !== 'ok') return;
  const glist = $('planGroupList');
  if (isGroupMode()) { renderGroupPreview(); return; }
  if (glist) { glist.classList.add('app-hidden'); glist.replaceChildren(); }
  lastGroup = null;
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

  // (20) O gráfico do grupo é empilhado: ao voltar pro individual, recria.
  if (chart && chart.__group) { chart.destroy(); chart = null; }
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

// ---------- (Sub-entrega 19) PLANO DE GRUPO ----------

function groupBaseParams() {
  const palette = getPalette();
  const stakes = Array.isArray(form.stakes) && form.stakes.length
    ? form.stakes.filter(x => palette.stakes.includes(x))
    : palette.stakes.slice();
  const cap = parseMoneyInput(form.cap);
  const fl = form.groupFloorMode === 'manual' ? parseMoneyInput(form.groupFloor) : 0;
  return {
    startKey: form.startKey,
    endKey: form.endKey,
    weekdaysOff: form.weekdaysOff.slice(),
    weekMode: form.weekMode,
    curve: form.curve,
    intensity: form.intensity,
    rhythm: form.rhythm,
    seed: form.seed,
    floor: Number.isFinite(fl) && fl > 0 ? fl : 0,
    cap: Number.isFinite(cap) && cap > 0 ? cap : null,
    stakes,
    buy: { enabled: form.buy.enabled, multiplier: form.buy.multiplier },
    skipEmissions: form.skipEmissions.slice(),
    targetBase: form.groupBase
  };
}

// (20) O que ainda vai ENTRAR no Rollover da plataforma até endKey:
// depósitos das rotinas + bônus do Misterioso das próximas emissões (mesma
// conta do "Usar projetado" individual, sem o depósito sugerido do
// otimizador — ele escolhe UMA plataforma por vez).
function memberInflows(p, endKey) {
  if (!p || !endKey) return [];
  const t = todayKey();
  if (endKey < t) return [];
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  const items = depositRoutineInflows(routines, p, t, endKey).items.map(x => ({ key: x.key, valueC: x.valueC }));
  let tpl = null;
  if (contextConfirmed) { try { tpl = (resolveCtx(p) || {}).misteriosoTemplate || null; } catch (err) { tpl = null; } }
  if (tpl && !p.cycleEnded) {
    try { return [...items, ...projectMisteriosoInflows(p, tpl, items, endKey, new Date())]; } catch (err) { return items; }
  }
  return items;
}

// Membros com meta (Rollover × peso) e dias bloqueados de CADA plataforma.
// (24) cfg: o formulário (padrão) ou um plano de grupo SALVO (🔄 Atualizar
// planos) — { startKey, endKey, skipEmissions, groupBase, groupReserve,
// followGroup, deductToday, onlyIds }.
function formGroupCfg() {
  return {
    startKey: form.startKey,
    endKey: form.endKey,
    skipEmissions: form.skipEmissions,
    groupBase: form.groupBase,
    groupReserve: form.groupReserve,
    followGroup: form.followGroup,
    deductToday: form.groupDeductToday,
    onlyIds: null
  };
}

function groupMembers(g, cfg = formGroupCfg()) {
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  const speedCfg = getSpeedConfig();
  const t = todayKey();
  const now = new Date();
  const plats = groupPlatforms(g).filter(p => !cfg.onlyIds || cfg.onlyIds.has(p.id));
  return plats.map(p => {
    let rolloverC = null;
    if (contextConfirmed) {
      try { rolloverC = toCents(computeRolloverLive(p, now, resolveCtx(p) || {})); } catch (err) { rolloverC = null; }
    }
    const base = getPlatformSpeed(speedCfg, p.id).base;
    const valid = cfg.startKey && cfg.endKey && cfg.startKey <= cfg.endKey;
    // (20) 🔒 Guardar rollover desta plataforma.
    const reserve = reserveFromForm(cfg.groupReserve[p.id]);
    // (20) Base: Rollover ou Projetado (Rollover + entradas previstas).
    const inflows = valid ? memberInflows(p, cfg.endKey) : [];
    const inflowC = inflows.reduce((sum, x) => sum + x.valueC, 0);
    const baseC = rolloverC === null ? 0 : Math.max(0, Math.round((rolloverC + (cfg.groupBase === 'projected' ? inflowC : 0)) * base));
    const res = rolloverC === null ? { targetC: 0, reservedC: 0 } : applyReserve(baseC, reserve, valid ? activationC(p, cfg.endKey) : 0, cfg.groupBase === 'projected');
    // (24) ↻ / 🔄: desconta o que falta apostar hoje (do plano salvo dela).
    const leftC = cfg.deductToday ? todayLeftC(getSavedPlan(p.id), p, t) : 0;
    const targetC = Math.max(0, res.targetC - leftC);
    const target = fromCents(targetC);
    const m = {
      platformId: p.id,
      name: p.name,
      target,
      rolloverC,
      speed: base,
      reserve,
      reservedC: res.reservedC,
      inflows,
      inflowC,
      todayLeftC: leftC,
      excludeKeys: valid ? forbiddenBetDays(routines, p, cfg.startKey, cfg.endKey) : [],
      skipEmissions: cfg.skipEmissions.slice(),
      skipKeys: valid ? emissionKeysInRange(p, cfg.startKey, cfg.endKey, cfg.skipEmissions) : [],
      pauseKeys: valid ? offCycleKeys(p, cfg.startKey, cfg.endKey, t) : [],
      dayBoost: valid ? dayBoostsFor(speedCfg, p.id, cfg.startKey, cfg.endKey) : {}
    };
    if (g.routine.action === 'bet' && cfg.followGroup && valid) {
      m.followRoutineId = g.routine.id;
      m.onlyKeys = routineBetDays(g.routine, p, cfg.startKey, cfg.endKey);
    }
    return m;
  });
}

function savedGroupIds(g) {
  return (g ? g.ids : []).filter(id => {
    const sp = getSavedPlan(id);
    return sp && sp.params && sp.params.group && sp.params.group.routineId === g.routine.id;
  });
}

function renderGroupPreview() {
  const errEl = $('planError');
  const kpis = $('planKpis');
  const warnBox = $('planWarnings');
  const daysBox = $('planDays');
  const chartWrap = $('planChartWrap');
  const list = $('planGroupList');
  const g = currentGroup();
  lastPlan = null;
  if (daysBox) daysBox.replaceChildren();
  if (!g) { lastGroup = null; renderGroupActions(); return; }
  const members = groupMembers(g);
  const unchanged = formSnap !== null && snapForm() === formSnap && savedGroupIds(g).length > 0;
  const res = buildGroupPlan(groupBaseParams(), members, { routineId: g.routine.id, name: g.routine.name }, unchanged ? null : todayKey());
  // Motivo amigável pra quem ficou sem meta.
  res.members.forEach((m, i) => {
    if (m.plan) return;
    const src = members[i];
    if (src.rolloverC === null) m.error = 'Rollover indisponível (configurações de bônus não carregadas).';
    else if (!(src.target > 0)) m.error = src.reserve.mode === 'all'
      ? '🔒 Rollover guardado e sem depósito de ativação no período — nada a apostar.'
      : (src.reservedC > 0 ? '🔒 Todo o Rollover ficou guardado — nada a apostar.' : 'Sem Rollover — nada a planejar.');
  });
  lastGroup = { group: g, res, members };
  if (errEl) {
    errEl.textContent = res.ok ? '' : (res.error || 'Não foi possível montar o plano do grupo.');
    errEl.classList.toggle('app-hidden', res.ok);
  }
  // Mesma validação de período pra todas: mostra o erro comum uma vez só.
  if (!res.ok && res.members.length && res.members.every(m => m.error === res.members[0].error) && errEl) {
    errEl.textContent = res.members[0].error;
  }
  if (kpis) {
    kpis.replaceChildren();
    if (res.totals) {
      kpis.appendChild(kpi('Planejado (grupo)', formatCurrency(fromCents(res.totals.plannedC)), `meta ${formatCurrency(fromCents(res.totals.targetC))}`, 'plan-kpi-main'));
      kpis.appendChild(kpi('Plataformas', `${res.totals.okCount} de ${res.members.length}`, res.totals.failCount ? `${res.totals.failCount} fora (motivo na lista)` : 'todas com plano'));
      // (20) 🔒 total guardado pelo grupo
      kpis.appendChild(kpi('🔒 Guardado pra jogar depois', formatCurrency(fromCents(res.totals.reservedC)), res.totals.reservingCount ? `${res.totals.reservingCount} plataforma(s) guardando` : 'nenhuma plataforma guardando', 'plan-kpi-reserve'));
      if (res.days.length) {
        const vals = res.days.map(d => d.plannedC);
        kpis.appendChild(kpi('Dias com aposta', String(res.days.length), `${fmtShort(res.days[0].key)} a ${fmtShort(res.days[res.days.length - 1].key)}`));
        const maxV = Math.max(...vals);
        const maxDay = res.days.find(d => d.plannedC === maxV);
        kpis.appendChild(kpi('🔝 Dia mais alto (grupo)', formatCurrency(fromCents(maxV)), `${fmtDay(maxDay.key)} · ${maxDay.platforms} plataforma(s) · menor dia ${formatCurrency(fromCents(Math.min(...vals)))}`, 'plan-kpi-main'));
        const inflowAll = members.reduce((sum, m) => sum + (m.rolloverC === null ? 0 : m.inflowC), 0);
        if (inflowAll > 0) kpis.appendChild(kpi('Entradas previstas', formatCurrency(fromCents(inflowAll)), form.groupBase === 'projected' ? 'somadas na meta (Projetado)' : 'fora da meta — use "Projetado" pra incluir'));
      }
    }
  }
  if (warnBox) {
    warnBox.replaceChildren();
    const notes = [];
    if (!contextConfirmed) notes.push('Configurações de bônus não carregadas: sem Rollover não dá pra calcular a meta de cada plataforma.');
    if (routinesFailed) notes.push('⚠ Rotinas não carregadas: os dias proibidos NÃO estão sendo pulados.');
    if (['uniforme', 'escada-up', 'escada-down'].includes(form.curve)) notes.push('Esta curva não tem pico — a escala entre as plataformas não muda nada nela.');
    const detached = g.ids.filter(id => { const sp = getSavedPlan(id); return sp && !(sp.params && sp.params.group && sp.params.group.routineId === g.routine.id); });
    if (detached.length) notes.push(`${detached.length} plataforma(s) do grupo têm plano próprio — salvar o plano do grupo substitui.`);
    notes.forEach(n => warnBox.appendChild(el('p', 'graficos-note', n)));
  }
  if (chartWrap) chartWrap.classList.toggle('app-hidden', !res.days.length);
  if (res.days.length) renderGroupChart(res);
  if (list) {
    list.classList.remove('app-hidden');
    list.replaceChildren();
    list.appendChild(el('p', 'plan-hint', 'Plataformas do grupo — toque pra ver os dias de cada uma.'));
    res.members.forEach((m, i) => {
      const row = el('div', `plan-group-row${m.plan ? '' : ' plan-group-row-err'}`);
      const head = el('button', 'plan-group-head');
      head.type = 'button';
      head.setAttribute('aria-expanded', openGroupRows.has(m.platformId) ? 'true' : 'false');
      head.appendChild(el('span', 'plan-group-name', `${openGroupRows.has(m.platformId) ? '▾' : '▸'} ${m.name}`));
      const rsv = members[i].reserve.mode !== 'none' ? ` · 🔒 ${formatCurrency(fromCents(members[i].reservedC))}` : '';
      if (m.plan) {
        const sp = members[i].speed !== 1 ? ` · ⚡${formatMult(members[i].speed)}` : '';
        const peak = m.plan.days.reduce((a, d) => (d.plannedC > a.plannedC ? d : a), m.plan.days[0]);
        head.appendChild(el('span', 'plan-group-meta', `${m.plan.days.length} dia(s) · pico ${fmtShort(peak.key)} ${formatCurrency(fromCents(peak.plannedC))}${sp}${rsv}`));
        head.appendChild(el('span', 'plan-group-total', formatCurrency(fromCents(m.plan.totals.plannedC))));
      } else {
        head.appendChild(el('span', 'plan-group-meta plan-group-err', `${m.error || 'Sem plano'}${rsv}`));
      }
      head.addEventListener('click', () => {
        if (openGroupRows.has(m.platformId)) openGroupRows.delete(m.platformId); else openGroupRows.add(m.platformId);
        renderGroupPreview();
      });
      row.appendChild(head);
      if (openGroupRows.has(m.platformId)) row.appendChild(renderMemberReserve(m.platformId, members[i]));
      if (m.plan && openGroupRows.has(m.platformId)) {
        const box = el('div', 'plan-group-days');
        if (m.plan.warnings.length) box.appendChild(el('p', 'plan-hint', m.plan.warnings.join(' ')));
        m.plan.days.forEach(d => {
          const dr = el('div', `plan-day plan-day-${d.tier}`);
          const dh = el('div', 'plan-day-head');
          dh.appendChild(el('span', 'plan-day-date', fmtDay(d.key)));
          dh.appendChild(el('span', `plan-tier plan-tier-${d.tier}`, TIER_LABEL[d.tier]));
          dh.appendChild(el('span', 'plan-day-amount', formatCurrency(fromCents(d.plannedC))));
          dr.appendChild(dh);
          dr.appendChild(el('div', 'plan-day-lines', describeLines(d.lines)));
          box.appendChild(dr);
        });
        row.appendChild(box);
      }
      list.appendChild(row);
    });
  }
  renderGroupActions();
}

// (20) 🔒 Guardar rollover de UMA plataforma do grupo (dentro da linha dela).
function renderMemberReserve(pid, member) {
  const box = el('div', 'plan-group-reserve');
  const cur = form.groupReserve[pid] || { mode: 'none', valueText: '' };
  box.appendChild(el('span', 'plan-label', '🔒 Guardar rollover desta plataforma'));
  const chips = el('div', 'plan-chips');
  RESERVE_MODES.forEach(m => chips.appendChild(chip(m.label, cur.mode === m.id, () => {
    if (m.id === 'none') delete form.groupReserve[pid];
    else form.groupReserve[pid] = { mode: m.id, valueText: cur.mode === m.id ? cur.valueText : '' };
    renderGroupPreview();
  })));
  box.appendChild(chips);
  if (cur.mode === 'value' || cur.mode === 'pct') {
    const inp = el('input', 'plan-input');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.placeholder = cur.mode === 'pct' ? 'Ex.: 50 (%)' : 'Ex.: 100,00';
    inp.value = cur.valueText || '';
    inp.setAttribute('aria-label', 'Quanto guardar');
    inp.addEventListener('change', () => { form.groupReserve[pid] = { mode: cur.mode, valueText: inp.value }; renderGroupPreview(); });
    box.appendChild(inp);
  }
  const roll = member.rolloverC === null ? null : Math.round(member.rolloverC * member.speed);
  box.appendChild(el('p', 'plan-hint', roll === null
    ? 'Rollover indisponível.'
    : (member.reserve.mode === 'none'
      ? `Meta = Rollover ${formatCurrency(fromCents(roll))}${member.speed !== 1 ? ' (com o peso ⚡)' : ''}.`
      : (member.reserve.mode === 'all'
        ? `Guarda o Rollover inteiro (${formatCurrency(fromCents(member.reservedC))}); a meta cobre só os depósitos de ativação previstos: ${formatCurrency(member.target)}.`
        : `Guarda ${formatCurrency(fromCents(member.reservedC))} de ${formatCurrency(fromCents(roll))}; meta ${formatCurrency(member.target)}.`))));
  if (member.todayLeftC > 0) box.appendChild(el('p', 'plan-hint', `↻ Descontou ${formatCurrency(fromCents(member.todayLeftC))} que ainda falta apostar hoje.`)); // (24)
  return box;
}

function renderGroupChart(res) {
  const canvas = $('planChart');
  if (!canvas || !window.Chart) return;
  const keys = res.days.map(d => d.key);
  const labels = keys.map(fmtShort);
  const PALETTE = ['#2563eb', '#15803d', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#475569', '#65a30d', '#ea580c'];
  const maxV = res.days.length ? Math.max(...res.days.map(d => d.plannedC)) : 0;
  const maxIdx = res.days.findIndex(d => d.plannedC === maxV);
  const okMembers = res.members.filter(m => m.plan);
  const srcById = new Map((lastGroup ? lastGroup.members : []).map(m => [m.platformId, m]));
  // (20) Barras EMPILHADAS: uma cor por plataforma — mostra a escala/ritmo.
  const datasets = okMembers.map((m, i) => {
    const by = new Map(m.plan.days.map(d => [d.key, fromCents(d.plannedC)]));
    return {
      type: 'bar',
      label: m.name,
      data: keys.map(k => (by.has(k) ? by.get(k) : 0)),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderColor: keys.map((k, idx) => (idx === maxIdx ? '#0f172a' : 'rgba(0,0,0,0)')),
      borderWidth: keys.map((k, idx) => (idx === maxIdx ? 2 : 0)),
      stack: 'grupo',
      yAxisID: 'y',
      order: 2
    };
  });
  // Linha: Rollover previsto do grupo (soma: Rollover de hoje + entradas
  // até o dia − apostado planejado até o dia, de cada plataforma).
  let hasLine = false;
  const line = keys.map(() => 0);
  okMembers.forEach(m => {
    const src = srcById.get(m.platformId);
    if (!src || src.rolloverC === null) return;
    hasLine = true;
    const proj = computePlanProjections(m.plan.days, { startRolloverC: src.rolloverC, inflows: src.inflows || [] });
    const byKey = new Map(m.plan.days.map((d, idx) => [d.key, proj.rollover[idx]]));
    let last = src.rolloverC + (src.inflows || []).filter(x => keys.length && x.key < keys[0]).reduce((s2, x) => s2 + x.valueC, 0);
    keys.forEach((k, idx) => {
      if (byKey.has(k)) last = byKey.get(k);
      line[idx] += Math.max(0, last);
    });
  });
  if (hasLine) {
    datasets.push({
      type: 'line',
      label: 'Rollover previsto (grupo)',
      data: line.map(fromCents),
      borderColor: '#f59e0b',
      backgroundColor: '#f59e0b',
      pointRadius: keys.length > 30 ? 0 : 2,
      tension: 0.25,
      yAxisID: 'y1',
      order: 1
    });
  }
  const tooltip = {
    callbacks: {
      label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}`,
      afterBody: (items) => {
        const d = lastGroup && lastGroup.res.days[items[0].dataIndex];
        if (!d) return [];
        return [`Total do dia: ${formatCurrency(fromCents(d.plannedC))} · ${d.platforms} plataforma(s)${items[0].dataIndex === maxIdx ? ' · 🔝 dia mais alto' : ''}`];
      }
    }
  };
  if (chart) chart.destroy();
  chart = new window.Chart(canvas, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      // Plataforma sem aposta no dia não aparece no tooltip.
      plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { ...tooltip, filter: (item) => item.dataset.type === 'line' || Number(item.parsed.y) > 0 } },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: { stacked: true, beginAtZero: true, position: 'left' },
        y1: { beginAtZero: true, position: 'right', display: hasLine, grid: { drawOnChartArea: false } }
      }
    }
  });
  chart.__group = true;
}

function renderGroupActions() {
  syncTabState();
  const saveBtn = $('planSave');
  const delBtn = $('planDelete');
  const recalcBtn = $('planRecalc');
  const status = $('planStatusLine');
  const g = currentGroup();
  const ok = !!(lastGroup && lastGroup.res.ok);
  const savedIds = savedGroupIds(g);
  if (saveBtn) {
    saveBtn.disabled = busy || !ok;
    saveBtn.textContent = ok ? `💾 Salvar plano do grupo (${lastGroup.res.totals.okCount})` : '💾 Salvar plano do grupo';
  }
  if (delBtn) {
    delBtn.classList.toggle('app-hidden', savedIds.length === 0);
    delBtn.textContent = 'Excluir plano do grupo';
  }
  if (recalcBtn) {
    recalcBtn.classList.toggle('app-hidden', savedIds.length === 0);
    recalcBtn.textContent = '↻ Recalcular grupo a partir de amanhã';
  }
  if (status) {
    if (!g) status.textContent = 'Escolha uma plataforma ou um grupo pra começar.';
    else if (!savedIds.length) status.textContent = 'Plano do grupo novo — ainda não salvo.';
    else {
      const dirty = formSnap !== null && snapForm() !== formSnap;
      status.textContent = `${dirty ? '● Alterações não salvas · ' : ''}${savedIds.length} de ${g.ids.length} plataforma(s) com o plano deste grupo salvo.`;
    }
  }
}

async function onSaveGroup(btn) {
  if (busy || !lastGroup || !lastGroup.res.ok) return;
  const { group: g, res } = lastGroup;
  const okMembers = res.members.filter(m => m.plan);
  const replaced = okMembers.filter(m => getSavedPlan(m.platformId)).length;
  const failed = res.members.length - okMembers.length;
  const first = res.days[0];
  const last = res.days[res.days.length - 1];
  const msg = `Salvar o plano do grupo "${g.routine.name}"? ${okMembers.length} plataforma(s), ${formatCurrency(fromCents(res.totals.plannedC))} no total (${fmtShort(first.key)} a ${fmtShort(last.key)}).`
    + (replaced ? ` ${replaced} já têm plano salvo e serão substituídas (os dias passados ficam no histórico).` : '')
    + (failed ? ` ${failed} fica(m) de fora (motivo na lista) e mantêm o que já tinham.` : '');
  const ok = await showAppConfirm(msg);
  if (!ok || !mounted) return;
  // (25) Plataformas que tinham plano de OUTRO tipo (sozinha / outro grupo).
  const nowIso0 = new Date().toISOString();
  const swapped = [];
  okMembers.forEach(m => {
    const sp = getSavedPlan(m.platformId);
    if (!sp || savedGroupKey(sp) === g.routine.id) return;
    const p = findPlatform(m.platformId);
    const st = pastDaysOf(sp, p ? planToDoc(p, m.params, m.plan, nowIso0) : null);
    if (st.count > 0) swapped.push({ platformId: m.platformId, name: m.name, ...st });
  });
  let ignoreFor = [];
  if (swapped.length) {
    const choice = await askPastDays(swapped, 'swap');
    if (!choice || !mounted) return;
    if (choice === 'ignore') ignoreFor = swapped.map(x => x.platformId);
  }
  busy = true;
  btn.disabled = true;
  try {
    const nowIso = new Date().toISOString();
    const docs = [];
    for (const m of okMembers) {
      const p = findPlatform(m.platformId);
      if (!p) { await showAppAlert(`Plataforma ${m.name} não encontrada. Nada foi salvo.`); return; }
      docs.push(planToDoc(p, m.params, m.plan, nowIso));
    }
    const result = await saveGroupPlans(state.currentUid, docs, { ignoreFor });
    if (!result.ok) { await showAppAlert(result.error); return; }
    formSnap = snapForm();
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderGroupActions();
      refreshAlert(); // (24)
    }
  }
}

async function onDeleteGroup(btn) {
  if (busy) return;
  const g = currentGroup();
  const ids = savedGroupIds(g);
  if (!g || !ids.length) return;
  const ok = await showAppConfirm(`Excluir o plano do grupo "${g.routine.name}"? ${ids.length} plano(s) deixam de existir (os dias que já passaram ficam no histórico). Plataformas com plano próprio não são tocadas.`);
  if (!ok || !mounted) return;
  // (25) Os dias passados continuam contando?
  const past = ids.map(id => ({ platformId: id, name: (findPlatform(id) || {}).name || id, ...pastDaysOf(getSavedPlan(id), null) })).filter(x => x.count > 0);
  let ignorePast = false;
  if (past.length) {
    const choice = await askPastDays(past, 'delete');
    if (!choice || !mounted) return;
    ignorePast = choice === 'ignore';
  }
  busy = true;
  btn.disabled = true;
  try {
    const result = await deleteGroupPlans(state.currentUid, ids, { ignorePast });
    if (!result.ok) await showAppAlert(result.error);
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderGroupActions();
      refreshAlert(); // (24)
    }
  }
}

// ---------- (25) dias passados do plano antigo: contar ou 🙈 ignorar ----------

function savedGroupKey(sp) {
  return sp && sp.params && sp.params.group && sp.params.group.routineId ? sp.params.group.routineId : null;
}

// Dias do plano salvo que já passaram (e hoje, se o novo não tiver hoje).
function pastDaysOf(saved, newDoc) {
  const t = todayKey();
  const p = saved ? findPlatform(saved.platformId) : null;
  const out = { count: 0, plannedC: 0, realC: 0 };
  if (!saved || !Array.isArray(saved.days)) return out;
  const newHasToday = !!(newDoc && Array.isArray(newDoc.days) && newDoc.days.some(x => x && x.key === t));
  saved.days.forEach(day => {
    if (!day || !day.key || day.key > t || (day.key === t && newHasToday)) return;
    out.count++;
    out.plannedC += Math.round(Number(day.plannedC) || 0);
    if (p) out.realC += realWageredC(p, day.key);
  });
  return out;
}

// Dois botões IGUAIS (sem ênfase); "🙈 Ignorar" vem selecionado.
// @returns {Promise<'ignore'|'count'|null>} null = cancelar tudo.
function askPastDays(items, action) {
  return new Promise(resolve => {
    const total = items.reduce((a, x) => ({ count: a.count + x.count, plannedC: a.plannedC + x.plannedC, realC: a.realC + x.realC }), { count: 0, plannedC: 0, realC: 0 });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = el('div', 'cal-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'cal-box plan-choice-box');
    overlay.appendChild(box);
    const head = el('div', 'cal-box-head');
    head.appendChild(el('h3', 'cal-box-title', 'Dias que já passaram'));
    const x = el('button', 'cal-box-close', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cancelar');
    head.appendChild(x);
    box.appendChild(head);
    const who = items.length === 1 ? items[0].name : `${items.length} plataformas (${items.map(i => i.name).join(', ')})`;
    box.appendChild(el('p', 'cal-text', `${action === 'delete' ? 'O plano excluído' : 'O plano antigo'} de ${who} tem ${total.count} dia(s) que já passaram: ${formatCurrency(fromCents(total.realC))} apostado de ${formatCurrency(fromCents(total.plannedC))} planejado. Continuar contando esses dias?`));
    box.appendChild(el('p', 'plan-hint', 'Ignorar tira esses dias do Cumprimento, do Real × plano, da Aderência e do 🏆 Grupos. Eles ficam guardados e aparecem em 📟 Encerrados, no Calendário.'));
    const actions = el('div', 'plan-choice-actions');
    const ign = el('button', 'plan-choice-btn', '🙈 Ignorar esses dias');
    ign.type = 'button';
    const cnt = el('button', 'plan-choice-btn', 'Continuar contando');
    cnt.type = 'button';
    actions.appendChild(ign);
    actions.appendChild(cnt);
    box.appendChild(actions);
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      resolve(v);
    };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(null); } }
    ign.addEventListener('click', () => done('ignore'));
    cnt.addEventListener('click', () => done('count'));
    x.addEventListener('click', () => done(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) done(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    ign.focus();
  });
}

// ---------- ações (gravam no banco) ----------

async function onSavePlan(btn) {
  if (isGroupMode()) { await onSaveGroup(btn); return; }
  if (busy || !lastPlan) return;
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  // (19) Salvar sozinha uma plataforma do plano de grupo = sai do grupo.
  const detach = form.groupRef;
  const params = detach ? { ...lastPlan.params, group: null } : lastPlan.params;
  const { plan } = lastPlan;
  const saved = getSavedPlan(platform.id);
  const summary = `${plan.totals.activeDays} dia(s), ${formatCurrency(fromCents(plan.totals.plannedC))} (${fmtShort(plan.days[0].key)} a ${fmtShort(plan.days[plan.days.length - 1].key)})`;
  const detachText = detach ? ` ⚠ ${platform.name} faz parte do plano do grupo "${detach.name || ''}": salvar aqui TIRA ela do grupo (as outras continuam).` : '';
  const ok = await showAppConfirm(saved
    ? `${platform.name} já tem um plano salvo (${fmtFull(saved.updatedAt)}). Substituir pelo novo? ${summary}. O anterior deixa de existir.${detachText}`
    : `Salvar o plano de ${platform.name}? ${summary}.${detachText}`);
  if (!ok || !mounted) return;
  // (25) Troca de tipo (grupo → sozinha): os dias passados do plano antigo contam?
  let ignorePast = false;
  const newDoc = planToDoc(platform, params, plan, new Date().toISOString());
  if (saved && savedGroupKey(saved) !== (params.group ? params.group.routineId : null)) {
    const st = pastDaysOf(saved, newDoc);
    if (st.count > 0) {
      const choice = await askPastDays([{ name: platform.name, ...st }], 'swap');
      if (!choice || !mounted) return;
      ignorePast = choice === 'ignore';
    }
  }

  busy = true;
  btn.disabled = true;
  try {
    const target = findPlatform(form.platformId);
    if (!target) { await showAppAlert('Plataforma não encontrada. Nada foi salvo.'); return; }
    const result = await savePlan(state.currentUid, planToDoc(target, params, plan, new Date().toISOString()), { ignorePast });
    if (!result.ok) { await showAppAlert(result.error); return; }
    if (detach) form.groupRef = null;
    formSnap = snapForm();
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderPlatformInfo();
      renderActions(lastPlan ? lastPlan.plan : null);
      refreshAlert(); // (24)
    }
  }
}

async function onDeletePlan(btn) {
  if (isGroupMode()) { await onDeleteGroup(btn); return; }
  if (busy) return;
  const platform = findPlatform(form.platformId);
  const saved = platform ? getSavedPlan(platform.id) : null;
  if (!saved) return;
  const ok = await showAppConfirm(`Excluir o plano salvo de ${platform.name}? A prévia continua na tela, mas o plano deixa de existir no banco.`);
  if (!ok || !mounted) return;
  // (25) Os dias passados continuam contando?
  const st = pastDaysOf(saved, null);
  let ignorePast = false;
  if (st.count > 0) {
    const choice = await askPastDays([{ name: platform.name, ...st }], 'delete');
    if (!choice || !mounted) return;
    ignorePast = choice === 'ignore';
  }
  busy = true;
  btn.disabled = true;
  try {
    const result = await deletePlan(state.currentUid, platform.id, { ignorePast });
    if (!result.ok) await showAppAlert(result.error);
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) {
      fillPlatformSelect();
      renderPlatformInfo();
      renderActions(lastPlan ? lastPlan.plan : null);
      refreshAlert(); // (24)
    }
  }
}

// Mantém curva/limites/valores e refaz a partir de amanhã com o Rollover de agora.
// (24) Desconta o que ainda falta apostar HOJE (hoje continua com a meta
// dele — o dia de hoje fica congelado no histórico ao salvar). Meta
// digitada: pergunta se usa o Rollover ou mantém a meta (redistribui o que
// falta).
async function onRecalc() {
  if (isGroupMode()) { onRecalcGroup(); return; }
  const platform = findPlatform(form.platformId);
  if (!platform) return;
  world = computeWorld(platform);
  const saved = getSavedPlan(platform.id);
  const t = todayKey();
  const span = Math.max(0, Math.round((dayKeyToDate(form.endKey) - dayKeyToDate(form.startKey)) / 86400000));
  const tomorrow = addDaysKey(t, 1);
  form.startKey = tomorrow;
  if (form.endKey < tomorrow) form.endKey = addDaysKey(tomorrow, Math.min(span, PLAN_MAX_DAYS - 1));
  if (world && world.rolloverC !== null) {
    const left = todayLeftC(saved, platform, t);
    let useRollover = true;
    if (form.targetMode === 'manual' && saved) {
      const keepC = plannedAfterC(saved, t);
      useRollover = await showAppConfirm(`A meta deste plano foi digitada à mão. Trocar pela meta do Rollover de agora? OK = usar o Rollover (${formatCurrency(fromCents(autoBaseC(platform, form.endKey, form.targetBase === 'projected')))} × peso − guardado${left ? ` − ${formatCurrency(fromCents(left))} que falta hoje` : ''}). Cancelar = manter a meta digitada e redistribuir só o que falta (${formatCurrency(fromCents(keepC))}).`);
      if (!mounted) return;
      if (!useRollover) {
        form.target = keepC > 0 ? fmtMoneyInput(fromCents(keepC)) : '';
        form.todayLeftC = 0;
      }
    }
    if (useRollover) {
      const projected = form.targetBase === 'projected';
      setTargetFromBase(Math.round(autoBaseC(platform, form.endKey, projected) * speedBase()), projected, left);
    }
  }
  syncInputs();
  renderPlatformInfo();
  schedulePreview(0);
}

// (24) O que ainda falta apostar HOJE do plano salvo (centavos). Plano já
// refeito a partir de amanhã: a meta de hoje está no histórico (planLog).
function todayLeftC(saved, platform, t = todayKey()) {
  if (!platform) return 0;
  const day = planDayOf(saved, t) || (isPlanLogLoaded(state.currentUid) ? getPlanLogEntry(t, platform.id) : null);
  if (!day) return 0;
  return Math.max(0, Math.round(Number(day.plannedC) || 0) - realWageredC(platform, t));
}

// (24) Base da meta automática: Rollover de hoje (+ entradas previstas até
// endKey no Projetado), centavos, SEM o peso.
function autoBaseC(platform, endKey, projected) {
  const roll = platformRolloverC(platform);
  if (roll === null) return 0;
  if (!projected) return roll;
  const ins = memberInflows(platform, endKey);
  return roll + ins.reduce((s2, x) => s2 + x.valueC, 0);
}

// (24) Rollover ao vivo da plataforma (centavos) — null sem o contexto.
function platformRolloverC(platform) {
  if (!platform || !contextConfirmed) return null;
  try {
    return toCents(computeRolloverLive(platform, new Date(), resolveCtx(platform) || {}));
  } catch (err) {
    console.error('Planejador: falha ao calcular o Rollover:', err);
    return null;
  }
}

// (20) ↻ Recalcular grupo: a partir de amanhã, metas com o Rollover de
// agora (o grupo sempre calcula a meta ao vivo).
// (24) + desconta o que falta apostar hoje de cada plataforma.
function onRecalcGroup() {
  const span = Math.max(0, Math.round((dayKeyToDate(form.endKey) - dayKeyToDate(form.startKey)) / 86400000));
  const tomorrow = addDaysKey(todayKey(), 1);
  form.startKey = tomorrow;
  if (form.endKey < tomorrow) form.endKey = addDaysKey(tomorrow, Math.min(span, PLAN_MAX_DAYS - 1));
  form.groupDeductToday = true;
  syncInputs();
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

// ---------- (24) 🔄 ATUALIZAR PLANOS ----------

function moneyC(c) {
  return formatCurrency(fromCents(Math.round(Number(c) || 0)));
}

function signedC(c) {
  const v = Math.round(Number(c) || 0);
  return `${v > 0 ? '+' : (v < 0 ? '−' : '')}${moneyC(Math.abs(v))}`;
}

// Datas que dependem do período e da plataforma (mesma conta do formulário).
function platformDayKeys(platform, sp, startKey, endKey) {
  const routines = isRoutinesLoaded(state.currentUid) ? getRoutines() : [];
  const out = {
    excludeKeys: forbiddenBetDays(routines, platform, startKey, endKey),
    onlyKeys: [],
    followRoutineId: null,
    skipKeys: emissionKeysInRange(platform, startKey, endKey, sp.skipEmissions),
    pauseKeys: offCycleKeys(platform, startKey, endKey, todayKey()),
    dayBoost: dayBoostsFor(getSpeedConfig(), platform.id, startKey, endKey)
  };
  if (sp.followRoutineId) {
    const r = routines.find(x => x.id === sp.followRoutineId && (x.platformIds || []).includes(platform.id));
    if (r) {
      out.followRoutineId = r.id;
      out.onlyKeys = routineBetDays(r, platform, startKey, endKey);
    }
  }
  return out;
}

// Linha de UM plano individual: antes × depois, guardado, falta hoje.
function buildPlanRow(saved, opts, t, tomorrow) {
  const p = findPlatform(saved.platformId);
  const sp = sanitizeParams(saved.params || {});
  const row = {
    kind: 'plan', key: `p:${saved.platformId}`, id: saved.platformId,
    name: p ? String(p.name || '') : String(saved.platformName || 'Plataforma excluída'),
    mode: sp.targetMode, projected: sp.targetBase === 'projected',
    reserveMode: sp.reserve.mode, beforeC: plannedAfterC(saved, t), reservedBeforeC: sp.reservedC,
    startKey: tomorrow, endKey: sp.endKey, todayLeftC: 0, significant: false
  };
  if (!p) return { ...row, error: 'A plataforma não existe mais.' };
  if (sp.endKey < tomorrow) return { ...row, ended: true, error: `O plano terminou em ${fmtShort(sp.endKey)} — nada a refazer.` };
  row.todayLeftC = todayLeftC(saved, p, t);
  row.speed = getPlatformSpeed(getSpeedConfig(), p.id).base;
  row.rolloverC = platformRolloverC(p);
  if (row.rolloverC === null) return { ...row, error: 'Rollover indisponível (configurações de bônus não carregadas).' };
  const baseC = Math.round(autoBaseC(p, sp.endKey, row.projected) * row.speed);
  const res = applyReserve(baseC, sp.reserve, activationC(p, sp.endKey), row.projected);
  row.autoTargetC = Math.max(0, res.targetC - (opts.deductToday ? row.todayLeftC : 0));
  row.autoReservedC = res.reservedC;
  row.significant = isSignificantChange(row.beforeC, row.autoTargetC);
  row.choice = row.mode === 'auto' ? 'rollover' : (opts.choices.get(row.key) || (row.mode === 'manual' ? 'keep' : 'rollover'));
  const keep = row.choice === 'keep';
  const targetC = keep ? row.beforeC : row.autoTargetC;
  row.reservedAfterC = keep ? sp.reservedC : res.reservedC;
  if (!(targetC > 0)) {
    return {
      ...row,
      significant: false,
      error: keep ? 'Nada previsto depois de hoje.'
        : (sp.reserve.mode !== 'none' ? '🔒 Todo o Rollover ficou guardado — nada a apostar.' : 'Sem Rollover — nada a apostar.')
    };
  }
  const params = {
    ...sp,
    startKey: tomorrow,
    endKey: sp.endKey,
    target: fromCents(targetC),
    reservedC: row.reservedAfterC,
    targetMode: keep ? 'manual' : 'auto',
    ...platformDayKeys(p, sp, tomorrow, sp.endKey)
  };
  const plan = buildPlan(params, t);
  if (!plan.ok) return { ...row, significant: false, error: plan.error };
  const diff = planUpdateDiff(saved, plan, t);
  return { ...row, params, plan, afterC: diff.afterC, deltaC: diff.deltaC, days: plan.totals.activeDays, firstKey: plan.days[0].key, lastKey: plan.days[plan.days.length - 1].key };
}

// Linha de UM grupo: soma dos membros (só os que estão com o plano deste
// grupo — plataforma com plano próprio ou sem plano não é tocada).
function buildGroupRow(g, opts, t, tomorrow) {
  const ids = savedGroupIds(g);
  const saved = ids.map(id => getSavedPlan(id)).filter(Boolean);
  const sp = sanitizeParams(saved[0].params || {});
  const row = {
    kind: 'group', key: `g:${g.routine.id}`, id: g.routine.id,
    name: `${g.routine.emoji ? `${g.routine.emoji} ` : ''}${g.routine.name}`, mode: 'auto',
    projected: sp.targetBase === 'projected',
    beforeC: saved.reduce((s2, x) => s2 + plannedAfterC(x, t), 0),
    reservedBeforeC: saved.reduce((s2, x) => s2 + Math.max(0, Math.round(Number(x.params && x.params.reservedC) || 0)), 0),
    startKey: tomorrow, endKey: sp.endKey, memberCount: ids.length, todayLeftC: 0, significant: false, members: []
  };
  if (ids.length < 2) return { ...row, error: 'Menos de 2 plataformas com o plano deste grupo — abra o grupo no Planejador.' };
  if (sp.endKey < tomorrow) return { ...row, ended: true, error: `O plano do grupo terminou em ${fmtShort(sp.endKey)} — nada a refazer.` };
  if (!contextConfirmed) return { ...row, error: 'Rollover indisponível (configurações de bônus não carregadas).' };
  const groupReserve = {};
  saved.forEach(x => {
    const r = reserveToForm(x.params && x.params.reserve);
    if (r.mode !== 'none') groupReserve[x.platformId] = r;
  });
  const cfg = {
    startKey: tomorrow,
    endKey: sp.endKey,
    skipEmissions: sp.skipEmissions,
    groupBase: sp.targetBase,
    groupReserve,
    followGroup: g.routine.action === 'bet' ? sp.followRoutineId === g.routine.id : true,
    deductToday: opts.deductToday,
    onlyIds: new Set(ids)
  };
  const members = groupMembers(g, cfg);
  const base = {
    startKey: tomorrow,
    endKey: sp.endKey,
    weekdaysOff: sp.weekdaysOff.slice(),
    weekMode: sp.weekMode,
    curve: sp.curve,
    intensity: sp.intensity,
    rhythm: sp.rhythm,
    seed: sp.seed,
    floor: sp.floor,
    cap: sp.cap,
    stakes: sp.stakes.slice(),
    buy: { enabled: sp.buy.enabled, multiplier: sp.buy.multiplier },
    skipEmissions: sp.skipEmissions.slice(),
    targetBase: sp.targetBase
  };
  const res = buildGroupPlan(base, members, { routineId: g.routine.id, name: g.routine.name }, t);
  row.todayLeftC = members.reduce((s2, m) => s2 + (m.todayLeftC || 0), 0);
  row.autoTargetC = members.reduce((s2, m) => s2 + toCents(m.target), 0);
  row.reservedAfterC = members.reduce((s2, m) => s2 + (m.reservedC || 0), 0);
  row.significant = isSignificantChange(row.beforeC, row.autoTargetC);
  row.members = res.members.map((m, i) => {
    const sv = getSavedPlan(m.platformId);
    let err = m.plan ? null : (m.error || 'Sem plano');
    if (!m.plan && members[i] && !(members[i].target > 0)) {
      err = members[i].rolloverC === null ? 'Rollover indisponível.'
        : (members[i].reservedC > 0 ? '🔒 Todo o Rollover ficou guardado — nada a apostar.'
          : (members[i].todayLeftC > 0 ? 'Sem Rollover depois de descontar o que falta hoje — nada a apostar.' : 'Sem Rollover — nada a apostar.'));
    }
    return { platformId: m.platformId, name: m.name, beforeC: plannedAfterC(sv, t), afterC: m.plan ? m.plan.totals.plannedC : 0, error: err };
  });
  if (!res.ok) return { ...row, significant: false, error: `${res.error || 'Nenhuma plataforma do grupo conseguiu montar o plano.'} Toque em "plataformas" pra ver o motivo.` };
  row.res = res;
  row.afterC = res.totals.plannedC;
  row.deltaC = row.afterC - row.beforeC;
  row.days = res.days.length;
  row.firstKey = res.days.length ? res.days[0].key : tomorrow;
  row.lastKey = res.days.length ? res.days[res.days.length - 1].key : sp.endKey;
  row.failCount = res.totals.failCount;
  return row;
}

// Todas as linhas: 1 por plano individual e 1 por grupo salvo.
function buildUpdateRows(opts) {
  const t = todayKey();
  const tomorrow = addDaysKey(t, 1);
  const groupById = new Map(planGroups().map(g => [g.routine.id, g]));
  const seen = new Set();
  const rows = [];
  getSavedPlans().forEach(saved => {
    const gref = saved && saved.params && saved.params.group;
    if (gref && groupById.has(gref.routineId)) {
      if (seen.has(gref.routineId)) return;
      seen.add(gref.routineId);
      try { rows.push(buildGroupRow(groupById.get(gref.routineId), opts, t, tomorrow)); } catch (err) {
        console.error('Atualizar planos: falha no grupo:', err);
        rows.push({ kind: 'group', key: `g:${gref.routineId}`, id: gref.routineId, name: gref.name || 'Grupo', mode: 'auto', beforeC: 0, error: 'Não foi possível recalcular este grupo.' });
      }
      return;
    }
    try { rows.push(buildPlanRow(saved, opts, t, tomorrow)); } catch (err) {
      console.error('Atualizar planos: falha no plano:', err);
      rows.push({ kind: 'plan', key: `p:${saved.platformId}`, id: saved.platformId, name: saved.platformName || 'Plano', mode: 'unknown', beforeC: 0, error: 'Não foi possível recalcular este plano.' });
    }
  });
  // ⚠️ primeiro, depois os demais, os sem como atualizar por último.
  const rank = r => (r.error ? 2 : (r.significant ? 0 : 1));
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

// (24) Aviso: planos com meta automática/desconhecida e diferença relevante.
function computeAlert() {
  if (loadStatus !== 'ok' || !contextConfirmed) { alertRows = null; return; }
  try {
    alertRows = buildUpdateRows({ deductToday: true, choices: new Map() })
      .filter(r => !r.error && r.significant && r.mode !== 'manual');
  } catch (err) {
    console.error('Planejador: falha ao conferir os planos:', err);
    alertRows = null;
  }
}

function renderAlert() {
  const box = $('planAlert');
  if (!box) return;
  const n = alertRows ? alertRows.length : 0;
  box.replaceChildren();
  box.classList.toggle('app-hidden', n === 0);
  box.classList.toggle('plan-alert-min', alertMin);
  if (!n) return;
  const icon = el('button', 'plan-alert-icon', '⚠️');
  icon.type = 'button';
  icon.setAttribute('aria-expanded', alertMin ? 'false' : 'true');
  icon.setAttribute('aria-label', alertMin ? `Mostrar aviso: Rollover mudou em ${n} plano(s)` : 'Recolher aviso');
  icon.title = alertRows.map(r => r.name).join(', ');
  icon.addEventListener('click', () => { alertMin = !alertMin; renderAlert(); });
  box.appendChild(icon);
  if (alertMin) return;
  box.appendChild(el('span', 'plan-alert-text', `Rollover mudou em ${n} plano${n > 1 ? 's' : ''} —`));
  const go = el('button', 'plan-alert-go', '🔄 Atualizar');
  go.type = 'button';
  go.addEventListener('click', () => openUpdatePlans());
  box.appendChild(go);
}

function refreshAlert() {
  computeAlert();
  renderAlert();
}

function openUpdatePlans() {
  if (busy || loadStatus !== 'ok') return;
  if (updateClose) updateClose();
  const st = { deductToday: true, choices: new Map(), checked: new Set(), openGroups: new Set(), rows: [], saving: false };
  const recompute = (first = false) => {
    st.rows = buildUpdateRows({ deductToday: st.deductToday, choices: st.choices });
    if (first) st.rows.forEach(r => { if (!r.error && r.significant && r.mode === 'auto') st.checked.add(r.key); });
    st.rows.forEach(r => { if (r.error) st.checked.delete(r.key); });
  };
  recompute(true);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const overlay = el('div', 'cal-overlay pu-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Atualizar planos');
  const box = el('div', 'cal-box pu-box');
  overlay.appendChild(box);
  const tomorrow = addDaysKey(todayKey(), 1);

  const draw = () => {
    box.replaceChildren();
    const head = el('div', 'cal-box-head');
    head.appendChild(el('h3', 'cal-box-title', '🔄 Atualizar planos'));
    const x = el('button', 'cal-box-close', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.addEventListener('click', () => requestClose());
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(el('p', 'plan-hint', `Refaz os planos a partir de amanhã (${fmtDay(tomorrow)}) com o Rollover de agora. Curva, dias, limites e valores de cada plano não mudam. Hoje continua com a meta de hoje — ela fica guardada no histórico, junto com os dias que já passaram.`));

    const tools = el('div', 'pu-tools');
    const ded = el('label', 'plan-toggle pu-deduct');
    const dedIn = el('input');
    dedIn.type = 'checkbox';
    dedIn.checked = st.deductToday;
    dedIn.addEventListener('change', () => { st.deductToday = dedIn.checked; recompute(); draw(); });
    ded.appendChild(dedIn);
    ded.appendChild(document.createTextNode(' Descontar o que ainda falta apostar hoje'));
    tools.appendChild(ded);
    const row2 = el('div', 'plan-chips');
    const markSig = el('button', 'plan-chip', 'Marcar os ⚠️');
    markSig.type = 'button';
    markSig.addEventListener('click', () => { st.rows.forEach(r => { if (!r.error && r.significant) st.checked.add(r.key); }); draw(); });
    const clear = el('button', 'plan-chip plan-chip-ghost', 'Desmarcar todos');
    clear.type = 'button';
    clear.addEventListener('click', () => { st.checked.clear(); draw(); });
    row2.appendChild(markSig);
    row2.appendChild(clear);
    tools.appendChild(row2);
    box.appendChild(tools);

    if (!st.rows.length) box.appendChild(el('p', 'cal-text', 'Nenhum plano salvo.'));
    const list = el('div', 'pu-list');
    st.rows.forEach(r => list.appendChild(updateRow(r)));
    box.appendChild(list);

    const chosen = st.rows.filter(r => st.checked.has(r.key) && !r.error);
    const sumAfter = chosen.reduce((s2, r) => s2 + (r.afterC || 0), 0);
    const sumBefore = chosen.reduce((s2, r) => s2 + (r.beforeC || 0), 0);
    const foot = el('div', 'pu-foot');
    foot.appendChild(el('p', 'plan-hint pu-sum', chosen.length
      ? `${chosen.length} marcado(s): ${moneyC(sumBefore)} → ${moneyC(sumAfter)} (${signedC(sumAfter - sumBefore)})`
      : 'Nada marcado.'));
    const actions = el('div', 'plan-actions pu-actions');
    const ok = el('button', 'btn-confirm', chosen.length ? `Confirmar (${chosen.length})` : 'Confirmar');
    ok.type = 'button';
    ok.disabled = !chosen.length || st.saving;
    ok.addEventListener('click', () => confirmUpdate(ok));
    const cancel = el('button', 'bet-manage-btn', 'Cancelar');
    cancel.type = 'button';
    cancel.addEventListener('click', () => requestClose());
    actions.appendChild(ok);
    actions.appendChild(cancel);
    foot.appendChild(actions);
    box.appendChild(foot);
  };

  const updateRow = (r) => {
    const card = el('div', `pu-row${r.significant ? ' pu-row-sig' : ''}${r.error ? ' pu-row-err' : ''}${st.checked.has(r.key) ? ' pu-row-on' : ''}`);
    const top = el('label', 'pu-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = st.checked.has(r.key);
    cb.disabled = !!r.error || st.saving;
    cb.addEventListener('change', () => { if (cb.checked) st.checked.add(r.key); else st.checked.delete(r.key); draw(); });
    top.appendChild(cb);
    top.appendChild(el('span', 'pu-name', `${r.significant ? '⚠️ ' : ''}${r.name}`));
    if (r.kind === 'group') top.appendChild(el('span', 'pu-tag', `👥 grupo · ${r.memberCount || 0}`));
    else if (r.mode === 'manual') top.appendChild(el('span', 'pu-tag pu-tag-manual', '✍️ meta digitada'));
    else if (r.mode === 'unknown') top.appendChild(el('span', 'pu-tag', '❓ origem da meta desconhecida'));
    if (r.projected) top.appendChild(el('span', 'pu-tag', 'projetado'));
    card.appendChild(top);

    const nums = el('div', 'pu-nums');
    const line = (label, value, cls = '') => {
      const d = el('div', `pu-line${cls ? ` ${cls}` : ''}`);
      d.appendChild(el('span', 'pu-l', label));
      d.appendChild(el('span', 'pu-r', value));
      nums.appendChild(d);
    };
    if (r.error) {
      line('Previsto depois de hoje', moneyC(r.beforeC));
      if (r.todayLeftC > 0) line('⏳ Falta apostar hoje', `${moneyC(r.todayLeftC)} · ${st.deductToday ? 'descontado' : 'não descontado'}`);
      card.appendChild(nums);
      card.appendChild(el('p', 'pu-err', r.error));
      if (r.kind === 'group' && r.members && r.members.length) card.appendChild(membersBlock(r));
      return card;
    }
    line('Meta (amanhã em diante)', `${moneyC(r.beforeC)} → ${moneyC(r.afterC)}`);
    line('Diferença', signedC(r.deltaC), r.deltaC > 0 ? 'pu-up' : (r.deltaC < 0 ? 'pu-down' : ''));
    if (r.kind === 'plan' && r.rolloverC !== null && r.rolloverC !== undefined) {
      line('Rollover agora', `${moneyC(r.rolloverC)}${r.speed && r.speed !== 1 ? ` × peso ${formatMult(r.speed)}` : ''}`);
    }
    if (r.reserveMode !== 'none' || r.reservedBeforeC > 0 || r.reservedAfterC > 0) {
      line('🔒 Guardado', `${moneyC(r.reservedBeforeC)} → ${moneyC(r.reservedAfterC)}`);
    }
    if (r.todayLeftC > 0) line('⏳ Falta apostar hoje', `${moneyC(r.todayLeftC)} · ${st.deductToday ? 'descontado' : 'não descontado'}`);
    line('📅 Período', `${fmtShort(r.firstKey)} a ${fmtShort(r.lastKey)} · ${r.days} dia(s)`);
    card.appendChild(nums);

    // Meta digitada / desconhecida: manter ou usar o Rollover.
    if (r.kind === 'plan' && r.mode !== 'auto') {
      const chips = el('div', 'plan-chips pu-choice');
      const keepC = r.beforeC;
      [['keep', `Manter a meta (${moneyC(keepC)})`], ['rollover', `Usar o Rollover (${moneyC(r.autoTargetC)})`]].forEach(([id, label]) => {
        const b = el('button', `plan-chip${r.choice === id ? ' active' : ''}`, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', r.choice === id ? 'true' : 'false');
        b.addEventListener('click', () => { st.choices.set(r.key, id); recompute(); draw(); });
        chips.appendChild(b);
      });
      card.appendChild(chips);
      card.appendChild(el('p', 'plan-hint', r.choice === 'keep'
        ? 'Manter: redistribui só o que o plano ainda previa depois de hoje (o 🔒 guardado não muda).'
        : `Rollover: ${moneyC(r.rolloverC)}${r.speed && r.speed !== 1 ? ` × ${formatMult(r.speed)}` : ''} − 🔒 ${moneyC(r.reservedAfterC)}${st.deductToday && r.todayLeftC ? ` − ${moneyC(r.todayLeftC)} de hoje` : ''}.`));
    }

    if (r.kind === 'group' && r.members.length) card.appendChild(membersBlock(r));
    return card;
  };

  // Membros do grupo (toque pra abrir).
  const membersBlock = (r) => {
    const wrap = el('div', 'pu-members-wrap');
    const open = st.openGroups.has(r.key);
    const tg = el('button', 'pu-members-toggle', `${open ? '▾' : '▸'} ${r.members.length} plataforma(s)${r.failCount && !r.error ? ` · ${r.failCount} fica(m) como está(ão)` : ''}`);
    tg.type = 'button';
    tg.setAttribute('aria-expanded', open ? 'true' : 'false');
    tg.addEventListener('click', () => { if (open) st.openGroups.delete(r.key); else st.openGroups.add(r.key); draw(); });
    wrap.appendChild(tg);
    if (open) {
      const ml = el('div', 'pu-members');
      r.members.forEach(m => {
        const d = el('div', `pu-line${m.error ? ' cal-line-bad' : ''}`);
        d.appendChild(el('span', 'pu-l', m.name));
        d.appendChild(el('span', 'pu-r', m.error ? m.error : `${moneyC(m.beforeC)} → ${moneyC(m.afterC)}`));
        ml.appendChild(d);
      });
      wrap.appendChild(ml);
    }
    return wrap;
  };

  const confirmUpdate = async (btn) => {
    if (st.saving || busy) return;
    const chosen = st.rows.filter(r => st.checked.has(r.key) && !r.error);
    if (!chosen.length) return;
    const nowIso = new Date().toISOString();
    const docs = [];
    for (const r of chosen) {
      if (r.kind === 'plan') {
        const p = findPlatform(r.id);
        if (!p) { await showAppAlert(`Plataforma ${r.name} não encontrada. Nada foi salvo.`); return; }
        docs.push(planToDoc(p, r.params, r.plan, nowIso));
      } else {
        for (const m of r.res.members.filter(x => x.plan)) {
          const p = findPlatform(m.platformId);
          if (!p) { await showAppAlert(`Plataforma ${m.name} não encontrada. Nada foi salvo.`); return; }
          docs.push(planToDoc(p, m.params, m.plan, nowIso));
        }
      }
    }
    const sumAfter = chosen.reduce((s2, r) => s2 + (r.afterC || 0), 0);
    const okGo = await showAppConfirm(`Atualizar ${chosen.length} plano(s)/grupo(s) — ${docs.length} plataforma(s)? Tudo é refeito a partir de amanhã (${fmtShort(tomorrow)}): ${moneyC(sumAfter)} no total. Hoje continua com a meta de hoje (fica guardada no histórico, junto com os dias que já passaram). Tudo é gravado de uma vez: se falhar, nada muda.`);
    if (!okGo || !mounted || !updateClose) return;
    st.saving = true;
    busy = true;
    btn.disabled = true;
    let result;
    try {
      result = await savePlansBatch(state.currentUid, docs);
    } finally {
      busy = false;
      st.saving = false;
    }
    if (!result.ok) {
      await showAppAlert(result.error);
      if (updateClose) draw();
      return;
    }
    const updatedIds = new Set(docs.map(d => d.platformId));
    const updatedGroups = new Set(chosen.filter(r => r.kind === 'group').map(r => r.id));
    close();
    if (!mounted) return;
    afterPlansChanged(updatedIds, updatedGroups);
    await showAppAlert(`✅ ${chosen.length} plano(s)/grupo(s) atualizado(s) — ${docs.length} plataforma(s).`);
  };

  const requestClose = async () => {
    if (st.saving) return;
    if (st.checked.size > 0) {
      const ok = await showAppConfirm('Fechar sem atualizar? A seleção será descartada e nenhum plano muda.');
      if (!ok) return;
    }
    close();
  };
  function close() {
    updateClose = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    window.removeEventListener('popstate', close);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('appModal');
    if (modal && modal.style.display === 'flex') return; // a confirmação cuida do Esc
    e.preventDefault();
    requestClose();
  }
  updateClose = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) requestClose(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  window.addEventListener('popstate', close);
  draw();
  document.body.appendChild(overlay);
}

// Depois de gravar vários planos: lista, formulário (se o plano aberto
// mudou e não há alteração pendente) e aviso.
function afterPlansChanged(updatedIds, updatedGroups) {
  fillPlatformSelect();
  const clean = formSnap === null || snapForm() === formSnap;
  if (clean && form.groupId && updatedGroups.has(form.groupId)) selectGroup(form.groupId);
  else if (clean && form.platformId && updatedIds.has(form.platformId)) selectPlatform(form.platformId);
  else if (form.platformId || form.groupId) { renderPlatformInfo(); schedulePreview(0); }
  refreshAlert();
}

// ---------- (24) "Abrir no Planejador" (Calendário) ----------

export function requestPlanejadorFocus(platformId) {
  pendingFocus = platformId ? String(platformId) : null;
  if (mounted && loadStatus === 'ok') consumeFocus();
}

async function consumeFocus() {
  const id = pendingFocus;
  pendingFocus = null;
  if (!id || !findPlatform(id)) return;
  if (form.platformId === id && !form.groupId) { activeTab = 'caixa'; applyTab(); return; }
  if ((form.platformId || form.groupId) && formSnap !== null && snapForm() !== formSnap) {
    const ok = await showAppConfirm('Abrir outra plataforma sem salvar? As alterações feitas no plano aberto serão descartadas.');
    if (!ok || !mounted) return;
  }
  activeTab = 'caixa';
  const sel = $('planPlatform');
  if (sel) sel.value = id;
  selectPlatform(id);
  applyTab();
  if (rootEl && typeof rootEl.scrollIntoView === 'function') rootEl.scrollIntoView({ block: 'start' });
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
  refreshAlert(); // (24)
  schedulePreview(0);
  if (pendingFocus) consumeFocus(); // (24)
}

export function resizePlanejador() {
  if (chart) chart.resize();
}

export function unmountPlanejador() {
  loadToken++;
  if (updateClose) updateClose(); // (24)
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (chart) { chart.destroy(); chart = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  controlsBound = false;
  lastPlan = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
