// === MINI-CONTÊINERES "📜 CICLOS" (Sub-entrega 11c) ===
// 1) openCycleHistory({ platform }) — Edição → Ações → "📜 Ciclos":
//    previsão, histórico (Fim/Reinício), lançar à mão, excluir e
//    reconstruir pelas fotos diárias. Nada é gravado até "Salvar".
// 2) openCycleRebuildAll() — Planejador: reconstrói o histórico de TODAS as
//    plataformas de uma vez, pelas fotos diárias (uma leitura só), com
//    revisão (marcar/desmarcar) antes de gravar.
//
// BANCO: só leitura de dailySnapshots (loadDailySnapshotsRange) e gravação
// pelo savePlatform de sempre (cycleHistory). Excluir um registro passa
// allowShrink: ['cycleHistory'] (única forma de diminuir a lista).
// Segurança: textContent.
//
// === (Sub-entrega 29) 📥 COLAR TABELA DE CICLOS ===
// openCycleTableImport() — Planejador → "🚫 Não depositar agora": cola as
// datas de ciclos anteriores (várias plataformas de uma vez), revisa
// (nova / já existe / futura, como o tipo foi lido, plataforma não achada
// = escolher na lista) e grava SÓ o cycleHistory pelo savePlatform de
// sempre. O estado atual (encerrado/ativo, Reinício atual) não muda.

import { state } from './state.js';
import { showAppConfirm, showAppAlert } from './utils.js';
import { savePlatform } from './platforms-store.js';
import { loadDailySnapshotsRange, DAILY_SNAPSHOT_READ_MAX } from './daily-snapshot-store.js';
import {
  sortedHistory, cleanHistoryEntry, predictCycle, describePrediction, rebuildFromSnapshots,
  addDaysKey, dayKeyOf, cycleState, CYCLE_STATES, parseCycleTable, refreshCycleRowStatus
} from './cycle-history-logic.js';

let activeClose = null;

function el(tag, className = '', text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null && text !== undefined) n.textContent = text;
  return n;
}

function btn(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function fmt(k) {
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(2, 4)}` : '';
}

const TYPE_LABEL = { reset: '🔄 Reinício', end: '🏁 Fim' };
const SOURCE_LABEL = { auto: 'botão', rebuild: 'fotos diárias', manual: 'à mão' };

function shell(title) {
  if (activeClose) activeClose();
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const overlay = el('div', 'cy-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el('div', 'cy-box');
  overlay.appendChild(box);
  const api = { overlay, box, busy: false, closed: false, onClose: null };
  function close() {
    if (api.closed) return;
    api.closed = true;
    activeClose = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    window.removeEventListener('popstate', close);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (api.onClose) api.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && !api.busy) { e.preventDefault(); e.stopPropagation(); close(); }
  }
  overlay.addEventListener('click', e => { if (e.target === overlay && !api.busy) close(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  window.addEventListener('popstate', close);
  activeClose = close;
  api.close = close;
  api.title = title;
  document.body.appendChild(overlay);
  return api;
}

async function readSnapshots(uid) {
  const today = dayKeyOf(new Date());
  return loadDailySnapshotsRange(uid, addDaysKey(today, -(DAILY_SNAPSHOT_READ_MAX - 1)), today, DAILY_SNAPSHOT_READ_MAX);
}

/** @returns {Promise<{changed:boolean}>} */
export function openCycleHistory({ platform } = {}) {
  return new Promise(resolve => {
    if (!platform) { resolve({ changed: false }); return; }
    const ui = shell('Ciclos');
    let changed = false;
    ui.onClose = () => resolve({ changed });
    const today = dayKeyOf(new Date());
    let draft = sortedHistory(platform);
    let removed = 0;
    let candidates = null; // reconstrução
    let msg = '';
    let info = '';
    const add = { type: 'reset', date: today };

    function render() {
      const b = ui.box;
      b.replaceChildren();
      b.appendChild(el('h3', 'cy-title', `📜 Ciclos — ${platform.name}`));
      const stLabel = (CYCLE_STATES.find(c => c.id === cycleState(platform)) || {}).label;
      b.appendChild(el('p', 'cy-sub', `${stLabel} (troca em Dados)`));
      const pred = predictCycle({ ...platform, cycleHistory: draft }, today);
      b.appendChild(el('p', `cy-pred cy-${pred.status}`, describePrediction(pred, fmt)));

      b.appendChild(el('span', 'cy-label', `Histórico (${draft.length})`));
      const list = el('div', 'cy-list');
      if (!draft.length) list.appendChild(el('p', 'cy-note', 'Nenhum registro ainda. A partir de agora todo Fim/Reinício entra aqui sozinho — ou reconstrua pelas fotos diárias.'));
      [...draft].reverse().forEach(e => {
        const row = el('div', `cy-row cy-${e.type}`);
        row.appendChild(el('span', 'cy-row-main', `${TYPE_LABEL[e.type]} ${fmt(e.date)}${e.approx ? ' ≈' : ''}`));
        row.appendChild(el('span', 'cy-row-src', SOURCE_LABEL[e.source] || ''));
        row.appendChild(btn('Excluir', 'cy-del', async () => {
          const ok = await showAppConfirm(`Excluir o registro ${TYPE_LABEL[e.type]} de ${fmt(e.date)}? (só sai do histórico — não mexe no ciclo atual)`);
          if (!ok || ui.closed) return;
          draft = draft.filter(x => x !== e);
          removed++;
          render();
        }));
        list.appendChild(row);
      });
      b.appendChild(list);

      // Lançar à mão
      b.appendChild(el('span', 'cy-label', 'Lançar à mão'));
      const addRow = el('div', 'cy-add');
      const sel = el('select', 'cy-input');
      [['reset', '🔄 Reinício'], ['end', '🏁 Fim']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.appendChild(o); });
      sel.value = add.type;
      sel.addEventListener('change', () => { add.type = sel.value; });
      const date = el('input', 'cy-input');
      date.type = 'date';
      date.max = today;
      date.value = add.date;
      date.addEventListener('change', () => { add.date = date.value; });
      addRow.appendChild(sel);
      addRow.appendChild(date);
      addRow.appendChild(btn('Adicionar', 'bet-manage-btn', () => {
        const e = cleanHistoryEntry({ type: add.type, date: add.date, at: new Date().toISOString(), source: 'manual' });
        if (!e || e.date > today) { msg = 'Data inválida.'; render(); return; }
        if (draft.some(x => x.type === e.type && x.date === e.date)) { msg = 'Esse registro já existe.'; render(); return; }
        draft = [...draft, e].sort((a, c) => a.date.localeCompare(c.date));
        msg = '';
        render();
      }));
      b.appendChild(addRow);

      // Reconstruir
      b.appendChild(el('span', 'cy-label', 'Reconstruir pelas fotos diárias'));
      if (candidates === null) {
        b.appendChild(el('p', 'cy-note', `Lê as fotos diárias dos últimos ${DAILY_SNAPSHOT_READ_MAX} dias (só leitura) e mostra os Fins/Reinícios encontrados pra você conferir.`));
        b.appendChild(btn('🔁 Procurar nas fotos diárias', 'bet-manage-btn', onRebuild));
      } else if (!candidates.length) {
        b.appendChild(el('p', 'cy-note', 'Nada novo encontrado nas fotos diárias.'));
      } else {
        const cl = el('div', 'cy-list');
        candidates.forEach(c => {
          const lab = el('label', 'cy-cand');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = c.checked;
          cb.addEventListener('change', () => { c.checked = cb.checked; });
          lab.appendChild(cb);
          lab.appendChild(el('span', '', `${TYPE_LABEL[c.type]} ${fmt(c.date)}${c.approx ? ` ≈ (lacuna de ${c.gapDays} dia(s) sem foto)` : ''}${c.monthTurn ? ' · virada do mês (automática)' : ''}`));
          cl.appendChild(lab);
        });
        b.appendChild(cl);
        b.appendChild(btn('Adicionar marcados', 'bet-manage-btn', () => {
          const picked = candidates.filter(c => c.checked).map(c => cleanHistoryEntry({ type: c.type, date: c.date, at: new Date().toISOString(), source: 'rebuild', approx: c.approx }));
          const have = new Set(draft.map(x => `${x.type}|${x.date}`));
          draft = [...draft, ...picked.filter(x => x && !have.has(`${x.type}|${x.date}`))].sort((a, c) => a.date.localeCompare(c.date));
          candidates = [];
          render();
        }));
      }

      if (info) b.appendChild(el('p', 'cy-note', info));
      if (msg) b.appendChild(el('p', 'cy-error', msg));
      const foot = el('div', 'cy-footer');
      foot.appendChild(btn('Cancelar', 'cy-cancel', () => { if (!ui.busy) ui.close(); }));
      const save = btn('Salvar', 'btn-confirm', onSave);
      save.disabled = ui.busy;
      foot.appendChild(save);
      b.appendChild(foot);
    }

    async function onRebuild() {
      ui.busy = true;
      info = 'Lendo as fotos diárias…';
      render();
      try {
        const snaps = await readSnapshots(state.currentUid);
        const found = rebuildFromSnapshots(snaps, [{ ...platform, cycleHistory: draft }])[platform.id] || [];
        candidates = found.map(c => ({ ...c, checked: !c.monthTurn }));
        info = snaps.length ? `${snaps.length} foto(s) diária(s) lida(s).` : 'Nenhuma foto diária encontrada.';
        msg = '';
      } catch (err) {
        console.error('Ciclos: falha ao ler as fotos diárias:', err);
        info = '';
        msg = 'Não foi possível ler as fotos diárias. Verifique a internet e tente de novo.';
      } finally {
        ui.busy = false;
        if (!ui.closed) render();
      }
    }

    async function onSave() {
      if (ui.busy) return;
      const before = JSON.stringify(sortedHistory(platform));
      if (JSON.stringify(draft) === before && !removed) { ui.close(); return; }
      const prev = platform.cycleHistory;
      platform.cycleHistory = draft.map(e => ({ ...e }));
      const sent = savePlatform(state.currentUid, platform, removed ? { allowShrink: ['cycleHistory'] } : {});
      if (!sent) {
        platform.cycleHistory = prev; // nada saiu do aparelho
        msg = 'Gravação bloqueada — nada mudou. Recarregue a página e tente de novo.';
        render();
        return;
      }
      changed = true;
      ui.close();
    }

    render();
  });
}

/** Reconstrói todas as plataformas de uma vez. @returns {Promise<{changed:number}>} */
export function openCycleRebuildAll() {
  return new Promise(resolve => {
    const ui = shell('Ciclos');
    let changedCount = 0;
    ui.onClose = () => resolve({ changed: changedCount });
    let found = null; // { pid: [cand] }
    let msg = '';

    function render() {
      const b = ui.box;
      b.replaceChildren();
      b.appendChild(el('h3', 'cy-title', '🔁 Reconstruir ciclos'));
      b.appendChild(el('p', 'cy-note', `Lê as fotos diárias dos últimos ${DAILY_SNAPSHOT_READ_MAX} dias (só leitura) e procura os Fins/Reinícios de TODAS as plataformas. Nada é gravado sem você conferir. Viradas automáticas do mês vêm desmarcadas.`));
      if (found === null) {
        b.appendChild(btn(ui.busy ? 'Lendo…' : '🔁 Procurar', 'btn-confirm', onRead));
      } else {
        const ids = Object.keys(found);
        if (!ids.length) b.appendChild(el('p', 'cy-note', 'Nada novo encontrado.'));
        ids.forEach(pid => {
          const p = state.platforms.find(x => x.id === pid);
          if (!p) return;
          const det = el('details', 'cy-group');
          const sel = found[pid].filter(c => c.checked).length;
          det.appendChild(el('summary', '', `${p.name} — ${found[pid].length} encontrado(s), ${sel} marcado(s)`));
          found[pid].forEach(c => {
            const lab = el('label', 'cy-cand');
            const cb = el('input');
            cb.type = 'checkbox';
            cb.checked = c.checked;
            cb.addEventListener('change', () => { c.checked = cb.checked; });
            lab.appendChild(cb);
            lab.appendChild(el('span', '', `${TYPE_LABEL[c.type]} ${fmt(c.date)}${c.approx ? ` ≈ (lacuna ${c.gapDays}d)` : ''}${c.monthTurn ? ' · virada do mês' : ''}`));
            det.appendChild(lab);
          });
          b.appendChild(det);
        });
      }
      if (msg) b.appendChild(el('p', 'cy-note', msg));
      const foot = el('div', 'cy-footer');
      foot.appendChild(btn(found && Object.keys(found).length ? 'Cancelar' : 'Fechar', 'cy-cancel', () => { if (!ui.busy) ui.close(); }));
      if (found && Object.keys(found).length) {
        const save = btn('Gravar marcados', 'btn-confirm', onSave);
        save.disabled = ui.busy;
        foot.appendChild(save);
      }
      b.appendChild(foot);
    }

    async function onRead() {
      if (ui.busy) return;
      ui.busy = true;
      render();
      try {
        const snaps = await readSnapshots(state.currentUid);
        const res = rebuildFromSnapshots(snaps, state.platforms);
        found = {};
        Object.entries(res).forEach(([pid, list]) => { found[pid] = list.map(c => ({ ...c, checked: !c.monthTurn })); });
        msg = `${snaps.length} foto(s) diária(s) lida(s).`;
      } catch (err) {
        console.error('Ciclos: falha ao ler as fotos diárias:', err);
        msg = 'Não foi possível ler as fotos diárias. Verifique a internet e tente de novo.';
      } finally {
        ui.busy = false;
        if (!ui.closed) render();
      }
    }

    async function onSave() {
      if (ui.busy) return;
      const ok = await showAppConfirm('Gravar os registros marcados no histórico de ciclos de cada plataforma?');
      if (!ok || ui.closed) return;
      ui.busy = true;
      const failed = [];
      Object.entries(found).forEach(([pid, list]) => {
        const p = state.platforms.find(x => x.id === pid);
        const picked = list.filter(c => c.checked);
        if (!p || !picked.length) return;
        const prev = Array.isArray(p.cycleHistory) ? p.cycleHistory : [];
        const have = new Set(prev.map(e => `${e && e.type}|${e && e.date}`));
        const add = picked.map(c => cleanHistoryEntry({ type: c.type, date: c.date, at: new Date().toISOString(), source: 'rebuild', approx: c.approx }))
          .filter(e => e && !have.has(`${e.type}|${e.date}`));
        if (!add.length) return;
        p.cycleHistory = [...prev, ...add];
        if (savePlatform(state.currentUid, p)) changedCount++;
        else { p.cycleHistory = prev; failed.push(p.name); }
      });
      ui.busy = false;
      found = {};
      msg = `${changedCount} plataforma(s) gravada(s).${failed.length ? ` Bloqueadas: ${failed.join(', ')} — recarregue e tente de novo.` : ''}`;
      render();
    }

    render();
  });
}


// ---------- (29) 📥 Colar tabela de ciclos ----------

const HOW_LABEL = { coluna: 'pela coluna', palavra: 'pela palavra', ordem: 'pela ordem (Reinício → Fim)' };
const STATUS_LABEL = { nova: 'nova', existe: 'já existe', futura: 'data futura' };

/** @returns {Promise<{changed:number}>} */
export function openCycleTableImport() {
  return new Promise(resolve => {
    const ui = shell('Tabela de ciclos');
    let changedCount = 0;
    ui.onClose = () => resolve({ changed: changedCount });
    let text = '';
    let parsed = null; // { rows }
    let msg = '';
    const today = dayKeyOf(new Date());
    const sorted = [...state.platforms].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }));

    function newCount() {
      return parsed ? parsed.rows.reduce((n, r) => n + (r.platformId ? r.entries.filter(e => e.status === 'nova' && e.checked).length : 0), 0) : 0;
    }

    function render() {
      const b = ui.box;
      b.replaceChildren();
      b.appendChild(el('h3', 'cy-title', '📥 Colar tabela de ciclos'));
      if (!parsed) {
        b.appendChild(el('p', 'cy-note', 'Cole as datas dos ciclos anteriores (uma plataforma por linha). Exemplos que funcionam:'));
        b.appendChild(el('pre', 'cy-example', 'Plataforma;Reinício;Fim\n1UUU;01/10;12/10\nNNZZ Fim 14/10 Reinício 17/10\n77BET 01/09 20/09 02/10 15/10   (pela ordem: Reinício, Fim, Reinício, Fim)'));
        // (29b) grade por mês, copiada direto da planilha
        b.appendChild(el('p', 'cy-note', 'Ou a grade por mês copiada da planilha (selecione do título "Platform" até a última célula e cole). Cada célula: dia ("18"), dia/mês ("06/08") ou "x" quando não teve:'));
        b.appendChild(el('pre', 'cy-example', 'Platform  Restart(April)  Restart(May)  Restart(June)\nDDUU      x               12/05         13/06\nFXX       13/04           16/05         18'));
        const ta = el('textarea', 'plan-input cy-textarea');
        ta.rows = 8;
        ta.value = text;
        ta.setAttribute('aria-label', 'Tabela de ciclos');
        ta.addEventListener('input', () => { text = ta.value; });
        b.appendChild(ta);
        if (msg) b.appendChild(el('p', 'cy-note', `✅ ${msg}`));
        const foot = el('div', 'cy-footer');
        foot.appendChild(btn('Cancelar', 'cy-cancel', () => ui.close()));
        foot.appendChild(btn('Ler tabela', 'btn-confirm', () => {
          if (!text.trim()) return;
          parsed = parseCycleTable(text, state.platforms, today);
          // (29b) data com aviso (fora do mês da coluna / coluna sem título) começa desmarcada
          parsed.rows.forEach(r => r.entries.forEach(e => { e.checked = e.status === 'nova' && !e.warn; }));
          msg = '';
          render();
        }));
        b.appendChild(foot);
        setTimeout(() => ta.focus(), 0);
        return;
      }
      b.appendChild(el('p', 'cy-note', `Confira antes de gravar. Só as datas marcadas entram no histórico de ciclos; o estado atual de cada plataforma (encerrado/ativo) não muda.${parsed.header && !parsed.grid ? ' Cabeçalho reconhecido.' : ''}`));
      if (parsed.grid) {
        const g = parsed.grid;
        const nNew = parsed.rows.reduce((n, r) => n + r.entries.filter(e => e.status === 'nova').length, 0);
        const nWarn = parsed.rows.reduce((n, r) => n + r.entries.filter(e => e.status === 'nova' && e.warn).length, 0);
        b.appendChild(el('p', 'cy-note', `📅 Grade por mês: ${g.months.join(', ')}. ${parsed.rows.length} linha(s) com dados · ${nNew} data(s) nova(s)${g.skippedEmpty ? ` · ${g.skippedEmpty} linha(s) sem nenhuma data pulada(s)` : ''}.${nWarn ? ` ⚠️ ${nWarn} data(s) com aviso começam DESMARCADAS — confira e marque se estiverem certas.` : ''}`));
      }
      parsed.rows.forEach(r => {
        const box = el('div', `cy-import-row${r.platformId ? '' : ' cy-import-bad'}`);
        const top = el('div', 'cy-import-top');
        const sel = el('select', 'plan-input cy-import-select');
        sel.setAttribute('aria-label', `Plataforma da linha ${r.lineNo}`);
        const o0 = el('option', '', r.platformId ? '' : `— escolha (“${r.name || 'sem nome'}”) —`);
        o0.value = '';
        sel.appendChild(o0);
        sorted.forEach(p => { const o = el('option', '', p.name); o.value = p.id; sel.appendChild(o); });
        sel.value = r.platformId || '';
        sel.addEventListener('change', () => {
          r.platformId = sel.value || null;
          refreshCycleRowStatus(r, state.platforms, today);
          r.entries.forEach(e => { e.checked = e.status === 'nova' && !e.warn; });
          render();
        });
        top.appendChild(el('span', 'cy-import-line', `Linha ${r.lineNo}`));
        top.appendChild(sel);
        box.appendChild(top);
        r.entries.forEach(e => {
          const lab = el('label', `cy-cand${e.status !== 'nova' ? ' cy-cand-off' : ''}${e.warn ? ' cy-cand-warn' : ''}`);
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = !!e.checked && e.status === 'nova' && !!r.platformId;
          cb.disabled = e.status !== 'nova' || !r.platformId;
          cb.addEventListener('change', () => { e.checked = cb.checked; renderFoot(); });
          lab.appendChild(cb);
          // trocar o tipo (Reinício ↔ Fim) quando a leitura errou
          const sw = btn(TYPE_LABEL[e.type], 'cy-type-btn', () => {
            e.type = e.type === 'reset' ? 'end' : 'reset';
            e.how = 'manual';
            refreshCycleRowStatus(r, state.platforms, today);
            e.checked = e.status === 'nova';
            render();
          });
          sw.title = 'Toque pra trocar Reinício ↔ Fim';
          lab.appendChild(sw);
          lab.appendChild(el('span', '', ` ${fmt(e.date)} · ${STATUS_LABEL[e.status]}${e.how && e.how !== 'manual' ? ` · ${HOW_LABEL[e.how]}` : ''}${e.warn ? ` · ⚠️ ${e.warn}` : ''}`));
          box.appendChild(lab);
        });
        r.problems.filter(pr => !(r.platformId && /não encontrada|Sem nome/.test(pr))).forEach(pr => box.appendChild(el('p', 'cy-note cy-warn', pr)));
        b.appendChild(box);
      });
      if (msg) b.appendChild(el('p', 'cy-note', msg));
      const foot = el('div', 'cy-footer');
      foot.id = 'cyImportFoot';
      b.appendChild(foot);
      renderFoot();
    }

    function renderFoot() {
      const foot = ui.box.querySelector('#cyImportFoot');
      if (!foot) return;
      foot.replaceChildren();
      foot.appendChild(btn('Voltar ao texto', 'cy-cancel', () => { if (!ui.busy) { parsed = null; render(); } }));
      const n = newCount();
      const save = btn(n ? `Gravar ${n} data(s)` : 'Nada marcado', 'btn-confirm', onSave);
      save.disabled = ui.busy || !n;
      foot.appendChild(save);
    }

    async function onSave() {
      if (ui.busy) return;
      const byPid = new Map();
      parsed.rows.forEach(r => {
        if (!r.platformId) return;
        r.entries.filter(e => e.checked && e.status === 'nova').forEach(e => {
          if (!byPid.has(r.platformId)) byPid.set(r.platformId, []);
          byPid.get(r.platformId).push(e);
        });
      });
      if (!byPid.size) return;
      const total = [...byPid.values()].reduce((n, l) => n + l.length, 0);
      const ok = await showAppConfirm(`Gravar ${total} data(s) no histórico de ciclos de ${byPid.size} plataforma(s)? A previsão de volta e os dias pausados do Planejador passam a usar esse histórico.`);
      if (!ok || ui.closed) return;
      ui.busy = true;
      const failed = [];
      let saved = 0;
      byPid.forEach((list, pid) => {
        const p = state.platforms.find(x => x.id === pid);
        if (!p) { failed.push(pid); return; }
        const prev = Array.isArray(p.cycleHistory) ? p.cycleHistory : [];
        const have = new Set(prev.map(e => `${e && e.type}|${e && e.date}`));
        const nowIso = new Date().toISOString();
        const add = list.map(e => cleanHistoryEntry({ type: e.type, date: e.date, at: nowIso, source: 'manual' }))
          .filter(e => e && !have.has(`${e.type}|${e.date}`));
        if (!add.length) return;
        p.cycleHistory = [...prev, ...add];
        if (savePlatform(state.currentUid, p)) { changedCount++; saved += add.length; }
        else { p.cycleHistory = prev; failed.push(p.name); }
      });
      ui.busy = false;
      if (failed.length) {
        await showAppAlert(`${saved} data(s) gravada(s). Bloqueadas: ${failed.join(', ')} — recarregue a página e tente de novo (nada foi gravado nessas).`);
      }
      parsed = null;
      text = '';
      msg = `${saved} data(s) gravada(s) em ${changedCount} plataforma(s).`;
      render();
    }

    render();
  });
}
