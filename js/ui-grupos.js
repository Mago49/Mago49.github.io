// === UI DA ABA "🏆 GRUPOS" — competição entre os grupos (Sub-entrega 19) ===
// Montada SOB DEMANDA por view-graficos.js (usa Chart.js, mesmo cuidado do
// Planejador: painel visível na hora de montar).
//
// O QUE MOSTRA (todas as contas em group-compare-logic.js, só leitura):
//   - filtro de período: Semana · Mês · Desde o plano · Datas;
//   - ranking com alternância rápida: Retorno % · Lucro R$ · Bônus ·
//     Apostado · Aderência · Rollover restante · ⬇️ Abatimento (Sub 20) (🥇🥈🥉);
//   - card de cada grupo (toque): depositado, sacado, apostado, bônus,
//     R.B., lucro, retorno, aderência ✅🟡❌, Rollover restante, quem mais
//     ajudou / puxou pra baixo, plataformas 🔁 (em 2+ grupos);
//   - gráficos: lucro acumulado de cada grupo no período (linha) e a
//     métrica do ranking lado a lado (barras);
//   - 🔒 grupos encerrados (rotinas 🏆 excluídas): renomear, corrigir os
//     períodos, excluir de vez — sempre com confirmação.
//
// GRUPO = rotina com "🏆 Participar da competição" (routineCompetes) +
// grupos encerrados. Cada plataforma conta só nos dias em que participava
// (memberPeriods).
//
// BANCO: leituras — rotinas (estrita: sem elas a aba fica bloqueada com
// "Tentar de novo"), planos e histórico do planejado (tolerantes: sem eles
// a aderência some, com aviso), grupos encerrados (tolerante: sem eles,
// aviso e eles não aparecem). Única gravação: editar/excluir grupo
// encerrado (routine-store.js). Nunca grava plataforma.
//
// SEGURANÇA: nomes só por textContent/value — nada do usuário em innerHTML.

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import { toLocalDateString, computeRolloverLive } from './finance-logic.js';
import {
  RANK_METRICS, PERIODS, periodRange, computeGroupStats, rankGroups, metricValue, isDayKey, addDaysKey, planStartFor
} from './group-compare-logic.js';
import { getMemberPeriods, routineCompetes, validateMemberPeriods, ROUTINE_HISTORY_DAYS, ROUTINE_NAME_MAX } from './routine-logic.js';
import {
  loadRoutineData, isRoutinesLoaded, getRoutines,
  loadGroupArchive, isGroupArchiveLoaded, getArchivedGroups, updateArchivedGroup, deleteArchivedGroup
} from './routine-store.js';
import { loadPlannerData, isPlannerLoaded, getSavedPlans, getCalendarSettings } from './plan-store.js';
import { loadPlanLogs, isPlanLogLoaded, getPlanLogRange, getPlanLogEntry } from './plan-log-store.js';

const FALLBACK_COLORS = ['#2563eb', '#15803d', '#dc2626', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#475569'];
const MEDALS = ['🥇', '🥈', '🥉'];

let rootEl = null;
let mounted = false;
let busy = false;
let loadStatus = 'idle';
let loadToken = 0;
let resolveCtx = () => ({});
let contextConfirmed = false;
let plannerFailed = false;
let archiveFailed = false;
let planLogFailed = false;
let lineChart = null;
let barChart = null;
let lastStats = [];

// Sessão (sobrevive à troca de aba).
const ui = {
  period: 'month',
  fromKey: '',
  toKey: '',
  metric: 'roi',
  showArchived: true,
  open: new Set(),
  editing: null // { id, name, periods[] } — grupo encerrado em edição
};

// ---------- helpers ----------

function $(id) {
  return rootEl ? rootEl.querySelector(`#${id}`) : null;
}

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

function todayKey() {
  return toLocalDateString(new Date());
}

function fmtShort(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function money(c) {
  return formatCurrency((Number(c) || 0) / 100);
}

function pct(v) {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`;
}

function fmtMetric(metricId, v) {
  if (v === null || v === undefined) return '—';
  const m = RANK_METRICS.find(x => x.id === metricId);
  return m && m.kind === 'pct' ? pct(v) : money(v);
}

function platformName(id) {
  const p = state.platforms.find(x => x.id === id);
  return p ? p.name : '(plataforma excluída)';
}

// ---------- grupos ----------

function currentGroups() {
  const out = [];
  if (isRoutinesLoaded(state.currentUid)) {
    getRoutines().filter(routineCompetes).forEach(r => out.push({
      id: r.id, name: r.name, emoji: r.emoji || '', color: r.color, periods: getMemberPeriods(r), archived: false, action: r.action
    }));
  }
  if (ui.showArchived && isGroupArchiveLoaded(state.currentUid)) {
    getArchivedGroups().forEach(g => out.push({
      id: g.id, name: g.name, emoji: g.emoji || '', color: g.color, periods: g.memberPeriods, archived: true, action: g.action, archivedAt: g.archivedAt
    }));
  }
  return out;
}

function currentRange() {
  if (ui.period === 'plan') return null;
  return periodRange(ui.period, todayKey(), { fromKey: ui.fromKey, toKey: ui.toKey });
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="grLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="grRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <div id="grMain" class="app-hidden">
      <section class="card-shell graficos-section" aria-label="Competição entre os grupos">
        <div class="section-heading" style="padding:0 0 0.8rem;">
          <div>
            <h2>🏆 Grupos</h2>
            <p>Competição interna entre os grupos (rotinas com 🏆). Cada plataforma conta só nos dias em que participava do grupo.</p>
          </div>
        </div>
        <div class="plan-field">
          <span class="plan-label">Período</span>
          <div id="grPeriods" class="plan-chips" role="group" aria-label="Período"></div>
          <div id="grCustom" class="plan-row app-hidden">
            <input type="date" id="grFrom" class="plan-input" aria-label="De" />
            <span class="plan-sep">até</span>
            <input type="date" id="grTo" class="plan-input" aria-label="Até" />
          </div>
          <p id="grPeriodHint" class="plan-hint"></p>
        </div>
        <div class="plan-field">
          <span class="plan-label">Ranking por</span>
          <div id="grMetrics" class="plan-chips" role="group" aria-label="Ranking por"></div>
          <p id="grMetricHint" class="plan-hint"></p>
        </div>
        <div id="grArchivedToggle" class="plan-chips gr-toggle"></div>
        <div id="grNotes"></div>
        <div id="grRanking" class="gr-ranking"></div>
      </section>
      <section id="grCharts" class="card-shell graficos-section" aria-label="Gráficos dos grupos">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div>
            <h2>📈 Lucro acumulado no período</h2>
            <p>Quem está ganhando a corrida: R.B. + bônus, dia a dia.</p>
          </div>
        </div>
        <div class="chart-wrap gr-chart"><canvas id="grLine"></canvas></div>
        <div class="section-heading" style="padding:1rem 0 0.6rem;">
          <div>
            <h2 id="grBarTitle">📊 Comparação</h2>
          </div>
        </div>
        <div class="chart-wrap gr-chart"><canvas id="grBar"></canvas></div>
      </section>
    </div>
  `;
  const retry = $('grRetry');
  if (retry) retry.addEventListener('click', () => loadData(true));
  const from = $('grFrom');
  const to = $('grTo');
  if (from) from.addEventListener('change', () => { ui.fromKey = from.value; renderAll(); });
  if (to) to.addEventListener('change', () => { ui.toKey = to.value; renderAll(); });
}

function renderLoadState() {
  const note = $('grLoadNote');
  const retry = $('grRetry');
  const main = $('grMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando grupos…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar as rotinas (os grupos). Verifique a internet e tente de novo.';
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error');
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  if (force || !isRoutinesLoaded(uid)) {
    loadStatus = 'loading';
    renderLoadState();
    try {
      const t = todayKey();
      await loadRoutineData(uid, addDaysKey(t, -ROUTINE_HISTORY_DAYS), t);
    } catch (err) {
      if (token !== loadToken || !mounted) return;
      console.error('Grupos: rotinas não carregadas:', err);
      loadStatus = 'error';
      renderLoadState();
      return;
    }
    if (token !== loadToken || !mounted) return;
  }
  // Tolerantes.
  if (force || !isGroupArchiveLoaded(uid)) {
    try { await loadGroupArchive(uid); archiveFailed = false; } catch (err) { console.warn('Grupos: grupos encerrados não carregados.', err); archiveFailed = true; }
    if (token !== loadToken || !mounted) return;
  }
  if (!isPlannerLoaded(uid)) {
    try { await loadPlannerData(uid); plannerFailed = false; } catch (err) { console.warn('Grupos: planos não carregados.', err); plannerFailed = true; }
    if (token !== loadToken || !mounted) return;
  } else plannerFailed = false;
  loadStatus = 'ok';
  renderLoadState();
  renderAll();
}

// Histórico do planejado: só AMPLIA o intervalo já carregado (Calendário e
// Planejador usam o mesmo cache).
async function ensurePlanLogs(fromKey) {
  const uid = state.currentUid;
  const t = todayKey();
  const cur = isPlanLogLoaded(uid) ? getPlanLogRange() : null;
  if (cur && cur.fromKey <= fromKey && cur.toKey >= t) return true;
  const a = cur && cur.fromKey < fromKey ? cur.fromKey : fromKey;
  const b = cur && cur.toKey > t ? cur.toKey : t;
  try {
    await loadPlanLogs(uid, a, b);
    planLogFailed = false;
    return true;
  } catch (err) {
    console.warn('Grupos: histórico do planejado não carregado — aderência só pelos planos salvos.', err);
    planLogFailed = true;
    return false;
  }
}

// ---------- controles ----------

function chip(label, active, onClick, extra = '') {
  const b = button(label, `plan-chip${active ? ' active' : ''}${extra ? ` ${extra}` : ''}`, onClick);
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  return b;
}

function renderControls() {
  const periods = $('grPeriods');
  if (periods) {
    periods.replaceChildren();
    PERIODS.forEach(p => periods.appendChild(chip(p.label, ui.period === p.id, () => {
      ui.period = p.id;
      if (p.id === 'custom' && !ui.fromKey) {
        const t = todayKey();
        ui.fromKey = `${t.slice(0, 8)}01`;
        ui.toKey = t;
      }
      ui.open.clear();
      renderAll();
    })));
  }
  const custom = $('grCustom');
  if (custom) custom.classList.toggle('app-hidden', ui.period !== 'custom');
  const from = $('grFrom');
  const to = $('grTo');
  const t = todayKey();
  if (from) { from.value = ui.fromKey || ''; from.max = t; }
  if (to) { to.value = ui.toKey || ''; to.max = t; }
  const ph = $('grPeriodHint');
  if (ph) {
    const r = currentRange();
    if (ui.period === 'plan') ph.textContent = 'Cada grupo desde o início do plano de grupo dele (Planejador). Sem plano de grupo: fica sem dados.';
    else if (r) ph.textContent = `${fmtShort(r.fromKey)} a ${fmtShort(r.toKey)} (até hoje).`;
    else ph.textContent = 'Escolha o início e o fim (o início antes do fim).';
  }
  const metrics = $('grMetrics');
  if (metrics) {
    metrics.replaceChildren();
    RANK_METRICS.forEach(m => metrics.appendChild(chip(m.label, ui.metric === m.id, () => { ui.metric = m.id; renderAll(); })));
  }
  const mh = $('grMetricHint');
  if (mh) mh.textContent = (RANK_METRICS.find(m => m.id === ui.metric) || {}).hint || '';
  const tog = $('grArchivedToggle');
  if (tog) {
    tog.replaceChildren();
    const n = isGroupArchiveLoaded(state.currentUid) ? getArchivedGroups().length : 0;
    tog.appendChild(chip(`🔒 Encerrados (${n}): ${ui.showArchived ? 'mostrando' : 'ocultos'}`, ui.showArchived, () => { ui.showArchived = !ui.showArchived; renderAll(); }, 'plan-chip-ghost'));
  }
}

// ---------- cálculo + desenho ----------

async function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  renderControls();
  const groups = currentGroups();
  const range = currentRange();
  const t = todayKey();
  // Histórico do planejado cobrindo o período (tolerante).
  let minFrom = range ? range.fromKey : null;
  if (!range && ui.period === 'plan') {
    groups.forEach(g => { const k = planStartFor(g.id, getSavedPlans()); if (k && (!minFrom || k < minFrom)) minFrom = k; });
  }
  if (minFrom && minFrom < t) {
    const token = loadToken;
    await ensurePlanLogs(minFrom);
    if (!mounted || token !== loadToken) return;
  }
  const rolloverCache = new Map();
  const now = new Date();
  const stats = (ui.period === 'custom' && !range) ? [] : computeGroupStats(groups, state.platforms, range, {
    todayKey: t,
    periodId: ui.period,
    resolveCtx,
    plans: isPlannerLoaded(state.currentUid) ? getSavedPlans() : [],
    getPlanLog: isPlanLogLoaded(state.currentUid) ? getPlanLogEntry : null,
    thresholdPct: getCalendarSettings().partialThreshold,
    rolloverOf: (p) => {
      if (!contextConfirmed) return null;
      if (!rolloverCache.has(p.id)) {
        let v = null;
        try { v = Math.round(computeRolloverLive(p, now, resolveCtx(p) || {}) * 100); } catch (err) { v = null; }
        rolloverCache.set(p.id, v);
      }
      return rolloverCache.get(p.id);
    }
  });
  lastStats = rankGroups(stats, ui.metric);
  renderNotes(groups);
  renderRanking();
  renderCharts();
}

function renderNotes(groups) {
  const box = $('grNotes');
  if (!box) return;
  box.replaceChildren();
  const notes = [];
  if (!groups.length) notes.push('Nenhum grupo na competição ainda. Em Rotinas, ligue "🏆 Participar da competição" (liga sozinho nas rotinas com 2+ plataformas).');
  if (archiveFailed) notes.push('⚠ Grupos encerrados não carregados — eles ficam fora do ranking agora.');
  if (plannerFailed || planLogFailed) notes.push('⚠ Planos/histórico do planejado não carregados — a aderência pode aparecer incompleta.');
  if (!contextConfirmed) notes.push('⚠ Configurações de bônus não carregadas: Obrigado/Misterioso ficam fora do bônus e o Rollover restante não aparece.');
  notes.forEach(n => box.appendChild(el('p', 'graficos-note', n)));
}

function colorOf(g, i) {
  return /^#[0-9a-fA-F]{6}$/.test(String(g.color || '')) ? g.color : FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function stat(label, value, cls = '') {
  const c = el('div', `gr-stat${cls ? ` ${cls}` : ''}`);
  c.appendChild(el('span', 'gr-stat-label', label));
  c.appendChild(el('span', 'gr-stat-value', value));
  return c;
}

function renderRanking() {
  const box = $('grRanking');
  if (!box) return;
  box.replaceChildren();
  let pos = 0;
  lastStats.forEach((s, i) => {
    const g = s.group;
    const v = metricValue(s, ui.metric);
    if (v !== null) pos++;
    const row = el('div', `gr-row${g.archived ? ' gr-row-archived' : ''}`);
    row.style.borderLeftColor = colorOf(g, i);
    const head = el('button', 'gr-row-head');
    head.type = 'button';
    const isOpen = ui.open.has(g.id);
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    head.appendChild(el('span', 'gr-pos', v === null ? '·' : (MEDALS[pos - 1] || `${pos}º`)));
    const nameBox = el('span', 'gr-name-box');
    nameBox.appendChild(el('span', 'gr-name', `${g.emoji ? `${g.emoji} ` : ''}${g.name}${g.archived ? ' 🔒' : ''}`));
    const nPlat = new Set((g.periods || []).map(x => x.platformId)).size;
    const nShared = [...new Set((g.periods || []).map(x => x.platformId))].filter(pid => s.shared.has(pid)).length;
    const sub = s.noRange
      ? (ui.period === 'plan' ? 'sem plano de grupo' : 'sem período')
      : `${nPlat} plataforma(s)${nShared ? ` · 🔁 ${nShared}` : ''} · ${fmtShort(s.fromKey)}–${fmtShort(s.toKey)}`;
    nameBox.appendChild(el('span', 'gr-sub', sub));
    head.appendChild(nameBox);
    head.appendChild(el('span', `gr-value${typeof v === 'number' && v < 0 ? ' gr-neg' : ''}`, fmtMetric(ui.metric, v)));
    head.addEventListener('click', () => {
      if (ui.open.has(g.id)) ui.open.delete(g.id); else ui.open.add(g.id);
      renderRanking();
    });
    row.appendChild(head);
    if (isOpen) row.appendChild(renderDetail(s));
    box.appendChild(row);
  });
}

function renderDetail(s) {
  const g = s.group;
  const t = s.totals;
  const box = el('div', 'gr-detail');
  if (s.noRange) {
    box.appendChild(el('p', 'plan-hint', ui.period === 'plan' ? 'Este grupo ainda não tem plano de grupo salvo no Planejador.' : 'Período inválido.'));
  } else {
    const grid = el('div', 'gr-stats');
    grid.appendChild(stat('Depositado', money(t.depositC)));
    grid.appendChild(stat('Sacado', money(t.withdrawC)));
    grid.appendChild(stat('Apostado', money(t.wageredC)));
    grid.appendChild(stat('Bônus', money(t.bonusC)));
    grid.appendChild(stat('R.B.', money(t.rbC), t.rbC < 0 ? 'gr-neg' : ''));
    grid.appendChild(stat('Lucro (R.B. + bônus)', money(t.lucroC), t.lucroC < 0 ? 'gr-neg' : 'gr-pos-v'));
    grid.appendChild(stat('Retorno', pct(t.roi), t.roi !== null && t.roi < 0 ? 'gr-neg' : ''));
    grid.appendChild(stat('Aderência', t.planDays ? `${pct(t.aderencia)} · ✅${t.done} 🟡${t.partial} ❌${t.miss}` : '—'));
    grid.appendChild(stat('Rollover restante', g.archived ? '—' : (t.rolloverC === null ? '—' : money(t.rolloverC))));
    grid.appendChild(stat('⬇️ Abatimento', money(t.abatC)));
    box.appendChild(grid);
    const mem = s.members;
    if (mem.length) {
      const helped = mem.filter(m => m.lucroC > 0).slice(0, 3);
      const hurt = mem.filter(m => m.lucroC < 0).slice(-3).reverse();
      if (helped.length) box.appendChild(el('p', 'plan-hint', `👍 Mais ajudaram: ${helped.map(m => `${m.name} ${money(m.lucroC)}`).join(' · ')}`));
      if (hurt.length) box.appendChild(el('p', 'plan-hint', `👎 Mais puxaram pra baixo: ${hurt.map(m => `${m.name} ${money(m.lucroC)}`).join(' · ')}`));
      const det = el('details', 'gr-members');
      det.appendChild(el('summary', '', `Todas as ${mem.length} plataforma(s) do período`));
      mem.forEach(m => {
        const r = el('div', 'gr-member');
        r.appendChild(el('span', 'gr-member-name', `${s.shared.has(m.platformId) ? '🔁 ' : ''}${m.name}`));
        r.appendChild(el('span', `gr-member-val${m.lucroC < 0 ? ' gr-neg' : ''}`, `${money(m.lucroC)} · ret. ${pct(m.roi)}`));
        det.appendChild(r);
      });
      box.appendChild(det);
    } else {
      box.appendChild(el('p', 'plan-hint', 'Nenhuma plataforma participava do grupo neste período.'));
    }
  }
  if (g.archived) box.appendChild(renderArchivedActions(g));
  return box;
}

// ---------- 🔒 grupo encerrado: editar / excluir ----------

function renderArchivedActions(g) {
  const wrap = el('div', 'gr-archived');
  wrap.appendChild(el('p', 'plan-hint', `🔒 Grupo encerrado em ${g.archivedAt ? new Date(g.archivedAt).toLocaleDateString('pt-BR') : '—'} (a rotina foi excluída). Os resultados continuam na competição.`));
  const ed = ui.editing && ui.editing.id === g.id ? ui.editing : null;
  if (!ed) {
    const acts = el('div', 'rt-actions');
    acts.appendChild(button('Editar', 'bet-manage-btn', () => {
      ui.editing = { id: g.id, name: g.name, periods: g.periods.map(x => ({ ...x })) };
      renderRanking();
    }));
    acts.appendChild(button('Excluir de vez', 'btn-remove-modal', () => onDeleteArchived(g)));
    wrap.appendChild(acts);
    return wrap;
  }
  const nameIn = el('input', 'plan-input');
  nameIn.type = 'text';
  nameIn.maxLength = ROUTINE_NAME_MAX;
  nameIn.value = ed.name;
  nameIn.setAttribute('aria-label', 'Nome do grupo');
  nameIn.addEventListener('input', () => { ed.name = nameIn.value; });
  wrap.appendChild(el('span', 'plan-label', 'Nome'));
  wrap.appendChild(nameIn);
  wrap.appendChild(el('span', 'plan-label', 'Períodos de participação'));
  ed.periods.forEach((x, i) => {
    const row = el('div', 'rt-member-row');
    row.appendChild(el('span', 'rt-member-name', platformName(x.platformId)));
    const dates = el('div', 'rt-member-dates');
    const from = el('input', 'plan-input');
    from.type = 'date';
    from.value = x.from === '2000-01-01' ? '' : x.from;
    from.setAttribute('aria-label', `Início — ${platformName(x.platformId)}`);
    from.addEventListener('change', () => { ed.periods[i].from = from.value || '2000-01-01'; });
    const to = el('input', 'plan-input');
    to.type = 'date';
    to.value = x.to || '';
    to.setAttribute('aria-label', `Fim — ${platformName(x.platformId)}`);
    to.addEventListener('change', () => { ed.periods[i].to = to.value || null; });
    dates.appendChild(from);
    dates.appendChild(el('span', 'plan-sep', 'até'));
    dates.appendChild(to);
    row.appendChild(dates);
    row.appendChild(button('Excluir', 'btn-remove-modal rt-member-del', () => { ed.periods.splice(i, 1); renderRanking(); }));
    wrap.appendChild(row);
  });
  const acts = el('div', 'rt-actions');
  acts.appendChild(button('Cancelar', 'bet-manage-btn', async () => {
    const changed = ed.name !== g.name || JSON.stringify(ed.periods) !== JSON.stringify(g.periods);
    if (changed && !(await showAppConfirm('Descartar as alterações deste grupo?'))) return;
    ui.editing = null;
    renderRanking();
  }));
  acts.appendChild(button('Salvar', 'btn-confirm', (e) => onSaveArchived(g, e.target)));
  wrap.appendChild(acts);
  return wrap;
}

async function onSaveArchived(g, btn) {
  if (busy || !ui.editing) return;
  const ed = ui.editing;
  const name = String(ed.name || '').trim();
  if (!name) { await showAppAlert('Dê um nome ao grupo.'); return; }
  if (ed.periods.some(x => !x.to)) { await showAppAlert('Grupo encerrado: todo período precisa ter data de fim.'); return; }
  const chk = validateMemberPeriods(ed.periods);
  if (!chk.ok) { await showAppAlert(chk.error); return; }
  busy = true;
  btn.disabled = true;
  try {
    const r = await updateArchivedGroup(state.currentUid, g.id, { name, memberPeriods: ed.periods });
    if (!r.ok) { await showAppAlert(r.error); return; }
    ui.editing = null;
  } finally {
    busy = false;
    btn.disabled = false;
    if (mounted) renderAll();
  }
}

async function onDeleteArchived(g) {
  if (busy) return;
  const ok = await showAppConfirm(`Excluir DE VEZ o grupo encerrado "${g.name}"? Ele sai da competição e do histórico de grupos. Os lançamentos das plataformas não mudam.`);
  if (!ok || !mounted) return;
  busy = true;
  try {
    const r = await deleteArchivedGroup(state.currentUid, g.id);
    if (!r.ok) await showAppAlert(r.error);
    ui.open.delete(g.id);
  } finally {
    busy = false;
    if (mounted) renderAll();
  }
}

// ---------- gráficos ----------

function renderCharts() {
  const wrap = $('grCharts');
  const valid = lastStats.filter(s => !s.noRange);
  if (wrap) wrap.classList.toggle('app-hidden', !valid.length || !window.Chart);
  if (!valid.length || !window.Chart) return;
  // Linha: todas as datas de todos os grupos (cada um no seu período).
  const keys = [...new Set(valid.flatMap(s => s.series.map(x => x.key)))].sort();
  const datasets = valid.map((s, i) => {
    const by = new Map(s.series.map(x => [x.key, x.lucroC / 100]));
    return {
      label: `${s.group.name}${s.group.archived ? ' 🔒' : ''}`,
      data: keys.map(k => (by.has(k) ? by.get(k) : null)),
      borderColor: colorOf(s.group, i),
      backgroundColor: colorOf(s.group, i),
      pointRadius: keys.length > 30 ? 0 : 2,
      tension: 0.25,
      spanGaps: false
    };
  });
  const lineCanvas = $('grLine');
  if (lineCanvas) {
    if (lineChart) {
      lineChart.data.labels = keys.map(fmtShort);
      lineChart.data.datasets = datasets;
      lineChart.update('none');
    } else {
      lineChart = new window.Chart(lineCanvas, {
        type: 'line',
        data: { labels: keys.map(fmtShort), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}` } }
          },
          scales: { x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } } }
        }
      });
    }
  }
  // Barras: a métrica do ranking.
  const metric = RANK_METRICS.find(m => m.id === ui.metric) || RANK_METRICS[0];
  const title = $('grBarTitle');
  if (title) title.textContent = `📊 ${metric.label} por grupo`;
  const withVal = valid.filter(s => metricValue(s, metric.id) !== null);
  const barCanvas = $('grBar');
  const isPct = metric.kind === 'pct';
  const labels = withVal.map(s => `${s.group.name}${s.group.archived ? ' 🔒' : ''}`);
  const data = withVal.map(s => { const v = metricValue(s, metric.id); return isPct ? Math.round(v * 1000) / 10 : v / 100; });
  const colors = withVal.map(s => colorOf(s.group, lastStats.indexOf(s)));
  const fmtTick = (v) => (isPct ? `${v}%` : formatCurrency(v));
  if (barCanvas) {
    if (barChart) {
      barChart.data.labels = labels;
      barChart.data.datasets = [{ label: metric.label, data, backgroundColor: colors, borderRadius: 4 }];
      barChart.options.plugins.tooltip.callbacks.label = (c) => `${metric.label}: ${fmtTick(c.parsed.x)}`;
      barChart.options.scales.x.ticks.callback = fmtTick;
      barChart.update('none');
    } else {
      barChart = new window.Chart(barCanvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: metric.label, data, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${metric.label}: ${fmtTick(c.parsed.x)}` } }
          },
          scales: { x: { ticks: { callback: fmtTick } } }
        }
      });
    }
  }
}

// ---------- API pública (view-graficos.js) ----------

export function mountGrupos(root, options = {}) {
  if (!root) return;
  unmountGrupos();
  rootEl = root;
  mounted = true;
  resolveCtx = typeof options.resolveCtx === 'function' ? options.resolveCtx : () => ({});
  contextConfirmed = options.contextConfirmed === true;
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba / virada do dia: relê os grupos encerrados e redesenha.
export function refreshGrupos() {
  if (!mounted || loadStatus !== 'ok' || busy || ui.editing) return;
  renderAll();
}

export function resizeGrupos() {
  if (lineChart) lineChart.resize();
  if (barChart) barChart.resize();
}

export function unmountGrupos() {
  loadToken++;
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart) { barChart.destroy(); barChart = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  ui.editing = null;
  lastStats = [];
  if (loadStatus === 'loading') loadStatus = 'idle';
}
