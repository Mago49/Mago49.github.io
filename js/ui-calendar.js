// === CALENDÁRIO (FullCalendar) ===
// Só existe na Página 2 (calendario.html). Antes essa função chamava
// updateHeroSummary() sozinha por dentro; como hero (Página 1) e legenda
// (Página 2) agora são coisas separadas que só fazem sentido em páginas
// diferentes, updateCalendarEvents() aceita um callback opcional e quem
// chama (main-calendario.js) decide o que atualizar depois — nesse caso,
// a legenda via renderLegend().
import { state } from './state.js';
import { computeEmissionDates, sumDepositsUpTo, colorForLevel } from './cycle-logic.js';

// Cria a instância do FullCalendar e guarda em state.calendar.
// Chamar uma única vez, depois que #calendar já existe no DOM.
export function createCalendar() {
  const calendarEl = document.getElementById('calendar');

  state.calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'pt-br',
    selectable: true,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    events: [],
    eventDisplay: 'block',
    eventDidMount: function (info) {
      const bg = info.event.backgroundColor;
      const isDay30 = info.event.extendedProps.isDay30;
      info.el.style.background = bg;
      info.el.style.color = '#000000';
      info.el.style.border = isDay30 ? '1px solid #FF0000' : '1px solid rgba(0,0,0,0.06)';
      info.el.style.borderRadius = '10px';
      info.el.style.fontWeight = '700';
      info.el.style.fontSize = '0.75rem';
      info.el.style.padding = '2px';
    }
  });

  state.calendar.render();
  return state.calendar;
}

export function updateCalendarEvents(onDone) {
  if (!state.calendar) return;
  state.calendar.removeAllEvents();

  const now = new Date();
  const windowFrom = new Date(now); windowFrom.setDate(windowFrom.getDate() - 10);
  const windowTo = new Date(now); windowTo.setDate(windowTo.getDate() + 40);

  state.platforms.forEach(platform => {
    if (platform.cycleEnded) return;
    const emissionDates = computeEmissionDates(platform, now);
    emissionDates.forEach((emDate, emIndex) => {
      if (emDate >= windowFrom && emDate <= windowTo) {
        const totalAtEmission = sumDepositsUpTo(platform, emDate);
        const bg = colorForLevel(totalAtEmission);
        const isDay30 = emIndex === emissionDates.length - 1; // último item = bônus do dia 30

        state.calendar.addEvent({
          id: `emit_${platform.id}_${emDate.toISOString().slice(0, 10)}`,
          title: platform.name,
          start: emDate.toISOString().slice(0, 10),
          allDay: true,
          display: 'block',
          backgroundColor: bg,
          borderColor: isDay30 ? '#FF0000' : 'rgba(0,0,0,0.06)',
          extendedProps: {
            platformId: platform.id,
            platformName: platform.name,
            totalAtEmission: totalAtEmission,
            isDay30: isDay30
          }
        });
      }
    });
  });

  if (typeof onDone === 'function') onDone();
}

export function filterCalendarByPlatform(platformId) {
  const allEvents = state.calendar.getEvents();
  allEvents.forEach(event => {
    const eventPlatformId = event.extendedProps.platformId;
    event.setProp('display', eventPlatformId === platformId ? 'block' : 'none');
  });
}

export function showAllBonusCalendar() {
  const allEvents = state.calendar.getEvents();
  allEvents.forEach(event => {
    event.setProp('display', 'block');
  });
}
