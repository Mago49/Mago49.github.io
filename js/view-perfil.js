// === VIEW: Perfil (🪪) — Histórico Geral (A1) + Sair ===
// Histórico é SÓ CONSULTA e SÓ LEITURA: visão derivada dos dados que já
// existem (ver history-feed-logic.js). Nenhuma escrita no Firestore, nenhum
// scheduleDailySnapshot. As únicas leituras são as mesmas duas que VIP e
// Financeiro já fazem (valor do Obrigado + templates do Misterioso), pra
// resolver o ctx dos bônus de fórmula.
//
// Navegação: seletor de data (dia/mês/ano), setas ◀ ▶ (±1 dia), "Pular N
// dias" com ◀ ▶, botão Hoje e busca por plataforma. Abre SEMPRE em hoje.
// Recalcula ao montar e na virada do dia; se o usuário estiver vendo
// "hoje" na virada, acompanha pro novo dia.
//
// Estado de módulo é resetado a cada mount() (SPA). O timer da virada do
// dia é limpo no unmount() (Bloco K2). Um token de montagem evita que uma
// leitura assíncrona que termina DEPOIS do unmount renderize num DOM que
// já não existe.
//
// === (Sub-entrega F) ===
// a) Obrigado/Misterioso vêm de loadBonusContextStrict
//    (bonus-context-store.js), mesma leitura do Financeiro/Gráficos. Antes
//    vinham dos loaders tolerantes: numa falha de leitura o histórico
//    mostrava bônus calculados com 0,30 e sem Misterioso, sem avisar. Agora
//    a falha fica explícita: nota no topo do histórico e Obrigado/Misterioso
//    entram como 0 (nada inventado). A tela continua só leitura.
// b) Os valores só são aplicados DEPOIS de conferir o mountToken (antes eram
//    atribuídos antes da checagem).
// c) "Sair da conta": falha do signOut agora avisa em vez de ficar muda.
//
// === (Sub-entrega 10) BACKUP E TAMANHO DOS DADOS ===
// O botão abre o mini-contêiner de ui-backup.js (Completo / Só o novo,
// limite por arquivo, conferência, tamanho real no Firestore e partes).
// Status: data do último backup lida do banco (meta/backupInfo, leitura
// tolerante — falhou, usa a lembrança deste aparelho como antes).
// Aviso de tamanho: estimativa LOCAL das plataformas em memória (sem
// leitura extra) contra o limite de 1 MB por documento do Firestore.
// Única gravação continua sendo a do backup (meta/backupInfo), no
// próprio ui-backup/backup-store.

import { auth, signOut } from './firebase-init.js';
import { state } from './state.js';
import { showAppAlert, showAppConfirm, formatCurrency, escapeHtml } from './utils.js';
import { loadBonusContextStrict } from './bonus-context-store.js';
import { buildDayFeed, toLocalDayKey, shiftDayKey } from './history-feed-logic.js';
import { loadBackupInfo } from './backup-store.js';
import { openBackupPanel } from './ui-backup.js';
import { estimatePlatformSizes, formatPct, formatBytes } from './backup-logic.js';

// Último backup gerado NESTE navegador — só uma conveniência de tela
// (lembrar a rotina semanal). localStorage pode falhar/estar vazio:
// sempre dentro de try/catch e a tela funciona igual sem ele.
const LAST_BACKUP_KEY = 'painelUltimoBackup';

function readLastBackupInfo() {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLastBackupInfo(info) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(info));
  } catch (e) {
    // sem armazenamento disponível — só não mostra "último backup"
  }
}

function fmtBackupWhen(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function describeLastBackup(dbInfo = null) {
  // (Sub-entrega 10) Registro do banco (vale pra qualquer aparelho).
  if (dbInfo) {
    if (!dbInfo.lastAt) return 'Nenhum backup registrado ainda.';
    const parts = [`Último completo: ${dbInfo.lastFullAt ? fmtBackupWhen(dbInfo.lastFullAt) : 'nenhum'}.`];
    if (dbInfo.lastMode === 'diff') parts.push(`Último "Só o novo": ${fmtBackupWhen(dbInfo.lastAt)}.`);
    return parts.join(' ');
  }
  const info = readLastBackupInfo();
  if (!info || !info.exportedAt) return 'Nenhum backup gerado neste aparelho ainda.';
  return `Último backup neste aparelho: ${fmtBackupWhen(info.exportedAt)}.`;
}

// (Sub-entrega 10) Estimativa local do tamanho das plataformas.
function renderSizeNote() {
  const el = document.getElementById('perfilSizeNote');
  if (!el) return;
  const sizes = estimatePlatformSizes(state.currentUid, state.platforms);
  if (!sizes.length) { el.textContent = ''; el.classList.add('app-hidden'); return; }
  const top = sizes[0];
  const risky = sizes.filter(x => x.level !== 'ok');
  el.classList.remove('app-hidden');
  el.classList.toggle('perfil-size-warn', risky.length > 0);
  el.textContent = risky.length
    ? `⚠ ${risky.length} plataforma(s) perto do limite de 1 MB do Firestore — maior: ${top.name} com ${formatPct(top.pct)} (estimativa). Gere o backup pra ver o tamanho exato.`
    : `Maior plataforma: ${top.name} · ${formatBytes(top.bytes)} · ${formatPct(top.pct)} do limite de 1 MB por documento (estimativa).`;
}

let dailyTimer = null;
let mountToken = 0;
let selectedDayKey = null;
let searchTerm = '';
let skipDays = 7;
let obrigadoValuePerAppearance = 0;
let misteriosoTemplates = [];

function resolveCtxForPlatform(platform) {
  return {
    obrigadoValuePerAppearance,
    misteriosoTemplate: misteriosoTemplates.find(t => (t.platformIds || []).includes(platform.id)) || null
  };
}

function todayKey() {
  return toLocalDayKey(new Date());
}

function clampToToday(dayKey) {
  const t = todayKey();
  return dayKey > t ? t : dayKey;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function scheduleDailyUpdate() {
  if (dailyTimer) clearTimeout(dailyTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const wasFollowingToday = selectedDayKey === toLocalDayKey(now);
  dailyTimer = setTimeout(() => {
    if (wasFollowingToday) selectedDayKey = todayKey();
    syncControls();
    renderFeed();
    scheduleDailyUpdate();
  }, nextMidnight - now);
}

function syncControls() {
  const dateInput = document.getElementById('histDateInput');
  const label = document.getElementById('histDayLabel');
  const nextBtn = document.getElementById('histNextBtn');
  const skipNextBtn = document.getElementById('histSkipNextBtn');
  const todayBtn = document.getElementById('histTodayBtn');
  const isToday = selectedDayKey === todayKey();

  if (dateInput) { dateInput.max = todayKey(); dateInput.value = selectedDayKey; }
  if (label) label.textContent = formatDayLabel(selectedDayKey) + (isToday ? ' · Hoje' : '');
  if (nextBtn) nextBtn.disabled = isToday;
  if (skipNextBtn) skipNextBtn.disabled = isToday;
  if (todayBtn) todayBtn.disabled = isToday;
}

function goToDay(dayKey) {
  selectedDayKey = clampToToday(dayKey);
  syncControls();
  renderFeed();
}

function renderFeed() {
  const listEl = document.getElementById('histList');
  const summaryEl = document.getElementById('histSummary');
  if (!listEl) return;

  const q = searchTerm.trim().toLowerCase();
  const all = buildDayFeed(state.platforms, selectedDayKey, resolveCtxForPlatform, new Date());
  const events = q ? all.filter(e => e.platformName.toLowerCase().includes(q)) : all;

  if (summaryEl) {
    summaryEl.textContent = events.length === 1 ? '1 movimento' : `${events.length} movimentos`;
  }

  if (events.length === 0) {
    listEl.innerHTML = `<div class="finance-empty">${q ? 'Nenhum movimento dessa plataforma neste dia.' : 'Nenhum movimento neste dia.'}</div>`;
    return;
  }

  listEl.innerHTML = events.map(e => {
    const valueHtml = e.value === null ? '' : `<span class="hist-value hist-value-${e.kind}">${formatCurrency(e.value)}</span>`;
    const rbHtml = (e.rb === undefined) ? '' :
      `<span class="hist-rb ${e.rb >= 0 ? 'hist-pos' : 'hist-neg'}">R.B. ${formatCurrency(e.rb)}</span>`;
    const detailHtml = e.detail ? `<span class="hist-detail">${escapeHtml(e.detail)}</span>` : '';
    const metaHtml = (detailHtml || rbHtml) ? `<div class="hist-meta">${detailHtml}${rbHtml}</div>` : '';
    return `
      <article class="hist-item">
        <span class="hist-time">${formatTime(e.ts)}</span>
        <div class="hist-body">
          <div class="hist-line">
            <span class="hist-platform">${escapeHtml(e.platformName)}</span>
            <span class="hist-label">${e.icon} ${escapeHtml(e.label)}</span>
          </div>
          ${metaHtml}
        </div>
        ${valueHtml}
      </article>`;
  }).join('');
}

function initHistoryControls() {
  const dateInput = document.getElementById('histDateInput');
  const skipInput = document.getElementById('histSkipInput');

  document.getElementById('histPrevBtn').addEventListener('click', () => goToDay(shiftDayKey(selectedDayKey, -1)));
  document.getElementById('histNextBtn').addEventListener('click', () => goToDay(shiftDayKey(selectedDayKey, 1)));
  document.getElementById('histTodayBtn').addEventListener('click', () => goToDay(todayKey()));

  dateInput.addEventListener('change', () => {
    if (dateInput.value) goToDay(dateInput.value);
    else syncControls();
  });

  skipInput.addEventListener('change', () => {
    const v = parseInt(skipInput.value, 10);
    skipDays = (!isNaN(v) && v >= 1) ? Math.min(v, 3650) : 7;
    skipInput.value = String(skipDays);
  });
  document.getElementById('histSkipPrevBtn').addEventListener('click', () => goToDay(shiftDayKey(selectedDayKey, -skipDays)));
  document.getElementById('histSkipNextBtn').addEventListener('click', () => goToDay(shiftDayKey(selectedDayKey, skipDays)));

  // Busca adiada pro próximo frame (mesmo cuidado com teclado virtual
  // já usado nas outras views); só a lista é redesenhada, então o campo
  // nunca perde o foco.
  let searchFrame = null;
  document.getElementById('histSearch').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    if (searchFrame) cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(() => { searchFrame = null; renderFeed(); });
  });
}

export async function mount(container) {
  const token = ++mountToken;
  selectedDayKey = todayKey();
  searchTerm = '';
  skipDays = 7;

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">🪪 Perfil</span>
        <h1>Perfil</h1>
      </div>
    </div>

    <section class="card-shell hist-section" aria-label="Histórico geral">
      <div class="section-heading" style="padding:0 0 0.8rem;">
        <div>
          <h2>📜 Histórico Geral</h2>
          <p>Tudo o que entrou e saiu, dia a dia. Só consulta. Bônus VIP/Obrigado/Misterioso aparecem às 00:01 (o diário "com aposta" aparece na hora em que foi liberado) e são recalculados pela configuração atual.</p>
        </div>
      </div>

      <p id="histContextNote" class="finance-close-week-note app-hidden"></p>

      <div class="hist-nav">
        <div class="hist-nav-row">
          <button type="button" id="histPrevBtn" class="hist-btn" aria-label="Dia anterior">◀</button>
          <input type="date" id="histDateInput" class="hist-date" aria-label="Escolher data" />
          <button type="button" id="histNextBtn" class="hist-btn" aria-label="Próximo dia">▶</button>
          <button type="button" id="histTodayBtn" class="hist-btn hist-btn-primary">Hoje</button>
        </div>
        <div class="hist-nav-row">
          <span class="hist-skip-label">Pular</span>
          <button type="button" id="histSkipPrevBtn" class="hist-btn" aria-label="Voltar N dias">◀</button>
          <input type="number" id="histSkipInput" class="hist-skip-input" min="1" max="3650" step="1" value="7" aria-label="Quantidade de dias a pular" />
          <span class="hist-skip-label">dias</span>
          <button type="button" id="histSkipNextBtn" class="hist-btn" aria-label="Avançar N dias">▶</button>
        </div>
        <input type="search" id="histSearch" class="hist-search" placeholder="Buscar plataforma" aria-label="Buscar plataforma" />
      </div>

      <div class="hist-day-header">
        <strong id="histDayLabel"></strong>
        <span id="histSummary" class="hist-summary"></span>
      </div>

      <div id="histList" class="hist-list"><div class="finance-empty">Carregando histórico...</div></div>
    </section>

    <section class="card-shell" style="padding:1.1rem; margin-top:1.1rem;" aria-label="Backup dos dados">
      <div class="section-heading" style="padding:0 0 0.8rem;">
        <div>
          <h2>🛡️ Backup dos dados</h2>
          <p>Baixa .json com todas as suas plataformas e configurações, direto no seu aparelho (em partes, se ficar grande), e mostra o tamanho real ocupado no Firestore. Antes de baixar, o arquivo é conferido documento por documento. Sugestão: Completo toda semana, junto do fechamento de domingo.</p>
        </div>
      </div>
      <div class="reset-modal-buttons" style="justify-content:flex-start; margin-top:0;">
        <button type="button" id="perfilBackupBtn" class="btn-confirm">🛡️ Backup e tamanho dos dados</button>
      </div>
      <p id="perfilBackupStatus" class="finance-close-week-note" style="margin-top:0.7rem;"></p>
      <p id="perfilSizeNote" class="finance-close-week-note perfil-size-note app-hidden"></p>
    </section>

    <section class="card-shell" style="padding:2rem; display:flex; justify-content:center; margin-top:1.1rem;">
      <button type="button" id="perfilLogoutBtn" class="btn-remove-modal" style="padding:0.85rem 1.4rem; border-radius:999px; font-weight:700; font-size:0.95rem;">
        🪪 Sair da conta
      </button>
    </section>
  `;

  const logoutBtn = document.getElementById('perfilLogoutBtn');
  logoutBtn.addEventListener('click', async () => {
    const ok = await showAppConfirm('Deseja realmente sair da sua conta? Você vai precisar entrar de novo com sua conta Google.');
    if (!ok) return;
    logoutBtn.disabled = true;
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Erro ao sair da conta:', err);
      logoutBtn.disabled = false;
      await showAppAlert('Não foi possível sair da conta agora. Verifique a internet e tente de novo.');
    }
  });

  const backupBtn = document.getElementById('perfilBackupBtn');
  const backupStatusEl = document.getElementById('perfilBackupStatus');
  backupStatusEl.textContent = describeLastBackup();
  renderSizeNote();
  // (Sub-entrega 10) Data do último backup no banco — tolerante.
  loadBackupInfo(state.currentUid).then(info => {
    if (token !== mountToken) return;
    const statusEl = document.getElementById('perfilBackupStatus');
    if (statusEl) statusEl.textContent = describeLastBackup(info);
  }).catch(err => console.warn('Perfil: registro do último backup não lido (usa o deste aparelho).', err));
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    try {
      await openBackupPanel({
        onDone: (info, prepared) => {
          writeLastBackupInfo({ exportedAt: prepared.now.toISOString(), filename: prepared.parts[0].filename });
          if (token !== mountToken) return;
          const statusEl = document.getElementById('perfilBackupStatus');
          if (statusEl) statusEl.textContent = describeLastBackup(info);
        }
      });
    } finally {
      backupBtn.disabled = false;
    }
  });

  initHistoryControls();
  syncControls();

  // (Sub-entrega F) Leitura estrita do contexto de bônus — só leitura.
  // Falha não impede a tela, mas fica explícita (ver nota no topo).
  let loadedValue = 0;
  let loadedTemplates = [];
  let contextConfirmed = false;
  try {
    const bonusContext = await loadBonusContextStrict(state.currentUid);
    loadedValue = bonusContext.obrigadoValuePerAppearance;
    loadedTemplates = bonusContext.misteriosoTemplates;
    contextConfirmed = true;
  } catch (err) {
    console.error('Perfil: contexto de bônus não confirmado — Obrigado/Misterioso fora do histórico:', err);
  }
  if (token !== mountToken) return; // saiu da rota durante a leitura

  obrigadoValuePerAppearance = loadedValue;
  misteriosoTemplates = loadedTemplates;

  if (!contextConfirmed) {
    const noteEl = document.getElementById('histContextNote');
    if (noteEl) {
      noteEl.textContent = '⚠ Não foi possível carregar o valor do Bônus Obrigado e os templates do Misterioso. O histórico abaixo está SEM esses dois bônus. Abra esta tela de novo quando a internet voltar.';
      noteEl.classList.remove('app-hidden');
    }
  }

  renderFeed();
  scheduleDailyUpdate();
}

export function unmount() {
  mountToken++;
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
}
