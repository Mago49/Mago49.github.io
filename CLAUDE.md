# Regras do Code — Painel do Tigrinho
- Leia docs/MANIFESTO.md antes de qualquer tarefa.
- Trabalhe SÓ dentro de teste/ e docs/. A raiz é produção: nunca alterar
  sem OK explícito do Pedro.
- Nunca copiar teste/js/dev-flags.js pra raiz (SAFE_MODE = true lá).
- P0 e P1 do MANIFESTO estão TRAVADOS: só leitura. Se a tarefa precisar
  mudar um deles, regra de negócio, cálculo financeiro, Firestore ou
  firestore.rules, PARE e explique o motivo antes de alterar.
- Trabalhe só nos arquivos do pacote da ficha. Arquivo marcado ⚠️ no
  MANIFESTO é compartilhado: diga quais telas ele afeta.
- Fases: 1) discussão + lista de arquivos esperados; 2) onde alterar e
  por quê; 3) alteração, só depois do OK. Feche contra a lista no fim.
- Gravar no banco só via writeBatch/deleteDoc de firebase-init.js.
  Dado do usuário só por textContent. Celular primeiro (botões ≥ 44px).
- node --check em todo JS alterado. Entregar sempre por pull request.
- Ao fechar o pacote: criar docs/fichas/Px-fechamento.md (arquivos
  alterados, novos, banco mudou?, pendências) e atualizar o MANIFESTO
  se mudou import ou arquivo.
- Português, direto ao ponto.
