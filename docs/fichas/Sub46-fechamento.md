# Fechamento — Sub-entrega 46 (👁 Badges do Financeiro + setas do Reordenar)

Data: 05/11/2026. Subida direto na raiz E em teste/, com OK explícito do Pedro.

## O que faz
- Financeiro → 👁 Badges: além de Saldo e Rollover, agora ⬇️ Abatido, ⬆️ Aumentado e ✓ Semana fechada podem ser escondidos (padrão: aparecem). Esconder o ✓ no domingo deixa à vista quem não fechou a semana.
- Reordenar (Edição e Financeiro): a linha movida fica no mesmo lugar da tela (keepRowInPlace — guarda a posição, refaz a lista, rola só a diferença, repete no próximo quadro e devolve o foco à seta). Corrige a página "fugindo" pro topo ao tocar ▲▼.
- Setas ▲▼ com o mesmo visual nas duas páginas (.reorder-arrows/.reorder-arrow em manage-panel.css): contorno claro, 44px.

## Arquivos alterados (raiz e teste/, idênticos)
- js/ui-finance-panel.js — badges condicionais, checkboxes novos, setas, keepRowInPlace.
- js/ui-platform-manage.js — setas, keepRowInPlace.
- js/view-financeiro.js — 3 caixinhas novas no 👁 Badges.
- js/user-preferences-store.js — financeAbatBadge, financeAumBadge, financeClosedBadge (padrão true).
- css/manage-panel.css — .reorder-arrows / .reorder-arrow.

Imports: nenhum novo (MANIFESTO sem mudança). teste/js/dev-flags.js intocado.

## Banco
users/{uid}/meta/preferences.badgeVisibility ganha 3 chaves (merge — nada apagado). firestore.rules sem mudança (preferences já aceito).

## Testes
- node --check nos 4 JS (raiz e teste/).
- Setas renderizadas com o CSS real do app (celular 390px).
- Lista de 20 linhas rolada: a linha movida ficou parada (±6 px); o código antigo deslocava ~70 px no teste local (o salto pro topo do celular não reproduziu no Chromium daqui).

## Pendências
- Pedro confere no celular: reordenar nas duas páginas sem a página subir; caixinhas novas do 👁 Badges.
- Aparelho com a versão antiga em cache: salvar badges lá volta as 3 novas pra "aparecer" (recarregar resolve).
- Mapa Técnico: UI-01 (ui-finance-panel), linha do ui-platform-manage, user-preferences-store e CSS-14 (manage-panel.css).

## Complemento — Sub-entrega 47 (05/11/2026)
- Financeiro → ⇅ Ordenar: "Maior Rollover" / "Menor Rollover" (computeRolloverLive, mesmo valor do badge; empate por nome). Só js/ui-finance-panel.js (raiz e teste/). Banco, imports e regras sem mudança. node --check ok.
