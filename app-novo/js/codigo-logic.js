// === LÓGICA DO GERADOR DE CÓDIGOS (Hub — Bloco C + extensão Depósito/Aposta) ===
// Função pura, sem DOM e sem Firestore — só cálculo. Fica em arquivo próprio
// (mesmo espírito do isolamento já existente entre cycle-logic.js e
// finance-logic.js, e replicado por misterioso-logic.js): NÃO importa
// cycle-logic.js nem finance-logic.js. Os dois códigos condicionais
// (Depósito/Aposta) operam direto sobre os arrays brutos que já existem em
// cada plataforma (depositLog, betEntries) — não há necessidade de nenhum
// dos dois módulos protegidos aqui, então não existe risco de romper a
// regra de isolamento entre eles.
//
// === 3 TIPOS DE CÓDIGO IDENTIFICADOR (11a-g) ===
//   'aleatoria'       -> sem campos, sem código gerado aqui (a própria
//                        plataforma sorteia por fora do sistema). Some do
//                        seletor do Hub (ver getCodigoIdentificador).
//   'fixa_sequencia'  -> texto fixo + número que soma +1 a cada dia desde
//                        baseDate (reinício só quando o usuário troca
//                        baseDate manualmente em edicao.html — Sistema 1).
//   'fixa_data'       -> texto fixo + mês/dia REAL de hoje (nunca
//                        acumula, vira sozinho na virada do dia).
//
// === CÓDIGOS CONDICIONAIS (11h/11i, extensão ao Bloco C) ===
// Mesma engine de sequência (+1/dia) do tipo 'fixa_sequencia', mas cada um
// só fica VISÍVEL quando a respectiva soma DE HOJE (nunca acumulada entre
// dias) atinge o valor mínimo cadastrado:
//   codigoDeposito -> soma de depositLog de HOJE >= valorMinimo
//   codigoAposta   -> soma de betEntries.wagered de HOJE >= valorMinimo
// Reinicia todo dia, sozinho — não acompanha ciclo de nível nem Reinício
// manual (diferente do identificador 'fixa_sequencia', que só reinicia
// por ação do usuário em baseDate).
//
// Cadastro dos 3 (codigoConfig, codigoDeposito, codigoAposta) continua em
// edicao.html (Sistema 1) até a Etapa 5 migrar a View Edição — este
// arquivo só LÊ os campos, já salvos na mesma coleção `platforms`
// (Firestore compartilhado entre Sistema 1 e Sistema 2).

// Zera hora/minuto/segundo — mesmo padrão de comparação "só o dia" já
// usado em cycle-logic.js/misterioso-logic.js.
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Dias corridos entre baseDate e refDate (só a parte de dia, sem hora),
// nunca negativo — se baseDate for hoje ou no futuro (relógio ajustado
// manualmente, por exemplo), a sequência começa em variavelInicio sem
// subtrair nada.
function daysSinceBase(baseDate, refDate = new Date()) {
  if (!baseDate) return 0;
  const base = startOfDay(baseDate);
  const today = startOfDay(refDate);
  const diff = Math.floor((today - base) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// Soma de um array de eventos (depositLog ou betEntries) cuja `date` cai
// no MESMO dia local de refDate — nunca soma dias anteriores. `key` é o
// nome do campo numérico a somar ('value' pra depositLog, 'wagered' pra
// betEntries).
function sumToday(events, key, refDate = new Date()) {
  const target = startOfDay(refDate).getTime();
  return (events || [])
    .filter(e => startOfDay(e.date).getTime() === target)
    .reduce((sum, e) => sum + (Number(e[key]) || 0), 0);
}

// --- Tipo 'fixa_sequencia': fixo + (variavelInicio + dias desde baseDate) ---
// Reaproveitada pelos 3 códigos (identificador, depósito, aposta) — todos
// usam a MESMA fórmula de sequência, só a fonte de config muda.
export function computeSequenceCode(config, refDate = new Date()) {
  if (!config) return null;
  const fixo = config.fixo || '';
  const base = Number(config.variavelInicio) || 0;
  const variavel = base + daysSinceBase(config.baseDate, refDate);
  return `${fixo}${variavel}`;
}

// --- Tipo 'fixa_data': fixo + mês/dia REAL de hoje (formato DDMM, igual
// ao padrão pt-BR usado no resto do app) — nunca acumula, calculado ao
// vivo a cada chamada.
export function computeDateCode(config, refDate = new Date()) {
  if (!config) return null;
  const fixo = config.fixo || '';
  const d = new Date(refDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${fixo}${dd}${mm}`;
}

// --- Código IDENTIFICADOR (11a-g) — o que aparece no seletor do Hub ---
// null quando: sem codigoConfig, tipo 'aleatoria', ou tipo desconhecido —
// nesses casos a plataforma simplesmente some do seletor (ver 11b).
export function getCodigoIdentificador(platform, refDate = new Date()) {
  const config = platform.codigoConfig;
  if (!config || !config.tipo || config.tipo === 'aleatoria') return null;
  if (config.tipo === 'fixa_sequencia') return computeSequenceCode(config, refDate);
  if (config.tipo === 'fixa_data') return computeDateCode(config, refDate);
  return null;
}

// true só quando a plataforma tem um tipo de código configurado e
// diferente de 'aleatoria' — usado pra decidir quem aparece no seletor.
export function hasVisibleCodigoIdentificador(platform) {
  const tipo = platform.codigoConfig && platform.codigoConfig.tipo;
  return !!tipo && tipo !== 'aleatoria';
}

// --- Soma de HOJE (bases dos dois códigos condicionais) ---
export function getTodayDepositTotal(platform, refDate = new Date()) {
  return sumToday(platform.depositLog, 'value', refDate);
}

export function getTodayWageredTotal(platform, refDate = new Date()) {
  return sumToday(platform.betEntries, 'wagered', refDate);
}

// --- CÓDIGO DE DEPÓSITO (11h) ---
// "Liberado" exige valorMinimo configurado (> 0) E a soma de depositLog
// de HOJE atingir esse mínimo. Sem valorMinimo configurado (0 ou
// ausente), o código nunca aparece — evita mostrar "liberado" por engano
// numa plataforma que ainda não tem essa regra cadastrada em edicao.html.
export function isCodigoDepositoUnlocked(platform, refDate = new Date()) {
  const cfg = platform.codigoDeposito;
  const minimo = Number(cfg && cfg.valorMinimo) || 0;
  if (minimo <= 0) return false;
  return getTodayDepositTotal(platform, refDate) >= minimo;
}

// Valor do código de Depósito, só quando liberado — null caso contrário
// (quem chama decide se omite a linha inteira no Hub).
export function getCodigoDepositoValue(platform, refDate = new Date()) {
  if (!isCodigoDepositoUnlocked(platform, refDate)) return null;
  return computeSequenceCode(platform.codigoDeposito, refDate);
}

// --- CÓDIGO DE APOSTA (11i) — mesma regra do Depósito, base diferente ---
export function isCodigoApostaUnlocked(platform, refDate = new Date()) {
  const cfg = platform.codigoAposta;
  const minimo = Number(cfg && cfg.valorMinimo) || 0;
  if (minimo <= 0) return false;
  return getTodayWageredTotal(platform, refDate) >= minimo;
}

export function getCodigoApostaValue(platform, refDate = new Date()) {
  if (!isCodigoApostaUnlocked(platform, refDate)) return null;
  return computeSequenceCode(platform.codigoAposta, refDate);
}

// --- ITEM 21 — "Depósitos - Hoje" (bloco novo do Hub) ---
// Lista só quem tem depósito registrado HOJE (depositLog), com o total do
// dia, ordenada da maior pra menor soma — motivo do usuário: o bônus
// Misterioso é distribuído em várias janelas ao longo do dia pra quem
// depositou, então quem depositou mais cedo/mais valor tende a ser o
// destaque natural do topo da lista.
export function getDepositsToday(platforms, refDate = new Date()) {
  return (platforms || [])
    .map(platform => ({ platform, total: getTodayDepositTotal(platform, refDate) }))
    .filter(entry => entry.total > 0)
    .sort((a, b) => b.total - a.total);
}
