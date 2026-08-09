## Página 5 — Financeiro (substitui a planilha externa)

Nova página `financeiro.html`, quinta do app. Controla, por plataforma, o
que antes vivia numa planilha do Google: Depósito, Saque, Diferença,
Bônus, Valor apostado, N° de apostas, Result Betting (R.B.) e R.B. + Bônus.

**Semana = segunda a domingo**, fixa e igual pra todas as plataformas —
independente do `lastResetDate` de cada uma (que continua valendo só pro
ciclo de nível/VIP, ver `cycle-logic.js`). Esse é um conceito novo e
separado, criado em `finance-logic.js`.

**Modelo de dados** — 3 novos arrays por plataforma (Firestore):
- `withdrawals: [{date, value}]` — evento, registrado quando você saca.
- `betEntries: [{date, wagered, betCount}]` — evento, registrado quando
  você aposta.
- `financeWeeks: [{weekStart, weekEnd, deposit, withdrawal, difference,
  wagered, betCount, bonus, resultBetting, rbPlusBonus, closedAt}]` — um
  registro por semana **fechada**.

**Ao vivo vs. congelado**: durante a semana em aberto, Depósito
(reaproveita `deposits`, que já existe), Saque, Diferença, Apostado e N°
de apostas são somados **ao vivo** toda vez que a tela abre
(`computeCurrentWeekLive`). No domingo, ao informar Bônus e Result
Betting e clicar em "Fechar semana" (`closeWeek`), os 8 campos são
**congelados** dentro de um novo item de `financeWeeks` — depois disso
esse registro nunca mais recalcula, mesmo que depósitos/saques/apostas
daquela semana sejam editados depois. Os eventos brutos NÃO são apagados
ao fechar a semana (ficam guardados pra auditoria).

**Arquivos novos**: `financeiro.html`, `css/finance.css`,
`js/finance-logic.js`, `js/ui-finance-panel.js`, `js/main-financeiro.js`.

**Arquivos modificados**: `js/platforms-store.js` (novos campos no
`DEFAULT_PLATFORMS` e no `normalizePlatformData`, garantindo que contas
já existentes no Firestore ganhem os arrays vazios automaticamente),
`index.html`/`calendario.html`/`vip.html`/`edicao.html` (novo link
"💰 Financeiro" na navegação).

**Limitação conhecida**: o botão "Fechar semana" só aparece aos domingos.
Se você esquecer de fechar num domingo, a semana some da lista de fechar
(fica só "em aberto" pra sempre, ainda contando eventos novos) até o
próximo domingo — não há hoje um jeito de fechar atrasado. Ajustar se
virar problema no uso real.
