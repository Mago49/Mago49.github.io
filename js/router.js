import * as viewInicio from './view-inicio.js';
import * as viewCalendario from './view-calendario.js';
import * as viewVip from './view-vip.js';
import * as viewEdicao from './view-edicao.js';
import * as viewFinanceiro from './view-financeiro.js';
import * as viewGraficos from './view-graficos.js';
import * as viewPerfil from './view-perfil.js';

// (Sub-entrega D) O hash da URL é texto que qualquer link pode montar —
// nunca entra em innerHTML. Rota desconhecida e placeholder agora são
// escritos com textContent (antes um link como #/<img onerror=...> rodava
// código na página).

const appShellEl = document.getElementById('appShell');
let routerStarted = false;
let currentView = null;

const routes = {
  '#/inicio': viewInicio,
  '#/calendario': viewCalendario,
  '#/vip': viewVip,
  '#/edicao': viewEdicao,
  '#/financeiro': viewFinanceiro,
  '#/graficos': viewGraficos,
  '#/perfil': viewPerfil
};

function renderPlaceholder(nome) {
  appShellEl.innerHTML = `
    <section class="card-shell" style="padding:2rem; text-align:center;">
      <h1></h1>
      <p>Esta view ainda não foi migrada — placeholder temporário.</p>
    </section>`;
  appShellEl.querySelector('h1').textContent = `Você está na tela: ${nome}`;
}

function renderNotFound(hash) {
  appShellEl.innerHTML = '<p style="padding:2rem;">Rota <code></code> não encontrada.</p>';
  appShellEl.querySelector('code').textContent = hash;
}

function handleRouteChange() {
  // Desmonta a view anterior ANTES de montar a nova — essencial pra
  // views com timers/instâncias próprias (ex: Calendário/FullCalendar,
  // Edição/modais dinâmicos) não continuarem rodando em segundo plano
  // depois de sair da rota.
  if (currentView && typeof currentView.unmount === 'function') {
    currentView.unmount();
  }
  currentView = null;

  const hash = window.location.hash || '#/inicio';

  if (!(hash in routes)) {
    renderNotFound(hash);
    return;
  }

  const view = routes[hash];
  if (view && typeof view.mount === 'function') {
    currentView = view;
    view.mount(appShellEl);
  } else {
    renderPlaceholder(hash.replace('#/', ''));
  }
}

export function initRouter() {
  if (routerStarted) { handleRouteChange(); return; }
  routerStarted = true;
  window.addEventListener('hashchange', handleRouteChange);
  if (!window.location.hash) window.location.hash = '#/inicio';
  else handleRouteChange();
}
