// Ainda placeholder nas telas (Etapa 5 troca pelas views reais).
// routerStarted evita registrar o listener duas vezes, caso onLogin
// dispare mais de uma vez na mesma sessão.
const appShellEl = document.getElementById('appShell');
let routerStarted = false;

const routes = {
  '#/inicio': () => renderPlaceholder('Início'),
  '#/calendario': () => renderPlaceholder('Calendário'),
  '#/vip': () => renderPlaceholder('VIP'),
  '#/edicao': () => renderPlaceholder('Edição'),
  '#/financeiro': () => renderPlaceholder('Financeiro')
};

function renderPlaceholder(nome) {
  appShellEl.innerHTML = `
    <section class="card-shell" style="padding:2rem; text-align:center;">
      <h1>Você está na tela: ${nome}</h1>
      <p>Rota atual: <code>${window.location.hash || '#/inicio'}</code></p>
    </section>`;
}

function handleRouteChange() {
  const hash = window.location.hash || '#/inicio';
  const routeFn = routes[hash];
  if (routeFn) routeFn();
  else appShellEl.innerHTML = `<p style="padding:2rem;">Rota <code>${hash}</code> não encontrada.</p>`;
}

export function initRouter() {
  if (routerStarted) { handleRouteChange(); return; }
  routerStarted = true;
  window.addEventListener('hashchange', handleRouteChange);
  if (!window.location.hash) window.location.hash = '#/inicio';
  else handleRouteChange();
}
