<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Calendário com Códigos</title>

  <!-- FullCalendar -->
  <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>

  <style>
    html, body {
      min-height: 100vh; margin: 0; padding: 0;
      font-family: 'poppins', sans-serif; overflow-x: hidden;
    }
    #calendar {
      position: relative;
      z-index: 10;
      width: 100%;
      height: 100vh;
      background: rgba(255,255,255,0.9);
    }
    .background-svg {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 0;
    }
    /* Estilo do modal */
    .modal {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5);
      display: none; align-items: center; justify-content: center;
      z-index: 20;
    }
    .modal-content {
      background: #fff; padding: 2rem; border-radius: 1rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      text-align: center; max-width: 300px; width: 100%;
    }
    .modal-content h2 { margin-bottom: 1rem; }
    .modal-content input {
      width: 100%; padding: .5rem; font-size: 1rem;
      border: 1px solid #ccc; border-radius: .5rem; margin-bottom: 1rem;
      text-align: center;
    }
    .modal-content button {
      padding: .5rem 1rem; border: none; border-radius: .5rem;
      font-weight: bold; cursor: pointer;
    }
    .btn-save { background: #15803d; color: #fff; margin-right: .5rem; }
    .btn-cancel { background: #ef4444; color: #fff; }
  </style>
</head>

<body>
  <!-- Fundo animado com bolinhas -->
  <svg class="background-svg" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <circle cx="280" cy="280" r="280" fill="#1e3a8a" />
    <circle cx="1160" cy="280" r="280" fill="#ef4444" />
    <circle cx="280" cy="520" r="280" fill="#facc15" />
    <circle cx="1160" cy="520" r="280" fill="#15803d" />
  </svg>

  <!-- Calendário -->
  <div id="calendar"></div>

  <!-- Modal para inserir código -->
  <div class="modal" id="codeModal">
    <div class="modal-content">
      <h2>Adicionar Código</h2>
      <input type="text" id="codeInput" maxlength="4" placeholder="Ex: DDUU" />
      <div>
        <button class="btn-save" id="saveCode">Salvar</button>
        <button class="btn-cancel" id="cancelCode">Cancelar</button>
      </div>
    </div>
  </div>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.querySelector('svg.background-svg');
    const circles = Array.from(svg.querySelectorAll('circle'));

    // --- Lógica das bolinhas (simplificada para foco no calendário) ---
    const viewbox = svg.viewBox.baseVal;
    const initialRadii = [280, 280, 280, 280];
    let data = [];

    function setupAnimation() {
      data = circles.map((c, i) => {
        const initR = initialRadii[i] * 0.3;
        return {
          el: c,
          x: viewbox.width / 2,
          y: viewbox.height / 2,
          r: initR,
          vx: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? -1 : 1),
          vy: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? -1 : 1),
          vr: (Math.random() * 0.03 + 0.015) * (Math.random() < 0.5 ? -1 : 1),
          rmin: initR * 0.40, rmax: initR * 1.30
        };
      });
    }
    setupAnimation();

    function animate() {
      data.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        d.r += d.vr;
        d.el.setAttribute('cx', d.x);
        d.el.setAttribute('cy', d.y);
        d.el.setAttribute('r', d.r);
      });
      requestAnimationFrame(animate);
    }
    animate();

    // --- Calendário com escrita persistente ---
    const calendarEl = document.getElementById('calendar');
    const savedEvents = JSON.parse(localStorage.getItem('calendarEvents')) || [];

    // Controle de duplo clique
    let lastClickDate = null;
    let lastClickTime = 0;

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'pt-br',
      selectable: true,
      editable: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      events: savedEvents,
      dateClick: function(info) {
        const now = Date.now();

        // Se clicou na mesma data em menos de 400ms → duplo clique
        if (lastClickDate === info.dateStr && (now - lastClickTime) < 400) {
          const modal = document.getElementById('codeModal');
          modal.style.display = 'flex';

          const input = document.getElementById('codeInput');
          input.value = '';
          input.focus();

          // Botão salvar
          document.getElementById('saveCode').onclick = function() {
            const code = input.value.trim();
            if (code && code.length === 4) {
              const newEvent = { title: code, start: info.dateStr };
              calendar.addEvent(newEvent);
              savedEvents.push(newEvent);
              localStorage.setItem('calendarEvents', JSON.stringify(savedEvents));
              modal.style.display = 'none';
            } else {
              alert("Digite exatamente 4 caracteres (letras ou números).");
            }
          };

          // Botão cancelar
          document.getElementById('cancelCode').onclick = function() {
            modal.style.display = 'none';
          };
        }

        // Atualiza controle de clique
        lastClickDate = info.dateStr;
        lastClickTime = now;
      }
    });
    calendar.render();
  });
</script>
</body>
</html>