## Página 5 — Financeiro (substitui a planilha externa)

Nova página `financeiro.html`, quinta do app. Controla, por plataforma, o
que antes vivia numa planilha do Google: Depósito, Saque, Diferença,
Bônus, Valor apostado, N° de apostas, Result Betting (R.B.) e R.B. + Bônus.

**Semana = segunda a domingo**, fixa e igual pra todas as plataformas —
independente do `lastResetDate` de cada uma (que continua valendo só pro
ciclo de nível/VIP, ver `cycle-logic.js`). Esse é um conceito novo e
separado, criado em `finance-logic.js`.

**Modelo de dados** — arrays por plataforma (Firestore): `withdrawals`,
`betEntries`, `financeWeeks` (um registro por semana **fechada**),
`depositLog` (histórico permanente de depósitos, usado pelo Financeiro —
ver seção de correção mais abaixo).

**Ao vivo vs. congelado**: durante a semana em aberto, os campos são
somados **ao vivo** toda vez que a tela abre. No domingo, ao fechar a
semana, os campos são **congelados** dentro de um novo item de
`financeWeeks` — depois disso esse registro nunca mais recalcula sozinho,
só editando manualmente (ver "Editar" no histórico).

---

## Redesenho — Saldo (Balance) vira 100% calculado, e depósito ganha edição na Página 4

**Saldo deixou de ser algo digitado.** O fluxo real é:
`Depósito → Saldo → Aposta → Resultado (R.B.) → Saldo → (domingo) + Bônus → Saldo`.
Fórmula (`computeLiveBalance` em `js/finance-logic.js`):

```
Saldo = (todos os Depósitos) − (todos os Saques)
      + (R.B. de todas as semanas) + (todos os Bônus já recebidos)
```

É **vitalício**: soma tudo desde o início, nunca reseta com Fim/Reinício
do ciclo VIP.

**Onde o Saldo aparece:**
- Badge do nome da plataforma (antes de abrir o acordeão): Saldo ao vivo.
- Semana atual: 7° campo no grid ao vivo.
- Fechar semana (domingo): não pede mais Saldo — trava sozinho, já
  somando o Bônus daquela semana ("saldo de domingo").
- Semana fechada (Histórico): mostra o Saldo travado naquele domingo,
  editável à mão se precisar corrigir.
- Total da plataforma / Painel Geral: sempre o Saldo ATUAL, ao vivo — no
  Painel Geral, soma o saldo de cada plataforma e não respeita o filtro
  De/Até (representa "quanto tem parado agora", não uma métrica de
  período).

**Novo — editar depósito no histórico (Página 4)**: o modal "Histórico de
Depósitos" ganhou um botão "Editar" ao lado de "Excluir". Só o VALOR é
editável — data e horário nunca mudam. Ao salvar, corrige `deposits` **e**
o `depositLog` correspondente (localizado pela mesma data), pra o
Financeiro reconhecer a correção automaticamente. **Atenção**: "Excluir"
continua só removendo de `deposits`, não de `depositLog` — pra corrigir
um depósito de forma que o Saldo também reflita, use "Editar".

---

## Correção — R.B. de apostas antigas não entrava no Saldo ao vivo

**Bug encontrado**: `computeLiveBalance` somava o R.B. direto de
`betEntries` (todas as apostas, desde sempre). Mas apostas registradas
ANTES do R.B. virar um campo por aposta (ver histórico deste changelog)
não têm `resultBetting` salvo nelas — cada uma contava como R.B. = 0,
subestimando o Saldo em plataformas com apostas antigas. Exemplo real:
uma plataforma com R.B. travado de R$ 15,46 numa semana fechada mostrava
Saldo -R$ 20,88 no "Total da plataforma", quando o correto era -R$ 5,42
— uma diferença de exatamente R$ 15,46, o R.B. que sumiu.

**Correção**: o R.B. usado no Saldo agora vem de duas fontes: o R.B. já
**travado** de cada semana fechada (`financeWeeks[].resultBetting` —
sempre confiável, vale tanto pras apostas antigas quanto pras novas) +
o R.B. das apostas da semana **atual**, ainda aberta (somado direto de
`betEntries`, que só é confiável pra apostas registradas depois da
atualização anterior). Isso elimina a lacuna sem precisar re-cadastrar
nenhuma aposta antiga.

---

## Correção — Saldo nunca fica negativo (piso em R$ 0,00)

Saldo de plataforma não existe como número negativo na prática — o
mínimo possível é R$ 0,00. Esse piso agora é aplicado em todo lugar onde
o Saldo é calculado ou salvo:
- `computeLiveBalance` — nunca retorna menos que 0 (afeta badge, Semana
  atual, Total da plataforma e Painel Geral automaticamente, já que todos
  usam essa função).
- `closeWeek` — o "saldo de domingo" travado no fechamento também tem
  piso em 0.
- `updateClosedWeek` — editar manualmente o Saldo de uma semana fechada
  também não deixa salvar um valor negativo.
- Exibição do histórico (`statsGridHtml` em `js/ui-finance-panel.js`) —
  trava em 0 defensivamente na hora de mostrar, caso alguma semana tenha
  sido fechada com Saldo negativo antes dessa regra existir.

**Arquivos modificados**: `js/finance-logic.js`, `js/ui-finance-panel.js`.
