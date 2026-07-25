// === PONTO DE ENTRADA ===
// Este é o único arquivo referenciado no <script type="module"> do index.html.
// Ele importa e liga todo o resto. Se for criar uma página nova (gestao.html),
// crie um main-gestao.js seguindo este mesmo papel: só orquestrar imports.

import { startBackgroundAnimation } from './ui-background.js';
import { createCalendar, updateCalendarEvents } from './ui-calendar.js';
import { updateHeroSummary } from './ui-hero.js';
import { renderPlatformList } from './ui-platform-panel.js';

// Ativa os módulos que só precisam ser importados para registrar seus
// próprios listeners (login/logout, todos os modais do painel etc.).
import './auth.js';

startBackgroundAnimation();

createCalendar();
updateCalendarEvents();
updateHeroSummary();

document.getElementById('scrollToPanelBtn').addEventListener('click', () => {
  document.getElementById('platformPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    updateHeroSummary();
    scheduleDailyUpdate();
  }, ms);
}
scheduleDailyUpdate();
