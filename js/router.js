import * as viewInicio from './view-inicio.js';
import * as viewCalendario from './view-calendario.js';
import * as viewVip from './view-vip.js';
import * as viewEdicao from './view-edicao.js';
import * as viewFinanceiro from './view-financeiro.js';
import * as viewGraficos from './view-graficos.js';
import * as viewPerfil from './view-perfil.js';
import { state } from './state.js';

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
      <h1>Você está na tela: ${nome}</h1>
      <p>Esta view ainda não foi migrada — placeholder temporário.</p>
    </section>`;
}

// Desmonta a view atual — essencial pra views com timers/instâncias
// próprias (ex: Calendário/FullCalendar, Edição/modais dinâmicos) não
// continuarem rodando em segundo plano depois de sair da rota. Um erro
// dentro do unmount() de uma view nunca pode impedir a navegação nem o
// logout: é só registrado e o router segue.
function unmountCurrentView() {
  if (currentView && typeof currentView.unmount === 'function') {
    try {
      currentView.unmount();
    } catch (err) {
      console.error('Erro ao desmontar a view:', err);
    }
  }
  currentView = null;
}

// Chamada no LOGOUT (ver main.js): desmonta a view atual e esvazia o
// shell, pra nada da sessão anterior (legenda fixa do Calendário, modais
// dinâmicos, timers, dados em tela) sobreviver por cima da tela de login.
export function stopRouter() {
  unmountCurrentView();
  appShellEl.innerHTML = '';
}

function handleRouteChange() {
  // Sem usuário logado nenhuma view pode montar: state.platforms está
  // vazio e qualquer tela mostraria (ou tentaria gravar) dados de uma
  // sessão que já acabou. Mudança de hash durante o logout cai aqui.
  if (!state.currentUid) {
    stopRouter();
    return;
  }

  // Desmonta a view anterior ANTES de montar a nova.
  unmountCurrentView();

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
