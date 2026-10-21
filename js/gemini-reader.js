// === 📷 LER PRINT COM O GEMINI (Sub-entrega 39) ===
// Transforma prints do histórico de apostas em TEXTO no mesmo formato que o
// "📋 Colar em lote" já entende (bet-batch-logic.js → parseBatchText). Não
// grava nada: o texto volta pra tela do lote, o usuário confere a prévia e
// só "Registrar" grava (pelo mesmo caminho de sempre).
//
// CONEXÃO: Firebase AI Logic (Gemini Developer API) protegido por App Check.
// Nenhuma chave do Gemini no app. Roda numa INSTÂNCIA SEPARADA do Firebase
// ('gemini-reader'), com o SDK carregado só quando o 📷 é usado — o
// firebase-init.js (login + Firestore) não é tocado nem trocado de versão.
// A instância usa as mesmas configurações públicas do projeto
// (firebaseApp.options).

import { firebaseApp } from './firebase-init.js';
import {
  RECAPTCHA_PROVIDER, RECAPTCHA_SITE_KEY, GEMINI_MODEL, AI_SDK_VERSION,
  PRINT_MAX_FILES, PRINT_MAX_SIDE, PRINT_JPEG_QUALITY
} from './ai-config.js';

export { PRINT_MAX_FILES };

const AI_APP_NAME = 'gemini-reader';
const REQUEST_TIMEOUT_MS = 120000;
const ACCEPTED_TYPES = /^image\//i;

// O comando é o MESMO que o usuário já usa no Gemini (formato de blocos que
// parseBatchText lê). Mudou aqui = conferir os testes do lote.
export const PRINT_PROMPT = `Transcreva TODAS as apostas das imagens exatamente neste formato, sem nada antes nem depois:

PROVEDOR Slot | Nome do Jogo
Contagem de Apostas: N
Data: AAAA-MM-DD
Apostas: 0,00
Total de Vitórias/Derrotas: +0,00

Regras:
- Um bloco por jogo, uma linha em branco entre os blocos.
- Copie nomes e números exatamente como estão na imagem. Não arredonde, não some, não corrija nada.
- A data que aparece sozinha à direita vai na linha "Data:".
- Use vírgula nos centavos (5,00).
- Em "Total de Vitórias/Derrotas", sempre com sinal: "-" para valor vermelho e "+" para valor verde.
- Sem negrito, sem tabela, sem numeração, sem resumo, sem comentários.
- Se tiver mais de uma imagem, junte tudo numa lista só, sem repetir jogo.`;

export function isPrintReaderConfigured() {
  return typeof RECAPTCHA_SITE_KEY === 'string' && RECAPTCHA_SITE_KEY.trim().length > 10;
}

// ---------- carregamento (uma vez por página) ----------

let modelPromise = null;

function sdkUrl(name) {
  return `https://www.gstatic.com/firebasejs/${AI_SDK_VERSION}/firebase-${name}.js`;
}

async function buildModel() {
  const [appMod, checkMod, aiMod] = await Promise.all([
    import(sdkUrl('app')),
    import(sdkUrl('app-check')),
    import(sdkUrl('ai'))
  ]);
  const existing = appMod.getApps().find(a => a.name === AI_APP_NAME);
  const app = existing || appMod.initializeApp({ ...firebaseApp.options }, AI_APP_NAME);
  if (!existing) {
    const Provider = RECAPTCHA_PROVIDER === 'enterprise' ? checkMod.ReCaptchaEnterpriseProvider : checkMod.ReCaptchaV3Provider;
    checkMod.initializeAppCheck(app, {
      provider: new Provider(RECAPTCHA_SITE_KEY.trim()),
      isTokenAutoRefreshEnabled: true
    });
  }
  const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
  return aiMod.getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    generationConfig: { temperature: 0 }
  });
}

function getModel() {
  if (!modelPromise) {
    modelPromise = buildModel().catch(err => {
      modelPromise = null; // próxima tentativa recarrega
      throw err;
    });
  }
  return modelPromise;
}

// ---------- imagens ----------

function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadImageTag(file));
  }
  return loadImageTag(file);
}

function loadImageTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

/** Reduz (se preciso) e converte pra JPEG — menos dados, mesma leitura. */
export async function imageToPart(file) {
  const img = await loadImage(file);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('decode');
  const scale = Math.min(1, PRINT_MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  if (typeof img.close === 'function') img.close();
  const dataUrl = canvas.toDataURL('image/jpeg', PRINT_JPEG_QUALITY);
  return { inlineData: { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' } };
}

// ---------- resposta ----------

/** Tira cercas de código e espaços extras que o modelo às vezes devolve. */
export function cleanModelText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .replace(/\*\*/g, '')
    .trim();
}

/** Mensagem em português pra cada tipo de falha. */
export function explainError(err) {
  const m = String((err && (err.code || '')) + ' ' + (err && err.message ? err.message : err || '')).toLowerCase();
  if (m.includes('decode')) return 'Não consegui abrir uma das imagens. Use print em PNG ou JPG.';
  if (m.includes('timeout')) return 'O Gemini demorou demais pra responder. Tente de novo (ou com menos prints de uma vez).';
  if (m.includes('app-check') || m.includes('appcheck') || m.includes('recaptcha')) return 'O App Check recusou o pedido. Confira a chave de site do reCAPTCHA (domínio mago49.github.io) e o App Check no console.';
  if (m.includes('429') || m.includes('quota') || m.includes('resource_exhausted') || m.includes('rate limit') || m.includes('too many')) return 'A cota grátis do Gemini acabou por agora. Tente mais tarde ou use o "Colar texto".';
  if (m.includes('api-not-enabled') || m.includes('not been used') || m.includes('disabled')) return 'O Firebase AI Logic ainda não está ativado no console (AI Services → AI Logic).';
  if (m.includes('404') || (m.includes('not found') && m.includes('model'))) return `O modelo "${GEMINI_MODEL}" não respondeu. Pode ter mudado de nome — me avise.`;
  if (m.includes('413') || m.includes('too large')) return 'Prints grandes demais pra um envio só. Mande menos imagens de uma vez.';
  if (m.includes('safety') || m.includes('blocked')) return 'O Gemini recusou ler estas imagens. Use o "Colar texto".';
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to load') || m.includes('dynamically imported')) return 'Sem conexão com o Gemini. Verifique a internet e tente de novo.';
  return 'Não consegui ler os prints agora. Tente de novo ou use o "Colar texto".';
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); })
  ]).finally(() => clearTimeout(t));
}

/**
 * Lê os prints e devolve o texto no formato do lote.
 * @param {File[]} files
 * @param {{ onStage?: (stage:'prepare'|'send') => void }} opts
 * @returns {Promise<{ ok:true, text:string } | { ok:false, error:string }>}
 */
export async function readPrints(files, { onStage } = {}) {
  const list = Array.from(files || []).filter(f => f && ACCEPTED_TYPES.test(f.type || 'image/'));
  if (!list.length) return { ok: false, error: 'Escolha pelo menos uma imagem (print).' };
  if (list.length > PRINT_MAX_FILES) return { ok: false, error: `No máximo ${PRINT_MAX_FILES} prints por vez.` };
  if (!isPrintReaderConfigured()) {
    return { ok: false, error: 'A leitura de print ainda não foi configurada (falta a chave de site do reCAPTCHA). Use o "Colar texto" por enquanto.' };
  }
  try {
    if (onStage) onStage('prepare');
    const parts = [];
    for (const f of list) parts.push(await imageToPart(f)); // um por vez: menos memória no celular
    const model = await getModel();
    if (onStage) onStage('send');
    const result = await withTimeout(model.generateContent([PRINT_PROMPT, ...parts]), REQUEST_TIMEOUT_MS);
    const text = cleanModelText(result && result.response && typeof result.response.text === 'function' ? result.response.text() : '');
    if (!text) return { ok: false, error: 'O Gemini não encontrou apostas nos prints. Confira as imagens.' };
    return { ok: true, text };
  } catch (err) {
    console.error('Leitura de print (Gemini):', err);
    // Detalhe técnico curto (sem dado pessoal): ajuda a achar a causa pelo print da tela.
    const raw = String((err && (err.code ? `${err.code} ` : '')) + (err && err.message ? err.message : err || ''))
      .replace(/\s+/g, ' ').trim().slice(0, 220);
    return { ok: false, error: `${explainError(err)}${raw ? ` · Detalhe: ${raw}` : ''}` };
  }
}
