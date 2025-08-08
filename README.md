<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Animação de Fundo (Diagnóstico)</title>

  <style>
    html, body {
      min-height: 100vh;
      margin: 0;
      padding: 0;
      background-color: #f5f5dc; 
      overflow: hidden; 
    }

    .background-svg {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: -1;
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
      // 1. Mensagem para confirmar que o script começou
      console.log("Script de animação iniciado.");

      const svg = document.querySelector('svg.background-svg');

      // 2. VERIFICAÇÃO DE SEGURANÇA: O SVG foi encontrado?
      if (!svg) {
        console.error("ERRO CRÍTICO: O elemento SVG com a classe 'background-svg' não foi encontrado na página. A animação não pode começar.");
        return; // Para a execução do script aqui mesmo
      }
      
      console.log("Elemento SVG encontrado com sucesso. Verificando círculos...");

      const circles = Array.from(svg.querySelectorAll('circle'));

      // 3. VERIFICAÇÃO DE SEGURANÇA: Os círculos foram encontrados?
      if (circles.length === 0) {
        console.warn("AVISO: O SVG foi encontrado, mas não há elementos <circle> dentro dele. A animação não pode começar.");
        return;
      }

      console.log(`${circles.length} círculos encontrados. Iniciando animação...`);
      
      const viewbox = svg.viewBox.baseVal;
      let data = [];

      function setupAnimation() {
        const initialRadii = [280, 280, 280, 280]; // Mantendo os raios iniciais
        data = circles.map((c, i) => {
          const initR = initialRadii[i] * 0.6;
          // Lendo posições diretamente do SVG para maior robustez
          const initialX = parseFloat(c.getAttribute('cx'));
          const initialY = parseFloat(c.getAttribute('cy'));

          return {
            el: c,
            x: initialX,
            y: initialY,
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
