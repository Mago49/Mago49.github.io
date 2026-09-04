// === PONTO DE ENTRADA DA SPA (versão esqueleto) ===
// Hoje este arquivo só liga o roteador. Nas próximas etapas, é AQUI que
// vai entrar o auth-guard.js real (login único por sessão inteira) —
// antes de chamar initRouter(), pra garantir que a pessoa esteja
// logada e com os dados do Firestore já carregados antes de qualquer
// tela ser mostrada. Por enquanto, sem login nenhum, só pra testar a
// navegação.

import { initRouter } from './router.js';

initRouter();
