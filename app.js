/* ============================================================
   Банк инициатив граждан — аналитика (ПОЛНЫЙ app.js)
   ============================================================ */

let RAW = [];
let FILTERED = [];
const charts = {};
let MANUAL_EFFECTS = {};

const PALETTE = ['#1C2E4A','#52677D','#2E7D52','#B23A3A','#8A6D3B','#3B5A8A','#6B4C9A','#2A7F8A','#A85A3B','#4A6B3B'];

const ECON_BASE = {
  'инфраструктура':15000000,'экономика':25000000,'здравоохранение':12000000,
  'образование':8000000,'экология':10000000,'цифровизация':18000000,
  'социальное':6000000,'культура':5000000,'безопасность':7000000,'другое':3000000
};

const ECON_KEYWORDS = {
  'инфраструктура':['дорог','тротуар','мост','транспорт','жкх','водоснабж','канализац','благоустрой','строительств','остановк','свет','электросет','ремонт'],
  'экономика':['инвестиц','предприят','завод','производств','агро','ферм','туризм','логистик','бизнес','рабочих мест','налог','врп','экспорт','импортозамещ'],
  'здравоохранение':['больниц','поликлиник','медиц','врач','фap','скорой','хоспис','реабилитац','здоров'],
  'образование':['школ','детсад','детский сад','вуз','колледж','образован','университет','училищ','стипенд'],
  'экология':['эколог','мусор','отход','переработ','чист','река','дон','озелен','парк','зелен','амбрози','свалк'],
  'цифровизация':['цифров','it ','ит-','блокчейн','крипт','программ','платформ','приложен','интернет','связь','автоматизац'],
  'социальное':['семь','демограф','рождаем','пенсион','инвалид','ветеран','молодеж','молодёж','социальн','льгот','выплат','поддержк'],
  'культура':['культур','музей','театр','библиотек','музык','казач','традиц','фестивал','искусств'],
  'безопасность':['безопасн','мошенник','преступ','полици','мвд','пожарн','чс','терроризм','наркотик'],
  'другое':[]
};

/* ---------- УТИЛИТЫ ---------- */
const fmt = n => new Intl.NumberFormat('ru-RU').format(n);

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function parseDate(str){
  if (!str) return null;
  const p = str.split('.');
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  return null;
}

function download(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function shorten(s, n = 40){
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '');
}

function simpleHash(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){ h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h);
}

/* ---------- ЭКОНОМИКА ---------- */
function detectCategory(item){
  const hay = ((item.text || '') + ' ' + (item.subtheme || '') + ' ' + (item.theme || '')).toLowerCase();
  let best = 'другое', bestScore = 0;
  for (const [cat, words] of Object.entries(ECON_KEYWORDS)){
    let score = 0;
    words.forEach(w => { if (hay.includes(w)) score++; });
    if (score > bestScore){ bestScore = score; best = cat; }
  }
  return best;
}

function textMultiplier(text){
  const len = (text || '').length;
  if (len > 2000) return 2.5;
  if (len > 1000) return 1.8;
  if (len > 500)  return 1.3;
  if (len > 200)  return 1.0;
  return 0.6;
}

function statusMultiplier(status){
  if (!status || !status.trim()) return 1.0;
  const s = status.toLowerCase();
  if (s.includes('заверш') || s.includes('выполн') || s.includes('реализ')) return 1.5;
  if (s.includes('нестратег') || s.includes('отклон')) return 0.3;
  return 1.2;
}

function estimateEffect(item, index){
  if (MANUAL_EFFECTS[index] !== undefined) return MANUAL_EFFECTS[index];
  const hash = simpleHash((item.text || '') + (item.city || ''));
  if (MANUAL_EFFECTS[hash] !== undefined) return MANUAL_EFFECTS[hash];
  const cat = detectCategory(item);
  const base = ECON_BASE[cat] || ECON_BASE['другое'];
  return Math.round(base * textMultiplier(item.text) * statusMultiplier(item.status));
}

function formatMoney(n){
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' млрд ₽';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' млн ₽';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' тыс. ₽';
  return fmt(n) + ' ₽';
}

/* ---------- СТАТУСЫ ---------- */
function classifyStatus(status){
  if (!status || !status.trim()) return 'progress';
  const s = status.toLowerCase();
  if (s.includes('заверш') || s.includes('выполн') || s.includes('реализ')) return 'done';
  if (s.includes('нестратег') || s.includes('отклон') || s.includes('отказ')) return 'rejected';
  if (s.includes('обработ') || s.includes('рассмотр') || s.includes('очеред')) return 'progress';
  return 'unknown';
}

function statusLabel(code){
  return { done: 'Завершено', progress: 'В обработке', rejected: 'Нестратегическое', unknown: 'Другое' }[code] || code;
}

/* ---------- ЗАГРУЗКА ---------- */
async function loadData(){
  try {
    try {
      const ef = await fetch('effects.json');
      if (ef.ok) MANUAL_EFFECTS = await ef.json();
    } catch (_){}

    const res = await fetch('data.json');
    if (!res.ok) throw new Error('data.json не найден (статус ' + res.status + ')');

    RAW = await res.json();
    if (!Array.isArray(RAW)) throw new Error('data.json должен быть массивом');

    FILTERED = [...RAW];
    buildFilters();
    renderAll();
    console.log('✅ Данные загружены:', RAW.length, 'инициатив');
  } catch (e) {
    console.error('❌ Ошибка загрузки:', e);
    document.getElementById('errorBox').innerHTML =
      '<div class="error-box">Ошибка: ' + e.message +
      '<br>Проверьте, что data.json лежит рядом с index.html и открывается в браузере.</div>';
  }
}

/* ---------- ФИЛЬТРЫ ---------- */
function buildFilters(){
  const themes = [...new Set(RAW.map(r => r.theme).filter(Boolean))].sort();
  const cities = [...new Set(RAW.map(r => r.city).filter(Boolean))].sort();
  const subs   = [...new Set(RAW.map(r => r.subtheme).filter(Boolean))].sort();

  const tSel = document.getElementById('fTheme');
  const cSel = document.getElementById('fCity');
  const sSel = document.getElementById('fSub');

  themes.forEach(t => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t.length > 60 ? t.slice(0, 60) + '…' : t;
    o.title = t;
    tSel.appendChild(o);
  });
  cities.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c; cSel.appendChild(o);
  });
  subs.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s; sSel.appendChild(o);
  });
}

function applyFilters(){
  const theme  = document.getElementById('fTheme').value;
  const city   = document.getElementById('fCity').value;
  const sub    = document.getElementById('fSub').value;
  const from   = document.getElementById('fFrom').value;
  const to     = document.getElementById('fTo').value;
  const search = document.getElementById('fSearch').value.trim().toLowerCase();
  const fileF  = document.getElementById('fFile').value;

  FILTERED = RAW.filter(r => {
    if (theme && r.theme !== theme) return false;
    if (city && r.city !== city) return false;
    if (sub && r.subtheme !== sub) return false;
    if (search && !(r.text || '').toLowerCase().includes(search)) return false;
    if (fileF === 'yes' && !(r.file && r.file.trim())) return false;
    if (fileF === 'no' && (r.file && r.file.trim())) return false;
    if (from || to) {
      const d = parseDate(r.date);
      if (!d) return false;
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(to)) return false;
    }
    return true;
  });

  renderAll();
  showToast('Найдено: ' + FILTERED.length + ' из ' + RAW.length);
}

function resetFilters(){
  document.querySelectorAll('.filters select, .filters input').forEach(el => el.value = '');
  FILTERED = [...RAW];
  renderAll();
  showToast('Фильтры сброшены');
}

/* ---------- СТАТИСТИКА ---------- */
function computeStats(){
  const total = FILTERED.length;
  const withFile = FILTERED.filter(r => r.file && r.file.trim()).length;
  const processed = FILTERED.filter(r => r.status && r.status.trim()).length;

  const byTheme = {}, byCity = {}, bySub = {}, byDate = {};

  FILTERED.forEach(r => {
    byTheme[r.theme] = (byTheme[r.theme] || 0) + 1;
    byCity[r.city]   = (byCity[r.city] || 0) + 1;
    bySub[r.subtheme]= (bySub[r.subtheme] || 0) + 1;
    if (r.date) byDate[r.date] = (byDate[r.date] || 0) + 1;
  });

  const dates = Object.keys(byDate).sort((a, b) => {
    const da = parseDate(a), db = parseDate(b);
    return (da || 0) - (db || 0);
  });

  let cum = 0;
  const cumulativeData = dates.map(d => { cum += byDate[d]; return cum; });

  return {
    total, withFile, processed,
    themes: Object.keys(byTheme).length,
    cities: Object.keys(byCity).length,
    subs:   Object.keys(bySub).length,
    byTheme, byCity, bySub, byDate, dates, cumulativeData
  };
}

/* ---------- KPI ---------- */
function renderKPI(){
  const s = computeStats();
  const pct = s.total ? Math.round(s.processed / s.total * 100) : 0;
  const cards = [
    { label: 'Всего инициатив',  value: fmt(s.total) },
    { label: 'Уникальных тем',   value: fmt(s.themes) },
    { label: 'Городов / районов',value: fmt(s.cities) },
    { label: 'Подтем',           value: fmt(s.subs) },
    { label: 'С документом',     value: fmt(s.withFile) },
    { label: 'Обработано',       value: pct + '%' }
  ];
  document.getElementById('kpiGrid').innerHTML = cards.map(c =>
    '<div class="kpi-card"><div class="label">' + c.label +
    '</div><div class="value">' + c.value + '</div></div>'
  ).join('');
}

function renderCompletedKPI(){
  const total = FILTERED.length;
  const counts = { done: 0, progress: 0, rejected: 0, unknown: 0 };
  FILTERED.forEach(r => { counts[classifyStatus(r.status)]++; });

  const pct  = total ? Math.round(counts.done / total * 100) : 0;
  const pPct = total ? Math.round(counts.progress / total * 100) : 0;

  const cards = [
    { label: '✅ Завершено',       value: fmt(counts.done),     sub: pct + '% от всех' },
    { label: '⏳ В обработке',     value: fmt(counts.progress), sub: pPct + '% от всех' },
    { label: '❌ Нестратегические', value: fmt(counts.rejected), sub: '' },
    { label: '❔ Без статуса',     value: fmt(counts.unknown),  sub: '' }
  ];

  document.getElementById('completedGrid').innerHTML = cards.map(c =>
    '<div class="kpi-card"><div class="label">' + c.label +
    '</div><div class="value">' + c.value + '</div>' +
    (c.sub ? '<div style="font-size:.78rem;color:#52677D;margin-top:6px;font-weight:600">' + c.sub + '</div>' : '') +
    '</div>'
  ).join('');
}

/* ---------- ЭКОНОМИКА: РАСЧЁТ ---------- */
function computeEconomicEffect(){
  const byCategory = {}, items = [];
  let total = 0;

  FILTERED.forEach(r => {
    const gi = RAW.indexOf(r);
    const effect = estimateEffect(r, gi);
    const cat = detectCategory(r);
    byCategory[cat] = (byCategory[cat] || 0) + effect;
    total += effect;
    items.push(Object.assign({}, r, { _effect: effect, _category: cat, _index: gi }));
  });

  items.sort((a, b) => b._effect - a._effect);
  return { total, byCategory, items };
}

function renderEconomicPanel(){
  const { total, byCategory, items } = computeEconomicEffect();
  const avg = items.length ? total / items.length : 0;

  document.getElementById('econTotal').textContent = formatMoney(total);
  document.getElementById('econPerIdea').textContent =
    'В среднем ' + formatMoney(avg) + ' на инициативу • ' + items.length + ' шт.';

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  document.getElementById('econBreakdown').innerHTML = sorted.map(([cat, val]) =>
    '<div class="econ-item">' +
      '<div class="k">' + cat + '</div>' +
      '<div class="v">' + formatMoney(val) + '</div>' +
      '<div class="c">' + Math.round(val / total * 100) + '% от общего</div>' +
    '</div>'
  ).join('');

  const tbody = document.querySelector('#econTable tbody');
  tbody.innerHTML = items.slice(0, 10).map((it, i) =>
    '<tr>' +
      '<td><b>' + (i + 1) + '</b></td>' +
      '<td>' + (it.city || '—') + '</td>' +
      '<td>' + (it.subtheme || '—') + '</td>' +
      '<td><span class="badge ' + (it._category === 'экономика' ? 'done' : 'unknown') + '">' + it._category + '</span></td>' +
      '<td style="font-weight:700;color:#1C2E4A;white-space:nowrap">' + formatMoney(it._effect) + '</td>' +
      '<td>' + (it.text || '').slice(0, 120) + ((it.text || '').length > 120 ? '…' : '') + '</td>' +
    '</tr>'
  ).join('');
}

/* ---------- ГРАФИКИ ---------- */
function destroyCharts(){
  Object.values(charts).forEach(c => c && c.destroy());
}

function renderCharts(){
  const s = computeStats();
  destroyCharts();

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = '#1C2E4A';

  /* Темы */
  charts.themes = new Chart(document.getElementById('chartThemes'), {
    type: 'bar',
    data: {
      labels: Object.keys(s.byTheme).map(t => shorten(t, 35)),
      datasets: [{
        label: 'Инициатив',
        data: Object.values(s.byTheme),
        backgroundColor: PALETTE[0],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  /* Города */
  const cityEntries = Object.entries(s.byCity).sort((a, b) => b[1] - a[1]).slice(0, 10);
  charts.cities = new Chart(document.getElementById('chartCities'), {
    type: 'bar',
    data: {
      labels: cityEntries.map(e => e[0]),
      datasets: [{ label: 'Инициатив', data: cityEntries.map(e => e[1]), backgroundColor: PALETTE[1], borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  /* Динамика */
  charts.timeline = new Chart(document.getElementById('chartTimeline'), {
    type: 'line',
    data: {
      labels: s.dates,
      datasets: [
        { label: 'Новых в день', data: s.dates.map(d => s.byDate[d]),
          borderColor: PALETTE[2], backgroundColor: 'rgba(46,125,82,0.15)',
          fill: true, tension: 0.3, pointRadius: 3 },
        { label: 'Накопительно', data: s.cumulativeData,
          borderColor: PALETTE[3], backgroundColor: 'rgba(178,58,58,0.1)',
          fill: false, tension: 0.3, borderDash: [5, 5], pointRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
                y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  /* Подтемы */
  const subEntries = Object.entries(s.bySub).sort((a, b) => b[1] - a[1]);
  const topSubs = subEntries.slice(0, 8);
  const otherSum = subEntries.slice(8).reduce((a, e) => a + e[1], 0);
  const subLabels = topSubs.map(e => e[0]);
  const subData = topSubs.map(e => e[1]);
  if (otherSum > 0){ subLabels.push('Прочее'); subData.push(otherSum); }

  charts.subthemes = new Chart(document.getElementById('chartSubthemes'), {
    type: 'doughnut',
    data: { labels: subLabels, datasets: [{ data: subData, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
  });

  /* Экономика */
  const { byCategory } = computeEconomicEffect();
  const econEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  charts.econ = new Chart(document.getElementById('chartEcon'), {
    type: 'bar',
    data: {
      labels: econEntries.map(e => e[0]),
      datasets: [{ label: 'Эффект, ₽', data: econEntries.map(e => e[1]), backgroundColor: PALETTE[2], borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatMoney(v) } },
                x: { ticks: { font: { size: 10 } } } }
    }
  });

  /* Статусы */
  const counts = { done: 0, progress: 0, rejected: 0, unknown: 0 };
  FILTERED.forEach(r => { counts[classifyStatus(r.status)]++; });
  charts.status = new Chart(document.getElementById('chartStatus'), {
    type: 'doughnut',
    data: {
      labels: ['Завершено', 'В обработке', 'Нестратегическое', 'Без статуса'],
      datasets: [{ data: [counts.done, counts.progress, counts.rejected, counts.unknown],
        backgroundColor: ['#2E7D52', '#E0A800', '#B23A3A', '#BDC4D4'],
        borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
  });
}

/* ---------- ТАБЛИЦА ---------- */
function renderTable(){
  const thead = document.querySelector('#dataTable thead tr');
  const tbody = document.querySelector('#dataTable tbody');

  thead.innerHTML = '<th>Дата</th><th>Город</th><th>Тема</th><th>Подтема</th><th>Текст</th><th>Статус</th><th>Файл</th>';

  tbody.innerHTML = FILTERED.map(r => {
    const f = r.file && r.file.trim()
      ? '<a href="' + r.file + '" target="_blank" style="color:#1C2E4A">📄</a>'
      : '—';
    const text = (r.text || '').length > 140 ? r.text.slice(0, 140) + '…' : (r.text || '');
    return '<tr>' +
      '<td style="white-space:nowrap">' + (r.date || '—') + ' ' + (r.time || '') + '</td>' +
      '<td>' + (r.city || '—') + '</td>' +
      '<td>' + shorten(r.theme || '—', 50) + '</td>' +
      '<td>' + (r.subtheme || '—') + '</td>' +
      '<td>' + text + '</td>' +
      '<td>' + (r.status || '—') + '</td>' +
      '<td>' + f + '</td>' +
    '</tr>';
  }).join('');
}

/* ---------- ВКЛАДКИ ПО ТЕМАМ ---------- */
function renderTabs(){
  const structured = {};
  RAW.forEach(item => {
    const theme = item.theme || 'Без темы';
    const sub = item.subtheme || 'Общее';
    if (!structured[theme]) structured[theme] = {};
    if (!structured[theme][sub]) structured[theme][sub] = [];
    structured[theme][sub].push(item);
  });

  const tabsContainer = document.getElementById('tabs');
  const panelsContainer = document.getElementById('panels');
  tabsContainer.innerHTML = '';
  panelsContainer.innerHTML = '';

  let isFirst = true;
  for (const theme in structured){
    const themeId = 'theme-' + Math.random().toString(36).slice(2, 11);

    const tab = document.createElement('div');
    tab.className = 'tab' + (isFirst ? ' active' : '');
    tab.textContent = theme.length > 40 ? theme.slice(0, 40) + '…' : theme;
    tab.title = theme;
    tab.setAttribute('data-target', themeId);
    tabsContainer.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (isFirst ? ' active' : '');
    panel.id = themeId;

    for (const sub in structured[theme]){
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = sub + ' (' + structured[theme][sub].length + ')';
      details.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'requests-list';

      structured[theme][sub].forEach(req => {
        const card = document.createElement('div');
        card.className = 'request-card';

        const fileHTML = req.file && req.file.trim()
          ? '<div class="card-file"><a href="' + req.file + '" target="_blank">📄 Документ</a></div>'
          : '';

        card.innerHTML =
          '<div class="card-city">' + (req.city || 'Не указан') + '</div>' +
          fileHTML +
          '<div class="card-text">' + (req.text || 'Текст отсутствует') + '</div>' +
          '<div class="card-status-block"><b>Статус:</b> ' + (req.status || 'В обработке') +
            '<br><b>Обработано:</b> ' + (req.status_date || '—') + '</div>' +
          '<div class="card-date-block">' + (req.date || '—') + ' в ' + (req.time || '—') + '</div>';

        list.appendChild(card);
      });

      details.appendChild(list);
      panel.appendChild(details);
    }

    panelsContainer.appendChild(panel);
    isFirst = false;
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.getAttribute('data-target')).classList.add('active');
    });
  });
}

/* ---------- РЕНДЕР ВСЕГО ---------- */
function renderAll(){
  renderKPI();
  renderCompletedKPI();
  renderEconomicPanel();
  renderCharts();
  renderTable();
  renderTabs();
}

/* ---------- ЭКСПОРТ ---------- */
function buildStatsPackage(){
  const s = computeStats();
  const econ = computeEconomicEffect();
  return {
    generatedAt: new Date().toISOString(),
    source: 'Банк инициатив граждан',
    summary: {
      total: s.total,
      themes: s.themes,
      cities: s.cities,
      subthemes: s.subs,
      withFile: s.withFile,
      processed: s.processed
    },
    byTheme: s.byTheme,
    byCity: s.byCity,
    bySubtheme: s.bySub,
    byDate: s.byDate,
    economic: {
      total: econ.total,
      totalFormatted: formatMoney(econ.total),
      byCategory: econ.byCategory
    },
    raw: FILTERED
  };
}

function exportJSON(){
  download('center_invest_stats.json', JSON.stringify(buildStatsPackage(), null, 2), 'application/json');
  showToast('center_invest_stats.json скачан');
}

function exportCSV(){
  const rows = [['index','date','time','city','theme','subtheme','status','text','file']];
  FILTERED.forEach((r, i) => {
    rows.push([i, r.date || '', r.time || '', r.city || '', r.theme || '',
      r.subtheme || '', r.status || '', (r.text || '').replace(/"/g, '""'), r.file || '']);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  download('center_invest_stats.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
  showToast('center_invest_stats.csv скачан');
}

function exportReport(){
  const s = computeStats();
  const econ = computeEconomicEffect();
  const rows = Object.entries(s.byTheme).sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>').join('');
  const econRows = Object.entries(econ.byCategory).sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => '<tr><td>' + k + '</td><td>' + formatMoney(v) + '</td></tr>').join('');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отчёт</title>' +
    '<style>body{font-family:system-ui;padding:40px;color:#111}h1{color:#1C2E4A}' +
    'table{border-collapse:collapse;width:100%;margin-top:16px}' +
    'th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f4fa}' +
    '.kpi{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}' +
    '.kpi div{background:#f0f4fa;padding:14px 20px;border-radius:8px;min-width:140px}' +
    '.kpi span{display:block;font-size:12px;color:#555}.kpi b{font-size:20px}</style></head><body>' +
    '<h1>Банк инициатив граждан — отчёт</h1>' +
    '<p>Сформирован: ' + new Date().toLocaleString('ru-RU') + '</p>' +
    '<div class="kpi">' +
      '<div><span>Инициатив</span><b>' + s.total + '</b></div>' +
      '<div><span>Тем</span><b>' + s.themes + '</b></div>' +
      '<div><span>Городов</span><b>' + s.cities + '</b></div>' +
      '<div><span>С файлом</span><b>' + s.withFile + '</b></div>' +
      '<div><span>Эффект</span><b>' + formatMoney(econ.total) + '</b></div>' +
    '</div>' +
    '<h2>По темам</h2><table><thead><tr><th>Тема</th><th>Кол-во</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h2>Экономический эффект по категориям</h2><table><thead><tr><th>Категория</th><th>Эффект</th></tr></thead><tbody>' + econRows + '</tbody></table>' +
    '<script>setTimeout(()=>window.print(),400)<\/script></body></html>';

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function exportSummaryTXT(){
  const s = computeStats();
  const econ = computeEconomicEffect();
  const lines = [
    'БАНК ИНИЦИАТИВ ГРАЖДАН — КРАТКАЯ СВОДКА',
    'Сформировано: ' + new Date().toLocaleString('ru-RU'),
    '',
    'Всего инициатив: ' + s.total,
    'Уникальных тем: ' + s.themes,
    'Городов/районов: ' + s.cities,
    'Подтем: ' + s.subs,
    'С документом: ' + s.withFile,
    'Обработано: ' + s.processed,
    '',
    'ЭКОНОМИЧЕСКИЙ ЭФФЕКТ:',
    'Суммарно: ' + formatMoney(econ.total),
    'В среднем: ' + formatMoney(s.total ? econ.total / s.total : 0),
    '',
    'ПО ТЕМАМ:',
    ...Object.entries(s.byTheme).sort((a,b)=>b[1]-a[1]).map(([k,v]) => '  ' + k + ': ' + v),
    '',
    'ТОП-10 ГОРОДОВ:',
    ...Object.entries(s.byCity).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => '  ' + k + ': ' + v)
  ];
  download('summary.txt', lines.join('\n'), 'text/plain;charset=utf-8');
  showToast('summary.txt скачан');
}

function exportEconomicJSON(){
  const { total, byCategory, items } = computeEconomicEffect();
  const pkg = {
    generatedAt: new Date().toISOString(),
    methodology: { base: ECON_BASE, keywords: ECON_KEYWORDS, note: 'Эвристическая оценка' },
    summary: {
      totalEffect: total,
      totalFormatted: formatMoney(total),
      averageEffect: items.length ? Math.round(total / items.length) : 0,
      count: items.length
    },
    byCategory: Object.fromEntries(
      Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([k,v]) => [k, { effect: v, formatted: formatMoney(v) }])
    ),
    top10: items.slice(0, 10).map(it => ({
      city: it.city, subtheme: it.subtheme, category: it._category,
      effect: it._effect, effectFormatted: formatMoney(it._effect)
    })),
    allItems: items.map(it => ({
      index: it._index, city: it.city, subtheme: it.subtheme,
      category: it._category, effect: it._effect
    }))
  };
  download('economic_effect.json', JSON.stringify(pkg, null, 2), 'application/json');
  showToast('economic_effect.json скачан');
}

function exportCompletedCSV(){
  const rows = [['index','date','city','theme','subtheme','status','status_label','text','file']];
  FILTERED.forEach(r => {
    const code = classifyStatus(r.status);
    rows.push([
      RAW.indexOf(r), r.date || '', r.city || '', r.theme || '', r.subtheme || '',
      r.status || '', statusLabel(code), (r.text || '').slice(0, 300).replace(/"/g, '""'), r.file || ''
    ]);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  download('completed_applications.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
  showToast('completed_applications.csv скачан');
}

/* ---------- ГЕНЕРАЦИЯ ШАБЛОНА effects.json ---------- */
window.generateEffectsTemplate = function(){
  const tpl = {};
  RAW.forEach((r, i) => { tpl[i] = estimateEffect(r, i); });
  download('effects_template.json', JSON.stringify(tpl, null, 2), 'application/json');
  showToast('Шаблон effects.json скачан');
};

/* ---------- СТАРТ ---------- */
document.getElementById('applyFilter').addEventListener('click', applyFilters);
document.getElementById('resetFilter').addEventListener('click', resetFilters);
window.addEventListener('DOMContentLoaded', loadData);
