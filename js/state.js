// === ESTADO COMPARTILHADO ===
// Todo módulo que precisa ler ou alterar platforms/currentUid/calendar
// importa este objeto ÚNICO e mexe em suas propriedades (state.platforms = ...).
//
// Por quê um objeto e não "export let platforms"?
// Em ES Modules, quem importa uma variável com `import { x }` NÃO pode
// reatribuir `x` diretamente (só quem a declarou pode). Como em vários
// pontos do app fazemos `platforms = novaLista`, precisamos mudar uma
// PROPRIEDADE de um objeto (isso sempre é permitido), não a variável em si.

export const state = {
  platforms: [],
  currentUid: null,
  calendar: null // instância do FullCalendar, setada em ui-calendar.js
};
