## Página 5 — Financeiro (substitui a planilha externa)

Página `financeiro.html`, quinta do app. Controla, por plataforma, o que
antes vivia numa planilha do Google: Depósito, Saque, Diferença, Bônus,
Valor apostado, N° de apostas, Result Betting (R.B.), R.B. + Bônus e
Saldo (Balance).

**Semana = segunda a domingo**, fixa e igual pra todas as plataformas —
independente do `lastResetDate` de cada uma (que continua valendo só pro
ciclo de nível/VIP, ver `cycle-logic.js`).

**Ao vivo vs. congelado**: durante a semana em aberto, os campos são
somados **ao vivo** toda vez que a tela abre. No domingo, ao fechar a
semana, os campos são **congelados** dentro de um novo item de
`financeWeeks` — depois disso esse registro nunca mais recalcula sozinho,
só editando manualmente (ver "Editar" no histórico).

**Saldo (Balance)**: fluxo `Depósito → Saldo → Aposta → Resultado (R.B.)
→ Saldo → (domingo) + Bônus → Saldo`. Nunca é digitado — é sempre
CALCULADO (`computeLiveBalance` em `js/finance-logic.js`), com piso em
R$ 0,00 (saldo de plataforma nunca é negativo na prática).

**Editar depósito no histórico (Página 4)**: o modal "Histórico de
Depósitos" tem um botão "Editar" ao lado de "Excluir". Só o VALOR é
editável — data e horário nunca mudam. Ao salvar, corrige `deposits` **e**
o `depositLog` correspondente, pra o Financeiro reconhecer a correção
automaticamente. "Excluir" continua só removendo de `deposits`, não de
`depositLog` — pra corrigir um depósito de forma que o Saldo também
reflita, use "Editar".

---

## Fases do Saldo — cada fase conta do zero, sem carregar valor calculado

**Problema**: o histórico antigo de várias plataformas é incompleto (sem
rastreamento de apostas até fevereiro/2026) e tem números conhecidamente
errados na planilha de origem. Tentar reconstruir semana por semana esse
histórico importaria os erros pro sistema novo.

**Solução — Fases**: um botão "🔒 Iniciar nova fase" fecha a fase atual do
Saldo de uma plataforma e começa a contar **do zero** a partir da data
escolhida — **sem carregar nenhum valor calculado da fase anterior**.
Isso é intencional: em vez de confiar num número que pode estar
contaminado por dados antigos ruins, cada fase é um período limpo e
independente, só com o que realmente aconteceu (depósito, saque, R.B.,
bônus) dentro dela.

```
Saldo da fase atual = (Depósitos da fase) − (Saques da fase)
                     + (R.B. da fase) + (Bônus da fase)
```

**Novo campo por plataforma**: `balancePhases: [{date, createdAt}]` —
lista de fronteiras de fase, mais antiga primeiro. Array vazio = nenhuma
fase criada ainda, o Saldo conta desde o início (mesmo comportamento de
antes dessa funcionalidade existir).

**"Fases do Saldo"** — nova seção dentro de cada plataforma (entre "Total
da plataforma" e "Histórico"), mostrando TODAS as fases (inclusive as já
fechadas) como uma lista de cards, cada um com seus próprios 9 campos
(Depósito, Saque, Diferença, Apostado, N° Apostas, Bônus, R.B., R.B.+
Bônus, Saldo da fase). Cada card é **recalculado ao vivo** a partir dos
dados brutos (`depositLog`, `withdrawals`, `financeWeeks`, `betEntries`)
filtrados pelo intervalo daquela fase — nunca um valor congelado que
possa estar errado. `computePhaseHistory` faz esse cálculo.

Também dá pra **remover a última fase** criada (ela se junta de volta com
a anterior) se for engano.

**Painel Geral**: botão "🔒 Iniciar nova fase em todas as plataformas" —
aplica a mesma ação (fronteira = agora) em todas de uma vez, sem precisar
abrir uma por uma.

**Badge do nome, "Semana atual" e "Total da plataforma"** sempre mostram
o Saldo da fase **atual** (a mais recente) — nunca uma soma ou média das
fases anteriores.

**Arquivos modificados**: `js/finance-logic.js` (`getCurrentPhaseStartDate`,
`startNewPhase`, `removeLastPhase`, `computePhaseHistory`, e
`computeLiveBalance`/`computePlatformTotals`/`computeOverallTotals`
ajustados pra considerar só a fase atual), `js/platforms-store.js` (novo
campo `balancePhases`), `js/ui-finance-panel.js` (seção "Fases do Saldo"
+ botão em massa), `financeiro.html` (botão no Painel Geral),
`css/finance.css` (classe `.finance-checkpoint`).
