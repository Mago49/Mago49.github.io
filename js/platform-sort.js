// === ORDENAÇÃO E FILTRO DE PLATAFORMAS ===
// Função pura (sem document.), usada tanto pela Página 2 (calendário) quanto
// pela Página 4 (edição). As duas páginas compartilham o MESMO menu de
// opções (ver ui-sort.js), mas aplicam de forma diferente:
// - Página 2: TODOS os itens só REORDENAM a lista (nada é escondido) —
//   usa sortPlatforms(), que nunca muda.
// - Página 4: cada modo filtra E ordena ao mesmo tempo (ex: "A - Z" só
//   mostra quem começa com letra, já em ordem alfabética; "Ativas" some
//   com quem não bate) — usa filterAndSortForManage(), a única função
//   nova deste arquivo. sortPlatforms() e filterPlatforms() (as duas
//   funções antigas) continuam EXATAMENTE como sempre foram; nenhuma das
//   duas foi alterada — só ganharam vizinhas novas.
//
// Modos válidos: 'az' | 'za' | '1-9' | '9-1' | 'dias-asc' | 'dias-desc' |
// 'com' | 'sem' | 'ativas' | 'inativas'

import { getCurrentCycleDay } from './cycle-logic.js';

// Comparação "numérica" de nomes: trata blocos de dígitos como número, não
// caractere por caractere. Garante que códigos como "551X"/"552X"/"61T"
// ordenem de forma coerente com o que um humano esperaria ao ler "1-9".
function compareNames(a, b) {
  return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function startsWithLetter(name) {
  return /^[A-Za-z]/.test(name);
}

function startsWithDigit(name) {
  return /^[0-9]/.test(name);
}

// "Ativas"/"Inativas" (Página 4) — definição CORRIGIDA (Ponto 1): antes
// só olhava lastResetDate, o que fazia uma plataforma já reiniciada mas
// depois pausada (Fim -> cycleEnded=true) aparecer errada em "Ativas".
// Agora considera as duas coisas.
function isAtivaCadastro(p) {
  return !!p.lastResetDate && !p.cycleEnded;
}

// "+ Dias no ciclo"/"− Dias no ciclo" (Página 4) — filtro de quem está
// "ativa no ciclo NO MOMENTO DO CLIQUE", um pouco mais estrito que
// isAtivaCadastro: também exige que o dia do ciclo já tenha começado
// (getCurrentCycleDay > 0), senão não faz sentido ordenar por "dias no
// ciclo" quem ainda está no Dia 0.
function isAtivaNoCicloAgora(p) {
  return !!p.lastResetDate && !p.cycleEnded && getCurrentCycleDay(p) > 0;
}

// Reordena a lista (não esconde nada). Sort estável: dentro de um mesmo
// "grupo" (ex: todas as "com aposta" no topo), a ordem relativa entre elas
// não muda sem necessidade.
//
// Usada SÓ pela Página 2 (ui-platform-cards.js) — nunca esconde nada, ver
// regra no topo do arquivo. INTOCADA pelo Ponto 1: 'az'/'za' foram
// adicionados aqui como dois casos novos (mesmo comparador que 1-9/9-1já
// usam), mas os casos existentes continuam byte a byte como sempre foram.
export function sortPlatforms(list, mode) {
  const copy = [...list];

  switch (mode) {
    case 'az':
      return copy.sort(compareNames);
    case 'za':
      return copy.sort((a, b) => compareNames(b, a));
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

// Esconde quem não bate com o modo, SEM ordenar. Função antiga, intocada
// pelo Ponto 1 — mantida por compatibilidade, mas não é mais usada por
// ui-platform-manage.js (que agora usa filterAndSortForManage abaixo).
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

// Filtra E ordena ao mesmo tempo — usada SÓ pela Página 4
// (ui-platform-manage.js). Cada modo (exceto Padrão, tratado fora desta
// função) decide quem aparece E em que ordem, conforme a tabela fechada
// no Ponto 1:
//   az/za        -> só nomes que começam com LETRA, em ordem alfabética
//   1-9/9-1      -> só nomes que começam com NÚMERO, em ordem numérica
//   dias-desc/asc-> só quem está ATIVA NO CICLO agora, ordenada por "Dia X"
//   com/sem      -> só do grupo correspondente (sem ordenação extra)
//   ativas       -> !!lastResetDate && !cycleEnded (bug corrigido)
//   inativas     -> !lastResetDate || cycleEnded (bug corrigido)
export function filterAndSortForManage(list, mode) {
  switch (mode) {
    case 'az':
      return list.filter(p => startsWithLetter(p.name)).sort(compareNames);
    case 'za':
      return list.filter(p => startsWithLetter(p.name)).sort((a, b) => compareNames(b, a));
    case '1-9':
      return list.filter(p => startsWithDigit(p.name)).sort(compareNames);
    case '9-1':
      return list.filter(p => startsWithDigit(p.name)).sort((a, b) => compareNames(b, a));
    case 'dias-desc':
      return list.filter(isAtivaNoCicloAgora).sort((a, b) => getCurrentCycleDay(b) - getCurrentCycleDay(a));
    case 'dias-asc':
      return list.filter(isAtivaNoCicloAgora).sort((a, b) => getCurrentCycleDay(a) - getCurrentCycleDay(b));
    case 'com':
      return list.filter(p => p.group === 'com');
    case 'sem':
      return list.filter(p => p.group === 'sem');
    case 'ativas':
      return list.filter(isAtivaCadastro);
    case 'inativas':
      return list.filter(p => !isAtivaCadastro(p));
    default:
      return list;
  }
}

export const SORT_ONLY_MODES = new Set(['az', 'za', '1-9', '9-1', 'dias-asc', 'dias-desc']);
export const FILTER_MODES = new Set(['com', 'sem', 'ativas', 'inativas']);

// Lista única de opções do menu "Ordenar" — mesmo menu nas páginas 2 e 4,
// cada uma interpretando os cliques do seu jeito (ver topo do arquivo).
// dias-desc = "mais dias primeiro" (+), dias-asc = "menos dias primeiro" (−).
export const SORT_MENU_OPTIONS = [
  { value: 'az', label: 'A - Z' },
  { value: 'za', label: 'Z - A' },
  { value: '1-9', label: '1 – 9' },
  { value: '9-1', label: '9 – 1' },
  { value: 'dias-desc', label: '+ Dias no ciclo' },
  { value: 'dias-asc', label: '− Dias no ciclo' },
  { value: 'com', label: 'Com Apostas' },
  { value: 'sem', label: 'Sem Apostas' },
  { value: 'ativas', label: 'Ativas no ciclo' },
  { value: 'inativas', label: 'Inativas' }
];
