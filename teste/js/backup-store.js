// === BACKUP COMPLETO (somente LEITURA do Firestore) ===
// Lê tudo que pertence à conta (users/{uid}/...) e entrega como arquivo(s)
// .json baixado(s) direto no aparelho. Não envia nada a nenhum servidor —
// o arquivo é montado no próprio navegador.
//
// Conteúdo:
//   collections: platforms, vipHistory, dailySnapshots, misteriosoTemplates,
//                vipBonusTemplates, wagerRequirements, betPlans, plannerConfig,
//                routines, routineLog, routineMarks, planLog,
//                gameCatalog, gameConfig, platformTraits
//                (cada documento como { id, data })
//   meta:        initialized, cardCustomization, obrigadoConfig, preferences,
//                backupInfo
//                (null quando o documento ainda não existe)
//
// Formato versionado (BACKUP_FORMAT/BACKUP_VERSION) pra que uma futura
// restauração saiba o que está lendo. Restauração NÃO existe de propósito
// nesta etapa: é a operação mais perigosa do sistema e merece desenho próprio.
//
// Proteção contra falsa segurança: se a leitura das plataformas vier VAZIA,
// o backup NÃO é gerado — um arquivo vazio parecendo um backup válido seria
// pior do que nenhum (mesma classe do EMPTY_READ_ANOMALY em platforms-store).
//
// (Total Apostado — Sub-entrega 4) wagerRequirements (tabelas de Aposta
// Necessária por template VIP) entra na lista de coleções. BACKUP_VERSION
// continua 1: o formato não mudou, só ganhou uma coleção a mais (backups
// antigos simplesmente não têm a chave).
//
// (Planejador — Sub-entrega 5) betPlans (planos de aposta, 1 por
// plataforma) e plannerConfig (paleta de valores) entram na lista. Mesma
// regra: formato inalterado, só coleções a mais.
//
// (Rotinas — Sub-entrega 6) routines, routineLog (histórico diário) e
// routineMarks (lembretes marcados) entram na lista.
//
// (Calendário — Sub-entrega 8b) planLog (histórico do planejado, 1 doc
// por dia × plataforma) entra na lista.
//
// (Jogos — Sub-entrega 9) gameCatalog (biblioteca de jogos) e gameConfig
// (lista de provedores) entram na lista.
// (Sub-entrega 11a) platformTraits (características das plataformas) entra
// na lista (backup-logic.js COLLECTIONS).
//
// === (Sub-entrega 10) TAMANHO E DIVISÃO ===
// a) prepareBackup(uid, { mode, partLimitMB }) lê, mede (tamanho REAL no
//    Firestore pela fórmula oficial — backup-logic.js), divide em partes e
//    CONFERE as partes contra o que foi lido (verifyParts). Qualquer falha
//    de leitura ou de conferência = erro, nada é baixado.
// b) mode 'full' (Completo) ou 'diff' (Só o novo desde o último COMPLETO):
//    no 'diff' só os históricos com id por data são filtrados no próprio
//    banco (documentId >= limite, 7 dias de folga); o resto vem inteiro.
// c) meta/backupInfo (ÚNICA gravação deste arquivo): data do último
//    completo/último backup + limite por parte. Gravado só DEPOIS que
//    todas as partes foram baixadas (recordBackupDone). Falhar essa
//    gravação não estraga o arquivo — só o próximo "Só o novo" não sabe a
//    data nova.
// d) Formato continua BACKUP_VERSION 1; ganhou campos (backupId, mode,
//    since, part, totalParts, manifest, sizeReport). Backups antigos seguem
//    válidos.

import {
  db, collection, doc, getDoc, getDocs, query, where, documentId, writeBatch
} from './firebase-init.js';
import { state } from './state.js';
import {
  BACKUP_FORMAT, BACKUP_VERSION, COLLECTIONS, META_DOCS, DIFF_COLLECTIONS,
  buildSizeReport, splitBackup, verifyParts, diffSinceKeys, filterSince, newBackupId,
  cleanBackupInfo, DEFAULT_PART_LIMIT_MB, PART_LIMIT_OPTIONS_MB, buildFilename
} from './backup-logic.js';

export { BACKUP_FORMAT, BACKUP_VERSION };

let infoCache = null; // { uid, info }

function infoRef(uid) {
  return doc(db, 'users', uid, 'meta', 'backupInfo');
}

// Nome do arquivo único (compatibilidade com quem ainda chama).
export function buildBackupFilename(date = new Date()) {
  return buildFilename(date, 'full', 1, 1);
}

/** Leitura ESTRITA de meta/backupInfo (lança em falha). */
export async function loadBackupInfo(uid) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const snap = await getDoc(infoRef(uid));
  const info = cleanBackupInfo(snap.exists() ? snap.data() : null);
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura.');
  infoCache = { uid, info };
  return info;
}

export function getCachedBackupInfo(uid = state.currentUid) {
  return infoCache && infoCache.uid === uid ? { ...infoCache.info } : null;
}

async function readCollection(uid, name, since) {
  const col = collection(db, 'users', uid, name);
  const kind = DIFF_COLLECTIONS[name];
  if (since && kind) {
    const min = kind === 'month' ? since.monthKey : since.dayKey;
    const snap = await getDocs(query(col, where(documentId(), '>=', min)));
    // Confere no cliente também (mesmo critério) — nunca entra nada de fora.
    return filterSince(snap.docs.map(d => ({ id: d.id, data: d.data() })), kind, since);
  }
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}

// Lê tudo e devolve o objeto do backup (arquivo único, formato antigo).
// Lança Error (mensagem em português) em qualquer falha.
export async function buildFullBackup(uid, now = new Date()) {
  const r = await readAll(uid, null);
  const counts = {};
  COLLECTIONS.forEach(name => { counts[name] = r.collections[name].length; });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    uid,
    counts,
    data: { collections: r.collections, meta: r.meta }
  };
}

async function readAll(uid, since) {
  if (!uid) throw new Error('Nenhum usuário logado.');
  const collections = {};
  for (const name of COLLECTIONS) {
    collections[name] = await readCollection(uid, name, since);
  }
  if (collections.platforms.length === 0) {
    throw new Error('A leitura das plataformas veio vazia — backup não gerado, pra não parecer que está tudo salvo. Verifique sua internet e tente de novo.');
  }
  const meta = {};
  for (const id of META_DOCS) {
    const snap = await getDoc(doc(db, 'users', uid, 'meta', id));
    meta[id] = snap.exists() ? snap.data() : null;
  }
  if (state.currentUid !== uid) throw new Error('A sessão mudou durante a leitura — backup cancelado.');
  return { collections, meta };
}

/**
 * Lê, mede, divide e confere. NÃO baixa nada.
 * @returns {Promise<{ backupId, mode, since, now, report, parts, docs, partLimitMB }>}
 */
export async function prepareBackup(uid, { mode = 'full', partLimitMB = DEFAULT_PART_LIMIT_MB } = {}) {
  const now = new Date();
  let since = null;
  if (mode === 'diff') {
    const info = getCachedBackupInfo(uid);
    since = info ? diffSinceKeys(info.lastFullAt) : null;
    if (!since) throw new Error('Ainda não existe backup completo registrado — faça um "Completo" primeiro.');
  }
  const limitMB = PART_LIMIT_OPTIONS_MB.includes(Number(partLimitMB)) ? Number(partLimitMB) : DEFAULT_PART_LIMIT_MB;
  const { collections, meta } = await readAll(uid, since);
  const report = buildSizeReport(uid, collections, meta);
  const backupId = newBackupId(now);
  const parts = splitBackup({ uid, now, mode, since, backupId, collections, meta, report }, limitMB * 1048576);
  const check = verifyParts(parts, collections, meta);
  if (!check.ok) throw new Error(`Conferência do arquivo falhou: ${check.error} Nada foi baixado.`);
  return { backupId, mode, since, now, report, parts, docs: check.docs, partLimitMB: limitMB };
}

// Dispara o download do JSON no navegador.
export function downloadBackupPart(part) {
  const blob = new Blob([part.text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = part.filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois: revogar na hora pode cancelar o download em alguns navegadores móveis.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function writeInfo(uid, info) {
  const data = {
    partLimitMB: info.partLimitMB,
    lastFullAt: info.lastFullAt || null,
    lastFullId: info.lastFullId || null,
    lastAt: info.lastAt || null,
    lastMode: info.lastMode || null,
    lastId: info.lastId || null,
    lastParts: info.lastParts ?? null,
    lastDocs: info.lastDocs ?? null,
    lastTotalBytes: info.lastTotalBytes ?? null,
    updatedAt: new Date().toISOString()
  };
  const batch = writeBatch(db);
  batch.set(infoRef(uid), data);
  return batch.commit();
}

/** Registra o backup no banco depois de TODAS as partes baixadas. */
export async function recordBackupDone(uid, prepared) {
  const cur = getCachedBackupInfo(uid);
  if (!cur) return { ok: false, error: 'Registro do último backup não foi lido — o arquivo está salvo, mas a data não foi registrada.' };
  const at = prepared.now.toISOString();
  const next = {
    ...cur,
    partLimitMB: prepared.partLimitMB,
    lastAt: at,
    lastMode: prepared.mode,
    lastId: prepared.backupId,
    lastParts: prepared.parts.length,
    lastDocs: prepared.docs
  };
  if (prepared.mode === 'full') {
    next.lastFullAt = at;
    next.lastFullId = prepared.backupId;
    next.lastTotalBytes = prepared.report.totalBytes;
  }
  try {
    await writeInfo(uid, next);
  } catch (e) {
    console.error('Erro ao registrar o backup:', e);
    return { ok: false, error: 'O arquivo está salvo no aparelho, mas não deu pra registrar a data no banco (internet?). O próximo "Só o novo" vai usar a data anterior.' };
  }
  if (state.currentUid !== uid) return { ok: false, error: 'A sessão mudou.' };
  infoCache = { uid, info: next };
  return { ok: true, info: { ...next } };
}

/** Salva só o limite por parte (escolha do usuário). */
export async function savePartLimit(uid, mb) {
  const cur = getCachedBackupInfo(uid);
  if (!cur) return { ok: false, error: 'Registro do backup não carregado.' };
  if (!PART_LIMIT_OPTIONS_MB.includes(Number(mb))) return { ok: false, error: 'Limite inválido.' };
  const next = { ...cur, partLimitMB: Number(mb) };
  try {
    await writeInfo(uid, next);
  } catch (e) {
    console.error('Erro ao salvar limite do backup:', e);
    return { ok: false, error: 'Não foi possível salvar o limite. Nada mudou.' };
  }
  infoCache = { uid, info: next };
  return { ok: true };
}

/**
 * (compatibilidade) Backup completo em arquivo único — mesmo comportamento
 * de antes da Sub-entrega 10.
 */
export async function exportFullBackup(uid) {
  const now = new Date();
  const backup = await buildFullBackup(uid, now);
  const text = JSON.stringify(backup);
  const filename = buildBackupFilename(now);
  downloadBackupPart({ filename, text });
  return { filename, counts: backup.counts, bytes: text.length, exportedAt: backup.exportedAt };
}
