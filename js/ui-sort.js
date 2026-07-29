// === MENU "ORDENAR" (componente de UI genérico) ===
// Usado nas páginas 2 e 4 com o MESMO conjunto de opções (SORT_MENU_OPTIONS
// em platform-sort.js). Este módulo só cuida da parte visual (abrir/fechar
// dropdown, marcar item ativo) — o que cada opção FAZ (reordenar ou
// esconder) é decidido por quem chama onChange, em cada main-*.js.

import { SORT_MENU_OPTIONS } from './platform-sort.js';

/**
 * @param {Object} options
 * @param {string} options.buttonId   id do botão que abre/fecha o menu
 * @param {string} options.dropdownId id do container onde as opções são inseridas
 * @param {(mode: string|null) => void} options.onChange
 *        chamado com o value da opção clicada, ou null quando "Padrão" é escolhido
 */
export function initSortMenu({ buttonId, dropdownId, onChange }) {
  const btn = document.getElementById(buttonId);
  const dropdown = document.getElementById(dropdownId);
  if (!btn || !dropdown) return;

  let activeMode = null;

  function renderOptions() {
    const items = [{ value: null, label: 'Padrão' }, ...SORT_MENU_OPTIONS];
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
