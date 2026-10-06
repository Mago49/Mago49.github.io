// === CALENDÁRIO (FullCalendar) ===
// Só existe na Página 2 (calendario.html). Antes essa função chamava
// updateHeroSummary() sozinha por dentro; como hero (Página 1) e legenda
// (Página 2) agora são coisas separadas que só fazem sentido em páginas
// diferentes, updateCalendarEvents() aceita um callback opcional e quem
// chama (main-calendario.js) decide o que atualizar depois — nesse caso,
// a legenda via renderLegend().
//
// (Sub-entrega H) COR DO EVENTO = MESMO PATAMAR DO MISTERIOSO: a cor de
// cada evento usava os depósitos até 00:00 do dia da emissão, enquanto o
// valor do Bônus Misterioso (getEffectiveMisteriosoValue,
// misterioso-logic.js) conta até 23:59:59 do mesmo dia. Um depósito feito
// no próprio dia da emissão mudava o patamar na aba Misterioso mas não a
// cor no calendário. Agora os dois contam até o fim do dia.
import { state } from './state.js';
import { computeEmissionDates, sumDepositsUpTo, colorForLevel } from './cycle-logic.js';

// Chave de dia LOCAL (AAAA-MM-DD). toISOString() converte pra UTC e
// desloca o dia em alguns fusos.
function toLocalDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// (Sub-entrega H) 23:59:59 do mesmo dia — mesmo instante usado por
// getEffectiveMisteriosoValue (misterioso-logic.js).
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d;
}

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

  // Botão "today": nas visões semanal/diária o próprio FullCalendar já
  // navega direto pro dia de hoje — nada a fazer. Na visão mensal
  // (dayGridMonth), "today" só troca o MÊS exibido, sem centralizar a
  // página na linha da semana atual (mesmo ajuste que scrollToCurrentWeek()
  // já faz na abertura da página). Escuta o clique direto no botão nativo
  // em vez de usar datesSet: se o usuário já estiver no mês atual (só
  // rolou a página), o intervalo de datas não muda e datesSet nunca
  // dispararia, deixando o clique sem efeito. Duplo requestAnimationFrame
  // garante que a grade do mês (se tiver mudado) já foi repintada antes
  // de procurar a célula de hoje.
  const todayBtn = calendarEl.querySelector('.fc-today-button');
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      if (state.calendar.view.type !== 'dayGridMonth') return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToCurrentWeek();
        });
      });
    });
  }

  return state.calendar;
}

// Ponto 2.1: ao abrir a página, rola até a linha da semana atual ficar
// visível — antes a página sempre abria mostrando a semana do dia 1 do
// mês, mesmo quando hoje era outro dia bem mais adiante. Mantém a visão
// mensal (dayGridMonth) intacta, só ajusta o scroll inicial.
//
// Chamado UMA ÚNICA VEZ pelo main-calendario.js, logo depois de
// createCalendar() no login — nunca dentro de updateCalendarEvents(),
// pra não forçar um scroll indesejado enquanto alguém já está navegando
// pela página (ex: na virada do dia à meia-noite, ver scheduleDailyUpdate
// em main-calendario.js).
//
// requestAnimationFrame garante que a grade do FullCalendar já foi
// pintada no DOM antes de procurar a célula de hoje (.fc-day-today é uma
// classe que o próprio FullCalendar aplica sozinho, sem precisarmos
// calcular a data aqui).
export function scrollToCurrentWeek() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  requestAnimationFrame(() => {
    const todayCell = calendarEl.querySelector('.fc-day-today');
    if (!todayCell) return;
    const row = todayCell.closest('tr') || todayCell;
    row.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
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
        // (Sub-entrega H) até o fim do dia da emissão — ver nota no topo.
        const totalAtEmission = sumDepositsUpTo(platform, endOfDay(emDate));
        const bg = colorForLevel(totalAtEmission);
        const isDay30 = emIndex === emissionDates.length - 1; // último item = bônus do dia 30

        state.calendar.addEvent({
          id: `emit_${platform.id}_${toLocalDayKey(emDate)}`,
          title: platform.name,
          start: toLocalDayKey(emDate),
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
  if (!state.calendar) return;
  const allEvents = state.calendar.getEvents();
  allEvents.forEach(event => {
    const eventPlatformId = event.extendedProps.platformId;
    event.setProp('display', eventPlatformId === platformId ? 'block' : 'none');
  });
}

export function showAllBonusCalendar() {
  if (!state.calendar) return;
  const allEvents = state.calendar.getEvents();
  allEvents.forEach(event => {
    event.setProp('display', 'block');
  });
}
