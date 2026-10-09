// === TIPOS DE DEPÓSITO ("codinome") — Sub-entrega 7a ===
// Cada depósito novo (Edição → "Adicionar" e Financeiro → "Registrar
// depósito") passa por um mini-contêiner CENTRALIZADO com 3 opções antes de
// ser gravado. O tipo fica DENTRO da própria entrada, nos dois arrays que já
// existem — nenhuma coleção nova, nenhuma duplicidade:
//
//   deposits[i]   = { date, value, kind }   (ciclo VIP — Fim/Reinício zeram)
//   depositLog[i] = { date, value, kind }   (histórico PERMANENTE)
//
// As duas cópias nascem com o MESMO `date` (chave natural já usada pela
// edição de valor/exclusão no Histórico da Edição) — é por ele que a
// reclassificação sincroniza os dois arrays.
//
// REGRAS DE LEITURA (valem pra todo o sistema):
//   - Somas existentes (Saldo, Rollover, Total do ciclo, Misterioso, gráficos)
//     IGNORAM `kind`: um depósito continua valendo o mesmo dinheiro,
//     qualquer que seja o tipo. Nada do que já existe muda de valor.
//   - Depósito antigo (sem `kind`) ou com valor desconhecido = "Sem tipo".
//     Nunca é reclassificado sozinho; só pelo usuário (Histórico da Edição).
//   - Os relatórios novos (Misterioso / contenção — Sub-entrega 7b) agrupam
//     por `kind` via getDepositKindId(), que devolve null pra "Sem tipo".
//
// platforms-store.js NÃO muda: normalizePlatformData repassa os arrays
// deposits/depositLog inteiros (campos extras de cada entrada preservados) e
// as regras do Firestore não validam o conteúdo das entradas.
//
// Segurança de tela: todo texto vai por textContent (o nome da plataforma é
// texto do usuário). Sem innerHTML com dados.

export const DEPOSIT_KINDS = Object.freeze([
  Object.freeze({ id: 'semanal', emoji: '🗓️', label: 'Ativação Semanal', hint: 'Manter a conta ativa (ex.: 1 a cada 8 dias)', color: '#2563eb' }),
  Object.freeze({ id: 'mensal', emoji: '🎁', label: 'Ativação Mensal', hint: 'Faixa do Misterioso', color: '#7c3aed' }),
  Object.freeze({ id: 'aposta', emoji: '🎲', label: 'Depósito de Aposta', hint: 'Extra pra jogar', color: '#ea580c' })
]);

export const UNTYPED_KIND = Object.freeze({ id: null, emoji: '▫️', label: 'Sem tipo', hint: 'Depósito antigo, ainda não classificado', color: '#64748b' });

const KIND_IDS = new Set(DEPOSIT_KINDS.map(k => k.id));

export function isDepositKind(id) {
  return typeof id === 'string' && KIND_IDS.has(id);
}

// id válido ou null ("Sem tipo").
export function getDepositKindId(entry) {
  return entry && isDepositKind(entry.kind) ? entry.kind : null;
}

// Informações de exibição de um id (ou de null/desconhecido → Sem tipo).
export function getDepositKindInfo(kindId) {
  return DEPOSIT_KINDS.find(k => k.id === kindId) || UNTYPED_KIND;
}

// Rótulo curto pra listas: "🗓️ Ativação Semanal".
export function formatDepositKind(kindId) {
  const info = getDepositKindInfo(kindId);
  return `${info.emoji} ${info.label}`;
}

/**
 * Grava o tipo numa entrada de `deposits` E na entrada correspondente de
 * `depositLog` (mesmo `date`; se houver mais de uma com a mesma data, prefere
 * a de mesmo valor). Só mexe em memória — quem chama grava com savePlatform.
 * kindId null remove o tipo (volta a "Sem tipo").
 * @returns {number} quantas entradas foram alteradas (0 = nada encontrado)
 */
export function applyDepositKind(platform, date, value, kindId) {
  if (!platform || !date) return 0;
  if (kindId !== null && !isDepositKind(kindId)) return 0;
  let changed = 0;
  ['deposits', 'depositLog'].forEach(field => {
    const list = Array.isArray(platform[field]) ? platform[field] : [];
    const sameDate = list.filter(d => d && d.date === date);
    if (sameDate.length === 0) return;
    const target = sameDate.find(d => Number(d.value) === Number(value)) || sameDate[0];
    if (kindId === null) {
      if ('kind' in target) { delete target.kind; changed++; }
    } else if (target.kind !== kindId) {
      target.kind = kindId;
      changed++;
    }
  });
  return changed;
}

// ---------------------------------------------------------------------------
// SELETOR (mini-contêiner centralizado)
// ---------------------------------------------------------------------------
// Overlay fixo (position: fixed, centro da tela) — a página por baixo NÃO
// rola nem pula (scroll do body travado enquanto aberto e restaurado ao
// fechar). z-index 200: acima dos modais de Histórico (100) e abaixo do
// alerta/confirmação global (appModal, 210).
//
// Devolve uma Promise:
//   - id do tipo escolhido ('semanal' | 'mensal' | 'aposta')
//   - null  → cancelado (Cancelar, toque fora, tecla Esc). Nada é gravado.
//   - CLEAR → só quando allowClear: usuário escolheu "Remover tipo".
// Só existe um seletor por vez: abrir outro cancela o anterior (null).

export const CLEAR_KIND = '__clear__';

let activeClose = null;

export function pickDepositKind({ title = 'Tipo do depósito', subtitle = '', current = null, allowClear = false } = {}) {
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
    h.id = 'depositKindTitle';
    h.textContent = title;
    overlay.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);

    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'deposit-kind-subtitle';
      sub.textContent = subtitle;
      box.appendChild(sub);
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

    const buttons = DEPOSIT_KINDS.map(kind => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deposit-kind-option' + (kind.id === current ? ' is-current' : '');
      btn.dataset.kind = kind.id;
      btn.style.setProperty('--kind-color', kind.color);

      const emoji = document.createElement('span');
      emoji.className = 'deposit-kind-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = kind.emoji;

      const text = document.createElement('span');
      text.className = 'deposit-kind-text';
      const label = document.createElement('strong');
      label.textContent = kind.label;
      const hint = document.createElement('small');
      hint.textContent = kind.id === current ? `${kind.hint} · atual` : kind.hint;
      text.appendChild(label);
      text.appendChild(hint);

      btn.appendChild(emoji);
      btn.appendChild(text);
      btn.addEventListener('click', () => close(kind.id));
      options.appendChild(btn);
      return btn;
    });

    const footer = document.createElement('div');
    footer.className = 'deposit-kind-footer';

    if (allowClear && current) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'deposit-kind-clear';
      clearBtn.textContent = 'Remover tipo';
      clearBtn.addEventListener('click', () => close(CLEAR_KIND));
      footer.appendChild(clearBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'deposit-kind-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => close(null));
    footer.appendChild(cancelBtn);
    box.appendChild(footer);

    // Toque FORA da caixa cancela; toque dentro não fecha.
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    const first = buttons.find(b => b.classList.contains('is-current')) || buttons[0];
    try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); }
  });
}
