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
// SEGURANÇA: tudo que vem do usuário (nome da plataforma/template) entra
// por textContent — esta UI não usa innerHTML com dado dinâmico.
//
// === (Sub-entrega 4) PROGRESSÃO VIP PELO APOSTADO ===
// - Tabelas "Aposta Necessária" por template VIP (wager-requirements-
//   store.js, coleção própria). Lidas UMA vez por sessão ao abrir a aba;
//   falha de leitura mostra erro + "Tentar de novo" e esconde a progressão
//   (nunca finge que a tabela é a padrão). O total apostado continua
//   funcionando normalmente mesmo sem as tabelas.
// - PROMOÇÃO com 1 clique + confirmação, pelo MESMO caminho do Salvar da
//   Edição (ui-platform-manage.js): recordLevelChange (cycle-logic.js) ->
//   p.level -> savePlatform. Vale a partir de HOJE (nunca retroage) e o
//   Bônus VIP passa a usar o nível novo sozinho (getVipConfigAt lê o
//   levelHistory). Se savePlatform recusar, nível e levelHistory voltam ao
//   que eram (cópia feita antes — recordLevelChange pode alterar a entrada
//   do dia no lugar). Nunca rebaixa.
// - Editor das tabelas no fim da aba (Padrão + cada template VIP).

// (Sub-entrega 12) "Promover" pergunta se o bônus VIP de hoje já foi
// recebido (ui-vip-change.js): já recebeu = vale a partir de amanhã.

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import { toLocalDateTimeString } from './finance-logic.js';
import { getCurrentVipTemplateId, recordLevelChange, BET_MINIMUM_BY_LEVEL, getVipChangeDate } from './cycle-logic.js';
import { askVipChangeTiming, describeVipChangeDay } from './ui-vip-change.js'; // (Sub-entrega 12)
import {
  computeAllWagerTotals, computeWagerTotal, getSortedAnchors, getEffectiveAnchor,
  buildWagerAnchor, addWagerAnchor, removeWagerAnchor,
  computeWagerLevel, getPromotionInfo, parseMoneyInput, validateWagerThresholds,
  WAGER_LEVELS
} from './wager-total-logic.js';
import {
  loadWagerRequirements, isWagerRequirementsLoaded, getThresholdsFor, getOwnThresholds,
  getInvalidRequirementKeys, saveWagerRequirement, removeWagerRequirement,
  DEFAULT_REQUIREMENT_KEY
} from './wager-requirements-store.js';

let rootEl = null;
let mounted = false;
let busy = false;
let searchTerm = ''; // sobrevive à troca de aba/rota (sessão)
const openIds = new Set(); // acordeões abertos (sessão)

// (Sub-entrega 4)
let reqStatus = 'idle'; // 'idle' | 'loading' | 'ok' | 'error'
let reqLoadToken = 0;
let tablesOpen = false;  // editor das tabelas aberto (sessão)

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

function fmtWeekKey(key) {
  const [y, m, d] = String(key).split('-');
  return `${d}/${m}/${y}`;
}

function fmtInputNumber(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function findPlatform(id) {
  return state.platforms.find(p => p.id === id) || null;
}

function getTemplates() {
  return (Array.isArray(state.vipBonusTemplates) ? state.vipBonusTemplates : [])
    .filter(t => t && t.id)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));
}

function templateLabel(templateId) {
  if (!templateId) return 'Padrão (sem template)';
  const t = getTemplates().find(x => x.id === templateId);
  return t ? `Template ${t.name}` : `Template ausente (${templateId})`;
}

// Desfaz a alteração em memória quando a gravação não saiu do aparelho.
function restoreAnchors(platform, previous) {
  if (previous === undefined) delete platform.wagerAnchors;
  else platform.wagerAnchors = previous;
}

// (Sub-entrega 4) Nível/progresso de uma plataforma — null sem tabelas.
function getLevelInfo(platform, row) {
  if (reqStatus !== 'ok' || !platform) return null;
  const templateId = getCurrentVipTemplateId(platform);
  const req = getThresholdsFor(templateId);
  const lv = computeWagerLevel(row.total, req.thresholds);
  const promo = getPromotionInfo(platform, lv.level);
  return { templateId, req, lv, promo };
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
      <div id="wagerReqStatus" class="app-hidden">
        <p id="wagerReqStatusText" class="graficos-note"></p>
        <button type="button" id="wagerReqRetry" class="bet-manage-btn app-hidden" style="margin:0.5rem 1.1rem 0.9rem;">Tentar de novo</button>
      </div>
      <div class="wager-search-wrap">
        <input type="search" id="wagerSearch" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
      </div>
      <div id="wagerList" class="wager-list" role="list"></div>
    </section>

    <section class="card-shell graficos-section" aria-label="Tabelas de Aposta Necessária" style="margin-top:1.1rem;">
      <div class="section-heading" style="padding:0 0 0.9rem;">
        <div>
          <h2>Tabelas de Aposta Necessária</h2>
          <p>Total apostado necessário pra cada nível VIP, por template. Template sem tabela própria usa a do Padrão. Mudar uma tabela só muda o que esta aba mostra — o nível da plataforma só muda quando você clica em Promover.</p>
        </div>
      </div>
      <div style="padding:0 1.1rem 0.9rem;">
        <button type="button" id="wagerTablesToggle" class="bet-manage-btn" aria-expanded="false">⚙️ Editar tabelas</button>
      </div>
      <div id="wagerTables" class="wager-tables app-hidden"></div>
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

  const retry = rootEl.querySelector('#wagerReqRetry');
  if (retry) retry.addEventListener('click', () => loadRequirements(true));

  const toggle = rootEl.querySelector('#wagerTablesToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      tablesOpen = !tablesOpen;
      renderTables();
    });
  }
}

// ---------- (Sub-entrega 4) carga das tabelas ----------

function renderReqStatus() {
  const box = rootEl && rootEl.querySelector('#wagerReqStatus');
  const text = rootEl && rootEl.querySelector('#wagerReqStatusText');
  const retry = rootEl && rootEl.querySelector('#wagerReqRetry');
  if (!box || !text || !retry) return;

  let msg = '';
  let isError = false;
  if (reqStatus === 'loading') msg = 'Carregando as tabelas de Aposta Necessária…';
  if (reqStatus === 'error') {
    msg = 'Não foi possível carregar as tabelas de Aposta Necessária. A progressão VIP fica escondida até carregar — o total apostado continua certo. Verifique a internet e tente de novo.';
    isError = true;
  }
  if (reqStatus === 'ok') {
    const invalid = getInvalidRequirementKeys();
    if (invalid.length) msg = `${invalid.length} tabela(s) com dados inválidos no banco foram ignoradas (usam o Padrão). Salve de novo no editor abaixo pra corrigir.`;
  }

  text.textContent = msg;
  text.classList.toggle('graficos-note-warn', isError || (reqStatus === 'ok' && !!msg));
  retry.classList.toggle('app-hidden', !isError);
  box.classList.toggle('app-hidden', !msg);
}

async function loadRequirements(force = false) {
  const uid = state.currentUid;
  if (!force && isWagerRequirementsLoaded(uid)) {
    reqStatus = 'ok';
    renderReqStatus();
    return;
  }
  const token = ++reqLoadToken;
  reqStatus = 'loading';
  renderReqStatus();
  try {
    await loadWagerRequirements(uid);
    if (token !== reqLoadToken || !mounted) return;
    reqStatus = 'ok';
  } catch (err) {
    if (token !== reqLoadToken || !mounted) return;
    console.error('Total Apostado: falha ao carregar as tabelas de Aposta Necessária:', err);
    reqStatus = 'error';
  }
  renderReqStatus();
  renderList();
  renderTables();
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

  if (reqStatus === 'ok') {
    const promotable = data.rows.filter(r => {
      const info = getLevelInfo(findPlatform(r.id), r);
      return info && info.promo.status === 'promote';
    }).length;
    box.appendChild(card('Prontas pra promover', String(promotable),
      promotable ? 'Abra a plataforma e clique em Promover' : 'Nenhuma plataforma acima do nível cadastrado'));
  }
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
    if (row.backfillWeeksAfter > 0) line(`+ Semanas antigas depois (${row.backfillWeeksAfter})`, formatCurrency(row.backfillAfter));
    line('= Total real', formatCurrency(row.total), true);
    if (row.wageredBefore > 0) {
      box.appendChild(el('p', 'graficos-note wager-note',
        `${formatCurrency(row.wageredBefore)} em apostas lançadas antes da referência não entram — já estão dentro do valor informado.`));
    }
  } else {
    line(`Apostas lançadas no app (${row.betsAfter})`, formatCurrency(row.wageredAfter));
    if (row.backfillWeeksAfter > 0) line(`+ Semanas antigas sem lançamentos (${row.backfillWeeksAfter})`, formatCurrency(row.backfillAfter));
    line('= Total', formatCurrency(row.total), true);
    box.appendChild(el('p', 'graficos-note wager-note',
      'Sem referência: se o histórico antigo estiver incompleto, este total fica abaixo do real. Informe o total da plataforma abaixo.'));
  }

  if (row.straddleWeeks && row.straddleWeeks.length) {
    box.appendChild(el('p', 'graficos-note graficos-note-warn wager-note',
      `A referência cai no meio da(s) semana(s) antiga(s) de ${row.straddleWeeks.map(fmtWeekKey).join(', ')}. Não dá pra dividir uma semana ao meio, então ela fica fora do total. Pra evitar isso, lance a referência com a data e hora de agora.`));
  }
  return box;
}

// (Sub-entrega 4) Bloco "Progressão VIP".
function buildProgress(platform, row) {
  const box = el('div', 'wager-progress');
  box.appendChild(el('h4', 'wager-history-title', 'Progressão VIP pelo apostado'));

  if (reqStatus !== 'ok') {
    box.appendChild(el('p', 'graficos-note wager-note',
      reqStatus === 'error' ? 'Tabelas não carregadas — use "Tentar de novo" no topo.' : 'Carregando as tabelas…'));
    return box;
  }

  const info = getLevelInfo(platform, row);
  const { lv, promo, req, templateId } = info;

  const sourceText = req.source === 'template'
    ? 'tabela própria'
    : (req.source === 'default' ? 'usa a tabela Padrão' : 'usa a tabela Padrão inicial');
  box.appendChild(el('p', 'graficos-note wager-note', `${templateLabel(templateId)} — ${sourceText}.`));

  const levels = el('div', 'wager-level-line');
  levels.appendChild(el('span', '', `Cadastrado: ${promo.current === null ? '—' : `V${promo.current}`}`));
  levels.appendChild(el('span', 'wager-level-arrow', '·'));
  levels.appendChild(el('span', 'wager-level-strong', `Pelo apostado: V${lv.level}`));
  box.appendChild(levels);

  const track = el('div', 'wager-progress-track');
  const fill = el('div', 'wager-progress-fill');
  fill.style.width = `${Math.round(lv.progress * 100)}%`;
  track.appendChild(fill);
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(Math.round(lv.progress * 100)));
  box.appendChild(track);

  box.appendChild(el('p', 'graficos-note wager-note', lv.maxed
    ? `Nível máximo (V${lv.level}) alcançado.`
    : `Faltam ${formatCurrency(lv.missing)} para o V${lv.nextLevel} (meta ${formatCurrency(lv.nextThreshold)}).`));

  if (promo.status === 'promote') {
    const promoBox = el('div', 'wager-promo');
    promoBox.appendChild(el('span', 'wager-promo-text',
      `Atingiu o V${promo.target} pelo apostado${promo.current === null ? '' : ` (cadastrado: V${promo.current})`}.`));
    const btn = el('button', 'btn-confirm', `Promover para V${promo.target}`);
    btn.type = 'button';
    btn.addEventListener('click', () => onPromote(platform.id, promo.target, btn));
    promoBox.appendChild(btn);
    box.appendChild(promoBox);
  } else if (promo.status === 'no-group') {
    box.appendChild(el('p', 'graficos-note graficos-note-warn wager-note',
      'Defina o grupo (com ou sem aposta) desta plataforma na Edição pra poder promover.'));
  } else if (promo.status === 'above') {
    box.appendChild(el('p', 'graficos-note wager-note',
      `O nível cadastrado (V${promo.current}) está acima do apostado (V${promo.target}). Nada muda — o sistema nunca rebaixa.`));
  } else if (promo.status === 'unset') {
    box.appendChild(el('p', 'graficos-note wager-note', 'Sem nível cadastrado na Edição — ainda no V0 pelo apostado.'));
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
  const info = getLevelInfo(platform, row);
  if (info) {
    const canPromote = info.promo.status === 'promote';
    const badge = el('span', `wager-level-badge${canPromote ? ' wager-level-badge-up' : ''}`,
      `V${info.lv.level}${canPromote ? ' ▲' : ''}`);
    badge.title = canPromote ? 'Pronta pra promover' : 'Nível pelo apostado';
    right.appendChild(badge);
  }
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
    body.appendChild(buildProgress(platform, row));
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

// ---------- (Sub-entrega 4) editor das tabelas ----------

function countPlatformsUsing(templateId) {
  return state.platforms.filter(p => (getCurrentVipTemplateId(p) || null) === (templateId || null)).length;
}

function buildTableRow(key, label, usingCount) {
  const isDefault = key === DEFAULT_REQUIREMENT_KEY;
  const own = getOwnThresholds(key);
  const effective = isDefault ? getThresholdsFor(null).thresholds : (own || getThresholdsFor(null).thresholds);
  const invalid = getInvalidRequirementKeys().includes(key);

  const row = el('div', 'wager-table-row');
  const head = el('div', 'wager-table-head');
  head.appendChild(el('span', 'wager-table-name', label));
  let tag;
  if (isDefault) tag = own ? 'Padrão' : 'Padrão inicial (ainda não salvo)';
  else tag = own ? 'tabela própria' : 'usa o Padrão';
  head.appendChild(el('span', `wager-table-tag${own ? ' wager-table-tag-own' : ''}`, tag));
  head.appendChild(el('span', 'wager-table-count', `${usingCount} plataforma(s)`));
  row.appendChild(head);

  if (invalid) {
    row.appendChild(el('p', 'graficos-note graficos-note-warn wager-note',
      'A tabela gravada no banco está inválida e foi ignorada. Salvar aqui substitui pela tabela abaixo.'));
  }

  const grid = el('div', 'wager-table-grid');
  const inputs = [];
  WAGER_LEVELS.forEach(level => {
    const cell = el('label', 'wager-table-cell');
    cell.appendChild(el('span', 'wager-table-level', `V${level}`));
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = fmtInputNumber(effective[level]);
    input.setAttribute('aria-label', `${label} — V${level}`);
    if (level === 0) input.disabled = true; // V0 é sempre 0
    cell.appendChild(input);
    grid.appendChild(cell);
    inputs.push(input);
  });
  row.appendChild(grid);

  const actions = el('div', 'wager-table-actions');
  const saveBtn = el('button', 'btn-confirm', 'Salvar');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => onSaveTable(key, label, inputs, saveBtn));
  actions.appendChild(saveBtn);

  if (!isDefault && own) {
    const resetBtn = el('button', 'btn-remove-modal', 'Usar o Padrão');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => onRemoveTable(key, label, resetBtn));
    actions.appendChild(resetBtn);
  }
  row.appendChild(actions);
  return row;
}

function renderTables() {
  if (!mounted || !rootEl) return;
  const toggle = rootEl.querySelector('#wagerTablesToggle');
  const box = rootEl.querySelector('#wagerTables');
  if (!toggle || !box) return;

  toggle.setAttribute('aria-expanded', tablesOpen ? 'true' : 'false');
  toggle.textContent = tablesOpen ? '✕ Fechar tabelas' : '⚙️ Editar tabelas';
  box.classList.toggle('app-hidden', !tablesOpen);
  box.replaceChildren();
  if (!tablesOpen) return;

  if (reqStatus !== 'ok') {
    box.appendChild(el('p', 'graficos-note', reqStatus === 'error'
      ? 'Tabelas não carregadas — use "Tentar de novo" no topo da aba.'
      : 'Carregando as tabelas…'));
    return;
  }

  box.appendChild(el('p', 'graficos-note wager-note',
    'Valores em reais (ex.: 10.000 ou 10.000,50). Cada nível precisa ser maior que o anterior.'));
  box.appendChild(buildTableRow(DEFAULT_REQUIREMENT_KEY, 'Padrão (plataformas sem template)', countPlatformsUsing(null)));
  getTemplates().forEach(t => {
    box.appendChild(buildTableRow(t.id, `Template ${t.name}`, countPlatformsUsing(t.id)));
  });
}

async function onSaveTable(key, label, inputs, btn) {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  let changed = false;
  try {
    const values = inputs.map((input, i) => (i === 0 ? 0 : parseMoneyInput(input.value)));
    const badIndex = values.findIndex(v => !Number.isFinite(v));
    if (badIndex !== -1) {
      await showAppAlert(`${label}: valor inválido no V${badIndex}.`);
      return;
    }
    const check = validateWagerThresholds(values);
    if (!check.ok) {
      await showAppAlert(`${label}: ${check.error}`);
      return;
    }
    const result = await saveWagerRequirement(state.currentUid, key, values);
    if (!result.ok) {
      await showAppAlert(result.error);
      return;
    }
    changed = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (changed && mounted) {
      renderList();
      renderTables();
    }
  }
}

async function onRemoveTable(key, label, btn) {
  if (busy) return;
  const ok = await showAppConfirm(`${label}: remover a tabela própria? As plataformas desse template passam a usar a tabela Padrão.`);
  if (!ok || !mounted) return;
  busy = true;
  btn.disabled = true;
  let changed = false;
  try {
    const result = await removeWagerRequirement(state.currentUid, key);
    if (!result.ok) {
      await showAppAlert(result.error);
      return;
    }
    changed = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (changed && mounted) {
      renderList();
      renderTables();
    }
  }
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

// (Sub-entrega 4) Promoção — mesmo caminho do Salvar da Edição.
async function onPromote(platformId, targetLevel, btn) {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  let promoted = false;
  try {
    const platform = findPlatform(platformId);
    if (!platform) {
      await showAppAlert('Plataforma não encontrada. Recarregue a página.');
      return;
    }

    // Reconfere com os dados de AGORA (a tela pode estar desatualizada).
    const row = computeWagerTotal(platform, new Date());
    const info = getLevelInfo(platform, row);
    if (!info || info.promo.status !== 'promote' || info.promo.target !== targetLevel) {
      await showAppAlert('Os dados mudaram desde que a tela foi desenhada. Nada foi alterado — confira de novo.');
      return;
    }

    const minimo = BET_MINIMUM_BY_LEVEL[targetLevel] || 0;
    const fromText = info.promo.current === null ? 'sem nível' : `V${info.promo.current}`;
    // (Sub-entrega 12) Já recebeu o bônus VIP de hoje? Define se a promoção
    // vale desde hoje ou só a partir de amanhã. Cancelar = nada muda.
    const choice = await askVipChangeTiming({
      title: `Promover ${platform.name} para V${targetLevel}?`,
      subtitle: `De ${fromText} para V${targetLevel} — já recebeu o bônus VIP de hoje nesta plataforma?`,
      note: 'O passado não muda. Semanal segue o nível da segunda-feira; mensal, o do dia 1.' +
        (platform.group === 'com' && minimo > 0
          ? ` Grupo COM: o Bônus Diário passa a exigir aposta mínima de ${formatCurrency(minimo)} no dia.`
          : '')
    });
    if (!choice || !mounted) return;
    const changeDate = getVipChangeDate(choice === 'tomorrow');
    const ok = await showAppConfirm(
      `${platform.name}: V${targetLevel} passa a valer a partir de ${describeVipChangeDay(choice)}. Confirmar?`
    );
    if (!ok || !mounted) return;

    // Busca de novo: o confirm é assíncrono.
    const target = findPlatform(platformId);
    if (!target) {
      await showAppAlert('Plataforma não encontrada. Nada foi alterado.');
      return;
    }

    // Cópia pra desfazer: recordLevelChange pode alterar a entrada do dia no lugar.
    const prevLevel = target.level;
    const prevHistory = Array.isArray(target.levelHistory) ? target.levelHistory.map(e => ({ ...e })) : target.levelHistory;

    recordLevelChange(target, targetLevel, target.group, changeDate); // template omitido = mantém o atual
    target.level = targetLevel;

    const sent = savePlatform(state.currentUid, target);
    if (!sent) {
      target.level = prevLevel;
      if (prevHistory === undefined) delete target.levelHistory;
      else target.levelHistory = prevHistory;
      return;
    }
    promoted = true;
  } finally {
    busy = false;
    btn.disabled = false;
    if (promoted && mounted) renderList();
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
  renderTables();
  loadRequirements(false);
}

// Ao voltar pra aba e na virada do dia. Não faz nada se não montada.
export function refreshTotalApostado() {
  if (!mounted) return;
  renderList();
  renderTables();
}

export function unmountTotalApostado() {
  reqLoadToken++; // descarta leitura das tabelas ainda em andamento
  mounted = false;
  rootEl = null;
  busy = false;
  if (reqStatus === 'loading') reqStatus = 'idle';
}
