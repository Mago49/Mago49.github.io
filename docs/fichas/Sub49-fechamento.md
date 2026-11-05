# Sub 49 — Calendário próprio (sem FullCalendar) + 👁 Valores + "± Dias Depósito"

## Alterados (raiz e teste/)
- `js/ui-calendar.js` — reescrito: grade própria (mês/semana/dia), mesma
  disposição de antes (domingo primeiro, 6 semanas, pílulas por cor de
  nível, borda vermelha no dia 30, ordem alfabética no dia). Botão
  **👁 Valores** (lembrado no aparelho): mostra 💰 depósito do ciclo até a
  véspera e 🃏 bônus esperado (valor editado ou mínimo da faixa do template).
  Mês/semana: número curto; dia: R$ completo. "—" até o contexto carregar.
- `js/view-calendario.js` — removido o download do FullCalendar (CDN).
- `css/calendar.css` — estilos `.mcal` no lugar das regras `.fc`.
- `js/platform-sort.js` — `sortPlatforms` ganhou `deposito-desc/asc`
  (antes caía no default e não fazia nada). Nunca esconde; quem nunca
  depositou vai pro fim.
- `index.html` — só comentário.
- `docs/MANIFESTO.md` — linhas de view-calendario, ui-calendar, calendar.css.

## Novos
- nenhum (além desta ficha)

## Banco mudou?
Não. Só leitura (contexto de bônus já existente, cache da Sub 48).

## Pendências
- `state.js` ainda cita "instância do FullCalendar" num comentário (P0, não mexido).
