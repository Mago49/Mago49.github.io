<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IA para Todos!</title>

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

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const svg = document.querySelector('svg.background-svg');
      const circles = Array.from(svg.querySelectorAll('circle'));

      const colorAndSoundData = [
        { color: '#1e3a8a', sound: new Audio('sounds/fa-note-sound.mp3') },
        { color: '#ef4444', sound: new Audio('sounds/note-c-is-stretched.mp3') },
        { color: '#facc15', sound: new Audio('sounds/note-d-is-stretched.mp3') },
        { color: '#15803d', sound: new Audio('sounds/sol-extended.mp3') }
      ];

      function shuffle(array) {
        const shuffledArray = [...array];
        for (let i = shuffledArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
        }
        return shuffledArray;
      }

      function handleInteraction(event) {
        const clickedCircleElement = event.target;
        const clickedCircleData = data.find(d => d.el === clickedCircleElement);

        if (clickedCircleData) {
          const newRadius = Math.random() * (clickedCircleData.rmax - clickedCircleData.rmin) + clickedCircleData.rmin;
          clickedCircleData.r = newRadius;
        }

        const currentColor = clickedCircleElement.getAttribute('fill');
        const currentSoundData = colorAndSoundData.find(data => data.color === currentColor);
        if (currentSoundData) {
          currentSoundData.sound.currentTime = 0;
          currentSoundData.sound.play().catch(e => console.error("Erro ao tocar áudio:", e));
        }

        const newColorOrder = shuffle(colorAndSoundData);
        circles.forEach((circle, index) => {
          circle.setAttribute('fill', newColorOrder[index].color);
        });
      }

      const viewbox = svg.viewBox.baseVal;
      const initialRadii = [280, 280, 280, 280];
      let data = [];

      let visibleBounds;
      const point = svg.createSVGPoint();

      function updateVisibleBounds() {
        const ctm = svg.getScreenCTM().inverse();
        point.x = 0; point.y = 0;
        const topLeft = point.matrixTransform(ctm);
        point.x = window.innerWidth; point.y = window.innerHeight;
        const bottomRight = point.matrixTransform(ctm);
        visibleBounds = {
          x: topLeft.x, y: topLeft.y,
          width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y
        };
      }

      updateVisibleBounds();
      window.addEventListener('resize', updateVisibleBounds);

      function setupAnimation() {
        data = circles.map((c, i) => {
          c.addEventListener('click', handleInteraction);

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

          if (d.x + d.r > visibleBounds.x + visibleBounds.width) {
            d.vx *= -1;
            d.x = visibleBounds.x + visibleBounds.width - d.r;
          } else if (d.x - d.r < visibleBounds.x) {
            d.vx *= -1;
            d.x = visibleBounds.x + d.r;
          }

          if (d.y + d.r > visibleBounds.y + visibleBounds.height) {
            d.vy *= -1;
            d.y = visibleBounds.y + visibleBounds.height - d.r;
          } else if (d.y - d.r < visibleBounds.y) {
            d.vy *= -1;
            d.y = visibleBounds.y + d.r;
          }

          if (d.r < d.rmin || d.r > d.rmax) {
            d.vr *= -1;
          }

          d.el.setAttribute('cx', d.x);
          d.el.setAttribute('cy', d.y);
          d.el.setAttribute('r', d.r);
        });
        requestAnimationFrame(animate);
      }

      animate();

      // --- Calendário integrado ---
      const calendarEl = document.getElementById('calendar');
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
        events: [
          { title: 'Reunião', start: '2026-05-21T10:00:00' },
          { title: 'Aniversário', start: '2026-05-25' }
        ],
        dateClick: function(info) {
          // Interação com bolinhas ao clicar em uma data
          data.forEach(d => {
            const colors = ['#1e3a8a','#ef4444','#facc15','#15803d','#9333ea','#06b6d4'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            d.el.setAttribute('fill', randomColor);

            d.el.animate([
              { r: d.r },
              { r: d.r * 1.2 },
              { r: d.r }
            ], {
              duration: 600,
              easing: 'ease-in-out'
            });
          });
        }
      });
      calendar.render();
    });
  </script>
</body>
</html>