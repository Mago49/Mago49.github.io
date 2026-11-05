# Fechamento — Sub-entrega 48 (páginas abrindo na hora: cache em memória + conferência em segundo plano)

Data: 05/11/2026. Subida direto na raiz E em teste/ (Pedro pediu a correção adequada pro app).

## Problema
Toda troca de página esperava leituras do Firebase ANTES de desenhar (preferências; Obrigado + templates do Misterioso). No 4G, ~2 s de tela em branco a cada entrada. Pré-existente (não veio da Sub 46).

## O que faz
- bonus-context-store: guarda o contexto de bônus confirmado (por uid). getCachedBonusContext / refreshBonusContext ({context, changed}) / clearBonusContextCache.
- user-preferences-store: arePreferencesLoaded / refreshPreferences — falha na conferência NÃO troca o cache (antes viraria o padrão e um Reordenar gravaria a ordem errada).
- Financeiro, Gráficos, Perfil, Edição: com dados já lidos na sessão, desenham na hora e conferem o Firebase em segundo plano; se mudou, redesenham sozinhos.
- Segurança de gravação: fechamento automático de semanas (Financeiro) e snapshot diário (Gráficos) só rodam DEPOIS da conferência, com o valor confirmado. Falha na conferência: segue com o valor já confirmado nesta sessão e não grava.
- VIP (onde Obrigado/templates são editados): ao sair, o cache é limpo — a próxima tela lê do Firebase.
- 1ª abertura da sessão (ou outro usuário): leitura estrita de sempre.

## Arquivos alterados (raiz e teste/, idênticos)
js/bonus-context-store.js, js/user-preferences-store.js, js/view-financeiro.js, js/view-graficos.js, js/view-perfil.js, js/view-edicao.js, js/view-vip.js.
Imports: só nomes novos dos mesmos módulos (MANIFESTO sem mudança). teste/js/dev-flags.js intocado.

## Banco
Nada novo. Só leitura (as gravações existentes passaram a esperar a conferência).

## Testes
- Cache/conferência com módulos simulados: guarda por uid; conferência igual = sem redesenho; mudou = redesenha; falha mantém o já confirmado; limpar zera.
- Preferências: falha na conferência mantém a ordem manual.
- node --check nos 7 JS (raiz e teste/).

## Pendências
- Pedro confere no celular (4G): 1ª página da sessão ainda espera a leitura; as trocas seguintes devem abrir na hora.
- Calendário (personalização dos cards + FullCalendar) não entrou — candidato a uma próxima.
- Mapa Técnico: linhas de bonus-context-store, user-preferences-store e das views Financeiro/Gráficos/Perfil/Edição/VIP.
