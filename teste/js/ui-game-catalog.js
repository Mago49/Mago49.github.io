// === UI DA ABA "JOGOS" — Biblioteca de jogos (View Gráficos — Sub-entrega 9) ===
// Catálogo editável e excluível: nome, provedor, emoji, valores de aposta
// do jogo (você vai completando com o tempo) e observação. Provedores
// também editáveis. "Sugestões": pré-lista por provedor pra REVISAR —
// nada entra sem você marcar e confirmar.
//
// O jogo de cada aposta é escolhido no "Registrar aposta" do Financeiro
// (ui-bet-entry.js); nome novo digitado lá entra sozinho aqui.
// Excluir um jogo daqui não mexe em aposta nenhuma (o lançamento guarda
// uma cópia do nome).
//
// BANCO: só game-catalog-store.js (gameCatalog + gameConfig/providers).
// Leitura estrita (falha = aba bloqueada com "Tentar de novo").
// SEGURANÇA: nomes só por textContent/value.
//
// (Sub-entrega 11a) Editor ganhou "🧬 Características" (etiquetas + texto
// livre) — buildTagsEditor de ui-traits.js; gravado no próprio jogo.

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import {
  parseStakesText, formatStakes, normalizeKey, pendingSuggestions, GAME_NAME_MAX, PROVIDER_NAME_MAX, GAME_NOTES_MAX
} from './game-catalog-logic.js';
import {
  loadGameCatalog, isGameCatalogLoaded, getGames, getProviders, saveGame, deleteGame, addGamesBulk, saveProviders
} from './game-catalog-store.js';
import { buildTagsEditor } from './ui-traits.js';
import { tagSuggestions, TRAITS_TEXT_MAX } from './traits-logic.js';

let rootEl = null;
let mounted = false;
let busy = false;
let loadStatus = 'idle';
let loadToken = 0;

const ui = { search: '', provider: '', editing: null, providersDraft: null, suggestChecked: null };

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function el(tag, className = '', text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null && text !== undefined) n.textContent = text;
  return n;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function sessionsByGame() {
  const map = new Map();
  state.platforms.forEach(p => (p.betEntries || []).forEach(e => {
    if (e && e.gameId) map.set(e.gameId, (map.get(e.gameId) || 0) + 1);
  }));
  return map;
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="gcLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="gcRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <section id="gcMain" class="card-shell graficos-section app-hidden" aria-label="Biblioteca de jogos">
      <div class="section-heading" style="padding:0 0 0.8rem;">
        <div>
          <h2>🎰 Biblioteca de jogos</h2>
          <p>Escolha o jogo no "Registrar aposta" do Financeiro. Nome novo digitado lá entra aqui sozinho.</p>
        </div>
      </div>
      <div class="gc-toolbar">
        <input type="search" id="gcSearch" class="plan-input" placeholder="Buscar jogo" aria-label="Buscar jogo" />
        <select id="gcProvider" class="plan-input" aria-label="Provedor"></select>
        <button type="button" id="gcNew" class="btn-confirm">+ Novo jogo</button>
      </div>
      <div id="gcEditor"></div>
      <div id="gcList" class="gc-list"></div>
      <details class="gc-details" id="gcSuggestWrap">
        <summary id="gcSuggestSum">💡 Sugestões pra importar</summary>
        <div id="gcSuggest" class="gc-details-body"></div>
      </details>
      <details class="gc-details">
        <summary>🏷️ Provedores</summary>
        <div id="gcProviders" class="gc-details-body"></div>
      </details>
    </section>
  `;
  $('gcRetry').addEventListener('click', () => loadData(true));
  $('gcSearch').addEventListener('input', (e) => { ui.search = e.target.value; renderList(); });
  $('gcProvider').addEventListener('change', (e) => { ui.provider = e.target.value; renderList(); });
  $('gcNew').addEventListener('click', () => { ui.editing = { id: null, name: '', provider: ui.provider || '', stakesText: '', emoji: '', notes: '', traitsTags: [], traitsText: '' }; renderEditor(); });
}

function renderLoadState() {
  const note = $('gcLoadNote');
  const retry = $('gcRetry');
  const main = $('gcMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando biblioteca…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar a biblioteca de jogos. Verifique a internet e tente de novo.';
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error');
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  if (force || !isGameCatalogLoaded(uid)) {
    loadStatus = 'loading';
    renderLoadState();
    try {
      await loadGameCatalog(uid);
    } catch (err) {
      if (token !== loadToken || !mounted) return;
      console.error('Jogos: falha ao carregar a biblioteca:', err);
      loadStatus = 'error';
      renderLoadState();
      return;
    }
    if (token !== loadToken || !mounted) return;
  }
  loadStatus = 'ok';
  renderLoadState();
  renderAll();
}

function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  renderProviderFilter();
  renderEditor();
  renderList();
  renderSuggestions();
  renderProviders();
}

function renderProviderFilter() {
  const sel = $('gcProvider');
  sel.replaceChildren();
  const all = el('option', '', 'Todos os provedores');
  all.value = '';
  sel.appendChild(all);
  const names = new Set(getProviders());
  getGames().forEach(g => { if (g.provider) names.add(g.provider); });
  [...names].forEach(n => {
    const o = el('option', '', n);
    o.value = n;
    sel.appendChild(o);
  });
  if (ui.provider && !names.has(ui.provider)) ui.provider = '';
  sel.value = ui.provider;
}

// ---------- lista ----------

function renderList() {
  const box = $('gcList');
  box.replaceChildren();
  const q = normalizeKey(ui.search);
  const counts = sessionsByGame();
  const games = getGames().filter(g => (!ui.provider || g.provider === ui.provider) && (!q || normalizeKey(g.name).includes(q) || normalizeKey(g.provider).includes(q)));
  if (games.length === 0) {
    box.appendChild(el('p', 'graficos-note', getGames().length ? 'Nenhum jogo com esse filtro.' : 'Biblioteca vazia. Adicione um jogo, importe as sugestões ou digite o nome direto no "Registrar aposta".'));
    return;
  }
  const groups = new Map();
  games.forEach(g => {
    const key = g.provider || 'Sem provedor';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  [...groups.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(key => {
    box.appendChild(el('div', 'gc-group', `${key} (${groups.get(key).length})`));
    groups.get(key).forEach(g => {
      const row = el('div', 'gc-row');
      const info = el('div', 'gc-row-info');
      info.appendChild(el('span', 'gc-row-name', `${g.emoji ? `${g.emoji} ` : ''}${g.name}`));
      const meta = [];
      if (g.stakes.length) meta.push(`Valores: ${g.stakes.map(v => formatCurrency(v)).join(' · ')}`);
      else meta.push('Valores: ainda não informados');
      const n = counts.get(g.id) || 0;
      if (n) meta.push(`${n} sessão(ões)`);
      info.appendChild(el('span', 'gc-row-meta', meta.join(' · ')));
      if (g.notes) info.appendChild(el('span', 'gc-row-meta', g.notes));
      if (g.traitsTags && g.traitsTags.length) info.appendChild(el('span', 'gc-row-meta', `🧬 ${g.traitsTags.join(' · ')}`));
      row.appendChild(info);
      row.appendChild(button('Editar', 'bet-manage-btn', () => {
        ui.editing = { id: g.id, name: g.name, provider: g.provider, stakesText: formatStakes(g.stakes), emoji: g.emoji, notes: g.notes, traitsTags: (g.traitsTags || []).slice(), traitsText: g.traitsText || '' };
        renderEditor();
        $('gcEditor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }));
      box.appendChild(row);
    });
  });
}

// ---------- editor ----------

function renderEditor() {
  const box = $('gcEditor');
  box.replaceChildren();
  const d = ui.editing;
  if (!d) return;
  const card = el('div', 'gc-editor');
  card.appendChild(el('h3', 'gc-editor-title', d.id ? 'Editar jogo' : 'Novo jogo'));

  const field = (label, node, hint) => {
    const f = el('label', 'gc-field');
    f.appendChild(el('span', 'plan-label', label));
    f.appendChild(node);
    if (hint) f.appendChild(el('span', 'plan-hint', hint));
    card.appendChild(f);
  };
  const input = (value, ph, max, onInput, attrs = {}) => {
    const i = el('input', 'plan-input');
    i.type = 'text';
    i.value = value || '';
    i.placeholder = ph;
    if (max) i.maxLength = max;
    Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v));
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };

  field('Nome', input(d.name, 'Ex.: Fortune Tiger', GAME_NAME_MAX, v => { d.name = v; }));

  const provWrap = el('div', 'gc-prov');
  const sel = el('select', 'plan-input');
  const none = el('option', '', 'Sem provedor');
  none.value = '';
  sel.appendChild(none);
  const provs = getProviders();
  provs.forEach(n => { const o = el('option', '', n); o.value = n; sel.appendChild(o); });
  const other = el('option', '', 'Outro…');
  other.value = '__other';
  sel.appendChild(other);
  const otherInput = input('', 'Nome do provedor', PROVIDER_NAME_MAX, v => { d.provider = v; });
  const known = !d.provider || provs.includes(d.provider);
  sel.value = known ? (d.provider || '') : '__other';
  if (!known) otherInput.value = d.provider;
  otherInput.classList.toggle('app-hidden', known);
  sel.addEventListener('change', () => {
    if (sel.value === '__other') { d.provider = otherInput.value; otherInput.classList.remove('app-hidden'); otherInput.focus(); }
    else { d.provider = sel.value; otherInput.classList.add('app-hidden'); }
  });
  provWrap.appendChild(sel);
  provWrap.appendChild(otherInput);
  field('Provedor', provWrap);

  field('Emoji', input(d.emoji, 'Ex.: 🐯', 16, v => { d.emoji = v.slice(0, 16); }), 'Opcional.');
  field('Valores de aposta do jogo', input(d.stakesText, 'Ex.: 0,40; 0,80; 1,20; 2,00', 600, v => { d.stakesText = v; }, { inputmode: 'decimal' }), 'Separe com ponto e vírgula. Pode completar depois.');
  const notes = el('textarea', 'plan-input');
  notes.rows = 2;
  notes.maxLength = GAME_NOTES_MAX;
  notes.value = d.notes || '';
  notes.placeholder = 'Opcional';
  notes.addEventListener('input', () => { d.notes = notes.value; });
  field('Observação', notes);

  // (11a) Características
  const tr = el('div', 'gc-traits');
  tr.appendChild(buildTagsEditor({
    tags: d.traitsTags || [],
    suggestions: tagSuggestions(getGames().map(g => ({ tags: g.traitsTags })), d.traitsTags || []),
    onChange: (t) => { d.traitsTags = t; }
  }));
  const trText = el('textarea', 'plan-input');
  trText.rows = 3;
  trText.maxLength = TRAITS_TEXT_MAX;
  trText.value = d.traitsText || '';
  trText.placeholder = 'Como o jogo se comporta (volatilidade, quando paga, rodadas…)';
  trText.addEventListener('input', () => { d.traitsText = trText.value; });
  tr.appendChild(trText);
  field('🧬 Características', tr, 'Etiquetas + texto livre. Base pra IA no futuro.');

  const actions = el('div', 'plan-actions');
  actions.appendChild(button('Cancelar', 'bet-manage-btn', () => { ui.editing = null; renderEditor(); }));
  if (d.id) actions.appendChild(button('Excluir', 'btn-remove-modal', (e) => onDelete(d, e.target)));
  actions.appendChild(button(d.id ? 'Salvar alterações' : 'Adicionar', 'btn-confirm', (e) => onSave(d, e.target)));
  card.appendChild(actions);
  box.appendChild(card);
}

async function onSave(d, btn) {
  if (busy) return;
  const parsed = parseStakesText(d.stakesText);
  if (!parsed.ok) { await showAppAlert(parsed.error); return; }
  busy = true;
  btn.disabled = true;
  try {
    const result = await saveGame(state.currentUid, { id: d.id || undefined, name: d.name, provider: d.provider, stakes: parsed.stakes, emoji: d.emoji, notes: d.notes, traitsTags: d.traitsTags || [], traitsText: d.traitsText || '' });
    if (!result.ok) { await showAppAlert(result.error); return; }
    ui.editing = null;
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) renderAll();
  }
}

async function onDelete(d, btn) {
  if (busy) return;
  const n = sessionsByGame().get(d.id) || 0;
  const ok = await showAppConfirm(`Excluir "${d.name}" da biblioteca?${n ? ` As ${n} sessão(ões) já lançadas continuam com o nome guardado.` : ''}`);
  if (!ok || !mounted) return;
  busy = true;
  btn.disabled = true;
  try {
    const result = await deleteGame(state.currentUid, d.id);
    if (!result.ok) { await showAppAlert(result.error); return; }
    ui.editing = null;
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- sugestões ----------

function renderSuggestions() {
  const box = $('gcSuggest');
  const sum = $('gcSuggestSum');
  box.replaceChildren();
  const list = pendingSuggestions(getGames());
  sum.textContent = `💡 Sugestões pra importar (${list.length})`;
  if (list.length === 0) {
    box.appendChild(el('p', 'plan-hint', 'Todas as sugestões já estão na biblioteca.'));
    return;
  }
  if (!ui.suggestChecked) ui.suggestChecked = new Set(list.map((s, i) => `${s.provider}|${s.name}`));
  box.appendChild(el('p', 'plan-hint', 'Pré-lista com os títulos mais conhecidos de cada provedor. Desmarque os que não existem nas suas plataformas e importe — depois dá pra editar ou excluir à vontade.'));
  const groups = new Map();
  list.forEach(s => {
    if (!groups.has(s.provider)) groups.set(s.provider, []);
    groups.get(s.provider).push(s);
  });
  groups.forEach((items, prov) => {
    box.appendChild(el('div', 'gc-group', prov));
    const wrap = el('div', 'gc-suggest-list');
    items.forEach(s => {
      const key = `${s.provider}|${s.name}`;
      const row = el('label', 'gc-suggest');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = ui.suggestChecked.has(key);
      cb.addEventListener('change', () => { if (cb.checked) ui.suggestChecked.add(key); else ui.suggestChecked.delete(key); });
      row.appendChild(cb);
      row.appendChild(el('span', '', s.name));
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  });
  const actions = el('div', 'plan-actions');
  actions.appendChild(button('Desmarcar todos', 'bet-manage-btn', () => { ui.suggestChecked = new Set(); renderSuggestions(); }));
  actions.appendChild(button('Importar marcados', 'btn-confirm', async (e) => {
    if (busy) return;
    const chosen = list.filter(s => ui.suggestChecked.has(`${s.provider}|${s.name}`));
    if (!chosen.length) { await showAppAlert('Nenhum jogo marcado.'); return; }
    busy = true;
    e.target.disabled = true;
    try {
      const result = await addGamesBulk(state.currentUid, chosen);
      if (!result.ok) { await showAppAlert(result.error); return; }
      ui.suggestChecked = null;
      await showAppAlert(`${result.added} jogo(s) adicionados à biblioteca.`);
    } finally {
      busy = false;
      if (mounted) renderAll();
    }
  }));
  box.appendChild(actions);
}

// ---------- provedores ----------

function renderProviders() {
  const box = $('gcProviders');
  box.replaceChildren();
  if (!ui.providersDraft) ui.providersDraft = getProviders();
  const list = el('div', 'plan-chips');
  ui.providersDraft.forEach(n => list.appendChild(button(`${n} ✕`, 'plan-chip active', () => {
    ui.providersDraft = ui.providersDraft.filter(x => x !== n);
    renderProviders();
  })));
  box.appendChild(list);
  const row = el('div', 'plan-row');
  const add = el('input', 'plan-input');
  add.type = 'text';
  add.maxLength = PROVIDER_NAME_MAX;
  add.placeholder = 'Novo provedor';
  row.appendChild(add);
  row.appendChild(button('Adicionar', 'bet-manage-btn plan-btn-inline', () => {
    const v = add.value.trim();
    if (!v) return;
    if (ui.providersDraft.some(x => normalizeKey(x) === normalizeKey(v))) { showAppAlert('Esse provedor já está na lista.'); return; }
    ui.providersDraft = [...ui.providersDraft, v];
    renderProviders();
  }));
  box.appendChild(row);
  box.appendChild(el('p', 'plan-hint', 'Tirar um provedor da lista não muda os jogos que já usam esse nome. Toque num provedor pra remover.'));
  const actions = el('div', 'plan-actions');
  actions.appendChild(button('Salvar provedores', 'btn-confirm', async (e) => {
    if (busy) return;
    busy = true;
    e.target.disabled = true;
    try {
      const result = await saveProviders(state.currentUid, ui.providersDraft);
      if (!result.ok) { await showAppAlert(result.error); return; }
      ui.providersDraft = null;
    } finally {
      busy = false;
      if (mounted) renderAll();
    }
  }));
  box.appendChild(actions);
}

// ---------- API pública (view-graficos.js) ----------

export function mountGameCatalog(root) {
  if (!root) return;
  unmountGameCatalog();
  rootEl = root;
  mounted = true;
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba: a biblioteca pode ter ganhado jogo novo pelo Financeiro.
export function refreshGameCatalog() {
  if (!mounted || loadStatus !== 'ok' || busy) return;
  if (!ui.editing) renderAll();
}

export function unmountGameCatalog() {
  loadToken++;
  mounted = false;
  rootEl = null;
  busy = false;
  ui.editing = null;
  ui.providersDraft = null;
  ui.suggestChecked = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
