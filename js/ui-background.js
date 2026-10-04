// === FUNDO ANIMADO (círculos SVG) ===
// Puramente decorativo, não depende de nenhum outro módulo.

export function startBackgroundAnimation() {
  const svg = document.querySelector('svg.background-svg');
  const circles = Array.from(svg.querySelectorAll('circle'));
  const viewbox = svg.viewBox.baseVal;
  const initialRadii = [280, 280, 280, 280];

  const data = circles.map((c, i) => {
    const initR = initialRadii[i] * (0.28 + Math.random() * 0.12);
    return {
      el: c,
      x: (Math.random() * viewbox.width) | 0,
      y: (Math.random() * viewbox.height) | 0,
      r: initR,
      vx: (Math.random() * 0.6 + 0.1) * (Math.random() < 0.5 ? -1 : 1),
      vy: (Math.random() * 0.6 + 0.1) * (Math.random() < 0.5 ? -1 : 1),
      vr: (Math.random() * 0.04 + 0.01) * (Math.random() < 0.5 ? -1 : 1),
      rmin: initR * 0.4,
      rmax: initR * 1.3
    };
  });

  function animate() {
    data.forEach((d) => {
      d.x += d.vx;
      d.y += d.vy;
      d.r += d.vr;
      if (d.x < -200 || d.x > viewbox.width + 200) d.vx *= -1;
      if (d.y < -200 || d.y > viewbox.height + 200) d.vy *= -1;
      if (d.r < d.rmin || d.r > d.rmax) d.vr *= -1;
      d.el.setAttribute('cx', d.x);
      d.el.setAttribute('cy', d.y);
      d.el.setAttribute('r', Math.max(10, d.r));
    });
    requestAnimationFrame(animate);
  }
  animate();
}
