// === LÓGICA DE ANALYTICS (View Gráficos — Etapa 8) ===
// Função pura, sem DOM e sem Firestore — mesmo espírito de isolamento de
// finance-logic.js/misterioso-logic.js. Só LÊ dados já calculados por
// finance-logic.js/vip-history-store.js, nunca duplica fórmula de negócio.
//
// === LIMITAÇÃO CONHECIDA E DOCUMENTADA ===
// financeWeeks[].bonus é um número ÚNICO, digitado manualmente no
// fechamento de cada semana — o sistema nunca guardou a quebra por tipo
// (VIP/Obrigado/Misterioso/Avulso) das semanas JÁ FECHADAS. Por isso
// "Bônus por Tipo" abaixo não é um retrato histórico exato: é a mesma
// PROJEÇÃO do mês que a aba VIP já usa (computeVipMonthlyTotals etc.),
// mais o Avulso, que é dado real. Isso é comunicado na nota da UI, nunca
// escondido.
//
// === (Sub-entrega G) ===
// a) Avulso = avulso EFETIVO do mês (bonus-ledger-logic.js — sem repetir o
//    VIP diário liberado depois de um lançamento) + diferença informada no
//    fechamento (financeWeeks[].bonusAdjustment = bônus real − fórmula −
//    avulso) das semanas cujo domingo cai no mês. Diferença negativa
//    abate; o total do Avulso nunca fica abaixo de zero. Semanas fechadas
//    antes desta sub-entrega não têm bonusAdjustment e não entram.
// b) Heatmap "Bônus Avulso": avulso efetivo por dia (recebe resolveCtx
//    opcional; sem ele, Obrigado/Misterioso ficam fora da fórmula).
// c) Valores arredondados em centavos.
//
// (Sub-entrega G2) Obrigado do donut conta só os dias que existem no mês
// (29–31 seguem o calendário) — computeObrigadoMonthlyTotals recebe o mês.

import { computeOverallTotals, computePlatformTotals } from './finance-logic.js';
import {
  computeVipMonthlyTotals, computeObrigadoMonthlyTotals, computeMisteriosoMonthlyTotal
} from './vip-history-store.js';
import { sumEffectiveOtherBonus, getEffectiveOtherBonusForDay } from './bonus-ledger-logic.js';

function r2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// --- Módulo Executivo: KPIs globais ---
// Sem filtro de data (from/to = null) — "desde o início" de tudo que já
// foi fechado, mesma semântica de computeOverallTotals sem filtro.
export function computeGlobalKpis(platforms, refDate = new Date(), resolveCtx = () => ({})) {
  const overall = computeOverallTotals(platforms, null, null, resolveCtx, refDate);
  const roiGlobal = overall.bonus > 0 ? overall.resultBetting / overall.bonus : null;
  const idb = overall.resultBetting !== 0 ? overall.bonus / overall.resultBetting : null;

  return {
    saldoGlobal: overall.balance,
    rolloverTotal: overall.rollover,
    totalDepositado: overall.deposit,
    totalSacado: overall.withdrawal,
    totalApostado: overall.wagered,
    totalApostas: overall.betCount,
    bonusDistribuidoTotal: overall.bonus,
    resultadoLiquido: overall.resultBetting,
    roiGlobal,
    idb
  };
}

// --- Evolução do Saldo Global (Line) ---
// Um ponto por data de fechamento (weekEnd) distinta entre TODAS as
// plataformas. Em cada ponto, soma o `balance` mais recente já FECHADO
// de cada plataforma até aquela data (carry-forward) — aproxima a
// evolução do Saldo total ao longo do tempo. Plataforma sem nenhuma
// semana fechada ainda não entra na soma (conta como 0 até a primeira
// semana dela fechar) — comportamento correto, não é dado faltando.
export function computeWeeklyBalanceSeries(platforms) {
  const allWeekEnds = new Set();
  (platforms || []).forEach(p => (p.financeWeeks || []).forEach(w => allWeekEnds.add(w.weekEnd)));
  const timeline = [...allWeekEnds].sort();

  return timeline.map(weekEnd => {
    let total = 0;
    platforms.forEach(p => {
      const weeksUpToNow = (p.financeWeeks || [])
        .filter(w => w.weekEnd <= weekEnd)
        .sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));
      if (weeksUpToNow.length > 0) {
        total += Number(weeksUpToNow[weeksUpToNow.length - 1].balance) || 0;
      }
    });
    return { weekEnd, total: r2(total) };
  });
}

// --- Depósitos vs Saques por semana (Stacked Bar) ---
// Soma, por weekStart, o depósito e saque de TODAS as plataformas que
// fecharam aquela semana — só semanas já congeladas (financeWeeks),
// mesma regra de computePlatformTotals/computeOverallTotals.
export function computeWeeklyDepositWithdrawal(platforms) {
  const map = new Map();
  (platforms || []).forEach(p => (p.financeWeeks || []).forEach(w => {
    if (!map.has(w.weekStart)) map.set(w.weekStart, { deposit: 0, withdrawal: 0 });
    const entry = map.get(w.weekStart);
    entry.deposit += Number(w.deposit) || 0;
    entry.withdrawal += Number(w.withdrawal) || 0;
  }));
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, vals]) => ({ weekStart, deposit: r2(vals.deposit), withdrawal: r2(vals.withdrawal) }));
}

// --- Bônus por Tipo (Donut) — PROJEÇÃO do mês de refDate ---
// VIP/Obrigado/Misterioso: mesma fórmula/projeção já usada na aba VIP
// (reaproveitada, nunca recalculada do zero aqui). Avulso: dado REAL —
// ver nota (Sub-entrega G) no topo do arquivo.
export function computeBonusByTypeCurrentMonth(platforms, obrigadoValuePerAppearance, misteriosoTemplates, refDate = new Date()) {
  const yearMonth = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}`;

  const vip = computeVipMonthlyTotals(platforms, refDate).total;
  const obrigado = computeObrigadoMonthlyTotals(platforms, obrigadoValuePerAppearance, yearMonth).total;
  const misterioso = computeMisteriosoMonthlyTotal(platforms, misteriosoTemplates, yearMonth);

  // Mesmo formato de ctx de bonus-context-store.js (buildResolveCtx) —
  // montado aqui pra este arquivo continuar sem depender de store.
  const templates = Array.isArray(misteriosoTemplates) ? misteriosoTemplates : [];
  const ctxFor = (platform) => ({
    obrigadoValuePerAppearance,
    misteriosoTemplate: templates.find(t => (t.platformIds || []).includes(platform.id)) || null
  });

  const inMonth = (e) => {
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return key === yearMonth;
  };

  let avulso = 0;
  (platforms || []).forEach(p => {
    avulso += sumEffectiveOtherBonus(p, inMonth, ctxFor(p)).raw;
    (p.financeWeeks || []).forEach(w => {
      if (w.backfilled) return;
      if (String(w.weekEnd).slice(0, 7) !== yearMonth) return;
      const adj = Number(w.bonusAdjustment);
      if (Number.isFinite(adj)) avulso += adj;
    });
  });

  return { vip, obrigado, misterioso, avulso: r2(Math.max(0, avulso)) };
}

// --- Ranking de Plataformas (Top 10, por 3 critérios) ---
// "Lucro" aqui = rbPlusBonus (Resultado Betting + Bônus) acumulado das
// semanas já fechadas — mesmo campo que "Total da plataforma" já exibe
// no Financeiro, nunca uma fórmula nova. Saldo/Rollover entram como o
// valor AO VIVO da fase atual (mesma semântica de computePlatformTotals).
export function computePlatformRankings(platforms, resolveCtx = () => ({}), refDate = new Date(), limit = 10) {
  const rows = (platforms || []).map(p => {
    const totals = computePlatformTotals(p, resolveCtx(p), refDate);
    return {
      id: p.id,
      name: p.name,
      balance: totals.balance,
      lucro: totals.rbPlusBonus,
      resultBetting: totals.resultBetting
    };
  });

  return {
    byBalance: [...rows].sort((a, b) => b.balance - a.balance).slice(0, limit),
    byLucro: [...rows].sort((a, b) => b.lucro - a.lucro).slice(0, limit),
    byResultBetting: [...rows].sort((a, b) => b.resultBetting - a.resultBetting).slice(0, limit)
  };
}

// --- Resultado Betting por semana (Area) — soma de todas as plataformas,
//     só semanas já fechadas (mesma fonte de computeWeeklyDepositWithdrawal). ---
export function computeWeeklyResultBetting(platforms) {
  const map = new Map();
  (platforms || []).forEach(p => (p.financeWeeks || []).forEach(w => {
    map.set(w.weekStart, (map.get(w.weekStart) || 0) + (Number(w.resultBetting) || 0));
  }));
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, resultBetting]) => ({ weekStart, resultBetting: r2(resultBetting) }));
}

// --- Valor Apostado por semana (Line) — mesmo padrão. ---
export function computeWeeklyWagered(platforms) {
  const map = new Map();
  (platforms || []).forEach(p => (p.financeWeeks || []).forEach(w => {
    map.set(w.weekStart, (map.get(w.weekStart) || 0) + (Number(w.wagered) || 0));
  }));
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, wagered]) => ({ weekStart, wagered: r2(wagered) }));
}

// --- ROI dos Bônus por Plataforma (Top 10, Horizontal Bar) ---
// ROI = Resultado Betting ÷ Bônus, das semanas já fechadas + fase atual
// (mesmos totais de computePlatformTotals). Só entram plataformas com
// bônus > 0 — sem isso o ROI seria infinito/indefinido e enganaria o
// ranking. Lista vazia é um resultado válido (nenhuma plataforma com
// bônus lançado ainda), não um erro.
export function computeBonusRoiByPlatform(platforms, resolveCtx = () => ({}), refDate = new Date(), limit = 10) {
  const rows = (platforms || [])
    .map(p => {
      const totals = computePlatformTotals(p, resolveCtx(p), refDate);
      return { id: p.id, name: p.name, bonus: totals.bonus, resultBetting: totals.resultBetting };
    })
    .filter(r => r.bonus > 0)
    .map(r => ({ ...r, roi: r.resultBetting / r.bonus }));

  return rows.sort((a, b) => b.roi - a.roi).slice(0, limit);
}

function toLocalDayKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// --- Heatmap Geral (42 plataformas x dias) ---
// Sem Saldo diário salvo no sistema (só semanal, via financeWeeks) — por
// isso a métrica é sempre algo que EXISTE por dia: depósito (depositLog),
// apostado/resultBetting (betEntries) ou bônus avulso EFETIVO
// (otherBonusLog — Sub-entrega G, precisa de resolveCtx pra fórmula do dia).
// `days` controla a janela (mobile-friendly, default 14) — mais dias
// aumenta a largura do canvas, não o custo de rede (é só desenho local).
export function computeHeatmapMatrix(platforms, metric = 'deposito', days = 14, refDate = new Date(), resolveCtx = () => ({})) {
  const start = new Date(refDate);
  start.setHours(0, 0, 0, 0);
  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    dayKeys.push(toLocalDayKey(d));
  }

  const sortedPlatforms = [...(platforms || [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));

  const rows = sortedPlatforms.map(p => {
    const dayTotals = {};
    dayKeys.forEach(k => { dayTotals[k] = 0; });

    if (metric === 'deposito') {
      (p.depositLog || []).forEach(e => {
        const k = toLocalDayKey(e.date);
        if (k in dayTotals) dayTotals[k] += Number(e.value) || 0;
      });
    } else if (metric === 'apostado') {
      (p.betEntries || []).forEach(e => {
        const k = toLocalDayKey(e.date);
        if (k in dayTotals) dayTotals[k] += Number(e.wagered) || 0;
      });
    } else if (metric === 'resultBetting') {
      (p.betEntries || []).forEach(e => {
        const k = toLocalDayKey(e.date);
        if (k in dayTotals) dayTotals[k] += Number(e.resultBetting) || 0;
      });
    } else if (metric === 'bonus') {
      const ctx = resolveCtx(p) || {};
      const daysWithEntries = new Set((p.otherBonusLog || []).map(e => toLocalDayKey(e.date)));
      dayKeys.forEach(k => {
        if (!daysWithEntries.has(k)) return;
        dayTotals[k] = getEffectiveOtherBonusForDay(p, new Date(`${k}T12:00:00`), ctx).raw;
      });
    }

    return { name: p.name, values: dayKeys.map(k => r2(dayTotals[k])) };
  });

  return { dayKeys, rows };
}
