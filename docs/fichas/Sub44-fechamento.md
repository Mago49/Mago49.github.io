# Fechamento — Sub-entrega 44 (Planejador: 🏧 zerar o Rollover + 🎯 só nos dias de emissão)

Data: 02/11/2026. Subida direto na raiz E em teste/, com OK explícito do Pedro.

## O que faz
- 💼 Caixa → "🏧 Zerar o Rollover": Só no fim (padrão) · Em datas · N vezes. O plano vira trechos; até cada 🏧 aposta todo o caixa do trecho (Rollover − falta hoje + entradas até o dia, × peso, − 🔒). Curva repete em cada trecho. Grupo: mesmos dias pra todas.
- 🚫 Restrições → "Dias de emissão do Misterioso": 🚫 Não apostar (como antes) · 🎯 Só nesses dias (individual; no grupo, por plataforma na linha dela). Vale mesmo em folga da semana; respeita dias proibidos e pausa do ciclo.
- 🔮 Emissões previstas do próximo ciclo (predictCycle: volta prevista / próximo Reinício, repetindo pelo intervalo). Calendário avisa no dia 🔮 se o Reinício não foi registrado (🔄 / 🏁).

## Arquivos alterados (raiz e teste/, idênticos)
- js/plan-logic.js — trechos 🏧, modo só emissão, sanitizeParams (zero, emissionMode, emissionOnlyKeys, predictedKeys), planToDoc (zeroPoint/predicted), grupo.
- js/ui-planejador.js — campos 🏧 e 🎯, previsão 🔮, prévia/gráfico/KPI/📊.
- js/calendar-logic.js — repassa zeroPoint/predicted.
- js/ui-calendario-analytics.js — selos 🏧/🔮 e aviso do 🔮.
- css/graficos.css — marcas 🏧/🔮/🎯.

Arquivos novos de código: nenhum. Imports: nenhum novo (MANIFESTO sem mudança). teste/js/dev-flags.js intocado.

## Banco
Só campos novos dentro de betPlans (params.zero, params.emissionMode, params.emissionOnlyKeys, params.predictedKeys; days[].zeroPoint/predicted). firestore.rules aceita (params é map) — sem mudança. Planos antigos = "Só no fim" + "Não apostar" (sameParams igual).

## Testes
- Motor: zerar 3× e por datas (inclusive data em folga) — Rollover fecha em ~R$ 0 em cada 🏧; total = meta. Só emissão (emissão em folga entra; sem emissão = motivo). 🔮 com histórico real de ciclos. Regressão: 60 planos antigos idênticos ao motor anterior.
- node --check nos 4 JS (raiz e teste/).

## Pendências
- Testar a tela no app real (Firebase): plano com 🏧 "N vezes" e 🎯 numa plataforma do grupo.
- Mapa Técnico: reimprimir p. 16 (PLN-07), p. 24 (UI-21), p. 25 (UI-27) e a linha PLN-01 (plan-logic).
