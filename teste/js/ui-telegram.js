// === UI DA ABA "📨 TELEGRAM" (View Gráficos — Sub-entrega 21) ===
// Montada SOB DEMANDA por view-graficos.js (sem Chart.js). Só existe com
// TELEGRAM_FEATURE ligado (dev-flags.js) — na versão da loja fica desligada.
//
// TRÊS TELAS (chips no topo, a escolhida fica lembrada na sessão):
//   📨 Hoje   — o que os canais mandaram HOJE (ao vivo): horários com a
//               situação de cada um (✅ ❌ ➖ · ⏳ 🕒), links, texto da
//               mensagem, próximos horários e o placar do dia. 🗑 exclui a
//               mensagem e tira os horários dela da métrica (confirmação).
//   📈 Acerto — período · canal · plataforma (todas as opções na tela):
//               % de acerto, testados, dentro × fora, ranking dos canais
//               e o histórico por dia (excluir/voltar a contar mensagem,
//               excluir o dia — sempre com confirmação).
//   ⚙️ Canais — lista que o bot mandou: ligar/desligar, plataforma do
//               canal, janela (5/10/15 min), remover; 📋 copiar textos
//               (semana de calibração).
//
// SITUAÇÃO DO BOT no topo: 🟢 ativo (sinal de vida há até 12 min) ·
// 🔴 sem sinal · ⚪ nunca conectou.
//
// BANCO: telegram-store.js. Leitura estrita dos canais marcados e dos dias
// (falha = aba bloqueada com "Tentar de novo"); ao vivo: feed de hoje, dia
// de hoje e lista do bot (falha = aviso, o resto continua). Nunca grava
// plataforma.
//
// SEGURANÇA: tudo que vem do Telegram entra por textContent; link só vira
// <a> se começar com http(s):// (rel="noopener noreferrer nofollow").

import { state } from './state.js';
import { formatCurrency, showAppAlert, showAppConfirm } from './utils.js';
import {
  PERIODS, STATUS, WINDOW_OPTIONS, DEFAULT_WINDOW, periodRange, toDayKey,
  computeAcerto, daySignals, sourceWindow, sortFeed, botStatus, mergeChannelList, ret
} from './telegram-logic.js';
import {
  watchDialogs, watchFeed, watchDay, loadSources, isSourcesLoaded, getSources, saveSource, deleteSource,
  loadDays, getDaysFrom, getDays, setExcluded, deleteFeedMessage, deleteDay, loadCalibrationTexts
} from './telegram-store.js';

const VIEWS = [
  { id: 'hoje', label: '📨 Hoje' },
  { id: 'acerto', label: '📈 Acerto' },
  { id: 'canais', label: '⚙️ Canais' }
];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

let rootEl = null;
let mounted = false;
let busy = false;
let loadStatus = 'idle';
let loadToken = 0;
let tickTimer = null;
let unsubs = [];
let liveError = '';
let watchedDay = null;

let dialogsDoc = null;
let feedDocs = [];
let todayDoc = null;

// Sessão (sobrevive à troca de aba).
const ui = {
  view: 'hoje',
  period: '30d',
  chat: null,
  platform: null,
  hojeChat: null,
  search: '',
  drafts: new Map(), // chatId -> { active, platformId, windowMin }
  openDays: new Set()
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

function chip(label, active, onClick, extra = '') {
  const b = button(label, `plan-chip${active ? ' active' : ''}${extra ? ` ${extra}` : ''}`, onClick);
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  return b;
}

function todayKey() {
  return toDayKey(new Date());
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function hhmm(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function money(c) {
  return formatCurrency((Number(c) || 0) / 100);
}

function pct(v, signed = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(1).replace('.', ',');
  return `${signed && v > 0 ? '+' : ''}${s}%`;
}

// Diferença entre dois retornos, em pontos percentuais.
function pp(v) {
  return `${(v * 100).toFixed(1).replace('.', ',')} ponto(s) percentual(is)`;
}

function platformName(id) {
  if (!id) return 'sem plataforma';
  const p = state.platforms.find(x => x.id === id);
  return p ? p.name : '(plataforma excluída)';
}

function stat(label, value, cls = '') {
  const c = el('div', 'gr-stat');
  c.appendChild(el('span', 'gr-stat-label', label));
  c.appendChild(el('span', `gr-stat-value${cls ? ` ${cls}` : ''}`, value));
  return c;
}

function signCls(v) {
  if (v === null || v === undefined) return '';
  return v < 0 ? 'gr-neg' : (v > 0 ? 'gr-pos-v' : '');
}

// ---------- esqueleto + carga ----------

function renderSkeleton() {
  rootEl.innerHTML = `
    <p id="tgLoadNote" class="graficos-note app-hidden"></p>
    <button type="button" id="tgRetry" class="bet-manage-btn app-hidden" style="margin:0.6rem 1.1rem 0;">Tentar de novo</button>
    <div id="tgMain" class="app-hidden">
      <section class="card-shell graficos-section" aria-label="Telegram">
        <div class="section-heading" style="padding:0 0 0.6rem;">
          <div>
            <h2>📨 Telegram</h2>
            <p>Horários que os canais marcados mandam e quanto eles acertam, cruzando com as suas apostas registradas.</p>
          </div>
        </div>
        <div id="tgStatus" class="tg-status" role="status"></div>
        <p id="tgLiveNote" class="graficos-note graficos-note-warn app-hidden"></p>
        <div id="tgViews" class="plan-chips tg-views" role="group" aria-label="Tela"></div>
      </section>
      <section id="tgPanel" class="card-shell graficos-section" aria-live="polite"></section>
    </div>
  `;
  const retry = $('tgRetry');
  if (retry) retry.addEventListener('click', () => loadData(true));
}

function renderLoadState() {
  const note = $('tgLoadNote');
  const retry = $('tgRetry');
  const main = $('tgMain');
  if (!note || !retry || !main) return;
  let msg = '';
  if (loadStatus === 'loading') msg = 'Carregando Telegram…';
  if (loadStatus === 'error') msg = 'Não foi possível carregar os canais e os horários do Telegram. Verifique a internet e tente de novo.';
  note.textContent = msg;
  note.classList.toggle('app-hidden', !msg);
  note.classList.toggle('graficos-note-warn', loadStatus === 'error');
  retry.classList.toggle('app-hidden', loadStatus !== 'error');
  main.classList.toggle('app-hidden', loadStatus !== 'ok');
}

function periodFrom() {
  return periodRange(ui.period, todayKey()).fromKey;
}

async function loadData(force = false) {
  const uid = state.currentUid;
  const token = ++loadToken;
  loadStatus = 'loading';
  renderLoadState();
  try {
    if (force || !isSourcesLoaded(uid)) await loadSources(uid);
    if (token !== loadToken || !mounted) return;
    await loadDays(uid, periodFrom());
  } catch (err) {
    if (token !== loadToken || !mounted) return;
    console.error('Telegram: carga falhou:', err);
    loadStatus = 'error';
    renderLoadState();
    return;
  }
  if (token !== loadToken || !mounted) return;
  loadStatus = 'ok';
  renderLoadState();
  startLive();
  renderAll();
}

// ---------- ao vivo ----------

function stopLive() {
  unsubs.forEach(u => { try { u(); } catch (e) { /* já desligado */ } });
  unsubs = [];
  watchedDay = null;
}

function startLive() {
  stopLive();
  const uid = state.currentUid;
  const t = todayKey();
  watchedDay = t;
  liveError = '';
  const fail = () => {
    liveError = 'A atualização ao vivo falhou (internet?). Os dados podem estar atrasados — saia e volte na aba.';
    renderLiveNote();
  };
  try {
    unsubs.push(watchDialogs(uid, d => { dialogsDoc = d; if (mounted) { renderStatus(); if (ui.view === 'canais' && !busy) renderPanel(); } }, fail));
    unsubs.push(watchFeed(uid, t, docs => { feedDocs = docs; if (mounted && ui.view === 'hoje') renderPanel(); }, fail));
    unsubs.push(watchDay(uid, t, d => { todayDoc = d; if (mounted && !busy && ui.view !== 'canais') renderPanel(); }, fail));
  } catch (err) {
    console.error('Telegram: ao vivo não iniciou:', err);
    fail();
  }
  if (tickTimer) clearInterval(tickTimer);
  // A cada minuto: situação do bot e "agora/em breve" dos horários.
  tickTimer = setInterval(() => {
    if (!mounted) return;
    if (watchedDay !== todayKey()) { refreshTelegram(); return; }
    renderStatus();
    if (ui.view === 'hoje' && !busy) renderPanel();
  }, 60000);
}

function renderLiveNote() {
  const n = $('tgLiveNote');
  if (!n) return;
  n.textContent = liveError;
  n.classList.toggle('app-hidden', !liveError);
}

function renderStatus() {
  const box = $('tgStatus');
  if (!box) return;
  box.replaceChildren();
  const st = botStatus(dialogsDoc, Date.now());
  const n = Object.values(getSources()).filter(s => s.active).length;
  let txt;
  let cls;
  if (st.state === 'ok') {
    cls = 'tg-status-ok';
    txt = `🟢 Bot ativo · sinal há ${st.minutes} min · lendo ${n} canal(is)`;
  } else if (st.state === 'down') {
    cls = 'tg-status-down';
    const hb = new Date(dialogsDoc.heartbeatAt);
    txt = `🔴 Bot sem sinal desde ${dayLabel(toDayKey(hb))} ${hhmm(dialogsDoc.heartbeatAt)} — confira a máquina (journalctl -u telegram-bot).`;
  } else {
    cls = 'tg-status-never';
    txt = '⚪ O bot ainda não conectou. Siga o LEIA-ME do bot (máquina e2-micro) — depois disso a lista de canais aparece em ⚙️ Canais.';
  }
  box.className = `tg-status ${cls}`;
  box.appendChild(el('span', '', txt));
  if (dialogsDoc && Number.isFinite(Number(dialogsDoc.rawKeepDays)) && Number(dialogsDoc.rawKeepDays) > 0) {
    box.appendChild(el('span', 'tg-status-sub', `Calibração ligada: textos guardados por ${dialogsDoc.rawKeepDays} dia(s).`));
  }
}

// ---------- desenho ----------

function renderAll() {
  if (!mounted || loadStatus !== 'ok') return;
  renderStatus();
  renderLiveNote();
  const views = $('tgViews');
  if (views) {
    views.replaceChildren();
    VIEWS.forEach(v => views.appendChild(chip(v.label, ui.view === v.id, () => {
      if (busy) return;
      if (ui.view === 'canais' && v.id !== 'canais' && ui.drafts.size) {
        showAppConfirm('Descartar as alterações não salvas dos canais?').then(ok => {
          if (!ok) return;
          ui.drafts.clear();
          ui.view = v.id;
          renderAll();
        });
        return;
      }
      ui.view = v.id;
      renderAll();
    })));
  }
  renderPanel();
}

function renderPanel() {
  const panel = $('tgPanel');
  if (!panel || !mounted || loadStatus !== 'ok') return;
  panel.replaceChildren();
  if (ui.view === 'hoje') renderHoje(panel);
  else if (ui.view === 'acerto') renderAcerto(panel);
  else renderCanais(panel);
}

// Dias para a conta: cache + o de hoje ao vivo (mais novo).
function currentDays() {
  const t = todayKey();
  const list = getDays().filter(d => d.day !== t);
  if (todayDoc) list.push({ ...todayDoc, day: t });
  return list;
}

function statusChip(s) {
  const info = STATUS[s.status] || STATUS.untested;
  const c = el('span', `tg-time tg-st-${s.status}${s.excluded ? ' tg-time-excluded' : ''}`, `${info.icon} ${s.t}`);
  let tip = s.excluded ? 'Excluído da conta' : info.label;
  if (s.bets) tip += ` · ${s.bets} aposta(s) · R.B. ${money(s.rbC)}`;
  c.title = tip;
  return c;
}

// ---------- 📨 HOJE ----------

function renderHoje(panel) {
  const t = todayKey();
  const sources = getSources();
  const nowMs = Date.now();
  const head = el('div', 'section-heading tg-head');
  const hb = el('div');
  hb.appendChild(el('h2', '', `📨 Hoje · ${dayLabel(t)}`));
  hb.appendChild(el('p', '', 'Ao vivo. Cada horário vale do minuto dele até + a janela do canal. ✅ acerto · ❌ erro · ➖ empate · ⚪ sem aposta · ⏳ agora · 🕒 em breve.'));
  head.appendChild(hb);
  panel.appendChild(head);

  // Filtro de canal (todas as opções na tela).
  const feed = sortFeed(feedDocs);
  const chats = new Map();
  feed.forEach(d => chats.set(String(d.chatId), (sources[String(d.chatId)] || {}).title || d.title || String(d.chatId)));
  if (ui.hojeChat && !chats.has(ui.hojeChat)) ui.hojeChat = null;
  if (chats.size > 1) {
    const f = el('div', 'plan-chips tg-pad');
    f.setAttribute('role', 'group');
    f.setAttribute('aria-label', 'Canal');
    f.appendChild(chip('Todos', !ui.hojeChat, () => { ui.hojeChat = null; renderPanel(); }));
    chats.forEach((title, id) => f.appendChild(chip(title, ui.hojeChat === id, () => { ui.hojeChat = id; renderPanel(); })));
    panel.appendChild(f);
  }

  // Placar do dia + próximos horários.
  const r = computeAcerto({ days: todayDoc ? [{ ...todayDoc, day: t }] : [], sources, platforms: state.platforms, range: { fromKey: t, toKey: t }, chatFilter: ui.hojeChat, nowMs });
  const grid = el('div', 'gr-stats tg-pad');
  grid.appendChild(stat('Horários hoje', String(r.totals.signals)));
  grid.appendChild(stat('Testados', `${r.totals.tested}`));
  grid.appendChild(stat('Acertos', r.totals.tested ? `${r.totals.hits} (${pct(r.totals.hitRate)})` : '—'));
  grid.appendChild(stat('Dentro dos horários', r.totals.inside.bets ? `${pct(r.totals.insideRet, true)} · ${r.totals.inside.bets} aposta(s)` : '—', signCls(r.totals.insideRet)));
  grid.appendChild(stat('Fora dos horários', r.totals.outside.bets ? `${pct(r.totals.outsideRet, true)} · ${r.totals.outside.bets} aposta(s)` : '—', signCls(r.totals.outsideRet)));
  panel.appendChild(grid);

  const evals = new Map(); // chatId -> Map(t -> signal)
  const next = [];
  (r.byDay[0] ? r.byDay[0].rows : []).forEach(row => {
    const m = new Map();
    row.ev.signals.forEach(s => {
      m.set(s.t, s);
      if (!s.excluded && (s.status === 'upcoming' || s.status === 'live')) next.push({ ...s, title: row.title, platformId: row.platformId });
    });
    evals.set(row.chatId, m);
  });
  if (next.length) {
    next.sort((a, b) => a.startMs - b.startMs);
    const box = el('div', 'tg-next tg-pad');
    box.appendChild(el('span', 'plan-label', '⏭ Próximos horários'));
    const list = el('div', 'tg-times');
    next.slice(0, 8).forEach(s => {
      const c = statusChip(s);
      c.textContent = `${STATUS[s.status].icon} ${s.t} · ${s.title}`;
      c.title = `${s.title} → ${platformName(s.platformId)}`;
      list.appendChild(c);
    });
    box.appendChild(list);
    panel.appendChild(box);
  }

  // Mensagens.
  const list = el('div', 'tg-feed tg-pad');
  const shown = feed.filter(d => !ui.hojeChat || String(d.chatId) === ui.hojeChat);
  if (!shown.length) {
    const active = Object.values(sources).filter(s => s.active).length;
    list.appendChild(el('div', 'history-empty', active
      ? 'Nenhuma mensagem hoje dos canais marcados (ainda).'
      : 'Nenhum canal marcado. Vá em ⚙️ Canais e ligue os canais que valem.'));
  }
  shown.forEach(d => list.appendChild(feedCard(d, sources, evals, t)));
  panel.appendChild(list);
}

function feedCard(d, sources, evals, t) {
  const chatId = String(d.chatId);
  const src = sources[chatId];
  const card = el('article', 'tg-msg');
  const head = el('div', 'tg-msg-head');
  const title = el('div', 'tg-msg-title');
  title.appendChild(el('span', 'tg-msg-name', (src && src.title) || d.title || chatId));
  const pid = src ? src.platformId : d.platformId;
  title.appendChild(el('span', 'tg-msg-sub', `${hhmm(d.postedAt)} · ${platformName(pid)}${d.edited ? ' · ✏️ editada' : ''}${src && !src.active ? ' · canal desligado' : ''}`));
  head.appendChild(title);
  const del = button('🗑', 'tg-icon-btn', () => onDeleteMessage(d));
  del.setAttribute('aria-label', 'Excluir mensagem');
  del.title = 'Excluir mensagem (e tirar os horários dela da conta)';
  head.appendChild(del);
  card.appendChild(head);

  const slots = Array.isArray(d.slots) ? d.slots.filter(s => s && s.day && s.t) : [];
  if (slots.length) {
    const times = el('div', 'tg-times');
    const m = evals.get(chatId) || new Map();
    const excluded = !!(todayDoc && todayDoc.excluded && todayDoc.excluded[`${chatId}_${d.msgId}`] === true);
    slots.forEach(s => {
      if (s.day !== t) {
        times.appendChild(el('span', 'tg-time tg-st-upcoming', `🕒 ${s.t} (${dayLabel(s.day)})`));
        return;
      }
      const ev = m.get(s.t);
      times.appendChild(statusChip(ev ? { ...ev, excluded: excluded || ev.excluded } : { t: s.t, status: 'untested', excluded }));
    });
    card.appendChild(times);
    card.appendChild(el('p', 'tg-msg-count', `${slots.length} horário(s) · janela de ${sourceWindow(sources, chatId)} min${excluded ? ' · fora da conta' : ''}`));
  } else {
    card.appendChild(el('p', 'tg-msg-count', 'Sem horários (não entra na conta).'));
  }

  const links = Array.isArray(d.links) ? d.links.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)) : [];
  if (links.length) {
    const lb = el('div', 'tg-links');
    links.slice(0, 10).forEach(u => {
      const a = el('a', 'tg-link', shortUrl(u));
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      lb.appendChild(a);
    });
    card.appendChild(lb);
  }
  if (d.text) {
    const det = el('details', 'tg-text');
    det.appendChild(el('summary', '', 'Ver mensagem'));
    det.appendChild(el('pre', 'tg-pre', String(d.text)));
    card.appendChild(det);
  }
  return card;
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    const p = x.pathname.length > 18 ? `${x.pathname.slice(0, 18)}…` : x.pathname;
    return `🔗 ${x.hostname}${p === '/' ? '' : p}`;
  } catch (e) {
    return `🔗 ${u.slice(0, 30)}`;
  }
}

async function onDeleteMessage(d) {
  if (busy) return;
  const n = Array.isArray(d.slots) ? d.slots.length : 0;
  const ok = await showAppConfirm(`Excluir esta mensagem de "${d.title || d.chatId}"?${n ? ` Os ${n} horário(s) dela saem da métrica de acerto (dá pra voltar a contar em 📈 Acerto → dia).` : ''}`);
  if (!ok || !mounted) return;
  busy = true;
  try {
    const res = await deleteFeedMessage(state.currentUid, d);
    if (!res.ok) { await showAppAlert(res.error); return; }
    feedDocs = feedDocs.filter(x => x.id !== d.id);
  } finally {
    busy = false;
    if (mounted) renderPanel();
  }
}

// ---------- 📈 ACERTO ----------

async function ensureDays() {
  const from = periodFrom();
  const cur = getDaysFrom();
  if (cur && cur <= from) return true;
  busy = true;
  try {
    await loadDays(state.currentUid, from);
    return true;
  } catch (err) {
    console.error('Telegram: dias não carregados:', err);
    await showAppAlert('Não foi possível carregar o histórico desse período. Verifique a internet e tente de novo.');
    return false;
  } finally {
    busy = false;
  }
}

function renderAcerto(panel) {
  const t = todayKey();
  const sources = getSources();
  const range = periodRange(ui.period, t);
  const days = currentDays();

  const head = el('div', 'section-heading tg-head');
  const hb = el('div');
  hb.appendChild(el('h2', '', '📈 Acerto dos canais'));
  hb.appendChild(el('p', '', 'Testado = você tem aposta registrada na plataforma do canal dentro da janela do horário. Acerto = R.B. da janela positivo. Dentro × fora compara o retorno (R.B. ÷ apostado) das apostas nos horários com as de fora, nos dias em que o canal mandou horários.'));
  head.appendChild(hb);
  panel.appendChild(head);

  // Filtros.
  const fPeriod = el('div', 'plan-field');
  fPeriod.appendChild(el('span', 'plan-label', 'Período'));
  const pc = el('div', 'plan-chips');
  PERIODS.forEach(p => pc.appendChild(chip(p.label, ui.period === p.id, async () => {
    if (busy) return;
    ui.period = p.id;
    ui.openDays.clear();
    if (await ensureDays()) renderPanel();
  })));
  fPeriod.appendChild(pc);
  fPeriod.appendChild(el('p', 'plan-hint', ui.period === 'all' ? 'Todo o histórico guardado.' : `${dayLabel(range.fromKey)} a ${dayLabel(range.toKey)}.`));
  panel.appendChild(fPeriod);

  // Canais e plataformas que aparecem no período (+ marcados).
  const chatOpts = new Map();
  const platOpts = new Set();
  days.filter(d => d.day >= range.fromKey && d.day <= range.toKey).forEach(d => daySignals(d, sources).forEach(s => {
    chatOpts.set(s.chatId, s.title || s.chatId);
    if (s.platformId) platOpts.add(s.platformId);
  }));
  Object.entries(sources).forEach(([id, s]) => { if (s.active) { chatOpts.set(id, s.title || id); if (s.platformId) platOpts.add(s.platformId); } });
  if (ui.chat && !chatOpts.has(ui.chat)) ui.chat = null;
  if (ui.platform && !platOpts.has(ui.platform)) ui.platform = null;

  const fChat = el('div', 'plan-field');
  fChat.appendChild(el('span', 'plan-label', 'Canal'));
  const cc = el('div', 'plan-chips');
  cc.appendChild(chip('Todos', !ui.chat, () => { ui.chat = null; renderPanel(); }));
  [...chatOpts.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, title]) => cc.appendChild(chip(title, ui.chat === id, () => { ui.chat = id; renderPanel(); })));
  fChat.appendChild(cc);
  panel.appendChild(fChat);

  if (platOpts.size) {
    const fPlat = el('div', 'plan-field');
    fPlat.appendChild(el('span', 'plan-label', 'Plataforma'));
    const plc = el('div', 'plan-chips');
    plc.appendChild(chip('Todas', !ui.platform, () => { ui.platform = null; renderPanel(); }));
    [...platOpts].map(id => [id, platformName(id)]).sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([id, name]) => plc.appendChild(chip(name, ui.platform === id, () => { ui.platform = id; renderPanel(); })));
    fPlat.appendChild(plc);
    panel.appendChild(fPlat);
  }

  const r = computeAcerto({ days, sources, platforms: state.platforms, range, chatFilter: ui.chat, platformFilter: ui.platform, nowMs: Date.now() });
  const T = r.totals;
  const grid = el('div', 'gr-stats tg-pad');
  grid.appendChild(stat('% de acerto', pct(T.hitRate), T.hitRate === null ? '' : (T.hitRate >= 0.5 ? 'gr-pos-v' : 'gr-neg')));
  grid.appendChild(stat('Acertos / testados', `${T.hits} / ${T.tested}`));
  grid.appendChild(stat('Erros · empates', `${T.misses} · ${T.even}`));
  grid.appendChild(stat('Horários', `${T.signals}${T.pending ? ` (${T.pending} a vir)` : ''}`));
  grid.appendChild(stat('Sem aposta', String(T.untested)));
  grid.appendChild(stat('Dentro dos horários', T.inside.bets ? `${pct(T.insideRet, true)} · ${money(T.inside.rbC)}` : '—', signCls(T.insideRet)));
  grid.appendChild(stat('Fora dos horários', T.outside.bets ? `${pct(T.outsideRet, true)} · ${money(T.outside.rbC)}` : '—', signCls(T.outsideRet)));
  grid.appendChild(stat('Apostas dentro · fora', `${T.inside.bets} · ${T.outside.bets}`));
  panel.appendChild(grid);
  if (T.inside.bets && T.outside.bets) {
    const diff = T.insideRet - T.outsideRet;
    panel.appendChild(el('p', 'plan-hint tg-pad', diff > 0
      ? `Nos horários dos canais o retorno foi ${pp(diff)} MELHOR que fora deles, no período.`
      : (diff < 0 ? `Nos horários dos canais o retorno foi ${pp(-diff)} PIOR que fora deles, no período.` : 'Mesmo retorno dentro e fora dos horários.')));
  }

  // Ranking dos canais.
  panel.appendChild(el('h3', 'tg-sub-h', '🏅 Canais'));
  const rank = el('div', 'gr-ranking');
  if (!r.bySource.length) rank.appendChild(el('div', 'history-empty', 'Nenhum horário no período com esses filtros.'));
  r.bySource.forEach((s, i) => {
    const row = el('div', 'gr-row');
    const h = el('div', 'gr-row-head');
    h.appendChild(el('span', 'gr-pos', s.hitRate === null ? '·' : (['🥇', '🥈', '🥉'][i] || `${i + 1}º`)));
    const nb = el('span', 'gr-name-box');
    nb.appendChild(el('span', 'gr-name', s.title || s.chatId));
    nb.appendChild(el('span', 'gr-sub', `${platformName(s.platformId)} · ${s.hits}/${s.tested} testados · ${s.signals} horário(s) em ${s.days} dia(s)`));
    nb.appendChild(el('span', 'gr-sub', `Dentro ${pct(ret(s.inside), true)} × fora ${pct(ret(s.outside), true)}${s.platformMissing ? ' · ⚠ sem plataforma em algum dia' : ''}`));
    h.appendChild(nb);
    h.appendChild(el('span', `gr-value ${s.hitRate !== null && s.hitRate < 0.5 ? 'gr-neg' : ''}`, pct(s.hitRate)));
    row.appendChild(h);
    rank.appendChild(row);
  });
  panel.appendChild(rank);

  // Histórico por dia.
  panel.appendChild(el('h3', 'tg-sub-h', '🗓 Dia a dia'));
  const dl = el('div', 'tg-days tg-pad');
  if (!r.byDay.length) dl.appendChild(el('div', 'history-empty', 'Sem dias com horários no período.'));
  r.byDay.forEach(d => dl.appendChild(dayBlock(d, days.find(x => x.day === d.day))));
  panel.appendChild(dl);
}

function dayBlock(d, dayDoc) {
  const det = el('details', 'tg-day');
  if (ui.openDays.has(d.day)) det.open = true;
  det.addEventListener('toggle', () => { if (det.open) ui.openDays.add(d.day); else ui.openDays.delete(d.day); });
  const tot = d.rows.reduce((a, r) => ({
    s: a.s + r.counts.signals, t: a.t + r.counts.tested, h: a.h + r.counts.hits,
    x: a.x + r.ev.signals.filter(s => s.excluded).length
  }), { s: 0, t: 0, h: 0, x: 0 });
  det.appendChild(el('summary', 'tg-day-sum', `${dayLabel(d.day)} · ${tot.s} horário(s) · ${tot.h}/${tot.t} acerto(s)${tot.x ? ` · ${tot.x} fora da conta` : ''}`));
  const body = el('div', 'tg-day-body');
  const excluded = (dayDoc && dayDoc.excluded) || {};
  d.rows.forEach(row => {
    const box = el('div', 'tg-day-src');
    box.appendChild(el('div', 'tg-msg-name', `${row.title || row.chatId} · ${platformName(row.platformId)}`));
    const times = el('div', 'tg-times');
    row.ev.signals.forEach(s => times.appendChild(statusChip(s)));
    box.appendChild(times);
    // Mensagens do canal no dia: excluir / voltar a contar.
    const msgs = new Map();
    row.times.forEach(x => x.msgIds.forEach(id => msgs.set(id, (msgs.get(id) || 0) + 1)));
    const ml = el('div', 'tg-day-msgs');
    [...msgs.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([msgId, n]) => {
      const isEx = excluded[`${row.chatId}_${msgId}`] === true;
      const line = el('div', 'tg-day-msg');
      line.appendChild(el('span', '', `Mensagem ${msgId} · ${n} horário(s)${isEx ? ' · fora da conta' : ''}`));
      line.appendChild(button(isEx ? '↩️ Voltar a contar' : '🚫 Tirar da conta', 'plan-chip plan-chip-ghost', () => onToggleExcluded(d.day, row.chatId, msgId, !isEx)));
      ml.appendChild(line);
    });
    box.appendChild(ml);
    body.appendChild(box);
  });
  body.appendChild(button('🗑 Excluir este dia do histórico', 'plan-chip tg-danger', () => onDeleteDay(d.day)));
  det.appendChild(body);
  return det;
}

async function onToggleExcluded(day, chatId, msgId, excluded) {
  if (busy) return;
  if (excluded && !(await showAppConfirm(`Tirar os horários da mensagem ${msgId} (${dayLabel(day)}) da conta de acerto?`))) return;
  if (!mounted) return;
  busy = true;
  try {
    const res = await setExcluded(state.currentUid, day, chatId, msgId, excluded);
    if (!res.ok) await showAppAlert(res.error);
    else if (todayDoc && todayDoc.day === day) todayDoc = { ...todayDoc, excluded: { ...(todayDoc.excluded || {}), [`${chatId}_${msgId}`]: excluded } };
  } finally {
    busy = false;
    if (mounted) renderPanel();
  }
}

async function onDeleteDay(day) {
  if (busy) return;
  const ok = await showAppConfirm(`Excluir DE VEZ os horários de ${dayLabel(day)} (todos os canais)? Esse dia some da métrica de acerto. Suas apostas não mudam.`);
  if (!ok || !mounted) return;
  busy = true;
  try {
    const res = await deleteDay(state.currentUid, day);
    if (!res.ok) { await showAppAlert(res.error); return; }
    if (todayDoc && todayDoc.day === day) todayDoc = null;
    ui.openDays.delete(day);
  } finally {
    busy = false;
    if (mounted) renderPanel();
  }
}

// ---------- ⚙️ CANAIS ----------

function draftOf(id, source) {
  if (ui.drafts.has(id)) return ui.drafts.get(id);
  return {
    active: !!(source && source.active),
    platformId: (source && source.platformId) || null,
    windowMin: source ? source.windowMin : DEFAULT_WINDOW
  };
}

function isDirty(id, source) {
  if (!ui.drafts.has(id)) return false;
  const d = ui.drafts.get(id);
  const s = draftOf('__none__', source);
  return d.active !== s.active || d.platformId !== s.platformId || d.windowMin !== s.windowMin;
}

function setDraft(id, source, patch) {
  const next = { ...draftOf(id, source), ...patch };
  ui.drafts.set(id, next);
  if (!isDirty(id, source)) ui.drafts.delete(id);
  renderPanel();
}

function renderCanais(panel) {
  const sources = getSources();
  const head = el('div', 'section-heading tg-head');
  const hb = el('div');
  hb.appendChild(el('h2', '', '⚙️ Canais'));
  hb.appendChild(el('p', '', 'Ligue só os canais que valem. O bot lê apenas os ligados — conversas privadas nunca são lidas. Escolha a plataforma de cada canal (é onde as apostas são cruzadas) e a janela de cada horário.'));
  head.appendChild(hb);
  panel.appendChild(head);

  const all = mergeChannelList(dialogsDoc, sources);
  if (!all.length) {
    panel.appendChild(el('div', 'history-empty tg-pad', 'O bot ainda não mandou a lista de canais. Assim que ele conectar, eles aparecem aqui.'));
  } else {
    const sr = el('div', 'plan-field');
    const inp = el('input', 'plan-input');
    inp.type = 'search';
    inp.placeholder = 'Buscar canal';
    inp.setAttribute('aria-label', 'Buscar canal');
    inp.value = ui.search;
    inp.addEventListener('input', () => {
      ui.search = inp.value;
      const pos = inp.selectionStart;
      renderPanel();
      const again = rootEl && rootEl.querySelector('.tg-search');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ok */ } }
    });
    inp.classList.add('tg-search');
    sr.appendChild(inp);
    panel.appendChild(sr);

    const q = ui.search.trim().toLowerCase();
    const list = el('div', 'tg-chan-list tg-pad');
    const shown = all.filter(c => !q || c.title.toLowerCase().includes(q));
    if (!shown.length) list.appendChild(el('div', 'history-empty', 'Nenhum canal com esse nome.'));
    shown.forEach(c => list.appendChild(channelRow(c)));
    panel.appendChild(list);
  }

  // Calibração.
  const cal = el('div', 'plan-field');
  cal.appendChild(el('span', 'plan-label', '📋 Calibração do filtro'));
  cal.appendChild(el('p', 'plan-hint', 'Na semana de teste o bot guarda os textos. Copie e cole no chat do projeto pra ajustar o filtro de horários.'));
  cal.appendChild(button('📋 Copiar textos (calibração)', 'bet-manage-btn', onCopyCalibration));
  const out = el('textarea', 'plan-input tg-cal-out app-hidden');
  out.id = 'tgCalOut';
  out.readOnly = true;
  out.rows = 6;
  cal.appendChild(out);
  panel.appendChild(cal);
}

function channelRow(c) {
  const src = c.source;
  const d = draftOf(c.id, src);
  const dirty = isDirty(c.id, src);
  const row = el('div', `tg-chan${d.active ? ' tg-chan-on' : ''}${dirty ? ' tg-chan-dirty' : ''}`);
  const top = el('div', 'tg-chan-top');
  const nb = el('div', 'tg-chan-name');
  nb.appendChild(el('span', 'tg-msg-name', `${c.kind === 'group' ? '👥' : '📢'} ${c.title}`));
  if (c.missing) nb.appendChild(el('span', 'tg-msg-sub', '⚠ o bot não encontra mais este canal (saiu dele?)'));
  else if (src && src.active) nb.appendChild(el('span', 'tg-msg-sub', `Lendo · ${platformName(src.platformId)} · janela ${src.windowMin} min`));
  top.appendChild(nb);
  top.appendChild(chip(d.active ? '✅ Ligado' : 'Desligado', d.active, () => setDraft(c.id, src, { active: !d.active })));
  row.appendChild(top);

  if (d.active || src) {
    const ctl = el('div', 'tg-chan-ctl');
    const sel = el('select', 'plan-input tg-chan-sel');
    sel.setAttribute('aria-label', `Plataforma de ${c.title}`);
    const none = el('option', '', '— sem plataforma —');
    none.value = '';
    sel.appendChild(none);
    [...state.platforms].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
      const o = el('option', '', p.name);
      o.value = p.id;
      sel.appendChild(o);
    });
    sel.value = d.platformId && state.platforms.some(p => p.id === d.platformId) ? d.platformId : '';
    sel.addEventListener('change', () => setDraft(c.id, src, { platformId: sel.value || null }));
    ctl.appendChild(sel);
    const wc = el('div', 'plan-chips');
    wc.setAttribute('role', 'group');
    wc.setAttribute('aria-label', 'Janela');
    WINDOW_OPTIONS.forEach(w => wc.appendChild(chip(`${w} min`, d.windowMin === w, () => setDraft(c.id, src, { windowMin: w }))));
    ctl.appendChild(wc);
    row.appendChild(ctl);
    if (d.active && !d.platformId) row.appendChild(el('p', 'plan-hint', 'Sem plataforma, os horários aparecem mas não dá pra medir acerto.'));
  }

  const act = el('div', 'tg-chan-act');
  if (dirty) {
    act.appendChild(button('Salvar', 'btn-confirm tg-btn', () => onSaveChannel(c)));
    act.appendChild(button('Desfazer', 'plan-chip plan-chip-ghost', () => { ui.drafts.delete(c.id); renderPanel(); }));
  }
  if (src && !dirty) act.appendChild(button('Remover da lista', 'plan-chip tg-danger', () => onRemoveChannel(c)));
  if (act.childNodes.length) row.appendChild(act);
  return row;
}

async function onSaveChannel(c) {
  if (busy) return;
  const d = draftOf(c.id, c.source);
  busy = true;
  try {
    const res = await saveSource(state.currentUid, c.id, { title: c.title, kind: c.kind, active: d.active, platformId: d.platformId, windowMin: d.windowMin });
    if (!res.ok) { await showAppAlert(res.error); return; }
    ui.drafts.delete(c.id);
  } finally {
    busy = false;
    if (mounted) { renderStatus(); renderPanel(); }
  }
}

async function onRemoveChannel(c) {
  if (busy) return;
  const ok = await showAppConfirm(`Remover "${c.title}" da lista? O bot para de ler este canal. Os horários que já vieram continuam no histórico de acerto.`);
  if (!ok || !mounted) return;
  busy = true;
  try {
    const res = await deleteSource(state.currentUid, c.id);
    if (!res.ok) { await showAppAlert(res.error); return; }
    ui.drafts.delete(c.id);
  } finally {
    busy = false;
    if (mounted) { renderStatus(); renderPanel(); }
  }
}

async function onCopyCalibration() {
  if (busy) return;
  busy = true;
  let text = '';
  try {
    const docs = await loadCalibrationTexts(state.currentUid);
    if (!docs.length) { await showAppAlert('Nenhum texto guardado ainda.'); return; }
    text = docs.map(d => `=== ${d.title || d.chatId} · ${d.dayKey || ''} ${hhmm(d.postedAt)} · ${(d.slots || []).length} horário(s) ===\n${d.text}`).join('\n\n');
  } catch (err) {
    console.error('Telegram: textos não lidos:', err);
    await showAppAlert('Não foi possível ler os textos. Verifique a internet e tente de novo.');
    return;
  } finally {
    busy = false;
  }
  if (!mounted) return;
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (e) { copied = false; }
  const out = $('tgCalOut');
  if (out) {
    out.value = text;
    out.classList.remove('app-hidden');
    if (!copied) { out.focus(); out.select(); }
  }
  await showAppAlert(copied ? 'Textos copiados. Cole no chat do projeto.' : 'Não deu pra copiar sozinho: os textos estão na caixa abaixo — segure e copie.');
}

// ---------- API pública (view-graficos.js) ----------

export function mountTelegram(root) {
  if (!root) return;
  unmountTelegram();
  rootEl = root;
  mounted = true;
  renderSkeleton();
  renderLoadState();
  loadData(false);
}

// Volta pra aba / virada do dia: religa o ao vivo no dia certo e redesenha.
export function refreshTelegram() {
  if (!mounted || loadStatus !== 'ok' || busy) return;
  if (watchedDay !== todayKey()) {
    feedDocs = [];
    todayDoc = null;
    loadDays(state.currentUid, periodFrom()).catch(err => console.warn('Telegram: dias não recarregados.', err));
    startLive();
  }
  renderAll();
}

export function unmountTelegram() {
  loadToken++;
  stopLive();
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  mounted = false;
  rootEl = null;
  busy = false;
  dialogsDoc = null;
  feedDocs = [];
  todayDoc = null;
  liveError = '';
  if (loadStatus === 'loading') loadStatus = 'idle';
}
