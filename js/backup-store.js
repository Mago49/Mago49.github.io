// === BACKUP COMPLETO (somente LEITURA do Firestore) ===
// Lê tudo que pertence à conta (users/{uid}/...) e entrega como UM arquivo
// .json baixado direto no aparelho. NUNCA escreve nada no Firestore e não
// envia nada a nenhum servidor — o arquivo é montado no próprio navegador.
//
// Conteúdo:
//   collections: platforms, vipHistory, dailySnapshots, misteriosoTemplates
//                (cada documento como { id, data })
//   meta:        initialized, cardCustomization, obrigadoConfig, preferences
//                (null quando o documento ainda não existe)
//
// Formato versionado (BACKUP_FORMAT/BACKUP_VERSION) pra que uma futura
// restauração saiba o que está lendo. Restauração NÃO existe de propósito
// nesta etapa: é a operação mais perigosa do sistema e merece desenho próprio.
//
// Proteção contra falsa segurança: se a leitura das plataformas vier VAZIA,
// o backup NÃO é gerado — um arquivo vazio parecendo um backup válido seria
// pior do que nenhum (mesma classe do EMPTY_READ_ANOMALY em platforms-store).

import { db, collection, doc, getDoc, getDocs } from './firebase-init.js';

export const BACKUP_FORMAT = 'painel-tigrinho-backup';
export const BACKUP_VERSION = 1;

const COLLECTIONS = ['platforms', 'vipHistory', 'dailySnapshots', 'misteriosoTemplates'];
const META_DOCS = ['initialized', 'cardCustomization', 'obrigadoConfig', 'preferences'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function buildBackupFilename(date = new Date()) {
  return `backup-painel-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

// Lê tudo e devolve o objeto do backup. Lança Error (mensagem em português)
// em qualquer falha — nunca devolve um backup incompleto sem avisar.
export async function buildFullBackup(uid, now = new Date()) {
  if (!uid) throw new Error('Nenhum usuário logado.');

  const collections = {};
  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    collections[name] = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  }

  if (collections.platforms.length === 0) {
    throw new Error('A leitura das plataformas veio vazia — backup não gerado, pra não parecer que está tudo salvo. Verifique sua internet e tente de novo.');
  }

  const meta = {};
  for (const id of META_DOCS) {
    const snap = await getDoc(doc(db, 'users', uid, 'meta', id));
    meta[id] = snap.exists() ? snap.data() : null;
  }

  const counts = {};
  COLLECTIONS.forEach(name => { counts[name] = collections[name].length; });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    uid,
    counts,
    data: { collections, meta }
  };
}

// Dispara o download do JSON no navegador. Só existe no navegador (usa
// document/Blob) — buildFullBackup acima é a parte testável sem DOM.
function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois: revogar na hora pode cancelar o download em alguns navegadores móveis.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Gera o backup completo e baixa o arquivo.
 * @returns {Promise<{filename: string, counts: object, bytes: number, exportedAt: string}>}
 */
export async function exportFullBackup(uid) {
  const now = new Date();
  const backup = await buildFullBackup(uid, now);
  const text = JSON.stringify(backup);
  const filename = buildBackupFilename(now);
  downloadJson(filename, text);
  return { filename, counts: backup.counts, bytes: text.length, exportedAt: backup.exportedAt };
}
