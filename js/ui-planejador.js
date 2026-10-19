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
// h) (27) CICLO DO MISTERIOSO ENCERRADO: o plano CONTINUA apostando (só
//    a instável pausa a aposta perto da virada do mês — betPauseKeys); as
//    rotinas de depósito ficam ⏸ pausadas (routine-logic.js).
// i) (27) "👁️ Prévia não salva" quando a prévia difere do salvo e
//    "📌 Hoje no plano salvo" (valor e apostas de hoje; no grupo, por
//    plataforma) — o Calendário segue sempre o plano salvo.
// j) (28) TETO PELO CAIXA: cada plano recebe params.cashCap (Rollover de
//    agora − o que falta apostar hoje + entradas previstas por dia, × peso)
//    — nenhum dia aposta dinheiro que ainda não entrou. Prévia de plano
//    salvo SEM alteração não recebe o teto (mostra o salvo como está).
//    Gráfico: barra de HOJE (plano salvo) antes dos dias do plano.
// k) (29) AVISO "Rollover mudou": compara o PLANEJADO salvo (amanhã em
//    diante) com o PLANEJADO refeito agora (os dois com o teto pelo caixa)
//    — antes comparava com a META, que com o teto nunca bate e deixava o
//    aviso preso. FOTO do plano (doc.snap: Rollover, entradas previstas,
//    falta hoje, peso, quando) gravada ao salvar; o 🔄 mostra "🔎 Por que
//    mudou" separando apostado desde então, depósitos/bônus/ajustes,
//    entradas previstas e falta hoje.
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
  planUpdateDiff, isSignificantChange, plannedAfterC, planDayOf, overlaySavedDays, projectRolloverPath
} from './plan-logic.js';
import { activeStop } from './stop-reasons.js'; // (32)
import { getPlatformSpeed, dayBoostsFor, formatMult } from './speed-logic.js';
import { openSpeedEditor } from './ui-speed.js';
import { computeCash, CASH_PERIODS, weeklyRoutinePlatformIds } from './newplatform-logic.js';
import { openNewPlatformEditor } from './ui-new-platform.js';
import { predictCycle, describePrediction, offCycleKeys, cycleState, nearMonthTurn } from './cycle-history-logic.js';
import { openCycleRebuildAll, openCycleTableImport } from './ui-cycle-history.js';
import {
  loadPlannerData, isPlannerLoaded, getSavedPlan, getSavedPlanIds, getPalette,
  getInvalidPlanCount, savePlan, deletePlan, savePalette,
  getPlannerSettings, savePlannerSettings, getStrategySettings, getCalendarSettings, getSavedPlans,
  getStrategyPriority, getSpeedConfig, getNewPlatformsConfig, saveStrategySettings,
  saveGroupPlans, deleteGroupPlans, savePlansBatch, stopTodayOnly
} from './plan-store.js';
import { loadRoutineData, isRoutinesLoaded, getRoutines, getMarks } from './routine-store.js';
import { forbiddenBetDays, routineBetDays, betRoutinesFor, ROUTINE_HISTORY_DAYS, depositRoutineInflows, isPlanGroup, listOpenDeferrals } from './routine-logic.js';
import { buildMisteriosoStrategy, projectMisteriosoInflows } from './strategy-logic.js';
import { computeAdherence, realWageredC, realRBC } from './calendar-logic.js';
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
    targetBase: form.targetBase,
    // (28)
    cashCap: individualCashCap()
  };
}

// (28) Teto pelo caixa da plataforma do formulário.
function individualCashCap() {
  const platform = findPlatform(form.platformId);
  if (!platform || !world || world.rolloverC === null || !form.startKey || !form.endKey) return null;
  return cashCapFor(platform, world.rolloverC, form.startKey, memberInflows(platform, form.endKey), speedBase()); // sem o depósito só "sugerido"
}

// (28) { startC, inflows } em centavos × peso. Começa amanhã ou depois:
// desconta o que ainda falta apostar HOJE do plano salvo — a não ser que o
// resto de hoje NÃO vá ser apostado (🔄 com "Descontar" desligado / ⏭ Parar
// hoje): aí ele volta pro caixa dos próximos dias.
function cashCapFor(platform, rolloverC, startKey, inflows, speed = 1, subtractToday = true) {
  if (!platform || rolloverC === null || rolloverC === undefined) return null;
  const t = todayKey();
  const left = subtractToday && startKey > t ? todayLeftC(getSavedPlan(platform.id), platform, t) : 0;
  const k = Number(speed) > 0 ? Number(speed) : 1;
  return {
    startC: Math.max(0, Math.round((rolloverC - left) * k)),
    inflows: (inflows || []).filter(x => x && x.valueC > 0).map(x => ({ key: x.key, valueC: Math.round(x.valueC * k) }))
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
  out.pauseKeys = betPauseKeys(platform, startKey, endKey, todayKey()); // (11c → 27)
  out.skipKeys = emissionKeysInRange(platform, startKey, endKey, form.skipEmissions);
  out.dayBoost = dayBoostsFor(getSpeedConfig(), platform.id, startKey, endKey);
  return out;
}

// (27) Dias em que o plano NÃO aposta por causa do ciclo: só a instável
// perto da virada do mês. Ciclo encerrado continua apostando (o depósito
// é que fica pausado nas rotinas).
function betPauseKeys(platform, startKey, endKey, today) {
  if (!platform || cycleState(platform) !== 'unstable') return [];
  return offCycleKeys(platform, startKey, endKey, today).filter(k => nearMonthTurn(k));
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
      <section id="planOverview" class="card-shell graficos-section plan-ov" aria-label="Painel do Rollover"></section>
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
        <p id="planUnsaved" class="plan-unsaved app-hidden">👁️ Prévia não salva — o Calendário segue o plano salvo até você salvar.</p>
        <div id="planSavedToday" class="plan-saved-today app-hidden"></div>
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
  const deferred = isRoutinesLoaded(state.currentUid) ? listOpenDeferrals(routines, state.platforms, todayKey(), getMarks) : []; // (27)
  const c = computeCash({ platforms: state.platforms, routines, strategy, betLimitReais: betLimit, newConfig: getNewPlatformsConfig(), period: cashPeriod, now, deferred });
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

  // (27) ⏭ depósitos adiados
  if (c.deferred && (c.deferred.rows.length || c.deferred.waiting.length)) {
    const dx = el('div', 'cash-np');
    c.deferred.rows.forEach(df => dx.appendChild(el('span', 'cash-sub', `${df.platformName} · ${df.name} · adiado de ${fmtShort(df.fromKey)} · ${money(df.valueC)}`)));
    if (c.deferred.waiting.length) dx.appendChild(el('span', 'cash-sub', `⏸ Aguardando o ciclo voltar (fora do total): ${c.deferred.waiting.map(df => `${df.platformName} ${money(df.valueC)}`).join(', ')}`));
    row('⏭', 'Depósitos adiados', c.deferred.totalC, 'Adiados que ainda não foram depositados (quitados com o próximo depósito do tipo).', dx);
  }

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
  ht.appendChild(el('p', '', 'Ciclo encerrado: o plano continua apostando; as rotinas de depósito ficam ⏸ pausadas até a volta (dá pra depositar mesmo assim na aba Rotinas ou no Calendário).'));
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
  // (29) 📥 Colar tabela de ciclos (datas de ciclos anteriores)
  const tb = el('button', 'bet-manage-btn', '📥 Colar tabela de ciclos');
  tb.type = 'button';
  tb.addEventListener('click', async () => {
    tb.disabled = true;
    try {
      const r = await openCycleTableImport();
      if (r.changed && mounted) { renderCycles(); syncInputs(); renderPlatformInfo(); schedulePreview(0); refreshAlert(); }
    } finally {
      tb.disabled = false;
    }
  });
  actions.appendChild(tb);
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

// (27) 👁️ Prévia não salva + 📌 Hoje no plano salvo.
function savedTodayDay(pid, t) {
  const sp = getSavedPlan(pid);
  const d = planDayOf(sp, t);
  if (d) return d;
  const log = isPlanLogLoaded(state.currentUid) ? getPlanLogEntry(t, pid) : null;
  return log && log.ignored !== true ? log : null;
}

function renderSavedToday(dirty) {
  const ban = $('planUnsaved');
  const box = $('planSavedToday');
  if (!ban || !box) return;
  const t = todayKey();
  box.replaceChildren();
  let ids = [];
  if (isGroupMode()) ids = savedGroupIds(currentGroup());
  else if (form.platformId && getSavedPlan(form.platformId)) ids = [form.platformId];
  ban.classList.toggle('app-hidden', !(dirty && ids.length));
  if (!ids.length) { box.classList.add('app-hidden'); return; }
  const rows = ids.map(id => {
    const p = findPlatform(id);
    const d = savedTodayDay(id, t);
    return { id, name: p ? p.name : id, day: d, real: p ? realWageredC(p, t) : 0 };
  });
  const withBet = rows.filter(r => r.day && Number(r.day.plannedC) > 0);
  const totalC = withBet.reduce((s2, r) => s2 + Math.round(Number(r.day.plannedC) || 0), 0);
  const realC = withBet.reduce((s2, r) => s2 + r.real, 0);
  box.classList.remove('app-hidden');
  if (!withBet.length) {
    box.appendChild(el('p', 'plan-saved-today-head', `📌 Hoje (${fmtShort(t)}) no plano salvo: sem aposta.`));
    return;
  }
  box.appendChild(el('p', 'plan-saved-today-head', `📌 Hoje (${fmtShort(t)}) no plano salvo: ${formatCurrency(fromCents(totalC))} · apostado ${formatCurrency(fromCents(realC))}`));
  withBet.forEach(r => {
    const line = el('div', 'plan-saved-today-row');
    line.appendChild(el('span', 'plan-saved-today-name', isGroupMode() ? r.name : 'Apostas'));
    const lines = Array.isArray(r.day.lines) && r.day.lines.length ? describeLines(r.day.lines) : '';
    line.appendChild(el('span', 'plan-saved-today-val', `${formatCurrency(fromCents(r.real))} de ${formatCurrency(fromCents(Math.round(Number(r.day.plannedC) || 0)))}${lines ? ` · ${lines}` : ''}`));
    box.appendChild(line);
  });
}

function renderActions(plan) {
  if (isGroupMode()) { renderGroupActions(); return; }
  syncTabState();
  {
    const sp0 = form.platformId ? getSavedPlan(form.platformId) : null;
    renderSavedToday(!!sp0 && !sameParams(sp0.params, currentParams()));
  }
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
  let plan = buildPlan(unchangedSaved ? { ...params, cashCap: null } : params, unchangedSaved ? null : todayKey()); // (28)
  // (32) salvo e sem alteração: os dias que o 🏁 mudou (só no documento)
  // entram por cima — o Planejador mostra o mesmo que o Calendário.
  if (unchangedSaved) plan = overlaySavedDays(plan, savedPlan);
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
  const leftToday = plan.days.length && plan.days[0].key > todayKey() ? todayLeftC(getSavedPlan(platform.id), platform) : 0; // (28)
  const proj = computePlanProjections(plan.days, {
    startRolloverC: world && world.rolloverC !== null ? Math.max(0, world.rolloverC - leftToday) : null,
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
    if (t.cashShortC > 0) kpis.appendChild(kpi('🔒 Fora do caixa', formatCurrency(fromCents(t.cashShortC)), 'da meta não cabe no período', 'cal-kpi-bad')); // (28)
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
    if (plan.overlaidDays) notes.push(`🏁 ${plan.overlaidDays} dia(s) com o resto de um dia encerrado somado (Calendário → 🏁 Encerrar o dia).`);
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
    const rPath = rolloverPathFor(platform, { planDays: plan.days }); // (35) botão R
    const list = showAllDays ? plan.days : plan.days.slice(0, DAYS_COLLAPSED);
    list.forEach(d => {
      const row = el('div', `plan-day plan-day-${d.tier}`);
      const head = el('div', 'plan-day-head');
      head.appendChild(el('span', 'plan-day-date', fmtDay(d.key)));
      head.appendChild(el('span', `plan-tier plan-tier-${d.tier}`, TIER_LABEL[d.tier]));
      if (vipByDay.has(d.key)) head.appendChild(el('span', 'plan-tier plan-tier-vip', `V${vipByDay.get(d.key)}`));
      head.appendChild(el('span', 'plan-day-amount', formatCurrency(fromCents(d.plannedC))));
      head.appendChild(rButton(row, platform, rPath, d, speedBase())); // (35)
      row.appendChild(head);
      row.appendChild(el('div', 'plan-day-lines', d.capped ? `${d.plannedC > 0 ? `${describeLines(d.lines)} · ` : ''}🔒 limitado pelo caixa${d.plannedC > 0 ? '' : ' — aguardando a próxima entrada'}` : describeLines(d.lines)));
      if (openR.has(rKey(platform.id, d.key))) row.appendChild(rDetail(platform, rPath, d, speedBase()));
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

// (28) Barra de HOJE (plano salvo) quando o plano começa depois de hoje.
let chartOffset = 0;
const TODAY_BAR_COLOR = '#cbd5e1';

function renderChart(plan, proj) {
  const canvas = $('planChart');
  if (!canvas || !window.Chart) return;
  const t = todayKey();
  const sv = form.platformId ? savedTodayDay(form.platformId, t) : null;
  const pre = sv && Number(sv.plannedC) > 0 && plan.days.length && plan.days[0].key > t ? 1 : 0;
  chartOffset = pre;
  const labels = [...(pre ? ['Hoje'] : []), ...plan.days.map(d => fmtShort(d.key))];
  const bars = [...(pre ? [fromCents(Math.round(Number(sv.plannedC)))] : []), ...plan.days.map(d => fromCents(d.plannedC))];
  const colors = [...(pre ? [TODAY_BAR_COLOR] : []), ...plan.days.map(d => TIER_COLOR[d.tier])];
  const vipKeys = new Set(proj.vipReach.map(r => r.key));
  const borders = [...(pre ? ['rgba(0,0,0,0)'] : []), ...plan.days.map(d => (vipKeys.has(d.key) ? '#f59e0b' : 'rgba(0,0,0,0)'))];
  const borderWidths = [...(pre ? [0] : []), ...plan.days.map(d => (vipKeys.has(d.key) ? 3 : 0))];
  const hasRollover = proj.rollover.length === plan.days.length;
  const line = hasRollover ? [...(pre && world && world.rolloverC !== null ? [fromCents(world.rolloverC)] : (pre ? [null] : [])), ...proj.rollover.map(fromCents)] : [];

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
              const idx = items[0].dataIndex - chartOffset;
              if (idx < 0) return ['Hoje — plano salvo (o Calendário segue este)'];
              const d = lastPlan && lastPlan.plan.days[idx];
              return d ? [TIER_LABEL[d.tier], d.capped ? `${describeLines(d.lines) || 'R$ 0'} · 🔒 limitado pelo caixa` : describeLines(d.lines)] : [];
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
  // (35) name: de onde vem a entrada (botão R / painel)
  const items = depositRoutineInflows(routines, p, t, endKey).items.map(x => ({ key: x.key, valueC: x.valueC, name: `💰 ${x.name || 'Depósito de rotina'}` }));
  let tpl = null;
  if (contextConfirmed) { try { tpl = (resolveCtx(p) || {}).misteriosoTemplate || null; } catch (err) { tpl = null; } }
  if (tpl && !p.cycleEnded) {
    try { return [...items, ...projectMisteriosoInflows(p, tpl, items, endKey, new Date()).map(x => ({ ...x, name: '🃏 Bônus do Misterioso' }))]; } catch (err) { return items; }
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
    onlyIds: null,
    noCap: false
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
    // (29b) quem encerra hoje (resto pra frente) não desconta nada.
    const rawLeftC = cfg.deductToday || cfg.keepToday === true || cfg.stopIds ? todayLeftC(getSavedPlan(p.id), p, t) : 0;
    const closing = cfg.keepToday === true || !!(cfg.stopIds && cfg.stopIds.has(p.id));
    const leftC = cfg.deductToday && !closing ? rawLeftC : 0;
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
      todayRawC: rawLeftC, // (29b)
      todayClosing: closing,
      cashCap: cfg.noCap || !valid ? null : cashCapFor(p, rolloverC, cfg.startKey, inflows, base, !closing), // (28) (29b)
      excludeKeys: valid ? forbiddenBetDays(routines, p, cfg.startKey, cfg.endKey) : [],
      skipEmissions: cfg.skipEmissions.slice(),
      skipKeys: valid ? emissionKeysInRange(p, cfg.startKey, cfg.endKey, cfg.skipEmissions) : [],
      pauseKeys: valid ? betPauseKeys(p, cfg.startKey, cfg.endKey, t) : [],
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
  const unchanged = formSnap !== null && snapForm() === formSnap && savedGroupIds(g).length > 0;
  const members = groupMembers(g, { ...formGroupCfg(), noCap: unchanged }); // (28) salvo sem alteração: sem teto
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
        const mp = findPlatform(m.platformId);
        const rPath = mp ? rolloverPathFor(mp, { planDays: m.plan.days }) : null; // (35) botão R
        m.plan.days.forEach(d => {
          const dr = el('div', `plan-day plan-day-${d.tier}`);
          const dh = el('div', 'plan-day-head');
          dh.appendChild(el('span', 'plan-day-date', fmtDay(d.key)));
          dh.appendChild(el('span', `plan-tier plan-tier-${d.tier}`, TIER_LABEL[d.tier]));
          dh.appendChild(el('span', 'plan-day-amount', formatCurrency(fromCents(d.plannedC))));
          if (mp) dh.appendChild(rButton(dr, mp, rPath, d, members[i].speed)); // (35)
          dr.appendChild(dh);
          dr.appendChild(el('div', 'plan-day-lines', d.capped ? `${d.plannedC > 0 ? `${describeLines(d.lines)} · ` : ''}🔒 limitado pelo caixa${d.plannedC > 0 ? '' : ' — aguardando a próxima entrada'}` : describeLines(d.lines)));
          if (mp && openR.has(rKey(mp.id, d.key))) dr.appendChild(rDetail(mp, rPath, d, members[i].speed));
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
      ? (form.groupBase === 'projected' && member.inflowC > 0 // (35) Projetado: as entradas previstas entram na meta
        ? `Meta = Rollover ${formatCurrency(fromCents(roll))} + entradas previstas ${formatCurrency(fromCents(Math.round(member.inflowC * member.speed)))} = ${formatCurrency(member.target)}${member.speed !== 1 ? ' (com o peso ⚡)' : ''}. Toque em R num dia pra ver o caixa dele.`
        : `Meta = Rollover ${formatCurrency(fromCents(roll))}${member.speed !== 1 ? ' (com o peso ⚡)' : ''}.`)
      : (member.reserve.mode === 'all'
        ? `Guarda o Rollover inteiro (${formatCurrency(fromCents(member.reservedC))}); a meta cobre só os depósitos de ativação previstos: ${formatCurrency(member.target)}.`
        : `Guarda ${formatCurrency(fromCents(member.reservedC))} de ${formatCurrency(fromCents(roll))}; meta ${formatCurrency(member.target)}.`))));
  if (member.todayLeftC > 0) box.appendChild(el('p', 'plan-hint', `↻ Descontou ${formatCurrency(fromCents(member.todayLeftC))} que ainda falta apostar hoje.`)); // (24)
  return box;
}

let groupChartOffset = 0; // (28)

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
  // (28) Plano começa depois de hoje: desconta o que falta apostar hoje.
  const t = todayKey();
  const startsLater = keys.length && keys[0] > t;
  let hasLine = false;
  const line = keys.map(() => 0);
  let rollNow = 0;
  okMembers.forEach(m => {
    const src = srcById.get(m.platformId);
    if (!src || src.rolloverC === null) return;
    hasLine = true;
    rollNow += src.rolloverC;
    const left = startsLater ? todayLeftC(getSavedPlan(m.platformId), findPlatform(m.platformId), t) : 0;
    const start = Math.max(0, src.rolloverC - left);
    const proj = computePlanProjections(m.plan.days, { startRolloverC: start, inflows: src.inflows || [] });
    const byKey = new Map(m.plan.days.map((d, idx) => [d.key, proj.rollover[idx]]));
    let last = start + (src.inflows || []).filter(x => keys.length && x.key < keys[0]).reduce((s2, x) => s2 + x.valueC, 0);
    keys.forEach((k, idx) => {
      if (byKey.has(k)) last = byKey.get(k);
      line[idx] += Math.max(0, last);
    });
  });
  // (28) Barra de HOJE (plano salvo do grupo) antes do 1º dia.
  const g0 = currentGroup();
  const todaySavedC = startsLater && g0 ? savedGroupIds(g0).reduce((s2, id) => { const d = savedTodayDay(id, t); return s2 + (d ? Math.round(Number(d.plannedC) || 0) : 0); }, 0) : 0;
  const pre = todaySavedC > 0 ? 1 : 0;
  groupChartOffset = pre;
  if (pre) {
    labels.unshift('Hoje');
    datasets.forEach(ds => { ds.data.unshift(0); ds.borderColor.unshift('rgba(0,0,0,0)'); ds.borderWidth.unshift(0); });
    datasets.unshift({ type: 'bar', label: 'Hoje (plano salvo)', data: [fromCents(todaySavedC), ...keys.map(() => 0)], backgroundColor: TODAY_BAR_COLOR, stack: 'grupo', yAxisID: 'y', order: 2 });
    line.unshift(rollNow);
  }
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
        const idx = items[0].dataIndex - groupChartOffset;
        if (idx < 0) return ['Hoje — plano salvo (o Calendário segue este)'];
        const d = lastGroup && lastGroup.res.days[idx];
        if (!d) return [];
        return [`Total do dia: ${formatCurrency(fromCents(d.plannedC))} · ${d.platforms} plataforma(s)${idx === maxIdx ? ' · 🔝 dia mais alto' : ''}`];
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
  renderSavedToday(formSnap !== null && snapForm() !== formSnap); // (27)
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
      docs.push(withSnap(planToDoc(p, m.params, m.plan, nowIso), p)); // (29) foto
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
    const result = await savePlan(state.currentUid, withSnap(planToDoc(target, params, plan, new Date().toISOString()), target), { ignorePast }); // (29) foto
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
  const day = todayPlanDay(saved, platform, t);
  if (!day || activeStop(day)) return 0; // (29) 🏁 dia encerrado: nada mais a apostar hoje (32: desfeito volta a cobrar)
  return Math.max(0, Math.round(Number(day.plannedC) || 0) - realWageredC(platform, t));
}

// (29b) Dia de HOJE: do plano salvo ou, se ele já foi refeito a partir de
// amanhã, do histórico (planLog).
function todayPlanDay(saved, platform, t = todayKey()) {
  if (!platform) return null;
  const log = isPlanLogLoaded(state.currentUid) ? getPlanLogEntry(t, platform.id) : null;
  if (activeStop(log)) return log; // 🏁 vale mesmo com o plano ainda tendo hoje
  return planDayOf(saved, t) || log;
}

// (29b) O resto de hoje desta plataforma NÃO vai ser apostado (vai pros
// próximos dias e hoje fica 🏁): "Descontar" desligado ou 🏁 dela.
function closesToday(opts, pid) {
  return opts.deductToday === false || !!(opts.stopIds && opts.stopIds.has(pid));
}

// (29b) 🏁 gravado no histórico de hoje quando o resto vai pra frente.
function buildStopFor(platform, saved, reason, nowIso) {
  const t = todayKey();
  const day = todayPlanDay(saved, platform, t);
  return {
    at: nowIso,
    reason,
    rbC: realRBC(platform, t),
    wageredC: realWageredC(platform, t),
    plannedC: day ? Math.max(0, Math.round(Number(day.plannedC) || 0)) : 0
  };
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
    pauseKeys: betPauseKeys(platform, startKey, endKey, todayKey()),
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

// ---------- (29) foto do plano + 🔎 Por que mudou ----------

function sumSince(list, field, atIso) {
  const at = new Date(atIso).getTime();
  if (!Number.isFinite(at)) return 0;
  return (Array.isArray(list) ? list : []).reduce((sum, e) => {
    const t2 = new Date(e && e.date).getTime();
    return Number.isFinite(t2) && t2 > at ? sum + toCents(Number(e[field]) || 0) : sum;
  }, 0);
}

// Foto do momento em que o plano é salvo (fica no documento, fora dos
// parâmetros — não entra no "alterado").
function buildSnap(platform, endKey, over = {}) {
  if (!platform) return null;
  const t = todayKey();
  const roll = platformRolloverC(platform);
  return {
    at: new Date().toISOString(),
    day: t,
    rolloverC: roll,
    inflowC: endKey ? memberInflows(platform, endKey).reduce((s2, x) => s2 + x.valueC, 0) : 0,
    todayLeftC: Number.isFinite(over.todayLeftC) ? over.todayLeftC : todayLeftC(getSavedPlan(platform.id), platform, t),
    speed: getPlatformSpeed(getSpeedConfig(), platform.id).base
  };
}

function withSnap(doc, platform, over = {}) {
  const snap = buildSnap(platform, doc && doc.params ? doc.params.endKey : null, over);
  return snap ? { ...doc, snap } : doc;
}

/**
 * O que mudou desde que o plano foi salvo (centavos). null = plano sem foto.
 * { rollBefore, rollNow, wageredSince, depositSince, otherC, inflowBefore,
 *   inflowNow, leftBefore, leftNow, speedBefore, speedNow, sameDay, at }
 */
function explainChange(saved, platform, opts = {}) {
  const snap = saved && saved.snap;
  if (!snap || !platform || typeof snap.at !== 'string') return null;
  const t = todayKey();
  const rollNow = platformRolloverC(platform);
  const endKey = saved.params && saved.params.endKey;
  const wageredSince = sumSince(platform.betEntries, 'wagered', snap.at);
  const depositSince = sumSince(platform.depositLog, 'value', snap.at);
  const rollBefore = Number.isFinite(snap.rolloverC) ? snap.rolloverC : null;
  return {
    at: snap.at,
    sameDay: snap.day === t,
    rollBefore,
    rollNow,
    wageredSince,
    depositSince,
    // Rollover que mudou por outra coisa que não as apostas (depósitos,
    // bônus, abatimentos/ajustes).
    otherC: rollBefore !== null && rollNow !== null ? (rollNow - rollBefore) + wageredSince : null,
    inflowBefore: Math.round(Number(snap.inflowC) || 0),
    inflowNow: endKey ? memberInflows(platform, endKey).reduce((s2, x) => s2 + x.valueC, 0) : 0,
    leftBefore: snap.day === t ? Math.round(Number(snap.todayLeftC) || 0) : null,
    leftNow: todayLeftC(saved, platform, t),
    deducting: opts.deductToday !== false,
    speedBefore: Number(snap.speed) || 1,
    speedNow: getPlatformSpeed(getSpeedConfig(), platform.id).base
  };
}

// Soma as explicações das plataformas de um grupo.
function sumWhy(list) {
  if (!list.length) return null;
  const add = (k) => list.reduce((s2, w) => s2 + (Number(w[k]) || 0), 0);
  const allRoll = list.every(w => w.rollBefore !== null && w.rollNow !== null);
  return {
    group: true,
    count: list.length,
    at: list.map(w => w.at).sort()[0],
    sameDay: list.every(w => w.sameDay),
    rollBefore: allRoll ? add('rollBefore') : null,
    rollNow: allRoll ? add('rollNow') : null,
    wageredSince: add('wageredSince'),
    depositSince: add('depositSince'),
    otherC: allRoll ? add('otherC') : null,
    inflowBefore: add('inflowBefore'),
    inflowNow: add('inflowNow'),
    leftBefore: list.every(w => w.leftBefore !== null) ? add('leftBefore') : null,
    leftNow: add('leftNow'),
    deducting: list[0].deducting,
    speedBefore: 1,
    speedNow: 1
  };
}

// Linhas legíveis do 🔎 (só o que mudou).
function describeWhy(w) {
  if (!w) return ['Sem a foto de quando foi salvo (plano anterior à Sub 29) — a partir do próximo salvamento aparece aqui o que mudou.'];
  const m = (c) => moneyC(c);
  const out = [];
  const when = new Date(w.at);
  out.push(`Salvo em ${isNaN(when.getTime()) ? '—' : `${String(when.getDate()).padStart(2, '0')}/${String(when.getMonth() + 1).padStart(2, '0')} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`}${w.group ? ` · ${w.count} plataforma(s)` : ''}.`);
  if (w.rollBefore !== null && w.rollNow !== null && w.rollNow !== w.rollBefore) {
    const parts = [];
    if (w.wageredSince) parts.push(`−${m(w.wageredSince)} apostados desde então`);
    if (w.otherC) parts.push(`${w.otherC > 0 ? '+' : '−'}${m(Math.abs(w.otherC))} de depósitos/bônus/ajustes${w.depositSince ? ` (depósitos: ${m(w.depositSince)})` : ''}`);
    out.push(`Rollover ${m(w.rollBefore)} → ${m(w.rollNow)}${parts.length ? ` (${parts.join('; ')})` : ''}.`);
  }
  if (w.inflowNow !== w.inflowBefore) out.push(`Entradas previstas ${m(w.inflowBefore)} → ${m(w.inflowNow)} (depósitos de rotina / bônus do Misterioso até o fim do plano).`);
  if (w.leftBefore !== null && w.leftNow !== w.leftBefore) out.push(`Falta apostar hoje ${m(w.leftBefore)} → ${m(w.leftNow)}${w.deducting ? '' : ' (não descontado)'}.`);
  else if (w.leftNow > 0) out.push(`Falta apostar hoje ${m(w.leftNow)}${w.deducting ? ' — descontado da meta. Se você já parou por hoje, use 🏁 Encerrar o dia no Calendário: o resto vai pros próximos dias dela.' : ' — vai pros próximos dias.'}`);
  if (!w.group && w.speedNow !== w.speedBefore) out.push(`Peso ⚡ ${formatMult(w.speedBefore)} → ${formatMult(w.speedNow)}.`);
  if (!w.sameDay) out.push('O plano foi salvo em outro dia: os dias que já passaram saem da conta e a curva recomeça amanhã.');
  if (out.length === 1) out.push('Nada mudou no caixa — a diferença vem só do arredondamento dos giros.');
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
  const closing = closesToday(opts, p.id); // (29b)
  row.todayDedC = closing ? 0 : row.todayLeftC;
  row.todayKeepC = closing ? row.todayLeftC : 0;
  row.speed = getPlatformSpeed(getSpeedConfig(), p.id).base;
  row.rolloverC = platformRolloverC(p);
  if (row.rolloverC === null) return { ...row, error: 'Rollover indisponível (configurações de bônus não carregadas).' };
  const baseC = Math.round(autoBaseC(p, sp.endKey, row.projected) * row.speed);
  const res = applyReserve(baseC, sp.reserve, activationC(p, sp.endKey), row.projected);
  row.autoTargetC = Math.max(0, res.targetC - row.todayDedC);
  row.autoReservedC = res.reservedC;
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
    ...platformDayKeys(p, sp, tomorrow, sp.endKey),
    cashCap: cashCapFor(p, row.rolloverC, tomorrow, memberInflows(p, sp.endKey), row.speed, !closing) // (28) (29b)
  };
  const plan = buildPlan(params, t);
  if (!plan.ok) return { ...row, significant: false, error: plan.error, why: explainChange(saved, p, opts) };
  const diff = planUpdateDiff(saved, plan, t);
  // (29) planejado × planejado (os dois com o teto pelo caixa)
  return { ...row, params, plan, afterC: diff.afterC, deltaC: diff.deltaC, significant: diff.significant, why: explainChange(saved, p, opts), days: plan.totals.activeDays, firstKey: plan.days[0].key, lastKey: plan.days[plan.days.length - 1].key };
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
    startKey: tomorrow, endKey: sp.endKey, memberCount: ids.length, memberIds: ids, todayLeftC: 0, significant: false, members: []
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
    deductToday: true,
    onlyIds: new Set(ids),
    noCap: false,
    keepToday: opts.deductToday === false, // (28) resto de hoje não vai ser apostado
    stopIds: opts.stopIds || null // (29b) 🏁 só destas
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
  row.todayLeftC = members.reduce((s2, m) => s2 + (m.todayRawC || 0), 0);
  row.todayDedC = members.reduce((s2, m) => s2 + (m.todayLeftC || 0), 0); // (29b)
  row.todayKeepC = members.reduce((s2, m) => s2 + (m.todayClosing ? (m.todayRawC || 0) : 0), 0);
  row.autoTargetC = members.reduce((s2, m) => s2 + toCents(m.target), 0);
  row.reservedAfterC = members.reduce((s2, m) => s2 + (m.reservedC || 0), 0);
  row.why = sumWhy(saved.map(x => explainChange(x, findPlatform(x.platformId), opts)).filter(Boolean)); // (29)
  row.members = res.members.map((m, i) => {
    const sv = getSavedPlan(m.platformId);
    let err = m.plan ? null : (m.error || 'Sem plano');
    if (!m.plan && members[i] && !(members[i].target > 0)) {
      err = members[i].rolloverC === null ? 'Rollover indisponível.'
        : (members[i].reservedC > 0 ? '🔒 Todo o Rollover ficou guardado — nada a apostar.'
          : (members[i].todayLeftC > 0 ? 'Sem Rollover depois de descontar o que falta hoje — nada a apostar.' : 'Sem Rollover — nada a apostar.'));
    }
    return { platformId: m.platformId, name: m.name, beforeC: plannedAfterC(sv, t), afterC: m.plan ? m.plan.totals.plannedC : 0, error: err, why: explainChange(sv, findPlatform(m.platformId), opts) };
  });
  if (!res.ok) return { ...row, significant: false, error: `${res.error || 'Nenhuma plataforma do grupo conseguiu montar o plano.'} Toque em "plataformas" pra ver o motivo.` };
  row.res = res;
  // (29b) quem "fica como está" conta igual dos dois lados (sem ⚠️ falso)
  const stayC = row.members.filter(m => m.error).reduce((s2, m) => s2 + (m.beforeC || 0), 0);
  row.afterC = res.totals.plannedC + stayC;
  row.deltaC = row.afterC - row.beforeC;
  row.significant = isSignificantChange(row.beforeC, row.afterC); // (29) planejado × planejado
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
  renderOverview(); // (35)
}

// (26) opts.onlyPlatformId: "⏭ Parar hoje" do Calendário — sem desconto de
// hoje e só a linha dessa plataforma (ou do grupo dela) marcada.
function openUpdatePlans(opts = {}) {
  if (busy || loadStatus !== 'ok') return;
  if (updateClose) updateClose();
  const only = opts.onlyPlatformId || null;
  const stopInfo = opts.stopInfo && opts.stopInfo.platformId === only ? opts.stopInfo : null; // (29) 🏁
  // (29b) "Descontar" sempre começa ligado; a plataforma do 🏁 é a única
  // que manda o resto pra frente. Desligar = parei por hoje em todas.
  const st = { deductToday: true, stopIds: new Set(stopInfo ? [stopInfo.platformId] : []), choices: new Map(), checked: new Set(), openGroups: new Set(), rows: [], saving: false };
  // (29b) linha com erro ainda pode ser marcada quando tem resto de hoje
  // pra encerrar (🏁): o plano fica como está, só hoje é encerrado.
  const canPick = (r) => !r.error || r.todayKeepC > 0;
  const recompute = (first = false) => {
    st.rows = buildUpdateRows({ deductToday: st.deductToday, stopIds: st.stopIds, choices: st.choices });
    if (first && only) {
      const gref = (getSavedPlan(only) || {}).params && getSavedPlan(only).params.group;
      const key = gref ? `g:${gref.routineId}` : `p:${only}`;
      st.rows.forEach(r => { if (canPick(r) && (r.key === key || (r.kind === 'plan' && r.id === only))) st.checked.add(r.key); });
    } // (32) D1: nada vem marcado sozinho — o usuário marca (ou "Marcar os ⚠️")
    st.rows.forEach(r => { if (!canPick(r)) st.checked.delete(r.key); });
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
    if (stopInfo) {
      const pn = findPlatform(stopInfo.platformId);
      box.appendChild(el('p', 'plan-unsaved', `🏁 Encerrando o dia de ${pn ? pn.name : ''}: o que faltava apostar hoje vai pros próximos dias e hoje conta como cumprido. Confirme abaixo.`));
    }
    box.appendChild(el('p', 'plan-hint', `Refaz os planos a partir de amanhã (${fmtDay(tomorrow)}) com o Rollover de agora. Curva, dias, limites e valores de cada plano não mudam. Hoje continua com a meta de hoje — ela fica guardada no histórico, junto com os dias que já passaram.`));

    const tools = el('div', 'pu-tools');
    // (32) D2: sem a caixa "Descontar" — o que falta apostar hoje é sempre
    // descontado; quem parou usa o 🏁 Encerrar o dia (Calendário).
    tools.appendChild(el('p', 'plan-hint pu-deduct-hint', 'O que ainda falta apostar hoje é descontado (você ainda vai apostar). Parou por hoje numa plataforma? Use 🏁 Encerrar o dia no Calendário — o resto vai pros próximos dias dela.'));
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

    const chosen = st.rows.filter(r => st.checked.has(r.key) && canPick(r));
    const sumAfter = chosen.reduce((s2, r) => s2 + (r.error ? (r.beforeC || 0) : (r.afterC || 0)), 0);
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
    cb.disabled = !canPick(r) || st.saving;
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
      todayLines(r, line);
      card.appendChild(nums);
      card.appendChild(el('p', 'pu-err', r.error));
      if (r.todayKeepC > 0) card.appendChild(el('p', 'plan-hint', '🏁 Marcada: o plano fica como está e só o dia de hoje é encerrado.'));
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
    todayLines(r, line);
    line('📅 Período', `${fmtShort(r.firstKey)} a ${fmtShort(r.lastKey)} · ${r.days} dia(s)`);
    card.appendChild(nums);
    // (29) 🔎 Por que mudou
    if (r.deltaC !== 0 || r.significant) {
      const det = el('details', 'pu-why');
      det.appendChild(el('summary', '', '🔎 Por que mudou'));
      describeWhy(r.why).forEach(tx => det.appendChild(el('p', 'pu-why-line', tx)));
      card.appendChild(det);
    }

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
        : `Rollover: ${moneyC(r.rolloverC)}${r.speed && r.speed !== 1 ? ` × ${formatMult(r.speed)}` : ''} − 🔒 ${moneyC(r.reservedAfterC)}${r.todayDedC ? ` − ${moneyC(r.todayDedC)} de hoje` : ''}.`));
    }

    if (r.kind === 'group' && r.members.length) card.appendChild(membersBlock(r));
    return card;
  };

  // (29b) Resto de hoje: descontado (ainda vai apostar) × pra frente (🏁).
  const todayLines = (r, line) => {
    if (r.todayDedC > 0) line('⏳ Falta apostar hoje', `${moneyC(r.todayDedC)} · descontado`);
    if (r.todayKeepC > 0) line('🏁 Resto de hoje', `${moneyC(r.todayKeepC)} · vai pros próximos dias`);
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
    const chosen = st.rows.filter(r => st.checked.has(r.key) && canPick(r));
    if (!chosen.length) return;
    const nowIso = new Date().toISOString();
    const t = todayKey();
    const docs = [];
    // (29b) 🏁 de hoje: a plataforma do 🏁 do Calendário e, com "Descontar"
    // desligado, toda plataforma que ainda tinha resto hoje.
    const stopFor = {};
    let keepSumC = 0;
    const addDoc = (p, params, plan) => {
      const saved = getSavedPlan(p.id);
      const left = todayLeftC(saved, p, t);
      const closing = closesToday(st, p.id);
      if (stopInfo && stopInfo.platformId === p.id) stopFor[p.id] = stopInfo.stop;
      else if (closing && left > 0) stopFor[p.id] = buildStopFor(p, saved, 'adiado', nowIso);
      if (stopFor[p.id]) keepSumC += left;
      if (plan) docs.push(withSnap(planToDoc(p, params, plan, nowIso), p, stopFor[p.id] ? { todayLeftC: 0 } : {})); // (29) foto
    };
    let stayCount = 0;
    for (const r of chosen) {
      if (r.error) {
        // (29b) plano fica como está: só encerra hoje
        const ids2 = r.kind === 'plan' ? [r.id] : (r.memberIds || []);
        ids2.forEach(pid => { const p = findPlatform(pid); if (p) addDoc(p, null, null); });
        stayCount++;
        continue;
      }
      if (r.kind === 'plan') {
        const p = findPlatform(r.id);
        if (!p) { await showAppAlert(`Plataforma ${r.name} não encontrada. Nada foi salvo.`); return; }
        addDoc(p, r.params, r.plan);
      } else {
        for (const m of r.res.members) {
          const p = findPlatform(m.platformId);
          if (!p) { if (m.plan) { await showAppAlert(`Plataforma ${m.name} não encontrada. Nada foi salvo.`); return; } continue; }
          addDoc(p, m.plan ? m.params : null, m.plan || null); // sem plano: fica como está (só o 🏁 de hoje)
        }
      }
    }
    const nStop = Object.keys(stopFor).length;
    if (!docs.length && !nStop) { await showAppAlert('Nada a gravar: as linhas marcadas não têm plano novo nem resto de hoje pra encerrar.'); return; }
    const sumAfter = chosen.reduce((s2, r) => s2 + (r.error ? (r.beforeC || 0) : (r.afterC || 0)), 0);
    const okGo = await showAppConfirm(!docs.length
      ? `🏁 Encerrar hoje em ${nStop} plataforma(s)? Os planos ficam como estão; hoje conta como cumprido${keepSumC ? ` e o que faltava (${moneyC(keepSumC)}) não é mais cobrado hoje` : ''}.`
      : `Atualizar ${chosen.length - stayCount} plano(s)/grupo(s) — ${docs.length} plataforma(s)? Tudo é refeito a partir de amanhã (${fmtShort(tomorrow)}): ${moneyC(sumAfter)} no total.${nStop ? ` 🏁 Hoje fica encerrado em ${nStop} plataforma(s) e conta como cumprido${keepSumC ? ` — ${moneyC(keepSumC)} que faltava vai pros próximos dias` : ''}.` : ' Hoje continua com a meta de hoje (fica guardada no histórico).'} Tudo é gravado de uma vez: se falhar, nada muda.`);
    if (!okGo || !mounted || !updateClose) return;
    st.saving = true;
    busy = true;
    btn.disabled = true;
    let result;
    try {
      // (29) 🏁 só das plataformas confirmadas (29b: + "Descontar" desligado)
      result = docs.length
        ? await savePlansBatch(state.currentUid, docs, nStop ? { stopFor } : {})
        : await stopTodayOnly(state.currentUid, stopFor);
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
    await showAppAlert(`✅ ${chosen.length} plano(s)/grupo(s) atualizado(s) — ${docs.length} plataforma(s).${nStop ? ` 🏁 Hoje encerrado em ${nStop}.` : ''}`);
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

// (26) ⏭ Parar hoje → (29) 🏁 Encerrar o dia: abre o 🔄 já preenchido pra
// plataforma; ao confirmar, o dia de hoje dela fica 🏁 no histórico.
let pendingStopToday = null;
let pendingStopInfo = null;
export function requestStopToday(platformId, stop = null) {
  pendingStopToday = platformId ? String(platformId) : null;
  pendingStopInfo = stop && pendingStopToday ? { platformId: pendingStopToday, stop } : null;
  requestPlanejadorFocus(platformId);
}

export function requestPlanejadorFocus(platformId) {
  pendingFocus = platformId ? String(platformId) : null;
  if (mounted && loadStatus === 'ok') consumeFocus();
}

async function consumeFocus() {
  const id = pendingFocus;
  pendingFocus = null;
  if (!id || !findPlatform(id)) return;
  if (form.platformId === id && !form.groupId) {
    activeTab = 'caixa'; applyTab();
    if (pendingStopToday === id) { pendingStopToday = null; openUpdatePlans({ onlyPlatformId: id, stopInfo: pendingStopInfo }); pendingStopInfo = null; }
    return;
  }
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
  if (pendingStopToday === id) { pendingStopToday = null; openUpdatePlans({ onlyPlatformId: id, stopInfo: pendingStopInfo }); pendingStopInfo = null; }
}


// ============================================================
// (Sub-entrega 35) 🅁 ROLLOVER DO DIA + 📊 PAINEL DO TOPO
// ============================================================
// Só leitura e conta: nada é gravado. Rollover ao vivo (mesma conta do
// resto do Planejador) − o que falta apostar hoje − os dias do plano +
// entradas previstas (depósitos de rotina + Misterioso).

const openR = new Set();
function rKey(pid, key) { return `${pid}|${key}`; }

/**
 * Caminho do Rollover de UMA plataforma. planDays: os dias da prévia
 * (botão R); sem eles, o plano SALVO (painel).
 */
function rolloverPathFor(p, { withInflows = true, untilKey = null, planDays = null } = {}) {
  if (!p) return null;
  const roll = platformRolloverC(p);
  if (roll === null) return null;
  const t = todayKey();
  const saved = getSavedPlan(p.id);
  const days = Array.isArray(planDays) ? planDays : (saved && Array.isArray(saved.days) ? saved.days : []);
  const pday = Array.isArray(planDays) ? planDays.find(d => d && d.key === t) : null;
  // hoje: o que AINDA vai ser apostado (o já apostado já saiu do Rollover)
  const todayBetC = pday && !activeStop(isPlanLogLoaded(state.currentUid) ? getPlanLogEntry(t, p.id) : null)
    ? Math.max(0, Math.round(Number(pday.plannedC) || 0) - realWageredC(p, t))
    : todayLeftC(saved, p, t);
  const lastKey = days.length ? days[days.length - 1].key : t;
  const endK = untilKey && untilKey > lastKey ? untilKey : lastKey;
  const inflows = withInflows ? memberInflows(p, endK > t ? endK : t) : [];
  return projectRolloverPath({ rolloverC: roll, todayKey: t, todayBetC, bets: days.filter(d => d && d.key > t), inflows, untilKey });
}

function rButton(row, p, rPath, d, speed) {
  const b = el('button', `plan-r-btn${openR.has(rKey(p.id, d.key)) ? ' active' : ''}`, 'R');
  b.type = 'button';
  b.title = 'Rollover previsto pra este dia';
  b.setAttribute('aria-label', `Rollover previsto em ${fmtShort(d.key)}`);
  b.setAttribute('aria-expanded', openR.has(rKey(p.id, d.key)) ? 'true' : 'false');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const k = rKey(p.id, d.key);
    const cur = row.querySelector(':scope > .plan-r-box');
    if (openR.has(k)) { openR.delete(k); if (cur) cur.remove(); b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); }
    else { openR.add(k); if (!cur) row.appendChild(rDetail(p, rPath, d, speed)); b.classList.add('active'); b.setAttribute('aria-expanded', 'true'); }
  });
  return b;
}

function rDetail(p, rPath, d, speed) {
  const box = el('div', 'plan-r-box');
  const t = todayKey();
  if (!rPath) { box.appendChild(el('p', 'plan-hint', 'Rollover indisponível (configurações de bônus não carregadas).')); return box; }
  if (d.key < t) { box.appendChild(el('p', 'plan-hint', 'Dia que já passou — sem projeção.')); return box; }
  const st = rPath.path.find(x => x.key === d.key);
  if (!st) { box.appendChild(el('p', 'plan-hint', 'Sem projeção pra este dia.')); return box; }
  const line = (l, r, cls = '') => { const x = el('div', `pu-line${cls ? ` ${cls}` : ''}`); x.appendChild(el('span', 'pu-l', l)); x.appendChild(el('span', 'pu-r', r)); box.appendChild(x); };
  line(d.key === t ? 'Rollover agora' : 'Rollover no início do dia', moneyC(st.startC), st.startC <= 0 ? 'pu-down' : '');
  if (st.inItems.length) st.inItems.forEach(x => line(`+ ${x.name || 'Entrada prevista'}`, `+${moneyC(x.valueC)}`, 'pu-up'));
  else line('Entradas previstas no dia', 'nenhuma');
  line(d.key === t ? '− Falta apostar hoje' : '− Aposta planejada do dia', `−${moneyC(st.betC)}`);
  line('= Rollover no fim do dia', moneyC(st.endC), st.endC < 0 ? 'pu-down' : '');
  if (st.endC < 0) box.appendChild(el('p', 'plan-hint pu-err', `⚠️ O plano aposta ${moneyC(-st.endC)} além do Rollover previsto até este dia${speed && speed !== 1 ? ` (peso ⚡ ${formatMult(speed)}: o teto do caixa é o Rollover × ${formatMult(speed)})` : ''}.`));
  else if (speed && speed !== 1) box.appendChild(el('p', 'plan-hint', `Peso ⚡ ${formatMult(speed)}: o teto do caixa é o Rollover × ${formatMult(speed)}.`));
  if (d.capped) box.appendChild(el('p', 'plan-hint', '🔒 O caixa limitou este dia.'));
  return box;
}

// ---------- 📊 Painel ----------
const OV_SHORTCUTS = [[1, 'Amanhã'], [3, '3 dias'], [7, '7 dias'], [15, '15 dias'], [30, '30 dias']];
const OV_BET_MODES = [['today', 'Hoje'], ['all', 'Hoje → fim dos planos'], ['range', 'Amanhã → data']];
const ov = { open: false, sel: null, pick: false, inflows: true, days: 7, untilKey: null, bet: 'today', list: false };
try { ov.open = window.localStorage.getItem('planOvOpen') === '1'; } catch (e) { ov.open = false; }

function ovUntil() {
  return ov.untilKey || addDaysKey(todayKey(), ov.days || 7);
}

// Meta de HOJE designada (🏁 encerrado = o que apostou até parar).
function todayDesignatedC(p) {
  const t = todayKey();
  const log = isPlanLogLoaded(state.currentUid) ? getPlanLogEntry(t, p.id) : null;
  const st = activeStop(log);
  if (st) return Math.round(Number(st.wageredC) || 0);
  const day = planDayOf(getSavedPlan(p.id), t) || log;
  return day ? Math.max(0, Math.round(Number(day.plannedC) || 0)) : 0;
}

function overviewRows() {
  const t = todayKey();
  const until = ovUntil();
  const list = (state.platforms || []).filter(p => !ov.sel || ov.sel.has(p.id));
  return list.map(p => {
    const saved = getSavedPlan(p.id);
    const rollNow = platformRolloverC(p);
    const res = rollNow === null ? null : rolloverPathFor(p, { withInflows: ov.inflows, untilKey: until });
    const futureDays = saved && Array.isArray(saved.days) ? saved.days.filter(d => d && d.key > t) : [];
    let betC = 0;
    if (ov.bet === 'today') betC = todayDesignatedC(p);
    else if (ov.bet === 'all') betC = todayDesignatedC(p) + futureDays.reduce((s2, d) => s2 + Math.round(Number(d.plannedC) || 0), 0);
    else betC = futureDays.filter(d => d.key <= until).reduce((s2, d) => s2 + Math.round(Number(d.plannedC) || 0), 0);
    return {
      p, name: String(p.name || ''), hasPlan: !!saved, rollNow,
      projC: res ? res.endAt(until) : null,
      zeroKey: res ? res.zeroKey : null,
      lastBetKey: res ? res.lastBetKey : null,
      betC
    };
  }).filter(r => (r.rollNow !== null && r.rollNow > 0) || r.hasPlan || r.betC > 0);
}

function renderOverview() {
  const box = $('planOverview');
  if (!box) return;
  box.replaceChildren();
  if (loadStatus !== 'ok') return;
  const t = todayKey();
  const until = ovUntil();
  const rows = overviewRows();
  const known = rows.filter(r => r.rollNow !== null);
  const rollNowC = known.reduce((s2, r) => s2 + r.rollNow, 0);
  const projC = known.reduce((s2, r) => s2 + Math.max(0, r.projC || 0), 0);
  const over = known.filter(r => r.projC !== null && r.projC < 0);
  const betC = rows.reduce((s2, r) => s2 + r.betC, 0);
  const withPlan = known.filter(r => r.hasPlan && r.rollNow > 0);
  const zeroing = withPlan.filter(r => r.zeroKey);
  const lastZero = zeroing.map(r => r.zeroKey).sort().pop() || null;
  const saqueTxt = !withPlan.length ? '—' : (zeroing.length === withPlan.length ? `todas em ${fmtShort(lastZero)}` : `${zeroing.length} de ${withPlan.length}${lastZero ? ` até ${fmtShort(lastZero)}` : ''}`);
  const untilLabel = ov.untilKey ? fmtShort(until) : (OV_SHORTCUTS.find(x => x[0] === ov.days) || [0, fmtShort(until)])[1].toLowerCase();

  const head = el('button', 'plan-ov-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', ov.open ? 'true' : 'false');
  head.appendChild(el('span', 'plan-ov-title', `📊 Rollover ${ov.sel ? `(${ov.sel.size})` : 'geral'}`));
  head.appendChild(el('span', 'plan-ov-sum', `hoje ${moneyC(rollNowC)} · ${untilLabel} ${moneyC(projC)} · saque ${saqueTxt} ${ov.open ? '▴' : '▾'}`));
  head.addEventListener('click', () => {
    ov.open = !ov.open;
    try { window.localStorage.setItem('planOvOpen', ov.open ? '1' : '0'); } catch (e) { /* aparelho sem armazenamento: só não lembra */ }
    renderOverview();
  });
  box.appendChild(head);
  if (!ov.open) return;
  if (!contextConfirmed) box.appendChild(el('p', 'plan-hint', '⚠ Configurações de bônus não carregadas — o Rollover das plataformas fica indisponível.'));

  // Filtro: todas / grupos / escolher
  const f = el('div', 'plan-chips plan-ov-filter');
  const chip = (label, active, fn) => { const b = el('button', `plan-chip${active ? ' active' : ''}`, label); b.type = 'button'; b.setAttribute('aria-pressed', active ? 'true' : 'false'); b.addEventListener('click', fn); f.appendChild(b); };
  chip('Todas', !ov.sel, () => { ov.sel = null; renderOverview(); });
  planGroups().forEach(g => {
    const ids = groupPlatforms(g).map(p => p.id);
    if (!ids.length) return;
    const active = !!ov.sel && ov.sel.size === ids.length && ids.every(id => ov.sel.has(id));
    chip(`${g.routine.emoji ? `${g.routine.emoji} ` : ''}${g.routine.name}`, active, () => { ov.sel = new Set(ids); renderOverview(); });
  });
  chip(ov.pick ? '✓ Escolher' : 'Escolher…', ov.pick, () => { ov.pick = !ov.pick; renderOverview(); });
  box.appendChild(f);
  if (ov.pick) {
    const pl = el('div', 'plan-ov-pick');
    [...(state.platforms || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true })).forEach(p => {
      const lab = el('label', 'plan-ov-pick-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !ov.sel || ov.sel.has(p.id);
      cb.addEventListener('change', () => {
        const cur = ov.sel ? new Set(ov.sel) : new Set((state.platforms || []).map(x => x.id));
        if (cb.checked) cur.add(p.id); else cur.delete(p.id);
        ov.sel = cur.size === (state.platforms || []).length ? null : cur;
        renderOverview();
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(` ${p.name}`));
      pl.appendChild(lab);
    });
    box.appendChild(pl);
  }

  // Entradas previstas liga/desliga
  const tg = el('label', 'plan-toggle plan-ov-toggle');
  const ti = el('input');
  ti.type = 'checkbox';
  ti.checked = ov.inflows;
  ti.addEventListener('change', () => { ov.inflows = ti.checked; renderOverview(); });
  tg.appendChild(ti);
  tg.appendChild(document.createTextNode(' Contar entradas previstas (depósitos de rotina + Misterioso)'));
  box.appendChild(tg);

  // Data
  const dr = el('div', 'plan-ov-date');
  dr.appendChild(el('span', 'plan-label', 'Até'));
  const di = el('input', 'plan-input plan-ov-date-in');
  di.type = 'date';
  di.min = addDaysKey(t, 1);
  di.value = until;
  di.setAttribute('aria-label', 'Data da projeção');
  di.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(di.value) && di.value > t) { ov.untilKey = di.value; ov.days = null; renderOverview(); } });
  dr.appendChild(di);
  box.appendChild(dr);
  const sc = el('div', 'plan-chips');
  OV_SHORTCUTS.forEach(([n, label]) => {
    const b = el('button', `plan-chip${!ov.untilKey && ov.days === n ? ' active' : ''}`, label);
    b.type = 'button';
    b.addEventListener('click', () => { ov.days = n; ov.untilKey = null; renderOverview(); });
    sc.appendChild(b);
  });
  box.appendChild(sc);
  // Aposta: intervalo
  const bm = el('div', 'plan-chips plan-ov-bet');
  OV_BET_MODES.forEach(([id, label]) => {
    const b = el('button', `plan-chip${ov.bet === id ? ' active' : ''}`, label);
    b.type = 'button';
    b.addEventListener('click', () => { ov.bet = id; renderOverview(); });
    bm.appendChild(b);
  });
  box.appendChild(el('span', 'plan-label', 'Aposta projetada'));
  box.appendChild(bm);

  // Números
  const k = el('div', 'plan-kpis plan-ov-kpis');
  k.appendChild(kpi('Rollover hoje', moneyC(rollNowC), `${known.length} plataforma(s)`, 'plan-kpi-main'));
  k.appendChild(kpi(`Rollover em ${fmtShort(until)}`, moneyC(projC), over.length ? `⚠ ${over.length} com plano acima do Rollover` : (ov.inflows ? 'com as entradas previstas' : 'sem entradas previstas'), over.length ? 'cal-kpi-bad' : ''));
  k.appendChild(kpi('Aposta projetada', moneyC(betC), ov.bet === 'today' ? `hoje (${fmtShort(t)})` : (ov.bet === 'all' ? 'hoje até o fim dos planos' : `${fmtShort(addDaysKey(t, 1))} a ${fmtShort(until)}`)));
  k.appendChild(kpi('Previsão de saque', lastZero ? fmtShort(lastZero) : '—', withPlan.length ? `${zeroing.length} de ${withPlan.length} zeram dentro do plano` : 'nenhuma com plano e Rollover', 'plan-kpi-vip'));
  box.appendChild(k);

  // Por plataforma
  const det = el('details', 'plan-ov-list');
  det.open = ov.list;
  det.addEventListener('toggle', () => { ov.list = det.open; });
  det.appendChild(el('summary', '', `Por plataforma (${rows.length})`));
  const sorted = [...rows].sort((a, b) => (a.zeroKey || '9999').localeCompare(b.zeroKey || '9999') || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  sorted.forEach(r => {
    const line = el('div', `plan-ov-row${r.projC !== null && r.projC < 0 ? ' plan-ov-row-bad' : ''}`);
    line.appendChild(el('span', 'plan-ov-name', r.name));
    line.appendChild(el('span', 'plan-ov-val', r.rollNow === null ? '—'
      : `${moneyC(r.rollNow)} → ${r.projC === null ? '—' : moneyC(r.projC)} · ${r.zeroKey ? `zera ${fmtShort(r.zeroKey)}` : (r.hasPlan ? (r.lastBetKey ? `não zera até ${fmtShort(r.lastBetKey)}` : 'plano sem dias à frente') : 'sem plano')}`));
    det.appendChild(line);
  });
  box.appendChild(det);
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
