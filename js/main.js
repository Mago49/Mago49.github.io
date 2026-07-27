// === PONTO DE ENTRADA ===
// Este é o único arquivo referenciado no <script type="module"> do index.html.
// Ele importa e liga todo o resto. Se for criar uma página nova (gestao.html),
// crie um main-gestao.js seguindo este mesmo papel: só orquestrar imports.

import { startBackgroundAnimation } from './ui-background.js';
import { createCalendar, updateCalendarEvents } from './ui-calendar.js';
import { renderPlatformList } from './ui-platform-panel.js';
import { renderVipPanel } from './ui-vip-panel.js';

// Ativa os módulos que só precisam ser importados para registrar seus
// próprios listeners (login/logout, todos os modais do painel etc.).
import './auth.js';

startBackgroundAnimation();

createCalendar();
// updateCalendarEvents() já atualiza o resumo do topo (hero) por dentro,
// não é preciso chamar updateHeroSummary() de novo aqui.
updateCalendarEvents();

document.getElementById('scrollToPanelBtn').addEventListener('click', () => {
  document.getElementById('platformListSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('scrollToVipBtn').addEventListener('click', () => {
  document.getElementById('vipPanelSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('scrollToCalendarBtn').addEventListener('click', () => {
  document.getElementById('calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function scheduleDailyUpdate() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const ms = nextMidnight - now;
  setTimeout(() => {
    const platformSearchEl = document.getElementById('platformSearch');
    updateCalendarEvents();
    renderPlatformList(platformSearchEl.value);
    // Bônus VIP depende do dia atual (dias no mês, segundas-feiras etc.),
    // então também precisa ser recalculado na virada do dia — sem isso ele
    // fica desatualizado até o usuário recarregar a página manualmente.
    renderVipPanel();
    scheduleDailyUpdate();
  }, ms);
}
scheduleDailyUpdate();
