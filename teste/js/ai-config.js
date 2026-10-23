// === CONFIGURAÇÃO DA LEITURA DE PRINT PELO GEMINI (Sub-entrega 39) ===
// Só valores PÚBLICOS. Nenhuma chave secreta mora aqui (nem em lugar
// nenhum do app):
//   - a chave de SITE do reCAPTCHA é pública por natureza (aparece no
//     código de qualquer site que usa reCAPTCHA). A chave SECRETA fica só
//     no console do Firebase (App Check).
//   - o acesso ao Gemini é feito pelo Firebase AI Logic: a chave do Gemini
//     fica do lado do Google; o App Check garante que só este app chama.
//
// Enquanto RECAPTCHA_SITE_KEY estiver vazio, o botão 📷 avisa que falta
// configurar e o "Colar texto" continua funcionando normalmente.

// 'enterprise' = Fraud Defense (antes reCAPTCHA Enterprise) — o App Check
// não aceita mais o reCAPTCHA v3 clássico. 'v3' fica só por compatibilidade.
export const RECAPTCHA_PROVIDER = 'enterprise';
export const RECAPTCHA_SITE_KEY = '6LcxX_ktAAAAAB6GpTMbVrjhbzwNfEoiW9D4sDM2';

// Modelo do Gemini (trocar aqui se o Google aposentar o nome).
export const GEMINI_MODEL = 'gemini-3.8-flash';

// Versão do SDK do Firebase usada SÓ pela leitura de print (instância
// separada — o resto do app continua na versão do firebase-init.js).
export const AI_SDK_VERSION = '12.19.0';

// Limites do envio (o Google aceita até 20 MB por pedido).
export const PRINT_MAX_FILES = 10;
export const PRINT_MAX_SIDE = 2400;   // px — o lado maior é reduzido até aqui
export const PRINT_JPEG_QUALITY = 0.9;
