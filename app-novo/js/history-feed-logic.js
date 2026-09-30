// === LÓGICA DO HISTÓRICO GERAL (Perfil — A1) ===
// Função pura, sem DOM e sem Firestore: NUNCA escreve nada. Monta uma
// visão DERIVADA de um dia a partir dos logs que o sistema já grava
// (depositLog, withdrawals, betEntries, otherBonusLog, financeWeeks,
// balancePhases) + os bônus de fórmula (VIP/Obrigado/Misterioso), lidos
// da MESMA fonte do Saldo/Rollover ao vivo
// (getExpectedBonusBreakdownForDate, bonus-ledger-logic.js).
//
// ISOLAMENTO: importa só bonus-ledger-logic.js (ponte permitida) e
// cycle-logic.js. NÃO importa finance-logic.js — por isso
// toLocalDayKey abaixo é cópia intencional do algoritmo já usado lá.
//
// LIMITE DOCUMENTADO: eventos reais (depósito, saque, aposta, avulso,
// fechamento, fase) são permanentes. Bônus de fórmula são RECALCULADOS:
// nível/grupo são versionados (levelHistory), mas Obrigado (valor por
// aparição) e Misterioso (template/depósitos do ciclo) usam a
// configuração de hoje. Congelar o dia é a sub-entrega B.

import { getExpectedBonusBreakdownForDate } from './bonus-ledger-logic.js';
import { getLevelAt, BET_MINIMUM_BY_LEVEL } from './cycle-logic.js';

// Cópia intencional do algoritmo de toLocalDateString (finance-logic.js).
export function toLocalDayKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Soma/subtrai dias de uma chave 'AAAA-MM-DD' (local, sem fuso).
export function shiftDayKey(dayKey, days) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return toLocalDayKey(new Date(y, m - 1, d + days));
}

function isValidDate(value) {
  return !!value && !isNaN(new Date(value).getTime());
}

function isOnDay(value, dayKey) {
  return isValidDate(value) && toLocalDayKey(value) === dayKey;
}

// Horário padrão dos bônus de fórmula: 00:01 do dia.
function formulaTs(dayKey) {
  return new Date(`${dayKey}T00:01:00`).getTime();
}

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Horário em que o diário "com aposta" foi liberado naquele dia: o mais
// cedo entre (a) o "Apostei hoje" manual, se tiver hora gravada, e (b) a
// aposta que fez a soma do dia atingir o mínimo do nível vigente. Sem
// hora (registro antigo/retroativo, só data) -> 00:01.
function getDailyUnlockTs(platform, dayKey) {
  const candidates = [];

  (platform.betDays || []).forEach(entry => {
    if (String(entry).slice(0, 10) !== dayKey) return;
    if (String(entry).length > 10 && isValidDate(entry)) {
      candidates.push(new Date(entry).getTime());
    } else {
      candidates.push(formulaTs(dayKey));
    }
  });

  const { level } = getLevelAt(platform, new Date(`${dayKey}T00:00:00`));
  const minimo = BET_MINIMUM_BY_LEVEL[level] || 0;
  if (minimo > 0) {
    const dayBets = (platform.betEntries || [])
      .filter(e => isOnDay(e.date, dayKey))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let acc = 0;
    for (const e of dayBets) {
      acc += Number(e.wagered) || 0;
      if (acc >= minimo) {
        candidates.push(new Date(e.date).getTime());
        break;
      }
    }
  }

  return candidates.length ? Math.min(...candidates) : formulaTs(dayKey);
}

function fmtShort(isoDateStr) {
  const [, m, d] = String(isoDateStr).slice(0, 10).split('-');
  return `${d}/${m}`;
}

/**
 * Eventos de UM dia, de todas as plataformas, mais recente primeiro.
 * Plataforma sem movimento no dia não gera nada. Bônus de valor zero não
 * entram. Dias futuros não geram bônus de fórmula.
 *
 * @param {Array} platforms
 * @param {string} dayKey 'AAAA-MM-DD'
 * @param {(platform) => object} resolveCtx ctx de Obrigado/Misterioso por plataforma
 * @param {Date} refDate "agora" (só usado pra saber se o dia é futuro)
 * @returns {Array<{ts:number, platformId:string, platformName:string,
 *   kind:string, icon:string, label:string, value:(number|null),
 *   detail:string, rb?:number}>}
 */
export function buildDayFeed(platforms, dayKey, resolveCtx = () => ({}), refDate = new Date()) {
  const events = [];
  const todayKey = toLocalDayKey(refDate);
  const isFuture = dayKey > todayKey;

  (platforms || []).forEach(p => {
    const base = { platformId: p.id, platformName: p.name };

    (p.depositLog || []).forEach(e => {
      if (!isOnDay(e.date, dayKey)) return;
      events.push({ ...base, ts: new Date(e.date).getTime(), kind: 'deposito', icon: '⬇️', label: 'Depósito', value: r2(e.value), detail: '' });
    });

    (p.withdrawals || []).forEach(e => {
      if (!isOnDay(e.date, dayKey)) return;
      events.push({ ...base, ts: new Date(e.date).getTime(), kind: 'saque', icon: '⬆️', label: 'Saque', value: r2(e.value), detail: '' });
    });

    (p.betEntries || []).forEach(e => {
      if (!isOnDay(e.date, dayKey)) return;
      events.push({
        ...base, ts: new Date(e.date).getTime(), kind: 'aposta', icon: '🎲', label: 'Aposta',
        value: r2(e.wagered),
        detail: `${Number(e.betCount) || 0} aposta(s)`,
        rb: r2(e.resultBetting)
      });
    });

    (p.otherBonusLog || []).forEach(e => {
      if (!isOnDay(e.date, dayKey)) return;
      const v = r2(e.rawValue);
      if (v === 0) return;
      const scale = Number(e.scale) || 1;
      events.push({
        ...base, ts: new Date(e.date).getTime(), kind: 'bonus-avulso', icon: '🎁', label: 'Bônus avulso',
        value: v, detail: scale !== 1 ? `Rollover ${scale}x` : ''
      });
    });

    (p.financeWeeks || []).forEach(w => {
      if (!isOnDay(w.closedAt, dayKey)) return;
      events.push({
        ...base, ts: new Date(w.closedAt).getTime(), kind: 'semana', icon: '🔒',
        label: w.backfilled ? 'Semana antiga adicionada' : 'Semana fechada',
        value: null,
        detail: `${fmtShort(w.weekStart)} – ${fmtShort(w.weekEnd)} · Bônus ${r2(w.bonus).toFixed(2).replace('.', ',')}`,
        rb: r2(w.resultBetting)
      });
    });

    (p.balancePhases || []).forEach(ph => {
      if (!isOnDay(ph.createdAt, dayKey)) return;
      events.push({
        ...base, ts: new Date(ph.createdAt).getTime(), kind: 'fase', icon: '🔀',
        label: 'Nova fase', value: null,
        detail: `Início em ${fmtShort(ph.date)} · Saldo inicial ${r2(ph.initialBalance).toFixed(2).replace('.', ',')} · Rollover inicial ${r2(ph.initialRollover).toFixed(2).replace('.', ',')}`
      });
    });

    // Bônus de fórmula — mesma fonte do Saldo/Rollover ao vivo.
    if (!isFuture) {
      const dayDate = new Date(`${dayKey}T00:00:00`);
      const b = getExpectedBonusBreakdownForDate(p, dayDate, resolveCtx(p));
      const t0 = formulaTs(dayKey);
      if (r2(b.vipDaily) > 0) {
        const ts = getLevelAt(p, dayDate).group === 'com' ? getDailyUnlockTs(p, dayKey) : t0;
        events.push({ ...base, ts, kind: 'bonus-vip', icon: '⭐', label: 'Bônus VIP diário', value: r2(b.vipDaily), detail: '' });
      }
      if (r2(b.vipWeekly) > 0) events.push({ ...base, ts: t0, kind: 'bonus-vip', icon: '⭐', label: 'Bônus VIP semanal', value: r2(b.vipWeekly), detail: '' });
      if (r2(b.vipMonthly) > 0) events.push({ ...base, ts: t0, kind: 'bonus-vip', icon: '⭐', label: 'Bônus VIP mensal', value: r2(b.vipMonthly), detail: '' });
      if (r2(b.obrigado) > 0) events.push({ ...base, ts: t0, kind: 'bonus-obrigado', icon: '🙏', label: 'Bônus Obrigado', value: r2(b.obrigado), detail: '' });
      if (r2(b.misterioso) > 0) events.push({ ...base, ts: t0, kind: 'bonus-misterioso', icon: '🃏', label: 'Bônus Misterioso', value: r2(b.misterioso), detail: '' });
    }
  });

  events.sort((a, b) => (b.ts - a.ts) || a.platformName.localeCompare(b.platformName, 'pt-BR', { numeric: true }));
  return events;
}
