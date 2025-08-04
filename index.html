<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IA para Todos!</title>

  <!-- Font Awesome -->
  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
  />

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap"
    rel="stylesheet"
  />

  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    html, body {
      position: relative;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      background-color: #fff;
      font-family: 'Poppins', sans-serif;
      overflow-x: hidden;
    }

    .background-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      min-height: 100vh;
      z-index: 0;
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 10;
      max-width: 600px;
      margin: 4rem auto 2rem;
      padding: 2rem 1.5rem;
      background: rgba(255,255,255,0.95);
      border-radius: 1.5rem;
      box-shadow: 0 15px 30px rgba(0,0,0,0.1);
      text-align: center;
      transition: .3s ease;
    }
    .container:hover {
      transform: translateY(-3px) scale(1.01);
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    }

    h1 {
      color: #1e3a8a;
      font-size: 2.2rem;
      font-weight: 700;
      margin-bottom: .5rem;
    }
    p {
      color: #555;
      font-size: 1rem;
      margin-bottom: .5rem;
    }
    .footer {
      color: #777;
      font-size: .875rem;
    }

    .cta-button {
      display: inline-block;
      background-image: linear-gradient(45deg,#1e3a8a,#15803d);
      color: #fff;
      text-decoration: none;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 1.2rem;
      box-shadow: 0 5px 15px rgba(0,0,0,0.15);
      transition: .3s ease;
    }
    .cta-button:hover {
      background-image: linear-gradient(45deg,#172e71,#116930);
      box-shadow: 0 8px 20px rgba(0,0,0,0.2);
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .logo {
      max-width: 150px;
      height: auto;
    }

    .gradient-title {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(90deg,#1e3a8a,#15803d,#facc15,#ef4444);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 4px rgba(255,255,255,0.8);
      white-space: nowrap;
    }

    .pulse-icon {
      animation: pulseMove 3s ease-in-out infinite;
    }
    @keyframes pulseMove {
      0%   { transform: scale(1);   opacity: .9; }
      50%  { transform: scale(1.1); opacity: 1;  }
      100% { transform: scale(1);   opacity: .9; }
    }

    @media (min-width: 640px) {
      h1 { font-size: 3rem; }
      p  { font-size: 1.125rem; }
    }
    @media (max-width: 640px) {
      .gradient-title { font-size: 1rem; }
      .logo           { max-width: 120px; }
    }
  </style>
</head>

<body>
  <!-- Fundo animado -->
  <svg
    class="background-svg"
    viewBox="0 0 1440 800"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="280"  cy="280" r="280" fill="#1e3a8a" />
    <circle cx="1160" cy="280" r="280" fill="#ef4444" />
    <circle cx="280"  cy="520" r="280" fill="#facc15" />
    <circle cx="1160" cy="520" r="280" fill="#15803d" />
  </svg>

  <!-- Conteúdo principal -->
  <div class="container">
    <!-- ... seu conteúdo permanece igual ... -->
  </div>

  <!-- Script de animação das bolhas -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const svg     = document.querySelector('svg.background-svg');
      const vb      = svg.viewBox.baseVal;
      const vbWidth = vb.width;
      const vbHeight= vb.height;
      const circles = Array.from(svg.querySelectorAll('circle'));

      const data = circles.map(c => {
        const initR = parseFloat(c.getAttribute('r'));
        return {
          el: c,
          x: +c.getAttribute('cx'),
          y: +c.getAttribute('cy'),
          r: initR,
          vx: (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1),
          vy: (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1),
          vr: Math.random() * 0.1 + 0.05,
          rMin: initR * 0.8,
          rMax: initR * 1.2
        };
      });

      function animate() {
        data.forEach(d => {
          d.x += d.vx;
          d.y += d.vy;
          d.r += d.vr;

          if (d.x - d.r < 0 || d.x + d.r > vbWidth)  d.vx *= -1;
          if (d.y - d.r < 0 || d.y + d.r > vbHeight) d.vy *= -1;
          if (d.r < d.rMin   || d.r > d.rMax)        d.vr *= -1;

          d.el.setAttribute('cx', d.x);
          d.el.setAttribute('cy', d.y);
          d.el.setAttribute('r',  d.r);
        });

        requestAnimationFrame(animate);
      }

      animate();
    });
  </script>
</body>
</html>