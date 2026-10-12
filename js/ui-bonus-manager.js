// === GERENCIADOR "BÔNUS DA SEMANA" (Sub-entrega 8a) ===
// Contêiner por cima da página (Financeiro e Painel VIP — todas as abas).
// Lista SÓ a semana aberta (segunda até hoje): semana fechada fica travada,
// então o contêiner é leve e nunca carrega o histórico inteiro.
//
// Topo: busca por plataforma · tipo (VIP / Misterioso / Obrigado / Avulso)
// · data · Limpar. Abaixo, acordeão rolável com as plataformas; ao abrir
// uma, chips ALL / VIP / Misterioso / Obrigado / Avulso e os 7 bônus mais
// recentes + "Mostrar mais" (com data escolhida, mostra direto o dia).
//
// Ações (gravam na hora, savePlatform — documento inteiro):
//   bônus esperado  → "Não recebi" (sai de Saldo, Rollover, VIP, Histórico,
//                     Gráficos e Misterioso — balance-check-logic.js)
//   marcado         → "Desfazer"
//   avulso          → "Excluir" (lançamento de "Inserir bônus hoje" ou da
//                     conferência de saldo)
//
//
// (Sub-entrega 13) 💎 Bônus Alto: filtro/chip "Alto"; cada lançamento tem
// "Editar" (valor + escala do Rollover, no próprio item) e "Excluir"
// (allowShrink: ['highBonusLog']). Sem "Não recebi" — é valor real.
//
// (Sub-entrega 14) Botão "R" (escala do Rollover, 0 = sem rollover) ao lado
// de "Não recebi" nos bônus de fórmula e ao lado de "Excluir" nos avulsos —
// editor no próprio item, grava na hora (savePlatform). Etiqueta azul
// "R …" quando a escala não é 1:1.
//
// (Sub-entrega 17) "📋 Conferência em lote" no topo (saldo real + rollover
// de várias plataformas, com "Colar lista") e "⬇️ Abatido" dentro de cada
// plataforma (ui-rollover-adjust.js). Abatimentos aparecem na lista com
// "Excluir" (allowShrink: ['rolloverAdjustments']); não somam no total de
// bônus da plataforma.
//
// Segurança: nomes por textContent.

import { state } from './state.js';
import { formatCurrency, showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import {
  listOpenWeekBonusItems, excludeBonusItems, restoreExclusion, removeAvulsoEntry,
  getOpenWeekRange, BONUS_TYPE_LABELS, bonusTypeGroup,
  removeHighBonusEntry, updateHighBonusEntry, BALANCE_MAX,
  setFormulaScale, setAvulsoScale, removeRolloverAdjustment
} from './balance-check-logic.js';
import { openRolloverAdjust, openBatchCheck } from './ui-rollover-adjust.js'; // (Sub-entrega 17)
import { parseMoneyInput } from './wager-total-logic.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PAGE = 7;
const GROUPS = [
  { id: 'all', label: 'ALL' },
  { id: 'vip', label: 'VIP' },
  { id: 'misterioso', label: 'Misterioso' },
  { id: 'obrigado', label: 'Obrigado' },
  { id: 'alto', label: '💎 Alto' },
  { id: 'avulso', label: 'Avulso' }
];

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

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/**
 * @param {object} o
 *   resolveCtx(platform) → ctx (templates do Misterioso + Obrigado)
 *   focusPlatformId     → já abre essa plataforma (Financeiro)
 *   onChanged()         → a tela de baixo redesenha
 */
export function openBonusManager({ resolveCtx = () => ({}), focusPlatformId = null, onChanged = () => {} } = {}) {
  if (activeClose) activeClose();

  const ui = {
    search: '',
    group: 'all',
    dateKey: '',
    openId: focusPlatformId,
    chip: new Map(),     // platformId -> grupo
    shown: new Map(),    // platformId -> quantos visíveis
    editing: null,       // (13/14) id do item em edição (bônus alto ou R)
    busy: false
  };
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const overlay = el('div', 'bm-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const sheet = el('div', 'bm-sheet');
  overlay.appendChild(sheet);

  const range = getOpenWeekRange(new Date());
  const head = el('div', 'bm-head');
  const titleBox = el('div', 'bm-title-box');
  titleBox.appendChild(el('h3', 'bm-title', '🧾 Bônus da semana'));
  titleBox.appendChild(el('p', 'bm-sub', `${fmtDay(range.startKey)} até hoje · só a semana aberta pode ser ajustada`));
  head.appendChild(titleBox);
  const closeBtn = btn('✕', 'bm-close', () => close());
  closeBtn.setAttribute('aria-label', 'Fechar');
  head.appendChild(closeBtn);
  sheet.appendChild(head);

  // Filtros
  const filters = el('div', 'bm-filters');
  const search = el('input', 'bm-input');
  search.type = 'search';
  search.placeholder = 'Buscar plataforma';
  search.setAttribute('aria-label', 'Buscar plataforma');
  const type = el('select', 'bm-input');
  type.setAttribute('aria-label', 'Tipo de bônus');
  [['all', 'Todos os bônus'], ['vip', 'Bônus VIP'], ['misterioso', 'Bônus Misterioso'], ['obrigado', 'Bônus Obrigado'], ['alto', '💎 Bônus Alto'], ['avulso', 'Bônus Avulso']].forEach(([v, l]) => {
    const o = el('option', '', l);
    o.value = v;
    type.appendChild(o);
  });
  const date = el('input', 'bm-input');
  date.type = 'date';
  date.min = range.startKey;
  date.max = range.todayKey;
  date.setAttribute('aria-label', 'Data');
  const clear = btn('Limpar', 'bet-manage-btn bm-clear', () => {
    ui.search = ''; ui.group = 'all'; ui.dateKey = '';
    search.value = ''; type.value = 'all'; date.value = '';
    render();
  });
  search.addEventListener('input', () => { ui.search = search.value; render(); });
  type.addEventListener('change', () => { ui.group = type.value; render(); });
  date.addEventListener('change', () => { ui.dateKey = date.value; render(); });
  filters.appendChild(search);
  filters.appendChild(type);
  filters.appendChild(date);
  filters.appendChild(clear);
  sheet.appendChild(filters);

  // (17) Conferência em lote (abre por cima; ao gravar, redesenha).
  const batchBar = el('div', 'bm-filters');
  batchBar.style.paddingTop = '0';
  const batchBtn = btn('📋 Conferência em lote (saldo / rollover)', 'bet-manage-btn', async () => {
    const res = await openBatchCheck({ resolveCtx });
    if (res && res.status === 'done' && res.changed.length) {
      res.changed.forEach(p => { try { onChanged(p); } catch (err) { console.error('Bônus da semana: falha ao redesenhar a tela:', err); } });
      if (overlay.isConnected) render();
    }
  });
  batchBtn.style.width = '100%';
  batchBar.appendChild(batchBtn);
  sheet.appendChild(batchBar);

  const list = el('div', 'bm-list');
  sheet.appendChild(list);

  function close() {
    if (!overlay.isConnected) return;
    activeClose = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', onRoute);
    window.removeEventListener('popstate', onRoute);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  }
  activeClose = close;
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }
  // Troca de tela (voltar do celular) fecha o contêiner.
  function onRoute() { close(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);

  function itemsFor(p) {
    let ctx = {};
    try { ctx = resolveCtx(p) || {}; } catch (err) { ctx = {}; }
    return listOpenWeekBonusItems(p, ctx, new Date());
  }

  function passesGlobal(it) {
    if (ui.group !== 'all' && bonusTypeGroup(it.type) !== ui.group) return false;
    if (ui.dateKey && it.dayKey !== ui.dateKey) return false;
    return true;
  }

  async function act(p, fn, confirmText) {
    if (ui.busy) return;
    if (confirmText) {
      const ok = await showAppConfirm(confirmText);
      if (!ok || !overlay.isConnected) return;
    }
    ui.busy = true;
    try {
      const opts = fn();
      if (opts !== false) {
        savePlatform(state.currentUid, p, opts || undefined);
        try { onChanged(p); } catch (err) { console.error('Bônus da semana: falha ao redesenhar a tela:', err); }
      }
    } finally {
      ui.busy = false;
      render();
    }
  }

  // (14) Rótulo da escala: "sem rollover" ou "N:1".
  function scaleLabel(sc) { return sc === 0 ? 'sem rollover' : `${sc}:1`; }

  // (14) Etiqueta azul "R …" quando a escala não é 1:1.
  function scaleTag(sc) {
    const t = el('span', 'bm-tag', `R ${scaleLabel(sc)}`);
    t.style.background = '#dbeafe';
    t.style.color = '#1d4ed8';
    return t;
  }

  // (14) Linha do R no próprio item: Rollover [−] N:1 [+] (0 = sem rollover).
  // Devolve o elemento e um getter da escala escolhida.
  function scaleStepper(initial) {
    let sc = Math.max(0, Math.min(100, Number(initial) || 0));
    const val = el('span', 'bm-item-value', scaleLabel(sc));
    const minus = btn('−', 'bc-step', () => set(sc - 1));
    const plus = btn('+', 'bc-step', () => set(sc + 1));
    minus.setAttribute('aria-label', 'Diminuir escala do Rollover (0 = sem rollover)');
    plus.setAttribute('aria-label', 'Aumentar escala do Rollover');
    function set(n) {
      sc = Math.max(0, Math.min(100, Math.round(n)));
      val.textContent = scaleLabel(sc);
      minus.disabled = sc <= 0;
      plus.disabled = sc >= 100;
    }
    set(sc);
    const box = el('div', 'bc-scale');
    box.style.flexBasis = '100%';
    box.append(el('span', 'bm-item-type', 'Rollover'), minus, val, plus);
    return { box, get: () => sc };
  }

  // (14) Editor só do R (fórmula e avulso): Cancelar / Salvar.
  function appendScaleEditor(p, row, it, apply) {
    const st = scaleStepper(it.scale);
    row.appendChild(st.box);
    row.appendChild(btn('Cancelar', 'bm-act bm-act-off', () => { ui.editing = null; render(); }));
    const save = btn('Salvar', 'bm-act', () => {
      ui.editing = null;
      act(p, () => (apply(st.get()) ? {} : false));
    });
    save.style.marginLeft = '0';
    row.appendChild(save);
  }

  // (13) 💎 bônus alto: Editar (valor + R, no próprio item) e Excluir.
  function highBonusRow(p, it) {
    const row = el('div', 'bm-item bm-item-alto');
    row.style.background = '#ecfeff';
    const info = el('div', 'bm-item-info');
    info.appendChild(el('span', 'bm-item-day', fmtDay(it.dayKey)));
    info.appendChild(el('span', 'bm-item-type', `💎 Bônus Alto${it.scale !== 1 ? ` · Rollover ${scaleLabel(it.scale)}${it.scale > 1 ? ` (${formatCurrency(it.rollover)})` : ''}` : ''}`));
    row.appendChild(info);

    if (ui.editing !== it.id) {
      row.appendChild(el('span', 'bm-item-value', formatCurrency(it.value)));
      row.appendChild(btn('Editar', 'bm-act', () => { ui.editing = it.id; render(); }));
      const del = btn('Excluir', 'bm-act bm-act-del', () => act(p,
        () => (removeHighBonusEntry(p, it.entry) ? { allowShrink: ['highBonusLog'] } : false),
        `Excluir o bônus alto de ${formatCurrency(it.value)} (${fmtDay(it.dayKey)}) de ${p.name}? Sai do Saldo, do Rollover e do bônus da semana. O depósito continua.`));
      del.style.marginLeft = '0';
      row.appendChild(del);
      return row;
    }

    const input = el('input', 'bm-input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = String(it.value).replace('.', ',');
    input.setAttribute('aria-label', 'Valor do bônus alto');
    input.style.flex = '1 1 100%';
    input.style.maxWidth = 'none';
    row.appendChild(input);
    const st = scaleStepper(it.scale);
    row.appendChild(st.box);
    row.appendChild(btn('Cancelar', 'bm-act bm-act-off', () => { ui.editing = null; render(); }));
    const save = btn('Salvar', 'bm-act', () => {
      const v = parseMoneyInput(input.value);
      if (!Number.isFinite(v) || v <= 0 || v > BALANCE_MAX) { input.focus(); return; }
      ui.editing = null;
      act(p, () => (updateHighBonusEntry(p, it.entry, { value: v, scale: st.get() }) ? {} : false));
    });
    save.style.marginLeft = '0';
    row.appendChild(save);
    return row;
  }

  // (14) Grupo das ações (etiquetas + botões) — fica junto, à direita,
  // e quebra de linha inteiro no celular.
  function actionsBox() {
    const a = el('div');
    a.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0.35rem;margin-left:auto;';
    return a;
  }

  function itemRow(p, it) {
    if (it.kind === 'alto') return highBonusRow(p, it);
    if (it.kind === 'abatido') {
      // (17) ⬇️ abatimento de rollover: só Excluir.
      const row = el('div', 'bm-item bm-item-abatido');
      row.style.background = '#fef3c7';
      const info = el('div', 'bm-item-info');
      info.appendChild(el('span', 'bm-item-day', fmtDay(it.dayKey)));
      info.appendChild(el('span', 'bm-item-type', '⬇️ Rollover abatido (não é bônus)'));
      row.appendChild(info);
      row.appendChild(el('span', 'bm-item-value', `−${formatCurrency(it.value)}`));
      const actions = actionsBox();
      const del = btn('Excluir', 'bm-act bm-act-del', () => act(p,
        () => (removeRolloverAdjustment(p, it.entry) ? { allowShrink: ['rolloverAdjustments'] } : false),
        `Excluir o abatimento de rollover de ${formatCurrency(it.value)} (${fmtDay(it.dayKey)}) de ${p.name}? O Rollover volta a contar esse valor.`));
      del.style.marginLeft = '0';
      actions.appendChild(del);
      row.appendChild(actions);
      return row;
    }
    const row = el('div', `bm-item bm-item-${it.kind}`);
    const info = el('div', 'bm-item-info');
    info.appendChild(el('span', 'bm-item-day', fmtDay(it.dayKey)));
    const label = it.kind === 'avulso'
      ? (it.fromCheck ? 'Avulso · conferência de saldo' : 'Avulso · lançado')
      : (BONUS_TYPE_LABELS[it.type] || it.type);
    info.appendChild(el('span', 'bm-item-type', label));
    row.appendChild(info);
    const value = el('span', 'bm-item-value', formatCurrency(it.value));
    row.appendChild(value);
    const editingR = ui.editing === it.id;
    const actions = actionsBox();
    const plain = b => { b.style.marginLeft = '0'; return b; };

    if (it.kind === 'formula') {
      if (it.scale !== 1) actions.appendChild(plain(scaleTag(it.scale)));
      if (editingR) {
        if (actions.childNodes.length) row.appendChild(actions);
        appendScaleEditor(p, row, it, sc => setFormulaScale(p, it.dayKey, it.type, sc, new Date()));
        return row;
      }
      const rBtn = plain(btn('R', 'bm-act', () => { ui.editing = it.id; render(); }));
      rBtn.setAttribute('aria-label', `Escala do Rollover de ${BONUS_TYPE_LABELS[it.type]} (${fmtDay(it.dayKey)})`);
      actions.appendChild(rBtn);
      actions.appendChild(plain(btn('Não recebi', 'bm-act bm-act-off', () => act(p,
        () => (excludeBonusItems(p, [it], { now: new Date() }) > 0 ? {} : false),
        `Marcar ${BONUS_TYPE_LABELS[it.type]} de ${fmtDay(it.dayKey)} (${formatCurrency(it.value)}) como NÃO recebido em ${p.name}? Sai do Saldo, do Rollover e da aba VIP.`))));
    } else if (it.kind === 'excluded') {
      value.classList.add('bm-struck');
      actions.appendChild(plain(el('span', 'bm-tag', 'não recebido')));
      actions.appendChild(plain(btn('Desfazer', 'bm-act', () => act(p, () => {
        const shrink = restoreExclusion(p, it.exclusionId);
        return shrink ? { allowShrink: shrink } : false;
      }))));
    } else {
      if (it.value < it.rawValue - 0.004) actions.appendChild(plain(el('span', 'bm-tag', `lançado ${formatCurrency(it.rawValue)}`)));
      if (it.scale !== 1) actions.appendChild(plain(scaleTag(it.scale)));
      if (editingR) {
        if (actions.childNodes.length) row.appendChild(actions);
        appendScaleEditor(p, row, it, sc => setAvulsoScale(p, it.entry, sc));
        return row;
      }
      const rBtn = plain(btn('R', 'bm-act', () => { ui.editing = it.id; render(); }));
      rBtn.setAttribute('aria-label', 'Escala do Rollover deste avulso');
      actions.appendChild(rBtn);
      actions.appendChild(plain(btn('Excluir', 'bm-act bm-act-del', () => act(p,
        () => (removeAvulsoEntry(p, it.entry) ? { allowShrink: ['otherBonusLog'] } : false),
        `Excluir o bônus avulso de ${formatCurrency(it.rawValue)} (${fmtDay(it.dayKey)}) de ${p.name}? Sai do Saldo e do Rollover.`))));
    }
    row.appendChild(actions);
    return row;
  }

  function render() {
    list.replaceChildren();
    const q = ui.search.trim().toLowerCase();
    const platforms = [...state.platforms]
      .filter(p => !q || String(p.name).toLowerCase().includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));

    let shownAny = false;
    platforms.forEach(p => {
      const all = itemsFor(p).filter(passesGlobal);
      if (all.length === 0) return;
      shownAny = true;
      const isOpen = ui.openId === p.id;
      const card = el('div', `bm-row${isOpen ? ' open' : ''}`);
      const h = el('button', 'bm-row-head');
      h.type = 'button';
      h.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      h.appendChild(el('span', 'bm-row-name', p.name));
      const received = all.filter(i => i.kind !== 'excluded' && i.kind !== 'abatido').reduce((s, i) => s + i.value, 0);
      const off = all.filter(i => i.kind === 'excluded').length;
      h.appendChild(el('span', 'bm-row-meta', `${formatCurrency(received)}${off ? ` · ${off} não recebido(s)` : ''}`));
      h.appendChild(el('span', 'platform-manage-chevron', '▾'));
      h.addEventListener('click', () => { ui.openId = isOpen ? null : p.id; render(); });
      card.appendChild(h);

      if (isOpen) {
        const body = el('div', 'bm-row-body');
        const chips = el('div', 'plan-chips bm-chips');
        const current = ui.chip.get(p.id) || 'all';
        GROUPS.forEach(g => chips.appendChild(btn(g.label, `plan-chip${current === g.id ? ' active' : ''}`, () => {
          ui.chip.set(p.id, g.id);
          ui.shown.set(p.id, PAGE);
          render();
        })));
        body.appendChild(chips);
        // (17) ⬇️ Abatido — baixa de rollover sem aposta nesta plataforma.
        const abBtn = btn('⬇️ Abatido (rollover)', 'bet-manage-btn', async () => {
          let ctx = {};
          try { ctx = resolveCtx(p) || {}; } catch (_) { ctx = {}; }
          const res = await openRolloverAdjust({ platform: p, ctx });
          if (res && res.status === 'done') act(p, () => ({}));
        });
        abBtn.style.alignSelf = 'flex-start';
        body.appendChild(abBtn);
        const filtered = all.filter(i => current === 'all' || bonusTypeGroup(i.type) === current);
        const limit = ui.dateKey ? filtered.length : (ui.shown.get(p.id) || PAGE);
        if (filtered.length === 0) body.appendChild(el('p', 'bm-empty', 'Nada desse tipo nesta semana.'));
        filtered.slice(0, limit).forEach(it => body.appendChild(itemRow(p, it)));
        if (filtered.length > limit) {
          body.appendChild(btn(`Mostrar mais (${filtered.length - limit})`, 'bet-manage-btn bm-more', () => {
            ui.shown.set(p.id, limit + PAGE);
            render();
          }));
        }
        card.appendChild(body);
      }
      list.appendChild(card);
    });

    if (!shownAny) {
      list.appendChild(el('p', 'bm-empty', 'Nenhum bônus na semana aberta com esses filtros (semana já fechada não aparece aqui).'));
    }
  }

  document.body.appendChild(overlay);
  render();
  if (focusPlatformId) {
    const openRow = list.querySelector('.bm-row.open');
    if (openRow) openRow.scrollIntoView({ block: 'nearest' });
  }
  return close;
}
