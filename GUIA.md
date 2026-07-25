# Guia do Projeto — Painel de Bônus

## 1. O que mudou

O projeto de 3 arquivos (`index.html`, `script.js`, `style.css`) virou uma estrutura
de pastas. **A lógica é 100% idêntica** — só mudou o lugar onde cada pedaço mora.
Validei isso comparando cada seletor CSS, cada função JS e cada ID de HTML do
original contra a versão nova: nada ficou pra trás.

```
painel-bonus/
├── index.html
├── css/
│   ├── variables.css     ← carregar 1º (os outros usam var(--x))
│   ├── base.css
│   ├── hero.css
│   ├── layout.css
│   ├── calendar.css
│   ├── panel.css
│   ├── vip.css
│   ├── modals.css
│   ├── footer.css
│   └── responsive.css    ← carregar por ÚLTIMO (ver seção 3)
└── js/
    ├── firebase-init.js
    ├── state.js
    ├── utils.js
    ├── cycle-logic.js
    ├── platforms-store.js
    ├── ui-hero.js
    ├── ui-vip-panel.js
    ├── ui-calendar.js
    ├── ui-background.js
    ├── ui-platform-panel.js
    ├── auth.js
    └── main.js            ← único <script> referenciado no HTML
```

## 2. Nomenclatura — a regra que segui

| Prefixo/padrão | Significado | Exemplo |
|---|---|---|
| `ui-*.js` | Só mexe no DOM (renderiza HTML, escuta cliques) | `ui-calendar.js` |
| sem prefixo, função pura | Não tem `document.` nenhum, só calcula/transforma dados | `cycle-logic.js`, `utils.js` |
| `*-store.js` | Fala com um banco de dados externo (Firestore) | `platforms-store.js` |
| `state.js` | Único arquivo com dado mutável compartilhado | — |
| `main.js` | Ponto de entrada; só importa e liga as peças, não define lógica nova | — |

Quando for criar um arquivo novo, pergunte "essa função mexe no DOM, calcula
algo, ou fala com o banco?" — a resposta já diz o prefixo certo.

## 3. Por que essa ordem de `<link>` no HTML

CSS resolve empate de especificidade pela **ordem de aparição**. Por isso:
- `variables.css` primeiro (define as `--variáveis` que todo o resto usa)
- `responsive.css` por último (os `@media` só "vencem" o CSS normal se vierem depois)

Se um dia um estilo de `panel.css` parecer não estar sendo aplicado, o primeiro
suspeito é a ordem dos `<link>` — confira o `index.html` antes de desconfiar do CSS em si.

## 4. Por que o JS não quebra: o "mapa de dependências"

```
state.js  utils.js  firebase-init.js        ← não dependem de nada (base)
    │         │             │
    ▼         │             ▼
cycle-logic.js│      platforms-store.js
    │         │             
    ▼         ▼             
ui-hero.js  ui-vip-panel.js
    │
    ▼
ui-calendar.js
    │
    ▼
ui-platform-panel.js  ← agrupa lista + históricos + modais (ver nota abaixo)
    │
    ▼
auth.js
    │
    ▼
main.js  ← só ele é citado no <script type="module"> do index.html
```

Uma seta só aponta pra baixo — **nenhum arquivo importa de volta quem o importou**.
Isso evita o erro mais comum de projeto dividido em módulos ("import circular").

**Nota sobre `ui-platform-panel.js`:** ele é o maior arquivo de propósito.
Lista de plataformas, modal de histórico, modal de reinício, modal de apostas e
modal de gerenciar plataformas ficam juntos porque **eles chamam uns aos outros o
tempo todo** (abre modal → salva → atualiza lista → fecha modal). Separar isso
teria criado import circular sem ganhar clareza nenhuma. Regra geral: agrupe por
"o que muda junto", não só por "o que parece do mesmo tipo".

**Sobre `state.js`:** antes você tinha `let platforms = []` solto no arquivo.
Isso não pode ser importado e reatribuído de outro arquivo (regra do JavaScript,
não escolha minha). Por isso agora existe `state.platforms`, `state.currentUid`,
`state.calendar` — um objeto único que qualquer módulo pode ler e alterar.
**Toda vez que for guardar algo que precisa ser visto por mais de um arquivo,
esse é o lugar.**

## 5. Como adicionar uma função nova (ex: "Relatório mensal")

1. Pergunte: isso é renderização, cálculo puro, ou acesso a dado? → escolha o
   arquivo certo pela tabela da seção 2, ou crie um novo seguindo o mesmo padrão
   (`ui-relatorio.js`, por exemplo).
2. Se a função precisa de `state.platforms`, importe `{ state }` de `./state.js`.
3. Se precisa salvar no Firestore, importe de `./platforms-store.js` — nunca
   chame `getFirestore`/`collection` direto fora desse arquivo.
4. Registre a inicialização em `main.js` (ou no `main-*.js` da página nova, ver seção 6).

## 6. Virando "site normal" — páginas novas

Crie `gestao.html` do mesmo jeito que `index.html`, com seus próprios `<link>`
de CSS (reaproveitando `variables.css`, `base.css` etc.) e um
`<script type="module" src="js/main-gestao.js">`.

Dentro de `main-gestao.js`, importe **os mesmos módulos de dados**
(`firebase-init.js`, `state.js`, `platforms-store.js`, `cycle-logic.js`) e crie
só a UI nova (`ui-relatorios.js`, por exemplo). Isso é o ganho real de ter
dividido o projeto: a camada de dados já existe pronta, você só escreve a tela.

**Duas coisas que quebram se esquecidas:**
- Cada página nova precisa do próprio bloco de `onAuthStateChanged` (adapte
  `auth.js` ou crie um `auth-gestao.js` chamando as mesmas funções de
  `firebase-init.js`) — sem isso a página não sabe se o usuário está logado.
- Nomes de arquivo e pasta são **case-sensitive** no GitHub Pages (Linux), mesmo
  que funcionem sem diferenciar maiúsculas no seu PC. Confira sempre o nome exato.

## 7. Checklist antes de subir pro GitHub

- [ ] Testar localmente (abrir `index.html` com um servidor local — módulos ES
      não funcionam com `file://` direto no navegador, precisa de `http://`.
      No VS Code, a extensão "Live Server" resolve isso com um clique)
- [ ] Confirmar que login com Google ainda funciona
- [ ] Confirmar que adicionar depósito, resetar ciclo e apostas ainda funcionam
- [ ] Só então: commit e push
