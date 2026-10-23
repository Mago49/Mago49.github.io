// === PALETA DE CORES — Personalização de Cards (Bloco L) ===
// Função pura, sem document. — 30 tons pastéis fixos, na mesma família
// visual das cores de nível já existentes no app (--level-0 a --level-7,
// variables.css), pra manter consistência com o resto do sistema.
//
// Número fechado em 30 (não 100): navegável num dropdown pequeno em tela
// de celular, sem precisar de scroll excessivo pra escolher uma cor.

export const CARD_COLOR_PALETTE = [
  '#fce7f3', '#fbcfe8', '#f5d0fe', '#e9d5ff', '#ddd6fe',
  '#c7d2fe', '#bfdbfe', '#bae6fd', '#a5f3fc', '#99f6e4',
  '#ccfbf1', '#d1fae5', '#bbf7d0', '#dcfce7', '#ecfccb',
  '#d9f99d', '#fef9c3', '#fde68a', '#fed7aa', '#fecaca',
  '#e2e8f0', '#cbd5e1', '#e5e7eb', '#d4d4d8', '#e7e5e4',
  '#dbeafe', '#93c5fd', '#a5b4fc', '#f3e8ff', '#fae8ff'
];

// Escurece um hex em `amount` (0 a 1) — usado pra gerar a borda do card
// (tom mais escuro da própria cor escolhida), sem precisar de biblioteca
// externa nem de uma segunda cor cadastrada por plataforma.
export function darkenColor(hex, amount = 0.28) {
  const clean = String(hex).replace('#', '');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));

  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
