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
//
// === (Sub-entrega H) ===
// a) VIRADA DO DIA: com o Início aberto depois da meia-noite, o resumo do
//    topo ("Com bônus hoje" etc.), os "Códigos" e o "Depósitos - Hoje"
//    continuavam mostrando o dia anterior. Agora um timer (mesmo padrão
//    das outras views, 00:00:05) só recalcula a tela pro dia atual —
//    nenhuma gravação. Limpo no unmount().
// b) mountToken: se o usuário sair do Início enquanto o banner ainda
//    carrega, o cleanup do banner que chegar atrasado é executado na hora
//    (antes ficava pendurado sem ninguém pra limpar).

import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderHeroSummary } from './ui-hero.js';
import { initCodigoPanel, initDepositsTodayPanel, refreshCodigoPanels } from './ui-codigo.js';
import { initAnnouncementBanner } from './ui-announcement.js';

let depositsTodayCleanup = null;
let codigoCleanup = null;
let announcementCleanup = null;
let dailyTimer = null;
let mountToken = 0;

// (Sub-entrega H) Só recalcula a tela pro dia atual — nada é gravado.
function refreshForNewDay() {
  renderHeroSummary(computeHeroStats(state.platforms));
  refreshCodigoPanels();
}

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  dailyTimer = setTimeout(() => {
    dailyTimer = null;
    refreshForNewDay();
    scheduleDailyUpdate();
  }, nextMidnight - now);
}

export async function mount(container) {
  const token = ++mountToken;

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
            <span class="summary-label">Plataformas Monitoradas</span>
            <span class="summary-value" id="heroPlatformCount">0</span>
            <span class="summary-note" id="heroPlatformCountNote">0 plataformas ativas</span>
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
            <span class="summary-label">Plataforma com Maior Depósito</span>
            <span class="summary-value" id="heroNextHighlight">Em dia</span>
            <span class="summary-note" id="heroNextHighlightNote">Visualização rápida do momento atual.</span>
          </div>
        </div>
      </div>
    </section>
    <div class="hero-actions hub-actions">
      <a class="btn-primary" href="#/edicao">📝 Edição</a>
      <a class="btn-secondary" href="#/vip">Vip Bônus</a>
      <a class="btn-secondary" href="#/calendario">📅 Calendário</a>
      <a class="btn-secondary" href="#/financeiro">💰 Financeiro</a>
      <a class="btn-secondary" href="#/graficos">📊 Gráficos</a>
    </div>
    <div id="depositsTodayMount"></div>
    <div id="codigoMount"></div>
  `;
  renderHeroSummary(computeHeroStats(state.platforms));

  depositsTodayCleanup = initDepositsTodayPanel(document.getElementById('depositsTodayMount'));
  codigoCleanup = initCodigoPanel(document.getElementById('codigoMount'));
  scheduleDailyUpdate();

  const cleanup = await initAnnouncementBanner(document.getElementById('announcementMount'));
  if (token !== mountToken) {
    // Saiu do Início enquanto o banner carregava — limpa na hora.
    if (typeof cleanup === 'function') cleanup();
    return;
  }
  announcementCleanup = cleanup;
}

export function unmount() {
  mountToken++; // invalida um mount() ainda esperando o banner
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  if (depositsTodayCleanup) { depositsTodayCleanup(); depositsTodayCleanup = null; }
  if (codigoCleanup) { codigoCleanup(); codigoCleanup = null; }
  if (announcementCleanup) { announcementCleanup(); announcementCleanup = null; }
}
