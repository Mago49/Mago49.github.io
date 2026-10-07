// === CAMADA DE DADOS (Firestore) ===
// Único módulo que fala diretamente com o Firestore.
// Se um dia trocar de banco de dados, é aqui (e só aqui) que mexe.

import { db, collection, doc, getDoc, getDocs, deleteDoc, writeBatch, showSaveFailureToast, showStaleDataBanner } from './firebase-init.js';

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
//
// (Total Apostado — Sub-entrega 2) wagerAnchors: histórico de REFERÊNCIAS
// do total apostado real ({ id, at, value, createdAt } — ver
// wager-total-logic.js). OBRIGATÓRIO estar aqui: este normalize monta o
// objeto só com os campos que conhece e savePlatform grava o documento
// INTEIRO (batch.set sem merge) — um campo ausente daqui seria apagado do
// banco no próximo salvamento de qualquer tela. Mesmo padrão defensivo dos
// outros logs: conta antiga começa com array vazio, nunca `undefined`.
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
      // SUB-ENTREGA 5 — número de revisão do documento. Cada gravação soma
      // 1; a Regra de Segurança do Firestore só aceita a gravação se este
      // número for exatamente (revisão do servidor + 1) — assim uma aba ou
      // aparelho com dado velho NUNCA sobrescreve dado mais novo. Plataformas
      // antigas (sem o campo) começam em 0.
      rev: Number.isFinite(Number(p.rev)) ? Number(p.rev) : 0,
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
      // (Total Apostado — Sub-entrega 2) ver nota no topo do arquivo.
      wagerAnchors: Array.isArray(p.wagerAnchors) ? p.wagerAnchors : [],
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
    const loaded = normalizePlatformData(snap.docs.map(d => ({ ...d.data(), id: d.id }))) || [];
    registerPlatformBaselines(loaded);
    return loaded;
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

// ============================================================
// SUB-ENTREGA 5 — PROTEÇÃO CONTRA SOBRESCRITA
// ============================================================
// Toda gravação de plataforma passa por savePlatform — por isso a proteção
// mora aqui, num lugar só. Duas travas, contra causas diferentes:
//
// A) TRAVA DE ENCOLHIMENTO (cliente): memória incompleta ou vazia nunca
//    sobrescreve um documento cheio. Guardamos o TAMANHO de cada histórico
//    no momento em que a plataforma foi carregada (ou gravada pela última
//    vez); se um histórico vier com MENOS itens, a gravação é recusada —
//    a menos que a ação seja uma exclusão deliberada, que declara
//    explicitamente quais campos podem encolher (options.allowShrink).
//    Esquecer de declarar nunca perde dado: só bloqueia a gravação.
//
// B) REVISÃO `rev` (servidor): cada gravação soma 1 em platform.rev e a
//    Regra de Segurança do Firestore recusa se não for (rev do servidor +
//    1). Aba/aparelho antigo é recusado em vez de sobrescrever. Sem a
//    regra publicada, o campo é só guardado (nada quebra).
//
// (Sub-entrega C) `rev` NUNCA FICA À FRENTE DO SERVIDOR POR ENGANO:
// antes, o `rev` em memória subia antes do envio e não voltava se a
// gravação falhasse por outro motivo que não conflito (documento grande
// demais, dado recusado pelo SDK, cota etc.). A memória ficava em
// servidor+2 na próxima gravação, a regra recusava como se fosse conflito
// e o app TRAVAVA (banner vermelho) sem ter havido conflito nenhum.
// Agora:
//   - `batch.set` dentro de try/catch: dado recusado na montagem (ex.:
//     campo `undefined`) devolve o `rev` ao valor anterior, avisa e não
//     grava nada — antes estourava erro no clique depois do `rev` subir;
//   - commit recusado por permission-denied (conflito/sessão): continua
//     travando e mostrando o banner, como sempre;
//   - commit falhou por QUALQUER outro motivo: o `rev` volta pro valor
//     anterior — mas só se nenhuma gravação desta plataforma foi enviada
//     depois desta (se foi, ela carrega o `rev` seguinte e o servidor
//     decide). A alteração continua na tela e vai junto na próxima
//     gravação bem-sucedida (o documento é gravado inteiro). O aviso
//     genérico de firebase-init.js (showSaveFailureToast) já aparece.
//
// (Total Apostado — Sub-entrega 2) 'wagerAnchors' entra na trava de
// encolhimento: só a exclusão deliberada de uma referência (que passa
// allowShrink: ['wagerAnchors']) pode diminuir a lista. A segunda barreira
// é a Regra do Firestore, que recusa qualquer gravação que REMOVA o campo
// de um documento que já o tem (protege contra aparelho/aba com JS antigo,
// que não conhece o campo).
const GUARDED_FIELDS = [
  'depositLog', 'deposits', 'withdrawals', 'betEntries', 'financeWeeks',
  'otherBonusLog', 'balancePhases', 'betDays', 'misteriosoBonusLog',
  'obrigadoDays', 'levelHistory', 'wagerAnchors'
];

// id da plataforma -> { campo: quantidade de itens } (carga ou última gravação)
const platformBaselines = new Map();

// Depois de um conflito recusado pelo servidor, nenhuma gravação segue até
// recarregar: tudo que viesse depois seria recusado do mesmo jeito.
let writesLocked = false;

function recordBaseline(platform) {
  const lengths = {};
  GUARDED_FIELDS.forEach(f => { lengths[f] = Array.isArray(platform[f]) ? platform[f].length : 0; });
  platformBaselines.set(platform.id, lengths);
}

function registerPlatformBaselines(list) {
  platformBaselines.clear();
  (list || []).forEach(p => { if (p && p.id) recordBaseline(p); });
}

function checkPlatformBeforeSave(platform, allowShrink) {
  const fail = (reason) => ({ ok: false, reason });
  if (!platform || typeof platform !== 'object') return fail('plataforma inválida');
  if (typeof platform.id !== 'string' || !platform.id) return fail('plataforma sem id');
  if (typeof platform.name !== 'string' || !platform.name.trim() || platform.name.length > 40) {
    return fail('nome da plataforma inválido');
  }

  const allowed = new Set(Array.isArray(allowShrink) ? allowShrink : []);
  const base = platformBaselines.get(platform.id);
  if (base) {
    for (const f of GUARDED_FIELDS) {
      const before = base[f] || 0;
      if (!Array.isArray(platform[f])) {
        if (before > 0 && !allowed.has(f)) return fail(`o campo "${f}" sumiu (tinha ${before} itens)`);
        continue;
      }
      if (platform[f].length < before && !allowed.has(f)) {
        return fail(`"${f}" ficaria com ${platform[f].length} item(ns) (tinha ${before})`);
      }
    }
  }
  return { ok: true };
}

// Salva UMA única plataforma (não reescreve as outras 32). Usar sempre
// que a ação do usuário mexeu em só uma plataforma — o que é o caso da
// grande maioria dos botões do app. Evita que uma aba com dados
// desatualizados em memória apague alterações feitas por outra aba.
//
// options.allowShrink: lista de campos que ESTA ação pode encolher de
// propósito (ex: excluir depósito -> ['deposits', 'depositLog']).
// Retorna true se a gravação foi enviada, false se foi bloqueada.
export function savePlatform(uid, platform, options = {}) {
  if (!uid) return false;

  if (writesLocked) {
    showStaleDataBanner();
    return false;
  }

  const check = checkPlatformBeforeSave(platform, options.allowShrink);
  if (!check.ok) {
    console.error('Gravação da plataforma BLOQUEADA por segurança:', check.reason, platform && platform.name);
    showSaveFailureToast(
      `Gravação bloqueada por segurança (${check.reason}). Nada foi alterado no banco de dados. Recarregue a página e tente de novo.`,
      true
    );
    return false;
  }

  const previousRev = Number(platform.rev) || 0;
  const sentRev = previousRev + 1;
  platform.rev = sentRev;

  const colRef = collection(db, 'users', uid, 'platforms');
  const batch = writeBatch(db);
  try {
    batch.set(doc(colRef, platform.id), platform);
  } catch (err) {
    // (Sub-entrega C) Dado recusado pelo SDK antes de sair do aparelho —
    // nada foi enviado: `rev` volta e a gravação é recusada com aviso.
    platform.rev = previousRev;
    console.error('Gravação da plataforma recusada pelo banco (dado inválido) — nada foi enviado:', err, platform.name);
    showSaveFailureToast(
      'Não foi possível salvar: um dado desta plataforma foi recusado pelo banco. Nada foi alterado no banco de dados. Recarregue a página e tente de novo.',
      true
    );
    return false;
  }

  batch.commit().catch(err => {
    console.error('Erro ao salvar no Firebase:', err);
    // O servidor recusou (regra de revisão, ou sessão sem permissão): trava
    // as próximas gravações e avisa de forma que não passe batido.
    if (err && err.code === 'permission-denied') {
      writesLocked = true;
      showStaleDataBanner();
      return;
    }
    // (Sub-entrega C) Outra falha: o servidor continua no `rev` anterior.
    // Volta a memória — só se nenhuma gravação mais nova desta plataforma
    // já saiu (nesse caso ela já carrega o `rev` seguinte).
    if (platform.rev === sentRev) {
      platform.rev = previousRev;
    }
  });

  recordBaseline(platform);
  return true;
}

// (Sub-entrega D) Devolve Promise<{ok:true} | {ok:false, error}> e nunca
// lança. Antes a tela tirava a plataforma da lista sem esperar: se a
// exclusão falhasse, ela sumia da tela mas continuava no banco e voltava
// no próximo login. Agora quem chama só tira da memória quando o banco
// confirma. Bloqueada (como savePlatform) depois de um conflito recusado.
export function deletePlatformDoc(uid, id) {
  if (!uid || !id) return Promise.resolve({ ok: false, error: 'Plataforma inválida.' });
  if (writesLocked) {
    showStaleDataBanner();
    return Promise.resolve({ ok: false, error: 'Seus dados mudaram em outro aparelho ou aba. Recarregue a página antes de remover.' });
  }
  return deleteDoc(doc(db, 'users', uid, 'platforms', id))
    .then(() => {
      platformBaselines.delete(id);
      return { ok: true };
    })
    .catch(err => {
      console.error('Erro ao remover no Firebase:', err);
      return { ok: false, error: 'Não foi possível remover a plataforma no banco de dados. Nada foi apagado — verifique a internet e tente de novo.' };
    });
}
