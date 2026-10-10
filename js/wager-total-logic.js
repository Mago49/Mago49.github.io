// === LÓGICA DO "TOTAL APOSTADO" (View Gráficos — Sub-entrega 2) ===
// Função pura: sem DOM e sem Firestore. Quem grava é ui-total-apostado.js,
// sempre via savePlatform (platforms-store.js).
//
// PROBLEMA: o histórico antigo de apostas (betEntries) é incompleto/
// divergente do valor real que cada plataforma mostra. O nível VIP nas
// plataformas é calculado pelo TOTAL apostado — então o sistema precisa
// conhecer o total REAL.
//
// SOLUÇÃO — REFERÊNCIAS (platform.wagerAnchors[]):
//   { id, at, value, createdAt }
//     at    — ISO do instante da referência ("total apostado ATÉ aqui")
//     value — total apostado real informado pelo usuário nesse instante
//   Total real = value da referência VIGENTE (a de `at` mais recente que
//              não está no futuro)
//            + Σ betEntries[].wagered com data DEPOIS de `at` (e até agora)
//            + semanas antigas (backfill) DEPOIS de `at` — ver Sub-entrega 4.
//   Apostas antigas (antes da referência) ficam de fora por construção —
//   nenhum lançamento é apagado nem alterado. Editar/excluir uma aposta no
//   Financeiro recalcula o total sozinho (nada é congelado).
//
// HISTÓRICO, NUNCA SOBRESCRITA: cada nova referência é ACRESCENTADA (mesmo
// princípio de levelHistory e das versões de template VIP). Excluir é uma
// ação explícita, com confirmação, e passa allowShrink: ['wagerAnchors'].
//
// INSTANTE DA REFERÊNCIA (precisão de minuto, campo datetime-local):
//   - minuto já passado  -> fim daquele minuto (HH:mm:59.999): "até as
//                           HH:mm, inclusive";
//   - minuto atual       -> o instante exato de agora (apostas lançadas
//                           depois de salvar, no mesmo minuto, ainda somam);
//   - minuto futuro      -> recusado.
//
// === (Sub-entrega 4) SEMANAS ANTIGAS (backfill) — nunca contam 2x ===
// "Adicionar semana antiga" (addHistoricalWeek, finance-logic.js) grava só o
// TOTAL da semana em financeWeeks[] (backfilled:true) — não cria apostas
// individuais em betEntries. Regra, por semana de backfill:
//   - inteira ANTES/NO instante da referência -> fora (já está no valor da
//     referência);
//   - inteira DEPOIS da referência (ou sem referência):
//       * a semana NÃO tem apostas lançadas  -> conta o total da semana;
//       * a semana TEM apostas lançadas      -> contam só os lançamentos
//         (já somados acima). Nunca os dois.
//   - CONTÉM o instante da referência -> não dá pra dividir uma semana ao
//     meio: fica fora e entra em `straddleWeeks` (a tela avisa).
//
// === (Sub-entrega 4) NÍVEL PELO APOSTADO ===
// Tabela "Aposta Necessária" (V0..V5) por template VIP — ver
// wager-requirements-store.js. Aqui só as contas puras: nível alcançado,
// progresso até o próximo e se dá pra promover. QUEM PROMOVE é a tela, com
// 1 clique + confirmação, pelo MESMO caminho da Edição (recordLevelChange
// de cycle-logic.js + savePlatform). Nunca rebaixa: o total só cresce.

import { toLocalDateTimeString, roundMoney } from './finance-logic.js';

const r2 = roundMoney;

// Teto defensivo por plataforma — muito acima do uso real; só impede um
// laço/bug de inchar o documento da plataforma (limite de 1 MiB do Firestore).
export const WAGER_ANCHOR_MAX = 200;

// Teto defensivo de valor (R$ 1 bilhão) — protege contra erro de digitação
// grosseiro (ex.: colar um número de outro campo).
export const WAGER_VALUE_MAX = 1e9;

// (Sub-entrega 4) Níveis VIP e tabela "Aposta Necessária" padrão inicial
// (decisão do usuário). Índice = nível. V0 é sempre 0.
export const WAGER_LEVELS = [0, 1, 2, 3, 4, 5];
export const DEFAULT_WAGER_THRESHOLDS = Object.freeze([0, 100, 1000, 3000, 10000, 30000]);

const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

function isValidAnchor(a) {
  return !!a && typeof a === 'object'
    && typeof a.at === 'string' && isValidDate(new Date(a.at))
    && typeof a.value === 'number' && Number.isFinite(a.value) && a.value >= 0;
}

function minuteKey(date) {
  return toLocalDateTimeString(date); // 'AAAA-MM-DDTHH:mm' local
}

// Segunda 00:00 e domingo 23:59:59.999 LOCAIS de uma semana 'AAAA-MM-DD'.
function weekBounds(weekStartKey) {
  if (typeof weekStartKey !== 'string' || !DATE_KEY_RE.test(weekStartKey)) return null;
  const [y, m, d] = weekStartKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 6, 23, 59, 59, 999);
  if (!isValidDate(start)) return null;
  return { start: start.getTime(), end: end.getTime() };
}

// ---------- ENTRADA DO USUÁRIO ----------

// Aceita "1234.56", "1234,56", "1.234,56", "R$ 1.234,56" e "1.234" (=1234,
// padrão pt-BR de milhar). Devolve número ou NaN — formato que não se
// encaixa em nenhum desses vira NaN (nunca adivinha).
export function parseMoneyInput(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    // vírgula = decimal; pontos = milhar
    if ((s.match(/,/g) || []).length > 1) return NaN;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // só pontos em grupos de 3 ("1.234", "12.345.678") = milhar (pt-BR)
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

// 'AAAA-MM-DDTHH:mm' (datetime-local) -> { ok, at: Date } ou { ok:false, error }.
export function resolveAnchorInstant(localValue, refDate = new Date()) {
  if (typeof localValue !== 'string' || !DATETIME_LOCAL_RE.test(localValue)) {
    return { ok: false, error: 'Informe a data e a hora da referência.' };
  }
  const minuteStart = new Date(`${localValue}:00`);
  if (!isValidDate(minuteStart) || minuteKey(minuteStart) !== localValue) {
    return { ok: false, error: 'Data/hora inválida.' };
  }
  if (minuteStart.getTime() > refDate.getTime()) {
    return { ok: false, error: 'A referência não pode estar no futuro.' };
  }
  const minuteEnd = new Date(minuteStart.getTime() + 59999);
  const at = minuteEnd.getTime() > refDate.getTime() ? new Date(refDate.getTime()) : minuteEnd;
  return { ok: true, at };
}

// ---------- LEITURA ----------

// Cópia das referências válidas, em ordem cronológica (mais antiga primeiro).
export function getSortedAnchors(platform) {
  return (Array.isArray(platform && platform.wagerAnchors) ? platform.wagerAnchors : [])
    .filter(isValidAnchor)
    .slice()
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

// Referência vigente em refDate: a de `at` mais recente com at <= refDate.
export function getEffectiveAnchor(platform, refDate = new Date()) {
  const t = refDate.getTime();
  let found = null;
  getSortedAnchors(platform).forEach(a => {
    if (new Date(a.at).getTime() <= t) found = a;
  });
  return found;
}

// Total real de UMA plataforma.
export function computeWagerTotal(platform, refDate = new Date()) {
  const anchor = getEffectiveAnchor(platform, refDate);
  const anchorTime = anchor ? new Date(anchor.at).getTime() : null;
  const nowTime = refDate.getTime();

  let wageredAfter = 0;
  let betsAfter = 0;
  let wageredBefore = 0; // só informativo: o que a referência substituiu
  const betTimes = [];   // instantes válidos de todas as apostas (regra do backfill)

  (platform.betEntries || []).forEach(e => {
    if (!e || !e.date) return;
    const t = new Date(e.date).getTime();
    if (isNaN(t)) return;
    betTimes.push(t);
    if (t > nowTime) return;
    const v = Number(e.wagered) || 0;
    if (anchorTime === null || t > anchorTime) {
      wageredAfter += v;
      betsAfter++;
    } else {
      wageredBefore += v;
    }
  });

  // (Sub-entrega 4) Semanas antigas (backfill) — ver nota no topo.
  let backfillAfter = 0;
  let backfillWeeksAfter = 0;
  const straddleWeeks = [];
  (platform.financeWeeks || []).forEach(w => {
    if (!w || w.backfilled !== true) return;
    const b = weekBounds(w.weekStart);
    if (!b || b.start > nowTime) return;
    if (anchorTime !== null && b.end <= anchorTime) return;     // inteira antes: já na referência
    if (anchorTime !== null && b.start <= anchorTime) {         // contém a referência
      straddleWeeks.push(w.weekStart);
      return;
    }
    const hasRawBets = betTimes.some(t => t >= b.start && t <= b.end);
    if (hasRawBets) return;                                      // lançamentos já somados
    backfillAfter += Number(w.wagered) || 0;
    backfillWeeksAfter++;
  });
  straddleWeeks.sort();

  const anchorValue = anchor ? anchor.value : 0;
  return {
    hasAnchor: !!anchor,
    anchor,
    anchorValue: r2(anchorValue),
    wageredAfter: r2(wageredAfter),
    betsAfter,
    wageredBefore: r2(wageredBefore),
    backfillAfter: r2(backfillAfter),
    backfillWeeksAfter,
    straddleWeeks,
    total: r2(anchorValue + wageredAfter + backfillAfter)
  };
}

// Todas as plataformas, ordenadas por nome (mesma ordenação do Heatmap).
export function computeAllWagerTotals(platforms, refDate = new Date()) {
  const rows = [...(platforms || [])]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }))
    .map(p => ({ id: p.id, name: p.name, ...computeWagerTotal(p, refDate) }));

  return {
    rows,
    grandTotal: r2(rows.reduce((s, r) => s + r.total, 0)),
    withAnchor: rows.filter(r => r.hasAnchor).length,
    count: rows.length
  };
}

// ---------- (Sub-entrega 4) APOSTA NECESSÁRIA / NÍVEL ----------

// Tabela válida: 6 números finitos, V0 = 0, cada nível MAIOR que o anterior,
// nenhum acima do teto de valor. Nunca "conserta" — só aprova ou recusa.
export function validateWagerThresholds(thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length !== WAGER_LEVELS.length) {
    return { ok: false, error: 'A tabela precisa ter os 6 níveis (V0 a V5).' };
  }
  for (let i = 0; i < thresholds.length; i++) {
    const v = thresholds[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return { ok: false, error: `V${i}: valor inválido.` };
    }
    if (v > WAGER_VALUE_MAX) return { ok: false, error: `V${i}: valor alto demais.` };
  }
  if (thresholds[0] !== 0) return { ok: false, error: 'O V0 é sempre R$ 0,00.' };
  for (let i = 1; i < thresholds.length; i++) {
    if (!(thresholds[i] > thresholds[i - 1])) {
      return { ok: false, error: `O V${i} precisa ser maior que o V${i - 1}.` };
    }
  }
  return { ok: true };
}

// Nível alcançado pelo total e progresso até o próximo.
export function computeWagerLevel(total, thresholds) {
  const t = validateWagerThresholds(thresholds).ok ? thresholds : DEFAULT_WAGER_THRESHOLDS;
  const value = Math.max(0, Number(total) || 0);
  let level = 0;
  for (let i = 0; i < t.length; i++) if (value >= t[i]) level = i;

  const maxed = level === t.length - 1;
  if (maxed) {
    return { level, maxed: true, nextLevel: null, nextThreshold: null, missing: 0, progress: 1 };
  }
  const from = t[level];
  const to = t[level + 1];
  return {
    level,
    maxed: false,
    nextLevel: level + 1,
    nextThreshold: to,
    missing: r2(to - value),
    progress: Math.max(0, Math.min(1, (value - from) / (to - from)))
  };
}

// Pode promover? Nunca rebaixa. Precisa de grupo definido (sem grupo a
// plataforma não recebe Bônus VIP — a promoção não teria efeito real).
//   status: 'promote'      -> nível pelo apostado > cadastrado
//           'ok'           -> iguais
//           'above'        -> cadastrado acima do apostado (só aviso)
//           'no-group'     -> sem grupo definido na Edição
//           'unset'        -> sem nível cadastrado e apostado ainda no V0
export function getPromotionInfo(platform, wagerLevel) {
  const raw = platform ? platform.level : null;
  const current = (raw === null || raw === undefined || raw === '') ? null : Number(raw);
  const group = platform ? platform.group : null;
  const hasGroup = group === 'com' || group === 'sem';
  const currentKnown = Number.isInteger(current) && WAGER_LEVELS.includes(current);

  if (!hasGroup) return { status: 'no-group', current: currentKnown ? current : null, target: wagerLevel };
  if (!currentKnown && wagerLevel === 0) return { status: 'unset', current: null, target: 0 };
  if (!currentKnown || wagerLevel > current) {
    return { status: 'promote', current: currentKnown ? current : null, target: wagerLevel };
  }
  if (wagerLevel === current) return { status: 'ok', current, target: wagerLevel };
  return { status: 'above', current, target: wagerLevel };
}

// ---------- ESCRITA (em memória — quem chama grava com savePlatform) ----------

function newAnchorId(refDate) {
  return `wa_${refDate.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Valida e monta uma referência nova. NÃO muta a plataforma.
// Retorna { ok:true, entry, supersededBy } — supersededBy = referência MAIS
// NOVA que já existe (a nova não muda o total atual; a tela avisa) — ou
// { ok:false, error }.
export function buildWagerAnchor(platform, { localDateTime, rawValue }, refDate = new Date()) {
  const instant = resolveAnchorInstant(localDateTime, refDate);
  if (!instant.ok) return instant;

  const value = parseMoneyInput(rawValue);
  if (!Number.isFinite(value)) return { ok: false, error: 'Informe o total apostado (ex.: 1.234,56).' };
  if (value < 0) return { ok: false, error: 'O total apostado não pode ser negativo.' };
  if (value > WAGER_VALUE_MAX) return { ok: false, error: 'Valor alto demais — confira o número digitado.' };

  const existing = getSortedAnchors(platform);
  if (existing.length >= WAGER_ANCHOR_MAX) {
    return { ok: false, error: `Limite de ${WAGER_ANCHOR_MAX} referências nesta plataforma. Exclua as antigas que não usa mais.` };
  }

  const key = minuteKey(instant.at);
  if (existing.some(a => minuteKey(new Date(a.at)) === key)) {
    return { ok: false, error: 'Já existe uma referência neste mesmo dia e horário. Exclua a antiga antes, se quiser trocar.' };
  }

  const atTime = instant.at.getTime();
  const newer = existing.filter(a => new Date(a.at).getTime() > atTime);

  const entry = {
    id: newAnchorId(refDate),
    at: instant.at.toISOString(),
    value: r2(value),
    createdAt: refDate.toISOString()
  };

  return { ok: true, entry, supersededBy: newer.length ? newer[newer.length - 1] : null };
}

// Acrescenta (array NOVO, ordem cronológica). Nunca remove nada.
export function addWagerAnchor(platform, entry) {
  const list = Array.isArray(platform.wagerAnchors) ? platform.wagerAnchors.slice() : [];
  list.push(entry);
  list.sort((a, b) => new Date(a.at) - new Date(b.at));
  platform.wagerAnchors = list;
  return entry;
}

// Remove pelo id. Devolve { removed, index } pra quem chama poder desfazer
// se a gravação for bloqueada — ou null se não existe.
export function removeWagerAnchor(platform, anchorId) {
  const list = Array.isArray(platform.wagerAnchors) ? platform.wagerAnchors : [];
  const index = list.findIndex(a => a && a.id === anchorId);
  if (index === -1) return null;
  const copy = list.slice();
  const [removed] = copy.splice(index, 1);
  platform.wagerAnchors = copy;
  return { removed, index };
}
