/* ============================================================
   Банк инициатив граждан — аналитика
   ============================================================ */

let RAW = [];          // все данные из data.json
let FILTERED = [];     // данные после фильтрации
const charts = {};     // все инстансы Chart.js

const PALETTE = [
    '#1C2E4A', '#52677D', '#2E7D52', '#B23A3A', '#8A6D3B',
    '#3B5A8A', '#6B4C9A', '#2A7F8A', '#A85A3B', '#4A6B3B'
];

/* ---------- УТИЛИТЫ ---------- */

const fmt = n => new Intl.NumberFormat('ru-RU').format(n);

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

function parseDate(str) {
    if (!str) return null;
    const parts = str.split('.');
    if (parts.length === 3) {
        return new Date(+parts[2], +parts[1] - 1, +parts[0]);
    }
    return null;
}

function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

/* ---------- ЗАГРУЗКА ---------- */

async function loadData() {
    try {
        const res = await fetch('data.json');
        RAW = await res.json();
        FILTERED = [...RAW];
        buildFilters();
        renderAll();
    } catch (e) {
        console.error(e);
        document.getElementById('panels').innerText = 'Ошибка загрузки данных.';
    }
}

/* ---------- ФИЛЬТРЫ ---------- */

function buildFilters() {
    const themes = [...new Set(RAW.map(r => r.theme).filter(Boolean))].sort();
    const cities = [...new Set(RAW.map(r => r.city).filter(Boolean))].sort();
    const subs = [...new Set(RAW.map(r => r.subtheme).filter(Boolean))].sort();

    const tSel = document.getElementById('fTheme');
    const cSel = document.getElementById('fCity');
    const sSel = document.getElementById('fSub');

    themes.forEach(t => {
        const o = document.createElement('option');
        o.value = t; o.textContent = t.length > 60 ? t.slice(0, 60) + '…' : t;
        o.title = t;
        tSel.appendChild(o);
    });
    cities.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        cSel.appendChild(o);
    });
    subs.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        sSel.appendChild(o);
    });
}

function applyFilters() {
    const theme = document.getElementById('fTheme').value;
    const city = document.getElementById('fCity').value;
    const sub = document.getElementById('fSub').value;
    const from = document.getElementById('fFrom').value;
    const to = document.getElementById('fTo').value;
    const search = document.getElementById('fSearch').value.trim().toLowerCase();
    const fileF = document.getElementById('fFile').value;

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
    showToast(`Найдено: ${FILTERED.length} из ${RAW.length}`);
}

function resetFilters() {
    document.querySelectorAll('.filters select, .filters input').forEach(el => el.value = '');
    FILTERED = [...RAW];
    renderAll();
    showToast('Фильтры сброшены');
}

/* ---------- СТАТИСТИКА ---------- */

function computeStats() {
    const total = FILTERED.length;
    const withFile = FILTERED.filter(r => r.file && r.file.trim()).length;
    const processed = FILTERED.filter(r => r.status && r.status.trim()).length;

    const byTheme = {};
    const byCity = {};
    const bySub = {};
    const byDate = {};

    FILTERED.forEach(r => {
        byTheme[r.theme] = (byTheme[r.theme] || 0) + 1;
        byCity[r.city] = (byCity[r.city] || 0) + 1;
        bySub[r.subtheme] = (bySub[r.subtheme] || 0) + 1;
        if (r.date) byDate[r.date] = (byDate[r.date] || 0) + 1;
    });

    // Динамика по датам (отсортированные)
    const dates = Object.keys(byDate).sort((a, b) => {
        const da = parseDate(a), db = parseDate(b);
        return (da || 0) - (db || 0);
    });

    // Кумулятивная динамика
    let cumulative = 0;
    const cumulativeData = dates.map(d => {
        cumulative += byDate[d];
        return cumulative;
    });

    return {
        total,
        withFile,
        processed,
        themes: Object.keys(byTheme).length,
        cities: Object.keys(byCity).length,
        subs: Object.keys(bySub).length,
        byTheme,
        byCity,
        bySub,
        byDate,
        dates,
        cumulativeData
    };
}

/* ---------- KPI ---------- */

function renderKPI() {
    const s = computeStats();
    const pct = s.total ? Math.round(s.processed / s.total * 100) : 0;

    const cards = [
        { label: 'Всего инициатив', value: fmt(s.total), small: false },
        { label: 'Уникальных тем', value: fmt(s.themes), small: false },
        { label: 'Городов / районов', value: fmt(s.cities), small: false },
        { label: 'Подтем', value: fmt(s.subs), small: false },
        { label: 'С документом', value: fmt(s.withFile), small: false },
        { label: 'Обработано', value: pct + '%', small: false }
    ];

    document.getElementById('kpiGrid').innerHTML = cards.map(c => `
        <div class="kpi-card">
            <div class="label">${c.label}</div>
            <div class="value ${c.small ? 'small' : ''}">${c.value}</div>
        </div>
    `).join('');
}

/* ---------- ГРАФИКИ ---------- */

function destroyCharts() {
    Object.values(charts).forEach(c => c && c.destroy());
}

function shorten(str, n = 40) {
    return str.length > n ? str.slice(0, n) + '…' : str;
}

function renderCharts() {
    const s = computeStats();
    destroyCharts();

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#1C2E4A';

    /* 1. По темам */
    const themeLabels = Object.keys(s.byTheme).map(t => shorten(t, 35));
    const themeData = Object.values(s.byTheme);

    charts.themes = new Chart(document.getElementById('chartThemes'), {
        type: 'bar',
        data: {
            labels: themeLabels,
            datasets: [{
                label: 'Инициатив',
                data: themeData,
                backgroundColor: PALETTE[0],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => Object.keys(s.byTheme)[items[0].dataIndex]
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { font: { size: 11 } } }
            }
        }
    });

    /* 2. Топ городов */
    const cityEntries = Object.entries(s.byCity).sort((a, b) => b[1] - a[1]).slice(0, 10);
    charts.cities = new Chart(document.getElementById('chartCities'), {
        type: 'bar',
        data: {
            labels: cityEntries.map(e => e[0]),
            datasets: [{
                label: 'Инициатив',
                data: cityEntries.map(e => e[1]),
                backgroundColor: PALETTE[1],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { font: { size: 11 } } }
            }
        }
    });

    /* 3. Динамика */
    charts.timeline = new Chart(document.getElementById('chartTimeline'), {
        type: 'line',
        data: {
            labels: s.dates,
            datasets: [
                {
                    label: 'Новых в день',
                    data: s.dates.map(d => s.byDate[d]),
                    borderColor: PALETTE[2],
                    backgroundColor: 'rgba(46, 125, 82, 0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3
                },
                {
                    label: 'Накопительно',
                    data: s.cumulativeData,
                    borderColor: PALETTE[3],
                    backgroundColor: 'rgba(178, 58, 58, 0.1)',
                    fill: false,
                    tension: 0.3,
                    borderDash: [5, 5],
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 } },
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });

    /* 4. Подтемы (doughnut) */
    const subEntries = Object.entries(s.bySub).sort((a, b) => b[1] - a[1]);
    const topSubs = subEntries.slice(0, 8);
    const otherSum = subEntries.slice(8).reduce((a, e) => a + e[1], 0);
    const subLabels = topSubs.map(e => e[0]);
    const subData = topSubs.map(e => e[1]);
    if (otherSum > 0) {
        subLabels.push('Прочее');
        subData.push(otherSum);
    }

    charts.subthemes = new Chart(document.getElementById('chartSubthemes'), {
        type: 'doughnut',
        data: {
            labels: subLabels,
            datasets: [{
                data: subData,
                backgroundColor: PALETTE,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, font: { size: 11 } }
                }
            }
        }
    });
}

/* ---------- ТАБЛИЦА ---------- */

function renderTable() {
    const thead = document.querySelector('#dataTable thead tr');
    const tbody = document.querySelector('#dataTable tbody');

    thead.innerHTML = `
        <th>Дата</th>
        <th>Город</th>
        <th>Тема</th>
        <th>Подтема</th>
        <th>Текст</th>
        <th>Статус</th>
        <th>Файл</th>
    `;

    tbody.innerHTML = FILTERED.map(r => {
        const f = r.file && r.file.trim()
            ? `<a href="${r.file}" target="_blank" style="color:#1C2E4A;">📄</a>`
            : '—';
        const text = (r.text || '').length > 140
            ? r.text.slice(0, 140) + '…'
            : (r.text || '');
        return `
            <tr>
                <td style="white-space:nowrap;">${r.date || '—'} ${r.time || ''}</td>
                <td>${r.city || '—'}</td>
                <td>${shorten(r.theme || '—', 50)}</td>
                <td>${r.subtheme || '—'}</td>
                <td>${text}</td>
                <td>${r.status || '—'}</td>
                <td>${f}</td>
            </tr>
        `;
    }).join('');
}

/* ---------- ВКЛАДКИ ПО ТЕМАМ (старый функционал) ---------- */

function renderTabs() {
    const structured
