// === SNAPSHOT DIÁRIO POR PLATAFORMA (granularidade por dia) ===
// Documento isolado por dia: users/{uid}/dailySnapshots/{AAAA-MM-DD} —
// fora de `platforms` e do doc-sentinela (mesmo padrão de vipHistory).
// Guarda o que NÃO dá pra reconstruir depois a partir dos logs brutos:
// Saldo e Rollover do dia, bônus de fórmula do dia, fase/nível/grupo/dia
// do ciclo vigentes naquele dia. Os fluxos do dia (depósito, saque,
// apostado, nº apostas, R.B., bônus avulso) também entram, por conveniência
// e como retrato imune a edições posteriores nos logs.
//
// GRAVAÇÃO: set com { merge: true } — nunca apaga campos de plataformas
// que não estejam na chamada. Passa pelo writeBatch de firebase-init.js,
// então SAFE_MODE bloqueia automaticamente (o console mostra
// "[MODO TESTE] set bloqueado: users/.../dailySnapshots/AAAA-MM-DD").
//
// PROTEÇÃO: lista vazia de plataformas NUNCA grava (mesma classe do
// EMPTY_READ_ANOMALY em platforms-store.js).
//
// Lógica de negócio não é duplicada: só chama funções já existentes de
// finance-logic.js / bonus-ledger-logic.js / cycle-logic.js.
//
// === (Sub-entrega E) ===
// a) TRAVA DE CONTEXTO: Saldo, Rollover e bônus de fórmula dependem do
//    contexto de bônus (valor do Obrigado + template do Misterioso). Sem
//    ele carregado e confirmado, o snapshot sairia com valores errados.
//    Agora só grava se resolveCtx devolver um valor do Obrigado numérico
//    válido — o resolvedor padrão de ui-finance-panel.js ({}) e o de uma
//    leitura que falhou nunca passam. (As telas também só agendam o
//    snapshot quando a leitura estrita deu certo — ver view-financeiro.js
//    e view-graficos.js; esta trava é a segunda barreira.)
// b) FALHA DE GRAVAÇÃO: a deduplicação ("nada mudou desde a última
//    gravação") marcava o conteúdo como gravado ANTES do commit — se ele
//    falhasse, o mesmo snapshot nunca era tentado de novo na sessão. Agora
//    a marca é desfeita quando o commit falha.
//
// === (Sub-entrega G) ===
// bonusManual passa a ser o avulso EFETIVO do dia (getAlreadyLoggedToday
// agora recebe o ctx — ver "AVULSO EFETIVO" em bonus-ledger-logic.js):
// sem dupla contagem quando o VIP diário é liberado depois de um
// lançamento de "Inserir bônus hoje".
//
// === (Análises — Sub-entrega 3) LEITURA POR INTERVALO ===
// loadDailySnapshotsRange: SÓ LEITURA, nova. Nada da gravação acima mudou.
// Consulta por intervalo de id do documento (o id É a data 'AAAA-MM-DD'),
// em ordem crescente, com teto de documentos — nunca lê a coleção inteira.
// Regras do Firestore: o `read` de dailySnapshots já é liberado ao dono.

import {
  db, collection, doc, writeBatch,
  getDocs, query, where, orderBy, limit, documentId
} from './firebase-init.js';
import {
  toLocalDateString, computeLiveBalance, computeRolloverLive
} from './finance-logic.js';
import { getExpectedBonusToday, getAlreadyLoggedToday } from './bonus-ledger-logic.js';
import { getCurrentCycleDay } from './cycle-logic.js';

const DEBOUNCE_MS = 4000;

// (Análises — Sub-entrega 3) teto da leitura por intervalo.
export const DAILY_SNAPSHOT_READ_MAX = 400;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

let timer = null;
let lastPayloadKey = null;

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumForDay(events, dayKey, field) {
  return (events || [])
    .filter(e => e && e.date && toLocalDateString(new Date(e.date)) === dayKey)
    .reduce((sum, e) => sum + (Number(e[field]) || 0), 0);
}

function getSnapshotRef(uid, dayKey) {
  return doc(db, 'users', uid, 'dailySnapshots', dayKey);
}

// (Sub-entrega E) true só se o contexto de bônus foi carregado de verdade.
function hasConfirmedBonusContext(platforms, resolveCtx) {
  if (typeof resolveCtx !== 'function') return false;
  try {
    const ctx = resolveCtx(platforms[0]) || {};
    return typeof ctx.obrigadoValuePerAppearance === 'number' && Number.isFinite(ctx.obrigadoValuePerAppearance);
  } catch (err) {
    return false;
  }
}

// Função pura — monta { [platformId]: {...} } pro dia de refDate.
export function buildDailySnapshot(platforms, resolveCtx = () => ({}), refDate = new Date()) {
  const dayKey = toLocalDateString(refDate);
  const result = {};

  (platforms || []).forEach(p => {
    const ctx = resolveCtx(p);
    result[p.id] = {
      name: p.name,
      deposit: r2(sumForDay(p.depositLog, dayKey, 'value')),
      withdrawal: r2(sumForDay(p.withdrawals, dayKey, 'value')),
      wagered: r2(sumForDay(p.betEntries, dayKey, 'wagered')),
      betCount: r2(sumForDay(p.betEntries, dayKey, 'betCount')),
      resultBetting: r2(sumForDay(p.betEntries, dayKey, 'resultBetting')),
      bonusFormula: r2(getExpectedBonusToday(p, refDate, ctx)),
      bonusManual: r2(getAlreadyLoggedToday(p, refDate, ctx)),
      balance: r2(computeLiveBalance(p, refDate, ctx)),
      rollover: r2(computeRolloverLive(p, refDate, ctx)),
      phase: (p.balancePhases || []).length + 1,
      level: (p.level === undefined ? null : p.level),
      group: p.group || null,
      cycleDay: p.cycleEnded ? 0 : getCurrentCycleDay(p, refDate),
      cycleEnded: p.cycleEnded === true
    };
  });

  return result;
}

export function saveDailySnapshotNow(uid, platforms, resolveCtx = () => ({})) {
  if (!uid) return;
  if (!Array.isArray(platforms) || platforms.length === 0) return;
  if (!hasConfirmedBonusContext(platforms, resolveCtx)) {
    console.warn('Snapshot diário não gravado: contexto de bônus (Obrigado/Misterioso) não confirmado.');
    return;
  }

  const now = new Date();
  const dayKey = toLocalDateString(now);
  const platformsData = buildDailySnapshot(platforms, resolveCtx, now);

  // Dedupe: se nada mudou desde a última gravação desta sessão, não escreve.
  const payloadKey = JSON.stringify({ uid, dayKey, platformsData });
  if (payloadKey === lastPayloadKey) return;
  lastPayloadKey = payloadKey;

  const batch = writeBatch(db);
  batch.set(
    getSnapshotRef(uid, dayKey),
    { date: dayKey, updatedAt: now.toISOString(), platforms: platformsData },
    { merge: true }
  );
  batch.commit().catch(err => {
    console.error('Erro ao salvar snapshot diário:', err);
    // (Sub-entrega E) Não gravou: libera a próxima tentativa com o mesmo conteúdo.
    if (lastPayloadKey === payloadKey) lastPayloadKey = null;
  });
}

// Debounce — chamado a cada renderização da tela; só grava depois de
// DEBOUNCE_MS sem novas mudanças.
export function scheduleDailySnapshot(uid, platforms, resolveCtx) {
  if (!uid) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    saveDailySnapshotNow(uid, platforms, resolveCtx);
  }, DEBOUNCE_MS);
}

// ============================================================
// (Análises — Sub-entrega 3) LEITURA POR INTERVALO — só leitura
// ============================================================
// fromKey/toKey: 'AAAA-MM-DD' (inclusivos). Devolve Promise de
// [{ day, updatedAt, platforms }] em ordem crescente de dia. Documento com
// id fora do formato ou sem `platforms` em formato de mapa é ignorado
// (nunca vira 0). Lança Error (mensagem em português) se os parâmetros
// forem inválidos; erro de rede/permissão é propagado pra quem chama
// decidir o que mostrar.
export async function loadDailySnapshotsRange(uid, fromKey, toKey, max = DAILY_SNAPSHOT_READ_MAX) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  if (typeof fromKey !== 'string' || typeof toKey !== 'string'
    || !DAY_KEY_RE.test(fromKey) || !DAY_KEY_RE.test(toKey) || fromKey > toKey) {
    throw new Error('Período inválido para os retratos diários.');
  }
  const safeMax = Math.max(1, Math.min(DAILY_SNAPSHOT_READ_MAX, Math.floor(Number(max) || DAILY_SNAPSHOT_READ_MAX)));

  const q = query(
    collection(db, 'users', uid, 'dailySnapshots'),
    where(documentId(), '>=', fromKey),
    where(documentId(), '<=', toKey),
    orderBy(documentId()),
    limit(safeMax)
  );
  const snap = await getDocs(q);

  return snap.docs
    .filter(d => DAY_KEY_RE.test(d.id))
    .map(d => {
      const data = d.data() || {};
      const platforms = (data.platforms && typeof data.platforms === 'object' && !Array.isArray(data.platforms))
        ? data.platforms
        : null;
      return {
        day: d.id,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
        platforms
      };
    })
    .filter(item => item.platforms !== null);
}
