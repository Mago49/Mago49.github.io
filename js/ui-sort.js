// === MENU "ORDENAR" (componente de UI genérico) ===
// Usado nas páginas 2 e 4 com o MESMO conjunto de opções (SORT_MENU_OPTIONS
// em platform-sort.js). Este módulo só cuida da parte visual (abrir/fechar
// dropdown, marcar item ativo) — o que cada opção FAZ (reordenar ou
// esconder) é decidido por quem chama onChange, em cada main-*.js.
//
// Ponto 5.1 (Financeiro): a Página 5 precisa de rótulos próprios ("Maior
// Saldo"/"Menor Saldo", "Com Aposta" no singular, etc.) — por isso
// initSortMenu aceita um `options` opcional, com SORT_MENU_OPTIONS como
// padrão. Calendário e Edição não passam esse parâmetro, então continuam
// usando exatamente a mesma lista compartilhada de sempre, sem nenhuma
// mudança de comportamento.

import { SORT_MENU_OPTIONS } from './platform-sort.js';

/**
 * @param {Object} options
 * @param {string} options.buttonId   id do botão que abre/fecha o menu
 * @param {string} options.dropdownId id do container onde as opções são inseridas
 * @param {(mode: string|null) => void} options.onChange
 *        chamado com o value da opção clicada, ou null quando "Padrão" é escolhido
 * @param {Array<{value: string, label: string}>} [options.options]
 *        lista de opções a exibir; padrão é SORT_MENU_OPTIONS (Calendário/Edição)
 */
export function initSortMenu({ buttonId, dropdownId, onChange, options = SORT_MENU_OPTIONS }) {
  const btn = document.getElementById(buttonId);
  const dropdown = document.getElementById(dropdownId);
  if (!btn || !dropdown) return;

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

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) closeDropdown();
  });

  renderOptions();
}
