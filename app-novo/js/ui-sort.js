// === MENU "ORDENAR" (componente de UI genérico) ===
// Usado nas páginas 2 e 4 com o MESMO conjunto de opções (SORT_MENU_OPTIONS
// em platform-sort.js). Este módulo só cuida da parte visual (abrir/fechar
// dropdown, marcar item ativo) — o que cada opção FAZ (reordenar ou
// esconder) é decidido por quem chama onChange, em cada view.
//
// Ponto 5.1 (Financeiro): a Página 5 precisa de rótulos próprios ("Maior
// Saldo"/"Menor Saldo", "Com Aposta" no singular, etc.) — por isso
// initSortMenu aceita um `options` opcional, com SORT_MENU_OPTIONS como
// padrão. Calendário e Edição não passam esse parâmetro, então continuam
// usando exatamente a mesma lista compartilhada de sempre, sem nenhuma
// mudança de comportamento.
//
// === CLEANUP (novo — Etapa 2, SPA) ===
// No Sistema 1 (páginas separadas, sem SPA) o listener global de clique
// (document.addEventListener, usado pra fechar o dropdown ao clicar fora
// dele) nunca precisava ser removido — a página inteira era descartada
// ao navegar. Na SPA, o mesmo módulo é importado UMA ÚNICA VEZ pra vida
// inteira da aplicação: sem remover o listener, cada visita a uma rota
// que chama initSortMenu() (Calendário, e futuramente Edição/Financeiro)
// empilharia mais um listener idêntico, permanentemente, no document.
//
// initSortMenu() agora devolve uma função de cleanup — quem chama guarda
// essa função e a executa no próprio unmount() da view (ver
// view-calendario.js). Cada instância de sort menu (Calendário, Edição,
// Financeiro) tem seu próprio listener isolado, sem interferir umas nas
// outras — a única mudança é que agora existe uma forma de desligar cada
// um quando a view correspondente é desmontada.

import { SORT_MENU_OPTIONS } from './platform-sort.js';

/**
 * @param {Object} options
 * @param {string} options.buttonId   id do botão que abre/fecha o menu
 * @param {string} options.dropdownId id do container onde as opções são inseridas
 * @param {(mode: string|null) => void} options.onChange
 *        chamado com o value da opção clicada, ou null quando "Padrão" é escolhido
 * @param {Array<{value: string, label: string}>} [options.options]
 *        lista de opções a exibir; padrão é SORT_MENU_OPTIONS (Calendário/Edição)
 * @returns {() => void} função de cleanup — remove o listener global.
 *        Chamar no unmount() da view que usou initSortMenu().
 */
export function initSortMenu({ buttonId, dropdownId, onChange, options = SORT_MENU_OPTIONS }) {
  const btn = document.getElementById(buttonId);
  const dropdown = document.getElementById(dropdownId);
  if (!btn || !dropdown) return () => {};

  let activeMode = null;

  function renderOptions() {
    const items = [{ value: null, label: 'Padrão' }, ...options];
    dropdown.innerHTML = '';
    items.forEach(item => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'sort-menu-item' + (activeMode === item.value ? ' active' : '');
      opt.textContent = item.label;
      opt.addEventListener('click', () => {
        activeMode = item.value;
        renderOptions();
        closeDropdown();
        onChange(activeMode);
      });
      dropdown.appendChild(opt);
    });
  }

  function openDropdown() {
    dropdown.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function onButtonClick(e) {
    e.stopPropagation();
    dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
  }

  function onDocumentClick(e) {
    if (!dropdown.contains(e.target) && e.target !== btn) closeDropdown();
  }

  btn.addEventListener('click', onButtonClick);
  document.addEventListener('click', onDocumentClick);

  renderOptions();

  return function cleanup() {
    document.removeEventListener('click', onDocumentClick);
    btn.removeEventListener('click', onButtonClick);
  };
}
