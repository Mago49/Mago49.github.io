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
// regra é 100% do lado do Firestore. saveAnnouncement() simplesmente vai
// falhar (silenciosamente, como todo save* do projeto) se chamado por
// quem não tem permissão.
//
// EDITOR (escrita): a UI de edição só nasce na Etapa 5 (View Edição) —
// ver correção registrada em lista-atualizacao-completa.md/Bloco G. Este
// arquivo já expõe saveAnnouncement() pronta pra ser consumida por ela,
// sem precisar de nenhuma mudança aqui quando isso acontecer.
//
// EXIBIÇÃO (leitura): loadAnnouncement() é consumida agora, na Etapa 4,
// só pelo Hub (ui-announcement.js) — banner não é global, vive dentro da
// View Início.

import { db, doc, getDoc, writeBatch } from './firebase-init.js';

const DEFAULT_ANNOUNCEMENT = { active: false, message: '', updatedAt: null };

function getAnnouncementRef() {
  return doc(db, 'announcements', 'current');
}

// Lê o aviso atual. Nunca lança erro pra quem chama — em qualquer falha
// (documento ainda não existe, erro de rede), resolve com o padrão
// "inativo/vazio", que faz o banner simplesmente não aparecer. Mesmo
// espírito de vip-obrigado-store.js: ausência de configuração não é um
// estado de erro.
export async function loadAnnouncement() {
  try {
    const snap = await getDoc(getAnnouncementRef());
    if (!snap.exists()) return { ...DEFAULT_ANNOUNCEMENT };
    const data = snap.data();
    return {
      active: data.active === true,
      message: typeof data.message === 'string' ? data.message : '',
      updatedAt: data.updatedAt || null
    };
  } catch (err) {
    console.error('Erro ao carregar aviso interno:', err);
    return { ...DEFAULT_ANNOUNCEMENT };
  }
}

// Grava o aviso. `active` e `message` são independentes de propósito —
// permite deixar uma mensagem escrita e só ativar/desativar depois, sem
// perder o texto. Só terá efeito de verdade quando chamada pelo UID
// autorizado pela Regra de Segurança (ver nota no topo do arquivo); pra
// qualquer outro usuário, o commit falha e é só logado no console —
// mesmo padrão de tratamento de erro já usado em savePlatform/
// saveObrigadoValuePerAppearance (nunca lança, nunca trava a UI).
//
// NÃO CONSUMIDA AINDA nesta etapa — pronta pro editor da Etapa 5.
export function saveAnnouncement({ active, message }) {
  const batch = writeBatch(db);
  batch.set(getAnnouncementRef(), {
    active: active === true,
    message: typeof message === 'string' ? message : '',
    updatedAt: new Date().toISOString()
  });
  batch.commit().catch(err => console.error('Erro ao salvar aviso interno:', err));
}
