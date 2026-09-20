// === VIEW: Edição (Página 4) — Etapa 5, sub-entrega 1 (migração pura) ===
// mount()/unmount() chamados pelo router a cada troca de rota. Reaproveita
// 100% da lógica que já existia em main-edicao.js + ui-platform-manage.js
// (Sistema 1) — muda só ONDE o HTML é escrito (container recebido do
// router, não mais um <main> fixo de edicao.html) e COMO os 3 modais
// (Reinício/Histórico/Apostas) nascem e morrem.
//
// TRÊS CUIDADOS NOVOS, exclusivos da SPA (mesma classe de problema já
// resolvida em view-calendario.js e view-vip.js — ver Bloco K):
//
// 1) Os 3 modais (#resetModal, #historyModal, #betModal) não existem no
//    shell global (index-new.html só tem #appModal, genérico). São
//    criados aqui, uma vez por mount(), e anexados ao document.body —
//    mesmo espírito "Opção A" já usado pro footer/legenda do Calendário.
//    Removidos no unmount(), pra nunca vazar pra outras rotas.
//
// 2) initManageControls() e initModalListeners() (ui-platform-manage.js)
//    fazem suas buscas de DOM (getElementById) só quando chamadas — nunca
//    mais no topo do módulo. Por isso a ORDEM deste mount() importa:
//    escrever o HTML do painel -> criar os modais -> SÓ ENTÃO chamar as
//    duas funções de inicialização.
//
// 3) initManageControls() agora RETORNA o cleanup do initSortMenu()
//    (Bloco K, item K1 — ação pendente já sinalizada no roteiro pra esta
//    etapa). Guardamos aqui e disparamos no unmount(), senão o listener
//    global de document.click do dropdown "Ordenar" se acumularia a cada
//    visita a esta rota.
//
// dailyTimer: "Dia X" de cada linha muda na virada do dia. Como
// renderManageList() só atualiza conteúdo de linhas que realmente
// precisam mudar (reconciliação, não reconstrução total), refreshAllRows()
// garante que o badge de TODAS as linhas visíveis seja recalculado mesmo
// sem nenhuma ação do usuário — renderManageList() continua sendo chamado
// também, pra corrigir qualquer reordenação (ex: modo "+ Dias no ciclo").
// clearTimeout() no unmount() é obrigatório (Bloco K, item K2) — sem isso,
// cada visita a esta rota empilharia um novo setTimeout.
//
// NADA NAS SUB-ENTREGAS 1/2 (migração pura + cadastro do Bloco C): Itens
// 10a-10d/22/25a do menu Ordenar, Item 26f-i/27 seguem pendentes pra
// sub-entregas seguintes desta mesma Etapa 5.
//
// === SUB-ENTREGA 3 — Editor do Bloco G (aviso interno) ===
// announcement-store.js já expõe loadAnnouncement()/saveAnnouncement()
// prontas desde a Etapa 4 (Hub só as usa em modo leitura, via
// ui-announcement.js). O editor mora AQUI, na view — não em
// ui-platform-manage.js — de propósito: é um dado GLOBAL do sistema
// (documento único `announcements/current`, fora de qualquer
// `users/{uid}`), não um dado de plataforma. Misturar os dois módulos
// repetiria o mesmo erro de acoplamento que o Bloco C evitou ao não
// importar cycle-logic.js/finance-logic.js em codigo-logic.js.
//
// Fica fora do acordeão (`#platformManagePanel`), como uma seção própria
// logo abaixo dele. Carregado de forma assíncrona no fim do mount() —
// depois que a lista de plataformas (que não depende disso) já está
// renderizada, mesmo padrão já usado em view-inicio.js
// (initAnnouncementBanner como último passo). Sem Regra de Segurança
// nova: se o usuário logado não for o UID administrador, saveAnnouncement
// falha silenciosamente (mesmo comportamento já documentado desde a
// Etapa 4) — nenhuma validação de permissão é feita no front-end.

import { state } from './state.js';
import {
  initManageControls, initModalListeners, renderManageList,
  refreshAllRows, resetManageListCache
} from './ui-platform-manage.js';
import { loadAnnouncement, saveAnnouncement } from './announcement-store.js';
import { loadPreferences } from './user-preferences-store.js';
import { showAppAlert } from './utils.js';

let dailyTimer = null;
let sortMenuCleanup = null;
let modalsContainerEl = null;

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  dailyTimer = setTimeout(() => {
    refreshAllRows();
    renderManageList();
    scheduleDailyUpdate();
  }, ms);
}

// Cria os 3 modais desta view (Reinício, Histórico, Apostas) e os anexa
// ao document.body — eles não vivem no shell global nem no HTML desta
// view (que só ocupa #appShell), precisam existir fora do fluxo normal
// de conteúdo, igual ao Sistema 1. Removidos no unmount() (ver função
// removeModals abaixo), pra nunca ficar um modal órfão em outra rota.
function createModals() {
  modalsContainerEl = document.createElement('div');
  modalsContainerEl.id = 'edicaoModalsRoot';
  modalsContainerEl.innerHTML = `
    <div class="reset-modal" id="resetModal">
      <div class="reset-modal-content">
        <h2>Iniciar novo ciclo</h2>
        <p id="resetModalText"></p>
        <div class="reset-date-picker">
          <label for="resetDateInput">Selecione a data de reinício:</label>
          <input type="date" id="resetDateInput" />
        </div>
        <p style="font-weight: 600; color: #0f172a;">O ciclo recomeçará no dia selecionado (Dia 1)</p>
        <div class="reset-modal-buttons">
          <button class="btn-confirm" id="resetConfirmBtn">Confirmar</button>
          <button class="btn-cancel-modal" id="resetCancelBtn">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="history-modal" id="historyModal">
      <div class="history-modal-content">
        <h2 id="historyTitle">Histórico de Depósitos</h2>
        <div id="historyList"></div>
        <button class="history-close" id="historyCloseBtn">Fechar</button>
      </div>
    </div>

    <div class="bet-modal" id="betModal">
      <div class="bet-modal-content">
        <div class="bet-modal-header">
          <h2 id="betModalTitle">Apostas — Plataforma</h2>
          <button class="bet-modal-close" id="betModalClose">Fechar</button>
        </div>
        <div class="bet-add-row">
          <input type="date" id="betDateInput" />
          <button class="bet-add-confirm" id="betAddConfirm">+ Adicionar</button>
        </div>
        <div class="bet-list" id="betList"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalsContainerEl);
}

function removeModals() {
  if (modalsContainerEl) {
    modalsContainerEl.remove();
    modalsContainerEl = null;
  }
}

// Carrega o aviso atual (loadAnnouncement) e preenche os campos com o
// valor REAL salvo — nunca abre em branco, pra não arriscar sobrescrever
// uma mensagem existente com um "Salvar" acidental. Chamada uma vez por
// mount(), depois que o HTML da seção já foi escrito no container.
async function initAnnouncementEditor() {
  const checkbox = document.getElementById('announcementActiveCheckbox');
  const messageInput = document.getElementById('announcementMessageInput');
  const saveBtn = document.getElementById('announcementSaveBtn');
  if (!checkbox || !messageInput || !saveBtn) return;

  const current = await loadAnnouncement();
  checkbox.checked = current.active === true;
  messageInput.value = current.message || '';

  saveBtn.addEventListener('click', async () => {
    // saveAnnouncement (announcement-store.js) não lança erro: se o UID
    // logado não for o administrador, a Regra de Segurança do Firestore
    // recusa a escrita e o commit falha silenciosamente (só console.error)
    // — mesmo comportamento já documentado desde a Etapa 4. Nenhuma
    // validação de permissão é feita aqui no front-end.
    saveAnnouncement({
      active: checkbox.checked,
      message: messageInput.value
    });
    await showAppAlert('Aviso salvo.');
  });
}

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">✏️ Edição</span>
        <h1>Plataformas</h1>
        <p>Edite suas plataformas com muita facilidade.</p>
      </div>
    </div>

    <aside id="platformManagePanel" aria-label="Gerenciar plataformas">
      <div class="panel-header">
        <h3>Plataformas</h3>
        <div class="panel-controls">
          <input id="platformSearch" type="search" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
          <button type="button" id="manageReorderBtn" class="btn-neutral" title="Só funciona com 'Padrão' selecionado no Ordenar">⚙️ Reordenar</button>
          <div class="sort-menu">
            <button type="button" id="manageBadgeVisibilityBtn" class="sort-menu-toggle" aria-expanded="false">👁 Badges</button>
            <div class="sort-menu-dropdown" id="manageBadgeVisibilityDropdown">
              <label style="display:flex; align-items:center; gap:0.4rem; padding:0.5rem 0.7rem; cursor:pointer;">
                <input type="checkbox" id="badgeVisibilityTotal" style="width:auto;" /> Total (Soma depositada)
              </label>
              <label style="display:flex; align-items:center; gap:0.4rem; padding:0.5rem 0.7rem; cursor:pointer;">
                <input type="checkbox" id="badgeVisibilityCycleDay" style="width:auto;" /> Dia do ciclo
              </label>
            </div>
          </div>
          <div class="sort-menu">
            <button type="button" id="manageSortBtn" class="sort-menu-toggle" aria-expanded="false">⇅ Ordenar</button>
            <div class="sort-menu-dropdown" id="manageSortDropdown"></div>
          </div>
        </div>
      </div>

      <div id="platformManageList" role="list" aria-live="polite">
        <!-- Linha especial de adicionar, sempre primeira e fixa -->
        <div class="platform-manage-row platform-manage-row-add" id="platformManageAddRow">
          <div class="platform-manage-row-header">
            <div class="platform-manage-row-title">➕ Nova plataforma</div>
            <span class="platform-manage-chevron">▾</span>
          </div>
          <div class="platform-manage-row-body">
            <div class="platform-form-fields">
              <label for="platformManageAddName">Código/Nome</label>
              <input type="text" id="platformManageAddName" maxlength="12" placeholder="Ex: 99XX" />

              <label for="platformManageAddLevel">Nível VIP</label>
              <select id="platformManageAddLevel">
                <option value="">Não definido</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>

              <label for="platformManageAddGroup">Tipo</label>
              <select id="platformManageAddGroup">
                <option value="">Não definido</option>
                <option value="com">Com aposta</option>
                <option value="sem">Sem aposta</option>
              </select>
            </div>
            <div class="reset-modal-buttons">
              <button class="btn-confirm" id="platformManageAddSaveBtn" type="button">Salvar</button>
            </div>
          </div>
        </div>
        <!-- As linhas das plataformas existentes são geradas via JS aqui dentro -->
      </div>
    </aside>

    <section class="card-shell" aria-label="Aviso interno" style="margin-top:1.25rem; padding:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>📌 Aviso interno (Hub)</h2>
          <p>Mensagem exibida no topo da página Início pra todos os usuários. Deixe desmarcado pra guardar o texto sem exibir.</p>
        </div>
      </div>
      <div class="platform-form-fields">
        <label for="announcementActiveCheckbox">Status</label>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <input type="checkbox" id="announcementActiveCheckbox" style="width:auto;" />
          <span>Aviso ativo (visível no Hub)</span>
        </div>
        <label for="announcementMessageInput">Mensagem</label>
        <textarea id="announcementMessageInput" rows="3" placeholder="Ex: Manutenção programada às 22h."></textarea>
      </div>
      <div class="reset-modal-buttons" style="justify-content:flex-start; margin-top:0.9rem;">
        <button class="btn-confirm" id="announcementSaveBtn" type="button">Salvar aviso</button>
      </div>
    </section>
  `;

  // Ordem obrigatória: zera estado em memória -> cria os modais -> carrega
  // preferências de exibição (Item 22 + 25a, precisa estar no cache ANTES
  // da primeira renderização, senão a lista abriria com ordem/badges
  // errados por um instante) -> só então resolve DOM/liga listeners
  // (painel e modais) -> primeira renderização -> timer de virada de dia.
  resetManageListCache();
  createModals();
  await loadPreferences(state.currentUid);

  sortMenuCleanup = initManageControls();
  initModalListeners();

  renderManageList();
  scheduleDailyUpdate();

  // Carregamento assíncrono do aviso interno vem por último — não
  // bloqueia a renderização do acordeão de plataformas, que já está
  // pronto e interativo antes desta leitura do Firestore terminar.
  await initAnnouncementEditor();
}

export function unmount() {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }

  if (sortMenuCleanup) {
    sortMenuCleanup();
    sortMenuCleanup = null;
  }

  removeModals();
}
