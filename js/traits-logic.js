// === CARACTERÍSTICAS (plataformas e jogos) — lógica pura (Sub-entrega 11a) ===
// Etiquetas curtas + texto livre, pensados pra leitura futura por IA.
// Sem DOM e sem Firestore.
//   traits = { tags: ['paga bem no N2', ...], text: '...' }

export const TRAIT_TAGS_MAX = 20;
export const TRAIT_TAG_MAX = 30;
export const TRAITS_TEXT_MAX = 2000;

function clean(s, max) {
  return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
}

function key(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function cleanTags(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach(t => {
    const v = clean(t, TRAIT_TAG_MAX);
    const k = key(v);
    if (!v || seen.has(k)) return;
    seen.add(k);
    out.push(v);
  });
  return out.slice(0, TRAIT_TAGS_MAX);
}

export function cleanTraitsText(text) {
  // Mantém quebras de linha; corta espaços nas pontas.
  return String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').trim().slice(0, TRAITS_TEXT_MAX);
}

export function cleanTraits(t) {
  return { tags: cleanTags(t && t.tags), text: cleanTraitsText(t && t.text) };
}

export function isEmptyTraits(t) {
  const c = cleanTraits(t);
  return c.tags.length === 0 && !c.text;
}

/** Etiquetas já usadas (pra sugerir), mais usadas primeiro. */
export function tagSuggestions(allTraits, exclude = []) {
  const count = new Map();
  const label = new Map();
  (allTraits || []).forEach(t => cleanTags(t && t.tags).forEach(tag => {
    const k = key(tag);
    count.set(k, (count.get(k) || 0) + 1);
    if (!label.has(k)) label.set(k, tag);
  }));
  const ex = new Set((exclude || []).map(key));
  return [...count.entries()].filter(([k]) => !ex.has(k)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => label.get(k)).slice(0, 20);
}
