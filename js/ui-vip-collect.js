// === (Sub-entrega 15) "VOCÊ COLETOU O BÔNUS VIP DIÁRIO ANTES DESTA APOSTA?" ===
// Plataformas "Com aposta": o VIP diário é liberado pela aposta mínima e
// só é coletado na plataforma depois. Quando ele já foi liberado por uma
// aposta anterior e ainda não foi marcado como coletado, o "Registrar
// aposta" (ui-finance-panel.js) pergunta ANTES de abrir o formulário:
//   'yes' -> SIM: a aposta nova é gravada com vipCollectedBefore:true e o
//            bônus entra no Rollover 1 s antes dela (já é abatido por ela);
//   'no'  -> NÃO: o bônus continua no fim do dia; a pergunta volta na
//            próxima aposta;
//   null  -> cancelado (Cancelar, toque fora, Esc, troca de tela): nada
//            é gravado e o formulário da aposta não abre.
// Visual: mesmo mini-contêiner de ui-vip-change.js (classes .deposit-kind-*,
// sem CSS nova). Tudo por textContent.

let activeClose = null;

const OPTIONS = Object.freeze([
  Object.freeze({
    id: 'yes',
    emoji: '✅',
    label: 'SIM',
    hint: 'Coletei antes desta aposta — o bônus entra agora e ela já desconta dele.',
    color: '#15803d'
  }),
  Object.freeze({
    id: 'no',
    emoji: '⏳',
    label: 'NÃO',
    hint: 'Ainda não coletei — o bônus entra no fim do dia, depois das apostas.',
    color: '#2563eb'
  })
]);

export function askVipCollect({ title = 'Bônus VIP diário coletado?', subtitle = '', note = '' } = {}) {
  if (activeClose) activeClose(null);

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'deposit-kind-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'deposit-kind-box';
    overlay.appendChild(box);

    const h = document.createElement('h3');
    h.className = 'deposit-kind-title';
    h.id = 'vipCollectTitle';
    h.textContent = title;
    overlay.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);

    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'deposit-kind-subtitle';
      sub.textContent = subtitle;
      box.appendChild(sub);
    }

    if (note) {
      const n = document.createElement('p');
      n.className = 'deposit-history-note';
      n.style.margin = '0';
      n.textContent = note;
      box.appendChild(n);
    }

    const options = document.createElement('div');
    options.className = 'deposit-kind-options';
    box.appendChild(options);

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
      if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
        try { previousFocus.focus({ preventScroll: true }); } catch (_) { /* ignora */ }
      }
      resolve(result);
    }
    activeClose = close;

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    }
    function onRoute() { close(null); }

    const buttons = OPTIONS.map(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deposit-kind-option';
      btn.dataset.choice = opt.id;
      btn.style.setProperty('--kind-color', opt.color);

      const emoji = document.createElement('span');
      emoji.className = 'deposit-kind-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = opt.emoji;

      const text = document.createElement('span');
      text.className = 'deposit-kind-text';
      const label = document.createElement('strong');
      label.textContent = opt.label;
      const hint = document.createElement('small');
      hint.textContent = opt.hint;
      text.appendChild(label);
      text.appendChild(hint);

      btn.appendChild(emoji);
      btn.appendChild(text);
      btn.addEventListener('click', () => close(opt.id));
      options.appendChild(btn);
      return btn;
    });

    const footer = document.createElement('div');
    footer.className = 'deposit-kind-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'deposit-kind-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => close(null));
    footer.appendChild(cancelBtn);
    box.appendChild(footer);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);

    document.body.appendChild(overlay);
    try { buttons[0].focus({ preventScroll: true }); } catch (_) { buttons[0].focus(); }
  });
}

const ORDINALS = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'];

// Texto da pergunta: "...antes dessa segunda aposta?" (terceira, quarta...).
export function vipCollectQuestion(betNumber) {
  const n = Math.round(Number(betNumber) || 0);
  const which = n >= 2 && n <= ORDINALS.length ? `dessa ${ORDINALS[n - 1]} aposta` : 'desta nova aposta';
  return `Essa plataforma liberou o bônus VIP diário através da aposta registrada anteriormente. Confirme: você coletou esse bônus antes ${which}?`;
}

// === (Sub-entrega 43) "🎁 VIP DIÁRIO — VEIO COM ROLLOVER?" ===
// Depois do SIM da pergunta acima (avulso ou lote), o "Registrar aposta"
// pergunta o R desse VIP diário: Sem rollover (0) · 1:1 · Outro R (0 a
// 100). O R vira o bonusScales do dia (setFormulaScale — mesmo campo do
// 🧾 Bônus), gravado no MESMO savePlatform da aposta. A última resposta da
// plataforma (lastScale) vem marcada.
//   número -> R escolhido; null -> cancelado (nada é gravado).
// Visual: mesmo mini-contêiner (.deposit-kind-*), sem CSS nova.

const SCALE_OPTIONS = Object.freeze([
  Object.freeze({ id: 0, emoji: '🚫', label: 'Sem rollover', hint: 'O bônus soma no Saldo, mas o Rollover não muda.', color: '#15803d' }),
  Object.freeze({ id: 1, emoji: '1️⃣', label: '1:1', hint: 'O bônus entra inteiro no Rollover.', color: '#2563eb' }),
  Object.freeze({ id: 'other', emoji: '✏️', label: 'Outro R', hint: 'Multiplicador de 0 a 100 (ex.: 3 = 3× o bônus no Rollover).', color: '#7c3aed' })
]);

function scaleLabel(s) {
  return s === 0 ? 'sem rollover' : `${s}:1`;
}

export function askVipScale({ title = '🎁 VIP diário — veio com rollover?', subtitle = '', lastScale = null } = {}) {
  if (activeClose) activeClose(null);

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'deposit-kind-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'deposit-kind-box';
    overlay.appendChild(box);

    const h = document.createElement('h3');
    h.className = 'deposit-kind-title';
    h.id = 'vipScaleTitle';
    h.textContent = title;
    overlay.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);

    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'deposit-kind-subtitle';
      sub.textContent = subtitle;
      box.appendChild(sub);
    }

    const last = lastScale === null || lastScale === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(lastScale) || 0)));
    const n = document.createElement('p');
    n.className = 'deposit-history-note';
    n.style.margin = '0';
    n.textContent = last === null
      ? 'Quanto deste bônus entra no Rollover? Fica gravado só pra hoje (dá pra trocar depois no 🧾 Bônus).'
      : `Última resposta nesta plataforma: ${scaleLabel(last)}. Fica gravado só pra hoje (dá pra trocar depois no 🧾 Bônus).`;
    box.appendChild(n);

    const options = document.createElement('div');
    options.className = 'deposit-kind-options';
    box.appendChild(options);

    // Campo do "Outro R" (aparece ao tocar na opção).
    const otherWrap = document.createElement('div');
    otherWrap.className = 'finance-entry-form';
    otherWrap.style.display = 'none';
    const otherInput = document.createElement('input');
    otherInput.type = 'number';
    otherInput.min = '0';
    otherInput.max = '100';
    otherInput.step = '1';
    otherInput.inputMode = 'numeric';
    otherInput.className = 'history-value-input';
    otherInput.placeholder = 'R (0 a 100)';
    otherInput.setAttribute('aria-label', 'Escala do Rollover (0 a 100)');
    if (last !== null && last !== 0 && last !== 1) otherInput.value = String(last);
    const otherOk = document.createElement('button');
    otherOk.type = 'button';
    otherOk.className = 'btn-confirm';
    otherOk.textContent = 'Confirmar';
    otherOk.style.minHeight = '44px';
    otherWrap.appendChild(otherInput);
    otherWrap.appendChild(otherOk);

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
      if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
        try { previousFocus.focus({ preventScroll: true }); } catch (_) { /* ignora */ }
      }
      resolve(result);
    }
    activeClose = close;

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    }
    function onRoute() { close(null); }

    function confirmOther() {
      const v = parseInt(otherInput.value, 10);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        otherInput.setCustomValidity('Digite um número inteiro de 0 a 100.');
        otherInput.reportValidity();
        return;
      }
      close(v);
    }
    otherInput.addEventListener('input', () => otherInput.setCustomValidity(''));
    otherInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmOther(); } });
    otherOk.addEventListener('click', confirmOther);

    const lastIsOther = last !== null && last !== 0 && last !== 1;
    let focusBtn = null;
    SCALE_OPTIONS.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deposit-kind-option';
      btn.style.setProperty('--kind-color', opt.color);

      const emoji = document.createElement('span');
      emoji.className = 'deposit-kind-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = opt.emoji;

      const text = document.createElement('span');
      text.className = 'deposit-kind-text';
      const label = document.createElement('strong');
      const isLast = (opt.id === 'other' && lastIsOther) || opt.id === last;
      label.textContent = isLast ? `${opt.label} · última` : opt.label;
      const hint = document.createElement('small');
      hint.textContent = opt.id === 'other' && lastIsOther ? `${opt.hint} Última: ${scaleLabel(last)}.` : opt.hint;
      text.appendChild(label);
      text.appendChild(hint);

      btn.appendChild(emoji);
      btn.appendChild(text);
      if (isLast) {
        btn.setAttribute('aria-current', 'true');
        btn.style.outline = `2px solid ${opt.color}`;
        focusBtn = btn;
      }
      btn.addEventListener('click', () => {
        if (opt.id === 'other') {
          otherWrap.style.display = '';
          try { otherInput.focus({ preventScroll: true }); } catch (_) { otherInput.focus(); }
          return;
        }
        close(opt.id);
      });
      options.appendChild(btn);
      if (!focusBtn && opt.id === 0) focusBtn = btn;
    });
    box.appendChild(otherWrap);

    const footer = document.createElement('div');
    footer.className = 'deposit-kind-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'deposit-kind-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => close(null));
    footer.appendChild(cancelBtn);
    box.appendChild(footer);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);

    document.body.appendChild(overlay);
    if (lastIsOther) otherWrap.style.display = '';
    try { focusBtn.focus({ preventScroll: true }); } catch (_) { focusBtn.focus(); }
  });
}
