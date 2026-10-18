// === (Sub-entrega 31) MOTIVOS DO 🏁 ENCERRAR O DIA ===
// Motivos fixos (do sistema) + motivos criados pelo usuário (botão +),
// guardados em users/{uid}/plannerConfig/stopReasons:
//   { reasons: [{ id:'c_…', emoji, label, kind, createdAt }], updatedAt }
// Cada dia encerrado (planLog.stop) grava o id do motivo E uma cópia do
// nome/tipo na hora (reasonLabel/reasonKind): apagar ou renomear um motivo
// depois NUNCA muda o que já foi gravado — o histórico fica legível pra
// análises futuras (IA).
// kind: 'gain' (parou ganhando) | 'loss' (parou perdendo) | 'neutral' |
// tipo criado pelo usuário 'k_…' (botão + Tipo), no mesmo documento:
//   { reasons:[…], kinds: [{ id:'k_…', emoji, label, createdAt }] }
// O dia grava também a cópia do nome do tipo (reasonKindLabel).
// Puro: sem Firestore nem DOM.

export const STOP_REASON_KINDS = Object.freeze(['gain', 'loss', 'neutral']);
export const BUILTIN_STOP_KINDS = Object.freeze([
  Object.freeze({ id: 'gain', emoji: '📈', label: 'Ganho' }),
  Object.freeze({ id: 'loss', emoji: '📉', label: 'Perda' }),
  Object.freeze({ id: 'neutral', emoji: '➖', label: 'Neutro' })
]);
export const STOP_KIND_LABEL = Object.freeze({ gain: '📈 Ganho', loss: '📉 Perda', neutral: '➖ Neutro' });
export const CUSTOM_STOP_KIND_MAX = 20;
const CUSTOM_KIND_ID_RE = /^k_[a-z0-9]{4,24}$/;
export const DEFAULT_KIND_EMOJI = '🔖';

export function isStopKindId(id) {
  return typeof id === 'string' && (STOP_REASON_KINDS.includes(id) || CUSTOM_KIND_ID_RE.test(id));
}

export function newCustomStopKindId(now = Date.now()) {
  return `k_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const BUILTIN_STOP_REASONS = Object.freeze([
  Object.freeze({ id: 'premio', emoji: '💰', label: 'Prêmio alto', kind: 'gain' }),
  Object.freeze({ id: 'meta', emoji: '🎯', label: 'Meta de ganho batida', kind: 'gain' }),
  Object.freeze({ id: 'perda', emoji: '📉', label: 'Perda', kind: 'loss' }),
  Object.freeze({ id: 'perdaExcessiva', emoji: '🚨', label: 'Perda excessiva', kind: 'loss' }),
  Object.freeze({ id: 'outro', emoji: '✋', label: 'Outro motivo', kind: 'neutral' }),
  // 🔄 Atualizar com "Descontar" desligado (Sub 29b) — não aparece na escolha.
  Object.freeze({ id: 'adiado', emoji: '⏩', label: 'Resto adiado', kind: 'neutral', hidden: true })
]);

export const CUSTOM_STOP_REASON_MAX = 30;
export const STOP_LABEL_MAX = 30;
export const STOP_EMOJI_MAX = 8;
const CUSTOM_ID_RE = /^c_[a-z0-9]{4,24}$/;
const BUILTIN_IDS = new Set(BUILTIN_STOP_REASONS.map(r => r.id));
export const DEFAULT_CUSTOM_EMOJI = '🏷️';
// Sugestões rápidas pro emoji (o teclado do celular continua valendo).
export const STOP_EMOJI_SUGGESTIONS = Object.freeze(['😤', '🧊', '⏰', '🔁', '🤖', '📵', '💤', '🎰', '⚠️', '🧠']);

export function isStopReasonId(id) {
  return typeof id === 'string' && (BUILTIN_IDS.has(id) || CUSTOM_ID_RE.test(id));
}

export function newCustomStopReasonId(now = Date.now()) {
  return `c_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Um tipo criado pelo usuário, limpo (ou null). */
export function cleanCustomStopKind(k) {
  if (!k || typeof k !== 'object' || !CUSTOM_KIND_ID_RE.test(String(k.id))) return null;
  const label = cleanText(k.label, STOP_LABEL_MAX);
  if (!label) return null;
  const emoji = Array.from(cleanText(k.emoji, 32)).slice(0, STOP_EMOJI_MAX).join('') || DEFAULT_KIND_EMOJI;
  return { id: String(k.id), emoji, label, createdAt: typeof k.createdAt === 'string' ? k.createdAt : null };
}

export function sanitizeCustomStopKinds(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanCustomStopKind)
    .filter(k => k && !seen.has(k.id) && seen.add(k.id))
    .slice(0, CUSTOM_STOP_KIND_MAX);
}

/** { emoji, label } de um tipo: fixo → criado → cópia gravada → Neutro. */
export function stopKindInfo(id, kinds, snapshotLabel = '') {
  const b = BUILTIN_STOP_KINDS.find(k => k.id === id);
  if (b) return { emoji: b.emoji, label: b.label };
  const c = (kinds || []).find(k => k.id === id);
  if (c) return { emoji: c.emoji, label: c.label };
  if (typeof snapshotLabel === 'string' && snapshotLabel.trim()) return { emoji: '', label: snapshotLabel.trim().slice(0, 40) };
  return { emoji: '➖', label: 'Neutro' };
}

export function stopKindText(id, kinds, snapshotLabel = '') {
  const i = stopKindInfo(id, kinds, snapshotLabel);
  return i.emoji ? `${i.emoji} ${i.label}` : i.label;
}

/** Nome de tipo repetido (fixos + criados)? */
export function isDuplicateKindLabel(label, kinds, exceptId = null) {
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const k = norm(label);
  if (!k) return false;
  return BUILTIN_STOP_KINDS.some(x => norm(x.label) === k)
    || (kinds || []).some(x => x.id !== exceptId && norm(x.label) === k);
}

/** Um motivo criado pelo usuário, limpo (ou null). */
export function cleanCustomStopReason(r) {
  if (!r || typeof r !== 'object' || !CUSTOM_ID_RE.test(String(r.id))) return null;
  const label = cleanText(r.label, STOP_LABEL_MAX);
  if (!label) return null;
  // Array.from conta emoji composto (🏷️) direito; corta por "caractere".
  const emoji = Array.from(cleanText(r.emoji, 32)).slice(0, STOP_EMOJI_MAX).join('') || DEFAULT_CUSTOM_EMOJI;
  return {
    id: String(r.id),
    emoji,
    label,
    kind: isStopKindId(r.kind) ? r.kind : 'neutral',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : null
  };
}

// kinds (opcional): tipo criado que não existe mais vira Neutro.
export function sanitizeCustomStopReasons(list, kinds = null) {
  const seen = new Set();
  const kindIds = kinds ? new Set(kinds.map(k => k.id)) : null;
  return (Array.isArray(list) ? list : []).map(cleanCustomStopReason)
    .filter(r => r && !seen.has(r.id) && seen.add(r.id))
    .map(r => (kindIds && !STOP_REASON_KINDS.includes(r.kind) && !kindIds.has(r.kind) ? { ...r, kind: 'neutral' } : r))
    .slice(0, CUSTOM_STOP_REASON_MAX);
}

/** Nome repetido (sem maiúscula/acento/espaço) entre fixos e criados? */
export function isDuplicateStopLabel(label, customs, exceptId = null) {
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const k = norm(label);
  if (!k) return false;
  return BUILTIN_STOP_REASONS.some(r => norm(r.label) === k)
    || (customs || []).some(r => r.id !== exceptId && norm(r.label) === k);
}

/**
 * { emoji, label, kind } de um motivo: fixo → criado (lista atual) → cópia
 * gravada no dia (motivo apagado depois) → "Outro motivo".
 */
export function stopReasonInfo(id, customs, snapshot = null) {
  const b = BUILTIN_STOP_REASONS.find(r => r.id === id);
  if (b) return { emoji: b.emoji, label: b.label, kind: b.kind };
  const c = (customs || []).find(r => r.id === id);
  if (c) return { emoji: c.emoji, label: c.label, kind: c.kind };
  if (snapshot && typeof snapshot.reasonLabel === 'string' && snapshot.reasonLabel.trim()) {
    return {
      emoji: '',
      label: snapshot.reasonLabel.trim().slice(0, 40),
      kind: isStopKindId(snapshot.reasonKind) ? snapshot.reasonKind : 'neutral'
    };
  }
  const o = BUILTIN_STOP_REASONS.find(r => r.id === 'outro');
  return { emoji: o.emoji, label: o.label, kind: o.kind };
}

export function stopReasonText(id, customs, snapshot = null) {
  const i = stopReasonInfo(id, customs, snapshot);
  return i.emoji ? `${i.emoji} ${i.label}` : i.label;
}

/** Cópia gravada junto do stop (nome com emoji + tipo + nome do tipo). */
export function stopReasonSnapshot(id, customs, kinds = []) {
  const i = stopReasonInfo(id, customs);
  return {
    reasonLabel: (i.emoji ? `${i.emoji} ${i.label}` : i.label).slice(0, 40),
    reasonKind: i.kind,
    reasonKindLabel: stopKindText(i.kind, kinds).slice(0, 40)
  };
}

/**
 * Motivo sugerido pelo resultado do dia (centavos). O usuário troca.
 *   R.B. ≥ meta do dia → 💰 Prêmio alto
 *   perda ≥ meta do dia → 🚨 Perda excessiva
 *   perda → 📉 Perda
 */
export function suggestStopReason(rbC, plannedC) {
  const rb = Math.round(Number(rbC) || 0);
  const planned = Math.max(0, Math.round(Number(plannedC) || 0));
  if (rb > 0 && rb >= planned) return 'premio';
  if (rb < 0 && planned > 0 && -rb >= planned) return 'perdaExcessiva';
  if (rb < 0) return 'perda';
  return 'outro';
}
