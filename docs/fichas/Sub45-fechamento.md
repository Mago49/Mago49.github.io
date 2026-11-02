# Fechamento — Sub-entrega 45 (Planejador: piso × caixa, Intercalar com N dias, texto do "Seguir rotina")

Data: 02/11/2026. Subida direto na raiz E em teste/, com OK explícito do Pedro (ele confere no app e dá o OK final).

## O que faz
- Piso × caixa: dia que o caixa corta (🔒) abaixo do piso vira R$ 0 (aguardando entrada) e o valor vai pro próximo dia de aposta. Exceção: dia 🏧 e último dia do plano apostam o que couber (pra zerar). Antes o corte ignorava o piso (ex.: piso R$ 4 e dia de R$ 0,80).
- Intercalar com N dias por semana (params.weekCount; chips "Por semana: 1 dia · 2 dias…" até dias marcados − 1). Rodízio: seg/qua/sex com 2 → seg+qua, sex+seg, qua+sex…
- Grupo: "Seguir os dias desta rotina" virou "Apostar só nos dias da rotina "<nome>" (<dias>)", com explicação de marcado/desmarcado.

## Arquivos alterados (raiz e teste/, idênticos)
- js/plan-logic.js — corte do caixa respeita o piso; pickAlternateDays com N; sanitizeParams.weekCount.
- js/ui-planejador.js — chips do N por semana, textos do Intercalar e do Seguir rotina.

Imports: nenhum novo. teste/js/dev-flags.js intocado.

## Banco
Só params.weekCount dentro de betPlans (plano antigo = 1). firestore.rules sem mudança.

## Testes
- Regressão: 96 planos (curvas, Intercalar, caixa, 🏧) sem piso cortado = idênticos à Sub 44.
- Piso 4 com caixa curto: dia de R$ 0,80 virou R$ 0 e o valor foi pro 🏧.
- Intercalar seg/qua/sex: N=1, 2 e 3 conferidos semana a semana.
- node --check nos 2 JS (raiz e teste/).

## Pendências
- Pedro confere no app (grupo com piso, Intercalar 2 por semana, texto do Seguir rotina).
- Mapa Técnico: linha PLN-01 (plan-logic) e p. 24 (UI-21).
