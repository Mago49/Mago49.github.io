// === MODO TESTE (SAFE MODE) ===
// Interruptor único e central. Enquanto SAFE_MODE for true, NENHUMA
// escrita chega ao Firestore de verdade — leituras continuam 100% normais
// (dados reais, ao vivo, exatamente como estão hoje).
//
// Toda função de gravação nova ou existente que for tocada durante esta
// atualização (savePlatform, savePlatforms, e as futuras
// vip-history-store.js, user-preferences-store.js, announcement-store.js,
// bonus-ledger-logic.js) verifica este flag ANTES de qualquer
// setDoc/writeBatch/commit.
//
// Mude para false SÓ quando TODAS as etapas do roteiro estiverem prontas
// e validadas — aí sim o sistema volta a gravar de verdade. Essa troca é
// a ÚNICA linha que precisa mudar pra "ligar" o sistema de vez.
export const SAFE_MODE = false;

// === (Sub-entrega 21) 📨 TELEGRAM — recurso de uso PESSOAL ===
// true  = aba "📨 Telegram" aparece em Gráficos (leitura dos canais pelo
//         bot da máquina e2-micro + métrica de acerto).
// false = a aba some por completo (nada é lido nem gravado). É assim que
//         o app vai pra loja: muda SÓ esta linha pra false na versão de
//         publicação. Os dados que já existem no banco não são tocados.
export const TELEGRAM_FEATURE = true;
