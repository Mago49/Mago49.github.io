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
//
// === (Sub-entrega 13) 💎 COLETAR BÔNUS ALTO ===
// 4º tipo: depósito feito pra liberar um bônus alto. No "Registrar
// depósito" (Financeiro) e no "Adicionar" (Edição) o seletor ganha uma 2ª
// página — valor do bônus alto + escala do Rollover (padrão 1:1) — via
// pickDepositKindAndBonus(). O bônus NÃO mora aqui: quem chama grava em
// platform.highBonusLog (ver bonus-ledger-logic.js — "BÔNUS ALTO"), no
// MESMO savePlatform do depósito. Reclassificar um depósito antigo como 💎
// (Histórico da Edição) só troca o tipo — não cria bônus.
// pickDepositKind() continua devolvendo só o id (contrato de sempre).
// (Sub-entrega 14) A escala do Rollover do bônus alto aceita 0 ("sem
// rollover").

export const DEPOSIT_KINDS = Object.freeze([
  Object.freeze({ id: 'semanal', emoji: '🗓️', label: 'Ativação Semanal', hint: 'Manter a conta ativa (ex.: 1 a cada 8 dias)', color: '#2563eb' }),
  Object.freeze({ id: 'mensal', emoji: '🎁', label: 'Ativação Mensal', hint: 'Faixa do Misterioso', color: '#7c3aed' }),
  Object.freeze({ id: 'aposta', emoji: '🎲', label: 'Depósito de Aposta', hint: 'Extra pra jogar', color: '#ea580c' }),
  // (Sub-entrega 13)
  Object.freeze({ id: 'alto', emoji: '💎', label: 'Coletar Bônus Alto', hint: 'Depósito que libera um bônus alto — o bônus é informado em seguida', color: '#0891b2' })
]);

export const HIGH_BONUS_KIND = 'alto';
export const HIGH_BONUS_MAX = 100000000;

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
//   - id do tipo escolhido ('semanal' | 'mensal' | 'aposta' | 'alto')
//   - null  → cancelado (Cancelar, toque fora, tecla Esc). Nada é gravado.
//   - CLEAR → só quando allowClear: usuário escolheu "Remover tipo".
// Só existe um seletor por vez: abrir outro cancela o anterior (null).

export const CLEAR_KIND = '__clear__';

let activeClose = null;

export function pickDepositKind(opts = {}) {
  return openKindPicker({ ...opts, withHighBonus: false });
}

/**
 * (Sub-entrega 13) Igual ao pickDepositKind, mas 💎 abre a 2ª página
 * (valor do bônus alto + escala do Rollover). Devolve:
 *   { kind, highBonus: { value, scale } | null }  ou  null (cancelado).
 */
export function pickDepositKindAndBonus(opts = {}) {
  return openKindPicker({ ...opts, withHighBonus: true });
}

function parseHighBonus(raw) {
  let t = String(raw || '').trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!t) return null;
  if (t.includes(',')) {
    if ((t.match(/,/g) || []).length > 1) return null;
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(n) && n > 0 && n <= HIGH_BONUS_MAX ? n : null;
}

function fmtBRL(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function openKindPicker({ title = 'Tipo do depósito', subtitle = '', current = null, allowClear = false, withHighBonus = false } = {}) {
  if (activeClose) activeClose(null);

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'deposit-kind-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'depositKindTitle');

    const box = document.createElement('div');
    box.className = 'deposit-kind-box';
    overlay.appendChild(box);

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

    function focusFirst(node) {
      if (!node) return;
      try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
    }

    function header(text, sub) {
      box.replaceChildren();
      const h = document.createElement('h3');
      h.className = 'deposit-kind-title';
      h.id = 'depositKindTitle';
      h.textContent = text;
      box.appendChild(h);
      if (sub) {
        const p = document.createElement('p');
        p.className = 'deposit-kind-subtitle';
        p.textContent = sub;
        box.appendChild(p);
      }
    }

    const finish = (kindId, highBonus = null) => close(withHighBonus ? { kind: kindId, highBonus } : kindId);

    // ---- página 1: tipo ----
    function renderKinds() {
      header(title, subtitle);
      const options = document.createElement('div');
      options.className = 'deposit-kind-options';
      box.appendChild(options);

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
        btn.addEventListener('click', () => {
          if (withHighBonus && kind.id === HIGH_BONUS_KIND) renderHighBonus();
          else finish(kind.id);
        });
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

      focusFirst(buttons.find(b => b.classList.contains('is-current')) || buttons[0]);
    }

    // ---- página 2: 💎 valor do bônus alto (Sub-entrega 13) ----
    let draftValue = '';
    let draftScale = 1;
    function renderHighBonus() {
      const info = getDepositKindInfo(HIGH_BONUS_KIND);
      header(`${info.emoji} Bônus alto`, subtitle);

      const label = document.createElement('label');
      label.className = 'bc-label';
      label.textContent = 'Valor do bônus alto recebido';
      const input = document.createElement('input');
      input.className = 'bc-input';
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.placeholder = 'Ex.: 150,00';
      input.value = draftValue;
      input.addEventListener('input', () => { draftValue = input.value; error.hidden = true; setScale(draftScale); });
      label.appendChild(input);
      box.appendChild(label);

      const scaleRow = document.createElement('div');
      scaleRow.className = 'bc-scale';
      const k = document.createElement('span');
      k.className = 'bc-k';
      k.textContent = 'Rollover';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'bc-step';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Diminuir escala do Rollover (0 = sem rollover)');
      const val = document.createElement('span');
      val.className = 'bc-scale-val';
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'bc-step';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Aumentar escala do Rollover');
      const roll = document.createElement('span');
      roll.className = 'bc-v';
      scaleRow.append(k, minus, val, plus, roll);
      box.appendChild(scaleRow);
      function setScale(n) {
        // (14) 0 = sem rollover.
        draftScale = Math.max(0, Math.min(100, Math.round(n)));
        val.textContent = draftScale === 0 ? 'sem rollover' : `${draftScale}:1`;
        minus.disabled = draftScale <= 0;
        plus.disabled = draftScale >= 100;
        const v = parseHighBonus(draftValue);
        roll.textContent = draftScale === 0 ? 'Rollover não muda' : (v ? `= ${fmtBRL(v * draftScale)} no Rollover` : '');
      }
      minus.addEventListener('click', () => setScale(draftScale - 1));
      plus.addEventListener('click', () => setScale(draftScale + 1));
      setScale(draftScale);

      const note = document.createElement('p');
      note.className = 'bc-note';
      note.textContent = 'Entra como Bônus Alto: soma no Saldo, no Rollover (na escala escolhida) e no bônus da semana, junto com VIP, Obrigado e Misterioso. No "Inserir bônus hoje", o total do dia já deve incluir este valor.';
      box.appendChild(note);

      const error = document.createElement('p');
      error.className = 'bc-error';
      error.hidden = true;
      box.appendChild(error);

      const footer = document.createElement('div');
      footer.className = 'deposit-kind-footer';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'deposit-kind-cancel';
      back.textContent = 'Voltar';
      back.addEventListener('click', () => renderKinds());
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn-confirm';
      ok.textContent = 'Confirmar';
      ok.addEventListener('click', () => {
        const v = parseHighBonus(input.value);
        if (v === null) {
          error.textContent = 'Digite o valor do bônus alto (ex.: 150,00).';
          error.hidden = false;
          focusFirst(input);
          return;
        }
        finish(HIGH_BONUS_KIND, { value: v, scale: draftScale });
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
      footer.append(back, ok);
      box.appendChild(footer);
      setTimeout(() => focusFirst(input), 30);
    }

    // Toque FORA da caixa cancela; toque dentro não fecha.
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    renderKinds();
  });
}
