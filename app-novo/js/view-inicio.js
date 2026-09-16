// === VIEW: Início (Página 1) ===
// mount()/unmount() chamados pelo router a cada troca de rota. Reaproveita
// 100% da lógica que já existia em main-inicio.js — só muda ONDE o HTML
// é escrito (container recebido do router, não mais o <main> fixo de um
// arquivo .html próprio).
//
// === ETAPA 3 — Bloco C + Item 21 (novo) ===
// Dois painéis novos, montados/desmontados junto com o resto da view:
//   - "Depósitos - Hoje" (Item 21): paginação ← → entre plataformas que
//     depositaram hoje (ver ui-codigo.js / codigo-logic.js).
//   - "Códigos das Plataformas" (Bloco C, 11a-i): seletor busca+lista com
//     o código identificador + códigos condicionais de Depósito/Aposta
//     quando liberados no dia.
// Cadastro dos 3 códigos (codigoConfig/codigoDeposito/codigoAposta) ainda
// NÃO existe em nenhum sistema — fica pendente pra Etapa 5 (View Edição),
// ver nota de correção em lista-atualizacao-completa.md/Bloco C. Até lá,
// os dois painéis operam normalmente, só sem nenhum código pra exibir.
//
// === ETAPA 4 — Bloco G (novo) ===
// Banner de aviso interno, exclusivo desta view (NÃO é global como
// #safeModeBanner) — aparece só no Hub, no topo, acima do Hero. Só
// leitura nesta etapa: sem botão de editar/desativar aqui, sem botão de
// dispensar por sessão. Quem controla active/message é o editor da Etapa
// 5 (View Edição) ou, até lá, edição manual no Firestore Console. Por
// depender de leitura assíncrona do Firestore, mount() agora é async —
// isso não quebra o router (router-new.js chama view.mount() sem await;
// o resto da view já renderiza de forma síncrona antes do await, só o
// banner aparece um instante depois — mesmo padrão já usado em
// view-calendario-new.js com loadCardCustomization()/
// loadFullCalendarScript()).

import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderHeroSummary } from './ui-hero.js';
import { initCodigoPanel, initDepositsTodayPanel } from './ui-codigo.js';
import { initAnnouncementBanner } from './ui-announcement.js';

let depositsTodayCleanup = null;
let codigoCleanup = null;
let announcementCleanup = null;

export async function mount(container) {
  container.innerHTML = `
    <div id="announcementMount"></div>
    <section class="hero card-shell hub-hero" aria-label="Resumo da página">
      <div class="hero-content">
        <div>
          <span class="hero-badge">✨ Painel do Tigrinho 🐯</span>
          <h1>Gerencie ciclos, bônus e depósitos com mais clareza</h1>
          <p>Acompanhe suas plataformas em um layout mais moderno, organizado e fácil de usar.</p>
        </div>
        <div class="hero-summary" aria-label="Resumo geral">
          <div class="summary-card">
            <span class="summary-label">Plataformas</span>
            <span class="summary-value" id="heroPlatformCount">0</span>
            <span class="summary-note">Quantidade total monitorada no painel.</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Total acumulado</span>
            <span class="summary-value" id="heroTotalDeposits">R$ 0,00</span>
            <span class="summary-note">Soma dos depósitos do ciclo atual.</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Com bônus hoje</span>
            <span class="summary-value" id="heroBonusToday">0</span>
            <span class="summary-note">Plataformas com evento no dia atual.</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Status</span>
            <span class="summary-value" id="heroNextHighlight">Em dia</span>
            <span class="summary-note" id="heroNextHighlightNote">Visualização rápida do momento atual.</span>
          </div>
        </div>
      </div>
    </section>
    <div class="hero-actions hub-actions">
      <a class="btn-primary" href="#/edicao">Ver plataformas</a>
      <a class="btn-secondary" href="#/vip">Vip Bônus</a>
      <a class="btn-secondary" href="#/calendario">Ir para calendário</a>
      <a class="btn-secondary" href="#/financeiro">💰 Financeiro</a>
    </div>
    <div id="depositsTodayMount"></div>
    <div id="codigoMount"></div>
  `;
  renderHeroSummary(computeHeroStats(state.platforms));

  depositsTodayCleanup = initDepositsTodayPanel(document.getElementById('depositsTodayMount'));
  codigoCleanup = initCodigoPanel(document.getElementById('codigoMount'));
  announcementCleanup = await initAnnouncementBanner(document.getElementById('announcementMount'));
}

export function unmount() {
  if (depositsTodayCleanup) { depositsTodayCleanup(); depositsTodayCleanup = null; }
  if (codigoCleanup) { codigoCleanup(); codigoCleanup = null; }
  if (announcementCleanup) { announcementCleanup(); announcementCleanup = null; }
}
