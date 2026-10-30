# Fechamento — espelho das Sub-entregas 42 e 43 em teste/

Data: 30/10/2026. As duas sub-entregas já estavam na RAIZ (produção), subidas à mão:
- Sub 42 — commits `6f97f4f` (js/) e `d82beff` (css/): 🔎 "Por que mudou" por plataforma no 🔄, ⚡ peso editável no plano de grupo, card só "😴 Folga do plano" fora do detalhe do dia no Calendário.
- Sub 43 — commit `2f34e00`: pergunta do R do VIP diário "com aposta" depois do "coletado? SIM" (+ último R gravado sozinho quando não há pergunta); 🎁 VIP/Obrigado dos próximos dias nas entradas previstas do Planejador (meta só na base Projetado).

## Situação encontrada em teste/
Sem mudanças próprias nesses arquivos — só estavam atrasados:
- `ui-vip-collect.js`: igual à raiz antes da Sub 43.
- `ui-planejador.js`, `ui-calendario-analytics.js`, `graficos.css`: iguais à raiz de 26/10 (`8ad9719`) — Sub 42 nunca espelhada.
- `ui-finance-panel.js`: faltava também a correção de 25/10 (`buildPhaseCard` recebe `p` — Fases do Saldo / Total / Histórico não abriam).

Sem conflito: a versão atual da raiz foi copiada para teste/.

## Arquivos alterados (só em teste/)
- teste/js/ui-finance-panel.js
- teste/js/ui-vip-collect.js
- teste/js/ui-planejador.js
- teste/js/ui-calendario-analytics.js
- teste/css/graficos.css
- docs/MANIFESTO.md — ui-planejador.js passa a importar bonus-ledger-logic.js (Sub 43)

Arquivos novos: nenhum de código. Raiz e teste/js/dev-flags.js não foram tocados.
Conferido: todos os imports desses arquivos existem em teste/js/ e são idênticos aos da raiz. `node --check` ok nos 4 JS.

## Banco
- Sub 42: nada (só exibição).
- Sub 43: grava `platforms.bonusScales` (campo JÁ existente — o mesmo do R no 🧾 Bônus), no mesmo savePlatform da aposta, só para o dia de hoje. Sem campo novo, sem mudança em firestore.rules, sem mudança na lógica central do Rollover.

## Pendências
- Testar no app real (Firebase): registrar aposta numa plataforma "com aposta" (SIM → pergunta do R) e abrir 🔄 Atualizar planos.
- Logo após publicar a Sub 43, planos Projetados podem mostrar ⚠️ "Rollover mudou" uma vez (passaram a contar o VIP futuro) — um 🔄 Atualizar resolve.
- Mapa Técnico: reimprimir p. 21 (UI-01, UI-04), p. 24 (UI-21), p. 25 (UI-27). MANIFESTO: p. 8 (linha do ui-planejador).
