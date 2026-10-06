// === AVISO INTERNO DO HUB (Bloco G — leitura) ===
// Documento ÚNICO e GLOBAL do sistema — announcements/current — fora de
// qualquer namespace `users/{uid}`, de propósito: é um aviso do
// administrador pra todos os usuários, não um dado pessoal de conta. Por
// isso vive na raiz do Firestore, sem relação com o doc-sentinela
// (users/{uid}/meta/initialized) nem com a coleção `platforms`.
//
// PERMISSÕES (Regra de Segurança aplicada manualmente no Firebase
// Console — ver roteiro-execucao-fusao.md, Etapa 4):
//   - leitura: qualquer usuário autenticado.
//   - escrita: só o UID do administrador.
// Este arquivo não sabe nem precisa saber quem é o administrador — a
// regra é 100% do lado do Firestore.
//
// EXIBIÇÃO (leitura): loadAnnouncement() é consumida pelo Hub
// (ui-announcement.js) — banner não é global, vive dentro da View Início.
//
// (Sub-entrega D) EDITOR (view-edicao.js) usa duas funções novas:
//  - loadAnnouncementStrict: LANÇA erro se a leitura falhar. A versão
//    tolerante devolve "vazio/desativado" em falha — bom pro banner, mas
//    no editor isso abria os campos em branco e um "Salvar" APAGAVA a
//    mensagem real. Documento inexistente continua sendo o padrão (nunca
//    houve aviso), não erro.
//  - saveAnnouncement agora devolve Promise<{ok, error?}> e ESPERA o
//    commit — o editor só diz "Aviso salvo." quando o banco confirmou.
//    (Recusa por permissão também aparece como falha, não mais em silêncio.)

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_ANNOUNCEMENT = { active: false, message: '', updatedAt: null };

function getAnnouncementRef() {
  return doc(db, 'announcements', 'current');
}

function fromSnapshot(snap) {
  if (!snap.exists()) return { ...DEFAULT_ANNOUNCEMENT };
  const data = snap.data();
  return {
    active: data.active === true,
    message: typeof data.message === 'string' ? data.message : '',
    updatedAt: data.updatedAt || null
  };
}

// Lê o aviso atual. Nunca lança erro pra quem chama — em qualquer falha
// (documento ainda não existe, erro de rede), resolve com o padrão
// "inativo/vazio", que faz o banner simplesmente não aparecer. Mesmo
// espírito de vip-obrigado-store.js: ausência de configuração não é um
// estado de erro.
export async function loadAnnouncement() {
  try {
    return fromSnapshot(await getDoc(getAnnouncementRef()));
  } catch (err) {
    console.error('Erro ao carregar aviso interno:', err);
    return { ...DEFAULT_ANNOUNCEMENT };
  }
}

// (Sub-entrega D) Igual à anterior, mas falha de leitura LANÇA erro — usada
// SÓ pelo editor (ver nota no topo).
export async function loadAnnouncementStrict() {
  return fromSnapshot(await getDoc(getAnnouncementRef()));
}

// Grava o aviso. `active` e `message` são independentes de propósito —
// permite deixar uma mensagem escrita e só ativar/desativar depois, sem
// perder o texto. Só terá efeito de verdade quando chamada pelo UID
// autorizado pela Regra de Segurança (ver nota no topo do arquivo).
// (Sub-entrega D) Nunca lança: devolve { ok:true } ou { ok:false, error }.
export async function saveAnnouncement({ active, message }) {
  try {
    const batch = writeBatch(db);
    batch.set(getAnnouncementRef(), {
      active: active === true,
      message: typeof message === 'string' ? message : '',
      updatedAt: new Date().toISOString()
    });
    await batch.commit();
    return { ok: true };
  } catch (err) {
    console.error('Erro ao salvar aviso interno:', err);
    const denied = err && err.code === 'permission-denied';
    return {
      ok: false,
      error: denied
        ? 'O banco recusou a gravação (sem permissão de administrador). Nada foi alterado.'
        : 'Não foi possível salvar o aviso no banco de dados. Nada foi alterado — verifique a internet e tente de novo.'
    };
  }
}
