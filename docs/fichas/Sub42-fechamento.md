# Sub 42 — fechamento (espelho em teste/)

Sub 42: 🔎 por plataforma, ⚡ no grupo, folga oculta no Calendário.
Subida manualmente na raiz (produção); aqui só foi espelhada em `teste/`.

## Arquivos alterados

| Arquivo em `teste/` | Origem na raiz | Pacote |
|---|---|---|
| `teste/js/ui-planejador.js` ⚠️ | commit `656581c` (+209 / −11) | P9 |
| `teste/js/ui-calendario-analytics.js` ⚠️ | commit `656581c` (+11 / −1) | P9 |
| `teste/css/graficos.css` | commit `d82beff` (+53 / −0) | P8 |
| `teste/js/ui-finance-panel.js` | commit `8ad9719` (+2 / −2: `buildPhaseCard` recebe `p`) | P6 |

- Antes da cópia, os 4 arquivos de `teste/` eram idênticos à raiz antes desses commits (sem mudanças próprias, sem conflito). Por isso foi copiada a versão atual da raiz.
- Depois da cópia, os 4 arquivos de `teste/` ficaram idênticos aos da raiz.
- `node --check` ok nos 3 JS.
- Telas afetadas: aba Planejador e aba Calendário (Gráficos); classes de `graficos.css` são compartilhadas entre as abas dos Gráficos (só foram acrescentadas regras); Painel do Financeiro (cards de fase).

## Arquivos novos

- Nenhum no app. Só esta ficha.

## Banco mudou?

- Não. Só exibição: nenhum `writeBatch`/`deleteDoc`/`setDoc`/`savePlatform`, `innerHTML` ou `localStorage` novo.
- Nenhum import novo → MANIFESTO não precisou ser atualizado.

## Pendências

- O commit `6f97f4f` ("Sub 42: …") na raiz está vazio; as mudanças dos JS entraram no `656581c` ("Add files via upload"). Só registro, nada a fazer.
- `teste/js/dev-flags.js` e a raiz não foram tocados.
