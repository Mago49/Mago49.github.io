<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Animação de Fundo</title>

  <style>
    /* Estilos essenciais para a animação funcionar em tela cheia */
    html, body {
      min-height: 100vh;
      margin: 0;
      padding: 0;
      /* A cor de fundo original para manter a aparência */
      background-color: #f5f5dc; 
      /* Previne barras de rolagem indesejadas que a animação possa causar */
      overflow: hidden; 
    }

    /* Estilo que posiciona o SVG como um fundo fixo */
    .background-svg {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: -1; /* Coloca o SVG atrás de qualquer conteúdo futuro */
    }
  </style>
</head>

<body>
  <svg
    class="background-svg"
    viewbox="0 0 1440 800"
    preserveAspectRatio="xMidYMid slice"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="280" cy="280" r="280" fill="#1e3a8a" />
    <circle cx="1160" cy="280" r="280" fill="#ef4444" />
    <circle cx="280" cy="520" r="280" fill="#facc15" />
    <circle cx="1160" cy="520" r="280" fill="#15803d" />
  </svg>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const svg = document.querySelector('svg.background-svg');
      const circles = Array.from(svg.querySelectorAll('circle'));
      const viewbox = svg.viewBox.baseVal;

      const initialPositions = [
        { x: 280,  y: 280 },
        { x: 1160, y: 280 },
        { x: 280,  y: 520 },
        { x: 1160, y: 520 }
      ];
      const initialRadii = [280, 280, 280, 280];

      let data = [];

      function setupAnimation() {
        data = circles.map((c, i) => {
          const initR = initialRadii[i] * 0.6; 

          return {
            el: c,
            x: initialPositions[i].x,
            y: initialPositions[i].y,
            r: initR,
            vx: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? -1 : 1),
            vy: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? -1 : 1),
            vr: (Math.random() * 0.03 + 0.015) * (Math.random() < 0.5 ? -1 : 1),
            rmin: initR * 0.40,
            rmax: initR * 1.30
          };
        });
      }

      setupAnimation();

      function animate() {
        data.forEach((d) => {
          d.x += d.vx;
          d.y += d.vy;
          d.r += d.vr;

          if (d.x - d.r < viewbox.x || d.x + d.r > viewbox.width) {
            d.vx *= -1;
          }
          if (d.y - d.r < viewbox.y || d.y + d.r > viewbox.height) {
            d.vy *= -1;
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
    });
  </script>
</body>
</html>
