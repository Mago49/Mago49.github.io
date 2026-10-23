// === MINI-CONTÊINER "BACKUP E TAMANHO DOS DADOS" (Sub-entrega 10) ===
// Fixo e centralizado (mesmo padrão dos outros mini-contêineres). Aberto
// pelo Perfil.
//
//   Modo: Completo | Só o novo (desde o último completo)
//   Limite por arquivo: 1 · 2 · 4 · 8 MB (salvo no banco)
//   [Gerar e conferir] → lê, mede, divide, CONFERE → relatório:
//     ✅ conferência (documentos lidos = documentos no arquivo)
//     tamanho real no Firestore (fórmula oficial) — total, plataformas com
//     % do limite de 1 MB, maior documento fora delas, por coleção
//     botões "⬇️ Parte i de N" — quando TODAS foram baixadas, registra a
//     data no banco (meta/backupInfo).
//
// Nada é gravado além de meta/backupInfo. Segurança: textos por textContent.

import { state } from './state.js';
import {
  loadBackupInfo, getCachedBackupInfo, prepareBackup, downloadBackupPart, recordBackupDone, savePartLimit
} from './backup-store.js';
import {
  PART_LIMIT_OPTIONS_MB, DEFAULT_PART_LIMIT_MB, FIRESTORE_DOC_LIMIT, diffSinceKeys,
  formatBytes, formatPct
} from './backup-logic.js';

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

function fmtWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDayKey(k) {
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '';
}

const LEVEL_ICON = { ok: '🟢', warn: '🟡', danger: '🔴' };

/**
 * @param {object} o  onDone(info) — chamado quando o backup é registrado
 * @returns {Promise<void>} resolve ao fechar
 */
export function openBackupPanel({ onDone = () => {} } = {}) {
  if (activeClose) activeClose();
  const uid = state.currentUid;

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = el('div', 'bk-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', 'bk-box');
    overlay.appendChild(box);

    let closed = false;
    let busy = false;
    function close() {
      if (closed) return;
      closed = true;
      activeClose = null;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('popstate', close);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      resolve();
    }
    activeClose = close;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) close(); }
    }
    overlay.addEventListener('click', e => { if (e.target === overlay && !busy) close(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', close);
    window.addEventListener('popstate', close);

    const ui = { infoStatus: 'loading', mode: 'full', limitMB: DEFAULT_PART_LIMIT_MB, prepared: null, downloaded: new Set(), recorded: null, error: '', showAllPlatforms: false };

    function render() {
      if (closed) return;
      box.replaceChildren();
      const head = el('div', 'bk-head');
      head.appendChild(el('h3', 'bk-title', '🛡️ Backup e tamanho dos dados'));
      const x = btn('✕', 'bk-close', () => { if (!busy) close(); });
      x.setAttribute('aria-label', 'Fechar');
      head.appendChild(x);
      box.appendChild(head);

      const info = getCachedBackupInfo(uid);

      // ---- último backup ----
      const last = el('div', 'bk-last');
      if (ui.infoStatus === 'loading') last.appendChild(el('p', 'bk-note', 'Lendo o registro do último backup…'));
      else if (ui.infoStatus === 'error') {
        last.appendChild(el('p', 'bk-warn', 'Não deu pra ler o registro do último backup. O "Completo" funciona normalmente, mas "Só o novo" fica desligado e a data deste backup não será registrada.'));
        last.appendChild(btn('Tentar de novo', 'bet-manage-btn', loadInfo));
      } else {
        last.appendChild(kv('Último completo', info.lastFullAt ? `${fmtWhen(info.lastFullAt)}${info.lastTotalBytes ? ` · ${formatBytes(info.lastTotalBytes)}` : ''}` : 'nenhum ainda'));
        if (info.lastAt && info.lastMode === 'diff') last.appendChild(kv('Último "Só o novo"', fmtWhen(info.lastAt)));
      }
      box.appendChild(last);

      if (!ui.prepared) {
        // ---- modo ----
        const since = info ? diffSinceKeys(info.lastFullAt) : null;
        if (!since && ui.mode === 'diff') ui.mode = 'full';
        box.appendChild(el('span', 'bk-label', 'Tipo'));
        const modes = el('div', 'bk-chips');
        modes.appendChild(btn('Completo', `bk-chip${ui.mode === 'full' ? ' on' : ''}`, () => { ui.mode = 'full'; render(); }));
        const diffBtn = btn(since ? `Só o novo (desde ${fmtDayKey(since.dayKey)})` : 'Só o novo', `bk-chip${ui.mode === 'diff' ? ' on' : ''}`, () => { ui.mode = 'diff'; render(); });
        diffBtn.disabled = !since;
        modes.appendChild(diffBtn);
        box.appendChild(modes);
        box.appendChild(el('p', 'bk-note', ui.mode === 'full'
          ? 'Tudo da conta. Mostra o tamanho real ocupado no Firestore.'
          : 'Plataformas, templates, planos e configurações vêm inteiros; os históricos por data (fotos diárias, rotinas, planejado, VIP) só desde 7 dias antes do último completo. Pra restaurar: último Completo + último Só o novo.'));

        // ---- limite por arquivo ----
        box.appendChild(el('span', 'bk-label', 'Tamanho máximo de cada arquivo'));
        const limits = el('div', 'bk-chips');
        PART_LIMIT_OPTIONS_MB.forEach(mb => limits.appendChild(btn(`${mb} MB`, `bk-chip${ui.limitMB === mb ? ' on' : ''}`, async () => {
          if (busy || ui.limitMB === mb) return;
          const prev = ui.limitMB;
          ui.limitMB = mb;
          render();
          if (ui.infoStatus === 'ok') {
            const r = await savePartLimit(uid, mb);
            if (!r.ok) { ui.limitMB = prev; ui.error = r.error; render(); }
          }
        })));
        box.appendChild(limits);
        box.appendChild(el('p', 'bk-note', 'É só o tamanho do arquivo no celular — não tem relação com o limite do Firestore. Passou disso, o backup sai em partes (nenhum registro é cortado ao meio).'));

        if (ui.error) box.appendChild(el('p', 'bk-error', ui.error));
        const footer = el('div', 'bk-footer');
        footer.appendChild(btn('Cancelar', 'bk-cancel', close));
        const go = btn(busy ? 'Lendo e conferindo…' : 'Gerar e conferir', 'btn-confirm', onPrepare);
        go.disabled = busy || ui.infoStatus === 'loading';
        footer.appendChild(go);
        box.appendChild(footer);
        return;
      }

      renderResult(info);
    }

    function kv(k, v) {
      const r = el('div', 'bk-kv');
      r.appendChild(el('span', 'bk-k', k));
      r.appendChild(el('span', 'bk-v', v));
      return r;
    }

    function renderResult(info) {
      const p = ui.prepared;
      const rep = p.report;

      box.appendChild(el('p', 'bk-ok', `✅ Conferido: ${p.docs.toLocaleString('pt-BR')} documento(s) lidos do banco = ${p.docs.toLocaleString('pt-BR')} no arquivo${p.parts.length > 1 ? ` (${p.parts.length} partes)` : ''}.`));

      // ---- arquivos ----
      box.appendChild(el('span', 'bk-label', p.parts.length > 1 ? `Arquivos — baixe as ${p.parts.length} partes` : 'Arquivo'));
      const files = el('div', 'bk-files');
      p.parts.forEach(part => {
        const done = ui.downloaded.has(part.part);
        const label = p.parts.length > 1 ? `Parte ${part.part} de ${part.totalParts}` : 'Baixar backup';
        const b = btn(`${done ? '✓' : '⬇️'} ${label} · ${formatBytes(part.bytes)}`, `bk-file${done ? ' done' : ''}`, () => onDownload(part));
        files.appendChild(b);
      });
      box.appendChild(files);
      const allDone = ui.downloaded.size === p.parts.length;
      if (ui.recorded) {
        box.appendChild(el('p', ui.recorded.ok ? 'bk-ok' : 'bk-warn', ui.recorded.ok ? `✓ Backup registrado no banco (${p.mode === 'full' ? 'Completo' : 'Só o novo'}). Confira na pasta Downloads.` : ui.recorded.error));
      } else if (!allDone) {
        box.appendChild(el('p', 'bk-note', 'A data só é registrada depois que todas as partes forem baixadas.'));
      }

      // ---- tamanho no Firestore ----
      box.appendChild(el('span', 'bk-label', 'Tamanho real no Firestore'));
      const tot = el('div', 'bk-grid');
      if (p.mode === 'full') {
        tot.appendChild(kv('Total dos documentos', `${formatBytes(rep.totalBytes)} · ${formatPct(rep.totalPctOfFree, 2)} de 1 GB (plano gratuito)`));
      } else {
        tot.appendChild(kv('Lido neste backup', formatBytes(rep.totalBytes)));
        if (info && info.lastTotalBytes) tot.appendChild(kv('Total no último completo', formatBytes(info.lastTotalBytes)));
      }
      box.appendChild(tot);
      box.appendChild(el('p', 'bk-note', 'Fórmula oficial do Google por documento. Os índices automáticos ocupam um pouco mais no plano (o número oficial fica no console do Firebase → Uso), mas NÃO contam no limite de 1 MB de cada documento.'));

      // ---- plataformas ----
      box.appendChild(el('span', 'bk-label', 'Plataformas — limite de 1 MB por documento'));
      const worst = rep.platforms.filter(x => x.level !== 'ok');
      if (worst.length) {
        box.appendChild(el('p', worst.some(x => x.level === 'danger') ? 'bk-error' : 'bk-warn',
          `${worst.length} plataforma(s) perto do limite. Passou de 100%, o Firestore recusa a gravação — a próxima atualização traz o arquivamento.`));
      }
      const list = el('div', 'bk-plist');
      const shown = ui.showAllPlatforms ? rep.platforms : rep.platforms.slice(0, 5);
      shown.forEach(pl => {
        const row = el('div', `bk-prow ${pl.level}`);
        const top = el('div', 'bk-prow-top');
        top.appendChild(el('span', 'bk-pname', `${LEVEL_ICON[pl.level]} ${pl.name}`));
        top.appendChild(el('span', 'bk-ppct', `${formatPct(pl.pct)} · ${formatBytes(pl.bytes)}`));
        row.appendChild(top);
        const bar = el('div', 'bk-bar');
        const fill = el('span', 'bk-bar-fill');
        fill.style.width = `${Math.min(100, pl.pct * 100).toFixed(2)}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        const big = pl.biggest.filter(b => b.bytes >= 1024).map(b => `${b.field}${b.items !== null ? ` (${b.items.toLocaleString('pt-BR')} itens)` : ''} ${formatBytes(b.bytes)}`);
        if (big.length) row.appendChild(el('span', 'bk-pmeta', `Mais pesados: ${big.join(' · ')}`));
        list.appendChild(row);
      });
      box.appendChild(list);
      if (rep.platforms.length > 5) {
        box.appendChild(btn(ui.showAllPlatforms ? 'Mostrar menos' : `Mostrar todas (${rep.platforms.length})`, 'bet-manage-btn bk-more', () => { ui.showAllPlatforms = !ui.showAllPlatforms; render(); }));
      }
      if (rep.largestOther) {
        const o = rep.largestOther;
        box.appendChild(el('p', o.level === 'ok' ? 'bk-note' : 'bk-warn', `Maior documento fora das plataformas: ${o.collection}/${o.id} · ${formatBytes(o.bytes)} (${formatPct(o.pct)} do limite de ${formatBytes(FIRESTORE_DOC_LIMIT)}).`));
      }

      // ---- por coleção ----
      const det = el('details', 'bk-details');
      det.appendChild(el('summary', '', 'Por coleção'));
      const table = el('div', 'bk-grid');
      rep.collections.filter(r => r.docs > 0).sort((a, b) => b.bytes - a.bytes).forEach(r => {
        table.appendChild(kv(r.label, `${r.docs.toLocaleString('pt-BR')} doc · ${formatBytes(r.bytes)}`));
      });
      det.appendChild(table);
      box.appendChild(det);

      const footer = el('div', 'bk-footer');
      footer.appendChild(btn('Fechar', 'bk-cancel', close));
      box.appendChild(footer);
    }

    async function loadInfo() {
      ui.infoStatus = 'loading';
      render();
      try {
        const info = await loadBackupInfo(uid);
        if (closed) return;
        ui.infoStatus = 'ok';
        ui.limitMB = info.partLimitMB;
      } catch (e) {
        console.error('Backup: registro do último backup não lido:', e);
        if (closed) return;
        ui.infoStatus = 'error';
      }
      render();
    }

    async function onPrepare() {
      if (busy) return;
      busy = true;
      ui.error = '';
      render();
      try {
        const prepared = await prepareBackup(uid, { mode: ui.mode, partLimitMB: ui.limitMB });
        if (closed) return;
        ui.prepared = prepared;
        ui.downloaded = new Set();
        ui.recorded = null;
      } catch (e) {
        console.error('Erro ao gerar backup:', e);
        ui.error = `Não foi possível gerar o backup: ${e && e.message ? e.message : 'erro desconhecido'}`;
      } finally {
        busy = false;
        if (!closed) render();
      }
    }

    async function onDownload(part) {
      const p = ui.prepared;
      downloadBackupPart(part);
      ui.downloaded.add(part.part);
      render();
      if (ui.downloaded.size !== p.parts.length || ui.recorded) return;
      if (ui.infoStatus !== 'ok') {
        ui.recorded = { ok: false, error: 'Arquivo(s) salvos no aparelho. A data não foi registrada no banco (o registro do último backup não foi lido).' };
        render();
        return;
      }
      busy = true;
      const r = await recordBackupDone(uid, p);
      busy = false;
      ui.recorded = r;
      if (r.ok) {
        try { onDone(r.info, p); } catch (e) { console.error(e); }
      }
      render();
    }

    document.body.appendChild(overlay);
    loadInfo();
  });
}
