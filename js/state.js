// === ESTADO COMPARTILHADO ===
// Todo módulo que precisa ler ou alterar platforms/currentUid/calendar
// importa este objeto ÚNICO e mexe em suas propriedades (state.platforms = ...).
//
// Por quê um objeto e não "export let platforms"?
// Em ES Modules, quem importa uma variável com `import { x }` NÃO pode
// reatribuir `x` diretamente (só quem a declarou pode). Como em vários
// pontos do app fazemos `platforms = novaLista`, precisamos mudar uma
// PROPRIEDADE de um objeto (isso sempre é permitido), não a variável em si.
//
// (Sub-entrega A) vipTemplateIssues: ids de template de Bônus VIP citados
// por alguma plataforma (levelHistory) mas que NÃO foram carregados no
// login — preenchido por auth-guard.js, lido pela aba VIP → Templates
// (ui-vip-panel.js). Substitui o aviso vermelho que aparecia a cada login.
//   missing: o documento não existe no banco (pode ser restaurado)
//   invalid: o documento existe mas está com dados inválidos (NUNCA é
//            sobrescrito automaticamente)

export const state = {
  platforms: [],
  currentUid: null,
  vipBonusTemplates: [],
  vipTemplateIssues: { missing: [], invalid: [] },
  calendar: null // instância do FullCalendar, setada em ui-calendar.js
};
