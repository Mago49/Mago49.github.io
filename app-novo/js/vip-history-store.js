// === HISTÓRICO MENSAL — Bloco A (Página 3, VIP/Obrigado/Misterioso) ===
// Documento ÚNICO por mês, isolado em users/{uid}/vipHistory/{AAAA-MM} —
// fora da coleção `platforms` e do doc-sentinela, mesmo padrão de
// isolamento já usado por vip-obrigado-store.js/announcement-store.js.
// Agrega os 3 tipos de bônus (Item 3):
//   VIP:        Diário-Com, Diário-Sem, Semanal-Com, Semanal-Sem,
//               Mensal-Com, Mensal-Sem, Total (7 números)
//   Obrigado:   Total do mês + nº de incidências (2 números)
//   Misterioso: só Total do mês (1 número) — reaproveita a lógica já
//               correta (Item 4), sem cálculo novo, só fotografa o total
//               no fechamento.
//
// FECHAMENTO AUTOMÁTICO (Item 1): segue o calendário (mês civil). Um mês
// só é fechado depois que ele já terminou por completo — nunca o mês
// corrente, mesmo no último dia. checkAndCloseMonthlyHistory() varre os
// meses passados que ainda não têm documento salvo (até 12 meses pra
// trás, limite defensivo contra contas muito antigas sem histórico) e
// fecha cada um que faltar, um de cada vez, na primeira vez que a View
// VIP for aberta depois da virada de mês — não precisa de nenhum timer
// especial de meia-noite.
//
// getVipBonus(platform, refDate) agora aceita uma data de referência
// (ver cycle-logic.js) — é o que permite calcular o VIP de um mês JÁ
// ENCERRADO, e não só do mês corrente.

import { db, doc, getDoc, getDocs, collection, writeBatch } from './firebase-init.js';
import { getVipBonus, computeEmissionDates } from './cycle-logic.js';
import { getEffectiveMisteriosoValue } from './misterioso-logic.js';

// Quantos meses pra trás, no máximo, checkAndCloseMonthlyHistory() varre
// procurando meses sem documento — evita loop grande à toa em contas
// muito antigas que nunca tiveram este recurso.
const MAX_BACKFILL_MONTHS = 12;

function getHistoryCollection(uid) {
  return collection(db, 'users', uid, 'vipHistory');
}

function getHistoryDocRef(uid, yearMonth) {
  return doc(db, 'users', uid, 'vipHistory', yearMonth);
}

function toYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Último instante do mês de `date` (23:59:59.999 do último dia) — usado
// como refDate pra getVipBonus/computeEmissionDates enxergarem esse mês
// como "o mês corrente" na hora do cálculo.
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Cálculo puro dos 7 números do VIP para um mês já encerrado ---
export function computeVipMonthlyTotals(platforms, refDate) {
  const totals = {
    dailyCom: 0, dailySem: 0,
    weeklyCom: 0, weeklySem: 0,
    monthlyCom: 0, monthlySem: 0,
    total: 0
  };

  platforms.forEach(platform => {
    if (platform.group !== 'com' && platform.group !== 'sem') return;
    const bonus = getVipBonus(platform, refDate);
    if (platform.group === 'com') {
      totals.dailyCom += bonus.daily;
      totals.weeklyCom += bonus.weekly;
      totals.monthlyCom += bonus.monthly;
    } else {
      totals.dailySem += bonus.daily;
      totals.weeklySem += bonus.weekly;
      totals.monthlySem += bonus.monthly;
    }
    totals.total += bonus.total;
  });

  return totals;
}

// --- Cálculo puro dos 2 números do Obrigado para um mês fechado ---
// obrigadoDays é um padrão FIXO que se repete todo mês (não um log
// histórico por data) — por isso o total de um mês fechado é sempre a
// mesma soma de incidências × valor vigente na época do fechamento,
// mesmo padrão de "fotografia no momento do fechamento" do Bloco A.
export function computeObrigadoMonthlyTotals(platforms, valuePerAppearance) {
  const totalIncidencias = platforms.reduce((sum, p) => sum + (p.obrigadoDays || []).length, 0);
  return {
    total: totalIncidencias * valuePerAppearance,
    incidencias: totalIncidencias
  };
}

// --- Cálculo puro do total do Misterioso para um mês fechado (Item 4:
//     reaproveita a lógica já existente e correta — nenhum cálculo novo,
//     só soma os eventos do mês pra cada plataforma com template). ---
export function computeMisteriosoMonthlyTotal(platforms, templates, yearMonth) {
  const findTemplateForPlatform = (platformId) =>
    templates.find(t => (t.platformIds || []).includes(platformId)) || null;

  let total = 0;
  platforms.forEach(p => {
    if (p.cycleEnded) return;
    const template = findTemplateForPlatform(p.id);
    if (!template) return;
    computeEmissionDates(p).forEach(date => {
      const key = toDateKey(date);
      if (key.slice(0, 7) === yearMonth) {
        total += getEffectiveMisteriosoValue(p, key, template);
      }
    });
  });
  return total;
}

// --- Firestore: CRUD do histórico ---

// Lê um mês específico já fechado, ou null se ainda não existe.
export async function loadHistoryMonth(uid, yearMonth) {
  if (!uid) return null;
  try {
    const snap = await getDoc(getHistoryDocRef(uid, yearMonth));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('Erro ao carregar histórico mensal:', err);
    return null;
  }
}

// Lê TODOS os meses já fechados, do mais recente pro mais antigo — usado
// pra listar o Histórico Mensal na UI (view-vip.js).
export async function loadHistoryList(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(getHistoryCollection(uid));
    return snap.docs
      .map(d => ({ yearMonth: d.id, ...d.data() }))
      .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  } catch (err) {
    console.error('Erro ao carregar lista do histórico mensal:', err);
    return [];
  }
}

// Grava o retrato de um mês — chamado só por checkAndCloseMonthlyHistory,
// nunca editável manualmente pela UI (retrato fixo, mesmo espírito do
// `balance` travado no fechamento de semana em finance-logic.js).
function saveHistoryMonth(uid, yearMonth, data) {
  if (!uid) return;
  const batch = writeBatch(db);
  batch.set(getHistoryDocRef(uid, yearMonth), { ...data, closedAt: new Date().toISOString() });
  batch.commit().catch(err => console.error('Erro ao salvar histórico mensal:', err));
}

// Orquestra o fechamento automático (Item 1): varre os meses PASSADOS
// (nunca o mês corrente) a partir de hoje pra trás, até
// MAX_BACKFILL_MONTHS, e fecha o primeiro que ainda não tiver documento.
// Só fecha UM mês por chamada, de propósito — evita travar a abertura da
// View VIP calculando vários meses de uma vez numa conta muito atrasada;
// se faltar mais de um mês, o próximo é fechado na visita seguinte à
// página. Idempotente: mês já fechado nunca é recalculado/sobrescrito.
//
// Chamado uma vez no mount() da View VIP, depois que platforms, templates
// e obrigadoValuePerAppearance já estão carregados.
export async function checkAndCloseMonthlyHistory(uid, platforms, templates, obrigadoValuePerAppearance, refDate = new Date()) {
  if (!uid) return null;

  const currentYearMonth = toYearMonth(refDate);
  let cursor = new Date(refDate.getFullYear(), refDate.getMonth(), 1);

  for (let i = 0; i < MAX_BACKFILL_MONTHS; i++) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const candidateYearMonth = toYearMonth(cursor);

    // Nunca fecha o mês corrente nem qualquer mês futuro — só passados.
    if (candidateYearMonth >= currentYearMonth) continue;

    const existing = await loadHistoryMonth(uid, candidateYearMonth);
    if (existing) continue; // já fechado — segue procurando mais pra trás só se necessário

    const monthEnd = endOfMonth(cursor);
    const vip = computeVipMonthlyTotals(platforms, monthEnd);
    const obrigado = computeObrigadoMonthlyTotals(platforms, obrigadoValuePerAppearance);
    const misterioso = computeMisteriosoMonthlyTotal(platforms, templates, candidateYearMonth);

    const snapshot = { vip, obrigado, misterioso };
    saveHistoryMonth(uid, candidateYearMonth, snapshot);
    return { yearMonth: candidateYearMonth, ...snapshot };
  }

  return null; // nada pendente pra fechar (tudo já fechado, ou fora da janela de 12 meses)
}
