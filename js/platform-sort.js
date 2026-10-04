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
// 'com' | 'sem' | 'ativas' | 'inativas' | 'deposito-desc' | 'deposito-asc'
//
// === CORREÇÃO — RODADA 1 — bugs em sortPlatforms() (Página 2 / Calendário) ===
// 1) '1-9'/'9-1' usavam o MESMO comparador de 'az'/'za' (compareNames),
//    que só faz comparação alfanumérica "inteligente" sem separar quem
//    começa com letra de quem começa com número. Corrigido com
//    startsWithDigitLocal(), que prioriza nomes começados por dígito SEM
//    esconder ninguém (regra da Página 2: nunca filtra, só reordena).
// 2) 'ativas'/'inativas' só olhavam lastResetDate, ignorando cycleEnded —
//    uma plataforma pausada via "Fim" (cycleEnded = true) mas com
//    lastResetDate preenchido continuava contando como "ativa" na
//    ordenação. Corrigido com isPlatformActiveNow(), que considera as
//    duas condições juntas.
//
// === CORREÇÃO — RODADA 2 — testado em produção após a Rodada 1 ===
// 3) 'az' ainda usava compareNames puro (mesmo comparador de sempre), sem
//    agrupar por tipo de caractere. A colação usada por localeCompare
//    (pt-BR, numeric:true) coloca dígito antes de letra quando comparados
//    diretamente — por isso plataformas numéricas apareciam ANTES das
//    alfabéticas em 'az', mesmo com startsWithLetter() já existindo no
//    arquivo (usada por filterAndSortForManage) e nunca aplicada aqui.
//    'za' não sofria disso porque inverter a comparação inteira também
//    inverte a ordem dos dois grupos, o que já dava o resultado certo por
//    coincidência — confirmado correto em teste, mantido sem alteração.
// 4) 'inativas': na Rodada 1 a ordem de a/b foi invertida por engano
//    (!isPlatformActiveNow(a) - !isPlatformActiveNow(b)), o que ANULAVA o
//    efeito pretendido — as inativas continuavam no fim em vez de vir pra
//    frente. Corrigido pra seguir o MESMO padrão já usado e validado em
//    'ativas' (f(b) - f(a)), só invertendo o que f() significa.
// 5) 'dias-asc'/'dias-desc': nunca verificavam cycleEnded nem
//    lastResetDate — getCurrentCycleDay() calcula o dia só a partir de
//    lastResetDate, que É PRA CONTINUAR preenchido depois do "Fim" (dado
//    usado por edicao.html pra mostrar "Ciclo iniciado: DD/MM" mesmo com
//    o ciclo encerrado — nenhuma mudança nesse dado). O problema era só a
//    ORDENAÇÃO não filtrar esse caso: plataformas encerradas competiam
//    normalmente na comparação numérica de dias, em vez de ir pro fim.
//    Corrigido com a mesma prioridade "ativa primeiro" de
//    isPlatformActiveNow(), usando o dia só como critério de desempate
//    dentro do grupo ativo — nada escondido, só reordenado.
//
// Isso é a MESMA classe de bug já corrigida em isAtivaCadastro (usada só
// por filterAndSortForManage) — aqui é uma correção isolada e própria de
// sortPlatforms, sem criar dependência entre as duas funções.

import { getCurrentCycleDay, getDaysSinceLastDeposit } from './cycle-logic.js';

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
      // CORRIGIDO (Rodada 2): letra sempre antes de dígito. Dentro do
      // mesmo grupo (letra ou dígito), mantém a ordenação alfanumérica de
      // sempre (compareNames).
      return copy.sort((a, b) => {
        const la = startsWithLetter(a.name);
        const lb = startsWithLetter(b.name);
        if (la !== lb) return la ? -1 : 1;
        return compareNames(a, b);
      });
    case 'za':
      // Confirmado correto em teste — sem alteração.
      return copy.sort((a, b) => compareNames(b, a));
    case '1-9':
      // Confirmado correto em teste (Rodada 1) — sem alteração.
      return copy.sort((a, b) => {
        const da = startsWithDigitLocal(a.name);
        const db = startsWithDigitLocal(b.name);
        if (da !== db) return da ? -1 : 1;
        return compareNames(a, b);
      });
    case '9-1':
      // Confirmado correto em teste (Rodada 1) — sem alteração.
      return copy.sort((a, b) => {
        const da = startsWithDigitLocal(a.name);
        const db = startsWithDigitLocal(b.name);
        if (da !== db) return da ? -1 : 1;
        return compareNames(b, a);
      });
    case 'dias-asc':
      // CORRIGIDO (Rodada 2): plataformas encerradas ou nunca iniciadas
      // vão sempre pro fim (continuam visíveis, só não competem no
      // critério de dia). Dentro do grupo ativo, ordena por dia crescente.
      return copy.sort((a, b) => {
        const aa = isPlatformActiveNow(a);
        const ab = isPlatformActiveNow(b);
        if (aa !== ab) return aa ? -1 : 1;
        return getCurrentCycleDay(a) - getCurrentCycleDay(b);
      });
    case 'dias-desc':
      // CORRIGIDO (Rodada 2): mesma prioridade de grupo do dias-asc, com
      // a ordenação por dia invertida dentro do grupo ativo.
      return copy.sort((a, b) => {
        const aa = isPlatformActiveNow(a);
        const ab = isPlatformActiveNow(b);
        if (aa !== ab) return aa ? -1 : 1;
        return getCurrentCycleDay(b) - getCurrentCycleDay(a);
      });
    case 'com':
      return copy.sort((a, b) => (b.group === 'com') - (a.group === 'com'));
    case 'sem':
      return copy.sort((a, b) => (b.group === 'sem') - (a.group === 'sem'));
    case 'ativas':
      // Confirmado correto em teste (Rodada 1) — sem alteração.
      return copy.sort((a, b) => isPlatformActiveNow(b) - isPlatformActiveNow(a));
    case 'inativas':
      // CORRIGIDO (Rodada 2): a Rodada 1 entregou a ordem de a/b invertida
      // por engano, o que anulava o efeito pretendido. Agora segue o
      // MESMO padrão já validado em 'ativas' (f(b) - f(a)).
      return copy.sort((a, b) => !isPlatformActiveNow(b) - !isPlatformActiveNow(a));
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
// no Ponto 1 + Item 10c (Etapa 5):
//   az/za            -> só nomes que começam com LETRA, em ordem alfabética
//   1-9/9-1          -> só nomes que começam com NÚMERO, em ordem numérica
//   dias-desc/asc    -> só quem está ATIVA NO CICLO agora, ordenada por "Dia X"
//   com/sem          -> só do grupo correspondente (sem ordenação extra)
//   ativas           -> !!lastResetDate && !cycleEnded (bug corrigido)
//   inativas         -> !lastResetDate || cycleEnded (bug corrigido)
//   deposito-desc/asc -> Item 10c: só quem tem depositLog e já passou de
//   7 dias desde o último depósito (getDaysSinceLastDeposit >= 7),
//   ordenada por esse valor. Base de cálculo é depositLog (permanente,
//   nunca zerado por Fim/Reinício) — diferente de dias-asc/desc, que usam
//   lastResetDate (ciclo manual de nível/depósito). Sem depósito
//   registrado, ou com menos de 7 dias desde o último, a plataforma some
//   da lista neste modo — mesmo critério já usado pra exibir o badge
//   "Depósito: X dias" no acordeão (ver buildRow em ui-platform-manage.js).
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
    case 'deposito-desc':
      return list
        .filter(p => getDaysSinceLastDeposit(p) !== null && getDaysSinceLastDeposit(p) >= 7)
        .sort((a, b) => getDaysSinceLastDeposit(b) - getDaysSinceLastDeposit(a));
    case 'deposito-asc':
      return list
        .filter(p => getDaysSinceLastDeposit(p) !== null && getDaysSinceLastDeposit(p) >= 7)
        .sort((a, b) => getDaysSinceLastDeposit(a) - getDaysSinceLastDeposit(b));
    default:
      return list;
  }
}

export const SORT_ONLY_MODES = new Set(['az', 'za', '1-9', '9-1', 'dias-asc', 'dias-desc']);
export const FILTER_MODES = new Set(['com', 'sem', 'ativas', 'inativas', 'deposito-desc', 'deposito-asc']);

// Lista única de opções do menu "Ordenar" — mesmo menu nas páginas 2 e 4,
// cada uma interpretando os cliques do seu jeito (ver topo do arquivo).
// dias-desc = "mais dias no ciclo primeiro" (+), dias-asc = "menos dias
// no ciclo primeiro" (−). deposito-desc/asc seguem a mesma convenção,
// mas pra dias desde o último depósito (Item 10c).
//
// Item 10b: label "Ativas no ciclo" renomeado pra "Ativas" — o value
// ('ativas') não muda, nenhum outro arquivo depende do texto do label.
export const SORT_MENU_OPTIONS = [
  { value: 'az', label: 'A - Z' },
  { value: 'za', label: 'Z - A' },
  { value: '1-9', label: '1 – 9' },
  { value: '9-1', label: '9 – 1' },
  { value: 'dias-desc', label: '+ Dias no ciclo' },
  { value: 'dias-asc', label: '− Dias no ciclo' },
  { value: 'deposito-desc', label: '+ Dias Depósito' },
  { value: 'deposito-asc', label: '− Dias Depósito' },
  { value: 'com', label: 'Com Apostas' },
  { value: 'sem', label: 'Sem Apostas' },
  { value: 'ativas', label: 'Ativas' },
  { value: 'inativas', label: 'Inativas' }
];
