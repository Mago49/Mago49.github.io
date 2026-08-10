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

---

## Correção — Depósitos do Financeiro não dependem mais de Fim/Reinício

**Bug corrigido**: a Página 5 (Financeiro) somava o Depósito da semana
direto de `platform.deposits` — o mesmo array que os botões **Fim** e
**Reinício** (Página 4) zeram de propósito ao reiniciar o ciclo de
nível/VIP. Resultado: encerrar ou reiniciar uma plataforma no meio da
semana apagava, sem aviso nenhum, os depósitos que o Financeiro contava
pra aquela semana — e se a semana já tivesse sido fechada com esse valor
errado, ficava congelada assim pra sempre.

**Solução**: novo array `depositLog` por plataforma (Firestore), que
funciona igual a `withdrawals`/`betEntries` — todo depósito lançado na
Página 4 entra em `deposits` (como sempre, pro ciclo de nível/VIP) **e**
em `depositLog` (histórico permanente, nunca apagado). O Financeiro agora
soma a semana a partir de `depositLog`, não mais de `deposits`. Fim e
Reinício continuam funcionando exatamente como antes — eles só mexem em
`deposits`, que nunca mais é a fonte de dados do Financeiro.

Contas que já existiam no Firestore ganham `depositLog` automaticamente
no próximo login: `normalizePlatformData` (`js/platforms-store.js`) copia
o `deposits` atual pra dentro de `depositLog` na primeira vez que
encontra o campo ausente — depois disso os dois arrays seguem separados.

**Removido**: o botão "Resetar todos os depósitos" (Página 4) saiu do ar.
Ele zerava `deposits` de todas as plataformas de uma vez e tinha o mesmo
problema em escala maior; como Fim/Reinício já cobrem o caso de uso real
(por plataforma), ele deixou de existir.

**Novo**: as semanas fechadas no histórico do Financeiro agora podem ser
editadas (botão "Editar" em cada card). Os 6 campos brutos (Depósito,
Saque, Apostado, N° de apostas, Bônus, R.B.) são editáveis; Diferença e
R.B. + Bônus nunca são digitados direto — são sempre recalculados a
partir dos outros 6 ao salvar (`updateClosedWeek` em
`js/finance-logic.js`), pra nunca ficarem inconsistentes com o resto do
registro.

**Arquivos modificados**: `js/platforms-store.js`, `js/finance-logic.js`,
`js/ui-finance-panel.js`, `js/ui-platform-manage.js`, `edicao.html`,
`css/finance.css`.
