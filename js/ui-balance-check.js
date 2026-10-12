// === MINI-CONTÊINER DA CONFERÊNCIA DE SALDO (Sub-entrega 8a) ===
// Fixo e centralizado na tela (mesmo padrão do seletor de tipo de depósito
// da 7a): a página por baixo não rola nem pula, e NADA do que estava sendo
// digitado no formulário de aposta é apagado.
//
// openBalanceCheck(...) devolve uma Promise:
//   { status:'done', resolution:'match'|'bonus'|'excluded'|'divergent' }
//   { status:'cancelled' }  → a plataforma NÃO foi alterada.
// Só altera o objeto da plataforma em memória (balance-check-logic.js);
// quem chama grava com savePlatform — inclusive junto com a aposta, num
// único documento, quando a conferência vem do "Registrar aposta".
//
// Passos:
//   A) (só na hora de registrar aposta sem conferência no dia) aviso +
//      campo do saldo real + "Atualizar";
//   B) diferença positiva → "Bônus Avulso: R$ X" + escala do Rollover
//      (padrão 1:1, botão R) → Confirmar;
//   C) diferença negativa → "Saldo divergente" → escolher os bônus
//      esperados da semana que NÃO entraram, ou registrar assim mesmo.
//   (Sub-entrega 13) Antes de B/C: se a soma da fase está NEGATIVA (o Saldo
//      exibido mostra 0,00 pelo piso), aviso "falta lançamento nesta fase".
//      Cancelar / Voltar não gravam nada; "Continuar mesmo assim" compara
//      com o valor sem piso, pra o Saldo ficar igual ao real.
//   (Sub-entrega 14) Escala do Rollover do bônus avulso vai de 0 ("sem
//      rollover" — soma no Saldo, não no Rollover) a 100.
//   (Sub-entrega 16) "➗ Dividir": o bônus avulso pode ser lançado em
//      partes, cada uma com o seu R (ui-bonus-split.js).
//
// Segurança: tudo por textContent.

import { formatCurrency } from './utils.js';
import { createBonusSplit } from './ui-bonus-split.js'; // (Sub-entrega 16)
import { parseMoneyInput } from './wager-total-logic.js';
import {
  computeBalanceGap, parseRealBalance, applyPositiveGap, recordBalanceCheck,
  listOpenWeekBonusItems, excludeBonusItems, BONUS_TYPE_LABELS, BALANCE_TOLERANCE
} from './balance-check-logic.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

function moneyInput(placeholder) {
  const i = el('input', 'bc-input');
  i.type = 'text';
  i.inputMode = 'decimal';
  i.autocomplete = 'off';
  i.placeholder = placeholder;
  return i;
}

/**
 * @param {object} o
 *   platform, ctx, pendingRB (R.B. da sessão ainda não gravada),
 *   mode 'bet' | 'standalone', value (saldo já digitado na linha), now
 */
export function openBalanceCheck({ platform, ctx = {}, pendingRB = 0, mode = 'standalone', value = null, now = null, bonusBefore = null } = {}) {
  if (activeClose) activeClose({ status: 'cancelled' });

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = el('div', 'bc-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'bc-box');
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
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ status: 'cancelled' }); }
    }
    // Troca de tela (voltar do celular) fecha sem gravar nada.
    function onRoute() { close({ status: 'cancelled' }); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close({ status: 'cancelled' }); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);

    const at = () => (now ? new Date(now) : new Date());

    function header(title, sub) {
      box.replaceChildren();
      box.appendChild(el('h3', 'bc-title', title));
      if (sub) box.appendChild(el('p', 'bc-sub', sub));
    }

    function footer(...buttons) {
      const f = el('div', 'bc-footer');
      buttons.forEach(b => f.appendChild(b));
      box.appendChild(f);
    }

    function showError(text) {
      let err = box.querySelector('.bc-error');
      if (!err) { err = el('p', 'bc-error'); box.insertBefore(err, box.querySelector('.bc-footer')); }
      err.textContent = text;
    }

    // ---- A) pedir o saldo ----
    function stepAsk() {
      header(mode === 'bet' ? '⚠️ Saldo não atualizado hoje' : 'Conferir saldo real', platform.name);
      if (mode === 'bet') {
        box.appendChild(el('p', 'bc-warn', 'Você não atualizou o saldo, vai causar erro no Planejador. Atualize por gentileza.'));
      }
      const label = el('label', 'bc-label', mode === 'bet'
        ? 'Saldo real agora (já com o resultado desta sessão)'
        : 'Saldo real agora');
      const input = moneyInput('Ex.: 1.250,00');
      label.appendChild(input);
      box.appendChild(label);
      const ok = btn('Atualizar', 'btn-confirm', () => {
        const v = parseRealBalance(parseMoneyInput(input.value));
        if (v === null) { showError('Digite o saldo que aparece na plataforma (ex.: 1.250,00).'); return; }
        stepCompare(v);
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
      footer(btn('Cancelar', 'bc-cancel', () => close({ status: 'cancelled' })), ok);
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); } }, 30);
    }

    // ---- comparar ----
    function stepCompare(real) {
      const gap = computeBalanceGap(platform, real, ctx, at(), pendingRB);
      if (gap.negative) { stepNegative(gap); return; }
      proceed(gap);
    }

    // (13) soma da fase negativa — avisa antes de seguir.
    function stepNegative(gap) {
      header('⚠️ Falta lançamento nesta fase', platform.name);
      box.appendChild(el('p', 'bc-warn', `O Saldo do sistema está ${formatCurrency(Math.abs(gap.raw))} abaixo de zero — na tela aparece R$ 0,00, porque o saldo nunca fica negativo. A plataforma real também não fica: isso quer dizer que falta algum lançamento nesta fase (depósito, bônus, semana) ou que o Saldo Inicial da fase está errado.`));
      box.appendChild(summaryLines(gap));
      box.appendChild(el('p', 'bc-note', 'O ideal é cancelar e lançar o que falta. Se continuar, a diferença é calculada sobre o valor real do sistema e o Saldo fica igual ao informado.'));
      footer(
        btn('Cancelar', 'bc-cancel', () => close({ status: 'cancelled' })),
        btn('Continuar mesmo assim', 'bet-manage-btn', () => proceed(gap))
      );
    }

    function proceed(gap) {
      if (gap.kind === 'match') {
        recordBalanceCheck(platform, gap, 'match', at());
        close({ status: 'done', resolution: 'match', gap });
        return;
      }
      if (gap.kind === 'over') stepOver(gap);
      else stepUnder(gap);
    }

    function summaryLines(gap) {
      const grid = el('div', 'bc-grid');
      const row = (k, v, cls = '') => {
        grid.appendChild(el('span', 'bc-k', k));
        grid.appendChild(el('span', `bc-v${cls ? ` ${cls}` : ''}`, v));
      };
      row('Saldo informado', formatCurrency(gap.real));
      if (gap.negative) row('Saldo do sistema (sem piso)', formatCurrency(gap.raw), 'bc-neg');
      row('Esperado pelo sistema', formatCurrency(gap.expected));
      if (gap.pendingRB) row('(inclui R.B. desta sessão)', formatCurrency(gap.pendingRB));
      row('Diferença', `${gap.diff > 0 ? '+' : ''}${formatCurrency(gap.diff)}`, gap.diff > 0 ? 'bc-pos' : 'bc-neg');
      return grid;
    }

    // ---- B) diferença positiva ----
    function stepOver(gap) {
      header('Bônus que entrou sem ser lançado', platform.name);
      box.appendChild(summaryLines(gap));
      const card = el('div', 'bc-bonus');
      card.appendChild(el('span', 'bc-bonus-label', 'Bônus Avulso'));
      card.appendChild(el('strong', 'bc-bonus-value', formatCurrency(gap.diff)));
      box.appendChild(card);

      let scale = 1;
      const scaleRow = el('div', 'bc-scale');
      scaleRow.appendChild(el('span', 'bc-k', 'Rollover'));
      const minus = btn('−', 'bc-step', () => setScale(scale - 1));
      const val = el('span', 'bc-scale-val', '1:1');
      const plus = btn('+', 'bc-step', () => setScale(scale + 1));
      minus.setAttribute('aria-label', 'Diminuir escala do Rollover (0 = sem rollover)');
      plus.setAttribute('aria-label', 'Aumentar escala do Rollover (botão R)');
      const roll = el('span', 'bc-v', '');
      scaleRow.appendChild(minus);
      scaleRow.appendChild(val);
      scaleRow.appendChild(plus);
      scaleRow.appendChild(roll);
      box.appendChild(scaleRow);
      function setScale(n) {
        // (14) 0 = sem rollover.
        scale = Math.max(0, Math.min(100, Math.round(n)));
        val.textContent = scale === 0 ? 'sem rollover' : `${scale}:1`;
        roll.textContent = scale === 0 ? 'Rollover não muda' : `= ${formatCurrency(gap.diff * scale)} no Rollover`;
        minus.disabled = scale <= 0;
        plus.disabled = scale >= 100;
      }
      setScale(1);

      // (16) ➗ Dividir: partes com R diferente. Aberto, esconde o R único.
      const split = createBonusSplit({
        getTotal: () => gap.diff,
        onToggle: on => { scaleRow.style.display = on ? 'none' : ''; }
      });
      box.appendChild(split.el);

      box.appendChild(el('p', 'bc-note', mode === 'bet'
        ? 'Entra no Saldo e no Rollover agora, logo antes desta sessão de apostas (a sessão já desconta dele, como na plataforma).'
        : 'Entra no Saldo e no Rollover agora. No domingo, o bônus real da semana já desconta este valor.'));
      footer(
        btn('Voltar', 'bc-cancel', () => (mode === 'bet' || value === null ? stepAsk() : close({ status: 'cancelled' }))),
        btn('Confirmar', 'btn-confirm', () => {
          let how = scale;
          if (split.isActive()) {
            const res = split.getParts();
            if (!res.ok) { showError(res.error); return; }
            how = res.parts;
          }
          if (!applyPositiveGap(platform, gap, how, at(), bonusBefore)) { showError('Não foi possível lançar as partes — confira os valores.'); return; }
          close({ status: 'done', resolution: 'bonus', gap });
        })
      );
    }

    // ---- C) diferença negativa ----
    function stepUnder(gap) {
      header('Saldo divergente', platform.name);
      box.appendChild(summaryLines(gap));
      box.appendChild(el('p', 'bc-warn', `O saldo real está ${formatCurrency(Math.abs(gap.diff))} abaixo do esperado. Pode ser bônus esperado que não entrou (ex.: VIP diário sem depósito), saque ou aposta não lançados.`));
      const items = listOpenWeekBonusItems(platform, ctx, at()).filter(i => i.kind === 'formula');
      footer(
        btn('Cancelar', 'bc-cancel', () => close({ status: 'cancelled' })),
        btn('Registrar assim mesmo', 'bet-manage-btn', () => {
          recordBalanceCheck(platform, gap, 'divergent', at());
          close({ status: 'done', resolution: 'divergent', gap });
        }),
        ...(items.length ? [btn('Escolher bônus não recebidos', 'btn-confirm', () => stepPick(gap, items))] : [])
      );
    }

    function stepPick(gap, items) {
      header('Quais bônus NÃO entraram?', `${platform.name} · semana atual`);
      const target = Math.abs(gap.diff);
      const status = el('p', 'bc-pick-status');
      box.appendChild(status);
      const list = el('div', 'bc-pick-list');
      const chosen = new Set();
      items.forEach(it => {
        const row = el('label', 'bc-pick');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => {
          if (cb.checked) chosen.add(it.id); else chosen.delete(it.id);
          row.classList.toggle('on', cb.checked);
          sync();
        });
        row.appendChild(cb);
        row.appendChild(el('span', 'bc-pick-day', fmtDay(it.dayKey)));
        row.appendChild(el('span', 'bc-pick-type', BONUS_TYPE_LABELS[it.type] || it.type));
        row.appendChild(el('span', 'bc-pick-value', formatCurrency(it.value)));
        list.appendChild(row);
      });
      box.appendChild(list);
      const confirm = btn('Confirmar', 'btn-confirm', () => {
        const picked = items.filter(i => chosen.has(i.id));
        const total = picked.reduce((s, i) => s + i.value, 0);
        if (total > target + BALANCE_TOLERANCE) { showError('Marcou mais do que a diferença — desmarque algum.'); return; }
        // Grava a conferência primeiro (pra ligar as exclusões a ela).
        const check = recordBalanceCheck(platform, gap, 'excluded', at());
        check.excludedTotal = excludeBonusItems(platform, picked, { checkId: check.id, now: at() });
        close({ status: 'done', resolution: 'excluded', gap });
      });
      function sync() {
        const total = items.filter(i => chosen.has(i.id)).reduce((s, i) => s + i.value, 0);
        const left = Math.round((target - total) * 100) / 100;
        status.textContent = `Marcado ${formatCurrency(total)} de ${formatCurrency(target)}` +
          (left > BALANCE_TOLERANCE ? ` · ainda faltam ${formatCurrency(left)} (fica registrado como divergência)` : (left < -BALANCE_TOLERANCE ? ' · passou da diferença' : ' · fecha certinho ✓'));
        status.classList.toggle('bc-neg', left < -BALANCE_TOLERANCE);
        confirm.disabled = chosen.size === 0;
      }
      footer(btn('Voltar', 'bc-cancel', () => stepUnder(gap)), confirm);
      sync();
    }

    document.body.appendChild(overlay);
    if (value !== null && value !== undefined) stepCompare(value);
    else stepAsk();
  });
}
