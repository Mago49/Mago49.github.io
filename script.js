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
          const d = new Date(dateStr);
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
          updateHeroSummary();
        });

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reinício';
        resetBtn.style.background = '#ef4444';
        resetBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          showResetModal(p, q);
        });

        actionButtons.appendChild(historyBtn);
actionButtons.appendChild(btn);
actionButtons.appendChild(endBtn);
actionButtons.appendChild(resetBtn);
li.appendChild(actionButtons);

// Seção de apostas — só para plataformas 'com aposta'
const vipMeta = vipPlatforms.find(v => v.code === p.name);
if (vipMeta && vipMeta.group === 'com') {
  const betSection = document.createElement('div');
  betSection.className = 'bet-section';

  const betRow = document.createElement('div');
  betRow.className = 'bet-row';

  // Verifica se já apostou hoje
  const todayStr = new Date().toISOString().slice(0, 10);
  const cycleStart = getCycleStart(p, new Date());
  const betDaysInCycle = (p.betDays || []).filter(d => {
    return new Date(d) >= cycleStart;
  });
  const alreadyBetToday = betDaysInCycle.some(d => d.slice(0, 10) === todayStr);

  // Botão "Apostei hoje"
  const betTodayBtn = document.createElement('button');
  betTodayBtn.className = 'bet-today-btn' + (alreadyBetToday ? ' already-bet' : '');
  betTodayBtn.textContent = alreadyBetToday ? '✓ Apostei hoje' : '🎯 Apostei hoje';
  betTodayBtn.disabled = alreadyBetToday;
  betTodayBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    if (alreadyBetToday) return;
    if (!p.betDays) p.betDays = [];
    p.betDays.push(todayStr);
    savePlatforms(platforms);
    renderPlatformList(q);
renderVipPanel();
  });

  // Badge de contagem
  const betCount = document.createElement('span');
  betCount.className = 'bet-count-badge';
  betCount.textContent = `🎲 ${betDaysInCycle.length} dia(s)`;

  // Botão gerenciar
  const betManageBtn = document.createElement('button');
  betManageBtn.className = 'bet-manage-btn';
  betManageBtn.textContent = 'Gerenciar';
  betManageBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    showBetModal(p, q);
  });

  betRow.appendChild(betTodayBtn);
  betRow.appendChild(betCount);
  betRow.appendChild(betManageBtn);
  betSection.appendChild(betRow);
  li.appendChild(betSection);
}

        li.addEventListener('click', (e) => {
          if (e.target === btn || e.target === input || e.target === resetBtn || e.target === historyBtn) return;
          document.querySelectorAll('.platform-item').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          filterCalendarByPlatform(p.id);
        });

        listEl.appendChild(li);
      });

      const totalAll = platforms.reduce((s, pl) => s + getTotalDepositsSinceCycle(pl), 0);
      countEl.textContent = `${items.length} plataformas • Total geral: ${formatCurrency(totalAll)}`;
      updateHeroSummary();
    }

    const historyModal = document.getElementById('historyModal');
    const historyTitle = document.getElementById('historyTitle');
    const historyList = document.getElementById('historyList');
    const historyCloseBtn = document.getElementById('historyCloseBtn');
    let currentHistoryPlatform = null;

    function showHistoryModal(platform){
      currentHistoryPlatform = platform;
      historyTitle.textContent = `Histórico de Depósitos - ${platform.name}`;
      historyList.innerHTML = '';

      if (platform.deposits.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Nenhum depósito registrado</div>';
      } else {
        const sortedDeposits = [...platform.deposits].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedDeposits.forEach((dep) => {
          const depositDate = new Date(dep.date);
          const dia = String(depositDate.getDate()).padStart(2, '0');
          const mes = String(depositDate.getMonth() + 1).padStart(2, '0');
          const ano = depositDate.getFullYear();
          const horas = String(depositDate.getHours()).padStart(2, '0');
          const minutos = String(depositDate.getMinutes()).padStart(2, '0');

          const item = document.createElement('div');
          item.className = 'history-item';

          const itemContent = document.createElement('div');
          itemContent.className = 'history-item-content';

          const dateSpan = document.createElement('span');
          dateSpan.className = 'history-date';
          dateSpan.textContent = `${dia}/${mes}/${ano} ${horas}:${minutos}`;

          const valueSpan = document.createElement('span');
          valueSpan.className = 'history-value';
          valueSpan.textContent = formatCurrency(dep.value);

          itemContent.appendChild(dateSpan);
          itemContent.appendChild(valueSpan);
          item.appendChild(itemContent);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'history-delete-btn';
          deleteBtn.textContent = 'Excluir';
          deleteBtn.addEventListener('click', async () => {
            const ok = await showAppConfirm(`Deseja excluir este depósito de ${formatCurrency(dep.value)}?`);
            if (ok) {
              platform.deposits.splice(platform.deposits.indexOf(dep), 1);
              savePlatforms(platforms);
              updateCalendarEvents();
              renderPlatformList(platformSearchEl.value);
              showHistoryModal(platform);
              updateHeroSummary();
            }
          });
          item.appendChild(deleteBtn);

          historyList.appendChild(item);
        });
      }

      historyModal.style.display = 'flex';
    }

historyCloseBtn.addEventListener('click', () => {
      historyModal.style.display = 'none';
      currentHistoryPlatform = null;
    });

    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        historyModal.style.display = 'none';
        currentHistoryPlatform = null;
      }
    });

    const resetModal = document.getElementById('resetModal');
    const resetModalText = document.getElementById('resetModalText');
    const resetDateInput = document.getElementById('resetDateInput');
    const resetConfirmBtn = document.getElementById('resetConfirmBtn');
    const resetCancelBtn = document.getElementById('resetCancelBtn');
    let currentResetPlatform = null;
    let currentResetFilter = '';

    function showResetModal(platform, filter){
      currentResetPlatform = platform;
      currentResetFilter = filter;
      resetModalText.textContent = `Reiniciar ciclo de ${platform.name}?`;

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      resetDateInput.value = `${yyyy}-${mm}-${dd}`;

      resetModal.style.display = 'flex';
    }

    function closeResetModal(){
      resetModal.style.display = 'none';
      currentResetPlatform = null;
    }

    resetConfirmBtn.addEventListener('click', () => {
      if (currentResetPlatform) {
        currentResetPlatform.lastResetDate = `${resetDateInput.value}T00:00:00`;
        currentResetPlatform.cycleEnded = false;
        savePlatforms(platforms);
        updateCalendarEvents();
        renderPlatformList(currentResetFilter);
        updateHeroSummary();
      }
      closeResetModal();
    });

    resetCancelBtn.addEventListener('click', () => {
      closeResetModal();
    });

    resetModal.addEventListener('click', (e) => {
      if (e.target === resetModal) closeResetModal();
    });

// === MODAL GERENCIAR APOSTAS ===
const betModal       = document.getElementById('betModal');
const betModalTitle  = document.getElementById('betModalTitle');
const betModalClose  = document.getElementById('betModalClose');
const betDateInput   = document.getElementById('betDateInput');
const betAddConfirm  = document.getElementById('betAddConfirm');
const betList        = document.getElementById('betList');
let currentBetPlatform   = null;
let currentBetFilter     = '';

function showBetModal(platform, filter) {
  currentBetPlatform = platform;
  currentBetFilter   = filter || '';
  betModalTitle.textContent = `Apostas — ${platform.name}`;

  // Pré-preenche com hoje
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  betDateInput.value = `${yyyy}-${mm}-${dd}`;

  renderBetList();
  betModal.style.display = 'flex';
}

function renderBetList() {
  betList.innerHTML = '';
  if (!currentBetPlatform) return;

  const cycleStart = getCycleStart(currentBetPlatform, new Date());
  const days = (currentBetPlatform.betDays || [])
    .filter(d => new Date(d) >= cycleStart)
    .map(d => d.slice(0, 10))
    .filter((v, i, arr) => arr.indexOf(v) === i) // únicos
    .sort((a, b) => b.localeCompare(a)); // mais recentes primeiro

  if (days.length === 0) {
    betList.innerHTML = '<div class="bet-empty">Nenhuma aposta registrada neste ciclo.</div>';
    return;
  }

  days.forEach(dateStr => {
    const [y, m, d] = dateStr.split('-');
    const item = document.createElement('div');
    item.className = 'bet-list-item';

    const label = document.createElement('span');
    label.textContent = `${d}/${m}/${y}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bet-list-remove';
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', () => {
      currentBetPlatform.betDays = (currentBetPlatform.betDays || [])
        .filter(dd => dd.slice(0, 10) !== dateStr);
      savePlatforms(platforms);
      renderBetList();
      renderPlatformList(currentBetFilter);
      renderVipPanel();
    });

    item.appendChild(label);
    item.appendChild(removeBtn);
    betList.appendChild(item);
  });
}

betAddConfirm.addEventListener('click', async () => {
  if (!currentBetPlatform || !betDateInput.value) return;
  const dateStr = betDateInput.value; // 'YYYY-MM-DD'
  if (!currentBetPlatform.betDays) currentBetPlatform.betDays = [];

  // Não duplica
  const already = currentBetPlatform.betDays.some(d => d.slice(0, 10) === dateStr);
  if (already) {
    await showAppAlert('Este dia já está registrado.');
    return;
  }

  currentBetPlatform.betDays.push(dateStr);
  savePlatforms(platforms);
  renderBetList();
  renderPlatformList(currentBetFilter);
  renderVipPanel();
});

betModalClose.addEventListener('click', () => {
  betModal.style.display = 'none';
  currentBetPlatform = null;
});

betModal.addEventListener('click', e => {
  if (e.target === betModal) {
    betModal.style.display = 'none';
    currentBetPlatform = null;
  }
});
    let platforms = loadPlatforms();

    renderPlatformList();

    const platformPanelEl = document.getElementById('platformPanel');
    const calendarEl = document.getElementById('calendar');
    const platformSearchEl = document.getElementById('platformSearch');

    platformSearchEl.addEventListener('input', (e) => {
      renderPlatformList(e.target.value);
    });

    document.getElementById('allBonusBtn').addEventListener('click', () => {
      document.querySelectorAll('.platform-item').forEach(el => el.classList.remove('selected'));
      showAllBonusCalendar();
    });

    document.getElementById('resetAllBtn').addEventListener('click', async () => {
      const ok = await showAppConfirm('Resetar todos os depósitos de TODAS as plataformas?');
      if (!ok) return;
      platforms.forEach(p => p.deposits = []);
      savePlatforms(platforms);
      renderPlatformList();
      updateCalendarEvents();
      updateHeroSummary();
});

    document.getElementById('scrollToPanelBtn').addEventListener('click', () => {
      platformPanelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('scrollToCalendarBtn').addEventListener('click', () => {
      calendarEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const toggleBtn = document.getElementById('togglePanelBtn');
    const minimizeTab = document.getElementById('minimizeTab');

    toggleBtn.addEventListener('click', () => {
      platformPanelEl.classList.toggle('minimized');
      minimizeTab.classList.toggle('show');
      toggleBtn.title = platformPanelEl.classList.contains('minimized') ? 'Abrir painel' : 'Minimizar painel';
      minimizeTab.textContent = platformPanelEl.classList.contains('minimized') ? 'Abrir Painel' : 'Fechar Painel';
    });

    minimizeTab.addEventListener('click', () => {
      platformPanelEl.classList.remove('minimized');
      minimizeTab.classList.remove('show');
      toggleBtn.title = 'Minimizar painel';
      minimizeTab.textContent = 'Abrir Painel';
    });

    function updateCalendarEvents(){
      if (!calendar) return;
      calendar.removeAllEvents();

      const now = new Date();
      const windowFrom = new Date(now); windowFrom.setDate(windowFrom.getDate() - 10);
      const windowTo = new Date(now); windowTo.setDate(windowTo.getDate() + 40);

      platforms.forEach(platform => {
        if (platform.cycleEnded) return;
        const emissionDates = computeEmissionDates(platform, now);
        emissionDates.forEach(emDate => {
          if (emDate >= windowFrom && emDate <= windowTo) {
            const totalAtEmission = sumDepositsUpTo(platform, emDate);
            const bg = colorForLevel(totalAtEmission);

            calendar.addEvent({
              id: `emit_${platform.id}_${emDate.toISOString().slice(0,10)}`,
              title: platform.name,
              start: emDate.toISOString().slice(0,10),
              allDay: true,
              display: 'block',
              backgroundColor: bg,
              borderColor: 'rgba(0,0,0,0.06)',
              extendedProps: {
                platformId: platform.id,
                platformName: platform.name,
                totalAtEmission: totalAtEmission
              }
            });
          }
        });
      });


      updateHeroSummary();
    }

    function filterCalendarByPlatform(platformId){
      const allEvents = calendar.getEvents();
      allEvents.forEach(event => {
        const eventPlatformId = event.extendedProps.platformId;
        event.setProp('display', eventPlatformId === platformId ? 'block' : 'none');
      });
    }

    function showAllBonusCalendar(){
      const allEvents = calendar.getEvents();
      allEvents.forEach(event => {
        event.setProp('display', 'block');
      });
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'pt-br',
      selectable: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      events: [],
      eventDisplay: 'block',
      eventDidMount: function(info){
        const bg = info.event.backgroundColor;
        info.el.style.background = bg;
        info.el.style.color = '#000000';
        info.el.style.border = '1px solid rgba(0,0,0,0.06)';
        info.el.style.borderRadius = '10px';
        info.el.style.fontWeight = '700';
        info.el.style.fontSize = '0.75rem';
        info.el.style.padding = '2px';
      }
    });

    calendar.render();
    updateCalendarEvents();
    updateHeroSummary();

    function scheduleDailyUpdate(){
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      const ms = nextMidnight - now;
      setTimeout(() => {
        updateCalendarEvents();
        renderPlatformList(platformSearchEl.value);
        updateHeroSummary();
        scheduleDailyUpdate();
      }, ms);
    }
    scheduleDailyUpdate();
    renderVipPanel();
  });

