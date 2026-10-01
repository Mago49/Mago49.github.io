// === CAMADA DE DADOS (Firestore) ===
// Único módulo que fala diretamente com o Firestore.
// Se um dia trocar de banco de dados, é aqui (e só aqui) que mexe.

import { db, collection, doc, getDoc, getDocs, deleteDoc, writeBatch } from './firebase-init.js';

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
      // id vem SEMPRE de d.id (injetado em loadPlatformsFromFirestore) —
      // o campo `id` dentro do documento nunca é a fonte de verdade.
      id: p.id,
      name: p.name || ('P' + (i + 1)),
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
      obrigadoDays: Array.isArray(p.obrigadoDays) ? p.obrigadoDays : [],
      misteriosoBonusLog: Array.isArray(p.misteriosoBonusLog) ? p.misteriosoBonusLog : [],
      // Etapa 7 — mesma regra defensiva dos demais logs permanentes:
      // contas que carregaram a conta antes desta funcionalidade existir
      // simplesmente começam com o array vazio, nunca `undefined`.
      otherBonusLog: Array.isArray(p.otherBonusLog) ? p.otherBonusLog : [],
      levelHistory: Array.isArray(p.levelHistory) ? p.levelHistory : [],
      codigoConfig: (p.codigoConfig && typeof p.codigoConfig === 'object')
        ? p.codigoConfig : { tipo: null, fixo: '', baseDate: null, variavelInicio: 0 },
      codigoDeposito: (p.codigoDeposito && typeof p.codigoDeposito === 'object')
        ? p.codigoDeposito : { fixo: '', baseDate: null, variavelInicio: 0, valorMinimo: 0 },
      codigoAposta: (p.codigoAposta && typeof p.codigoAposta === 'object')
        ? p.codigoAposta : { fixo: '', baseDate: null, variavelInicio: 0, valorMinimo: 0 }
    };
  });
}

// Referência do doc-sentinela: a ÚNICA prova de que "esta conta já foi
// inicializada alguma vez". Vive FORA da coleção `platforms` de propósito
// (users/{uid}/meta/initialized) — assim nunca é tocado por engano por
// nenhuma ação que mexe em plataformas (savePlatform,
// deletePlatformDoc). Uma vez gravado, nunca mais é escrito de novo.
function getInitializedSentinelRef(uid) {
  return doc(db, 'users', uid, 'meta', 'initialized');
}

// CORREÇÃO CRÍTICA (bug real, já causou perda de dados mais de uma vez):
// uma leitura vazia da coleção `platforms` (snap.empty === true) NUNCA
// pode ser tratada como sinônimo de "conta nova" com escrita de dados
// padrão — `snap.empty` não distingue "conta realmente nova" de "a
// leitura falhou/veio incompleta por instabilidade de rede" (o SDK pode
// devolver snapshot vazia sem lançar exceção).
//
// DOC-SENTINELA: `users/{uid}/meta/initialized` é a prova de que "esta
// conta já existiu antes". Vive FORA da coleção `platforms`.
//   - coleção com dados + sentinela existe   -> leitura normal.
//   - coleção com dados + sentinela AUSENTE  -> AUTOCURA: cria SÓ o
//     sentinela (nunca toca em plataformas). Best-effort: falha aqui
//     nunca impede o carregamento (só log).
//   - coleção vazia + sentinela NÃO existe   -> conta nova de verdade:
//     grava SÓ o sentinela e devolve lista vazia (conta abre vazia —
//     não existe mais conjunto padrão de plataformas).
//   - coleção vazia + sentinela EXISTE       -> leitura anômala: NUNCA
//     escreve nada, lança 'EMPTY_READ_ANOMALY' (ver auth-guard.js).
// Antes de considerar a leitura vazia, tenta uma segunda vez (pequena
// espera) pra absorver soluços passageiros de conexão.
//
// Toda escrita aqui passa pelo writeBatch de firebase-init.js, então
// SAFE_MODE continua bloqueando automaticamente.
function writeSentinelOnly(uid) {
  const batch = writeBatch(db);
  batch.set(getInitializedSentinelRef(uid), { createdAt: new Date().toISOString() });
  return batch.commit();
}

export async function loadPlatformsFromFirestore(uid) {
  const colRef = collection(db, 'users', uid, 'platforms');
  let snap = await getDocs(colRef);

  if (snap.empty) {
    await new Promise(resolve => setTimeout(resolve, 800));
    snap = await getDocs(colRef);
  }

  const sentinelRef = getInitializedSentinelRef(uid);

  if (!snap.empty) {
    // Autocura (somente criação): há plataformas mas o sentinela falta.
    // Fire-and-forget — NÃO bloqueia o carregamento (o resultado não
    // influencia o retorno). Falha só é logada. Escrita passa pelo
    // writeBatch de firebase-init.js, então SAFE_MODE bloqueia.
    getDoc(sentinelRef)
      .then(s => (s.exists() ? null : writeSentinelOnly(uid)))
      .catch(err => console.error('Sentinela: verificação/criação falhou (dados carregados normalmente):', err));
    // id SEMPRE de d.id, sobrepondo qualquer `id` salvo dentro do doc.
    return normalizePlatformData(snap.docs.map(d => ({ ...d.data(), id: d.id }))) || [];
  }

  const sentinelSnap = await getDoc(sentinelRef);

  if (sentinelSnap.exists()) {
    const err = new Error('Leitura vazia anômala: a conta já tem plataformas cadastradas, mas a coleção veio vazia nesta leitura. Nenhum dado foi apagado ou sobrescrito.');
    err.code = 'EMPTY_READ_ANOMALY';
    throw err;
  }

  // Sentinela não existe: primeira inicialização de verdade. Conta abre
  // vazia — grava só o sentinela.
  await writeSentinelOnly(uid);
  return [];
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
