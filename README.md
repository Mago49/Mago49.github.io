<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IA para Todos!</title>

  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=poppins:wght@400;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    /* Estilos CSS (sem alterações) */
    html, body {
      min-height: 100vh; margin: 0; padding: 0;
      background-color: #f5f5dc; font-family: 'poppins', sans-serif; overflow-x: hidden;
    }
    .background-svg {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
    }
    .background-svg circle {
      cursor: pointer; transition: fill 0.5s ease;
    }
    .container {
      position: relative; z-index: 10; max-width: 600px; margin: 4rem auto 2rem;
      padding: 2rem 1.5rem; background: rgba(255,255,255,0.95); border-radius: 1.5rem;
      box-shadow: 0 15px 30px rgba(0,0,0,0.1); text-align: center; transition: .3s ease;
    }
    .container:hover {
      transform: translatey(-3px) scale(1.01); box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    }
    h1 {
      color: #1e3a8a; font-size: 2.2rem; font-weight: 700; margin-bottom: .5rem;
    }
    p { color: #555; font-size: 1rem; margin-bottom: .5rem; }
    .footer { color: #777; font-size: .875rem; }
    .cta-button {
      display: inline-block; background-image: linear-gradient(45deg,#1e3a8a,#15803d);
      color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 700;
      font-size: 1.2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.15); transition: .3s ease;
    }
    .cta-button:hover {
      background-image: linear-gradient(45deg,#172e71,#116930); box-shadow: 0 8px 20px rgba(0,0,0,0.2);
    }
    .contact-button { transition: all 0.3s ease-in-out; }
    .contact-button:hover { transform: translatey(-2px); box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2); }
    .logo-container {
      display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1.5rem;
    }
    .logo { max-width: 150px; height: auto; }
    .gradient-title {
      font-size: 1.5rem; font-weight: 700; background: linear-gradient(90deg,#1e3a8a,#15803d,#facc15,#ef4444);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      text-shadow: 0 0 4px rgba(255,255,255,0.8); white-space: nowrap;
    }
    .pulse-icon { animation: pulsemove 3s ease-in-out infinite; }
    @keyframes pulsemove {
      0%   { transform: scale(1);   opacity: .9; }
      50%  { transform: scale(1.1); opacity: 1;  }
      100% { transform: scale(1);   opacity: .9; }
    }
    @media (min-width: 640px) { h1 { font-size: 3rem; } p  { font-size: 1.125rem; } }
    @media (max-width: 640px) { .gradient-title { font-size: 1rem; } .logo { max-width: 120px; } }
  </style>
</head>

<body>
  <svg class="background-svg" viewbox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <circle cx="280" cy="280" r="280" fill="#1e3a8a" />
    <circle cx="1160" cy="280" r="280" fill="#ef4444" />
    <circle cx="280" cy="520" r="280" fill="#facc15" />
    <circle cx="1160" cy="520" r="280" fill="#15803d" />
    <circle cx="720" cy="100" r="280" fill="#8b5cf6" />
    <circle cx="720" cy="700" r="280" fill="#f97316" />
  </svg>

 <script>
  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.querySelector('svg.background-svg');
    const circles = Array.from(svg.querySelectorAll('circle'));

    // NOVO: Adicionados dados para os novos círculos (cores e sons)
    const colorAndSoundData = [
      { color: '#1e3a8a', sound: new Audio('sounds/fa-note-sound.mp3') },
      { color: '#ef4444', sound: new Audio('sounds/note-c-is-stretched.mp3') },
      { color: '#facc15', sound: new Audio('sounds/note-d-is-stretched.mp3') },
      { color: '#15803d', sound: new Audio('sounds/sol-extended.mp3') },
      { color: '#8b5cf6', sound: new Audio('sounds/new-note-1.mp3') }, // Som de exemplo
      { color: '#f97316', sound: new Audio('sounds/new-note-2.mp3') }  // Som de exemplo
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
    // NOVO: Array de raios ajustado para 6 círculos
    const initialRadii = [280, 280, 280, 280, 280, 280];
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
  });
</script>
</body>
</html>
