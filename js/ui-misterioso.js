// === UI DA ABA "MISTERIOSO" (View Gráficos — Sub-entrega 7b) ===
// Estratégia do Bônus Misterioso + contenção dos depósitos de aposta.
//
//   1) ORÇAMENTO — valor salvo (plannerConfig/strategy), modo "por ciclo" ou
//      "por mês". Usado = depósitos 🎁 Ativação Mensal no período (tipo do
//      depósito, Sub-entrega 7a). Sempre visível no topo da aba.
//   2) PLANO SUGERIDO — a melhor combinação que cabe no que sobra do
//      orçamento (strategy-logic.js: mochila exata, nunca estoura).
//   3) RANKING — melhor faixa de cada plataforma por eficiência (ganho a mais
//      nas emissões que faltam ÷ depósito necessário). Toque abre as outras
//      faixas. Valores SEMPRE pelo MÍNIMO da faixa (decisão do usuário).
//   4) CONTENÇÃO — depósitos por tipo, mês a mês (gráfico), e o limite MENSAL
//      dos 🎲 Depósitos de Aposta.
//
// BANCO: só plan-store.js (documento plannerConfig/strategy). Leitura
// estrita — falha = aba bloqueada com "Tentar de novo" (nunca grava em cima
// do que não viu). Gravação espera o commit; a tela só muda depois.
// Nunca grava plataforma.
//
// CONTEXTO DE BÔNUS: os templates do Misterioso vêm de view-graficos.js
// (loadBonusContextStrict). Sem eles, estratégia/ranking ficam desligados
// com aviso; a contenção continua funcionando (não depende de template).
//
// SEGURANÇA: nomes de plataforma/template só por textContent.
//
// === (Sub-entrega 11a) VELOCIDADE ===
// O plano sugerido usa a prioridade de hoje de cada plataforma (peso ×
// época — plannerConfig/speed). Plataforma com peso ≠ 1 mostra a etiqueta
// "⚡×N" no plano. Valores mostrados continuam os reais.

import { state } from './state.js';
import { formatCurrency, showAppAlert } from './utils.js';
import { parseMoneyInput } from './wager-total-logic.js';
import { MISTERIOSO_DEPOSIT_THRESHOLDS } from './misterioso-logic.js';
import { DEPOSIT_KINDS, UNTYPED_KIND } from './deposit-kinds.js';
import {
  BUDGET_MODES, CONTENTION_MONTHS, buildMisteriosoStrategy, computeDepositKindMonthly, computeContention, daysUntil
} from './strategy-logic.js';
import { formatMult } from './speed-logic.js';
import { loadPlannerData, isPlannerLoaded, getStrategySettings, saveStrategySettings, getStrategyPriority } from './plan-store.js';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const RANK_COLLAPSED = 8;

let rootEl = null;
let mounted = false;
let busy = false;
let resolveCtx = () => ({});
let contextConfirmed = false;
let loadStatus = 'idle';
let loadToken = 0;
let chart = null;
let showAllRank = false;
let draftBudget = null;   // texto digitado (null = mostra o salvo)
let draftLimit = null;
let draftMode = null;     // modo escolhido e ainda não salvo

// ---------- helpers ----------

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function money(c) {
  return formatCurrency(Math.round(Number(c) || 0) / 100);
}

function fmtMoneyInput(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

function fmtShort(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function whenLabel(key) {
  const n = daysUntil(key);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return fmtDay(key);
}

function tierLabel(tier) {
  return `Faixa ${formatCurrency(MISTERIOSO_DEPOSIT_THRESHOLDS[tier])}`;
}

function pct(x) {
  return `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function kpi(label, value, note, extra = '') {
  const c = el('div', `summary-card plan-kpi${extra ? ` ${extra}` : ''}`);
  c.appendChild(el('span', 'summary-label', label));
  c.appendChild(el('span', 'summary-value', value));
  if (note) c.appendChild(el('span', 'summary-note', note));
  return c;
}

function progressBar(ratio, cls = '') {
  const track = el('div', `ms-track${cls ? ` ${cls}` : ''}`);
  const fill = el('div', 'ms-fill');
  fill.style.width = `${Math.max(0, Math.min(1, ratio || 0)) * 100}%`;
  track.appendChild(fill);
  return track;
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="msLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="msRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <div id="msMain" class="ms-main app-hidden">
      <section class="card-shell graficos-section" aria-label="Orçamento do Misterioso">
        <div class="section-heading" style="padding:0 0 0.8rem;">
          <div>
            <h2>🎁 Orçamento do Misterioso</h2>
            <p>Quanto você aceita depositar pra subir de faixa. Usado = depósitos marcados como 🎁 Ativação Mensal.</p>
          </div>
        </div>
        <div id="msBudget" class="ms-body"></div>
      </section>

      <section class="card-shell graficos-section" aria-label="Plano sugerido" style="margin-top:1.1rem;">
        <div class="section-heading" style="padding:0 0 0.8rem;">
          <div>
            <h2>Plano sugerido</h2>
            <p>A melhor combinação que cabe no que sobra do orçamento — no máximo uma faixa por plataforma.</p>
          </div>
        </div>
        <div id="msPlan" class="ms-body"></div>
      </section>

      <section class="card-shell graficos-section" aria-label="Ranking por eficiência" style="margin-top:1.1rem;">
        <div class="section-heading" style="padding:0 0 0.8rem;">
          <div>
            <h2>Ranking por eficiência</h2>
            <p>Ganho a mais nas emissões que faltam no ciclo ÷ depósito necessário. Sempre pelo valor MÍNIMO da faixa.</p>
          </div>
        </div>
        <div id="msRank" class="ms-body"></div>
      </section>

      <section class="card-shell graficos-section" aria-label="Contenção de depósitos" style="margin-top:1.1rem;">
        <div class="section-heading" style="padding:0 0 0.8rem;">
          <div>
            <h2>Contenção de depósitos</h2>
            <p>Depósitos por tipo, mês a mês (últimos ${CONTENTION_MONTHS}). O limite vale pros 🎲 Depósitos de Aposta, por mês.</p>
          </div>
        </div>
        <div id="msContention" class="ms-body"></div>
        <div id="msChartWrap" class="chart-wrap ms-chart"><canvas id="msChart"></canvas></div>
        <div id="msContentionList" class="ms-body"></div>
      </section>
    </div>
  `;
  const retry = $('msRetry');
  if (retry) retry.addEventListener('click', () => loadData(true));
}

function renderLoadState() {
  const note = $('msLoadNote');
  const retry = $('msRetry');
  const main = $('msMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando orçamento e limites…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar o orçamento e os limites. Pra não salvar nada em cima do que não foi lido, a aba fica bloqueada. Verifique a internet e tente de novo.';
  if (loadStatus === 'ok' && !contextConfirmed) {
    msg = '⚠ Templates do Misterioso não carregados: plano sugerido e ranking ficam desligados. A contenção continua funcionando. Abra a página de novo quando a internet voltar.';
  }
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error' || (loadStatus === 'ok' && !!msg));
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  if (!force && isPlannerLoaded(uid)) {
    loadStatus = 'ok';
  } else {
    loadStatus = 'loading';
    renderLoadState();
    try {
      await loadPlannerData(uid);
    } catch (err) {
      if (token !== loadToken || !mounted) return;
      console.error('Misterioso: falha ao carregar a estratégia:', err);
      loadStatus = 'error';
      renderLoadState();
      return;
    }
    if (token !== loadToken || !mounted) return;
    loadStatus = 'ok';
  }
  renderLoadState();
  renderAll();
}

// ---------- cálculo (uma vez por desenho) ----------

function computeAll() {
  const settings = getStrategySettings();
  const effective = { ...settings, budgetMode: draftMode || settings.budgetMode };
  const now = new Date();
  const strategy = contextConfirmed
    ? buildMisteriosoStrategy(state.platforms, resolveCtx, effective, now, getStrategyPriority(now))
    : null;
  const monthly = computeDepositKindMonthly(state.platforms, CONTENTION_MONTHS, now);
  const contention = computeContention(state.platforms, settings.betDepositMonthlyLimit, now);
  return { settings, effective, strategy, monthly, contention, now };
}

function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  const data = computeAll();
  renderBudget(data);
  renderPlan(data);
  renderRanking(data);
  renderContention(data);
}

// ---------- 1) orçamento ----------

function renderBudget({ settings, effective, strategy }) {
  const box = $('msBudget');
  if (!box) return;
  box.replaceChildren();

  const mode = effective.budgetMode;
  if (strategy) {
    const budgetC = strategy.budgetC;
    const usedC = strategy.usage.usedC;
    const kpis = el('div', 'plan-kpis ms-kpis');
    kpis.appendChild(kpi('Orçamento', budgetC > 0 ? money(budgetC) : '—', mode === 'month' ? 'por mês' : 'por ciclo', 'plan-kpi-main'));
    kpis.appendChild(kpi('Usado 🎁', money(usedC), mode === 'month' ? 'neste mês' : 'nos ciclos atuais'));
    kpis.appendChild(kpi('Disponível', budgetC > 0 ? money(strategy.remainingC) : '—', budgetC > 0 && usedC > budgetC ? `passou ${money(usedC - budgetC)}` : '', budgetC > 0 && usedC > budgetC ? 'ms-kpi-bad' : 'plan-kpi-bonus'));
    box.appendChild(kpis);
    if (budgetC > 0) box.appendChild(progressBar(usedC / budgetC, usedC > budgetC ? 'ms-track-bad' : ''));
  }

  // Modo
  const modeRow = el('div', 'plan-chips');
  BUDGET_MODES.forEach(m => modeRow.appendChild(button(m.label, `plan-chip${mode === m.id ? ' active' : ''}`, () => {
    if (busy) return;
    draftMode = m.id === settings.budgetMode ? null : m.id;
    renderAll();
  })));
  const modeField = el('div', 'ms-field');
  modeField.appendChild(el('span', 'plan-label', 'Período do orçamento'));
  modeField.appendChild(modeRow);
  modeField.appendChild(el('p', 'plan-hint', mode === 'month'
    ? 'Por mês: soma os 🎁 do mês do calendário, de todas as plataformas.'
    : 'Por ciclo: soma os 🎁 do ciclo ATUAL de cada plataforma (cada uma com o seu início — Reinício ou dia 1).'));
  box.appendChild(modeField);

  // Valor
  const row = el('div', 'plan-row');
  const input = el('input', 'plan-input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = 'Ex.: 300,00';
  input.setAttribute('aria-label', 'Valor do orçamento');
  input.value = draftBudget !== null ? draftBudget : fmtMoneyInput(settings.budget);
  input.addEventListener('input', () => { draftBudget = input.value; syncBudgetButton(); });
  const saveBtn = button('Salvar', 'btn-confirm plan-btn-inline', () => onSaveBudget(saveBtn, input.value));
  saveBtn.id = 'msBudgetSave';
  row.appendChild(input);
  row.appendChild(saveBtn);
  const valField = el('div', 'ms-field');
  valField.appendChild(el('span', 'plan-label', 'Valor (R$) — vazio ou 0 desliga'));
  valField.appendChild(row);
  valField.appendChild(el('p', 'plan-hint', settings.saved && settings.updatedAt
    ? `Salvo em ${new Date(settings.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
    : 'Ainda não salvo.'));
  box.appendChild(valField);
  syncBudgetButton();

  if (strategy && strategy.usage.byPlatform.length) {
    const det = el('details', 'ms-details');
    det.appendChild(el('summary', '', `Usado por plataforma (${strategy.usage.byPlatform.length})`));
    strategy.usage.byPlatform.forEach(r => {
      const line = el('div', 'ms-line');
      line.appendChild(el('span', 'ms-line-name', r.name));
      line.appendChild(el('span', 'ms-line-value', money(r.valueC)));
      det.appendChild(line);
    });
    box.appendChild(det);
  }
}

function syncBudgetButton() {
  const btn = $('msBudgetSave');
  if (!btn) return;
  const s = getStrategySettings();
  const typed = draftBudget !== null ? draftBudget : fmtMoneyInput(s.budget);
  const v = typed.trim() === '' ? 0 : parseMoneyInput(typed);
  const sameValue = Number.isFinite(v) && Math.round(v * 100) === Math.round(s.budget * 100);
  btn.disabled = busy || (sameValue && !draftMode && s.saved);
}

async function onSaveBudget(btn, text) {
  if (busy) return;
  const v = text.trim() === '' ? 0 : parseMoneyInput(text);
  if (!Number.isFinite(v) || v < 0) { await showAppAlert('Valor inválido. Ex.: 300,00'); return; }
  const patch = { budget: v };
  if (draftMode) patch.budgetMode = draftMode;
  busy = true;
  btn.disabled = true;
  try {
    const result = await saveStrategySettings(state.currentUid, patch);
    if (!result.ok) { await showAppAlert(result.error); return; }
    draftBudget = null;
    draftMode = null;
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- 2) plano sugerido ----------

function optionRow(o, analysis, extraClass = '') {
  const row = el('div', `ms-pick${extraClass ? ` ${extraClass}` : ''}`);
  const head = el('div', 'ms-pick-head');
  head.appendChild(el('span', 'ms-pick-name', o.name));
  head.appendChild(el('span', 'ms-tag', tierLabel(o.tier)));
  const prio = getStrategyPriority(new Date())(o.platformId);
  if (prio !== 1) head.appendChild(el('span', 'ms-tag ms-tag-speed', formatMult(prio)));
  head.appendChild(el('span', 'ms-pick-amount', `+${money(o.gainC)}`));
  row.appendChild(head);
  row.appendChild(el('p', 'ms-pick-line', `Depositar ${money(o.needC)} → mín. ${money(o.newMinC)} por emissão (+${money(o.perEmissionC)})`));
  const dates = analysis ? analysis.remainingKeys.filter(k => !analysis.lockedKeys.includes(k)).map(whenLabel).join(', ') : '';
  row.appendChild(el('p', 'plan-hint', `${o.emissions} emissão(ões): ${dates} · retorno ${pct(o.efficiency)} · Rollover +${money(o.rolloverAddC)}`));
  return row;
}

function renderPlan({ strategy }) {
  const box = $('msPlan');
  if (!box) return;
  box.replaceChildren();
  if (!strategy) {
    box.appendChild(el('p', 'graficos-note', 'Indisponível sem os templates do Misterioso.'));
    return;
  }

  if (strategy.emissionsToday.length) {
    const today = el('div', 'ms-today');
    today.appendChild(el('strong', '', `🎁 Emissão hoje (${strategy.emissionsToday.length}): `));
    today.appendChild(el('span', '', strategy.emissionsToday.map(a => `${a.name} (${a.tierIndex >= 0 ? `mín. ${money(a.tierMinC)}` : 'sem faixa'})`).join(', ')));
    box.appendChild(today);
  }

  if (strategy.budgetC <= 0) {
    box.appendChild(el('p', 'graficos-note', 'Defina um orçamento acima pra ver a melhor combinação. O ranking abaixo funciona sem orçamento.'));
    return;
  }
  if (strategy.remainingC <= 0) {
    box.appendChild(el('p', 'graficos-note graficos-note-warn', 'O orçamento deste período já foi usado. Nada a sugerir até o próximo período (ou aumente o valor).'));
    return;
  }
  const plan = strategy.plan;
  if (plan.picks.length === 0) {
    box.appendChild(el('p', 'graficos-note', `Nenhuma subida de faixa cabe em ${money(strategy.remainingC)} com emissões ainda pela frente.`));
    return;
  }

  const kpis = el('div', 'plan-kpis ms-kpis');
  kpis.appendChild(kpi('Depositar', money(plan.spendC), `de ${money(strategy.remainingC)} disponíveis`, 'plan-kpi-main'));
  kpis.appendChild(kpi('Ganho a mais', money(plan.gainC), 'pelo mínimo das faixas', 'plan-kpi-bonus'));
  kpis.appendChild(kpi('Retorno', pct(plan.gainC / plan.spendC), 'ganho ÷ depósito'));
  kpis.appendChild(kpi('Rollover a mais', money(plan.rolloverAddC), 'depósito + bônus (1:1)'));
  box.appendChild(kpis);

  const byId = new Map(strategy.analyses.map(a => [a.platformId, a]));
  plan.picks.forEach(o => box.appendChild(optionRow(o, byId.get(o.platformId), 'ms-pick-plan')));
  box.appendChild(el('p', 'plan-hint', 'Registre o depósito como 🎁 Ativação Mensal (Edição ou Financeiro) — ele passa a contar como usado e a sugestão se refaz. Depósitos de qualquer tipo sobem a faixa; só os 🎁 consomem o orçamento.'));
  if (plan.capped) box.appendChild(el('p', 'plan-hint', 'Orçamento muito alto: a combinação foi calculada até R$ 20.000.'));
}

// ---------- 3) ranking ----------

function renderRanking({ strategy }) {
  const box = $('msRank');
  if (!box) return;
  box.replaceChildren();
  if (!strategy) {
    box.appendChild(el('p', 'graficos-note', 'Indisponível sem os templates do Misterioso.'));
    return;
  }
  const byId = new Map(strategy.analyses.map(a => [a.platformId, a]));
  const ranking = strategy.ranking;
  if (ranking.length === 0) {
    box.appendChild(el('p', 'graficos-note', 'Nenhuma plataforma com faixa acima pra subir e emissões pela frente neste ciclo.'));
  } else {
    const list = showAllRank ? ranking : ranking.slice(0, RANK_COLLAPSED);
    list.forEach((o, i) => {
      const a = byId.get(o.platformId);
      const det = el('details', 'ms-rank');
      const sum = el('summary', 'ms-rank-sum');
      sum.appendChild(el('span', 'ms-rank-pos', `${i + 1}º`));
      sum.appendChild(el('span', 'ms-pick-name', o.name));
      sum.appendChild(el('span', 'ms-tag', tierLabel(o.tier)));
      sum.appendChild(el('span', 'ms-rank-eff', pct(o.efficiency)));
      det.appendChild(sum);
      const body = el('div', 'ms-rank-body');
      body.appendChild(el('p', 'plan-hint',
        `Hoje: ${a.tierIndex >= 0 ? `${tierLabel(a.tierIndex)} (mín. ${money(a.tierMinC)})` : 'abaixo da 1ª faixa'} · depositado no ciclo ${money(a.totalC)} · ciclo desde ${fmtShort(a.cycleStartKey)}${a.templateName ? ` · ${a.templateName}` : ''}`));
      if (a.lockedKeys.length) body.appendChild(el('p', 'plan-hint', `Emissões já editadas à mão (não mudam): ${a.lockedKeys.map(fmtShort).join(', ')}.`));
      a.options.forEach(op => body.appendChild(optionRow(op, a, op.tier === o.tier ? 'ms-pick-best' : '')));
      det.appendChild(body);
      box.appendChild(det);
    });
    if (ranking.length > RANK_COLLAPSED) {
      box.appendChild(button(showAllRank ? 'Mostrar menos' : `Ver todas as ${ranking.length}`, 'bet-manage-btn plan-more', () => { showAllRank = !showAllRank; renderAll(); }));
    }
  }

  const reasons = {
    'no-template': 'sem template do Misterioso',
    'bad-template': 'template com faixas inválidas',
    ended: 'ciclo encerrado (Fim)',
    'no-cycle': 'marcada "🚫 Sem ciclo do Misterioso" na Edição',
    'no-emissions': 'sem emissões pela frente neste ciclo'
  };
  const out = strategy.analyses.filter(a => a.status !== 'ok' || a.options.length === 0);
  if (out.length) {
    const det = el('details', 'ms-details');
    det.appendChild(el('summary', '', `Fora do ranking (${out.length})`));
    out.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR', { numeric: true })).forEach(a => {
      let why = reasons[a.status];
      if (a.status === 'ok') why = a.tierIndex === MISTERIOSO_DEPOSIT_THRESHOLDS.length - 1 ? 'já na faixa máxima' : 'faixas acima não pagam mais pelo mínimo';
      if (a.status === 'no-emissions' && a.autoReset) why += ' — novo ciclo no dia 1';
      if (a.status === 'no-emissions' && !a.autoReset) why += ' — precisa de Reinício';
      const line = el('div', 'ms-line');
      line.appendChild(el('span', 'ms-line-name', a.name));
      line.appendChild(el('span', 'plan-hint', why));
      det.appendChild(line);
    });
    box.appendChild(det);
  }
}

// ---------- 4) contenção ----------

const KIND_COLORS = { semanal: '#2563eb', mensal: '#7c3aed', aposta: '#ea580c', none: '#94a3b8' };

function renderContention({ settings, contention, monthly }) {
  const box = $('msContention');
  const listBox = $('msContentionList');
  if (!box || !listBox) return;
  box.replaceChildren();
  listBox.replaceChildren();

  const c = contention;
  const kpis = el('div', 'plan-kpis ms-kpis');
  kpis.appendChild(kpi('🎲 Aposta no mês', money(c.usedC), c.limitC > 0 ? `limite ${money(c.limitC)}` : 'sem limite definido', c.status === 'over' ? 'ms-kpi-bad' : (c.status === 'near' ? 'plan-kpi-vip' : 'plan-kpi-main')));
  if (c.limitC > 0) {
    kpis.appendChild(kpi(c.status === 'over' ? 'Passou' : 'Ainda cabe', c.status === 'over' ? money(c.usedC - c.limitC) : money(c.leftC), `${c.daysLeft} dia(s) até o fim do mês`, c.status === 'over' ? 'ms-kpi-bad' : 'plan-kpi-bonus'));
    if (c.status !== 'over') kpis.appendChild(kpi('Por dia', money(c.perDayLeftC), 'pra fechar o mês no limite'));
  }
  box.appendChild(kpis);
  if (c.limitC > 0) box.appendChild(progressBar(c.ratio, c.status === 'over' ? 'ms-track-bad' : (c.status === 'near' ? 'ms-track-warn' : '')));

  const row = el('div', 'plan-row');
  const input = el('input', 'plan-input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = 'Ex.: 500,00';
  input.setAttribute('aria-label', 'Limite mensal dos depósitos de aposta');
  input.value = draftLimit !== null ? draftLimit : fmtMoneyInput(settings.betDepositMonthlyLimit);
  const saveBtn = button('Salvar', 'btn-confirm plan-btn-inline', () => onSaveLimit(saveBtn, input.value));
  const sync = () => {
    const v = input.value.trim() === '' ? 0 : parseMoneyInput(input.value);
    saveBtn.disabled = busy || (Number.isFinite(v) && Math.round(v * 100) === Math.round(settings.betDepositMonthlyLimit * 100) && settings.saved);
  };
  input.addEventListener('input', () => { draftLimit = input.value; sync(); });
  row.appendChild(input);
  row.appendChild(saveBtn);
  const field = el('div', 'ms-field');
  field.appendChild(el('span', 'plan-label', 'Limite mensal de 🎲 Depósito de Aposta (R$) — vazio ou 0 desliga'));
  field.appendChild(row);
  box.appendChild(field);
  sync();

  renderContentionChart(monthly, settings.betDepositMonthlyLimit);

  // Legenda textual do mês atual (todos os tipos)
  const cur = monthly[monthly.length - 1];
  const legend = el('div', 'ms-legend');
  [...DEPOSIT_KINDS.map(k => ({ id: k.id, label: `${k.emoji} ${k.label}` })), { id: 'none', label: `${UNTYPED_KIND.emoji} ${UNTYPED_KIND.label}` }].forEach(k => {
    const item = el('span', 'ms-legend-item');
    const dot = el('span', 'ms-dot');
    dot.style.background = KIND_COLORS[k.id];
    item.appendChild(dot);
    item.appendChild(el('span', '', `${k.label}: ${money(cur[k.id])}`));
    legend.appendChild(item);
  });
  listBox.appendChild(el('span', 'plan-label', `Este mês (${cur.label})`));
  listBox.appendChild(legend);

  if (c.byPlatform.length) {
    const det = el('details', 'ms-details');
    det.appendChild(el('summary', '', `🎲 Aposta por plataforma neste mês (${c.byPlatform.length})`));
    c.byPlatform.forEach(r => {
      const line = el('div', 'ms-line');
      line.appendChild(el('span', 'ms-line-name', r.name));
      line.appendChild(el('span', 'ms-line-value', money(r.valueC)));
      det.appendChild(line);
    });
    listBox.appendChild(det);
  }
  listBox.appendChild(el('p', 'plan-hint', 'Depósitos antigos sem tipo aparecem em "Sem tipo" — reclassifique pelo Histórico de Depósitos da Edição (aba "Todos").'));
}

function renderContentionChart(monthly, limit) {
  const canvas = $('msChart');
  if (!canvas || !window.Chart) return;
  const labels = monthly.map(m => m.label);
  const kinds = [...DEPOSIT_KINDS.map(k => ({ id: k.id, label: k.label })), { id: 'none', label: UNTYPED_KIND.label }];
  const datasets = kinds.map(k => ({
    type: 'bar',
    label: k.label,
    data: monthly.map(m => m[k.id] / 100),
    backgroundColor: KIND_COLORS[k.id],
    stack: 'dep',
    borderRadius: 3,
    order: 2
  }));
  if (Number(limit) > 0) {
    datasets.push({
      type: 'line',
      label: 'Limite 🎲 Aposta',
      data: monthly.map(() => Number(limit)),
      borderColor: '#dc2626',
      backgroundColor: '#dc2626',
      borderDash: [6, 4],
      pointRadius: 0,
      order: 1
    });
  }
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update('none');
    return;
  }
  chart = new window.Chart(canvas, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } }
      },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 0 } },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });
}

async function onSaveLimit(btn, text) {
  if (busy) return;
  const v = text.trim() === '' ? 0 : parseMoneyInput(text);
  if (!Number.isFinite(v) || v < 0) { await showAppAlert('Valor inválido. Ex.: 500,00'); return; }
  busy = true;
  btn.disabled = true;
  try {
    const result = await saveStrategySettings(state.currentUid, { betDepositMonthlyLimit: v });
    if (!result.ok) { await showAppAlert(result.error); return; }
    draftLimit = null;
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- API pública (view-graficos.js) ----------

// Chamar com window.Chart já carregado e com o painel VISÍVEL.
export function mountMisterioso(root, options = {}) {
  if (!root) return;
  unmountMisterioso();
  rootEl = root;
  mounted = true;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba / virada do dia: depósitos podem ter mudado no Financeiro.
export function refreshMisterioso() {
  if (!mounted || loadStatus !== 'ok' || busy) return;
  renderAll();
}

export function resizeMisterioso() {
  if (chart) chart.resize();
}

export function unmountMisterioso() {
  loadToken++;
  if (chart) { chart.destroy(); chart = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  showAllRank = false;
  draftBudget = null;
  draftLimit = null;
  draftMode = null;
  if (loadStatus === 'loading') loadStatus = 'idle';
}
