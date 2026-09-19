// === LÓGICA DO BÔNUS MISTERIOSO (Página 3 — aba Bônus Misterioso) ===
// Pura, sem DOM e sem Firestore — só cálculo. Fica separada de
// cycle-logic.js de propósito (mesmo espírito do isolamento já existente
// entre cycle-logic.js e finance-logic.js): esta lógica depende de
// "templates" (estrutura nova, ver vip-misterioso-store.js), então mora
// no seu próprio arquivo em vez de inchar cycle-logic.js. Importa
// sumDepositsUpTo de cycle-logic.js pra calcular o patamar — mesmo padrão
// já usado por platform-sort.js (que também importa de cycle-logic.js
// sem problema; a regra de isolamento é só entre cycle-logic e
// finance-logic).

import { sumDepositsUpTo } from './cycle-logic.js';

// Os 8 patamares de depósito são FIXOS pra todos os templates — nunca
// mudam. O que varia de template pra template é só o intervalo de bônus
// (min/max) pago em cada patamar (ver vip-misterioso-store.js).
export const MISTERIOSO_DEPOSIT_THRESHOLDS = [30, 70, 150, 300, 600, 1000, 2000, 5000];

// Acha o índice do patamar aplicável pro total depositado — o maior
// threshold já alcançado (mesma lógica de levelForAmount em
// cycle-logic.js, mas usando os thresholds fixos acima). -1 se não
// alcançou nem o primeiro patamar (R$30).
export function findMisteriosoTierIndex(totalDeposited) {
  let index = -1;
  for (let i = 0; i < MISTERIOSO_DEPOSIT_THRESHOLDS.length; i++) {
    if (totalDeposited >= MISTERIOSO_DEPOSIT_THRESHOLDS[i]) index = i;
  }
  return index;
}

// Dado um template ({bonusRanges: [{min,max}, ...8 itens]}) e o total
// depositado, devolve {min, max} do patamar aplicável, ou null se ainda
// não alcançou nenhum patamar.
export function getMisteriosoRangeForDeposit(template, totalDeposited) {
  const index = findMisteriosoTierIndex(totalDeposited);
  if (index === -1) return null;
  const range = template && template.bonusRanges ? template.bonusRanges[index] : null;
  return range || null;
}

// Dias de diferença entre duas datas (só a parte de dia, sem hora).
function daysBetween(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0, 0, 0, 0);
  const b = new Date(dateB); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// true se `eventDateKey` (string 'AAAA-MM-DD') ainda está dentro da
// janela editável — até 7 dias atrás, contados a partir de hoje, nunca no
// futuro. Fora dessa janela, a UI simplesmente para de mostrar o campo
// editável (ver Ponto 7.4-C: não existe trava automática, só ausência de
// edição = usa o mínimo pra sempre).
export function isWithinEditableWindow(eventDateKey, today = new Date()) {
  // Interpretação LOCAL da data (T00:00:00), nunca toISOString — mesmo
  // cuidado de fuso já documentado em getMonthStart/betDays.
  const eventDate = new Date(`${eventDateKey}T00:00:00`);
  const diff = daysBetween(eventDate, today);
  return diff >= 0 && diff <= 7;
}

// Valor EFETIVO do Bônus Misterioso pra um evento: o que foi editado, se
// existir um registro em platform.misteriosoBonusLog pra essa data;
// senão, o MÍNIMO do patamar alcançado naquela data (sem trava
// automática — vale pra sempre até alguém editar). 0 se não alcançou
// nenhum patamar.
export function getEffectiveMisteriosoValue(platform, dateKey, template) {
  const log = (platform.misteriosoBonusLog || []).find(entry => entry.date === dateKey);
  if (log) return log.value;

  const eventDate = new Date(`${dateKey}T23:59:59`);
  const totalAtEvent = sumDepositsUpTo(platform, eventDate);
  const range = getMisteriosoRangeForDeposit(template, totalAtEvent);
  return range ? range.min : 0;
}
