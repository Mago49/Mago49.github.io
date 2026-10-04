// === VIEW: VIP (Página 3) — Etapa 6, COMPLETA (4 sub-entregas) ===
// mount()/unmount() chamados pelo router a cada troca de rota. Migração
// completa de vip.html (Sistema 1): 4 abas — Bônus VIP, Bônus Obrigado,
// Bônus Misterioso (com Bloco E — colar planilha + exclusividade de
// template) e Histórico Mensal (Bloco A, novo).
//
// CUIDADO, exclusivo da SPA (Bloco K, item K2): dailyTimer precisa de
// clearTimeout() no unmount() — sem isso, cada visita a esta rota
// empilharia um novo setTimeout, duplicando renderVipPanel() a cada
// virada de dia. Mesmo padrão já aplicado em view-calendario-new.js.
// Só a aba VIP depende da virada diária (Obrigado é padrão mensal fixo,
// Misterioso só muda quando um evento entra/sai da janela de 7 dias —
// resolvido sozinho na próxima renderização da aba).
//
// initVipFilters()/initVipTabs() só registram listeners em elementos
// DENTRO do container (nunca em document) — não precisam de cleanup
// próprio: são descartados junto com o DOM quando o router substitui
// container.innerHTML na próxima troca de rota.
//
// ORDEM DO mount(): initObrigadoPanel() e initMisteriosoPanel() carregam
// dado do Firestore (obrigadoValuePerAppearance, misteriosoTemplates) que
// ficam em variáveis de módulo dentro de ui-vip-panel.js — initHistoryTab()
// PRECISA rodar por último, depois das outras duas, porque reaproveita
// esses 2 valores já carregados em vez de buscar de novo (ver
// checkAndCloseMonthlyHistory em vip-history-store.js).

import { renderVipPanel, initVipFilters, initVipTabs, initObrigadoPanel, initMisteriosoPanel, initHistoryTab } from './ui-vip-panel.js';

let dailyTimer = null;

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    renderVipPanel();
    scheduleDailyUpdate();
  }, ms);
}

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h1>Painel VIP</h1>
        <p>Resumo diário, semanal e mensal por plataforma e grupo.</p>
      </div>
    </div>

    <section class="card-shell vip-card" aria-label="Bônus">
      <div class="vip-tabs" role="tablist" aria-label="Tipo de bônus">
        <button type="button" class="vip-tab-btn active" data-tab="vip">Bônus VIP</button>
        <button type="button" class="vip-tab-btn" data-tab="obrigado">Bônus Obrigado</button>
        <button type="button" class="vip-tab-btn" data-tab="misterioso">Bônus Misterioso</button>
        <button type="button" class="vip-tab-btn" data-tab="historico">Histórico Mensal</button>
      </div>

      <div class="vip-tab-panel" data-tab-panel="vip">
        <div id="vipTotals" class="vip-totals"></div>

        <div class="vip-filter-bar">
          <input type="search" id="vipSearch" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
          <button type="button" class="vip-filter-btn active" data-group="all">ALL</button>
          <button type="button" class="vip-filter-btn" data-group="com">COM APOSTA</button>
          <button type="button" class="vip-filter-btn" data-group="sem">SEM APOSTA</button>
        </div>

        <div id="vipSummary" class="vip-summary"></div>
      </div>

      <div class="vip-tab-panel app-hidden" data-tab-panel="obrigado">
        <div class="section-heading" style="padding:0 0 0.9rem;">
          <div>
            <h2>Obrigado Membros!</h2>
            <p>Previsão do Bônus Obrigado — soma quantas vezes cada plataforma aparece no mês × o valor por aparição.</p>
          </div>
        </div>

        <div class="obrigado-controls">
          <label for="obrigadoValueInput">Valor por aparição</label>
          <input type="number" id="obrigadoValueInput" min="0" step="0.01" />
          <span class="finance-week-label">Previsão do mês: <strong id="obrigadoTotal">R$ 0,00</strong></span>
          <button type="button" id="obrigadoEditBtn" class="bet-manage-btn">✏️ Editar</button>
        </div>

        <div id="obrigadoAddForm" class="obrigado-add-form app-hidden"></div>

        <div id="obrigadoGrid" class="obrigado-grid"></div>
      </div>

      <div class="vip-tab-panel app-hidden" data-tab-panel="misterioso">
        <div class="section-heading" style="padding:0 0 0.9rem;">
          <div>
            <h2>Bônus Misterioso</h2>
            <p>Veja a previsão de valor total do Bônus Misterioso!</p>
          </div>
        </div>

        <div class="misterioso-controls">
          <label for="misteriosoMonthInput">Mês</label>
          <input type="month" id="misteriosoMonthInput" />
          <span class="finance-week-label">Previsão do mês: <strong id="misteriosoTotal">R$ 0,00</strong></span>
          <button type="button" id="misteriosoManageBtn" class="bet-manage-btn">⚙️ Gerenciar templates</button>
        </div>
        <p id="misteriosoForecastNote" class="finance-close-week-note" style="padding:0 1.1rem 0.6rem;"></p>

        <div id="misteriosoTemplateManager" class="misterioso-template-manager app-hidden"></div>

        <div class="section-heading" style="padding:0.5rem 0 0.5rem;">
          <div>
            <h3>Eventos para revisar (últimos 7 dias)</h3>
            <p>Valor inicial é sempre o mínimo do patamar alcançado — edite se o valor real recebido foi diferente.</p>
          </div>
        </div>

        <div id="misteriosoEventsList" class="misterioso-events-list"></div>
        <div id="misteriosoLoadMoreWrap" style="padding:0 1.1rem 1.1rem; display:flex; justify-content:center;"></div>
      </div>

      <div class="vip-tab-panel app-hidden" data-tab-panel="historico">
        <div class="section-heading" style="padding:0 0 0.9rem;">
          <div>
            <h2>Histórico Mensal</h2>
            <p>Cada mês fechado é um retrato fixo — soma de VIP, Obrigado e Misterioso daquele mês, calculado automaticamente na primeira visita após o mês terminar.</p>
          </div>
        </div>
        <div id="vipHistoryList" style="padding:0 1.1rem 1.1rem;"></div>
      </div>
    </section>
  `;

  initVipTabs();
  initVipFilters();
  renderVipPanel();
  scheduleDailyUpdate();
  await initObrigadoPanel();
  await initMisteriosoPanel();
  await initHistoryTab();
}

export function unmount() {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
}
