// === UI DA ABA "TOTAL APOSTADO" (View Gráficos — Sub-entrega 2) ===
// Acordeão por plataforma: total apostado REAL = referência informada pelo
// usuário + apostas lançadas depois dela (ver wager-total-logic.js).
//
// BANCO DE DADOS — único ponto de gravação desta aba:
//   - nova referência  -> savePlatform(uid, p)
//   - excluir          -> savePlatform(uid, p, { allowShrink: ['wagerAnchors'] })
// Se savePlatform recusar (trava de encolhimento, dado inválido, conflito
// de revisão/aba antiga), a alteração em memória é DESFEITA na hora — a
// tela nunca mostra algo que não foi enviado. O aviso de falha já é dado
// por platforms-store.js / firebase-init.js (toast/banner), não aqui.
// Falha ASSÍNCRONA do commit segue a regra geral do sistema: a alteração
// continua na memória e vai junto na próxima gravação bem-sucedida.
//
// Antes de gravar, a plataforma é buscada DE NOVO em state.platforms pelo
// id (o confirm é assíncrono — nunca grava um objeto que saiu da lista).
//
// Nenhuma leitura no Firestore: usa state.platforms, já carregado no login.
//
// SEGURANÇA: tudo que vem do usuário (nome da plataforma) entra por
// textContent — esta UI não usa innerHTML com dado dinâmico.

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import { toLocalDateTimeString } from './finance-logic.js';
import {
  computeAllWagerTotals, computeWagerTotal, getSortedAnchors, getEffectiveAnchor,
  buildWagerAnchor, addWagerAnchor, removeWagerAnchor
} from './wager-total-logic.js';

let rootEl = null;
let mounted = false;
let busy = false;
let searchTerm = ''; // sobrevive à troca de aba/rota (sessão)
const openIds = new Set(); // acordeões abertos (sessão)

// ---------- helpers ----------

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

function findPlatform(id) {
  return state.platforms.find(p => p.id === id) || null;
}

// Desfaz a alteração em memória quando a gravação não saiu do aparelho.
function restoreAnchors(platform, previous) {
  if (previous === undefined) delete platform.wagerAnchors;
  else platform.wagerAnchors = previous;
}

// ---------- esqueleto ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <section class="card-shell graficos-section" aria-label="Total apostado por plataforma">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Total Apostado</h2>
          <p>Informe o total apostado real de uma plataforma em uma data e hora. A partir dali, o sistema soma sozinho as apostas lançadas no app. Apostas antigas, de antes da referência, deixam de contar no total — nada é apagado.</p>
        </div>
      </div>
      <div id="wagerSummary" class="analise-cards"></div>
      <div class="wager-search-wrap">
        <input type="search" id="wagerSearch" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
      </div>
      <div id="wagerList" class="wager-list" role="list"></div>
    </section>
  `;

  const search = rootEl.querySelector('#wagerSearch');
  if (search) {
    search.value = searchTerm;
    search.addEventListener('input', () => {
      searchTerm = search.value;
      renderList();
    });
  }
}

// ---------- resumo ----------

function renderSummary(data) {
  const box = rootEl.querySelector('#wagerSummary');
  if (!box) return;
  box.replaceChildren();

  const card = (label, value, note) => {
    const c = el('div', 'summary-card');
    c.appendChild(el('span', 'summary-label', label));
    c.appendChild(el('span', 'summary-value', value));
    if (note) c.appendChild(el('span', 'summary-note', note));
    return c;
  };

  box.appendChild(card('Total apostado (todas)', formatCurrency(data.grandTotal)));
  box.appendChild(card('Com referência', `${data.withAnchor} de ${data.count}`,
    data.withAnchor < data.count ? 'As demais usam só as apostas lançadas no app' : ''));
}

// ---------- linha do acordeão ----------

function buildComposition(row) {
  const box = el('div', 'wager-composition');
  const line = (label, value, strong = false) => {
    const r = el('div', `wager-comp-line${strong ? ' wager-comp-total' : ''}`);
    r.appendChild(el('span', '', label));
    r.appendChild(el('span', 'num', value));
    box.appendChild(r);
  };

  if (row.hasAnchor) {
    line(`Referência em ${fmtDateTime(row.anchor.at)}`, formatCurrency(row.anchorValue));
    line(`+ Apostas lançadas depois (${row.betsAfter})`, formatCurrency(row.wageredAfter));
    line('= Total real', formatCurrency(row.total), true);
    if (row.wageredBefore > 0) {
      box.appendChild(el('p', 'graficos-note wager-note',
        `${formatCurrency(row.wageredBefore)} em apostas lançadas antes da referência não entram — já estão dentro do valor informado.`));
    }
  } else {
    line(`Apostas lançadas no app (${row.betsAfter})`, formatCurrency(row.wageredAfter));
    line('= Total', formatCurrency(row.total), true);
    box.appendChild(el('p', 'graficos-note wager-note',
      'Sem referência: se o histórico antigo estiver incompleto, este total fica abaixo do real. Informe o total da plataforma abaixo.'));
  }
  return box;
}

function buildForm(platform) {
  const form = el('div', 'wager-form');
  const now = new Date();
  const nowLocal = toLocalDateTimeString(now);
  const uid = `wf_${platform.id}`;

  const dtLabel = el('label', '', 'Total apostado até');
  dtLabel.htmlFor = `${uid}_dt`;
  const dtInput = el('input');
  dtInput.type = 'datetime-local';
  dtInput.id = `${uid}_dt`;
  dtInput.value = nowLocal;
  dtInput.max = nowLocal;

  const valLabel = el('label', '', 'Valor (R$)');
  valLabel.htmlFor = `${uid}_val`;
  const valInput = el('input');
  valInput.type = 'text';
  valInput.inputMode = 'decimal';
  valInput.id = `${uid}_val`;
  valInput.placeholder = 'Ex.: 12.345,67';
  valInput.autocomplete = 'off';

  const btn = el('button', 'btn-confirm', 'Salvar referência');
  btn.type = 'button';
  btn.addEventListener('click', () => onSaveAnchor(platform.id, dtInput, valInput, btn));

  form.appendChild(dtLabel);
  form.appendChild(dtInput);
  form.appendChild(valLabel);
  form.appendChild(valInput);
  form.appendChild(btn);
  return form;
}

function buildHistory(platform) {
  const wrap = el('div', 'wager-history');
  const anchors = getSortedAnchors(platform).reverse(); // mais nova primeiro
  wrap.appendChild(el('h4', 'wager-history-title', `Histórico de referências (${anchors.length})`));

  if (anchors.length === 0) {
    wrap.appendChild(el('p', 'graficos-note wager-note', 'Nenhuma referência informada ainda.'));
    return wrap;
  }

  const effective = getEffectiveAnchor(platform, new Date());
  const list = el('ul', 'wager-history-list');
  anchors.forEach(a => {
    const li = el('li', 'wager-history-item');
    const info = el('div', 'wager-history-info');
    info.appendChild(el('span', 'wager-history-date', fmtDateTime(a.at)));
    info.appendChild(el('span', 'wager-history-value', formatCurrency(a.value)));
    if (effective && effective.id === a.id) info.appendChild(el('span', 'wager-badge', 'vigente'));
    li.appendChild(info);

    const del = el('button', 'btn-remove-modal wager-del-btn', 'Excluir');
    del.type = 'button';
    del.addEventListener('click', () => onDeleteAnchor(platform.id, a.id, del));
    li.appendChild(del);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  return wrap;
}

function buildRow(row) {
  const platform = findPlatform(row.id);
  const isOpen = openIds.has(row.id);
  const item = el('div', `wager-row${isOpen ? ' open' : ''}`);
  item.setAttribute('role', 'listitem');

  const header = el('button', 'wager-row-header');
  header.type = 'button';
  header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  const left = el('span', 'wager-row-left');
  left.appendChild(el('span', 'wager-row-name', row.name));
  left.appendChild(el('span', `wager-row-sub${row.hasAnchor ? '' : ' wager-row-sub-warn'}`,
    row.hasAnchor ? `desde ${fmtDateTime(row.anchor.at)}` : 'sem referência'));
  header.appendChild(left);

  const right = el('span', 'wager-row-right');
  right.appendChild(el('span', 'wager-row-total', formatCurrency(row.total)));
  right.appendChild(el('span', 'wager-row-chevron', '▾'));
  header.appendChild(right);

  header.addEventListener('click', () => {
    if (openIds.has(row.id)) openIds.delete(row.id); else openIds.add(row.id);
    renderList();
  });
  item.appendChild(header);

  if (isOpen && platform) {
    const body = el('div', 'wager-row-body');
    body.appendChild(buildComposition(row));
    body.appendChild(buildForm(platform));
    body.appendChild(buildHistory(platform));
    item.appendChild(body);
  }
  return item;
}

// ---------- render ----------

function renderList() {
  if (!mounted || !rootEl) return;
  const data = computeAllWagerTotals(state.platforms, new Date());
  renderSummary(data);

  const listEl = rootEl.querySelector('#wagerList');
  if (!listEl) return;
  listEl.replaceChildren();

  const q = searchTerm.trim().toLowerCase();
  const rows = q ? data.rows.filter(r => String(r.name).toLowerCase().includes(q)) : data.rows;

  if (rows.length === 0) {
    listEl.appendChild(el('p', 'graficos-note', data.rows.length === 0 ? 'Nenhuma plataforma cadastrada.' : 'Nenhuma plataforma encontrada.'));
    return;
  }
  rows.forEach(row => listEl.appendChild(buildRow(row)));
}

// ---------- ações (gravam no banco) ----------

async function onSaveAnchor(platformId, dtInput, valInput, btn) {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  let saved = false;
  try {
    const platform = findPlatform(platformId);
    if (!platform) {
      await showAppAlert('Plataforma não encontrada. Recarregue a página.');
      return;
    }

    const built = buildWagerAnchor(platform, { localDateTime: dtInput.value, rawValue: valInput.value }, new Date());
    if (!built.ok) {
      await showAppAlert(built.error);
      return;
    }

    const preview = computeWagerTotal({ ...platform, wagerAnchors: [...getSortedAnchors(platform), built.entry] }, new Date());
    let message = `${platform.name}: total apostado até ${fmtDateTime(built.entry.at)} = ${formatCurrency(built.entry.value)}. ` +
      `Depois de salvar, o total real fica ${formatCurrency(preview.total)} e passa a somar as apostas lançadas a partir desse instante. Confirmar?`;
    if (built.supersededBy) {
      message = `Atenção: já existe uma referência mais recente (${fmtDateTime(built.supersededBy.at)}). ` +
        `Esta entra só no histórico e NÃO muda o total atual. ` + message;
    }
    const ok = await showAppConfirm(message);
    if (!ok || !mounted) return;

    // Busca de novo: o confirm é assíncrono.
    const target = findPlatform(platformId);
    if (!target) {
      await showAppAlert('Plataforma não encontrada. Nada foi salvo.');
      return;
    }

    const previous = target.wagerAnchors;
    addWagerAnchor(target, built.entry);
    const sent = savePlatform(state.currentUid, target);
    if (!sent) {
      restoreAnchors(target, previous); // gravação bloqueada: nada mudou
      return;
    }
    saved = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (saved && mounted) renderList();
  }
}

async function onDeleteAnchor(platformId, anchorId, btn) {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  let removedOk = false;
  try {
    const platform = findPlatform(platformId);
    const anchor = platform ? getSortedAnchors(platform).find(a => a.id === anchorId) : null;
    if (!platform || !anchor) {
      await showAppAlert('Referência não encontrada. Recarregue a página.');
      return;
    }

    const effective = getEffectiveAnchor(platform, new Date());
    const isEffective = !!effective && effective.id === anchorId;
    const ok = await showAppConfirm(
      `Excluir a referência de ${fmtDateTime(anchor.at)} (${formatCurrency(anchor.value)}) de ${platform.name}? ` +
      (isEffective
        ? 'Ela é a referência vigente: o total passa a usar a anterior (ou só as apostas lançadas no app, se não houver outra).'
        : 'Ela não é a vigente: o total atual não muda.') +
      ' Essa ação não pode ser desfeita.'
    );
    if (!ok || !mounted) return;

    const target = findPlatform(platformId);
    if (!target) {
      await showAppAlert('Plataforma não encontrada. Nada foi excluído.');
      return;
    }

    const previous = target.wagerAnchors;
    const result = removeWagerAnchor(target, anchorId);
    if (!result) return;
    const sent = savePlatform(state.currentUid, target, { allowShrink: ['wagerAnchors'] });
    if (!sent) {
      restoreAnchors(target, previous); // gravação bloqueada: nada mudou
      return;
    }
    removedOk = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (removedOk && mounted) renderList();
  }
}

// ---------- API pública (view-graficos.js) ----------

export function mountTotalApostado(root) {
  if (!root) return;
  unmountTotalApostado();
  rootEl = root;
  mounted = true;
  renderSkeleton();
  renderList();
}

// Ao voltar pra aba e na virada do dia. Não faz nada se não montada.
export function refreshTotalApostado() {
  if (!mounted) return;
  renderList();
}

export function unmountTotalApostado() {
  mounted = false;
  rootEl = null;
  busy = false;
}
