// === VIEW: Início (Página 1) ===
// mount()/unmount() chamados pelo router a cada troca de rota. Reaproveita
// 100% da lógica que já existia em main-inicio.js — só muda ONDE o HTML
// é escrito (container recebido do router, não mais o <main> fixo de um
// arquivo .html próprio).
import { state } from './state.js';
import { computeHeroStats } from './cycle-logic.js';
import { renderHeroSummary } from './ui-hero.js';

export function mount(container) {
  container.innerHTML = `
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
  `;
  renderHeroSummary(computeHeroStats(state.platforms));
}

export function unmount() {
  // Sem timers ou listeners próprios nesta view — nada pra limpar ainda.
}
