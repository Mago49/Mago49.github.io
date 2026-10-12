// === (Sub-entrega 16) "➗ DIVIDIR" — BÔNUS EM PARTES COM R DIFERENTE ===
// Editor reaproveitado em 4 lugares: conferência de saldo (bônus que entrou
// sem ser lançado), "Inserir bônus hoje", fechamento de domingo / "Bônus
// real da semana passada" (a DIFERENÇA real − contado) e 💎 Bônus Alto.
//
// Fechado, mostra só o botão "➗ Dividir" — quem chama usa o R de sempre.
// Aberto, mostra as partes:
//   Parte 1 [valor] · Rollover [−] 1:1 [+]   ×
//   ...
//   Restante R$ X   · Rollover [−] 1:1 [+]      (calculado sozinho)
//   + Adicionar parte (até 5) · Desfazer divisão
// Toda parte nova nasce 1:1; 0 = "sem rollover". A soma das partes é
// SEMPRE o total (a última é o restante) — nunca sobra nem falta centavo.
//
// API: createBonusSplit({ getTotal, onToggle })
//   el            — elemento pra colocar na tela
//   isActive()    — divisão aberta?
//   refresh()     — redesenha o restante (chamar quando o total mudar)
//   getParts()    — { ok:true, parts:[{ value, scale }] } | { ok:false, error }
// Não grava nada. Sem dependências (pode ser usado por deposit-kinds.js).
// Segurança: tudo por textContent/value.

const MAX_PARTS = 5;
const SCALE_MAX = 100;

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

function fmt(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "1.250,50" / "1250.5" / "R$ 10" → número (NaN se inválido).
export function parseSplitMoney(raw) {
  let s = String(raw === null || raw === undefined ? '' : raw).trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return NaN;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return r2(Number(s));
}

function scaleText(s) { return s === 0 ? 'sem rollover' : `${s}:1`; }
// Rótulo curto do stepper (cabe numa linha no celular).
function scaleShort(s) { return s === 0 ? 'sem' : `${s}:1`; }

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

export function createBonusSplit({ getTotal = () => NaN, onToggle = () => {} } = {}) {
  const root = el('div', 'bonus-split');
  root.style.cssText = 'display:flex;flex-direction:column;gap:0.45rem;flex-basis:100%;width:100%;';
  let active = false;
  // partes digitadas (todas menos o restante): { raw, scale }
  let parts = [];
  let restScale = 1;
  let lastError = '';

  function total() {
    const t = Number(getTotal());
    return Number.isFinite(t) ? r2(t) : NaN;
  }

  // Stepper compacto: [−] 1:1 [+]  ("sem" = sem rollover).
  function stepper(get, set) {
    const wrap = el('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:0.25rem;flex:0 0 auto;';
    const val = el('span', 'bc-scale-val', scaleShort(get()));
    val.style.cssText = 'min-width:2.6rem;text-align:center;font-weight:800;';
    const minus = button('−', 'bc-step', () => apply(get() - 1));
    const plus = button('+', 'bc-step', () => apply(get() + 1));
    [minus, plus].forEach(b => { b.style.width = '34px'; b.style.height = '34px'; });
    minus.setAttribute('aria-label', 'Diminuir escala do Rollover desta parte (sem = sem rollover)');
    plus.setAttribute('aria-label', 'Aumentar escala do Rollover desta parte');
    function apply(n) {
      set(Math.max(0, Math.min(SCALE_MAX, Math.round(n))));
      val.textContent = scaleShort(get());
      val.title = scaleText(get());
      minus.disabled = get() <= 0;
      plus.disabled = get() >= SCALE_MAX;
      renderSummary();
    }
    val.title = scaleText(get());
    minus.disabled = get() <= 0;
    plus.disabled = get() >= SCALE_MAX;
    wrap.append(minus, val, plus);
    return wrap;
  }

  const summary = el('p', 'bc-note');
  const restValue = el('strong');

  function typedSum() {
    return r2(parts.reduce((s, p) => s + (Number.isFinite(parseSplitMoney(p.raw)) ? parseSplitMoney(p.raw) : 0), 0));
  }

  function computeParts() {
    const t = total();
    if (!(t > 0)) return { ok: false, error: 'Informe primeiro o valor do bônus — só um valor maior que zero pode ser dividido.' };
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const v = parseSplitMoney(parts[i].raw);
      if (!(v > 0)) return { ok: false, error: `Digite o valor da parte ${i + 1} (maior que zero).` };
      out.push({ value: v, scale: parts[i].scale });
    }
    const rest = r2(t - out.reduce((s, p) => s + p.value, 0));
    if (!(rest > 0.004)) return { ok: false, error: `As partes passam do total (${fmt(t)}). O restante precisa ser maior que zero.` };
    out.push({ value: rest, scale: restScale });
    return { ok: true, parts: out };
  }

  function renderSummary() {
    const t = total();
    const rest = Number.isFinite(t) ? r2(t - typedSum()) : NaN;
    restValue.textContent = Number.isFinite(rest) ? fmt(rest) : '—';
    restValue.style.color = Number.isFinite(rest) && rest <= 0.004 ? '#b91c1c' : '';
    const res = computeParts();
    lastError = res.ok ? '' : res.error;
    if (res.ok) {
      const roll = r2(res.parts.reduce((s, p) => s + p.value * p.scale, 0));
      summary.textContent = `Saldo +${fmt(t)} · Rollover +${fmt(roll)} (${res.parts.map(p => `${fmt(p.value)} ${scaleText(p.scale)}`).join(' + ')})`;
      summary.style.color = '';
    } else {
      summary.textContent = res.error;
      summary.style.color = '#b91c1c';
    }
  }

  function render() {
    root.replaceChildren();
    if (!active) {
      const open = button('➗ Dividir', 'bet-manage-btn', () => {
        active = true;
        parts = [{ raw: '', scale: 1 }];
        restScale = 1;
        render();
        onToggle(true);
      });
      open.title = 'Dividir o bônus em partes, cada uma com sua escala de Rollover';
      open.style.alignSelf = 'flex-start';
      root.appendChild(open);
      return;
    }

    const head = el('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:0.4rem;font-size:0.78rem;';
    head.append(el('span', 'bc-k', '➗ Partes (R$)'), el('span', 'bc-k', 'Rollover · "sem" = sem rollover'));
    root.appendChild(head);
    parts.forEach((p, i) => {
      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.35rem;';
      const input = el('input', 'bc-input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.placeholder = `Parte ${i + 1} (R$)`;
      input.setAttribute('aria-label', `Valor da parte ${i + 1}`);
      input.value = p.raw;
      input.style.cssText = 'flex:1 1 4rem;min-width:0;width:100%;min-height:38px;padding:0.4rem 0.6rem;font-size:0.95rem;';
      input.addEventListener('input', () => { p.raw = input.value; renderSummary(); });
      row.appendChild(input);
      row.appendChild(stepper(() => p.scale, v => { p.scale = v; }));
      if (parts.length > 1) {
        const rm = button('×', 'bc-step', () => { parts.splice(i, 1); render(); });
        rm.setAttribute('aria-label', `Remover a parte ${i + 1}`);
        rm.style.width = '34px'; rm.style.height = '34px';
        row.appendChild(rm);
      } else {
        const spacer = el('span');
        spacer.style.cssText = 'width:34px;flex:0 0 34px;';
        row.appendChild(spacer);
      }
      root.appendChild(row);
    });

    const restRow = el('div');
    restRow.style.cssText = 'display:flex;align-items:center;gap:0.35rem;';
    const restLabel = el('span', 'bc-k', 'Restante ');
    restLabel.appendChild(restValue);
    restLabel.style.cssText = 'flex:1 1 4rem;min-width:0;';
    restRow.appendChild(restLabel);
    restRow.appendChild(stepper(() => restScale, v => { restScale = v; }));
    const spacer = el('span');
    spacer.style.cssText = 'width:34px;flex:0 0 34px;';
    restRow.appendChild(spacer);
    root.appendChild(restRow);

    const actions = el('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;';
    if (parts.length + 1 < MAX_PARTS) {
      actions.appendChild(button('+ Adicionar parte', 'bet-manage-btn', () => { parts.push({ raw: '', scale: 1 }); render(); }));
    }
    actions.appendChild(button('Desfazer divisão', 'bc-cancel', () => {
      active = false;
      parts = [];
      render();
      onToggle(false);
    }));
    root.appendChild(actions);
    root.appendChild(summary);
    renderSummary();
  }

  render();

  return {
    el: root,
    isActive: () => active,
    refresh: () => { if (active) renderSummary(); },
    getParts: () => (active ? computeParts() : { ok: false, error: 'Divisão desligada.' }),
    lastError: () => lastError
  };
}
