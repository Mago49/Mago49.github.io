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

import { db, doc, writeBatch } from './firebase-init.js';
import {
  toLocalDateString, computeLiveBalance, computeRolloverLive
} from './finance-logic.js';
import { getExpectedBonusToday, getAlreadyLoggedToday } from './bonus-ledger-logic.js';
import { getCurrentCycleDay } from './cycle-logic.js';

const DEBOUNCE_MS = 4000;

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
      bonusManual: r2(getAlreadyLoggedToday(p, refDate)),
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
  batch.commit().catch(err => console.error('Erro ao salvar snapshot diário:', err));
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
