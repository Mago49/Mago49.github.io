# MANIFESTO — Painel do Tigrinho · Atualização geral (app)

> Mapa real de imports e banco, conferido arquivo por arquivo em 22–23/10/2026 (repo no commit `038d4ba`: 120 arquivos web + `firestore.rules` + 8 do bot).
> Serve pra: (1) saber a ORDEM de envio dos arquivos, (2) saber, antes de mexer num arquivo, QUEM MAIS depende dele, (3) saber o que cada arquivo faz no BANCO.

## 1. Como usar neste projeto

- O trabalho segue **por pacote** (seção 3). Cada pacote = uma etapa (uma view). P0 e P1 são lidos sempre que necessário.
- A pasta `teste/` recebe o sistema INTEIRO no dia 1 (cópia). Os pacotes limitam o que é LIDO e ALTERADO em cada etapa — nunca ler o sistema todo.
- Antes de alterar um arquivo, olhe a coluna **"Usado também por"**. Se aparecer outro pacote, a mudança é **compartilhada**: avisar e conferir as outras views.
- Fluxo de sempre: **Fase 1** discussão + lista de arquivos esperados → **Fase 2** análise e onde alterar (avisar se o arquivo já foi alterado antes) → **Fase 3** arquivo completo quando pedido/prudente. `node --check` antes de entregar. Sem prefixo `-new`.
- **Nunca** mudar regra de negócio, cálculo financeiro ou estrutura do Firestore sem confirmação explícita.
- **Fonte da verdade = repositório `Mago49/Mago49.github.io`** (público). Caminhos deste MANIFESTO são os do repo: `index.html`, `css/` (21), `js/` (98). Fora do repo: `firestore.rules` (console do Firebase) e `bot/` (repositório privado do bot, roda na VM).
- Este MANIFESTO vive em `docs/MANIFESTO.md` e é atualizado ao fechar cada pacote (arquivo novo, import novo ou mudança de banco).

## 2. Modo teste (tarja laranja) — regras

- Estrutura no repo: **raiz = produção** (intocada durante o trabalho) · **`teste/`** = cópia completa (`index.html`, `css/`, `js/`) com `SAFE_MODE = true` em `teste/js/dev-flags.js` → `mago49.github.io/teste/` · **`docs/`** = este MANIFESTO + fichas de entrada/fechamento.
- Todos os caminhos do app são relativos (conferido): a cópia em `teste/` funciona sem mudar nada além do `dev-flags.js`. Mesmo domínio = mesmo login (não precisa logar de novo) e o mesmo `localStorage` (só 2 chaves de conveniência; sem cache offline do Firestore).
- A tarja **MODO TESTE** aparece sozinha (`main.js` + `#safeModeBanner`).
- **Promoção pra produção** = copiar os arquivos aprovados de `teste/` pra raiz, **NUNCA o `teste/js/dev-flags.js`** (com SAFE_MODE = true a produção pararia de gravar). Conferir `SAFE_MODE = false` na raiz depois de toda promoção.
- Claude Code (Oficina) só commita dentro de `teste/` e `docs/`. Promoção pra raiz só com OK explícito do Pedro.
- **O que o SAFE_MODE bloqueia:** `writeBatch().commit()` e `deleteDoc` (embrulhados em `firebase-init.js`). Como TODO arquivo grava só por essas duas funções, nada chega ao banco. `batch.set(..., {merge:true})` e `batch.update` também passam pelo stub.
- **O que NÃO é bloqueado:**
  - **Leituras** continuam ao vivo (dados reais da conta) — inclusive os 3 `onSnapshot` do Telegram.
  - **Bot do Telegram** grava pelo Admin SDK no servidor — fora do app, fora do SAFE_MODE.
  - `localStorage` (`planOvOpen`, `painelUltimoBackup`) e o **download do backup** (só leitura) funcionam normalmente.
  - **Ler print (Gemini)**: funciona na pasta de teste porque o App Check é do domínio `mago49.github.io` (mesmo domínio). Não grava nada.
- **Atenção:** em modo teste a memória muda e o banco não — depois de "salvar" algo no teste, **recarregar a página** volta ao estado real. Não comparar números entre telas depois de uma gravação simulada sem recarregar.
- **Regra de ouro pra arquivo novo:** gravar SÓ por `writeBatch`/`deleteDoc` importados de `firebase-init.js`. Nunca importar `setDoc`/`updateDoc`/`addDoc` direto do SDK (furaria o SAFE_MODE).
- `firestore.rules` não é testado pela tarja: mudança de regra vai pro console e vale pros dois sistemas.
- Admin do aviso global: UID fixo em `view-edicao.js` e em `firestore.rules`.

## 3. Ordem dos pacotes

| Pacote | Conteúdo | Arquivos | Observação |
|---|---|---|---|
| **P0** | Núcleo | 22 | Sempre no projeto. Base de toda conversa. |
| **P1** | Motor de negócio | 5 | Lógica pura. Só consulta numa atualização de interface — mexer aqui exige confirmação. |
| **P2** | Início | 8 | View mais simples: calibra o padrão visual novo. |
| **P3** | Calendário | 13 |  |
| **P4** | Edição | 13 | Traz várias peças compartilhadas (tipos de depósito, ciclos, 🧬, fotos diárias). |
| **P5** | VIP | 11 | Traz o contexto de bônus (usado depois por Financeiro, Gráficos e Perfil). |
| **P6** | Financeiro | 13 | A view mais sensível: grava já no mount. |
| **P7** | Perfil | 6 |  |
| **P8** | Gráficos A — Visão Geral, Análises, Total Apostado | 7 | Casca dos Gráficos + 3 abas. |
| **P9** | Gráficos B — Planejador, Misterioso, Calendário | 15 | Bloco acoplado: o Calendário importa o Planejador. Sempre juntos. |
| **P10** | Gráficos C — Rotinas, 🏆 Grupos, Jogos | 4 |  |
| **P11** | Telegram | 12 | Por último: fica desligado na versão da loja (TELEGRAM_FEATURE). |
| | **Total** | **129** + este MANIFESTO | cada arquivo em exatamente 1 pacote (conferido por script) |

Ordem pensada do mais simples ao mais acoplado: as peças compartilhadas chegam com a primeira view que precisa delas, e nenhum arquivo depende de um pacote que ainda não chegou
— exceções intencionais: `router.js` (P0) importa as 7 views, e `view-graficos.js` (P8) importa as abas de P9–P11. Isso não atrapalha: a pasta `teste/` tem tudo desde o dia 1.

## P0 — Núcleo
_Sempre no projeto. Base de toda conversa._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `index.html` | Casca do app: links dos 21 CSS globais, nav global, #safeModeBanner, #authScreen, #appShell, #appModal | main.js | — | — |
| `js/main.js` | Boot: mostra a tarja MODO TESTE, recarrega após 30 min em 2º plano | ui-background.js, auth-guard.js, router.js, dev-flags.js, state.js | — | só este pacote |
| `js/router.js` | Rotas por hash, mount/unmount de cada view | view-inicio.js, view-calendario.js, view-vip.js, view-edicao.js, view-financeiro.js, view-graficos.js, view-perfil.js | — | só este pacote |
| `js/state.js` ⚠️ | Objeto state {platforms, currentUid, vipBonusTemplates, vipTemplateIssues, calendar} | — | — | P2, P3, P4, P5, P6, P7, P8, P9, P10, P11 |
| `js/dev-flags.js` ⚠️ | SAFE_MODE (tarja laranja) e TELEGRAM_FEATURE | — | — | P8 |
| `js/firebase-init.js` ⚠️ | Porta única do banco: exporta db, auth, firebaseApp e as funções do SDK | dev-flags.js | ÚNICO initializeApp (painel1-b6ec2). writeBatch/deleteDoc embrulhados (SAFE_MODE = não grava) | P2, P3, P4, P5, P6, P7, P8, P9, P11 |
| `js/auth-guard.js` | Login Google, carga inicial, EMPTY_READ_ANOMALY | firebase-init.js, state.js, utils.js, platforms-store.js, vip-bonus-template-store.js, vip-bonus-template-logic.js | lê platforms + vipBonusTemplates | só este pacote |
| `js/utils.js` ⚠️ | formatCurrency, escapeHtml, showAppModal/Alert/Confirm (#appModal) | — | — | P2, P3, P4, P5, P6, P7, P8, P9, P10, P11 |
| `js/platforms-store.js` ⚠️ | savePlatform (GUARDED_FIELDS + allowShrink + rev), deletePlatformDoc | firebase-init.js | platforms R/W/D + meta/initialized (sentinela) | P4, P5, P6, P8 |
| `firestore.rules` | Segurança do banco (sobe no console do Firebase, não no GitHub Pages) | — | regras de TODAS as coleções + /announcements (raiz, UID admin fixo) | — |
| `js/cycle-logic.js` ⚠️ | NÚCLEO DE NEGÓCIO: níveis/levelHistory, ciclo, emissões, VIP, LEVEL_INFO, colorForLevel (lê --level-N do CSS) | state.js, vip-bonus-template-logic.js | — (puro) | P1, P2, P3, P4, P5, P6, P7, P8, P9 |
| `js/vip-bonus-template-logic.js` ⚠️ | Tabela VIP padrão, versões de template, validações | — | — (puro) | P5 |
| `js/vip-bonus-template-store.js` ⚠️ | Templates VIP (carregado no login) | firebase-init.js, state.js, utils.js, vip-bonus-template-logic.js | vipBonusTemplates R/W/D (relê platforms antes de excluir) | P5 |
| `js/ui-background.js` | Animação SVG do fundo | — | — | só este pacote |
| `css/variables.css` | Tokens globais (cores, raios, sombras, --level-N) | — | — | — |
| `css/base.css` | Reset/base | — | — | — |
| `css/layout.css` | .card-shell, .section-heading, .pill (usados em todas as views) | — | — | — |
| `css/nav.css` | Navegação global | — | — | — |
| `css/hero.css` | Hero do Início + .summary-card (usado em quase todas as views) | — | — | — |
| `css/panel.css` | Global (conferir uso exato antes de mexer) | — | — | — |
| `css/modals.css` | TODOS os mini-contêineres: .deposit-kind-*, .bc-*, .be-*, .bb-*, .bk-*, .sp-*, .tr-*, .cy-*, .np-*, #appModal | — | — | — |
| `css/responsive.css` | Ajustes mobile — sempre o ÚLTIMO CSS | — | — | — |

## P1 — Motor de negócio
_Lógica pura. Só consulta numa atualização de interface — mexer aqui exige confirmação._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/finance-logic.js` ⚠️ | Semana seg–dom, Saldo/Rollover ao vivo, fases, fechamento, Painel Geral, abatimento/aumento | bonus-ledger-logic.js | — (puro) | P4, P5, P6, P8, P9, P10 |
| `js/bonus-ledger-logic.js` ⚠️ | PONTE cycle↔finance: bônus esperado do dia, avulso efetivo, bônus alto, escala R | cycle-logic.js, misterioso-logic.js | — (puro) | P4, P6, P7, P8, P10 |
| `js/misterioso-logic.js` ⚠️ | 8 patamares do Misterioso, valor efetivo, janela de 7 dias | cycle-logic.js | — (puro) | P5, P9, P10 |
| `js/balance-check-logic.js` ⚠️ | Conferência de saldo, exclusões, abatimento/aumento de rollover | finance-logic.js, bonus-ledger-logic.js | — (puro, muta o objeto; quem chama grava) | P5, P6 |
| `js/wager-total-logic.js` ⚠️ | Total apostado real, níveis pelo apostado, parseMoneyInput (usado em muitos) | finance-logic.js | — (puro) | P5, P6, P8, P9, P10 |

## P2 — Início
_View mais simples: calibra o padrão visual novo._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-inicio.js` ⚠️ | View Início (Hub) | state.js, cycle-logic.js, ui-hero.js, ui-codigo.js, ui-announcement.js | — | P0 |
| `js/ui-hero.js` ⚠️ | renderHeroSummary (Início) + renderLegend (legenda fixa do Calendário) | utils.js, cycle-logic.js | — | P3 |
| `js/ui-codigo.js` | Painéis Códigos + Depósitos-Hoje | state.js, utils.js, codigo-logic.js | só leitura | só este pacote |
| `js/codigo-logic.js` | Gerador de códigos | — | — (puro) | só este pacote |
| `js/ui-announcement.js` | Banner de aviso no Hub | announcement-store.js, utils.js | lê | só este pacote |
| `js/announcement-store.js` ⚠️ | Aviso global | firebase-init.js | announcements/current R/W (raiz, só admin grava) | P4 |
| `css/codigo.css` | .codigo-* (Hub) | — | — | — |
| `css/announcement.css` | Banner de aviso | — | — | — |

## P3 — Calendário

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-calendario.js` ⚠️ | Calendário do Bônus Misterioso (FullCalendar 6.1.15 por CDN, lazy) | state.js, cycle-logic.js, ui-hero.js, ui-calendar.js, ui-platform-cards.js, card-customization-store.js, ui-card-customization.js | lê meta/cardCustomization | P0 |
| `js/ui-calendar.js` | Eventos do FullCalendar | state.js, cycle-logic.js | — | só este pacote |
| `js/ui-platform-cards.js` | Grade de cards-filtro | state.js, cycle-logic.js, platform-sort.js, ui-calendar.js, ui-sort.js, card-customization-store.js, color-palette.js, utils.js | — | só este pacote |
| `js/ui-card-customization.js` | Painel 🎯 Personalização | state.js, card-customization-store.js, color-palette.js | grava via store | só este pacote |
| `js/card-customization-store.js` | Cor/marcador dos cards | firebase-init.js | meta/cardCustomization R/W | só este pacote |
| `js/color-palette.js` | 30 tons + darkenColor | — | — | só este pacote |
| `js/platform-sort.js` ⚠️ | sortPlatforms, filterAndSortForManage, SORT_MENU_OPTIONS | cycle-logic.js | — (puro) | P4, P6 |
| `js/ui-sort.js` ⚠️ | Menu ⇅ Ordenar genérico (devolve cleanup) | platform-sort.js | — | P4, P6 |
| `css/calendar.css` | FullCalendar | — | — | — |
| `css/platform-cards.css` | .pcard | — | — | — |
| `css/card-customization.css` | Personalização | — | — | — |
| `css/sort-menu.css` | Menu Ordenar (também Edição/Financeiro) | — | — | — |
| `css/footer.css` | Legenda fixa #appFooter | — | — | — |

## P4 — Edição
_Traz várias peças compartilhadas (tipos de depósito, ciclos, 🧬, fotos diárias)._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-edicao.js` ⚠️ | View Edição + modais Reinício/Histórico no body | state.js, ui-platform-manage.js, announcement-store.js, user-preferences-store.js, utils.js | announcements/current (editor admin, UID fixo) | P0 |
| `js/ui-platform-manage.js` | Acordeão: Ações / Dados / Códigos / 🧬; Fim, Reinício, depósito, histórico | state.js, utils.js, cycle-logic.js, ui-vip-change.js, platforms-store.js, platform-sort.js, ui-sort.js, user-preferences-store.js, deposit-kinds.js, bonus-ledger-logic.js, finance-logic.js, ui-traits.js, cycle-history-logic.js, ui-cycle-history.js | platforms (savePlatform/deletePlatformDoc, allowShrink deposits/depositLog), meta/preferences | só este pacote |
| `js/user-preferences-store.js` ⚠️ | Ordem manual + visibilidade de badges | firebase-init.js | meta/preferences R/W (merge) | P6 |
| `js/deposit-kinds.js` ⚠️ | Tipos de depósito + seletor (.deposit-kind-*, .bc-*) | ui-bonus-split.js | — | P6, P9, P10 |
| `js/ui-bonus-split.js` ⚠️ | Editor ➗ Dividir | — | — | P5, P6 |
| `js/ui-vip-change.js` ⚠️ | Pergunta "Já recebeu o bônus VIP de hoje?" (usa .deposit-kind-*) | — | — | P5, P8 |
| `js/ui-traits.js` ⚠️ | 🧬 seção da Edição + editor de etiquetas (Jogos) | state.js, traits-logic.js, traits-store.js | platformTraits via store | P10 |
| `js/traits-logic.js` ⚠️ | Etiquetas/texto | — | — (puro) | P6, P10 |
| `js/traits-store.js` | Características das plataformas | firebase-init.js, state.js, traits-logic.js | platformTraits R/W/D | só este pacote |
| `js/ui-cycle-history.js` ⚠️ | 📜 Ciclos / 🔁 Reconstruir / 📥 Colar tabela (.cy-*) | state.js, utils.js, platforms-store.js, daily-snapshot-store.js, cycle-history-logic.js | platforms (cycleHistory, allowShrink) + lê dailySnapshots | P9 |
| `js/cycle-history-logic.js` ⚠️ | Histórico e previsão de ciclos | — | — (puro) | P9 |
| `js/daily-snapshot-store.js` ⚠️ | Fotos diárias (gravadas pelo Financeiro e Gráficos) | firebase-init.js, finance-logic.js, bonus-ledger-logic.js, cycle-logic.js | dailySnapshots R/W (merge) | P6, P8 |
| `css/manage-panel.css` | Acordeão da Edição + histórico de depósitos | — | — | — |

## P5 — VIP
_Traz o contexto de bônus (usado depois por Financeiro, Gráficos e Perfil)._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-vip.js` ⚠️ | View VIP: 4 abas + 🧾 Bônus da semana + Templates | ui-vip-panel.js, state.js, utils.js, bonus-context-store.js, ui-bonus-manager.js | via módulos | P0 |
| `js/ui-vip-panel.js` | Abas VIP/Obrigado/Misterioso/Histórico mensal (applyActiveTab usa seletor GLOBAL .vip-tab-btn) | state.js, utils.js, cycle-logic.js, ui-vip-change.js, vip-bonus-template-logic.js, vip-bonus-template-store.js, vip-bonus-template-import.js, platforms-store.js, vip-obrigado-store.js, vip-misterioso-store.js, misterioso-logic.js, misterioso-template-import.js, vip-history-store.js | platforms (obrigadoDays, misteriosoBonusLog), obrigadoConfig, misteriosoTemplates, vipBonusTemplates, vipHistory | só este pacote |
| `js/vip-bonus-template-import.js` | Colar planilha VIP | vip-bonus-template-logic.js | — (puro) | só este pacote |
| `js/vip-obrigado-store.js` | Valor do Obrigado | firebase-init.js | meta/obrigadoConfig R/W | só este pacote |
| `js/vip-misterioso-store.js` | Templates do Misterioso (gravação atômica) | firebase-init.js, misterioso-logic.js | misteriosoTemplates R/W/D | só este pacote |
| `js/misterioso-template-import.js` | Colar 8 linhas | misterioso-logic.js | — (puro) | só este pacote |
| `js/vip-history-store.js` ⚠️ | Fechamento mensal VIP | firebase-init.js, cycle-logic.js, misterioso-logic.js, vip-obrigado-store.js, vip-misterioso-store.js | vipHistory (só cria) | P8 |
| `js/bonus-context-store.js` ⚠️ | loadBonusContextStrict / resolveCtx (VIP, Financeiro, Gráficos, Perfil) | vip-obrigado-store.js, vip-misterioso-store.js | só leitura estrita | P6, P7, P8 |
| `js/ui-bonus-manager.js` ⚠️ | 🧾 Bônus da semana (.bm-*) — VIP e Financeiro | state.js, utils.js, platforms-store.js, balance-check-logic.js, ui-rollover-adjust.js, finance-logic.js, wager-total-logic.js | platforms | P6 |
| `js/ui-rollover-adjust.js` | ⬇️ abatido, 📋 conferência em lote, 🧹 revisar ajustes | state.js, utils.js, platforms-store.js, finance-logic.js, balance-check-logic.js, ui-bonus-split.js | platforms (lote) | só este pacote |
| `css/vip.css` | Painel VIP | — | — | — |

## P6 — Financeiro
_A view mais sensível: grava já no mount._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-financeiro.js` ⚠️ | View Financeiro | state.js, ui-finance-panel.js, finance-logic.js, platforms-store.js, utils.js, bonus-context-store.js, user-preferences-store.js | GRAVA no mount (autoCloseOverdueWeeks + savePlatform) | P0 |
| `js/ui-finance-panel.js` | Painel Geral + acordeão por plataforma (MUITO GRANDE ~100 KB) | state.js, utils.js, cycle-logic.js, finance-logic.js, bonus-ledger-logic.js, user-preferences-store.js, platforms-store.js, finance-spreadsheet-import.js, platform-sort.js, ui-sort.js, daily-snapshot-store.js, deposit-kinds.js, ui-vip-collect.js, ui-bonus-split.js, ui-balance-check.js, ui-bet-entry.js, bet-batch-logic.js, game-catalog-logic.js, game-catalog-store.js, ui-bonus-manager.js, balance-check-logic.js | platforms (depósito, saque, aposta, bônus, semanas, fases, backfill), dailySnapshots, preferences | só este pacote |
| `js/ui-balance-check.js` | Conferência de saldo (.bc-*) | utils.js, ui-bonus-split.js, balance-check-logic.js | muta; quem chama grava | só este pacote |
| `js/ui-vip-collect.js` | Pergunta VIP coletado | — | — | só este pacote |
| `js/ui-bet-entry.js` | Registrar aposta (.be-*) | state.js, utils.js, wager-total-logic.js, finance-logic.js, game-catalog-logic.js, game-catalog-store.js, ui-bet-batch.js | gameCatalog (jogo novo) | só este pacote |
| `js/ui-bet-batch.js` | Lote colado + 📷 Ler print (.bb-*) | state.js, utils.js, finance-logic.js, bet-batch-logic.js, game-catalog-store.js, game-catalog-logic.js, gemini-reader.js | gameCatalog/gameConfig (bulk) | só este pacote |
| `js/bet-batch-logic.js` | Parser do lote | game-catalog-logic.js | — (puro) | só este pacote |
| `js/gemini-reader.js` | 📷 Ler print | firebase-init.js, ai-config.js | Firebase AI Logic (instância separada, App Check do domínio) — não grava | só este pacote |
| `js/ai-config.js` | Chave reCAPTCHA, modelo Gemini, versão do SDK de IA | — | — | só este pacote |
| `js/finance-spreadsheet-import.js` | Parser de planilha (backfill) | — | — (puro) | só este pacote |
| `js/game-catalog-logic.js` ⚠️ | Biblioteca de jogos: limpeza, estatística por jogo | wager-total-logic.js, traits-logic.js | — (puro) | P9, P10 |
| `js/game-catalog-store.js` ⚠️ | Biblioteca de jogos | firebase-init.js, state.js, game-catalog-logic.js | gameCatalog R/W/D, gameConfig/providers R/W | P10 |
| `css/finance.css` | Financeiro (+ .finance-empty, usado pelo Perfil) | — | — | — |

## P7 — Perfil

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-perfil.js` ⚠️ | Histórico Geral + Backup + Sair | firebase-init.js, state.js, utils.js, bonus-context-store.js, history-feed-logic.js, backup-store.js, ui-backup.js, backup-logic.js | lê meta/backupInfo; localStorage painelUltimoBackup | P0 |
| `js/history-feed-logic.js` | Feed do dia | bonus-ledger-logic.js, cycle-logic.js | — (puro) | só este pacote |
| `js/backup-store.js` | Backup em partes, conferido | firebase-init.js, state.js, backup-logic.js | LÊ tudo; grava só meta/backupInfo | só este pacote |
| `js/backup-logic.js` | Lista de coleções do backup, tamanho real, divisão | — | — (puro) | só este pacote |
| `js/ui-backup.js` | 🛡️ Backup (.bk-*) | state.js, backup-store.js, backup-logic.js | meta/backupInfo via store | só este pacote |
| `css/historico.css` | .hist-* (Perfil) | — | — | — |

## P8 — Gráficos A — Visão Geral, Análises, Total Apostado
_Casca dos Gráficos + 3 abas._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/view-graficos.js` ⚠️ | View Gráficos: 10 abas, Chart.js 4.4.4 por CDN (lazy) | state.js, utils.js, analytics-logic.js, bonus-context-store.js, daily-snapshot-store.js, ui-graficos-analise.js, ui-total-apostado.js, ui-planejador.js, ui-rotinas.js, ui-misterioso.js, ui-calendario-analytics.js, ui-game-catalog.js, ui-grupos.js, ui-telegram.js, dev-flags.js | GRAVA dailySnapshots | P0 |
| `css/graficos.css` | Abas dos Gráficos + .plan-*, .cal-*, .rt-*, .gr-*, .gc-* (compartilhadas entre abas) | — | — | — |
| `js/analytics-logic.js` | Visão Geral: KPIs, séries, ranking, heatmap | finance-logic.js, vip-history-store.js, bonus-ledger-logic.js | — (puro) | só este pacote |
| `js/ui-graficos-analise.js` | Aba Análises | state.js, utils.js, finance-logic.js, daily-snapshot-store.js, analise-logic.js | lê dailySnapshots | só este pacote |
| `js/analise-logic.js` | Períodos, caixa, RTP, previsão | finance-logic.js, bonus-ledger-logic.js | — (puro) | só este pacote |
| `js/ui-total-apostado.js` | Aba Total Apostado (.wager-*) | state.js, utils.js, platforms-store.js, finance-logic.js, cycle-logic.js, ui-vip-change.js, wager-total-logic.js, wager-requirements-store.js | platforms (wagerAnchors, promoção) | só este pacote |
| `js/wager-requirements-store.js` ⚠️ | Tabelas de Aposta Necessária | firebase-init.js, state.js, wager-total-logic.js | wagerRequirements R/W/D | P9 |

## P9 — Gráficos B — Planejador, Misterioso, Calendário
_Bloco acoplado: o Calendário importa o Planejador. Sempre juntos._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/ui-planejador.js` ⚠️ | Aba Planejador (MUITO GRANDE) — exporta requestPlanejadorFocus/requestStopToday | state.js, utils.js, finance-logic.js, cycle-logic.js, wager-total-logic.js, wager-requirements-store.js, plan-logic.js, stop-reasons.js, speed-logic.js, ui-speed.js, newplatform-logic.js, ui-new-platform.js, cycle-history-logic.js, ui-cycle-history.js, plan-store.js, routine-store.js, routine-logic.js, strategy-logic.js, calendar-logic.js, plan-log-store.js, bonus-ledger-logic.js (Sub 43) | betPlans, plannerConfig (via plan-store); localStorage planOvOpen | P8 |
| `js/plan-logic.js` | Motor do Modulador de apostas | finance-logic.js, cycle-logic.js | — (puro) | só este pacote |
| `js/plan-store.js` ⚠️ | Store central do planejamento | firebase-init.js, state.js, plan-logic.js, strategy-logic.js, finance-logic.js, speed-logic.js, newplatform-logic.js, plan-log-store.js, stop-reasons.js | betPlans R/W/D, plannerConfig/{palette,settings,strategy,calendar,speed,newPlatforms,stopReasons} | P10 |
| `js/plan-log-store.js` ⚠️ | Histórico do planejado, 🏁, 🙈 | firebase-init.js, state.js, finance-logic.js, stop-reasons.js | planLog R/W/D | P10 |
| `js/stop-reasons.js` | Motivos do 🏁 | — | — (puro) | só este pacote |
| `js/speed-logic.js` | ⚡ Peso/épocas | — | — (puro) | só este pacote |
| `js/ui-speed.js` | ⚡ mini-contêiner (.sp-*) | state.js, utils.js, wager-total-logic.js, plan-store.js, speed-logic.js | plannerConfig/speed | só este pacote |
| `js/newplatform-logic.js` ⚠️ | 🆕 Novas plataformas + 💼 Caixa | misterioso-logic.js, routine-logic.js, deposit-kinds.js, finance-logic.js, cycle-history-logic.js | — (puro) | P10 |
| `js/ui-new-platform.js` | 🆕 mini-contêiner (.np-*) | state.js, utils.js, wager-total-logic.js, plan-store.js, newplatform-logic.js, finance-logic.js | plannerConfig/newPlatforms | só este pacote |
| `js/strategy-logic.js` ⚠️ | Estratégia do Misterioso, contenção | cycle-logic.js, misterioso-logic.js, finance-logic.js, deposit-kinds.js | — (puro) | P10 |
| `js/ui-misterioso.js` ⚠️ | Aba Misterioso (.ms-*) | state.js, utils.js, wager-total-logic.js, misterioso-logic.js, deposit-kinds.js, strategy-logic.js, speed-logic.js, plan-store.js | plannerConfig/strategy | P8 |
| `js/routine-logic.js` ⚠️ | Rotinas, grupos (memberPeriods), dias proibidos | finance-logic.js, cycle-logic.js, deposit-kinds.js, cycle-history-logic.js | — (puro) | P10 |
| `js/routine-store.js` ⚠️ | Rotinas | firebase-init.js, state.js, routine-logic.js, finance-logic.js | routines R/W/D, routineLog (só cria), routineMarks R/W, groupArchive R/W/D | P10 |
| `js/calendar-logic.js` ⚠️ | Planejado × real, aderência | finance-logic.js, cycle-logic.js, deposit-kinds.js, routine-logic.js, plan-logic.js, stop-reasons.js | — (puro) | P10 |
| `js/ui-calendario-analytics.js` ⚠️ | Aba Calendário (analytics) — clica .graficos-tab-btn[data-tab=planejador] | state.js, utils.js, finance-logic.js, cycle-logic.js, calendar-logic.js, ui-planejador.js, plan-store.js, plan-logic.js, stop-reasons.js, plan-log-store.js, routine-store.js, routine-logic.js, deposit-kinds.js, game-catalog-logic.js | planLog, betPlans (🏁), plannerConfig/calendar+stopReasons, routineMarks | P8 |

## P10 — Gráficos C — Rotinas, 🏆 Grupos, Jogos

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/ui-rotinas.js` ⚠️ | Aba Rotinas (usa .sp-overlay de modals.css) | state.js, utils.js, finance-logic.js, wager-total-logic.js, routine-logic.js, routine-store.js, deposit-kinds.js, misterioso-logic.js, strategy-logic.js, newplatform-logic.js, plan-store.js | routines/routineLog/routineMarks/groupArchive via store | P8 |
| `js/ui-grupos.js` ⚠️ | Aba 🏆 Grupos (usa .rt-*) | state.js, utils.js, finance-logic.js, group-compare-logic.js, routine-logic.js, routine-store.js, plan-store.js, plan-log-store.js | groupArchive W/D via store | P8 |
| `js/group-compare-logic.js` | Ranking dos grupos | finance-logic.js, bonus-ledger-logic.js, calendar-logic.js | — (puro) | só este pacote |
| `js/ui-game-catalog.js` ⚠️ | Aba Jogos (.gc-*) | state.js, utils.js, game-catalog-logic.js, game-catalog-store.js, ui-traits.js, traits-logic.js | gameCatalog/gameConfig via store | P8 |

## P11 — Telegram
_Por último: fica desligado na versão da loja (TELEGRAM_FEATURE)._

| Arquivo | Papel | Importa | Banco | Usado também por |
|---|---|---|---|---|
| `js/ui-telegram.js` ⚠️ | Aba 📨 Telegram (usa .gr-*) — só com TELEGRAM_FEATURE | state.js, utils.js, telegram-logic.js, telegram-store.js | via store (3 onSnapshot + timer 60 s) | P8 |
| `js/telegram-logic.js` | Sinais, acerto dentro × fora | — | — (puro) | só este pacote |
| `js/telegram-store.js` | ÚNICO store com onSnapshot | firebase-init.js, state.js, telegram-logic.js | telegramSources R/W/D, telegramDays R/W(merge)/D, telegramFeed R(ao vivo)/D, telegramDialogs R(ao vivo) | só este pacote |
| `css/telegram.css` | .tg-* | — | — | — |
| `bot/bot.py` | Bot (Admin SDK — grava FORA do SAFE_MODE) | — | telegramDialogs/Feed/Days (servidor) | — |
| `bot/tg_parser.py` | Leitura dos horários | — | — | — |
| `bot/test_tg_parser.py` | Testes do parser | — | — | — |
| `bot/requirements.txt` | Dependências Python | — | — | — |
| `bot/env.example` | Modelo do .env | — | — | — |
| `bot/instalar.sh` | Instalação na VM | — | — | — |
| `bot/telegram-bot.service` | Serviço systemd | — | — | — |
| `bot/LEIA-ME.md` | Manual do bot | — | — | — |

## 4. Mapa do banco (users/{uid}/…)

| Coleção / documento | Quem GRAVA | Quem só lê |
|---|---|---|
| `platforms` | platforms-store (savePlatform/deletePlatformDoc), chamado por: ui-platform-manage, ui-vip-panel, view-financeiro, ui-finance-panel, ui-bonus-manager, ui-rollover-adjust, ui-cycle-history, ui-total-apostado | todas as views (state.platforms) |
| `meta/initialized` | platforms-store (sentinela) | auth-guard |
| `meta/cardCustomization` | card-customization-store | Calendário |
| `meta/obrigadoConfig` | vip-obrigado-store | bonus-context-store |
| `meta/preferences` | user-preferences-store | Edição, Financeiro |
| `meta/backupInfo` | backup-store | Perfil |
| `vipBonusTemplates` | vip-bonus-template-store | auth-guard |
| `misteriosoTemplates` | vip-misterioso-store | bonus-context-store |
| `vipHistory (só cria)` | vip-history-store | analytics-logic |
| `dailySnapshots (merge)` | daily-snapshot-store ← Financeiro e Gráficos | Análises, ui-cycle-history |
| `wagerRequirements` | wager-requirements-store | Planejador |
| `gameCatalog / gameConfig` | game-catalog-store ← Financeiro (aposta/lote) e Jogos | Calendário analytics |
| `platformTraits` | traits-store ← Edição e Jogos | — |
| `betPlans` | plan-store ← Planejador, Calendário analytics (🏁) | Rotinas, Grupos |
| `plannerConfig/{palette, settings, strategy, calendar, speed, newPlatforms, stopReasons}` | plan-store ← Planejador, Misterioso, ⚡, 🆕, Calendário analytics | Rotinas, Grupos |
| `planLog` | plan-log-store / plan-store ← Planejador, Calendário analytics | Grupos |
| `routines, routineLog (só cria), routineMarks` | routine-store ← Rotinas, Calendário analytics (marcas) | Planejador, Grupos |
| `groupArchive` | routine-store ← Rotinas (excluir 🏆), Grupos | — |
| `telegramSources, telegramDays (só o campo excluded), telegramFeed (excluir)` | telegram-store ← Telegram | — |
| `telegramDialogs, telegramFeed, telegramDays` | **bot (servidor, fora do SAFE_MODE)** | Telegram (ao vivo) |
| `/announcements/current (raiz)` | announcement-store ← Edição (só admin) | Início |

Backup (`backup-logic.js` COLLECTIONS) leva todas as coleções acima **menos** `telegramFeed`, `telegramDialogs` e `announcements`. Coleção nova = entrar em COLLECTIONS **e** em `firestore.rules`.

## 5. Pontos de atenção pra atualização visual

- **CSS é global**: o `index.html` carrega os 21 CSS em todas as views. Mexer numa classe compartilhada muda várias telas:
  - `modals.css` guarda TODOS os mini-contêineres (`.deposit-kind-*`, `.bc-*`, `.be-*`, `.bb-*`, `.bk-*`, `.sp-*`, `.tr-*`, `.cy-*`, `.np-*`).
  - `.deposit-kind-*` também veste `ui-vip-change` e `ui-vip-collect`; `.sp-overlay` também veste a pergunta de membros das Rotinas.
  - `graficos.css`: `.plan-*` (chips, inputs, KPIs) é usado por Planejador, Calendário, Rotinas, Grupos, Jogos, Telegram e Misterioso; `.rt-*` também pelos Grupos; `.gr-*` também pelo Telegram; `.cal-overlay`/`.pu-*` pelo Planejador e Calendário.
  - `.summary-card` (hero.css), `.card-shell`/`.section-heading` (layout.css) e `.bet-manage-btn`/`.btn-confirm` aparecem em quase tudo.
  - `.finance-empty` (finance.css) é usado pelo Perfil.
  - Ordem no `<head>`: `responsive.css` sempre por último.
- **`colorForLevel` (cycle-logic.js) lê as variáveis CSS `--level-N`** — renomear/remover essas variáveis muda as cores de Edição, Financeiro e Calendário analytics.
- **`ui-vip-panel.applyActiveTab` usa seletor GLOBAL `.vip-tab-btn`** — não reaproveitar essa classe em outra tela.
- **`ui-calendario-analytics` clica em `.graficos-tab-btn[data-tab="planejador"]`** e chama `requestPlanejadorFocus` — mudar as abas dos Gráficos exige ajustar os dois.
- **Gráficos monta as abas sob demanda** (Chart.js lazy): as abas com gráfico precisam do painel VISÍVEL na hora de montar (canvas em painel oculto nasce com tamanho 0).
- **Telegram**: 3 `onSnapshot` + timer de 60 s — todo redesenho precisa manter o desligamento no unmount.
- **`view-financeiro` grava ao abrir** (fechamento automático de semanas). Em teste não grava, mas a tela mostra como se tivesse gravado até recarregar.
- **Segurança**: nome de plataforma, texto do usuário e texto do Telegram entram SEMPRE por `textContent`. Ao trocar layout, não passar dado do usuário por `innerHTML`.
- **Celular primeiro**: botões ≥ 40–44 px de altura, sem arrastar-e-soltar (Edição usa ▲▼).

## 6. Registro de pacotes concluídos

| Pacote | Data | Arquivos alterados | Arquivos novos | Banco mudou? |
|---|---|---|---|---|
| P0 Núcleo | | | | |
| P1 Motor de negócio | | | | |
| P2 Início | | | | |
| P3 Calendário | | | | |
| P4 Edição | | | | |
| P5 VIP | | | | |
| P6 Financeiro | | | | |
| P7 Perfil | | | | |
| P8 Gráficos A | | | | |
| P9 Gráficos B | | | | |
| P10 Gráficos C | | | | |
| P11 Telegram | | | | |

