// === CAMADA DE DADOS (Firestore) ===
// Único módulo que fala diretamente com o Firestore.
// Se um dia trocar de banco de dados, é aqui (e só aqui) que mexe.

import { db, collection, doc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';

export const PLATFORM_NAMES = [
  'A73', 'DDUU', 'EE44', 'FXX', 'HHH5', 'NNZZ', 'PP11', '1UUU', '11TT', '35C',
  '36Q', '44MM', '45T', '5TTT', '53D', '552X', '551X', '61T', '63V', '66GG',
  '68D', '7GGG', '7JJJ', '72B', '79C', '83H', '838X', '84D', '877X', '899V',
  '93D', '93K', '988K'
];

export const DEFAULT_PLATFORMS = Array.from({ length: 33 }, (_, i) => ({
  id: 'p' + (i + 1),
  name: PLATFORM_NAMES[i],
  lastResetDate: null,
  deposits: [],
  betDays: [],
  cycleEnded: false,
  level: null,
  group: null,
  withdrawals: [],
  betEntries: [],
  financeWeeks: [],
  depositLog: []
}));

// depositLog: histórico PERMANENTE de depósitos, usado só pelo Financeiro
// (Página 5). Diferente de `deposits` (que Fim/Reinício do ciclo VIP zeram
// de propósito, ver ui-platform-manage.js), depositLog nunca é apagado —
// segue a mesma regra dos outros dados de histórico (withdrawals,
// betEntries): todo depósito lançado entra aqui e fica pra sempre, pra
// auditoria e pro cálculo da semana financeira nunca sumir sem querer.
export function normalizePlatformData(parsed) {
  if (!Array.isArray(parsed)) return null;
  return parsed.map((p, i) => {
    const deposits = Array.isArray(p.deposits) ? p.deposits : [];

    // Migração única: contas que ainda não tinham depositLog (campo novo)
    // ganham uma cópia do `deposits` atual como ponto de partida. Depois
    // dessa primeira normalização, o Firestore já salva depositLog de
    // verdade e essa cópia nunca mais roda pra essa conta (a condição do
    // if só é verdadeira quando o campo simplesmente não existe no doc).
    const depositLog = Array.isArray(p.depositLog) ? p.depositLog : deposits.slice();

    return {
      id: p.id || ('p' + (i + 1)),
      name: p.name || PLATFORM_NAMES[i] || ('P' + (i + 1)),
      lastResetDate: p.lastResetDate || null,
      deposits,
      betDays: Array.isArray(p.betDays) ? p.betDays : [],
      cycleEnded: p.cycleEnded === true,
      level: (p.level !== undefined && p.level !== null) ? p.level : null,
      group: p.group || null,
      withdrawals: Array.isArray(p.withdrawals) ? p.withdrawals : [],
      betEntries: Array.isArray(p.betEntries) ? p.betEntries : [],
      financeWeeks: Array.isArray(p.financeWeeks) ? p.financeWeeks : [],
      depositLog
    };
  });
}

export async function loadPlatformsFromFirestore(uid) {
  const colRef = collection(db, 'users', uid, 'platforms');
  const snap = await getDocs(colRef);

  if (!snap.empty) {
    return normalizePlatformData(snap.docs.map(d => d.data())) || [];
  }

  // Coleção vazia: usuário novo, ainda sem nenhuma plataforma salva no
  // Firestore. Cria o conjunto padrão de 33 plataformas para ele.
  const initial = DEFAULT_PLATFORMS.slice();
  const batch = writeBatch(db);
  initial.forEach(p => batch.set(doc(colRef, p.id), p));
  await batch.commit();
  return initial;
}

export function savePlatforms(uid, list) {
  if (!uid) return;
  const colRef = collection(db, 'users', uid, 'platforms');
  const batch = writeBatch(db);
  list.forEach(p => batch.set(doc(colRef, p.id), p));
  batch.commit().catch(err => console.error('Erro ao salvar no Firebase:', err));
}

export function deletePlatformDoc(uid, id) {
  if (!uid) return;
  deleteDoc(doc(db, 'users', uid, 'platforms', id))
    .catch(err => console.error('Erro ao remover no Firebase:', err));
}
