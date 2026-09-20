import * as viewInicio from './view-inicio.js';
import * as viewCalendario from './view-calendario.js';
import * as viewVip from './view-vip.js';
import * as viewEdicao from './view-edicao.js';

const appShellEl = document.getElementById('appShell');
let routerStarted = false;
let currentView = null; // view atualmente montada (com unmount próprio)

// null = rota existe mas a view real ainda não foi migrada (placeholder).
const routes = {
  '#/inicio': viewInicio,
  '#/calendario': viewCalendario,
  '#/vip': viewVip,
  '#/edicao': viewEdicao,
  '#/financeiro': null
};

function renderPlaceholder(nome) {
  appShellEl.innerHTML = `
    <section class="card-shell" style="padding:2rem; text-align:center;">
      <h1>Você está na tela: ${nome}</h1>
      <p>Esta view ainda não foi migrada — placeholder temporário.</p>
    </section>`;
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
    appShellEl.innerHTML = `<p style="padding:2rem;">Rota <code>${hash}</code> não encontrada.</p>`;
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
