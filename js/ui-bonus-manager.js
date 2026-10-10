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
// Segurança: nomes por textContent.

import { state } from './state.js';
import { formatCurrency, showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import {
  listOpenWeekBonusItems, excludeBonusItems, restoreExclusion, removeAvulsoEntry,
  getOpenWeekRange, BONUS_TYPE_LABELS, bonusTypeGroup
} from './balance-check-logic.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PAGE = 7;
const GROUPS = [
  { id: 'all', label: 'ALL' },
  { id: 'vip', label: 'VIP' },
  { id: 'misterioso', label: 'Misterioso' },
  { id: 'obrigado', label: 'Obrigado' },
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
  [['all', 'Todos os bônus'], ['vip', 'Bônus VIP'], ['misterioso', 'Bônus Misterioso'], ['obrigado', 'Bônus Obrigado'], ['avulso', 'Bônus Avulso']].forEach(([v, l]) => {
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

  function itemRow(p, it) {
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

    if (it.kind === 'formula') {
      row.appendChild(btn('Não recebi', 'bm-act bm-act-off', () => act(p,
        () => (excludeBonusItems(p, [it], { now: new Date() }) > 0 ? {} : false),
        `Marcar ${BONUS_TYPE_LABELS[it.type]} de ${fmtDay(it.dayKey)} (${formatCurrency(it.value)}) como NÃO recebido em ${p.name}? Sai do Saldo, do Rollover e da aba VIP.`)));
    } else if (it.kind === 'excluded') {
      value.classList.add('bm-struck');
      row.appendChild(el('span', 'bm-tag', 'não recebido'));
      row.appendChild(btn('Desfazer', 'bm-act', () => act(p, () => {
        const shrink = restoreExclusion(p, it.exclusionId);
        return shrink ? { allowShrink: shrink } : false;
      })));
    } else {
      if (it.value < it.rawValue - 0.004) row.appendChild(el('span', 'bm-tag', `lançado ${formatCurrency(it.rawValue)}`));
      row.appendChild(btn('Excluir', 'bm-act bm-act-del', () => act(p,
        () => (removeAvulsoEntry(p, it.entry) ? { allowShrink: ['otherBonusLog'] } : false),
        `Excluir o bônus avulso de ${formatCurrency(it.rawValue)} (${fmtDay(it.dayKey)}) de ${p.name}? Sai do Saldo e do Rollover.`)));
    }
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
      const received = all.filter(i => i.kind !== 'excluded').reduce((s, i) => s + i.value, 0);
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
