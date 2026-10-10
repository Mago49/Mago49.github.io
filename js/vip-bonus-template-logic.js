// === LÓGICA PURA DOS TEMPLATES DO BÔNUS VIP ===
// Função pura: sem DOM, sem Firestore, sem imports. Mesmo espírito de
// misterioso-logic.js/codigo-logic.js.
//
// MODELO: um template é UMA tabela de níveis (VIP 0 a 5), cada nível com
// Bônus Diário (BD), Semanal (BS) e Mensal (BM). NÃO existe separação
// "com"/"sem" dentro do template — o grupo continua sendo da plataforma
// (platform.group). Plataforma sem template usa DEFAULT_VIP_LEVELS.
//
// VERSÕES (regra de ouro: o passado nunca muda sozinho):
//   template = { id, name, versions: [{ from:'AAAA-MM-DD', levels }, ...] }
// Cada versão vale a partir das 00:00 do dia `from`, até a próxima. Editar
// os valores de um template NUNCA sobrescreve uma versão antiga: cria uma
// versão nova a partir de hoje (ou, se a última versão já é de hoje,
// troca só ela). Mesmo princípio de levelHistory (cycle-logic.js).
// (Sub-entrega 12) A versão nova também pode começar AMANHÃ, quando o bônus
// VIP de hoje já foi recebido — ver addVipTemplateVersion.
//
// ATRIBUIÇÃO template<->plataforma: não mora aqui nem no documento da
// plataforma como campo solto — mora em platform.levelHistory[].vipTemplateId
// (cycle-logic.js), com vigência por dia, igual ao nível/grupo.

export const VIP_BONUS_LEVELS = [0, 1, 2, 3, 4, 5];

// Data da primeira versão de todo template novo: "desde sempre". Quem
// decide desde quando um template vale pra uma plataforma é a vigência
// dela (levelHistory), não esta data.
export const VIP_TEMPLATE_FIRST_FROM = '1970-01-01';

export const VIP_TEMPLATE_NAME_MAX = 40;

const BONUS_FIELDS = ['daily', 'weekly', 'monthly'];
const FIELD_LABEL = { daily: 'Bônus Diário', weekly: 'Bônus Semanal', monthly: 'Bônus Mensal' };
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function deepFreezeLevels(levels) {
  Object.keys(levels).forEach(k => Object.freeze(levels[k]));
  return Object.freeze(levels);
}

// Tabela padrão do sistema — fonte ÚNICA (cycle-logic.js deriva
// vipBonusTable daqui). Congelada: nenhum código pode alterá-la por engano.
export const DEFAULT_VIP_LEVELS = deepFreezeLevels({
  0: { daily: 0, weekly: 0, monthly: 0 },
  1: { daily: 0, weekly: 0, monthly: 1 },
  2: { daily: 0.5, weekly: 1, monthly: 1 },
  3: { daily: 0.6, weekly: 2, monthly: 3 },
  4: { daily: 0.8, weekly: 3, monthly: 5 },
  5: { daily: 1, weekly: 5, monthly: 8 }
});

function toDayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ---------- VALIDAÇÃO (estrita, sobre o dado BRUTO — nunca "conserta") ----------

// Exige os 6 níveis, cada um com os 3 valores como NÚMERO (typeof number),
// finitos e >= 0. Nada é preenchido com padrão em silêncio.
export function validateVipLevels(levels) {
  if (!levels || typeof levels !== 'object') {
    return { ok: false, error: 'Tabela de níveis ausente.' };
  }
  for (const level of VIP_BONUS_LEVELS) {
    const entry = levels[level];
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: `Falta o VIP ${level}.` };
    }
    for (const field of BONUS_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `VIP ${level}: ${FIELD_LABEL[field]} inválido.` };
      }
      if (value < 0) {
        return { ok: false, error: `VIP ${level}: ${FIELD_LABEL[field]} não pode ser negativo.` };
      }
    }
  }
  return { ok: true };
}

// Cópia limpa (só os 6 níveis e 3 campos). Chamar SÓ depois de validar.
export function cleanVipLevels(levels) {
  const out = {};
  for (const level of VIP_BONUS_LEVELS) {
    out[level] = {
      daily: levels[level].daily,
      weekly: levels[level].weekly,
      monthly: levels[level].monthly
    };
  }
  return out;
}

export function levelsEqual(a, b) {
  for (const level of VIP_BONUS_LEVELS) {
    for (const field of BONUS_FIELDS) {
      if (a?.[level]?.[field] !== b?.[level]?.[field]) return false;
    }
  }
  return true;
}

export function validateVipTemplate(template) {
  if (!template || typeof template !== 'object') {
    return { ok: false, error: 'Template inválido.' };
  }
  const name = typeof template.name === 'string' ? template.name.trim() : '';
  if (!name) return { ok: false, error: 'Dê um nome ao template.' };
  if (name.length > VIP_TEMPLATE_NAME_MAX) {
    return { ok: false, error: `Nome muito longo (máx. ${VIP_TEMPLATE_NAME_MAX} caracteres).` };
  }
  if (!Array.isArray(template.versions) || template.versions.length === 0) {
    return { ok: false, error: 'Template sem nenhuma versão de valores.' };
  }
  let previousFrom = null;
  for (const version of template.versions) {
    if (!version || typeof version.from !== 'string' || !DATE_KEY_RE.test(version.from)) {
      return { ok: false, error: 'Versão com data inválida.' };
    }
    if (previousFrom !== null && !(version.from > previousFrom)) {
      return { ok: false, error: 'Versões fora de ordem ou com data repetida.' };
    }
    previousFrom = version.from;
    const check = validateVipLevels(version.levels);
    if (!check.ok) return check;
  }
  return { ok: true };
}

// ---------- CRIAÇÃO / EDIÇÃO (sempre devolvem um template NOVO, nunca mutam) ----------

export function createVipTemplate(name, levels) {
  const check = validateVipLevels(levels);
  if (!check.ok) return check;
  const template = {
    name: String(name ?? '').trim(),
    versions: [{ from: VIP_TEMPLATE_FIRST_FROM, levels: cleanVipLevels(levels) }]
  };
  const full = validateVipTemplate(template);
  if (!full.ok) return full;
  return { ok: true, template };
}

// Nova versão de valores a partir do dia de refDate (HOJE, ou AMANHÃ quando
// o bônus de hoje já foi recebido — Sub-entrega 12, ver getVipChangeDate em
// cycle-logic.js). Nunca altera versão do passado:
//  - valores iguais ao que já vale no dia (e depois dele) -> nada muda
//    (changed:false);
//  - já existe versão começando nesse dia -> troca só os valores dela;
//  - não existe -> insere versão nova com from = o dia (em ordem de data);
//  - versão já agendada DEPOIS do dia recebe os mesmos valores (nunca é
//    apagada: as Regras do Firestore não deixam a lista de versões diminuir).
export function addVipTemplateVersion(template, levels, refDate = new Date()) {
  const check = validateVipLevels(levels);
  if (!check.ok) return check;
  if (!template || !Array.isArray(template.versions) || template.versions.length === 0) {
    return { ok: false, error: 'Template inválido.' };
  }

  const dayKey = toDayKey(refDate);
  const clean = cleanVipLevels(levels);
  const versions = template.versions.map(v => ({ from: v.from, levels: cleanVipLevels(v.levels) }));
  const atDay = getVipTemplateVersionAt({ versions }, dayKey);
  const later = versions.filter(v => v.from > dayKey);

  if (atDay && levelsEqual(atDay.levels, clean) && later.every(v => levelsEqual(v.levels, clean))) {
    return { ok: true, changed: false, template: { ...template, versions } };
  }

  const idx = versions.findIndex(v => v.from === dayKey);
  if (idx !== -1) {
    versions[idx].levels = clean;
  } else {
    let pos = versions.findIndex(v => v.from > dayKey);
    if (pos === -1) pos = versions.length;
    versions.splice(pos, 0, { from: dayKey, levels: clean });
  }
  versions.forEach(v => { if (v.from > dayKey) v.levels = cleanVipLevels(clean); });
  return { ok: true, changed: true, template: { ...template, versions } };
}

// Trava de encolhimento: o template novo precisa conter TODAS as versões
// antigas, e só a versão de HOJE (ou uma já agendada pra depois de hoje —
// Sub-entrega 12) pode ter valores diferentes. Impede que um bug ou memória
// velha reescreva o passado.
export function isVipTemplateUpdateSafe(oldTemplate, newTemplate, refDate = new Date()) {
  const todayKey = toDayKey(refDate);
  const newVersions = Array.isArray(newTemplate?.versions) ? newTemplate.versions : [];
  for (const oldVersion of (oldTemplate?.versions || [])) {
    const match = newVersions.find(v => v.from === oldVersion.from);
    if (!match) {
      return { ok: false, error: `A versão de ${oldVersion.from} sumiria do template.` };
    }
    if (!levelsEqual(oldVersion.levels, match.levels) && oldVersion.from < todayKey) {
      return { ok: false, error: `A versão de ${oldVersion.from} é do passado e não pode ser alterada.` };
    }
  }
  return { ok: true };
}

// ---------- LEITURA ----------

export function findVipTemplateById(templates, id) {
  if (!id || !Array.isArray(templates)) return null;
  return templates.find(t => t && t.id === id) || null;
}

// Versão vigente numa data: a última com from <= dayKey. Se o dia é
// anterior a todas (não deveria acontecer, a 1ª versão é de 1970), usa a
// primeira — nunca devolve undefined pra um template com versões.
export function getVipTemplateVersionAt(template, dayKey) {
  const versions = template && Array.isArray(template.versions) ? template.versions : [];
  if (versions.length === 0) return null;
  let found = versions[0];
  for (const version of versions) {
    if (version.from <= dayKey) found = version; else break;
  }
  return found;
}

// { daily, weekly, monthly } do nível naquele dia, ou null se o template
// não cobre o nível (quem chama cai na tabela padrão).
export function getVipTemplateLevelValues(template, level, dayKey) {
  if (level === null || level === undefined || level === '') return null;
  const lv = Number(level);
  if (!Number.isInteger(lv) || !VIP_BONUS_LEVELS.includes(lv)) return null;
  const version = getVipTemplateVersionAt(template, dayKey);
  const entry = version && version.levels ? version.levels[lv] : null;
  if (!entry) return null;
  return {
    daily: Number(entry.daily) || 0,
    weekly: Number(entry.weekly) || 0,
    monthly: Number(entry.monthly) || 0
  };
}

// ---------- USO POR PLATAFORMAS ----------

// Todos os ids de template citados em QUALQUER entrada do levelHistory de
// QUALQUER plataforma (passado incluído).
export function collectReferencedTemplateIds(platforms) {
  const ids = new Set();
  (platforms || []).forEach(p => {
    (Array.isArray(p?.levelHistory) ? p.levelHistory : []).forEach(entry => {
      if (entry && typeof entry.vipTemplateId === 'string' && entry.vipTemplateId) {
        ids.add(entry.vipTemplateId);
      }
    });
  });
  return ids;
}

export function isVipTemplateInUse(platforms, templateId) {
  return collectReferencedTemplateIds(platforms).has(templateId);
}
