// === UI "🧬 CARACTERÍSTICAS" (Sub-entrega 11a) ===
// 1) buildTraitsSection(platform): seção recolhível no acordeão da Edição
//    (ui-platform-manage.js) — etiquetas + texto livre, Salvar. Leitura
//    tolerante (falhou = aviso + "Tentar de novo"; nada é gravado sem ler).
//    O rascunho e o aberto/fechado sobrevivem ao redesenho da linha
//    (refreshRow reconstrói o acordeão).
// 2) buildTagsEditor({ tags, suggestions, onChange }): editor de etiquetas
//    reaproveitado no editor de jogos (ui-game-catalog.js).
// Segurança: tudo por textContent/value.

import { state } from './state.js';
import { TRAIT_TAGS_MAX, TRAIT_TAG_MAX, TRAITS_TEXT_MAX, cleanTags, cleanTraits, tagSuggestions } from './traits-logic.js';
import {
  loadPlatformTraits, isPlatformTraitsLoaded, getPlatformTraits, getAllPlatformTraits, savePlatformTraits
} from './traits-store.js';

const openIds = new Set();      // seções abertas (sessão)
const drafts = new Map();       // platformId → { tags, text }
let loading = null;             // Promise da leitura em andamento
let loadFailed = false;

function el(tag, className = '', text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null && text !== undefined) n.textContent = text;
  return n;
}

function btn(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Editor de etiquetas. onChange(tags) a cada mudança.
 * Devolve o elemento.
 */
export function buildTagsEditor({ tags = [], suggestions = [], onChange = () => {} } = {}) {
  let list = cleanTags(tags);
  const wrap = el('div', 'tr-tags');
  const chips = el('div', 'tr-chips');
  const row = el('div', 'tr-add');
  const input = el('input', 'tr-input');
  input.type = 'text';
  input.maxLength = TRAIT_TAG_MAX;
  input.placeholder = 'Nova etiqueta (Enter)';
  input.setAttribute('aria-label', 'Nova etiqueta');
  const sugg = el('div', 'tr-sugg');

  function add(v) {
    const next = cleanTags([...list, v]);
    if (next.length === list.length) return;
    list = next;
    input.value = '';
    onChange(list.slice());
    draw();
  }
  function draw() {
    chips.replaceChildren();
    list.forEach(t => {
      const c = btn(`${t} ✕`, 'tr-chip', () => { list = list.filter(x => x !== t); onChange(list.slice()); draw(); });
      c.setAttribute('aria-label', `Remover etiqueta ${t}`);
      chips.appendChild(c);
    });
    if (!list.length) chips.appendChild(el('span', 'tr-empty', 'Nenhuma etiqueta.'));
    sugg.replaceChildren();
    const s = (suggestions || []).filter(x => !list.some(y => y.toLowerCase() === String(x).toLowerCase())).slice(0, 10);
    s.forEach(x => sugg.appendChild(btn(`＋ ${x}`, 'tr-sugg-chip', () => add(x))));
    row.classList.toggle('app-hidden', list.length >= TRAIT_TAGS_MAX);
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); add(input.value); }
  });
  row.appendChild(input);
  row.appendChild(btn('Adicionar', 'bet-manage-btn tr-add-btn', () => add(input.value)));
  wrap.appendChild(chips);
  wrap.appendChild(row);
  wrap.appendChild(sugg);
  draw();
  return wrap;
}

function ensureLoaded(onDone) {
  const uid = state.currentUid;
  if (isPlatformTraitsLoaded(uid)) return true;
  if (loadFailed) return false; // só tenta de novo pelo botão
  if (!loading) {
    loading = loadPlatformTraits(uid)
      .catch(err => { console.warn('Características não carregadas:', err); loadFailed = true; })
      .finally(() => { loading = null; });
  }
  loading && loading.then(onDone);
  return false;
}

/** Seção do acordeão da Edição. */
export function buildTraitsSection(platform) {
  const section = el('div', 'manage-traits-section');
  const isOpen = openIds.has(platform.id);
  const label = el('div', 'manage-section-label manage-section-label-collapsible');
  label.appendChild(el('span', '', '🧬 Características'));
  const chev = el('span', `platform-manage-chevron${isOpen ? ' open' : ''}`, '▾');
  label.appendChild(chev);
  section.appendChild(label);
  const body = el('div', 'tr-body');
  section.appendChild(body);

  function drawBody() {
    body.replaceChildren();
    if (!openIds.has(platform.id)) return;
    if (!ensureLoaded(() => { if (section.isConnected) drawBody(); })) {
      if (loadFailed) {
        body.appendChild(el('p', 'tr-note tr-warn', 'Não foi possível carregar as características. Nada é gravado sem ler antes.'));
        body.appendChild(btn('Tentar de novo', 'bet-manage-btn', () => { loadFailed = false; drawBody(); }));
      } else {
        body.appendChild(el('p', 'tr-note', 'Carregando…'));
      }
      return;
    }
    const saved = getPlatformTraits(platform.id);
    const draft = drafts.get(platform.id) || { tags: saved.tags, text: saved.text };
    drafts.set(platform.id, draft);
    body.appendChild(el('p', 'tr-note', 'Como esta plataforma se comporta (paga bem em qual nível, horário, instabilidade…). Vai servir de base pra IA no futuro.'));
    body.appendChild(buildTagsEditor({
      tags: draft.tags,
      suggestions: tagSuggestions(getAllPlatformTraits(), draft.tags),
      onChange: (t) => { draft.tags = t; status.textContent = '● Alterações não salvas.'; }
    }));
    const ta = el('textarea', 'tr-text');
    ta.rows = 4;
    ta.maxLength = TRAITS_TEXT_MAX;
    ta.placeholder = 'Observações livres';
    ta.value = draft.text;
    ta.setAttribute('aria-label', 'Características em texto livre');
    ta.addEventListener('input', () => { draft.text = ta.value; status.textContent = '● Alterações não salvas.'; });
    body.appendChild(ta);
    const foot = el('div', 'tr-foot');
    const status = el('span', 'tr-note', saved.updatedAt ? `Salvo em ${new Date(saved.updatedAt).toLocaleDateString('pt-BR')}` : '');
    const save = btn('Salvar características', 'btn-confirm', async () => {
      save.disabled = true;
      const r = await savePlatformTraits(state.currentUid, platform.id, cleanTraits(draft));
      save.disabled = false;
      if (!r.ok) { status.textContent = r.error; return; }
      drafts.delete(platform.id);
      status.textContent = '✓ Salvo.';
    });
    foot.appendChild(status);
    foot.appendChild(save);
    body.appendChild(foot);
  }

  label.addEventListener('click', () => {
    if (openIds.has(platform.id)) openIds.delete(platform.id); else openIds.add(platform.id);
    chev.classList.toggle('open', openIds.has(platform.id));
    drawBody();
  });
  drawBody();
  return section;
}
