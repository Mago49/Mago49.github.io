// === (Sub-entrega 12) "JÁ RECEBEU O BÔNUS VIP DE HOJE?" ===
// Mini-contêiner centralizado perguntado antes de gravar qualquer mudança
// que mexe no valor do Bônus VIP de uma plataforma:
//   - Edição → Dados → Salvar (nível, grupo ou template VIP);
//   - Gráficos → Total Apostado → "Promover";
//   - VIP → Templates → salvar novos valores de um template.
//
// Devolve uma Promise:
//   'today'    -> "Ainda não recebi": a mudança vale desde as 00:00 de hoje;
//   'tomorrow' -> "Já recebi": vale a partir das 00:00 de amanhã;
//   null       -> cancelado (Cancelar, toque fora, Esc). Nada é gravado.
// Quem chama converte a resposta em data com getVipChangeDate (cycle-logic.js).
//
// Visual: reaproveita as classes do seletor de tipo de depósito
// (.deposit-kind-*, modals.css) — nenhuma CSS nova. Fixo no centro (z 200,
// abaixo só do appModal 210), trava a rolagem da página e devolve ao fechar.
// Fecha também se a rota mudar (hashchange/popstate). Tudo por textContent.

let activeClose = null;

const OPTIONS = Object.freeze([
  Object.freeze({
    id: 'today',
    emoji: '🕛',
    label: 'Ainda não recebi',
    hint: 'Vale desde hoje — o bônus VIP de hoje já sai no valor novo.',
    color: '#2563eb'
  }),
  Object.freeze({
    id: 'tomorrow',
    emoji: '✅',
    label: 'Já recebi o bônus de hoje',
    hint: 'Vale a partir de amanhã — hoje continua no valor antigo.',
    color: '#15803d'
  })
]);

export function askVipChangeTiming({ title = 'Já recebeu o bônus VIP de hoje?', subtitle = '', note = '' } = {}) {
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
    h.id = 'vipChangeTitle';
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

// Texto curto da data em que a mudança passa a valer ("hoje (10/10)" /
// "amanhã (11/10)") — pras mensagens de confirmação.
export function describeVipChangeDay(choice, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (choice === 'tomorrow' ? 1 : 0));
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${choice === 'tomorrow' ? 'amanhã' : 'hoje'} (${dd}/${mm})`;
}
