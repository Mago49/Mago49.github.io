// === PAINEL "🎯 PERSONALIZAÇÃO" — Página 2 (Calendário) — Bloco L ===
// Container colapsável, recolhido por padrão, montado abaixo do grid de
// cards de filtro. Duas seções independentes:
//   - Colorir Card: cor de fundo do card + borda (tom mais escuro,
//     calculada via darkenColor) + texto em preto; campo "Motivo" livre.
//   - Marcação: emoji digitado via teclado nativo (sem picker próprio),
//     exibido no canto superior direito do card (ver ui-platform-cards.js).
//
// RASCUNHO LOCAL: toda edição (escolher cor, digitar motivo, digitar
// emoji, remover) só mexe em `context.draftColors`/`context.draftMarkers`
// — nunca grava no Firestore em tempo real. Só o botão "Salvar" persiste
// (via saveCardCustomization) e aciona o callback onSaved (recarrega o
// grid de cards com a nova personalização), SEM recolher o painel. O
// botão "Fechar" recolhe o painel e DESCARTA qualquer alteração não
// salva, recarregando o rascunho a partir do último dado realmente salvo
// (getCachedCardCustomization()) — nunca deixa uma edição pela metade
// escondida por trás.
//
// CUIDADO COM FOCO/DIGITAÇÃO (mesma classe de bug já documentada em
// ui-platform-manage.js/ui-finance-panel.js): os campos de texto (Motivo,
// emoji) NUNCA disparam reconstrução de lista no evento 'input' — só
// atualizam o objeto de rascunho. Reconstruções de lista (adicionar/
// remover uma linha de "Selecionados") só acontecem em eventos que já
// tiram o campo do foco (clique de botão, ou 'change' no blur do campo
// de emoji), nunca a cada tecla digitada.

import { state } from './state.js';
import { getCachedCardCustomization, saveCardCustomization } from './card-customization-store.js';
import { CARD_COLOR_PALETTE } from './color-palette.js';

// --- Dropdown de paleta: só uma instância aberta por vez em toda a página ---
let openDropdownState = null; // { dropdownEl, onDocClick } | null

function closeOpenColorDropdown() {
  if (!openDropdownState) return;
  const { dropdownEl, onDocClick } = openDropdownState;
  dropdownEl.remove();
  document.removeEventListener('click', onDocClick);
  openDropdownState = null;
}

function openColorDropdown(wrapEl, currentHex, onSelect) {
  closeOpenColorDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'card-custom-palette-dropdown';

  CARD_COLOR_PALETTE.forEach(hex => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'card-custom-palette-swatch' + (hex === currentHex ? ' active' : '');
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', `Selecionar cor ${hex}`);
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(hex);
      closeOpenColorDropdown();
    });
    dropdown.appendChild(swatch);
  });

  wrapEl.appendChild(dropdown);

  function onDocClick(e) {
    if (!dropdown.contains(e.target) && e.target !== wrapEl) closeOpenColorDropdown();
  }
  // Adiado pro próximo tick — senão o mesmo clique que abriu o dropdown
  // (que também é um clique no document) já dispararia o fechamento.
  setTimeout(() => document.addEventListener('click', onDocClick), 0);

  openDropdownState = { dropdownEl: dropdown, onDocClick };
}

function dividerEl() {
  const hr = document.createElement('hr');
  hr.className = 'card-custom-divider';
  return hr;
}

// ---------- SEÇÃO "COLORIR CARD" ----------

function buildColorAssignRow(p, context) {
  const row = document.createElement('div');
  row.className = 'card-custom-row';

  const label = document.createElement('span');
  label.className = 'card-custom-row-name';
  label.textContent = p.name;
  row.appendChild(label);

  const swatchWrap = document.createElement('div');
  swatchWrap.className = 'card-custom-swatch-wrap';

  const swatchBtn = document.createElement('button');
  swatchBtn.type = 'button';
  swatchBtn.className = 'card-custom-swatch-btn';
  const current = context.draftColors[p.id];
  swatchBtn.style.background = current ? current.hex : '#fff';
  swatchBtn.setAttribute('aria-label', `Escolher cor para ${p.name}`);
  swatchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = context.draftColors[p.id];
    openColorDropdown(swatchWrap, existing ? existing.hex : null, (hex) => {
      const existingMotivo = existing ? existing.motivo : '';
      context.draftColors[p.id] = { hex, motivo: existingMotivo || '' };
      swatchBtn.style.background = hex;
      renderColorSelectedList(context);
    });
  });

  swatchWrap.appendChild(swatchBtn);
  row.appendChild(swatchWrap);

  context.colorSwatchRefs.set(p.id, swatchBtn);
  return row;
}

function buildColorSelectedRow(p, entry, context) {
  const row = document.createElement('div');
  row.className = 'card-custom-selected-row';

  const label = document.createElement('span');
  label.className = 'card-custom-row-name';
  label.textContent = p.name;
  row.appendChild(label);

  const swatchWrap = document.createElement('div');
  swatchWrap.className = 'card-custom-swatch-wrap';

  const swatchBtn = document.createElement('button');
  swatchBtn.type = 'button';
  swatchBtn.className = 'card-custom-swatch-btn';
  swatchBtn.style.background = entry.hex;
  swatchBtn.setAttribute('aria-label', `Alterar cor de ${p.name}`);
  swatchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openColorDropdown(swatchWrap, entry.hex, (hex) => {
      entry.hex = hex;
      swatchBtn.style.background = hex;
      const assignSwatch = context.colorSwatchRefs.get(p.id);
      if (assignSwatch) assignSwatch.style.background = hex;
    });
  });
  swatchWrap.appendChild(swatchBtn);
  row.appendChild(swatchWrap);

  const motivoInput = document.createElement('input');
  motivoInput.type = 'text';
  motivoInput.className = 'card-custom-motivo-input';
  motivoInput.placeholder = 'Motivo (opcional)';
  motivoInput.maxLength = 80;
  motivoInput.value = entry.motivo || '';
  motivoInput.setAttribute('aria-label', `Motivo da cor de ${p.name}`);
  // Só atualiza o rascunho — nunca reconstrói a lista aqui (evita perder
  // o foco do campo a cada tecla digitada).
  motivoInput.addEventListener('input', () => {
    entry.motivo = motivoInput.value;
  });
  row.appendChild(motivoInput);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'card-custom-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', `Remover cor de ${p.name}`);
  removeBtn.addEventListener('click', () => {
    delete context.draftColors[p.id];
    const assignSwatch = context.colorSwatchRefs.get(p.id);
    if (assignSwatch) assignSwatch.style.background = '#fff';
    renderColorSelectedList(context);
  });
  row.appendChild(removeBtn);

  return row;
}

function renderColorSelectedList(context) {
  context.selectedColorListEl.innerHTML = '';
  const ids = Object.keys(context.draftColors);

  if (ids.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-custom-empty';
    empty.textContent = 'Nenhuma plataforma colorida ainda.';
    context.selectedColorListEl.appendChild(empty);
    return;
  }

  ids.forEach(id => {
    const p = context.platformById.get(id);
    if (!p) return; // plataforma removida do sistema — entrada órfã ignorada na exibição
    context.selectedColorListEl.appendChild(buildColorSelectedRow(p, context.draftColors[id], context));
  });
}

// ---------- SEÇÃO "MARCAÇÃO" ----------

function buildMarkerAssignRow(p, context) {
  const row = document.createElement('div');
  row.className = 'card-custom-row';

  const label = document.createElement('span');
  label.className = 'card-custom-row-name';
  label.textContent = p.name;
  row.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'card-custom-marker-input';
  input.placeholder = '🙂';
  // Folga suficiente pra emojis compostos (ZWJ/flags) sem bloquear um
  // toque normal do teclado de emojis nativo.
  input.maxLength = 8;
  input.value = context.draftMarkers[p.id] || '';
  input.setAttribute('aria-label', `Marcador de ${p.name}`);
  // Só atualiza o rascunho — nunca reconstrói lista no 'input'.
  input.addEventListener('input', () => {
    context.draftMarkers[p.id] = input.value;
  });
  // 'change' só dispara no blur — seguro reconstruir a lista aqui.
  input.addEventListener('change', () => {
    const value = input.value.trim();
    if (value) {
      context.draftMarkers[p.id] = value;
    } else {
      delete context.draftMarkers[p.id];
    }
    renderMarkerSelectedList(context);
  });

  row.appendChild(input);
  context.markerInputRefs.set(p.id, input);
  return row;
}

function buildMarkerSelectedRow(p, context) {
  const row = document.createElement('div');
  row.className = 'card-custom-selected-row';

  const label = document.createElement('span');
  label.className = 'card-custom-row-name';
  label.textContent = p.name;
  row.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'card-custom-marker-input';
  input.maxLength = 8;
  input.value = context.draftMarkers[p.id] || '';
  input.setAttribute('aria-label', `Editar marcador de ${p.name}`);
  input.addEventListener('input', () => {
    context.draftMarkers[p.id] = input.value;
    const assignInput = context.markerInputRefs.get(p.id);
    if (assignInput) assignInput.value = input.value;
  });
  input.addEventListener('change', () => {
    if (!input.value.trim()) {
      delete context.draftMarkers[p.id];
      const assignInput = context.markerInputRefs.get(p.id);
      if (assignInput) assignInput.value = '';
      renderMarkerSelectedList(context);
    }
  });
  row.appendChild(input);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'card-custom-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', `Remover marcador de ${p.name}`);
  removeBtn.addEventListener('click', () => {
    delete context.draftMarkers[p.id];
    const assignInput = context.markerInputRefs.get(p.id);
    if (assignInput) assignInput.value = '';
    renderMarkerSelectedList(context);
  });
  row.appendChild(removeBtn);

  return row;
}

function renderMarkerSelectedList(context) {
  context.selectedMarkerListEl.innerHTML = '';
  const ids = Object.keys(context.draftMarkers);

  if (ids.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-custom-empty';
    empty.textContent = 'Nenhuma plataforma marcada ainda.';
    context.selectedMarkerListEl.appendChild(empty);
    return;
  }

  ids.forEach(id => {
    const p = context.platformById.get(id);
    if (!p) return;
    context.selectedMarkerListEl.appendChild(buildMarkerSelectedRow(p, context));
  });
}

// ---------- MONTAGEM DO PAINEL ----------

/**
 * @param {HTMLElement} mountEl elemento onde o painel será inserido
 * @param {() => void} onSaved chamado depois de "Salvar" persistir com
 *        sucesso — quem monta a view usa isso pra atualizar o grid de
 *        cards com a personalização nova (ver view-calendario.js).
 * @returns {() => void} cleanup — remove o listener global do dropdown de
 *        cor. Chamar no unmount() da view.
 */
export function initCardCustomizationPanel(mountEl, onSaved) {
  const saved = getCachedCardCustomization();

  const context = {
    // Cópia profunda/isolada — nenhuma edição aqui reflete no cache até
    // "Salvar" ser clicado.
    draftColors: JSON.parse(JSON.stringify(saved.colors || {})),
    draftMarkers: { ...(saved.markers || {}) },
    platformById: new Map(state.platforms.map(p => [p.id, p])),
    colorSwatchRefs: new Map(),
    markerInputRefs: new Map(),
    selectedColorListEl: null,
    selectedMarkerListEl: null
  };

  mountEl.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'card-shell card-custom-section';

  const header = document.createElement('div');
  header.className = 'section-heading card-custom-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = '🎯 Personalização';
  titleWrap.appendChild(title);
  header.appendChild(titleWrap);

  const chevron = document.createElement('span');
  chevron.className = 'card-custom-chevron';
  chevron.textContent = '▾';
  header.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'card-custom-body app-hidden';

  function discardDraftAndCollapse() {
    closeOpenColorDropdown();
    const current = getCachedCardCustomization();
    context.draftColors = JSON.parse(JSON.stringify(current.colors || {}));
    context.draftMarkers = { ...(current.markers || {}) };
    context.colorSwatchRefs.forEach((btn, id) => {
      const entry = context.draftColors[id];
      btn.style.background = entry ? entry.hex : '#fff';
    });
    context.markerInputRefs.forEach((input, id) => {
      input.value = context.draftMarkers[id] || '';
    });
    renderColorSelectedList(context);
    renderMarkerSelectedList(context);

    chevron.classList.remove('open');
    body.classList.add('app-hidden');
  }

  header.addEventListener('click', () => {
    const isExpanded = !body.classList.contains('app-hidden');
    if (isExpanded) {
      // Fechar SEM salvar: descarta o rascunho, recarrega do que está
      // realmente salvo — nunca fica edição pendente escondida por trás.
      discardDraftAndCollapse();
    } else {
      chevron.classList.add('open');
      body.classList.remove('app-hidden');
    }
  });

  section.appendChild(header);

  // --- Bloco Colorir Card ---
  const colorBlock = document.createElement('div');
  colorBlock.className = 'card-custom-block';
  const colorTitle = document.createElement('h3');
  colorTitle.textContent = 'Colorir Card';
  colorBlock.appendChild(colorTitle);

  const colorAssignList = document.createElement('div');
  colorAssignList.className = 'card-custom-list';
  [...state.platforms]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .forEach(p => colorAssignList.appendChild(buildColorAssignRow(p, context)));
  colorBlock.appendChild(colorAssignList);

  const colorSelectedLabel = document.createElement('div');
  colorSelectedLabel.className = 'card-custom-section-label';
  colorSelectedLabel.textContent = 'Selecionados';
  colorBlock.appendChild(colorSelectedLabel);

  const colorSelectedList = document.createElement('div');
  colorSelectedList.className = 'card-custom-selected-list';
  colorBlock.appendChild(colorSelectedList);
  context.selectedColorListEl = colorSelectedList;

  body.appendChild(colorBlock);
  body.appendChild(dividerEl());

  // --- Bloco Marcação ---
  const markerBlock = document.createElement('div');
  markerBlock.className = 'card-custom-block';
  const markerTitle = document.createElement('h3');
  markerTitle.textContent = 'Marcação';
  markerBlock.appendChild(markerTitle);

  const markerAssignList = document.createElement('div');
  markerAssignList.className = 'card-custom-list';
  [...state.platforms]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .forEach(p => markerAssignList.appendChild(buildMarkerAssignRow(p, context)));
  markerBlock.appendChild(markerAssignList);

  const markerSelectedLabel = document.createElement('div');
  markerSelectedLabel.className = 'card-custom-section-label';
  markerSelectedLabel.textContent = 'Selecionados';
  markerBlock.appendChild(markerSelectedLabel);

  const markerSelectedList = document.createElement('div');
  markerSelectedList.className = 'card-custom-selected-list';
  markerBlock.appendChild(markerSelectedList);
  context.selectedMarkerListEl = markerSelectedList;

  body.appendChild(markerBlock);
  body.appendChild(dividerEl());

  // --- Ações ---
  const actions = document.createElement('div');
  actions.className = 'reset-modal-buttons card-custom-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-confirm';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', () => {
    // "Salvar" só salva — painel continua aberto, não recolhe.
    saveCardCustomization(state.currentUid, {
      colors: context.draftColors,
      markers: context.draftMarkers
    });
    if (typeof onSaved === 'function') onSaved();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-cancel-modal';
  closeBtn.textContent = 'Fechar';
  closeBtn.addEventListener('click', discardDraftAndCollapse);

  actions.appendChild(saveBtn);
  actions.appendChild(closeBtn);
  body.appendChild(actions);

  section.appendChild(body);
  mountEl.appendChild(section);

  renderColorSelectedList(context);
  renderMarkerSelectedList(context);

  return function cleanup() {
    closeOpenColorDropdown();
  };
}
