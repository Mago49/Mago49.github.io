// === VELOCIDADE DE INVESTIMENTO POR PLATAFORMA (Sub-entrega 11a) ===
// Lógica pura (sem DOM, sem Firestore).
//
// Cada plataforma tem um PESO (×1 = normal, ×2 = investir o dobro,
// ×0,5 = segurar) e ÉPOCAS opcionais com data ("paga mais de 01/11 a
// 15/11 → ×2"). Fica em plannerConfig/speed — fora do documento da
// plataforma (não pesa no limite de 1 MB, não passa pelo savePlatform).
//
// ONDE O PESO AGE (nunca muda valor de bônus, Saldo ou Rollover):
//   1) META DO PLANO: dias dentro de uma época recebem uma fatia maior da
//      meta (peso do dia × multiplicador da época); "Usar Rollover/
//      projetado" sugere a meta × peso de hoje.
//   2) PRIORIDADE DE DEPÓSITO: o otimizador do Misterioso escolhe pelo
//      ganho × peso de hoje (o ganho mostrado continua o real).
//
//   speed = { platforms: { [platformId]: { base, epochs:[{ id, label, from,
//             to, mult }] } } }
// Peso efetivo do dia = base × (maior multiplicador das épocas que cobrem
// o dia; 1 se nenhuma).

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 5;
export const SPEED_PRESETS = Object.freeze([0.5, 1, 1.5, 2, 3]);
export const EPOCHS_MAX = 24;
export const EPOCH_LABEL_MAX = 30;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampMult(v, fallback = 1) {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function sanitizeEpoch(e, i = 0) {
  if (!e || !KEY_RE.test(String(e.from)) || !KEY_RE.test(String(e.to))) return null;
  const from = String(e.from);
  const to = String(e.to);
  if (from > to) return null;
  return {
    id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : `e${i}`,
    label: String(e.label || '').replace(/\s+/g, ' ').trim().slice(0, EPOCH_LABEL_MAX),
    from,
    to,
    mult: clampMult(e.mult)
  };
}

export function sanitizePlatformSpeed(s) {
  const base = clampMult(s && s.base);
  const epochs = (Array.isArray(s && s.epochs) ? s.epochs : [])
    .map(sanitizeEpoch).filter(Boolean)
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, EPOCHS_MAX);
  return { base, epochs };
}

export function isDefaultSpeed(s) {
  const c = sanitizePlatformSpeed(s);
  return c.base === 1 && c.epochs.length === 0;
}

export function sanitizeSpeedConfig(cfg) {
  const out = {};
  const src = cfg && cfg.platforms && typeof cfg.platforms === 'object' ? cfg.platforms : {};
  Object.entries(src).forEach(([pid, s]) => {
    if (!pid || pid.length > 100) return;
    const c = sanitizePlatformSpeed(s);
    if (c.base !== 1 || c.epochs.length) out[pid] = c;
  });
  return { platforms: out };
}

export function getPlatformSpeed(cfg, platformId) {
  const s = cfg && cfg.platforms ? cfg.platforms[platformId] : null;
  return s ? sanitizePlatformSpeed(s) : { base: 1, epochs: [] };
}

/** Épocas que cobrem o dia (pode haver mais de uma). */
export function epochsAt(cfg, platformId, dayKey) {
  return getPlatformSpeed(cfg, platformId).epochs.filter(e => e.from <= dayKey && dayKey <= e.to);
}

/** Multiplicador só das épocas no dia (1 se nenhuma). */
export function epochMultAt(cfg, platformId, dayKey) {
  const list = epochsAt(cfg, platformId, dayKey);
  return list.length ? Math.max(...list.map(e => e.mult)) : 1;
}

/** Peso efetivo do dia: base × época. */
export function speedAt(cfg, platformId, dayKey) {
  const s = getPlatformSpeed(cfg, platformId);
  return Math.round(s.base * epochMultAt(cfg, platformId, dayKey) * 100) / 100;
}

/**
 * Mapa dia → multiplicador das épocas no período (só dias ≠ 1). É o que
 * vai GRAVADO no plano (params.dayBoost): o plano salvo regera igual mesmo
 * que as épocas mudem depois.
 */
export function dayBoostsFor(cfg, platformId, startKey, endKey) {
  const out = {};
  if (!KEY_RE.test(String(startKey)) || !KEY_RE.test(String(endKey)) || startKey > endKey) return out;
  const epochs = getPlatformSpeed(cfg, platformId).epochs;
  if (!epochs.length) return out;
  let k = startKey;
  let guard = 0;
  while (k <= endKey && guard < 400) {
    const m = epochMultAt(cfg, platformId, k);
    if (m !== 1) out[k] = m;
    k = addDaysKey(k, 1);
    guard++;
  }
  return out;
}

/** Função de prioridade pro otimizador do Misterioso. */
export function priorityResolver(cfg, todayKey) {
  return (platformId) => speedAt(cfg, platformId, todayKey);
}

export function formatMult(m) {
  return `×${Number(m).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

export function newEpochId() {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
