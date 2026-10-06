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
//
// (Correção pós-publicação) stopRouter: o main.js publicado no site importa
// `stopRouter` deste arquivo — a versão da Sub-entrega D foi montada a
// partir de um router.js mais antigo, sem essa função, e o app inteiro
// parava de carregar ("does not provide an export named 'stopRouter'").
// stopRouter() desmonta a view atual (timers, modais e listeners de cada
// view saem pelo próprio unmount()), desliga o listener de hashchange e
// limpa a área das telas. initRouter() pode ser chamado de novo depois
// (ex.: novo login) e religa tudo do zero. Não grava nada.

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

function onHashChange() {
  handleRouteChange();
}

export function initRouter() {
  if (routerStarted) { handleRouteChange(); return; }
  routerStarted = true;
  window.addEventListener('hashchange', onHashChange);
  if (!window.location.hash) window.location.hash = '#/inicio';
  else handleRouteChange();
}

export function stopRouter() {
  if (currentView && typeof currentView.unmount === 'function') {
    try {
      currentView.unmount();
    } catch (err) {
      console.error('Erro ao desmontar a tela atual:', err);
    }
  }
  currentView = null;
  if (routerStarted) {
    window.removeEventListener('hashchange', onHashChange);
    routerStarted = false;
  }
  if (appShellEl) appShellEl.innerHTML = '';
}
