  document.addEventListener('DOMContentLoaded', () => {
    const vipBonusTable = {
  com: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  },
  sem: {
    0: { daily: 0, weekly: 0, monthly: 0 },
    1: { daily: 0, weekly: 0, monthly: 1 },
    2: { daily: 0.5, weekly: 1, monthly: 1 },
    3: { daily: 0.6, weekly: 2, monthly: 3 },
    4: { daily: 0.8, weekly: 3, monthly: 5 },
    5: { daily: 1, weekly: 5, monthly: 8 }
  }
};

const vipPlatforms = [
  { code: 'FXX', level: 2, group: 'com' },
  { code: '551X', level: 3, group: 'com' },
  { code: '838X', level: 3, group: 'com' },
  { code: 'PP11', level: 4, group: 'com' },
  { code: '1UUU', level: 3, group: 'com' },
  { code: '11TT', level: 3, group: 'com' },
  { code: 'DDUU', level: 4, group: 'com' },
  { code: '45T', level: 3, group: 'com' },
  { code: '7GGG', level: 3, group: 'com' },
  { code: '66GG', level: 3, group: 'com' },
  { code: '44MM', level: 3, group: 'com' },
  { code: 'NNZZ', level: 3, group: 'com' },
  { code: '899V', level: 3, group: 'com' },
  { code: '83H', level: 3, group: 'com' },
  { code: '5TTT', level: 3, group: 'com' },
  { code: '84D', level: 3, group: 'com' },
  { code: '552X', level: 3, group: 'com' },

  { code: '35C', level: 2, group: 'sem' },
  { code: '63V', level: 3, group: 'sem' },
  { code: '68D', level: 2, group: 'sem' },
  { code: '61T', level: 3, group: 'sem' },
  { code: '72B', level: 3, group: 'sem' },
  { code: '36Q', level: 4, group: 'sem' },
  { code: '53D', level: 2, group: 'sem' },
  { code: '93K', level: 3, group: 'sem' },
  { code: '93D', level: 3, group: 'sem' },
  { code: 'A73', level: 3, group: 'sem' },
  { code: 'EE44', level: 3, group: 'sem' },
  { code: '7JJJ', level: 3, group: 'sem' },
  { code: '877X', level: 3, group: 'sem' },
  { code: '79C', level: 3, group: 'sem' },
  { code: '988K', level: 3, group: 'sem' },
  { code: 'HHH5', level: 0, group: 'sem' }
];

// Modal genérico de alerta/confirmação (substitui alert()/confirm() nativos do navegador)
function showAppModal(message, showCancel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('appModal');
    const messageEl = document.getElementById('appModalMessage');
    const confirmBtn = document.getElementById('appModalConfirmBtn');
    const cancelBtn = document.getElementById('appModalCancelBtn');

    messageEl.textContent = message;
    cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    modal.style.display = 'flex';

    function cleanup(result) {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function showAppAlert(message) {
  return showAppModal(message, false);
}

function showAppConfirm(message) {
  return showAppModal(message, true);
}

function getVipBonus(platform) {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);

  const cfg = vipBonusTable[platform.group]?.[platform.level] || {
    daily: 0,
    weekly: 0,
    monthly: 0
  };

  const daily = Number(cfg.daily) || 0;
  const weekly = Number(cfg.weekly) || 0;
  const monthly = Number(cfg.monthly) || 0;

  const cycleStart = getCycleStart(platform, hoje);
  const start = new Date(cycleStart);
  start.setHours(0, 0, 0, 0);

  // semanal e mensal seguem a mesma lógica para "com" e "sem"
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let segundasNoMes = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(ano, mes, d).getDay() === 1) {
      segundasNoMes++;
    }
  }

  const weeklyTotal = weekly * segundasNoMes;
  const monthlyTotal = monthly;

  let dailyTotal = daily * diasNoMes;

  // apenas o diário das plataformas "com" depende do botão "Apostei hoje"
  if (platform.group === 'com') {
    const uniqueBetDays = new Set(
      (platform.betDays || [])
        .filter(dateStr => {
          const d = parseLocalDateOnly(dateStr);
          d.setHours(0, 0, 0, 0);
          return d >= start && d <= hoje;
        })
        .map(dateStr => dateStr.slice(0, 10))
    );

    dailyTotal = daily * uniqueBetDays.size;
  }

  return {
    daily: dailyTotal,
    weekly: weeklyTotal,
    monthly: monthlyTotal,
    total: dailyTotal + weeklyTotal + monthlyTotal
  };
}

  function renderVipPanel() {
  const totalsEl = document.getElementById('vipTotals');
  const summaryEl = document.getElementById('vipSummary');

  if (!totalsEl || !summaryEl) return;

  const totals = vipPlatforms.reduce((acc, platform) => {
  const merged = getMergedVipPlatform(platform);
    const bonus = getVipBonus(merged);
    acc.daily += bonus.daily;
    acc.weekly += bonus.weekly;
    acc.monthly += bonus.monthly;
    acc.total += bonus.total;
    return acc;
  }, { daily: 0, weekly: 0, monthly: 0, total: 0 });

  totalsEl.innerHTML = `
    <div class="vip-total-box">
      <span class="vip-total-label">Diário</span>
      <span class="vip-total-value">${formatCurrency(totals.daily)}</span>
    </div>
    <div class="vip-total-box">
      <span class="vip-total-label">Semanal</span>
      <span class="vip-total-value">${formatCurrency(totals.weekly)}</span>
    </div>
    <div class="vip-total-box">
      <span class="vip-total-label">Mensal</span>
      <span class="vip-total-value">${formatCurrency(totals.monthly)}</span>
    </div>
    <div class="vip-total-box">
      <span class="vip-total-label">Total</span>
      <span class="vip-total-value">${formatCurrency(totals.total)}</span>
    </div>
  `;

  summaryEl.innerHTML = vipPlatforms.map((platform) => {
    const merged = getMergedVipPlatform(platform);
    const bonus = getVipBonus(merged);
    const groupLabel = platform.group === 'com' ? 'Com aposta' : 'Sem aposta';
    const groupClass = platform.group === 'com' ? 'group-com' : 'group-sem';

    return `
      <article class="vip-item">
        <div class="vip-item-header">
          <div class="vip-code">${platform.code}</div>
          <div class="vip-badges">
            <span class="vip-badge level">VIP ${platform.level}</span>
            <span class="vip-badge ${groupClass}">${groupLabel}</span>
          </div>
        </div>

        <div class="vip-breakdown">
          <div class="vip-box">
            <span class="vip-box-title">Diário</span>
            <span class="vip-box-value">${formatCurrency(bonus.daily)}</span>
          </div>
          <div class="vip-box">
            <span class="vip-box-title">Semanal</span>
            <span class="vip-box-value">${formatCurrency(bonus.weekly)}</span>
          </div>
          <div class="vip-box">
            <span class="vip-box-title">Mensal</span>
            <span class="vip-box-value">${formatCurrency(bonus.monthly)}</span>
          </div>
          <div class="vip-box">
            <span class="vip-box-title">Total</span>
            <span class="vip-box-value">${formatCurrency(bonus.total)}</span>
          </div>
        </div>

        <div class="vip-total-line">
          Soma do bônus: ${formatCurrency(bonus.total)}
        </div>
      </article>
    `;
  }).join('');
}
    const svg = document.querySelector('svg.background-svg');
    const circles = Array.from(svg.querySelectorAll('circle'));
    const viewbox = svg.viewBox.baseVal;
    const initialRadii = [280, 280, 280, 280];

    const data = circles.map((c, i) => {
      const initR = initialRadii[i] * (0.28 + Math.random() * 0.12);
      return {
        el: c,
        x: (Math.random() * viewbox.width) | 0,
        y: (Math.random() * viewbox.height) | 0,
        r: initR,
        vx: (Math.random() * 0.6 + 0.1) * (Math.random() < 0.5 ? -1 : 1),
        vy: (Math.random() * 0.6 + 0.1) * (Math.random() < 0.5 ? -1 : 1),
        vr: (Math.random() * 0.04 + 0.01) * (Math.random() < 0.5 ? -1 : 1),
        rmin: initR * 0.4,
        rmax: initR * 1.3
      };
    });

    function animate() {
      data.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        d.r += d.vr;
        if (d.x < -200 || d.x > viewbox.width + 200) d.vx *= -1;
        if (d.y < -200 || d.y > viewbox.height + 200) d.vy *= -1;
        if (d.r < d.rmin || d.r > d.rmax) d.vr *= -1;
        d.el.setAttribute('cx', d.x);
        d.el.setAttribute('cy', d.y);
        d.el.setAttribute('r', Math.max(10, d.r));
      });
      requestAnimationFrame(animate);
    }
    animate();

    const PLATFORM_NAMES = [
      'A73', 'DDUU', 'EE44', 'FXX', 'HHH5','NNZZ', 'PP11', '1UUU', '11TT', '35C',
      '36Q', '44MM', '45T', '5TTT', '53D', '552X', '551X', '61T', '63V', '66GG',
      '68D', '7GGG', '7JJJ', '72B', '79C', '83H', '838X', '84D', '877X', '899V',
      '93D', '93K', '988K'
    ];

    const DEFAULT_PLATFORMS = Array.from({length:33}, (_,i) => ({
      id: 'p' + (i+1),
      name: PLATFORM_NAMES[i],
      lastResetDate: null,
      deposits: [],
      betDays: [],
      cycleEnded: false
    }));
    const PLAT_STORAGE_KEY = 'depositPlatforms_v3';

    function loadPlatforms(){
      try {
        const raw = localStorage.getItem(PLAT_STORAGE_KEY);
        if (!raw) return DEFAULT_PLATFORMS.slice();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return DEFAULT_PLATFORMS.slice();
        return parsed.map((p, i) => ({
          id: p.id || ('p' + (i+1)),
          name: p.name || PLATFORM_NAMES[i],
          lastResetDate: p.lastResetDate || null,
          deposits: Array.isArray(p.deposits) ? p.deposits : [],
          betDays: Array.isArray(p.betDays) ? p.betDays : [],
          cycleEnded: p.cycleEnded === true
        }));
      } catch (err) {
        console.error('Erro ao ler plataformas', err);
        return DEFAULT_PLATFORMS.slice();
      }
    }

    function savePlatforms(list){
      localStorage.setItem(PLAT_STORAGE_KEY, JSON.stringify(list));
    }

    function formatCurrency(value){
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(Number(value) || 0);
    }

    function toLocalDateStr(date = new Date()){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

    function parseLocalDateOnly(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

    function getCycleStart(platform, refDate = new Date()){
      if (platform.lastResetDate) {
        const resetDate = new Date(platform.lastResetDate);
        resetDate.setHours(0, 0, 0, 0);
        return resetDate;
      }
      return new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
    }

    function getCurrentCycleDay(platform, refDate = new Date()){
  const cycleStart = getCycleStart(platform, refDate);
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);

  const daysSinceCycleStart = Math.floor((today - cycleStart) / (1000 * 60 * 60 * 24));

  if (daysSinceCycleStart < 0) return 0;
  return daysSinceCycleStart + 1;
}
 // Dias do ciclo em que o bônus é emitido (2°, 3°, 7°, 15°, 30°)
// cycleStart = Dia 1, por isso subtraímos 1 pra achar o deslocamento em dias.
    function computeEmissionDates(platform, refDate = new Date()){
  const cycleStart = getCycleStart(platform, refDate);
  const EMISSION_DAYS = [2, 3, 7, 15, 30];
  return EMISSION_DAYS.map(day => {
    const d = new Date(cycleStart);
    d.setDate(d.getDate() + (day - 1));
    d.setHours(0,0,0,0);
    return d;
  });
}

    function sumDepositsUpTo(platform, toDate){
      const cycleStart = getCycleStart(platform, toDate);
      return (platform.deposits || [])
        .filter(d => {
          const depositDate = new Date(d.date);
          return depositDate >= cycleStart && depositDate <= toDate;
        })
        .reduce((s, d) => s + (Number(d.value) || 0), 0);
    }

    function getTotalDepositsSinceCycle(platform){
      return sumDepositsUpTo(platform, new Date());
    }

    function colorForLevel(valueOrLevel){
      const root = getComputedStyle(document.documentElement);
      const lvlVars = [
        root.getPropertyValue('--level-0').trim(),
        root.getPropertyValue('--level-1').trim(),
        root.getPropertyValue('--level-2').trim(),
        root.getPropertyValue('--level-3').trim(),
        root.getPropertyValue('--level-4').trim()
      ];

      const v = Number(valueOrLevel);
      if (Number.isInteger(v) && v >= 0 && v <= 4) {
        return lvlVars[v];
      }

      const amount = isNaN(v) ? 0 : v;
      if (amount >= 300) return lvlVars[4];
      if (amount >= 150) return lvlVars[3];
      if (amount >= 70)  return lvlVars[2];
      if (amount >= 30)  return lvlVars[1];
      return lvlVars[0];
    }

    function getEventsForDate(targetDate){
      const target = new Date(targetDate);
      target.setHours(0,0,0,0);
      const targetTime = target.getTime();
      return platforms.filter(platform => !platform.cycleEnded && computeEmissionDates(platform).some(date => date.getTime() === targetTime));
    }

    function updateHeroSummary(){
      const totalPlatforms = platforms.length;
      const totalDeposits = platforms.reduce((sum, platform) => sum + getTotalDepositsSinceCycle(platform), 0);
      const bonusToday = getEventsForDate(new Date()).length;
      const activeCycles = platforms.filter(platform => !platform.cycleEnded && platform.lastResetDate && getCurrentCycleDay(platform) > 0).length;
      const topPlatform = [...platforms]
        .filter(platform => !platform.cycleEnded)
        .sort((a, b) => getTotalDepositsSinceCycle(b) - getTotalDepositsSinceCycle(a))[0];

      document.getElementById('heroPlatformCount').textContent = String(totalPlatforms);
      document.getElementById('heroTotalDeposits').textContent = formatCurrency(totalDeposits);
      document.getElementById('heroBonusToday').textContent = String(bonusToday);

      const highlightEl = document.getElementById('heroNextHighlight');
      const highlightNoteEl = document.getElementById('heroNextHighlightNote');

      if (topPlatform && getTotalDepositsSinceCycle(topPlatform) > 0) {
        highlightEl.textContent = topPlatform.name;
        highlightNoteEl.textContent = `${formatCurrency(getTotalDepositsSinceCycle(topPlatform))} no ciclo atual • ${activeCycles} plataformas ativas.`;
      } else {
        highlightEl.textContent = activeCycles > 0 ? 'Em dia' : 'Sem depósitos';
        highlightNoteEl.textContent = activeCycles > 0
          ? `${activeCycles} plataformas com ciclo em andamento.`
          : 'Adicione depósitos para começar a acompanhar os níveis.';
      }
    }

    function renderPlatformList(filter = ''){
      const listEl = document.getElementById('platformList');
      const countEl = document.getElementById('platformCount');
      listEl.innerHTML = '';
      const q = filter.trim().toLowerCase();
      const items = platforms.filter(p => p.name.toLowerCase().includes(q));

      items.forEach(p => {
        const li = document.createElement('li');
        li.className = 'platform-item' + (p.cycleEnded ? ' ended' : '');
        li.dataset.id = p.id;

        const total = getTotalDepositsSinceCycle(p);
        const bgColor = colorForLevel(total);
        const cycleDay = getCurrentCycleDay(p);

        const header = document.createElement('div');
        header.className = 'platform-item-header';

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = p.name;

        const cycleInfo = document.createElement('div');
        cycleInfo.className = 'cycle-day';
        if (p.cycleEnded) {
          cycleInfo.classList.add('cycle-ended');
          cycleInfo.textContent = '⏸ Encerrado';
        } else if (cycleDay === 0) {
          cycleInfo.classList.add('no-bonus');
          cycleInfo.textContent = 'Dia 0';
        } else {
          cycleInfo.textContent = `Dia ${cycleDay}`;
        }

        header.appendChild(name);
        header.appendChild(cycleInfo);
        li.appendChild(header);

        if (p.cycleEnded) {
          const alertBanner = document.createElement('div');
          alertBanner.className = 'ended-badge';
          alertBanner.textContent = '⚠️ Ciclo encerrado — aguardando reinício';
          li.appendChild(alertBanner);
        }

        const meta = document.createElement('div');
        meta.className = 'platform-meta';

        const resetInfo = document.createElement('div');
        resetInfo.className = 'reset-date';
        if (p.lastResetDate) {
          const resetDateObj = new Date(p.lastResetDate);
          const dia = String(resetDateObj.getDate()).padStart(2, '0');
          const mes = String(resetDateObj.getMonth() + 1).padStart(2, '0');
          resetInfo.textContent = `Ciclo iniciado: ${dia}/${mes}`;
        } else {
          resetInfo.textContent = 'Ciclo não iniciado';
        }

        const totalBadge = document.createElement('span');
        totalBadge.className = 'platform-total-badge';
        totalBadge.style.background = bgColor;
        totalBadge.textContent = formatCurrency(total);

        meta.appendChild(resetInfo);
        meta.appendChild(totalBadge);
        li.appendChild(meta);

        const form = document.createElement('div');
        form.className = 'platform-deposit-form';

        const input = document.createElement('input');
        input.type = 'number';
        input.placeholder = p.cycleEnded ? 'Ciclo encerrado — aguardando reinício' : 'Valor do depósito';
        input.min = '0';
        input.step = '0.01';
        input.value = '';
        input.disabled = p.cycleEnded;

        form.appendChild(input);
        li.appendChild(form);

        const actionButtons = document.createElement('div');
        actionButtons.className = 'platform-actions-buttons';

        const historyBtn = document.createElement('button');
        historyBtn.textContent = 'Histórico';
        historyBtn.style.background = '#2563eb';
        historyBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          showHistoryModal(p);
        });

        const btn = document.createElement('button');
        btn.textContent = 'Adicionar';
        btn.disabled = p.cycleEnded;
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (p.cycleEnded) return;
          const value = parseFloat(input.value);
          if (isNaN(value) || value <= 0) {
            await showAppAlert('Digite um valor válido');
            return;
          }
          p.deposits.push({
            date: new Date().toISOString(),
            value: value
          });
          input.value = '';
          savePlatforms(platforms);
          updateCalendarEvents();
          renderPlatformList(q);
          updateHeroSummary();
        });

        const endBtn = document.createElement('button');
        endBtn.className = 'platform-end-btn' + (p.cycleEnded ? ' already-ended' : '');
        endBtn.textContent = p.cycleEnded ? '⏸ Encerrado' : '🏁 Fim';
        endBtn.disabled = p.cycleEnded;
        endBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await showAppConfirm(`Encerrar o ciclo de ${p.name}? Os depósitos serão zerados e o calendário ficará pausado até você apertar "Reinício".`);
          if (!ok) return;
          p.deposits = [];
          p.cycleEnded = true;
          savePlatforms(platforms);
          updateCalendarEvents();
          renderPlatformList(q);
          updateHeroSumm