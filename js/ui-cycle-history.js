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

import { state } from './state.js';
import { showAppConfirm } from './utils.js';
import { savePlatform } from './platforms-store.js';
import { loadDailySnapshotsRange, DAILY_SNAPSHOT_READ_MAX } from './daily-snapshot-store.js';
import {
  sortedHistory, cleanHistoryEntry, predictCycle, describePrediction, rebuildFromSnapshots,
  addDaysKey, dayKeyOf, cycleState, CYCLE_STATES
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
