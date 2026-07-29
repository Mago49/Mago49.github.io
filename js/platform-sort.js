// === ORDENAÇÃO E FILTRO DE PLATAFORMAS ===
// Função pura (sem document.), usada tanto pela Página 2 (calendário) quanto
// pela Página 4 (edição). As duas páginas compartilham o MESMO menu de 8
// opções (ver ui-sort.js), mas aplicam de forma diferente:
// - Página 2: todos os 8 itens só REORDENAM a lista (nada é escondido).
// - Página 4: os 4 primeiros reordenam; os 4 últimos (grupo/status) ESCONDEM
//   quem não bate, usando filterPlatforms() em vez de sortPlatforms().
//
// Modos válidos: '1-9' | '9-1' | 'dias-asc' | 'dias-desc' | 'com' | 'sem' | 'ativas' | 'inativas'

import { getCurrentCycleDay } from './cycle-logic.js';

// Comparação "numérica" de nomes: trata blocos de dígitos como número, não
// caractere por caractere. Garante que códigos como "551X"/"552X"/"61T"
// ordenem de forma coerente com o que um humano esperaria ao ler "1-9".
function compareNames(a, b) {
  return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// Reordena a lista (não esconde nada). Sort estável: dentro de um mesmo
// "grupo" (ex: todas as "com aposta" no topo), a ordem relativa entre elas
// não muda sem necessidade.
export function sortPlatforms(list, mode) {
  const copy = [...list];

  switch (mode) {
    case '1-9':
      return copy.sort(compareNames);
    case '9-1':
      return copy.sort((a, b) => compareNames(b, a));
    case 'dias-asc':
      return copy.sort((a, b) => getCurrentCycleDay(a) - getCurrentCycleDay(b));
    case 'dias-desc':
      return copy.sort((a, b) => getCurrentCycleDay(b) - getCurrentCycleDay(a));
    case 'com':
      return copy.sort((a, b) => (b.group === 'com') - (a.group === 'com'));
    case 'sem':
      return copy.sort((a, b) => (b.group === 'sem') - (a.group === 'sem'));
    case 'ativas':
      return copy.sort((a, b) => (!!b.lastResetDate) - (!!a.lastResetDate));
    case 'inativas':
      return copy.sort((a, b) => (!b.lastResetDate) - (!a.lastResetDate));
    default:
      return copy;
  }
}

// Esconde quem não bate com o modo. Usado só pelos 4 itens de grupo/status
// na Página 4. 'inativas' = nunca teve lastResetDate definido (conforme
// definido no projeto); 'ativas' é o complemento disso.
export function filterPlatforms(list, mode) {
  switch (mode) {
    case 'com':
      return list.filter(p => p.group === 'com');
    case 'sem':
      return list.filter(p => p.group === 'sem');
    case 'ativas':
      return list.filter(p => !!p.lastResetDate);
    case 'inativas':
      return list.filter(p => !p.lastResetDate);
    default:
      return list;
  }
}

export const SORT_ONLY_MODES = new Set(['1-9', '9-1', 'dias-asc', 'dias-desc']);
export const FILTER_MODES = new Set(['com', 'sem', 'ativas', 'inativas']);

// Lista única de opções do menu "Ordenar" — mesmo menu nas páginas 2 e 4.
// dias-desc = "mais dias primeiro" (+), dias-asc = "menos dias primeiro" (−).
export const SORT_MENU_OPTIONS = [
  { value: '1-9', label: '1 – 9' },
  { value: '9-1', label: '9 – 1' },
  { value: 'dias-desc', label: '+ Dias no ciclo' },
  { value: 'dias-asc', label: '− Dias no ciclo' },
  { value: 'com', label: 'Com Apostas' },
  { value: 'sem', label: 'Sem Apostas' },
  { value: 'ativas', label: 'Ativas no ciclo' },
  { value: 'inativas', label: 'Inativas' }
];
