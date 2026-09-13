// === ORDENAÇÃO E FILTRO DE PLATAFORMAS ===
// Função pura (sem document.), usada tanto pela Página 2 (calendário) quanto
// pela Página 4 (edição). As duas páginas compartilham o MESMO menu de
// opções (ver ui-sort.js), mas aplicam de forma diferente:
// - Página 2: TODOS os itens só REORDENAM a lista (nada é escondido) —
//   usa sortPlatforms(), que nunca muda.
// - Página 4: cada modo filtra E ordena ao mesmo tempo (ex: "A - Z" só
//   mostra quem começa com letra, já em ordem; "Ativas" some com quem não
//   bate) — usa filterAndSortForManage(), a única função nova deste
//   arquivo. sortPlatforms() e filterPlatforms() (as duas funções antigas)
//   continuam EXATAMENTE como sempre foram; nenhuma das duas foi alterada
//   além da correção de bug documentada abaixo.
//
// Modos válidos: 'az' | 'za' | '1-9' | '9-1' | 'dias-asc' | 'dias-desc' |
// 'com' | 'sem' | 'ativas' | 'inativas'
//
// === CORREÇÃO — bugs em sortPlatforms() (Página 2 / Calendário) ===
// Dois bugs confirmados por teste manual em produção, isolados e corrigidos
// SÓ dentro de sortPlatforms() — filterAndSortForManage() (Página 4) não é
// tocada, continua exatamente como estava, já correta:
//
// 1) '1-9'/'9-1' usavam o MESMO comparador de 'az'/'za' (compareNames),
//    que só faz comparação alfanumérica "inteligente" sem separar quem
//    começa com letra de quem começa com número — letras apareciam
//    misturadas/antes dos números. Corrigido com startsWithDigitLocal(),
//    que prioriza nomes começados por dígito SEM esconder ninguém (regra
//    da Página 2: nunca filtra, só reordena).
//
// 2) 'ativas'/'inativas' só olhavam lastResetDate, ignorando cycleEnded —
//    uma plataforma pausada via "Fim" (cycleEnded = true) mas com
//    lastResetDate preenchido continuava contando como "ativa" na
//    ordenação. Corrigido com isPlatformActiveNow(), que considera as
//    duas condições juntas.
//
// Isso é a MESMA classe de bug já corrigida em isAtivaCadastro (usada só
// por filterAndSortForManage) — aqui é uma correção isolada e própria de
// sortPlatforms, sem criar dependência entre as duas funções.

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

// Usada só por sortPlatforms() (Página 2) — ver nota de correção acima.
// Nome próprio (Local) pra deixar claro que é escopo isolado desta função,
// sem qualquer relação com startsWithDigit usada por filterAndSortForManage.
function startsWithDigitLocal(name) {
  return /^[0-9]/.test(name);
}

// Usada só por sortPlatforms() (Página 2) — ver nota de correção acima.
// Mesma regra de "ativa" já validada em isAtivaCadastro (usada por
// filterAndSortForManage), mas mantida como função própria e isolada
// aqui, sem criar dependência cruzada entre as duas funções de topo do
// arquivo.
function isPlatformActiveNow(p) {
  return !!p.lastResetDate && !p.cycleEnded;
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
// regra no topo do arquivo.
export function sortPlatforms(list, mode) {
  const copy = [...list];

  switch (mode) {
    case 'az':
      return copy.sort(compareNames);
    case 'za':
      return copy.sort((a, b) => compareNames(b, a));
    case '1-9':
      // CORRIGIDO: dígito sempre antes de letra, sem esconder ninguém.
      // Dentro do mesmo grupo (dígito ou letra), mantém a ordenação
      // alfanumérica de sempre (compareNames).
      return copy.sort((a, b) => {
        const da = startsWithDigitLocal(a.name);
        const db = startsWithDigitLocal(b.name);
        if (da !== db) return da ? -1 : 1;
        return compareNames(a, b);
      });
    case '9-1':
      // CORRIGIDO: mesma prioridade de grupo do '1-9', com a ordenação
      // alfanumérica invertida dentro de cada grupo.
      return copy.sort((a, b) => {
        const da = startsWithDigitLocal(a.name);
        const db = startsWithDigitLocal(b.name);
        if (da !== db) return da ? -1 : 1;
        return compareNames(b, a);
      });
    case 'dias-asc':
      return copy.sort((a, b) => getCurrentCycleDay(a) - getCurrentCycleDay(b));
    case 'dias-desc':
      return copy.sort((a, b) => getCurrentCycleDay(b) - getCurrentCycleDay(a));
    case 'com':
      return copy.sort((a, b) => (b.group === 'com') - (a.group === 'com'));
    case 'sem':
      return copy.sort((a, b) => (b.group === 'sem') - (a.group === 'sem'));
    case 'ativas':
      // CORRIGIDO: agora considera cycleEnded, não só lastResetDate.
      return copy.sort((a, b) => isPlatformActiveNow(b) - isPlatformActiveNow(a));
    case 'inativas':
      // CORRIGIDO: mesma correção, ordem invertida.
      return copy.sort((a, b) => !isPlatformActiveNow(a) - !isPlatformActiveNow(b));
    default:
      return copy;
  }
}

// Esconde quem não bate com o modo, SEM ordenar. Função antiga, mantida
// por compatibilidade, mas não é mais usada por ui-platform-manage.js
// (que usa filterAndSortForManage abaixo). Intocada.
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
//
// INTOCADA nesta correção — já estava certa antes e continua certa agora.
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
