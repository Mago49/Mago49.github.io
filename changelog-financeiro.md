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
em `depositLog` (histórico permanente, nunca apagado). O Financeiro soma
a semana a partir de `depositLog`, não mais de `deposits`. Fim e Reinício
continuam funcionando exatamente como antes — eles só mexem em
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

---

## Ajuste — R.B. por aposta, Painel Geral, Total da plataforma e busca no histórico

**R.B. deixou de ser um valor único da semana** e passou a ser informado
em **cada aposta registrada**, junto de Valor apostado e N° de apostas
(`p.betEntries` ganhou um 4° campo: `resultBetting`). A semana atual
passa a mostrar R.B. **ao vivo**, somado automaticamente igual Apostado e
N° de apostas (`computeCurrentWeekLive` em `js/finance-logic.js`).

**A trava de domingo continua existindo, mas agora só protege o Bônus**:
o bloco "Fechar semana" só aparece aos domingos e só pede o valor do
Bônus — o R.B. da semana já chega pronto, somado das apostas registradas
ao longo da semana.

**Limitação nova (fique de olho)**: apostas registradas ANTES desta
atualização não têm `resultBetting` guardado — contam como R.B. = 0 na
soma da semana. Se você já registrou apostas nesta semana antes de
atualizar, o R.B. da semana vai ficar menor do que deveria até você
fechar essa semana; hoje não existe uma tela pra editar uma aposta já
registrada individualmente (só dá pra editar o total depois que a semana
é fechada, via "Editar" no histórico). Ajustar se virar problema real.

**Novo — Total da plataforma**: card novo dentro de cada plataforma,
entre "Semana atual" e "Histórico", somando TODAS as semanas já fechadas
dela (`computePlatformTotals`). Não conta a semana em aberto de
propósito, já que ela ainda pode mudar até ser fechada.

**Novo — busca por data no Histórico**: um campo de data acima da lista
de semanas fechadas pula direto pra semana que contém aquele dia, em vez
de precisar rolar a lista inteira.

**Novo — Painel Geral**: seção nova no topo da Página 5, acima da lista
de plataformas, somando TODAS as plataformas juntas (`computeOverallTotals`),
com filtro De/Até por data (compara contra o `weekStart` de cada semana
fechada). Só considera semanas fechadas, igual ao Total da plataforma —
não inclui a semana em aberto de nenhuma plataforma.

**Arquivos modificados**: `js/finance-logic.js`, `js/ui-finance-panel.js`,
`js/main-financeiro.js`, `financeiro.html`, `css/finance.css`.

---

## Redesenho — Saldo (Balance) vira 100% calculado, e depósito ganha edição na Página 4

**Saldo deixou de ser algo digitado.** O fluxo real é:
`Depósito → Saldo → Aposta → Resultado (R.B.) → Saldo → (domingo) + Bônus → Saldo`.
Ou seja, o Saldo é sempre uma CONSEQUÊNCIA do que já aconteceu — nunca
mais existe uma caixa pra digitar ele à mão. A fórmula
(`computeLiveBalance` em `js/finance-logic.js`) é:

```
Saldo = (todos os Depósitos) − (todos os Saques)
      + (todos os R.B. das apostas) + (todos os Bônus já recebidos)
```

É **vitalício**: soma tudo desde o início (via `depositLog`,
`withdrawals`, `betEntries` e o `bonus` de cada semana em
`financeWeeks`), e nenhum desses arrays é zerado por Fim/Reinício do
ciclo VIP — então o Saldo nunca reseta sozinho.

**Onde o Saldo aparece agora:**
- **Badge do nome da plataforma** (antes de abrir o acordeão): mostra só
  o Saldo, ao vivo — substituiu o antigo badge de "Diferença da semana".
- **Semana atual**: novo 7° campo no grid ao vivo (Depósito, Saque,
  Diferença, Apostado, N° Apostas, R.B., **Saldo**).
- **Fechar semana** (domingo): não pede mais Saldo — ele é travado
  sozinho no momento do fechamento ("saldo de domingo"), já somando o
  Bônus daquela semana. O formulário só pede o Bônus.
- **Semana fechada (Histórico)**: mostra o Saldo TRAVADO naquele
  domingo — uma foto do passado, editável à mão via "Editar" (mesmo
  padrão dos outros 6 campos brutos) se precisar corrigir depois.
- **Total da plataforma** e **Painel Geral**: sempre o Saldo ATUAL, ao
  vivo, recalculado a cada abertura da tela — nunca uma soma entre
  semanas (Saldo é uma foto do momento, não um fluxo que se acumula). No
  Painel Geral, o Saldo soma o saldo atual de cada plataforma e **não
  respeita o filtro De/Até**, porque representa "quanto tem parado agora
  em todas as plataformas juntas", não uma métrica de um período.

**Novo — editar depósito no histórico (Página 4)**: o modal "Histórico de
Depósitos" (`edicao.html` → `showHistoryModal` em
`js/ui-platform-manage.js`) ganhou um botão "Editar" ao lado de
"Excluir". Só o VALOR é editável — data e horário do depósito nunca
mudam, de propósito, pra não confundir quem não está acostumado com
planilha. Ao salvar, o valor é corrigido em `deposits` **e** no
`depositLog` correspondente (localizado pela mesma data) — é assim que o
Financeiro reconhece a correção automaticamente na semana atual (e no
Saldo) na próxima vez que a tela abrir.

**Atenção**: "Excluir" continua só removendo de `deposits` (não mexe em
`depositLog`, que é o histórico permanente usado pelo Saldo) — pra
corrigir um depósito lançado errado de forma que o Saldo também reflita,
use "Editar", não "Excluir".

**Arquivos modificados**: `js/finance-logic.js`, `js/ui-finance-panel.js`,
`js/ui-platform-manage.js`, `financeiro.html`, `css/modals.css`,
`css/base.css`.
