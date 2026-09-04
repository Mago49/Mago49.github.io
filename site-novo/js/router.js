// === ROTEADOR (SPA) — versão ESQUELETO, só pra testar a navegação ===
// Nesta primeira etapa, cada rota mostra só um texto simples dentro de
// #appShell — nenhum Firebase, nenhuma UI real, nenhum dado ainda. O
// único objetivo deste arquivo é provar que a troca de "tela" por hash
// (#/rota) funciona no GitHub Pages sem recarregar a página do navegador.
//
// COMO FUNCIONA (explicação pra quem está aprendendo):
// - O navegador dispara um evento chamado 'hashchange' toda vez que a
//   parte da URL depois do "#" muda (ex: de "#/inicio" pra "#/vip").
// - Diferente do resto da URL, o que vem depois do "#" NUNCA é enviado
//   pro servidor — é só informação que o próprio navegador guarda. Por
//   isso essa abordagem funciona no GitHub Pages sem nenhuma configuração
//   especial: o servidor nem sabe que a rota mudou, só o JavaScript sabe.
// - `routes` é um mapa (rota -> função). Cada função é responsável por
//   desenhar o conteúdo daquela tela dentro de #appShell.
// - Se a pessoa abrir o site sem nenhum hash na URL (ex: só
//   "seusite.github.io/app-novo/"), a rota padrão vira '#/inicio'.

const appShellEl = document.getElementById('appShell');

// Nas próximas etapas, cada uma destas funções vai ser substituída pelo
// mount() de verdade da tela correspondente (ex: '#/vip' vai chamar o
// código que hoje está em main-vip.js, mostrando dados reais do
// Firestore). Por enquanto, todas usam a mesma função de teste
// (renderPlaceholder) só trocando o nome exibido.
const routes = {
  '#/inicio': () => renderPlaceholder('Início'),
  '#/calendario': () => renderPlaceholder('Calendário'),
  '#/vip': () => renderPlaceholder('VIP'),
  '#/edicao': () => renderPlaceholder('Edição'),
  '#/financeiro': () => renderPlaceholder('Financeiro')
};

// Função de teste: só escreve um texto no lugar da tela real, indicando
// em qual "rota" você está agora. Serve pra confirmar visualmente que a
// troca aconteceu sem a página recarregar (repare que o navegador não
// "pisca" branco ao trocar de rota).
function renderPlaceholder(nomeDaTela) {
  appShellEl.innerHTML = `
    <div style="padding:2rem; font-family:sans-serif; text-align:center;">
      <h1>Você está na tela: ${nomeDaTela}</h1>
      <p>Rota atual na URL: <code>${window.location.hash || '#/inicio'}</code></p>
      <p>Esta é uma tela de teste — nenhum dado real está sendo carregado ainda.</p>
    </div>
  `;
}

// Lê o hash atual da URL e decide qual função de rota chamar.
function handleRouteChange() {
  const hash = window.location.hash || '#/inicio';
  const routeFn = routes[hash];

  if (routeFn) {
    routeFn();
  } else {
    // Rota desconhecida (ex: alguém digitou um hash errado na URL) —
    // mostra um aviso em vez de deixar a tela em branco sem explicação.
    appShellEl.innerHTML = `
      <div style="padding:2rem; font-family:sans-serif; text-align:center;">
        <h1>Rota não encontrada</h1>
        <p><code>${hash}</code> não existe.</p>
      </div>
    `;
  }
}

// Liga o roteador de vez: escuta toda mudança de hash (cliques em link,
// digitação manual na barra de endereço, botão voltar/avançar do
// navegador), e também roda uma vez já no carregamento inicial da
// página — importante pro caso de alguém abrir o site direto numa rota
// específica (ex: "seusite.github.io/app-novo/#/vip").
export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);

  if (!window.location.hash) {
    // Sem hash nenhum na URL: define a rota padrão. Isso já muda a URL
    // (sem recarregar a página) e o próprio listener acima vai perceber
    // essa mudança sozinho e chamar handleRouteChange.
    window.location.hash = '#/inicio';
  } else {
    // Já tinha um hash na URL (ex: veio de um link ou recarregou a
    // página numa rota específica) — desenha a tela certa direto, sem
    // esperar o evento hashchange (que só dispara em MUDANÇAS, não no
    // valor que a URL já tinha ao carregar).
    handleRouteChange();
  }
}
