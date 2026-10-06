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
//
// === SUB-ENTREGA B — RETRATO FIXO NUNCA GRAVADO COM DADO DUVIDOSO ===
// O retrato de um mês é PERMANENTE (nunca recalculado). Por isso, toda
// incerteza agora CANCELA o fechamento em vez de gravar:
//  1) LEITURA ESTRITA: loadHistoryMonth/loadHistoryList LANÇAM erro em
//     falha de leitura. Antes devolviam null/[] — e "null" era entendido
//     como "mês ainda não fechado", então uma falha de rede recalculava e
//     SOBRESCREVIA um retrato já gravado.
//  2) DADOS PRÓPRIOS: o fechamento lê ele mesmo, de forma estrita, o valor
//     do Obrigado e os templates do Misterioso
//     (loadObrigadoValuePerAppearanceStrict/loadMisteriosoTemplatesStrict).
//     Antes usava o que a tela carregou — e esses loaders devolvem o
//     padrão (0,30 / lista vazia) quando a leitura falha, o que gravaria
//     Obrigado/Misterioso errados pra sempre.
//  3) CONFERE DE NOVO antes de gravar (getDoc logo antes do set) e
//     ESPERA o commit: falha de gravação vira erro pra quem chama, nunca
//     só um console.error.
//  4) Sem nenhuma plataforma carregada, não fecha (um retrato zerado
//     permanente não é um dado, é ausência de dado).
//  5) Números validados (finitos) antes de gravar.
// Qualquer cancelamento: NADA é gravado; o mês é tentado de novo na
// próxima visita à View VIP.
//
// CÁLCULO (também Sub-entrega B):
//  - computeVipMonthlyTotals não filtra mais pelo grupo ATUAL da
//    plataforma. getVipBonus já separa por grupo DIA A DIA (byGroup) e dá
//    0 em todo dia sem grupo — o filtro antigo só servia pra jogar fora
//    os dias já ganhos de quem ficou "não definido" depois. Quem nunca
//    teve grupo no mês continua somando 0. (Mesma função alimenta o
//    donut "Bônus por Tipo" dos Gráficos — fica igualmente corrigido.)
//  - computeMisteriosoMonthlyTotal calcula as datas de emissão com a data
//    de referência do PRÓPRIO mês (fim do mês), não com "hoje". Só faz
//    diferença pra plataforma sem lastResetDate (ciclo = mês civil): antes
//    um mês passado usava o ciclo do mês atual e saía 0. Pro mês corrente
//    (Gráficos), o resultado é idêntico ao de antes.
//
// LIMITAÇÃO CONHECIDA (não mudou): o valor NÃO editado do Misterioso vem
// de `deposits`, que Fim/Reinício zeram. Se o ciclo for reiniciado ANTES
// do fechamento, eventos não editados daquele mês contam 0. O fechamento
// acontece na primeira visita à View VIP do mês seguinte, então o efeito
// prático é pequeno — mas existe.
//
// === (Sub-entrega G2) OBRIGADO NOS DIAS 29–31 ===
// O Obrigado conta EXATAMENTE como o calendário: um dia cadastrado só gera
// incidência se ele EXISTE no mês (dia 31 não conta em abril; 29–31 não
// contam em fevereiro, salvo 29 em ano bissexto). Antes o total do mês era
// "nº de dias cadastrados × valor", sem olhar o mês — o retrato mensal e a
// previsão da aba Obrigado contavam dias inexistentes, enquanto o
// Saldo/Rollover (bonus-ledger-logic.js) já seguia o calendário.
// computeObrigadoMonthlyTotals agora recebe o mês ('AAAA-MM'); sem ele,
// usa o mês atual. Retratos já gravados NÃO mudam (vipHistory é
// create-only).

import { db, doc, getDoc, getDocs, collection, writeBatch } from './firebase-init.js';
import { getVipBonus, computeEmissionDates } from './cycle-logic.js';
import { getEffectiveMisteriosoValue } from './misterioso-logic.js';
import { loadObrigadoValuePerAppearanceStrict } from './vip-obrigado-store.js';
import { loadMisteriosoTemplatesStrict } from './vip-misterioso-store.js';

// Quantos meses pra trás, no máximo, checkAndCloseMonthlyHistory() varre
// procurando meses sem documento — evita loop grande à toa em contas
// muito antigas que nunca tiveram este recurso.
const MAX_BACKFILL_MONTHS = 12;

// Primeiro mês que o fechamento automático pode gravar. Meses anteriores
// NÃO são fechados: o cálculo de um mês antigo usa a configuração ATUAL
// (valor por aparição do Obrigado, ciclo vigente do Misterioso) e sairia
// impreciso — um retrato fixo errado e permanente é pior que nenhum.
const HISTORY_FIRST_MONTH = '2026-10';

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;

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

// Mesmo que endOfMonth, a partir de 'AAAA-MM'.
function endOfYearMonth(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// --- Cálculo puro dos 7 números do VIP para um mês já encerrado ---
// (Sub-entrega B) Sem filtro pelo grupo ATUAL — ver nota no topo.
export function computeVipMonthlyTotals(platforms, refDate) {
  const totals = {
    dailyCom: 0, dailySem: 0,
    weeklyCom: 0, weeklySem: 0,
    monthlyCom: 0, monthlySem: 0,
    total: 0
  };

  (platforms || []).forEach(platform => {
    const bonus = getVipBonus(platform, refDate);
    // SUB-ENTREGA 6.2: Com/Sem pelo grupo que valia em cada DIA do mês
    // (byGroup, ver getVipBonus em cycle-logic.js), não pelo grupo atual da
    // plataforma — quem trocou de grupo no meio do mês tinha o mês inteiro
    // jogado num lado só. O total da plataforma não muda.
    const g = bonus.byGroup;
    totals.dailyCom += g.com.daily;
    totals.weeklyCom += g.com.weekly;
    totals.monthlyCom += g.com.monthly;
    totals.dailySem += g.sem.daily;
    totals.weeklySem += g.sem.weekly;
    totals.monthlySem += g.sem.monthly;
    totals.total += bonus.total;
  });

  return totals;
}

// --- Cálculo puro dos 2 números do Obrigado para um mês fechado ---
// obrigadoDays é um padrão FIXO que se repete todo mês (não um log
// histórico por data) — por isso o total de um mês fechado é sempre a
// mesma soma de incidências × valor vigente na época do fechamento,
// mesmo padrão de "fotografia no momento do fechamento" do Bloco A.
// (Sub-entrega G2) Dias cadastrados que EXISTEM no mês 'AAAA-MM' (sem
// repetição, só inteiros de 1 até o último dia do mês) — mesma regra do
// calendário e do Saldo/Rollover ao vivo.
export function getObrigadoDaysInMonth(platform, yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const valid = new Set();
  (platform.obrigadoDays || []).forEach(d => {
    const day = Number(d);
    if (Number.isInteger(day) && day >= 1 && day <= daysInMonth) valid.add(day);
  });
  return [...valid].sort((a, b) => a - b);
}

export function computeObrigadoMonthlyTotals(platforms, valuePerAppearance, yearMonth = null) {
  const ym = yearMonth || toYearMonth(new Date());
  const totalIncidencias = (platforms || []).reduce((sum, p) => sum + getObrigadoDaysInMonth(p, ym).length, 0);
  return {
    total: Math.round(totalIncidencias * (Number(valuePerAppearance) || 0) * 100) / 100,
    incidencias: totalIncidencias
  };
}

// --- Cálculo puro do total do Misterioso para um mês (Item 4: reaproveita
//     a lógica já existente — nenhum cálculo novo, só soma os eventos do
//     mês pra cada plataforma com template). ---
// (Sub-entrega B) Datas de emissão calculadas com o fim do PRÓPRIO mês
// como referência — ver nota no topo.
export function computeMisteriosoMonthlyTotal(platforms, templates, yearMonth) {
  const templateList = Array.isArray(templates) ? templates : [];
  const findTemplateForPlatform = (platformId) =>
    templateList.find(t => (t.platformIds || []).includes(platformId)) || null;
  const monthRefDate = endOfYearMonth(yearMonth);

  let total = 0;
  (platforms || []).forEach(p => {
    if (p.cycleEnded) return;
    const template = findTemplateForPlatform(p.id);
    if (!template) return;
    computeEmissionDates(p, monthRefDate).forEach(date => {
      const key = toDateKey(date);
      if (key.slice(0, 7) === yearMonth) {
        total += getEffectiveMisteriosoValue(p, key, template);
      }
    });
  });
  return total;
}

// --- Firestore: CRUD do histórico ---

/**
 * Lê um mês específico já fechado. null = o documento NÃO existe.
 * (Sub-entrega B) LANÇA erro em falha de leitura — nunca confundir
 * "não consegui ler" com "não existe".
 */
export async function loadHistoryMonth(uid, yearMonth) {
  if (!uid) return null;
  const snap = await getDoc(getHistoryDocRef(uid, yearMonth));
  return snap.exists() ? snap.data() : null;
}

/**
 * Lê TODOS os meses já fechados, do mais recente pro mais antigo — usado
 * pra listar o Histórico Mensal na UI (ui-vip-panel.js).
 * (Sub-entrega B) LANÇA erro em falha de leitura — a tela mostra "não foi
 * possível carregar", nunca "nenhum mês fechado" por engano.
 */
export async function loadHistoryList(uid) {
  if (!uid) return [];
  const snap = await getDocs(getHistoryCollection(uid));
  return snap.docs
    .map(d => ({ yearMonth: d.id, ...d.data() }))
    .filter(entry => YEAR_MONTH_RE.test(entry.yearMonth) && entry.vip && entry.obrigado)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

// Grava o retrato de um mês — chamado só por checkAndCloseMonthlyHistory,
// nunca editável manualmente pela UI (retrato fixo, mesmo espírito do
// `balance` travado no fechamento de semana em finance-logic.js).
// (Sub-entrega B) ESPERA o commit: falha vira erro pra quem chama.
async function saveHistoryMonth(uid, yearMonth, data) {
  const batch = writeBatch(db);
  batch.set(getHistoryDocRef(uid, yearMonth), { ...data, closedAt: new Date().toISOString() });
  await batch.commit();
}

function isSnapshotValid(snapshot) {
  const v = snapshot.vip;
  const vipOk = ['dailyCom', 'dailySem', 'weeklyCom', 'weeklySem', 'monthlyCom', 'monthlySem', 'total']
    .every(k => isFiniteNumber(v[k]));
  return vipOk &&
    isFiniteNumber(snapshot.obrigado.total) &&
    isFiniteNumber(snapshot.obrigado.incidencias) &&
    isFiniteNumber(snapshot.misterioso);
}

function closeError(message, cause) {
  const err = new Error(message);
  err.code = 'HISTORY_CLOSE_ABORTED';
  if (cause) err.cause = cause;
  return err;
}

/**
 * Orquestra o fechamento automático (Item 1): varre os meses PASSADOS
 * (nunca o mês corrente) a partir de hoje pra trás, até
 * MAX_BACKFILL_MONTHS, e fecha o primeiro que ainda não tiver documento.
 * Só fecha UM mês por chamada, de propósito — evita travar a abertura da
 * View VIP calculando vários meses de uma vez numa conta muito atrasada;
 * se faltar mais de um mês, o próximo é fechado na visita seguinte à
 * página. Idempotente: mês já fechado nunca é recalculado/sobrescrito.
 *
 * (Sub-entrega B) Assinatura nova: o valor do Obrigado e os templates do
 * Misterioso são lidos AQUI, de forma estrita (ver nota no topo).
 *
 * @returns {Promise<null | {yearMonth:string, vip:Object, obrigado:Object, misterioso:number}>}
 *          null = nada pendente pra fechar.
 * @throws  Error com code 'HISTORY_CLOSE_ABORTED' quando o fechamento foi
 *          cancelado por segurança — NADA foi gravado.
 */
export async function checkAndCloseMonthlyHistory(uid, platforms, refDate = new Date()) {
  if (!uid) return null;
  if (!Array.isArray(platforms) || platforms.length === 0) return null;

  const currentYearMonth = toYearMonth(refDate);
  let cursor = new Date(refDate.getFullYear(), refDate.getMonth(), 1);

  for (let i = 0; i < MAX_BACKFILL_MONTHS; i++) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const candidateYearMonth = toYearMonth(cursor);

    // Nunca fecha o mês corrente nem qualquer mês futuro — só passados.
    if (candidateYearMonth >= currentYearMonth) continue;

    // O cursor só anda para trás: qualquer mês daqui em diante também é
    // anterior ao primeiro mês permitido — por isso break, não continue.
    if (candidateYearMonth < HISTORY_FIRST_MONTH) break;

    let existing;
    try {
      existing = await loadHistoryMonth(uid, candidateYearMonth);
    } catch (err) {
      throw closeError(`Não foi possível confirmar se ${candidateYearMonth} já está fechado.`, err);
    }
    if (existing) continue; // já fechado — segue procurando mais pra trás só se necessário

    let obrigadoValuePerAppearance;
    let misteriosoTemplates;
    try {
      obrigadoValuePerAppearance = await loadObrigadoValuePerAppearanceStrict(uid);
      misteriosoTemplates = await loadMisteriosoTemplatesStrict(uid);
    } catch (err) {
      throw closeError(`Não foi possível ler as configurações de bônus pra fechar ${candidateYearMonth}.`, err);
    }

    const monthEnd = endOfMonth(cursor);
    const snapshot = {
      vip: computeVipMonthlyTotals(platforms, monthEnd),
      obrigado: computeObrigadoMonthlyTotals(platforms, obrigadoValuePerAppearance, candidateYearMonth),
      misterioso: computeMisteriosoMonthlyTotal(platforms, misteriosoTemplates, candidateYearMonth)
    };
    if (!isSnapshotValid(snapshot)) {
      console.error('Retrato do histórico com número inválido — não gravado:', candidateYearMonth, snapshot);
      throw closeError(`O cálculo de ${candidateYearMonth} gerou um valor inválido.`);
    }

    // Confere de novo logo antes de gravar (outra aba/aparelho pode ter
    // fechado este mês enquanto calculávamos).
    try {
      const again = await loadHistoryMonth(uid, candidateYearMonth);
      if (again) return null;
    } catch (err) {
      throw closeError(`Não foi possível reconfirmar ${candidateYearMonth} antes de gravar.`, err);
    }

    try {
      await saveHistoryMonth(uid, candidateYearMonth, snapshot);
    } catch (err) {
      throw closeError(`Não foi possível gravar o fechamento de ${candidateYearMonth}.`, err);
    }
    return { yearMonth: candidateYearMonth, ...snapshot };
  }

  return null; // nada pendente pra fechar (tudo já fechado, ou fora da janela de 12 meses)
}
