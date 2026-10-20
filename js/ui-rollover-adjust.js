// === (Sub-entrega 17) ⬇️ ROLLOVER ABATIDO + CONFERÊNCIA EM LOTE ===
// Dois contêineres, os dois abertos pelo "Bônus da semana" (ui-bonus-manager.js):
//
// 1) openRolloverAdjust({ platform, ctx }) — DENTRO de uma plataforma.
//    Mostra o rollover do sistema AGORA e dois campos ligados (preencher um
//    preenche o outro): "Rollover abatido" ou "Rollover que a plataforma
//    mostra". Confirmar grava um abatimento (rolloverAdjustments) só na
//    memória — quem chama grava com savePlatform.
//      → { status:'done', value } | { status:'cancelled' }
//
// 2) openBatchCheck({ resolveCtx }) — TODAS as plataformas de uma vez.
//    Topo: "📋 Colar lista" — escolhe o que a lista traz (Saldo real /
//    Rollover real / Abater), cola uma linha por plataforma ("DDUU 40,00",
//    "DDUU; 12,5", "DDUU<tab>,3", "DDUU: R$ 40,00"…) e "Ler lista" preenche
//    as linhas (nome sem diferenciar maiúscula/minúscula). Pode colar várias
//    vezes (ex.: saldos e depois rollovers) antes de gravar.
//    Cada linha: Saldo real (diferença + vira bônus avulso com R; − fica
//    divergente) · Rollover (real ou abater) · prévia "Rollover depois".
//    Linha com erro trava a gravação. "Gravar" confirma o resumo e grava
//    cada plataforma alterada (savePlatform — documento inteiro).
//      → { status:'done', changed:[platform] } | { status:'cancelled' }
//
// Regras (balance-check-logic.js): o rollover só SOBE por bônus com escala
// maior — rollover real acima do sistema é erro (aumente o R do bônus da
// linha); abaixo vira ⬇️ abatimento. Comparação sempre com o rollover do
// sistema NO INSTANTE (computeRolloverAt), sem o VIP diário "com aposta"
// que ainda vai entrar no fim do dia.
// Segurança: tudo por textContent/value.

import { state } from './state.js';
import { formatCurrency, showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import { computeRolloverLive } from './finance-logic.js';
import {
  computeBalanceGap, applyPositiveGap, recordBalanceCheck,
  previewRollover, planRolloverTarget, addRolloverAdjustment, addRolloverIncrease, ROLLOVER_TOLERANCE
} from './balance-check-logic.js';
import { parseSplitMoney } from './ui-bonus-split.js';

let activeClose = null;

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

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

function moneyInput(placeholder) {
  const i = el('input', 'bc-input');
  i.type = 'text';
  i.inputMode = 'decimal';
  i.autocomplete = 'off';
  i.placeholder = placeholder;
  return i;
}

function fmtInput(v) {
  return Number.isFinite(v) ? r2(v).toFixed(2).replace('.', ',') : '';
}

// Nome comparável: maiúsculas, sem espaços/acentos.
function normName(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toUpperCase();
}

// Overlay comum (fixo, rolagem travada, Esc / toque fora / troca de tela).
function openOverlay({ sheet = false } = {}) {
  if (activeClose) activeClose(null);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const overlay = el('div', sheet ? 'bm-overlay' : 'bc-overlay');
  overlay.style.zIndex = '205'; // acima do "Bônus da semana" (200)
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', sheet ? 'bm-sheet' : 'bc-box');
  overlay.appendChild(box);
  let onClose = () => {};
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
    onClose(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
  }
  function onRoute() { close(null); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);
  activeClose = close;
  document.body.appendChild(overlay);
  return { overlay, box, close, setOnClose: fn => { onClose = fn; } };
}

// Dois campos ligados: abatido ↔ rollover real. getSys() = rollover do
// sistema de referência. Devolve { el, get(), refresh() }.
function rolloverPair(getSys, onChange = () => {}) {
  const wrap = el('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;';
  const mk = (label, ph) => {
    const l = el('label', 'bc-label', label);
    l.style.cssText = 'flex:1 1 9rem;min-width:0;';
    const i = moneyInput(ph);
    i.style.width = '100%';
    l.appendChild(i);
    wrap.appendChild(l);
    return i;
  };
  const abInput = mk('Rollover abatido', 'Ex.: ,3');
  const realInput = mk('Rollover que a plataforma mostra', 'Ex.: 12,50');
  let source = null; // 'abated' | 'real' | null
  function sync(from) {
    const sys = getSys();
    if (from === 'abated') {
      const v = parseSplitMoney(abInput.value);
      source = abInput.value.trim() ? 'abated' : null;
      realInput.value = source && Number.isFinite(v) && Number.isFinite(sys) ? fmtInput(Math.max(0, sys - v)) : '';
    } else if (from === 'real') {
      const v = parseSplitMoney(realInput.value);
      source = realInput.value.trim() ? 'real' : null;
      abInput.value = source && Number.isFinite(v) && Number.isFinite(sys) && v <= sys ? fmtInput(sys - v) : '';
    }
    onChange();
  }
  abInput.addEventListener('input', () => sync('abated'));
  realInput.addEventListener('input', () => sync('real'));
  return {
    el: wrap,
    inputs: { abInput, realInput },
    get() {
      if (source === 'abated') return { abated: parseSplitMoney(abInput.value), raw: abInput.value };
      if (source === 'real') return { real: parseSplitMoney(realInput.value), raw: realInput.value };
      return {};
    },
    set(kind, raw) {
      if (kind === 'abated') { abInput.value = raw; sync('abated'); }
      else if (kind === 'real') { realInput.value = raw; sync('real'); }
    },
    refresh() { if (source) sync(source); }
  };
}

// ============================================================
// 1) INDIVIDUAL
// ============================================================

export function openRolloverAdjust({ platform, ctx = {} } = {}) {
  return new Promise(resolve => {
    const { box, close, setOnClose } = openOverlay();
    setOnClose(result => resolve(result || { status: 'cancelled' }));
    const now = new Date();
    const sysNow = previewRollover(platform, ctx, now);
    const liveEnd = r2(computeRolloverLive(platform, now, ctx));

    box.appendChild(el('h3', 'bc-title', '⬇️ Rollover abatido'));
    box.appendChild(el('p', 'bc-sub', platform.name));
    const grid = el('div', 'bc-grid');
    grid.appendChild(el('span', 'bc-k', 'Rollover do sistema agora'));
    grid.appendChild(el('span', 'bc-v', formatCurrency(sysNow)));
    if (liveEnd > sysNow + ROLLOVER_TOLERANCE) {
      grid.appendChild(el('span', 'bc-k', 'Ainda entra hoje (VIP diário "com aposta")'));
      grid.appendChild(el('span', 'bc-v', `+${formatCurrency(r2(liveEnd - sysNow))}`));
    }
    box.appendChild(grid);

    const preview = el('p', 'bc-note');
    const error = el('p', 'bc-error');
    error.hidden = true;
    const pair = rolloverPair(() => sysNow, () => render());
    box.appendChild(pair.el);
    box.appendChild(preview);
    box.appendChild(error);
    box.appendChild(el('p', 'bc-note', 'Use quando a plataforma deu baixa no rollover sem aposta (ex.: bônus de ontem que não precisa mais ser apostado). Só o Rollover muda — Saldo e bônus não. Pode ser excluído depois no "Bônus da semana".'));

    // (37) acima do sistema: pergunta + marcador ⬆️ Aumento
    const upMark = el('label', 'bc-above-mark');
    const upCb = el('input');
    upCb.type = 'checkbox';
    upMark.appendChild(upCb);
    const upTxt = document.createTextNode('');
    upMark.appendChild(upTxt);
    upMark.hidden = true;
    upCb.addEventListener('change', () => render());
    box.insertBefore(upMark, error.nextSibling);
    function plan() { return planRolloverTarget(sysNow, pair.get()); }
    function render() {
      const p = plan();
      error.hidden = true;
      upMark.hidden = p.kind !== 'above';
      if (p.kind === 'above') {
        upTxt.textContent = ` ⬆️ Aumento — lançar +${formatCurrency(p.value)} no Rollover`;
        preview.textContent = upCb.checked ? `Aumento +${formatCurrency(p.value)} · Rollover depois: ${formatCurrency(p.after)}` : 'Marque "Aumento" se a plataforma subiu o rollover (ou suba o R do bônus no "Bônus da semana").';
        error.textContent = p.error;
        error.hidden = false;
        return;
      }
      if (p.kind === 'abate') preview.textContent = `Abatimento −${formatCurrency(p.value)} · Rollover depois: ${formatCurrency(p.after)}`;
      else if (p.kind === 'match') preview.textContent = 'Igual ao sistema — nada a abater.';
      else if (p.kind === 'none') preview.textContent = 'Preencha um dos dois campos.';
      else { preview.textContent = ''; error.textContent = p.error; error.hidden = false; }
    }
    render();

    const f = el('div', 'bc-footer');
    f.appendChild(btn('Cancelar', 'bc-cancel', () => close(null)));
    f.appendChild(btn('Confirmar', 'btn-confirm', () => {
      const p = plan();
      if (p.kind === 'above' && upCb.checked) { // (37)
        addRolloverIncrease(platform, p.value, { at: now, now, source: 'manual' });
        close({ status: 'done', value: -p.value });
        return;
      }
      if (p.kind !== 'abate') { render(); if (p.kind === 'none' || p.kind === 'match') { error.textContent = p.kind === 'none' ? 'Preencha o valor abatido ou o rollover que a plataforma mostra.' : 'Nada a abater.'; error.hidden = false; } return; }
      addRolloverAdjustment(platform, p.value, { at: now, now, source: 'manual' });
      close({ status: 'done', value: p.value });
    }));
    box.appendChild(f);
    setTimeout(() => { try { pair.inputs.abInput.focus({ preventScroll: true }); } catch (_) { /* ignora */ } }, 30);
  });
}

// ============================================================
// 2) EM LOTE (+ 📋 Colar lista)
// ============================================================

const PASTE_KINDS = Object.freeze([
  { id: 'saldo', label: 'Saldo real' },
  { id: 'real', label: 'Rollover real' },
  { id: 'abater', label: 'Abater' }
]);

/**
 * Lê a lista colada: uma linha por plataforma, nome + valor (o ÚLTIMO
 * número da linha). Separadores: tab, ;, :, |, " - ", espaços. Aceita
 * "R$", "1.250,50", ",3". Linhas vazias são ignoradas.
 * → { rows:[{ name, value, line }], bad:[line] }
 */
export function parsePastedList(text) {
  const rows = [];
  const bad = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const cleaned = line.replace(/R\$\s*/gi, ' ').replace(/[;|:\t]/g, ' ').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();
    const m = cleaned.match(/^(.*?)[\s=]+(-?[\d.,]*\d|[.,]\d+)$/);
    if (!m) { bad.push(line); return; }
    const name = m[1].trim();
    const value = parseSplitMoney(m[2]);
    if (!name || !Number.isFinite(value)) { bad.push(line); return; }
    rows.push({ name, value, line });
  });
  return { rows, bad };
}

export function openBatchCheck({ resolveCtx = () => ({}) } = {}) {
  return new Promise(resolve => {
    const { box, close, setOnClose } = openOverlay({ sheet: true });
    setOnClose(result => resolve(result || { status: 'cancelled' }));
    const now = new Date();

    const platforms = [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
    const byName = new Map(platforms.map(p => [normName(p.name), p]));
    const rows = platforms.map(p => {
      let ctx = {};
      try { ctx = resolveCtx(p) || {}; } catch (_) { ctx = {}; }
      return { p, ctx, saldoRaw: '', scale: 1, rollKind: null, rollRaw: '', view: null, upOk: false }; // (37) upOk: ⬆️ Aumento marcado
    });
    const rowById = new Map(rows.map(r => [r.p.id, r]));
    const ui = { search: '', onlyFilled: false, pasteKind: 'saldo' };

    // --- cabeçalho ---
    const head = el('div', 'bm-head');
    const titleBox = el('div', 'bm-title-box');
    titleBox.appendChild(el('h3', 'bm-title', '📋 Conferência em lote'));
    titleBox.appendChild(el('p', 'bm-sub', 'Saldo real e rollover de várias plataformas de uma vez · só as linhas preenchidas são gravadas'));
    head.appendChild(titleBox);
    const x = btn('✕', 'bm-close', () => close(null));
    x.setAttribute('aria-label', 'Fechar');
    head.appendChild(x);
    box.appendChild(head);

    const scroll = el('div', 'bm-list');
    box.appendChild(scroll);

    // --- 📋 colar lista ---
    const paste = el('div', 'bm-row open');
    paste.style.padding = '0.6rem';
    paste.appendChild(el('span', 'bc-k', '📋 Colar lista — o que a lista traz:'));
    const kinds = el('div', 'plan-chips bm-chips');
    const kindBtns = PASTE_KINDS.map(k => {
      const b = btn(k.label, 'plan-chip', () => { ui.pasteKind = k.id; paintKinds(); });
      kinds.appendChild(b);
      return [k.id, b];
    });
    function paintKinds() { kindBtns.forEach(([id, b]) => b.classList.toggle('active', id === ui.pasteKind)); }
    paintKinds();
    paste.appendChild(kinds);
    const area = el('textarea', 'bm-input');
    area.rows = 4;
    area.placeholder = 'Uma linha por plataforma — nome e valor. Ex.:\nDDUU 40,00\n36Q; 12,5\n35C: R$ ,30';
    area.style.cssText = 'width:100%;resize:vertical;font-family:inherit;';
    paste.appendChild(area);
    const pasteMsg = el('p', 'bc-note');
    const readBtn = btn('Ler lista', 'bet-manage-btn', () => {
      const { rows: got, bad } = parsePastedList(area.value);
      const unknown = [];
      let filled = 0;
      got.forEach(g => {
        const p = byName.get(normName(g.name));
        if (!p) { unknown.push(g.name); return; }
        const r = rowById.get(p.id);
        const raw = fmtInput(g.value);
        if (ui.pasteKind === 'saldo') r.saldoRaw = raw;
        else { r.rollKind = ui.pasteKind === 'real' ? 'real' : 'abated'; r.rollRaw = raw; }
        filled++;
      });
      const parts = [`${filled} linha(s) preenchida(s) com ${PASTE_KINDS.find(k => k.id === ui.pasteKind).label}.`];
      if (unknown.length) parts.push(`Nome não encontrado: ${unknown.join(', ')}.`);
      if (bad.length) parts.push(`Não lida(s): ${bad.slice(0, 5).join(' | ')}${bad.length > 5 ? '…' : ''}.`);
      pasteMsg.textContent = parts.join(' ');
      pasteMsg.style.color = unknown.length || bad.length ? '#b91c1c' : '';
      if (filled) { area.value = ''; ui.onlyFilled = true; onlyBtn.classList.add('active'); }
      renderRows();
    });
    paste.appendChild(readBtn);
    paste.appendChild(pasteMsg);
    scroll.appendChild(paste);

    // --- filtros ---
    const filters = el('div', 'bm-filters');
    const search = el('input', 'bm-input');
    search.type = 'search';
    search.placeholder = 'Buscar plataforma';
    search.addEventListener('input', () => { ui.search = search.value; renderRows(); });
    const onlyBtn = btn('Só preenchidas', 'plan-chip', () => { ui.onlyFilled = !ui.onlyFilled; onlyBtn.classList.toggle('active', ui.onlyFilled); renderRows(); });
    filters.appendChild(search);
    filters.appendChild(onlyBtn);
    scroll.appendChild(filters);

    const list = el('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;';
    scroll.appendChild(list);

    // --- cálculo de uma linha ---
    function evalRow(r) {
      const out = { filled: false, gap: null, plan: { kind: 'none' }, error: '', notes: [] };
      const saldoTxt = r.saldoRaw.trim();
      if (saldoTxt) {
        out.filled = true;
        const v = parseSplitMoney(saldoTxt);
        if (!Number.isFinite(v) || v < 0) { out.error = 'Saldo inválido.'; return out; }
        out.gap = computeBalanceGap(r.p, v, r.ctx, now, 0);
        if (out.gap.negative) out.notes.push(`saldo do sistema estava ${formatCurrency(Math.abs(out.gap.raw))} abaixo de zero (falta lançamento)`);
      }
      const gapMut = c => { if (out.gap && out.gap.kind === 'over') applyPositiveGap(c, out.gap, r.scale, now); };
      out.sys = previewRollover(r.p, r.ctx, now, gapMut);
      const rollTxt = r.rollRaw.trim();
      if (rollTxt && r.rollKind) {
        out.filled = true;
        const v = parseSplitMoney(rollTxt);
        if (!Number.isFinite(v)) { out.error = 'Rollover inválido.'; return out; }
        out.plan = planRolloverTarget(out.sys, r.rollKind === 'real' ? { real: v } : { abated: v });
        if (out.plan.kind === 'error') out.error = out.plan.error;
        // (37) acima do sistema: só grava com o ⬆️ Aumento marcado (ou subindo o R do bônus)
        if (out.plan.kind === 'above' && !r.upOk) out.error = `${out.plan.error} Marque ⬆️ Aumento ou suba o R do bônus.`;
      }
      return out;
    }

    // --- linhas ---
    function renderRows() {
      list.replaceChildren();
      const q = normName(ui.search);
      let shown = 0;
      rows.forEach(r => {
        const filled = !!(r.saldoRaw.trim() || r.rollRaw.trim());
        if (ui.onlyFilled && !filled) return;
        if (q && !normName(r.p.name).includes(q)) return;
        shown++;
        list.appendChild(rowEl(r));
      });
      if (!shown) list.appendChild(el('p', 'bm-empty', ui.onlyFilled ? 'Nenhuma linha preenchida ainda — cole uma lista ou preencha à mão.' : 'Nenhuma plataforma encontrada.'));
      paintFooter();
    }

    function rowEl(r) {
      const card = el('div', 'bm-row open');
      card.style.padding = '0.55rem 0.6rem';
      const top = el('div');
      top.style.cssText = 'display:flex;justify-content:space-between;gap:0.5rem;align-items:baseline;';
      top.appendChild(el('strong', 'bm-row-name', r.p.name));
      const liveRoll = previewRollover(r.p, r.ctx, now);
      top.appendChild(el('span', 'bm-row-meta', `Rollover agora ${formatCurrency(liveRoll)}`));
      card.appendChild(top);

      const fields = el('div');
      fields.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem;';
      const saldo = moneyInput('Saldo real');
      saldo.style.cssText = 'flex:1 1 7rem;min-width:0;min-height:38px;padding:0.4rem 0.6rem;font-size:0.95rem;';
      saldo.value = r.saldoRaw;
      saldo.setAttribute('aria-label', `Saldo real de ${r.p.name}`);
      const sel = el('select', 'bm-input');
      sel.style.cssText = 'flex:0 1 8.5rem;min-width:0;';
      [['', 'Rollover…'], ['real', 'Rollover real'], ['abated', 'Abater']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sel.appendChild(o); });
      sel.value = r.rollKind || '';
      sel.setAttribute('aria-label', `Tipo do rollover de ${r.p.name}`);
      const roll = moneyInput('Valor');
      roll.style.cssText = 'flex:1 1 6rem;min-width:0;min-height:38px;padding:0.4rem 0.6rem;font-size:0.95rem;';
      roll.value = r.rollRaw;
      roll.setAttribute('aria-label', `Rollover de ${r.p.name}`);
      fields.append(saldo, sel, roll);
      card.appendChild(fields);

      const extra = el('div');
      const status = el('p', 'bc-note');
      status.style.margin = '0.3rem 0 0';
      card.appendChild(extra);
      card.appendChild(status);

      function paint() {
        const v = evalRow(r);
        r.view = v;
        extra.replaceChildren();
        if (v.gap && v.gap.kind === 'over') {
          const sc = el('div', 'bc-scale');
          sc.style.marginTop = '0.3rem';
          sc.appendChild(el('span', 'bc-k', `Bônus +${formatCurrency(v.gap.diff)} · Rollover`));
          const val = el('span', 'bc-scale-val', r.scale === 0 ? 'sem' : `${r.scale}:1`);
          const minus = btn('−', 'bc-step', () => { r.scale = Math.max(0, r.scale - 1); paint(); paintFooter(); });
          const plus = btn('+', 'bc-step', () => { r.scale = Math.min(100, r.scale + 1); paint(); paintFooter(); });
          [minus, plus].forEach(b => { b.style.width = '34px'; b.style.height = '34px'; });
          minus.disabled = r.scale <= 0;
          minus.setAttribute('aria-label', 'Diminuir escala do Rollover do bônus (0 = sem rollover)');
          plus.setAttribute('aria-label', 'Aumentar escala do Rollover do bônus');
          sc.append(minus, val, plus);
          extra.appendChild(sc);
        }
        if (v.plan.kind === 'above') { // (37) marcador ⬆️ Aumento da linha
          const m = el('label', 'bc-above-mark');
          const c = el('input');
          c.type = 'checkbox';
          c.checked = !!r.upOk;
          c.addEventListener('change', () => { r.upOk = c.checked; paint(); paintFooter(); });
          m.appendChild(c);
          m.appendChild(document.createTextNode(` ⬆️ Aumento +${formatCurrency(v.plan.value)}`));
          extra.appendChild(m);
        }
        const bits = [];
        if (v.gap) {
          if (v.gap.kind === 'match') bits.push('saldo ✓ confere');
          else if (v.gap.kind === 'over') bits.push(`bônus avulso +${formatCurrency(v.gap.diff)}`);
          else bits.push(`saldo ${formatCurrency(Math.abs(v.gap.diff))} abaixo → fica divergente (escolha os bônus não recebidos depois)`);
        }
        bits.push(...v.notes);
        if (v.plan.kind === 'abate') bits.push(`abatimento −${formatCurrency(v.plan.value)}`);
        if (v.plan.kind === 'above') bits.push(`⬆️ aumento +${formatCurrency(v.plan.value)}`);
        if (v.plan.kind === 'match') bits.push('rollover ✓ confere');
        if (v.filled && !v.error) bits.push(`Rollover depois: ${formatCurrency(v.plan.kind === 'abate' || v.plan.kind === 'above' ? v.plan.after : v.sys)}`);
        status.textContent = v.error ? `⚠ ${v.error}` : bits.join(' · ');
        status.style.color = v.error ? '#b91c1c' : '';
        card.style.borderColor = v.error ? '#fca5a5' : (v.filled ? '#86efac' : '');
      }
      saldo.addEventListener('input', () => { r.saldoRaw = saldo.value; paint(); paintFooter(); });
      sel.addEventListener('change', () => { r.rollKind = sel.value || null; paint(); paintFooter(); });
      roll.addEventListener('input', () => { r.rollRaw = roll.value; if (!r.rollKind && roll.value.trim()) { r.rollKind = 'real'; sel.value = 'real'; } paint(); paintFooter(); });
      paint();
      return card;
    }

    // --- rodapé ---
    const foot = el('div', 'bc-footer');
    foot.style.cssText = 'padding:0.6rem 0.8rem;border-top:1px solid rgba(15,23,42,0.08);align-items:center;';
    const summary = el('span', 'bc-k');
    summary.style.cssText = 'margin-right:auto;font-size:0.8rem;';
    const saveBtn = btn('Gravar', 'btn-confirm', () => apply());
    foot.append(summary, btn('Cancelar', 'bc-cancel', () => close(null)), saveBtn);
    box.appendChild(foot);

    function filledRows() {
      return rows.filter(r => r.saldoRaw.trim() || r.rollRaw.trim()).map(r => ({ r, v: evalRow(r) }));
    }
    function paintFooter() {
      const f = filledRows();
      const bad = f.filter(x => x.v.error);
      summary.textContent = f.length ? `${f.length} preenchida(s)${bad.length ? ` · ${bad.length} com erro` : ''}` : 'Nada preenchido';
      saveBtn.disabled = !f.length || bad.length > 0;
    }

    async function apply() {
      const f = filledRows();
      const bad = f.filter(x => x.v.error);
      if (!f.length) return;
      if (bad.length) { paintFooter(); return; }
      const count = { bonus: 0, match: 0, divergent: 0, abate: 0, up: 0 };
      f.forEach(({ v }) => {
        if (v.gap) count[v.gap.kind === 'over' ? 'bonus' : v.gap.kind === 'match' ? 'match' : 'divergent']++;
        if (v.plan.kind === 'abate') count.abate++;
        if (v.plan.kind === 'above') count.up++; // (37)
      });
      const ok = await showAppConfirm(
        `Gravar ${f.length} plataforma(s)? ` +
        [count.match && `${count.match} saldo(s) conferido(s)`, count.bonus && `${count.bonus} bônus avulso(s)`, count.divergent && `${count.divergent} saldo(s) divergente(s)`, count.abate && `${count.abate} abatimento(s) de rollover`, count.up && `${count.up} aumento(s) de rollover`].filter(Boolean).join(' · ') + '.'
      );
      if (!ok) return;
      const changed = [];
      f.forEach(({ r }) => {
        const v = evalRow(r); // recalcula na hora (mesmo `now`)
        if (v.error) return;
        const p = r.p;
        let check = null;
        if (v.gap) {
          if (v.gap.kind === 'over') check = applyPositiveGap(p, v.gap, r.scale, now);
          else check = recordBalanceCheck(p, v.gap, v.gap.kind === 'match' ? 'match' : 'divergent', now);
        }
        if (v.plan.kind === 'abate') {
          // rollover do sistema já com o bônus gravado acima — confere de novo.
          const plan2 = planRolloverTarget(previewRollover(p, r.ctx, now), r.rollKind === 'real' ? { real: parseSplitMoney(r.rollRaw) } : { abated: parseSplitMoney(r.rollRaw) });
          if (plan2.kind === 'abate') addRolloverAdjustment(p, plan2.value, { at: now, now, source: 'batch', checkId: check && check.id ? check.id : null });
        }
        if (v.plan.kind === 'above' && r.upOk) { // (37) ⬆️ aumento — confere de novo com o bônus já gravado
          const plan3 = planRolloverTarget(previewRollover(p, r.ctx, now), { real: parseSplitMoney(r.rollRaw) });
          if (plan3.kind === 'above') addRolloverIncrease(p, plan3.value, { at: now, now, source: 'batch', checkId: check && check.id ? check.id : null });
        }
        savePlatform(state.currentUid, p);
        changed.push(p);
      });
      close({ status: 'done', changed });
    }

    renderRows();
  });
}
