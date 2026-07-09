## Calendário de Bônus

Aplicação web single-page para gerenciar ciclos de depósitos, bônus e apostas em plataformas, com um calendário visual integrado.

🔗 **Acesse:** https://mago49.github.io/

## Funcionalidades

- 📅 Calendário mensal/semanal/diário com bônus destacados por cor/nível
- 💎 Painel de bônus VIP com cálculo diário, semanal e mensal
- 🔍 Busca e listagem de plataformas
- 🕘 Histórico de depósitos em modal
- 🎲 Registro de apostas por plataforma
- 💡 Dicas rápidas de uso
- 🔄 Atualização automática dos dados à meia-noite

## Tecnologias

- HTML5, CSS3 e JavaScript puro (sem frameworks)
- [FullCalendar](https://fullcalendar.io/) 6.1.15 (via CDN)

## Estrutura do projeto

```
├── index.html   # estrutura da página
├── style.css    # estilos
└── script.js    # lógica da aplicação
```

## Como rodar localmente

Não precisa de build nem servidor — é só abrir o arquivo no navegador:

```bash
git clone https://github.com/Mago49/Mago49.github.io.git
cd Mago49.github.io
```

Depois, abra `index.html` diretamente no navegador (ou use a extensão "Live Server" no VS Code, se preferir recarregamento automático).

## Licença

Ainda não definida.
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

          // Faz scroll suave até o centro da tela
          const cell = info.dayEl; // célula do calendário clicada
          cell.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
