// === BACKUP — lógica pura (Sub-entrega 10) ===
// Sem DOM e sem Firestore: tudo aqui é testável no Node.
//
// 1) TAMANHO REAL NO FIRESTORE — fórmula oficial do Google ("Storage size
//    calculations", Firestore modo nativo):
//      string           = bytes UTF-8 + 1
//      número           = 8      booleano = 1      nulo = 1
//      timestamp        = 8      array = soma dos valores
//      map              = calculado como documento (campos + 32)
//      nome do campo    = bytes UTF-8 + 1
//      nome do documento= soma de (id de coleção + id de documento) do
//                         caminho, cada um como string, + 16
//      DOCUMENTO        = nome + Σ nomes dos campos + Σ valores + 32
//    Limite por documento: 1 MiB (1.048.576 bytes) — passou disso, o
//    Firestore RECUSA a gravação (a plataforma para de salvar).
//    Índices automáticos ocupam espaço extra no plano, mas NÃO contam no
//    limite de 1 MiB do documento.
//
// 2) DIVISÃO EM PARTES — por DOCUMENTO INTEIRO (nunca corta um documento).
//    Cada parte leva o cabeçalho { format, version, backupId, part,
//    totalParts, ... } e a parte 1 leva o manifesto (quantos documentos de
//    cada coleção estão em cada parte). Depois de dividir, as partes são
//    RELIDAS e recontadas: se o total não bater com o que foi lido do
//    banco, o backup é recusado (verifyParts).
//
// 3) DIFERENCIAL ("Só o novo") — desde o último backup COMPLETO (não em
//    cadeia): pra restaurar basta o último completo + o último "só o novo".
//    Só os históricos com id por data são filtrados, com 7 dias de folga
//    antes do completo; todo o resto vem inteiro sempre.

export const BACKUP_FORMAT = 'painel-tigrinho-backup';
export const BACKUP_VERSION = 1;

export const FIRESTORE_DOC_LIMIT = 1048576; // 1 MiB
export const FREE_PLAN_STORAGE = 1073741824; // 1 GiB (plano gratuito)
export const DOC_WARN_PCT = 0.7;
export const DOC_DANGER_PCT = 0.9;

export const PART_LIMIT_OPTIONS_MB = [1, 2, 4, 8];
export const DEFAULT_PART_LIMIT_MB = 4;
export const DIFF_OVERLAP_DAYS = 7;

export const COLLECTIONS = [
  'platforms', 'vipHistory', 'dailySnapshots', 'misteriosoTemplates', 'vipBonusTemplates',
  'wagerRequirements', 'betPlans', 'plannerConfig',
  'routines', 'routineLog', 'routineMarks',
  'planLog',
  'gameCatalog', 'gameConfig',
  'platformTraits'
];
export const META_DOCS = ['initialized', 'cardCustomization', 'obrigadoConfig', 'preferences', 'backupInfo'];

// Históricos com id por data — os únicos filtrados no "Só o novo".
//   key: 'day'   → id começa com AAAA-MM-DD (planLog: AAAA-MM-DD_plataforma)
//        'month' → id AAAA-MM
export const DIFF_COLLECTIONS = Object.freeze({
  dailySnapshots: 'day',
  routineLog: 'day',
  routineMarks: 'day',
  planLog: 'day',
  vipHistory: 'month'
});

export const COLLECTION_LABELS = Object.freeze({
  platforms: 'Plataformas',
  vipHistory: 'Histórico VIP (meses)',
  dailySnapshots: 'Fotos diárias',
  misteriosoTemplates: 'Templates Misterioso',
  vipBonusTemplates: 'Templates VIP',
  wagerRequirements: 'Aposta necessária',
  betPlans: 'Planos de aposta',
  plannerConfig: 'Config. do Planejador',
  routines: 'Rotinas',
  routineLog: 'Histórico de rotinas',
  routineMarks: 'Lembretes marcados',
  planLog: 'Histórico do planejado',
  gameCatalog: 'Biblioteca de jogos',
  gameConfig: 'Provedores',
  platformTraits: 'Características das plataformas',
  meta: 'Configurações gerais'
});

// ---------- tamanho (fórmula do Firestore) ----------

export function utf8Bytes(str) {
  const s = String(str);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export function stringSize(str) {
  return utf8Bytes(str) + 1;
}

export function valueSize(v) {
  if (v === null || v === undefined) return 1;
  switch (typeof v) {
    case 'boolean': return 1;
    case 'number': return 8;
    case 'string': return stringSize(v);
    case 'object':
      if (Array.isArray(v)) return v.reduce((s, x) => s + valueSize(x), 0);
      if (typeof v.toMillis === 'function') return 8; // Timestamp do SDK
      if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length === 2) return 16;
      return fieldsSize(v) + 32; // map: como documento
    default: return 0;
  }
}

function fieldsSize(obj) {
  let s = 0;
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue; // o SDK não grava undefined
    s += stringSize(k) + valueSize(v);
  }
  return s;
}

/** segments: ['users', uid, 'platforms', id] */
export function docNameSize(segments) {
  return segments.reduce((s, seg) => s + stringSize(seg), 0) + 16;
}

export function docSize(segments, data) {
  return docNameSize(segments) + fieldsSize(data) + 32;
}

// Os campos que mais pesam num documento (pra saber o que arquivar depois).
export function biggestFields(data, top = 3) {
  return Object.entries(data || {})
    .filter(([, v]) => v !== undefined)
    .map(([field, v]) => ({ field, bytes: stringSize(field) + valueSize(v), items: Array.isArray(v) ? v.length : null }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top);
}

export function docLevel(bytes) {
  const pct = bytes / FIRESTORE_DOC_LIMIT;
  return pct >= DOC_DANGER_PCT ? 'danger' : pct >= DOC_WARN_PCT ? 'warn' : 'ok';
}

/**
 * Relatório de tamanho do que foi lido.
 * collections: { nome: [{ id, data }] }   meta: { id: data|null }
 */
export function buildSizeReport(uid, collections, meta) {
  const rows = [];
  let total = 0;
  COLLECTIONS.forEach(name => {
    const list = (collections && collections[name]) || [];
    const bytes = list.reduce((s, d) => s + docSize(['users', uid, name, d.id], d.data), 0);
    total += bytes;
    rows.push({ name, label: COLLECTION_LABELS[name] || name, docs: list.length, bytes });
  });
  let metaBytes = 0;
  let metaDocs = 0;
  Object.entries(meta || {}).forEach(([id, data]) => {
    if (!data) return;
    metaDocs++;
    metaBytes += docSize(['users', uid, 'meta', id], data);
  });
  total += metaBytes;
  rows.push({ name: 'meta', label: COLLECTION_LABELS.meta, docs: metaDocs, bytes: metaBytes });

  const platforms = ((collections && collections.platforms) || []).map(d => {
    const bytes = docSize(['users', uid, 'platforms', d.id], d.data);
    return {
      id: d.id,
      name: (d.data && d.data.name) || d.id,
      bytes,
      pct: bytes / FIRESTORE_DOC_LIMIT,
      level: docLevel(bytes),
      biggest: biggestFields(d.data)
    };
  }).sort((a, b) => b.bytes - a.bytes);

  // Maior documento fora das plataformas (também tem o limite de 1 MiB).
  let largestOther = null;
  COLLECTIONS.filter(n => n !== 'platforms').forEach(name => {
    ((collections && collections[name]) || []).forEach(d => {
      const bytes = docSize(['users', uid, name, d.id], d.data);
      if (!largestOther || bytes > largestOther.bytes) largestOther = { collection: name, id: d.id, bytes, pct: bytes / FIRESTORE_DOC_LIMIT, level: docLevel(bytes) };
    });
  });

  return {
    totalBytes: total,
    totalPctOfFree: total / FREE_PLAN_STORAGE,
    collections: rows,
    platforms,
    largestOther,
    worstLevel: platforms.some(p => p.level === 'danger') || (largestOther && largestOther.level === 'danger') ? 'danger'
      : platforms.some(p => p.level === 'warn') || (largestOther && largestOther.level === 'warn') ? 'warn' : 'ok'
  };
}

// Estimativa local (sem ler o banco) a partir das plataformas em memória —
// usada no aviso do Perfil. Aproximada: a memória pode ter campos-padrão
// que o documento ainda não tem.
export function estimatePlatformSizes(uid, platforms) {
  return (platforms || []).map(p => {
    const { id, ...data } = p || {};
    const bytes = docSize(['users', uid || 'x', 'platforms', String(id)], data);
    return { id, name: p && p.name, bytes, pct: bytes / FIRESTORE_DOC_LIMIT, level: docLevel(bytes) };
  }).sort((a, b) => b.bytes - a.bytes);
}

// ---------- formatação ----------

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
  return `${(v / 1073741824).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

export function formatPct(x, digits = 1) {
  const v = (Number(x) || 0) * 100;
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v > 0 && v < 0.1 ? 3 : digits })}%`;
}

// ---------- diferencial ----------

function pad(n) {
  return String(n).padStart(2, '0');
}

export function localDayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/**
 * Limites do "Só o novo" a partir do último COMPLETO.
 * Devolve { dayKey, monthKey } — ids >= esses entram — ou null sem completo.
 */
export function diffSinceKeys(lastFullAt, overlapDays = DIFF_OVERLAP_DAYS) {
  if (!lastFullAt) return null;
  const t = new Date(lastFullAt);
  if (isNaN(t.getTime())) return null;
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - overlapDays, 12);
  const dayKey = localDayKey(d);
  return { dayKey, monthKey: dayKey.slice(0, 7) };
}

export function filterSince(list, kind, since) {
  if (!since) return list.slice();
  const min = kind === 'month' ? since.monthKey : since.dayKey;
  return (list || []).filter(d => String(d.id) >= min);
}

// ---------- montagem + divisão ----------

export function newBackupId(now = new Date()) {
  return `${localDayKey(now).replace(/-/g, '')}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildFilename(now, mode, part, totalParts) {
  const base = `backup-painel-${localDayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${mode === 'diff' ? '-so-novo' : ''}`;
  return totalParts > 1 ? `${base}-parte-${part}-de-${totalParts}.json` : `${base}.json`;
}

function countsOf(collections) {
  const c = {};
  COLLECTIONS.forEach(n => { c[n] = ((collections && collections[n]) || []).length; });
  return c;
}

/**
 * Divide em partes de até maxBytes (bytes UTF-8 do JSON). Documento maior
 * que o limite vai sozinho numa parte (nunca é cortado).
 * Devolve [{ part, totalParts, filename, text, bytes, counts }].
 */
export function splitBackup({ uid, now, mode, since, backupId, collections, meta, report }, maxBytes) {
  const limit = Math.max(64 * 1024, Number(maxBytes) || DEFAULT_PART_LIMIT_MB * 1048576);
  const header = (part, totalParts) => ({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    backupId,
    mode,
    since: since ? since.dayKey : null,
    exportedAt: now.toISOString(),
    uid,
    part,
    totalParts
  });
  // Esqueleto da parte (cabeçalho + coleções vazias) — base da medição.
  const emptyCollections = () => {
    const o = {};
    COLLECTIONS.forEach(n => { o[n] = []; });
    return o;
  };

  // Itens na ordem: meta e manifesto ficam na parte 1.
  const items = [];
  COLLECTIONS.forEach(name => ((collections && collections[name]) || []).forEach(d => {
    items.push({ name, doc: d, bytes: utf8Bytes(JSON.stringify(d)) + 1 });
  }));

  const baseBytes = utf8Bytes(JSON.stringify({ ...header(999, 999), counts: countsOf({}), data: { collections: emptyCollections(), meta: {} } }));
  const firstExtra = utf8Bytes(JSON.stringify(meta || {})) + utf8Bytes(JSON.stringify({ report: compactReport(report), manifest: COLLECTIONS.map(n => ({ n, c: [9999] })) }));

  const groups = [];
  let cur = [];
  let curBytes = baseBytes + firstExtra;
  items.forEach(it => {
    if (cur.length && curBytes + it.bytes > limit) {
      groups.push(cur);
      cur = [];
      curBytes = baseBytes;
    }
    cur.push(it);
    curBytes += it.bytes;
  });
  groups.push(cur); // a parte 1 sempre existe (mesmo sem documento)

  const totalParts = groups.length;
  const partCollections = groups.map(g => {
    const o = emptyCollections();
    g.forEach(it => o[it.name].push(it.doc));
    return o;
  });
  const manifest = partCollections.map((c, i) => ({ part: i + 1, counts: countsOf(c) }));

  return partCollections.map((c, i) => {
    const part = i + 1;
    const obj = {
      ...header(part, totalParts),
      counts: countsOf(c),
      data: { collections: c, meta: part === 1 ? (meta || {}) : {} }
    };
    if (part === 1) {
      obj.totalCounts = countsOf(collections);
      obj.manifest = manifest;
      obj.sizeReport = compactReport(report);
    }
    const text = JSON.stringify(obj);
    return { part, totalParts, filename: buildFilename(now, mode, part, totalParts), text, bytes: utf8Bytes(text), counts: obj.counts };
  });
}

// Versão enxuta do relatório que vai DENTRO do arquivo (consulta futura).
function compactReport(report) {
  if (!report) return null;
  return {
    totalBytes: report.totalBytes,
    collections: report.collections.map(r => ({ name: r.name, docs: r.docs, bytes: r.bytes })),
    platforms: report.platforms.map(p => ({ id: p.id, bytes: p.bytes }))
  };
}

/**
 * Relê as partes e confere documento por documento contra o que foi lido
 * do banco. Devolve { ok, docs, error }.
 */
export function verifyParts(parts, collections, meta) {
  const seen = {};
  COLLECTIONS.forEach(n => { seen[n] = new Set(); });
  let backupId = null;
  let metaOk = false;
  for (const p of parts) {
    let obj;
    try {
      obj = JSON.parse(p.text);
    } catch (e) {
      return { ok: false, error: `A parte ${p.part} não é um JSON válido.` };
    }
    if (obj.format !== BACKUP_FORMAT || obj.part !== p.part || obj.totalParts !== parts.length) {
      return { ok: false, error: `Cabeçalho inválido na parte ${p.part}.` };
    }
    if (backupId === null) backupId = obj.backupId;
    if (obj.backupId !== backupId) return { ok: false, error: 'As partes não são do mesmo backup.' };
    for (const n of COLLECTIONS) {
      for (const d of (obj.data.collections[n] || [])) {
        if (seen[n].has(d.id)) return { ok: false, error: `Documento repetido (${n}/${d.id}).` };
        seen[n].add(d.id);
      }
    }
    if (obj.part === 1) metaOk = JSON.stringify(obj.data.meta) === JSON.stringify(meta || {});
  }
  let docs = 0;
  for (const n of COLLECTIONS) {
    const src = (collections && collections[n]) || [];
    if (src.length !== seen[n].size) return { ok: false, error: `Contagem diferente em ${COLLECTION_LABELS[n] || n}: lidos ${src.length}, no arquivo ${seen[n].size}.` };
    for (const d of src) if (!seen[n].has(d.id)) return { ok: false, error: `Faltou ${n}/${d.id} no arquivo.` };
    docs += src.length;
  }
  if (!metaOk) return { ok: false, error: 'As configurações gerais não conferem no arquivo.' };
  return { ok: true, docs };
}

// Normaliza o meta/backupInfo lido do banco.
export function cleanBackupInfo(raw) {
  const r = raw || {};
  const mb = Number(r.partLimitMB);
  return {
    partLimitMB: PART_LIMIT_OPTIONS_MB.includes(mb) ? mb : DEFAULT_PART_LIMIT_MB,
    lastFullAt: typeof r.lastFullAt === 'string' ? r.lastFullAt : null,
    lastFullId: typeof r.lastFullId === 'string' ? r.lastFullId : null,
    lastAt: typeof r.lastAt === 'string' ? r.lastAt : null,
    lastMode: r.lastMode === 'diff' ? 'diff' : (r.lastMode === 'full' ? 'full' : null),
    lastId: typeof r.lastId === 'string' ? r.lastId : null,
    lastParts: Number.isInteger(r.lastParts) ? r.lastParts : null,
    lastDocs: Number.isInteger(r.lastDocs) ? r.lastDocs : null,
    lastTotalBytes: Number.isFinite(Number(r.lastTotalBytes)) ? Number(r.lastTotalBytes) : null
  };
}
