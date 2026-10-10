// === MINI-CONTÊINER "🆕 NOVA PLATAFORMA" (Sub-entrega 11b) ===
// Fixo e centralizado. Aberto pelo card "💼 Caixa do período" do
// Planejador. Decide se o Planejador reserva dinheiro pra ativar
// plataformas que AINDA NÃO estão cadastradas (orçamento separado).
//
//   Planejar novas ativações [sim/não]
//   Quantidade · Valor destinado (R$, todas juntas) · 1 ativação a cada X
//   dias · Primeira ativação · Nível (1º…8º ou Aleatório + 🎲 Sortear de
//   novo) · Manutenção padrão (R$ 10 a cada 8 dias)
//   Por plataforma: nome, valor próprio, nível próprio, emissão alvo
//   (2/3/7/15/30), manutenção própria, vincular a uma plataforma real.
//   [Cancelar] [Salvar]
//
// Grava só plannerConfig/newPlatforms. Segurança: textContent/value.

import { state } from './state.js';
import { formatCurrency } from './utils.js';
import { parseMoneyInput } from './wager-total-logic.js';
import { getNewPlatformsConfig, saveNewPlatformsConfig } from './plan-store.js';
import {
  NEW_PLATFORMS_MAX, EMISSION_TARGETS, LEVEL_OPTIONS, NP_NAME_MAX,
  sanitizeNewPlatformsConfig, resolveNewPlatforms, newSlotId
} from './newplatform-logic.js';
import { toLocalDateString } from './finance-logic.js';

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

function fmtKey(k) {
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : '';
}

function moneyText(v) {
  return v ? String(v).replace('.', ',') : '';
}

function levelLabel(l) {
  if (l === 'random') return '🎲 Aleatório';
  const o = LEVEL_OPTIONS[l - 1];
  return o ? `${l}º · ${formatCurrency(o.value)}` : '—';
}

/** @returns {Promise<{status:'saved'|'cancelled'}>} */
export function openNewPlatformEditor() {
  if (activeClose) activeClose({ status: 'cancelled' });
  return new Promise(resolve => {
    const today = toLocalDateString(new Date());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = el('div', 'np-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'np-box');
    overlay.appendChild(box);

    let closed = false;
    let busy = false;
    let error = '';
    const openSlots = new Set();
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
    function onKey(e) {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); close({ status: 'cancelled' }); }
    }
    function onRoute() { close({ status: 'cancelled' }); }
    overlay.addEventListener('click', e => { if (e.target === overlay && !busy) close({ status: 'cancelled' }); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);

    // Rascunho (textos crus nos campos de dinheiro).
    const cfg = getNewPlatformsConfig();
    const draft = {
      ...cfg,
      totalText: moneyText(cfg.totalBudget),
      maintText: moneyText(cfg.maintValue),
      slots: cfg.slots.map(s => ({ ...s, valueText: moneyText(s.value), maintText: s.maintValue === null ? '' : moneyText(s.maintValue) }))
    };

    function ensureSlots() {
      while (draft.slots.length < draft.count) draft.slots.push({ id: newSlotId(), name: '', value: null, valueText: '', level: null, target: 2, maintValue: null, maintText: '', maintEvery: null, linkedPlatformId: null });
      if (draft.slots.length > draft.count) draft.slots.length = draft.count;
    }

    function toConfig() {
      return sanitizeNewPlatformsConfig({
        ...draft,
        totalBudget: parseMoneyInput(draft.totalText) || 0,
        maintValue: draft.maintText === '' ? 0 : (parseMoneyInput(draft.maintText) || 0),
        slots: draft.slots.map(s => ({
          ...s,
          value: s.valueText === '' ? null : parseMoneyInput(s.valueText),
          maintValue: s.maintText === '' ? null : parseMoneyInput(s.maintText)
        }))
      }, today);
    }

    function field(label, node, hint = '') {
      const f = el('label', 'np-field');
      f.appendChild(el('span', 'np-label', label));
      f.appendChild(node);
      if (hint) f.appendChild(el('span', 'np-hint', hint));
      return f;
    }

    // Campos de texto NÃO redesenham o contêiner (o teclado/foco não pula):
    // só o resumo e as linhas das plataformas são atualizados. Quantidade
    // redesenha (cria/remove plataformas).
    function input(value, { type = 'text', mode = null, ph = '', onInput, min = null, max = null, maxLength = null, rerender = false } = {}) {
      const i = el('input', 'np-input');
      i.type = type;
      if (mode) i.inputMode = mode;
      if (ph) i.placeholder = ph;
      if (min !== null) i.min = String(min);
      if (max !== null) i.max = String(max);
      if (maxLength) i.maxLength = maxLength;
      i.value = value === null || value === undefined ? '' : String(value);
      i.addEventListener('input', () => onInput(i.value));
      i.addEventListener('change', () => (rerender ? render() : updateSummary()));
      return i;
    }

    function render() {
      if (closed) return;
      ensureSlots();
      const scroll = box.scrollTop;
      box.replaceChildren();
      box.appendChild(el('h3', 'np-title', '🆕 Nova plataforma'));
      box.appendChild(el('p', 'np-note', 'Reserva dinheiro pra ativar plataformas que você ainda vai cadastrar. Orçamento separado do Misterioso. Nada é lançado — é só previsão no Caixa.'));

      const tog = el('label', 'np-toggle');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = draft.enabled;
      cb.addEventListener('change', () => { draft.enabled = cb.checked; render(); });
      tog.appendChild(cb);
      tog.appendChild(el('span', '', 'Planejar e reservar dinheiro pra novas ativações'));
      box.appendChild(tog);

      const grid = el('div', 'np-grid');
      grid.appendChild(field('Quantidade', input(draft.count, { type: 'number', min: 1, max: NEW_PLATFORMS_MAX, mode: 'numeric', rerender: true, onInput: v => { draft.count = Math.max(1, Math.min(NEW_PLATFORMS_MAX, Math.round(Number(v)) || 1)); } })));
      grid.appendChild(field('Valor destinado (R$)', input(draft.totalText, { mode: 'decimal', ph: 'Ex.: 210,00', onInput: v => { draft.totalText = v; } }), 'Todas juntas'));
      grid.appendChild(field('1 ativação a cada', input(draft.intervalDays, { type: 'number', min: 1, max: 90, mode: 'numeric', onInput: v => { draft.intervalDays = Math.round(Number(v)) || 1; } }), 'dias'));
      grid.appendChild(field('Primeira ativação', input(draft.startKey, { type: 'date', onInput: v => { draft.startKey = v; } })));
      box.appendChild(grid);

      box.appendChild(el('span', 'np-label', 'Nível de ativação (patamares do Misterioso)'));
      const lv = el('div', 'np-chips');
      LEVEL_OPTIONS.forEach(o => lv.appendChild(btn(levelLabel(o.level), `np-chip${draft.level === o.level ? ' on' : ''}`, () => { draft.level = o.level; render(); })));
      lv.appendChild(btn('🎲 Aleatório', `np-chip${draft.level === 'random' ? ' on' : ''}`, () => { draft.level = 'random'; render(); }));
      box.appendChild(lv);
      if (draft.level === 'random' || draft.slots.some(s => s.level === 'random')) {
        box.appendChild(btn('🎲 Sortear de novo', 'bet-manage-btn np-reseed', () => { draft.seed = Math.floor(Math.random() * 2147483645) + 1; render(); }));
      }

      const mg = el('div', 'np-grid');
      mg.appendChild(field('Manutenção padrão (R$)', input(draft.maintText, { mode: 'decimal', ph: '10,00', onInput: v => { draft.maintText = v; } }), 'Perpétua, depois da ativação'));
      mg.appendChild(field('a cada', input(draft.maintEvery, { type: 'number', min: 1, max: 90, mode: 'numeric', onInput: v => { draft.maintEvery = Math.round(Number(v)) || 8; } }), 'dias'));
      box.appendChild(mg);

      // ---- resumo + por plataforma ----
      const res = resolveNewPlatforms(toConfig(), today);
      summaryEl = el('div', 'np-sum');
      box.appendChild(summaryEl);
      slotEls = [];

      res.slots.forEach((r, i) => {
        const s = draft.slots[i];
        const card = el('div', 'np-slot');
        const head = el('button', 'np-slot-head');
        head.type = 'button';
        const nameEl = el('span', 'np-slot-name');
        const metaEl = el('span', 'np-slot-meta');
        head.appendChild(nameEl);
        head.appendChild(metaEl);
        slotEls.push({ card, nameEl, metaEl });
        head.addEventListener('click', () => { if (openSlots.has(s.id)) openSlots.delete(s.id); else openSlots.add(s.id); render(); });
        card.appendChild(head);
        if (openSlots.has(s.id)) {
          const body = el('div', 'np-slot-body');
          body.appendChild(field('Nome', input(s.name, { maxLength: NP_NAME_MAX, ph: `Nova ${i + 1}`, onInput: v => { s.name = v; } })));
          body.appendChild(field('Valor próprio (R$)', input(s.valueText, { mode: 'decimal', ph: 'Vazio = valor do nível', onInput: v => { s.valueText = v; } }), 'Ex.: as que pagam muito'));
          const sel = el('select', 'np-input');
          [['inherit', 'Seguir o geral'], ...LEVEL_OPTIONS.map(o => [String(o.level), levelLabel(o.level)]), ['random', '🎲 Aleatório']].forEach(([v, t]) => {
            const o = el('option', '', t);
            o.value = v;
            sel.appendChild(o);
          });
          sel.value = s.level === null ? 'inherit' : String(s.level);
          sel.addEventListener('change', () => { s.level = sel.value === 'inherit' ? null : (sel.value === 'random' ? 'random' : Number(sel.value)); render(); });
          body.appendChild(field('Nível próprio', sel));
          body.appendChild(el('span', 'np-label', 'Emissão alvo (dia do ciclo)'));
          const tg = el('div', 'np-chips');
          EMISSION_TARGETS.forEach(t => tg.appendChild(btn(`Dia ${t}`, `np-chip${s.target === t ? ' on' : ''}`, () => { s.target = t; render(); })));
          body.appendChild(tg);
          body.appendChild(el('span', 'np-hint', 'Ex.: travada no 1º nível só no dia 30 = 1º + Dia 30. Nível 2 na primeira emissão = 2º + Dia 2.'));
          const mrow = el('div', 'np-grid');
          mrow.appendChild(field('Manutenção (R$)', input(s.maintText, { mode: 'decimal', ph: 'Padrão', onInput: v => { s.maintText = v; } })));
          mrow.appendChild(field('a cada (dias)', input(s.maintEvery === null ? '' : s.maintEvery, { type: 'number', min: 1, max: 90, mode: 'numeric', ph: 'Padrão', onInput: v => { s.maintEvery = v === '' ? null : Math.round(Number(v)) || null; } })));
          body.appendChild(mrow);
          const link = el('select', 'np-input');
          const none = el('option', '', 'Não vinculada (ainda não cadastrada)');
          none.value = '';
          link.appendChild(none);
          [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true })).forEach(p => {
            const o = el('option', '', p.name);
            o.value = p.id;
            link.appendChild(o);
          });
          link.value = s.linkedPlatformId || '';
          link.addEventListener('change', () => { s.linkedPlatformId = link.value || null; render(); });
          body.appendChild(field('Já cadastrei — vincular a', link, 'Vinculada sai do Caixa (passam a valer as rotinas dela).'));
          card.appendChild(body);
        }
        box.appendChild(card);
      });

      if (error) box.appendChild(el('p', 'np-error', error));
      const footer = el('div', 'np-footer');
      footer.appendChild(btn('Cancelar', 'np-cancel', () => { if (!busy) close({ status: 'cancelled' }); }));
      const save = btn(busy ? 'Salvando…' : 'Salvar', 'btn-confirm', onSave);
      save.disabled = busy;
      footer.appendChild(save);
      box.appendChild(footer);
      updateSummary(res);
      box.scrollTop = scroll;
    }

    let summaryEl = null;
    let slotEls = [];
    function updateSummary(pre = null) {
      if (closed || !summaryEl) return;
      const res = pre || resolveNewPlatforms(toConfig(), today);
      summaryEl.replaceChildren();
      summaryEl.classList.toggle('over', res.overC > 0);
      summaryEl.appendChild(el('strong', '', `Ativações: ${formatCurrency(res.activationC / 100)}${res.budgetC ? ` de ${formatCurrency(res.budgetC / 100)}` : ''}`));
      if (res.overC > 0) summaryEl.appendChild(el('span', '', `Passa ${formatCurrency(res.overC / 100)} do valor destinado.`));
      res.warnings.filter(w => !w.startsWith('A soma')).forEach(w => summaryEl.appendChild(el('span', '', w)));
      res.slots.forEach((r, i) => {
        const ref = slotEls[i];
        if (!ref) return;
        ref.card.classList.toggle('linked', !!r.linkedPlatformId);
        ref.card.classList.toggle('nofit', !r.fits);
        ref.nameEl.textContent = r.label;
        ref.metaEl.textContent = r.linkedPlatformId
          ? '🔗 vinculada · fora do Caixa'
          : `${r.level ? `${r.level}º · ` : 'valor próprio · '}${formatCurrency(r.valueC / 100)} · ativa ${fmtKey(r.activationKey)} · depositar até ${fmtKey(r.depositByKey)}${r.fits ? '' : ' · não cabe'}`;
      });
    }

    async function onSave() {
      if (busy) return;
      error = '';
      const bad = [];
      if (draft.totalText !== '' && !(parseMoneyInput(draft.totalText) >= 0)) bad.push('valor destinado');
      if (draft.maintText !== '' && !(parseMoneyInput(draft.maintText) >= 0)) bad.push('manutenção padrão');
      draft.slots.forEach((s, i) => {
        if (s.valueText !== '' && !(parseMoneyInput(s.valueText) > 0)) bad.push(`valor da ${s.name || `Nova ${i + 1}`}`);
        if (s.maintText !== '' && !(parseMoneyInput(s.maintText) >= 0)) bad.push(`manutenção da ${s.name || `Nova ${i + 1}`}`);
      });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.startKey || ''))) bad.push('primeira ativação');
      if (bad.length) { error = `Confira: ${bad.join(', ')}.`; render(); return; }
      busy = true;
      render();
      const r = await saveNewPlatformsConfig(state.currentUid, toConfig());
      busy = false;
      if (!r.ok) { error = r.error; render(); return; }
      close({ status: 'saved' });
    }

    document.body.appendChild(overlay);
    render();
  });
}
