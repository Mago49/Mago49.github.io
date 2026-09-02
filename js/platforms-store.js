// === CAMADA DE DADOS (Firestore) ===
// Único módulo que fala diretamente com o Firestore.
// Se um dia trocar de banco de dados, é aqui (e só aqui) que mexe.

import { db, collection, doc, getDoc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';

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
  depositLog: [],
  balancePhases: [],
  obrigadoDays: []
}));

// depositLog: histórico PERMANENTE de depósitos, usado só pelo Financeiro
// (Página 5). Diferente de `deposits` (que Fim/Reinício do ciclo VIP zeram
// de propósito, ver ui-platform-manage.js), depositLog nunca é apagado —
// segue a mesma regra dos outros dados de histórico (withdrawals,
// betEntries): todo depósito lançado entra aqui e fica pra sempre.
//
// balancePhases: lista de fronteiras de fase do Saldo (ver startNewPhase
// em finance-logic.js) — array vazio quando nenhuma fase foi criada
// ainda (o Saldo conta desde o início, comportamento padrão).
//
// obrigadoDays: dias FIXOS do mês (1-31) em que a plataforma paga Bônus
// Obrigado — padrão que se repete todo mês, sem depender de ciclo/reset
// (Página 3, aba "Bônus Obrigado"). Array vazio = plataforma ainda não
// cadastrada em nenhum dia.
export function normalizePlatformData(parsed) {
  if (!Array.isArray(parsed)) return null;
  return parsed.map((p, i) => {
    const deposits = Array.isArray(p.deposits) ? p.deposits : [];

    // Migração única: contas que ainda não tinham depositLog (campo novo)
    // ganham uma cópia do `deposits` atual como ponto de partida. Depois
    // dessa primeira normalização, o Firestore já salva depositLog de
    // verdade e essa cópia nunca mais roda pra essa conta.
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
      depositLog,
      balancePhases: Array.isArray(p.balancePhases) ? p.balancePhases : [],
      obrigadoDays: Array.isArray(p.obrigadoDays) ? p.obrigadoDays : []
    };
  });
}

// Referência do doc-sentinela: a ÚNICA prova de que "esta conta já foi
// inicializada alguma vez". Vive FORA da coleção `platforms` de propósito
// (users/{uid}/meta/initialized) — assim nunca é tocado por engano por
// nenhuma ação que mexe em plataformas (savePlatform, savePlatforms,
// deletePlatformDoc). Uma vez gravado, nunca mais é escrito de novo.
function getInitializedSentinelRef(uid) {
  return doc(db, 'users', uid, 'meta', 'initialized');
}

// CORREÇÃO CRÍTICA (bug real, já causou perda de dados mais de uma vez):
// antes, uma leitura vazia da coleção `platforms` (snap.empty === true)
// era tratada como sinônimo de "conta nova" e disparava a criação dos 33
// documentos padrão — SOBRESCREVENDO os 33 documentos existentes, já que
// os ids (p1...p33) são sempre os mesmos. O problema: `snap.empty` não
// distingue "conta realmente nova" de "a leitura falhou/veio incompleta
// por instabilidade de rede" — o SDK do Firestore pode devolver uma
// snapshot vazia sem lançar nenhuma exceção nesse cenário. Resultado:
// perda total e silenciosa de nível VIP, depósitos, saques, semanas
// fechadas e fases — sem nenhum erro visível avisando que algo deu
// errado.
//
// SOLUÇÃO — doc-sentinela: `users/{uid}/meta/initialized` é gravado UMA
// única vez, no mesmo batch atômico que cria as 33 plataformas padrão, e
// nunca mais é tocado depois disso. Ele vira a fonte de verdade sobre
// "essa conta já existiu antes", independente do que a leitura da
// coleção `platforms` disser num instante específico:
//   - coleção vazia + sentinela NÃO existe -> conta genuinamente nova,
//     cria os 33 documentos padrão (comportamento de sempre).
//   - coleção vazia + sentinela EXISTE -> leitura anômala (rede/cache),
//     NUNCA escreve nada — lança um erro com code 'EMPTY_READ_ANOMALY'
//     pra quem chamou decidir o que fazer (ver auth-guard.js, que trata
//     esse erro de forma diferente de um erro de conexão comum: mostra
//     um aviso específico e NÃO deixa a página seguir com dados vazios).
//
// Antes de sequer cogitar a leitura como "vazia de verdade", tenta ler a
// coleção uma segunda vez (com uma pequena espera) — absorve soluços
// passageiros de conexão sem gerar alarme falso nem, no outro extremo,
// arriscar apagar dados por causa de uma falha momentânea.
export async function loadPlatformsFromFirestore(uid) {
  const colRef = collection(db, 'users', uid, 'platforms');
  let snap = await getDocs(colRef);

  if (snap.empty) {
    await new Promise(resolve => setTimeout(resolve, 800));
    snap = await getDocs(colRef);
  }

  if (!snap.empty) {
    return normalizePlatformData(snap.docs.map(d => d.data())) || [];
  }

  const sentinelRef = getInitializedSentinelRef(uid);
  const sentinelSnap = await getDoc(sentinelRef);

  if (sentinelSnap.exists()) {
    // Conta já foi inicializada antes (sentinela existe), mas a coleção
    // de plataformas veio vazia mesmo após a segunda tentativa — isso
    // nunca deveria acontecer numa leitura saudável. Recusa escrever
    // qualquer coisa e devolve o erro pra camada de auth decidir a UI.
    const err = new Error('Leitura vazia anômala: a conta já tem plataformas cadastradas, mas a coleção veio vazia nesta leitura. Nenhum dado foi apagado ou sobrescrito.');
    err.code = 'EMPTY_READ_ANOMALY';
    throw err;
  }

  // Sentinela não existe: primeira inicialização de verdade desta conta.
  const initial = DEFAULT_PLATFORMS.slice();
  const batch = writeBatch(db);
  initial.forEach(p => batch.set(doc(colRef, p.id), p));
  batch.set(sentinelRef, { createdAt: new Date().toISOString() });
  await batch.commit();
  return initial;
}

// Salva TODAS as plataformas de uma vez — reescreve os 33 documentos.
// USAR SÓ pra ações em massa de verdade (ex: "Iniciar nova fase em todas
// as plataformas" no Painel Geral do Financeiro). Chamar isso a partir de
// uma aba com dados desatualizados em memória sobrescreve no Firestore
// qualquer alteração feita por OUTRA aba nesse meio tempo — foi essa a
// causa da perda de dados de nível VIP/depósitos quando várias páginas
// ficam abertas ao mesmo tempo. Pra qualquer ação que mexe em UMA única
// plataforma (a grande maioria dos botões do app), usar savePlatform.
export function savePlatforms(uid, list) {
  if (!uid) return;
  const colRef = collection(db, 'users', uid, 'platforms');
  const batch = writeBatch(db);
  list.forEach(p => batch.set(doc(colRef, p.id), p));
  batch.commit().catch(err => console.error('Erro ao salvar no Firebase:', err));
}

// Salva UMA única plataforma (não reescreve as outras 32). Usar sempre
// que a ação do usuário mexeu em só uma plataforma — o que é o caso da
// grande maioria dos botões do app. Evita que uma aba com dados
// desatualizados em memória apague alterações feitas por outra aba.
export function savePlatform(uid, platform) {
  if (!uid) return;
  const colRef = collection(db, 'users', uid, 'platforms');
  const batch = writeBatch(db);
  batch.set(doc(colRef, platform.id), platform);
  batch.commit().catch(err => console.error('Erro ao salvar no Firebase:', err));
}

export function deletePlatformDoc(uid, id) {
  if (!uid) return;
  deleteDoc(doc(db, 'users', uid, 'platforms', id))
    .catch(err => console.error('Erro ao remover no Firebase:', err));
}
