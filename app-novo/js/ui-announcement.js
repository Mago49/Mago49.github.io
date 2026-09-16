// === BANNER DE AVISO INTERNO — Hub (Bloco G — Etapa 4, só leitura) ===
// Diferente do #safeModeBanner (fixo, global, todo o app), este banner é
// exclusivo da View Início — não aparece em Calendário/VIP/Edição/
// Financeiro. Renderizado dentro do fluxo normal da página (não fixo),
// no topo do Hub, acima do Hero.
//
// SÓ LEITURA nesta etapa: não existe nenhum botão de editar/desativar
// aqui — quem controla active/message é você, direto pela Etapa 5
// (editor na View Edição) ou manualmente no Firestore Console enquanto
// ela não existe. Sem botão de dispensar por sessão (decisão confirmada):
// o banner fica visível enquanto active for true, ponto.
//
// Não renderiza NADA (nem um <div> vazio) quando active é false ou a
// mensagem está vazia — evita um espaço em branco reservado à toa no
// topo do Hub.

import { loadAnnouncement } from './announcement-store.js';
import { escapeHtml } from './utils.js';

/**
 * Carrega e monta o banner dentro de `mountEl`, se houver um aviso ativo.
 * Chamado uma vez pela View Início, no mount(). Assíncrono (precisa
 * aguardar a leitura do Firestore) — view-inicio.js já usa await noutros
 * pontos (Bloco C usa init síncrono; aqui seguimos o mesmo padrão de
 * initObrigadoPanel/initMisteriosoPanel em ui-vip-panel.js, que também
 * são async).
 * @returns {() => void} cleanup — limpa o container ao desmontar a view.
 */
export async function initAnnouncementBanner(mountEl) {
  mountEl.innerHTML = '';

  const announcement = await loadAnnouncement();
  const hasContent = announcement.active && announcement.message.trim() !== '';

  if (!hasContent) {
    return function cleanup() {
      mountEl.innerHTML = '';
    };
  }

  const banner = document.createElement('div');
  banner.className = 'hub-announcement-banner';
  banner.innerHTML = `
    <span class="hub-announcement-icon" aria-hidden="true">📌</span>
    <span class="hub-announcement-text">${escapeHtml(announcement.message)}</span>
  `;
  mountEl.appendChild(banner);

  return function cleanup() {
    mountEl.innerHTML = '';
  };
}
