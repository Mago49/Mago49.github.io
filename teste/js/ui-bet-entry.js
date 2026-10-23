// === MINI-CONTÊINER "REGISTRAR APOSTA" (Sub-entrega 9) ===
// Fixo e centralizado (mesmo padrão dos outros mini-contêineres): a tela
// do Financeiro fica só com o botão; os campos moram aqui.
//
//   Jogo (opcional — seletor da biblioteca, com busca; nome novo entra
//   sozinho na biblioteca) · Dia e hora (semana aberta, até agora) ·
//   Valor apostado · Nº de apostas · R.B.
//
// openBetEntry(...) devolve Promise:
//   { status:'done', values:{ date, wagered, betCount, resultBetting, game } }
//   { status:'batch', batch:{ text, rows, whenTime } }   (Sub-entrega 22)
//   { status:'cancelled' }
//
// (Sub-entrega 22) 📋 COLAR EM LOTE: escolha no topo "Uma aposta / 📋 Colar
// em lote". O lote é montado DENTRO deste mesmo contêiner (ui-bet-batch.js)
// — nenhum botão novo na tela do Financeiro. "Uma aposta" continua
// exatamente igual. initial.mode = 'batch' reabre o lote sem perder nada
// (ex.: conferência de saldo cancelada). Fechar com texto colado pede
// confirmação.
// NÃO grava a aposta — quem chama (ui-finance-panel.js) faz a conferência
// de saldo (8a), monta o lançamento e grava com savePlatform. Só o jogo
// NOVO é gravado aqui (na biblioteca), na hora de confirmar.
//
// Segurança: nomes por textContent.

import { state } from './state.js';
import { formatCurrency, showAppConfirm } from './utils.js';
import { parseMoneyInput } from './wager-total-logic.js';
import { getWeekStart, toLocalDateString, roundMoney } from './finance-logic.js';
import { searchGames, recentGameIds, normalizeKey } from './game-catalog-logic.js';
import { loadGameCatalog, isGameCatalogLoaded, getGames, getGame, getProviders, saveGame } from './game-catalog-store.js';
import { mountBatchView } from './ui-bet-batch.js';

const r2 = roundMoney;
let activeClose = null;

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

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtInput(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(r2(n)).replace('.', ',') : '';
}

/**
 * @param {object} o  platform, initial (valores pra reabrir sem perder nada)
 */
export function openBetEntry({ platform, initial = null } = {}) {
  if (activeClose) activeClose({ status: 'cancelled' });

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = el('div', 'be-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'be-box');
    overlay.appendChild(box);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      activeClose = null;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      resolve(result);
    }
    activeClose = close;
    // (22) Lote com texto colado: confirma antes de descartar.
    let batchApi = null;
    let mode = initial && initial.mode === 'batch' ? 'batch' : 'single';
    let confirming = false;
    async function requestClose() {
      if (mode === 'batch' && batchApi && batchApi.isDirty()) {
        if (confirming) return;
        confirming = true;
        const ok = await showAppConfirm('Descartar o lote colado? Nada foi registrado ainda.');
        confirming = false;
        if (!ok) return;
      }
      close({ status: 'cancelled' });
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (confirming) return; // Esc da confirmação é dela
      e.preventDefault();
      e.stopPropagation();
      // 1º Esc fecha a lista de sugestões; o seguinte fecha o contêiner.
      if (suggestOpen && mode === 'single') {
        suggest.replaceChildren();
        suggestOpen = false;
        return;
      }
      requestClose();
    }
    function onRoute() { close({ status: 'cancelled' }); }
    overlay.addEventListener('click', e => { if (e.target === overlay) requestClose(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);

    box.appendChild(el('h3', 'be-title', 'Registrar aposta'));
    box.appendChild(el('p', 'be-sub', platform ? platform.name : ''));

    // (22) Uma aposta / 📋 Colar em lote
    const modeBar = el('div', 'be-mode');
    modeBar.setAttribute('role', 'group');
    modeBar.setAttribute('aria-label', 'Como registrar');
    const singleBtn = btn('Uma aposta', 'be-mode-btn', () => setMode('single'));
    const batchBtn = btn('📋 Colar em lote', 'be-mode-btn', () => setMode('batch'));
    modeBar.appendChild(singleBtn);
    modeBar.appendChild(batchBtn);
    box.appendChild(modeBar);
    const singleWrap = el('div', 'be-single');
    const batchWrap = el('div', 'be-batch');
    box.appendChild(singleWrap);
    box.appendChild(batchWrap);
    function setMode(m) {
      mode = m;
      singleBtn.classList.toggle('active', m === 'single');
      batchBtn.classList.toggle('active', m === 'batch');
      singleBtn.setAttribute('aria-pressed', m === 'single' ? 'true' : 'false');
      batchBtn.setAttribute('aria-pressed', m === 'batch' ? 'true' : 'false');
      singleWrap.classList.toggle('app-hidden', m !== 'single');
      batchWrap.classList.toggle('app-hidden', m !== 'batch');
      box.classList.toggle('be-box-wide', m === 'batch');
      if (m === 'batch' && suggestOpen) { suggest.replaceChildren(); suggestOpen = false; }
      if (m === 'batch' && !batchApi) {
        batchApi = mountBatchView(batchWrap, {
          platform,
          initial: initial && initial.mode === 'batch' ? initial.batch : null,
          onSubmit: batch => close({ status: 'batch', batch }),
          onCancel: () => requestClose()
        });
      } else if (m === 'batch' && batchApi) batchApi.focus();
    }

    // ---- Jogo ----
    let selected = initial && initial.game ? initial.game : null; // jogo do catálogo
    let pendingNew = initial && initial.newGame ? { ...initial.newGame } : null; // { name, provider }
    let suggestOpen = false;
    let catalogOk = isGameCatalogLoaded(state.currentUid);

    const gameField = el('div', 'be-field');
    gameField.appendChild(el('span', 'be-label', 'Jogo (opcional)'));
    const chosen = el('div', 'be-chosen');
    const search = el('input', 'be-input');
    search.type = 'search';
    search.placeholder = 'Buscar ou digitar o nome do jogo';
    search.autocomplete = 'off';
    search.setAttribute('aria-label', 'Jogo');
    const suggest = el('div', 'be-suggest');
    const providerRow = el('div', 'be-provider app-hidden');
    const providerSel = el('select', 'be-input');
    providerSel.setAttribute('aria-label', 'Provedor do jogo novo');
    providerRow.appendChild(el('span', 'be-label', 'Provedor do jogo novo'));
    providerRow.appendChild(providerSel);
    const catalogNote = el('p', 'be-note app-hidden');
    gameField.appendChild(chosen);
    gameField.appendChild(search);
    gameField.appendChild(suggest);
    gameField.appendChild(providerRow);
    gameField.appendChild(catalogNote);
    singleWrap.appendChild(gameField);

    function fillProviders() {
      providerSel.replaceChildren();
      const none = el('option', '', 'Sem provedor');
      none.value = '';
      providerSel.appendChild(none);
      getProviders().forEach(p => {
        const o = el('option', '', p);
        o.value = p;
        providerSel.appendChild(o);
      });
      if (pendingNew) providerSel.value = pendingNew.provider || '';
    }
    providerSel.addEventListener('change', () => { if (pendingNew) pendingNew.provider = providerSel.value; });

    function renderChosen() {
      chosen.replaceChildren();
      const label = selected ? `${selected.emoji ? `${selected.emoji} ` : ''}${selected.name}${selected.provider ? ` · ${selected.provider}` : ''}`
        : (pendingNew ? `＋ ${pendingNew.name} (novo — entra na biblioteca)` : null);
      chosen.classList.toggle('app-hidden', !label);
      search.classList.toggle('app-hidden', !!label);
      providerRow.classList.toggle('app-hidden', !pendingNew);
      if (!label) return;
      chosen.appendChild(el('span', 'be-chip', label));
      const x = btn('Trocar', 'be-chip-x', () => {
        selected = null;
        pendingNew = null;
        renderChosen();
        search.value = '';
        search.focus();
        renderSuggest();
      });
      chosen.appendChild(x);
      if (selected && Array.isArray(selected.stakes) && selected.stakes.length) {
        chosen.appendChild(el('span', 'be-stakes', `Valores: ${selected.stakes.map(v => formatCurrency(v)).join(' · ')}`));
      }
    }

    function renderSuggest() {
      suggest.replaceChildren();
      const q = search.value.trim();
      if (!catalogOk || (!q && document.activeElement !== search)) { suggestOpen = false; return; }
      const list = searchGames(getGames(), q, recentGameIds(state.platforms)).slice(0, 8);
      list.forEach(g => suggest.appendChild(btn(`${g.emoji ? `${g.emoji} ` : ''}${g.name}${g.provider ? ` · ${g.provider}` : ''}`, 'be-opt', () => {
        selected = g;
        pendingNew = null;
        suggestOpen = false;
        suggest.replaceChildren();
        renderChosen();
      })));
      const exact = getGames().some(g => normalizeKey(g.name) === normalizeKey(q));
      if (q && !exact) {
        suggest.appendChild(btn(`＋ Adicionar "${q.slice(0, 60)}" à biblioteca`, 'be-opt be-opt-new', () => {
          pendingNew = { name: q.slice(0, 60), provider: '' };
          selected = null;
          suggestOpen = false;
          suggest.replaceChildren();
          fillProviders();
          renderChosen();
        }));
      }
      if (!q && list.length === 0) suggest.appendChild(el('p', 'be-note', 'Biblioteca vazia — digite o nome pra adicionar.'));
      suggestOpen = suggest.children.length > 0;
    }
    search.addEventListener('input', renderSuggest);
    search.addEventListener('focus', renderSuggest);

    // ---- Dia e hora ----
    const now = new Date();
    const weekStart = getWeekStart(now);
    const whenField = el('label', 'be-field');
    whenField.appendChild(el('span', 'be-label', 'Dia e hora'));
    const when = el('input', 'be-input');
    when.type = 'datetime-local';
    when.min = toLocalInput(weekStart);
    when.max = toLocalInput(now);
    when.value = initial && initial.when ? initial.when : toLocalInput(now);
    whenField.appendChild(when);
    singleWrap.appendChild(whenField);

    // ---- valores ----
    const grid = el('div', 'be-grid');
    const numField = (label, value, ph, mode = 'decimal') => {
      const f = el('label', 'be-field');
      f.appendChild(el('span', 'be-label', label));
      const i = el('input', 'be-input');
      i.type = 'text';
      i.inputMode = mode;
      i.autocomplete = 'off';
      i.placeholder = ph;
      i.value = value;
      f.appendChild(i);
      grid.appendChild(f);
      return i;
    };
    const wagered = numField('Valor apostado', initial ? fmtInput(initial.wagered) : '', 'Ex.: 25,00');
    const count = numField('Nº de apostas', initial && initial.betCount ? String(initial.betCount) : '', 'Ex.: 50', 'numeric');
    const rb = numField('R.B. (resultado)', initial && initial.resultBetting !== undefined ? fmtInput(initial.resultBetting) : '', 'Ex.: -12,50 ou 8,00');
    singleWrap.appendChild(grid);
    singleWrap.appendChild(el('p', 'be-note', 'R.B. negativo = perdeu; positivo = ganhou. Dia e hora: só a semana aberta (semana fechada fica travada).'));

    const error = el('p', 'be-error');
    singleWrap.appendChild(error);

    // ---- botões ----
    const footer = el('div', 'be-footer');
    const ok = btn('Registrar', 'btn-confirm', onConfirm);
    footer.appendChild(btn('Cancelar', 'be-cancel', () => requestClose()));
    footer.appendChild(ok);
    singleWrap.appendChild(footer);

    function parseSigned(text) {
      const t = String(text || '').trim();
      const neg = /^-/.test(t);
      const v = parseMoneyInput(t.replace(/^[-+]\s*/, ''));
      return Number.isFinite(v) ? (neg ? -v : v) : NaN;
    }

    async function onConfirm() {
      error.textContent = '';
      const w = parseMoneyInput(wagered.value);
      const c = parseInt(count.value, 10);
      const r = parseSigned(rb.value);
      if (!(w > 0) || !(c > 0) || !Number.isFinite(r)) {
        error.textContent = 'Preencha valor apostado, nº de apostas e R.B. válidos.';
        return;
      }
      if (!when.value) { error.textContent = 'Informe o dia e a hora.'; return; }
      const at = new Date(`${when.value}:00`);
      const nowCheck = new Date();
      if (isNaN(at.getTime()) || at < weekStart) { error.textContent = 'A aposta precisa ser da semana aberta (de segunda até agora).'; return; }
      if (at.getTime() > nowCheck.getTime() + 60000) { error.textContent = 'Data/hora no futuro.'; return; }
      // Mesmo minuto de agora: usa o instante real (mantém a ordem dos lançamentos).
      const dateIso = toLocalInput(nowCheck) === when.value ? nowCheck.toISOString() : at.toISOString();

      let game = selected;
      if (pendingNew) {
        ok.disabled = true;
        const saved = await saveGame(state.currentUid, { name: pendingNew.name, provider: pendingNew.provider || '' });
        ok.disabled = false;
        if (!saved.ok) {
          error.textContent = `${saved.error} (Você pode tocar em "Trocar" e registrar sem jogo.)`;
          return;
        }
        game = saved.game;
      }
      close({
        status: 'done',
        values: { date: dateIso, when: when.value, wagered: r2(w), betCount: c, resultBetting: r2(r), game }
      });
    }

    document.body.appendChild(overlay);
    renderChosen();
    setMode(mode);

    // Biblioteca: carrega na primeira vez (tolerante — sem ela, registra sem jogo).
    if (!catalogOk) {
      search.disabled = true;
      search.placeholder = 'Carregando biblioteca…';
      loadGameCatalog(state.currentUid).then(() => {
        catalogOk = true;
      }).catch(err => {
        console.warn('Registrar aposta: biblioteca de jogos não carregada.', err);
        catalogNote.textContent = 'Biblioteca de jogos indisponível agora — a aposta pode ser registrada sem jogo.';
        catalogNote.classList.remove('app-hidden');
      }).finally(() => {
        if (closed) return;
        search.disabled = !catalogOk;
        search.placeholder = catalogOk ? 'Buscar ou digitar o nome do jogo' : 'Biblioteca indisponível';
        if (selected && catalogOk) selected = getGame(selected.id) || selected;
        fillProviders();
      });
    } else {
      fillProviders();
    }
    if (mode === 'single') setTimeout(() => { try { (selected || pendingNew ? wagered : search).focus({ preventScroll: true }); } catch (_) { /* ignora */ } }, 40);
  });
}
