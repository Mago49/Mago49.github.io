// === "📋 COLAR EM LOTE" — dentro do 🎯 Registrar aposta (Sub-entrega 22) ===
// Não abre janela própria: ui-bet-entry.js monta esta tela DENTRO do mesmo
// mini-contêiner quando você escolhe "📋 Colar em lote" no topo.
//
//   1) Colar: área de texto + "Ler texto".
//   2) Prévia: uma linha por jogo (🆕 novo · 🔁 só a diferença desde a
//      última colagem · ✔️ já registrado · ⚠ erro), editar ou tirar cada
//      linha, hora das apostas de hoje e o total que vai ser gravado.
//   3) "Registrar": confere a biblioteca (jogos e provedores novos entram
//      de uma vez — addGamesBulk) e devolve as linhas pra quem chamou.
//
// NÃO grava aposta nenhuma: quem grava é ui-finance-panel.js, pelo MESMO
// caminho do registro avulso (VIP diário, conferência de saldo, savePlatform).
// Toda a conta está em bet-batch-logic.js.
//
// Segurança: tudo que vem do texto colado entra por textContent/value.

import { state } from './state.js';
import { formatCurrency } from './utils.js';
import { getWeekStart, toLocalDateString } from './finance-logic.js';
import { parseBatchText, planBatch, missingGames, parseSignedMoney, parseDayField } from './bet-batch-logic.js';
import { loadGameCatalog, isGameCatalogLoaded, getGames, getProviders, addGamesBulk, saveProviders } from './game-catalog-store.js';
import { normalizeKey } from './game-catalog-logic.js';

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

const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fmtDay(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function money(v) {
  return formatCurrency(Number(v) || 0);
}

function signed(v) {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
}

function inputMoney(v) {
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '';
}

/**
 * Monta a tela do lote dentro de `container`.
 * @param {object} o
 *   platform, initial ({ text, rows, whenTime } pra reabrir sem perder nada),
 *   onSubmit(batch) — chamado com { text, rows, whenTime } depois da biblioteca,
 *   onCancel() — "Cancelar" (quem chama confirma se houver algo digitado).
 * @returns {{ isDirty: () => boolean, focus: () => void }}
 */
export function mountBatchView(container, { platform, initial = null, onSubmit, onCancel } = {}) {
  let text = initial && initial.text ? initial.text : '';
  let nextId = 1;
  const withId = r => ({ ...r, _id: nextId++ });
  let rows = initial && Array.isArray(initial.rows) && initial.rows.length ? initial.rows.map(withId) : null;
  let whenTime = initial && initial.whenTime ? initial.whenTime : hhmm(new Date());
  let editing = null; // _id da linha em edição
  let busy = false;
  let error = '';

  container.replaceChildren();
  const body = el('div', 'bb-body');
  container.appendChild(body);

  function limits() {
    const now = new Date();
    return { now, weekStartKey: toLocalDateString(getWeekStart(now)) };
  }

  function render() {
    body.replaceChildren();
    if (!rows) renderPaste();
    else renderPreview();
  }

  // ---------- 1) colar ----------
  function renderPaste() {
    const f = el('label', 'be-field');
    f.appendChild(el('span', 'be-label', 'Cole o histórico de apostas da plataforma'));
    const ta = el('textarea', 'be-input bb-text');
    ta.rows = 9;
    ta.placeholder = 'KAGAMING Slot | Pinata\nContagem de Apostas: 23\nData: 2026-10-15\nApostas: 11,50\nTotal de Vitórias/Derrotas: -8,32\n…';
    ta.value = text;
    ta.addEventListener('input', () => { text = ta.value; });
    f.appendChild(ta);
    body.appendChild(f);
    body.appendChild(el('p', 'be-note', 'Pode colar vários jogos de uma vez. Cada jogo vira uma aposta no histórico (o "Por jogo" continua funcionando). Colou o mesmo dia de novo mais tarde? Só a diferença é registrada.'));
    const err = el('p', 'be-error', error);
    body.appendChild(err);
    const footer = el('div', 'be-footer');
    footer.appendChild(btn('Cancelar', 'be-cancel', () => onCancel && onCancel()));
    footer.appendChild(btn('Ler texto', 'btn-confirm', () => {
      error = '';
      const parsed = parseBatchText(text, new Date());
      if (!parsed.rows.length) {
        error = 'Não encontrei nenhum jogo no texto. Confira se colou o histórico completo (com "Contagem de Apostas", "Data", "Apostas" e "Total de Vitórias/Derrotas").';
        render();
        return;
      }
      rows = parsed.rows.map(r => withId({ provider: r.provider, game: r.game, count: r.count, dayKey: r.dayKey, wagered: r.wagered, rb: r.rb }));
      if (parsed.truncated) error = 'Texto muito grande: só os primeiros 60 jogos foram lidos.';
      whenTime = hhmm(new Date());
      render();
    }));
    body.appendChild(footer);
    setTimeout(() => { try { ta.focus({ preventScroll: true }); } catch (_) { /* ignora */ } }, 40);
  }

  // ---------- 2) prévia ----------
  function renderPreview() {
    const { now, weekStartKey } = limits();
    const plan = planBatch(platform, rows, { now, whenTime, weekStartKey });
    const todayKey = toLocalDateString(now);
    const hasToday = plan.items.some(it => it.row.dayKey === todayKey);

    if (hasToday) {
      const f = el('label', 'be-field');
      f.appendChild(el('span', 'be-label', 'Hora das apostas de hoje'));
      const t = el('input', 'be-input');
      t.type = 'time';
      t.value = whenTime;
      t.max = hhmm(now);
      t.addEventListener('change', () => { if (/^\d{2}:\d{2}$/.test(t.value)) { whenTime = t.value; render(); } });
      f.appendChild(t);
      body.appendChild(f);
    }

    const list = el('div', 'bb-list');
    plan.items.forEach(it => list.appendChild(rowCard(it)));
    body.appendChild(list);

    if (plan.items.some(it => it.row.dayKey && it.row.dayKey !== todayKey && it.status !== 'error')) {
      body.appendChild(el('p', 'be-note', 'Jogos de outro dia entram às 23:58 daquele dia (o texto não tem hora) e ficam fora da métrica do Telegram.'));
    }

    const total = el('div', 'bb-total');
    total.appendChild(el('span', 'bb-total-label', plan.entries.length ? `Vai registrar ${plan.entries.length} jogo(s)` : 'Nada novo pra registrar'));
    if (plan.entries.length) {
      total.appendChild(el('span', 'bb-total-val', `${plan.totals.count} apostas · Apostado ${money(plan.totals.wagered)} · R.B. ${signed(plan.totals.rb)}`));
    }
    body.appendChild(total);
    if (plan.errorCount) body.appendChild(el('p', 'be-error', `${plan.errorCount} linha(s) com ⚠ — corrija (✏️) ou tire (🗑) antes de registrar.`));
    const err = el('p', 'be-error', error);
    body.appendChild(err);

    const footer = el('div', 'be-footer');
    footer.appendChild(btn('Cancelar', 'be-cancel', () => onCancel && onCancel()));
    footer.appendChild(btn('← Texto', 'be-cancel', () => { rows = null; editing = null; error = ''; render(); }));
    const ok = btn(plan.entries.length ? `Registrar ${plan.entries.length}` : 'Registrar', 'btn-confirm', () => submit(plan, ok));
    ok.disabled = busy || !plan.entries.length || plan.errorCount > 0;
    footer.appendChild(ok);
    body.appendChild(footer);
  }

  // A linha do plano é uma CÓPIA (blocos iguais somados): as linhas
  // originais de um mesmo jogo/dia são achadas pelo _id ou pela chave.
  function sameGroup(x, r) {
    if (r.game && r.dayKey) return x.game === r.game && x.provider === r.provider && x.dayKey === r.dayKey;
    return x._id === r._id;
  }

  function rowCard(it) {
    const r = it.row;
    const card = el('div', `bb-row bb-${it.status}`);
    const head = el('div', 'bb-row-head');
    const tb = el('div', 'bb-row-title');
    tb.appendChild(el('span', 'bb-row-name', `${r.game || '(sem nome)'}${r.provider ? ` · ${r.provider}` : ''}`));
    const parts = [];
    parts.push(r.dayKey ? fmtDay(r.dayKey) : 'sem data');
    parts.push(Number.isFinite(r.count) ? `${r.count} apostas` : '? apostas');
    parts.push(`Apostado ${Number.isFinite(r.wagered) ? money(r.wagered) : '?'}`);
    parts.push(`R.B. ${Number.isFinite(r.rb) ? signed(r.rb) : '?'}`);
    tb.appendChild(el('span', 'bb-row-sub', parts.join(' · ')));
    head.appendChild(tb);
    const actions = el('div', 'bb-row-actions');
    {
      const ed = btn('✏️', 'be-chip-x', () => { editing = editing === r._id ? null : r._id; render(); });
      ed.setAttribute('aria-label', 'Editar linha');
      actions.appendChild(ed);
      const rm = btn('🗑', 'be-chip-x', () => {
        rows = rows.filter(x => !sameGroup(x, r));
        editing = null;
        if (!rows.length) rows = null;
        render();
      });
      rm.setAttribute('aria-label', 'Tirar linha');
      actions.appendChild(rm);
    }
    head.appendChild(actions);
    card.appendChild(head);

    let badge;
    if (it.status === 'new') badge = '🆕 Novo';
    else if (it.status === 'update') badge = `🔁 Só a diferença: +${it.delta.count} apostas · ${money(it.delta.wagered)} · R.B. ${signed(it.delta.rb)}`;
    else if (it.status === 'same') badge = '✔️ Já registrado — fica de fora';
    else badge = `⚠ ${it.errors.join(' · ')}`;
    if (r.merged > 1) badge += ` (somou ${r.merged} blocos iguais)`;
    card.appendChild(el('p', 'bb-badge', badge));

    if (editing === r._id) card.appendChild(editForm(r));
    return card;
  }

  function editForm(src) {
    const wrap = el('div', 'bb-edit');
    const field = (label, value, mode = 'decimal') => {
      const f = el('label', 'be-field');
      f.appendChild(el('span', 'be-label', label));
      const i = el('input', 'be-input');
      i.type = 'text';
      i.inputMode = mode;
      i.autocomplete = 'off';
      i.value = value;
      f.appendChild(i);
      wrap.appendChild(f);
      return i;
    };
    const fCount = field('Nº de apostas', Number.isFinite(src.count) ? String(src.count) : '', 'numeric');
    const fW = field('Apostado', inputMoney(src.wagered));
    const fR = field('R.B.', inputMoney(src.rb), 'text');
    const fD = field('Data (dd/mm)', src.dayKey ? fmtDay(src.dayKey) : '', 'text');
    const save = btn('OK', 'btn-confirm bb-edit-ok', () => {
      const next = {
        provider: src.provider,
        game: src.game,
        _id: src._id,
        count: /^\d+$/.test(fCount.value.trim()) ? Number(fCount.value.trim()) : NaN,
        wagered: parseSignedMoney(fW.value),
        rb: parseSignedMoney(fR.value),
        dayKey: parseDayField(fD.value, new Date())
      };
      // Blocos iguais somados viram UMA linha com o valor editado.
      const first = rows.findIndex(x => sameGroup(x, src));
      const rest = rows.filter(x => !sameGroup(x, src));
      rest.splice(Math.max(0, first), 0, next);
      rows = rest;
      editing = null;
      render();
    });
    wrap.appendChild(save);
    return wrap;
  }

  // ---------- 3) registrar ----------
  async function submit(plan, okBtn) {
    if (busy) return;
    busy = true;
    okBtn.disabled = true;
    error = '';
    try {
      const uid = state.currentUid;
      if (!isGameCatalogLoaded(uid)) await loadGameCatalog(uid);
      const used = plan.items.filter(it => it.entry).map(it => it.row);
      const missing = missingGames(getGames(), used);
      if (missing.length) {
        const res = await addGamesBulk(uid, missing);
        if (!res.ok) throw new Error(res.error || 'Não foi possível salvar os jogos novos na biblioteca.');
        const known = new Set(getProviders().map(normalizeKey));
        const newProv = [...new Set(missing.map(g => g.provider).filter(p => p && !known.has(normalizeKey(p))))];
        if (newProv.length) {
          // Provedores novos: tolerante (a aposta não depende disso).
          saveProviders(uid, [...getProviders(), ...newProv]).catch(e => console.warn('Lote: provedores não salvos.', e));
        }
      }
      onSubmit && onSubmit({ text, rows: rows.map(({ _id, ...r }) => ({ ...r })), whenTime });
    } catch (e) {
      console.error('Lote: biblioteca de jogos:', e);
      error = `${e && e.message ? e.message : 'Biblioteca de jogos indisponível.'} Nada foi registrado — verifique a internet e tente de novo.`;
      busy = false;
      render();
      return;
    }
    busy = false;
  }

  render();
  return {
    isDirty: () => !!(text && text.trim()) || !!rows,
    focus: () => { const t = body.querySelector('textarea, input'); if (t) try { t.focus({ preventScroll: true }); } catch (_) { /* ignora */ } }
  };
}
