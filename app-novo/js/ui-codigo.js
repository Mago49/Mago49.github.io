// === UI DO GERADOR DE CÓDIGOS + "DEPÓSITOS - HOJE" (Hub — Etapa 3) ===
// Dois painéis independentes, montados pela View Início (view-inicio.js):
//   1) initCodigoPanel()        -> seletor busca+lista (Item 11e) + detalhe
//      com os 3 códigos (identificador sempre, depósito/aposta só quando
//      liberados no dia — ver codigo-logic.js).
//   2) initDepositsTodayPanel() -> lista de quem depositou hoje, com
//      paginação ← → ENTRE PLATAFORMAS (Item 21f — nunca entre dias).
//
// SOMENTE LEITURA: nenhum dos dois grava no Firestore — são só leitura de
// state.platforms (já carregado por auth-guard.js no login). O CADASTRO
// dos 3 códigos (codigoConfig, codigoDeposito, codigoAposta) NÃO existe
// em nenhum sistema ainda — nasce junto com a migração real da View
// Edição (Etapa 5, ver roteiro-execucao-fusao.md). Até lá, os campos
// ficam com os valores padrão (ver platforms-store-new.js) e os painéis
// aqui simplesmente não mostram nada pra quem ainda não tem código
// configurado — comportamento esperado, não é bug.
//
// CSS PRÓPRIO (codigo.css): o Hub (index-new.html) não carrega
// finance.css/sort-menu.css/platform-cards.css (exclusivas de outras
// páginas) — por isso este arquivo usa só classes próprias, prefixo
// "codigo-", e classes já garantidamente globais no Hub hoje:
// .card-shell/.section-heading (layout.css), .history-empty/
// .btn-cancel-modal/.reset-modal-buttons (modals.css), .summary-card e
// afins (hero.css).
//
// Sem timers próprios: os dois painéis recalculam tudo (inclusive as
// somas "de hoje") toda vez que são montados/renderizados — a View
// Início inteira é remontada a cada troca de rota, então não há
// necessidade de scheduleDailyUpdate() aqui.
//
// Estado de módulo (busca, seleção, página atual) é resetado a cada
// mount() da view — sem isso, sair do Hub e voltar reaproveitaria a
// última busca/seleção/página de uma visita anterior (mesmo cuidado já
// documentado em ui-platform-cards.js -> resetPlatformCardsFilters()).

import { state } from './state.js';
import { formatCurrency, escapeHtml } from './utils.js';
import {
  getCodigoIdentificador, hasVisibleCodigoIdentificador,
  getCodigoDepositoValue, getCodigoApostaValue,
  getDepositsToday
} from './codigo-logic.js';

// ---------- PAINEL "GERADOR DE CÓDIGOS" (Item 11e + 11h/11i) ----------

let codigoSearch = '';
let selectedPlatformId = null;
let codigoListEl = null;
let codigoDetailEl = null;

function getVisibleCodigoList() {
  const q = codigoSearch.trim().toLowerCase();
  return state.platforms
    .filter(hasVisibleCodigoIdentificador) // 11b: 'aleatoria'/sem tipo somem do seletor
    .filter(p => p.name.toLowerCase().includes(q));
}

function renderCodigoDetail() {
  if (!codigoDetailEl) return;
  codigoDetailEl.innerHTML = '';

  const platform = state.platforms.find(p => p.id === selectedPlatformId);
  if (!platform) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Selecione uma plataforma acima para ver o código do dia.';
    codigoDetailEl.appendChild(empty);
    return;
  }

  const card = document.createElement('div');
  card.className = 'codigo-detail-card';

  const header = document.createElement('div');
  header.className = 'codigo-detail-header';
  header.textContent = platform.name;
  card.appendChild(header);

  const identificador = getCodigoIdentificador(platform);
  const mainRow = document.createElement('p');
  mainRow.className = 'codigo-detail-row';
  mainRow.innerHTML = `Código: <strong>${escapeHtml(identificador || '—')}</strong>`;
  card.appendChild(mainRow);

  const depositoValue = getCodigoDepositoValue(platform);
  if (depositoValue !== null) {
    const row = document.createElement('p');
    row.className = 'codigo-detail-row codigo-detail-row-unlocked';
    row.innerHTML = `🔓 Código Depósito: <strong>${escapeHtml(depositoValue)}</strong>`;
    card.appendChild(row);
  }

  const apostaValue = getCodigoApostaValue(platform);
  if (apostaValue !== null) {
    const row = document.createElement('p');
    row.className = 'codigo-detail-row codigo-detail-row-unlocked';
    row.innerHTML = `🔓 Código Aposta: <strong>${escapeHtml(apostaValue)}</strong>`;
    card.appendChild(row);
  }

  codigoDetailEl.appendChild(card);
}

function renderCodigoList() {
  if (!codigoListEl) return;
  codigoListEl.innerHTML = '';

  const list = getVisibleCodigoList();

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhuma plataforma com código configurado ainda.';
    codigoListEl.appendChild(empty);
    return;
  }

  list.forEach(p => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'codigo-list-item' + (selectedPlatformId === p.id ? ' active' : '');
    item.textContent = p.name;
    item.addEventListener('click', () => {
      selectedPlatformId = p.id;
      renderCodigoList();
      renderCodigoDetail();
    });
    codigoListEl.appendChild(item);
  });
}

/**
 * Monta o painel do Gerador de Códigos dentro de `mountEl`. Chamado uma
 * vez pela View Início, no mount(). Não registra nenhum listener global
 * (document/window) — cleanup devolvido só por simetria com os outros
 * painéis da SPA, caso algum listener global seja adicionado no futuro.
 * @returns {() => void} cleanup
 */
export function initCodigoPanel(mountEl) {
  codigoSearch = '';
  selectedPlatformId = null;

  mountEl.innerHTML = `
    <section class="card-shell codigo-section" aria-label="Gerador de Códigos">
      <div class="section-heading">
        <div>
          <h2>🔑 Códigos das Plataformas</h2>
          <p>Busque uma plataforma para ver o código do dia. Códigos de Depósito/Aposta só aparecem quando liberados hoje.</p>
        </div>
      </div>
      <div class="codigo-toolbar">
        <input type="search" id="codigoSearch" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
      </div>
      <div id="codigoList" class="codigo-list"></div>
      <div id="codigoDetail" class="codigo-detail-wrap"></div>
    </section>
  `;

  codigoListEl = document.getElementById('codigoList');
  codigoDetailEl = document.getElementById('codigoDetail');

  const searchEl = document.getElementById('codigoSearch');
  searchEl.addEventListener('input', (e) => {
    codigoSearch = e.target.value;
    renderCodigoList();
  });

  renderCodigoList();
  renderCodigoDetail();

  return function cleanup() {
    codigoListEl = null;
    codigoDetailEl = null;
  };
}

// ---------- PAINEL "DEPÓSITOS - HOJE" (Item 21) ----------

let depositsTodayIndex = 0;
let depositsTodayContentEl = null;

function renderDepositsTodayContent() {
  if (!depositsTodayContentEl) return;
  depositsTodayContentEl.innerHTML = '';

  const entries = getDepositsToday(state.platforms);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Nenhum depósito registrado hoje ainda.';
    depositsTodayContentEl.appendChild(empty);
    return;
  }

  // Mantém o índice dentro dos limites (ex: lista encolheu desde a
  // última renderização, algo mudou em outra aba).
  if (depositsTodayIndex >= entries.length) depositsTodayIndex = entries.length - 1;
  if (depositsTodayIndex < 0) depositsTodayIndex = 0;

  const current = entries[depositsTodayIndex];

  const nav = document.createElement('div');
  nav.className = 'codigo-nav-row';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-cancel-modal';
  prevBtn.textContent = '←';
  prevBtn.disabled = depositsTodayIndex === 0;
  prevBtn.addEventListener('click', () => {
    depositsTodayIndex -= 1;
    renderDepositsTodayContent();
  });

  const counter = document.createElement('span');
  counter.className = 'codigo-nav-counter';
  counter.textContent = `${depositsTodayIndex + 1} / ${entries.length}`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-cancel-modal';
  nextBtn.textContent = '→';
  nextBtn.disabled = depositsTodayIndex === entries.length - 1;
  nextBtn.addEventListener('click', () => {
    depositsTodayIndex += 1;
    renderDepositsTodayContent();
  });

  nav.appendChild(prevBtn);
  nav.appendChild(counter);
  nav.appendChild(nextBtn);
  depositsTodayContentEl.appendChild(nav);

  const card = document.createElement('div');
  card.className = 'summary-card codigo-deposit-today-card';
  card.innerHTML = `
    <span class="summary-label">${escapeHtml(current.platform.name)}</span>
    <span class="summary-value">${formatCurrency(current.total)}</span>
    <span class="summary-note">Total depositado hoje.</span>
  `;
  depositsTodayContentEl.appendChild(card);
}

/**
 * Monta o bloco "Depósitos - Hoje" dentro de `mountEl`. Chamado uma vez
 * pela View Início, no mount(). Paginação é SEMPRE entre plataformas que
 * depositaram hoje — nunca entre dias (Item 21f).
 * @returns {() => void} cleanup
 */
export function initDepositsTodayPanel(mountEl) {
  depositsTodayIndex = 0;

  mountEl.innerHTML = `
    <section class="card-shell codigo-section" aria-label="Depósitos de hoje">
      <div class="section-heading">
        <div>
          <h2>💰 Depósitos - Hoje</h2>
          <p>Plataformas com depósito registrado hoje — navegue com as setas.</p>
        </div>
      </div>
      <div id="depositsTodayContent" class="codigo-detail-wrap"></div>
    </section>
  `;

  depositsTodayContentEl = document.getElementById('depositsTodayContent');
  renderDepositsTodayContent();

  return function cleanup() {
    depositsTodayContentEl = null;
  };
}
