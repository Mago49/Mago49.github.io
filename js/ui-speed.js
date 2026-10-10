// === MINI-CONTÊINER "⚡ VELOCIDADE" (Sub-entrega 11a) ===
// Fixo e centralizado (mesmo padrão dos outros mini-contêineres). Aberto
// pelo Planejador, por plataforma.
//
//   Peso normal: ×0,5 · ×1 · ×1,5 · ×2 · ×3 ou valor próprio (0,25 a 5)
//   Épocas: nome (opcional) · de · até · multiplicador — editáveis e
//   excluíveis. Ex.: "Paga mais no feriado" 01/11 → 15/11 ×2.
//   [Cancelar] [Salvar]
//
// Grava só plannerConfig/speed (plan-store.js savePlatformSpeed).
// Segurança: textos por textContent/value.

import { state } from './state.js';
import { parseMoneyInput } from './wager-total-logic.js';
import { getSpeedConfig, savePlatformSpeed } from './plan-store.js';
import {
  SPEED_PRESETS, SPEED_MIN, SPEED_MAX, EPOCHS_MAX, EPOCH_LABEL_MAX,
  getPlatformSpeed, sanitizeEpoch, newEpochId, formatMult
} from './speed-logic.js';

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

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtNum(n) {
  return String(n).replace('.', ',');
}

/** @returns {Promise<{status:'saved'|'cancelled'}>} */
export function openSpeedEditor({ platform } = {}) {
  if (activeClose) activeClose({ status: 'cancelled' });
  return new Promise(resolve => {
    if (!platform) { resolve({ status: 'cancelled' }); return; }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = el('div', 'sp-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'sp-box');
    overlay.appendChild(box);

    let closed = false;
    let busy = false;
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

    const cur = getPlatformSpeed(getSpeedConfig(), platform.id);
    const draft = {
      baseText: fmtNum(cur.base),
      epochs: cur.epochs.map(e => ({ ...e, multText: fmtNum(e.mult) }))
    };
    let error = '';

    function render() {
      box.replaceChildren();
      box.appendChild(el('h3', 'sp-title', '⚡ Velocidade de investimento'));
      box.appendChild(el('p', 'sp-sub', platform.name));
      box.appendChild(el('p', 'sp-note', 'Peso da plataforma: aumenta a meta sugerida do plano e a prioridade dela no orçamento do Misterioso. Épocas dão uma fatia maior da meta aos dias que pagam mais. Nenhum valor de bônus muda.'));

      box.appendChild(el('span', 'sp-label', 'Peso normal'));
      const chips = el('div', 'sp-chips');
      SPEED_PRESETS.forEach(m => chips.appendChild(btn(formatMult(m), `sp-chip${parseMoneyInput(draft.baseText) === m ? ' on' : ''}`, () => { draft.baseText = fmtNum(m); render(); })));
      box.appendChild(chips);
      const baseIn = el('input', 'sp-input');
      baseIn.type = 'text';
      baseIn.inputMode = 'decimal';
      baseIn.value = draft.baseText;
      baseIn.setAttribute('aria-label', 'Peso próprio');
      baseIn.addEventListener('input', () => { draft.baseText = baseIn.value; });
      baseIn.addEventListener('change', render);
      const baseRow = el('label', 'sp-row');
      baseRow.appendChild(el('span', 'sp-k', 'Ou valor próprio (×)'));
      baseRow.appendChild(baseIn);
      box.appendChild(baseRow);

      box.appendChild(el('span', 'sp-label', `Épocas (${draft.epochs.length})`));
      if (!draft.epochs.length) box.appendChild(el('p', 'sp-note', 'Nenhuma época. Ex.: "Feriado" de 01/11 a 15/11 ×2.'));
      draft.epochs.forEach((e, i) => {
        const card = el('div', 'sp-epoch');
        const name = el('input', 'sp-input');
        name.type = 'text';
        name.maxLength = EPOCH_LABEL_MAX;
        name.placeholder = 'Nome (opcional)';
        name.value = e.label || '';
        name.addEventListener('input', () => { e.label = name.value; });
        card.appendChild(name);
        const dates = el('div', 'sp-dates');
        const from = el('input', 'sp-input');
        from.type = 'date';
        from.value = e.from || '';
        from.setAttribute('aria-label', 'De');
        from.addEventListener('change', () => { e.from = from.value; });
        const to = el('input', 'sp-input');
        to.type = 'date';
        to.value = e.to || '';
        to.setAttribute('aria-label', 'Até');
        to.addEventListener('change', () => { e.to = to.value; });
        dates.appendChild(from);
        dates.appendChild(el('span', 'sp-k', 'até'));
        dates.appendChild(to);
        card.appendChild(dates);
        const multRow = el('div', 'sp-dates');
        multRow.appendChild(el('span', 'sp-k', 'Multiplicador ×'));
        const mult = el('input', 'sp-input sp-mult');
        mult.type = 'text';
        mult.inputMode = 'decimal';
        mult.value = e.multText;
        mult.setAttribute('aria-label', 'Multiplicador da época');
        mult.addEventListener('input', () => { e.multText = mult.value; });
        multRow.appendChild(mult);
        multRow.appendChild(btn('Excluir', 'sp-del', () => { draft.epochs.splice(i, 1); render(); }));
        card.appendChild(multRow);
        box.appendChild(card);
      });
      if (draft.epochs.length < EPOCHS_MAX) {
        box.appendChild(btn('＋ Adicionar época', 'bet-manage-btn sp-add', () => {
          const t = todayKey();
          draft.epochs.push({ id: newEpochId(), label: '', from: t, to: t, mult: 2, multText: '2' });
          render();
        }));
      }

      if (error) box.appendChild(el('p', 'sp-error', error));
      const footer = el('div', 'sp-footer');
      footer.appendChild(btn('Cancelar', 'sp-cancel', () => { if (!busy) close({ status: 'cancelled' }); }));
      const save = btn(busy ? 'Salvando…' : 'Salvar', 'btn-confirm', onSave);
      save.disabled = busy;
      footer.appendChild(save);
      box.appendChild(footer);
    }

    async function onSave() {
      if (busy) return;
      error = '';
      const base = parseMoneyInput(draft.baseText);
      if (!Number.isFinite(base) || base < SPEED_MIN || base > SPEED_MAX) {
        error = `Peso precisa ser de ${fmtNum(SPEED_MIN)} a ${SPEED_MAX}.`;
        render();
        return;
      }
      const epochs = [];
      for (let i = 0; i < draft.epochs.length; i++) {
        const e = draft.epochs[i];
        const m = parseMoneyInput(e.multText);
        if (!Number.isFinite(m) || m < SPEED_MIN || m > SPEED_MAX) { error = `Época ${i + 1}: multiplicador de ${fmtNum(SPEED_MIN)} a ${SPEED_MAX}.`; render(); return; }
        const clean = sanitizeEpoch({ ...e, mult: m }, i);
        if (!clean) { error = `Época ${i + 1}: confira as datas (início antes do fim).`; render(); return; }
        epochs.push(clean);
      }
      busy = true;
      render();
      const r = await savePlatformSpeed(state.currentUid, platform.id, { base, epochs });
      busy = false;
      if (!r.ok) { error = r.error; render(); return; }
      close({ status: 'saved' });
    }

    document.body.appendChild(overlay);
    render();
  });
}
