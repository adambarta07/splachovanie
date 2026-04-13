const SHEET_ID = "10SkH1lLlO-pF1v_WwDpeD_XJLNLAoFEglbJS7TIZY5A";
const SHEET_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const SETTINGS_API_URL = "https://script.google.com/macros/s/AKfycby_bMVJtbv9SqbZETuUeP-0JpqagrpwfD8BHFk20k-346yePXBcgszWC-NktQEmMQjF/exec";

let currentTheme = localStorage.getItem('theme') || 'light';
let isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
let devicesMenuOpen = localStorage.getItem('devicesMenuOpen') !== 'false';
let globalQuickFilter = localStorage.getItem('globalQuickFilter') || '7';

let allFetchedRows = [];
let devices = [];
let selectedDeviceId = localStorage.getItem('selectedDeviceId') || null;
let currentFilteredRows = [];
let chart = null;

let deviceSettingsMap = {};

const edgeLinePlugin = {
    id: 'edgeLine',
    afterDraw(chartInstance) {
        const avgValue = chartInstance.options.plugins.edgeLine?.avgValue;
        if (avgValue === undefined || avgValue === null || avgValue === 0) return;

        const { ctx, chartArea, scales } = chartInstance;
        if (!chartArea || !scales?.y) return;

        const yPos = scales.y.getPixelForValue(avgValue);
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(chartArea.left, yPos);
        ctx.lineTo(chartArea.right, yPos);
        ctx.stroke();
        ctx.restore();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    bindEvents();
    updateAll();
    setInterval(updateAll, 60000);
});

function initializeUI() {
    if (isCollapsed) document.body.classList.add('collapsed');
    document.body.setAttribute('data-theme', currentTheme);

    const sheetIdDisplay = document.getElementById('sheetIdDisplay');
    if (sheetIdDisplay) sheetIdDisplay.value = SHEET_ID;

    const globalQuickFilterInput = document.getElementById('globalQuickFilterInput');
    if (globalQuickFilterInput) globalQuickFilterInput.value = globalQuickFilter;

    const deviceSubmenu = document.getElementById('deviceSubmenu');
    if (deviceSubmenu) deviceSubmenu.classList.toggle('hidden', !devicesMenuOpen);
}

function bindEvents() {
    document.getElementById('toggleSidebarBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('menu-devices-root')?.addEventListener('click', toggleDevicesMenu);
    document.getElementById('menu-settings-global')?.addEventListener('click', showGlobalSettings);
    document.getElementById('menu-settings-device')?.addEventListener('click', () => showDeviceSettings());
    document.getElementById('backToDevicesBtn')?.addEventListener('click', showDevicesList);
    document.getElementById('openDeviceSettingsBtn')?.addEventListener('click', () => showDeviceSettings(selectedDeviceId));
    document.getElementById('applyDateFilterBtn')?.addEventListener('click', () => applyDateFilter(false));
    document.getElementById('toggleThemeBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('saveGlobalSettingsBtn')?.addEventListener('click', saveGlobalSettings);
    document.getElementById('saveDeviceSettingsBtn')?.addEventListener('click', saveCurrentDeviceSettings);
    document.getElementById('backToDeviceDetailBtn')?.addEventListener('click', () => {
        if (selectedDeviceId) showDeviceDetail(selectedDeviceId);
    });

    document.getElementById('settings-device-select')?.addEventListener('change', e => {
        const deviceId = e.target.value;
        if (!deviceId) return;
        selectedDeviceId = deviceId;
        localStorage.setItem('selectedDeviceId', selectedDeviceId);
        fillCurrentDeviceSettingsForm();
    });

    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            setQuickFilter(Number(btn.dataset.days), btn);
        });
    });
}

function showToast(message, success = true) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.style.backgroundColor = success ? 'var(--color-success)' : 'var(--color-danger)';
    toast.className = "show";

    setTimeout(() => {
        toast.className = toast.className.replace("show", "");
    }, 2500);
}

function toggleSidebar() {
    document.body.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', document.body.classList.contains('collapsed'));

    setTimeout(() => {
        if (chart) chart.resize();
    }, 300);
}

function clearActiveMenu() {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.submenu-btn').forEach(b => b.classList.remove('active'));
}

function setRootMenuActive(rootId) {
    clearActiveMenu();
    const el = document.getElementById(rootId);
    if (el) el.classList.add('active');
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
}

function parseGViz(text) {
    const jsonText = text.replace(/^[\s\S]*?setResponse\(|\);?\s*$/g, '');
    return JSON.parse(jsonText);
}

function normalizeType(type) {
    type = String(type || '').toLowerCase().trim();
    return type.includes("mal") || type === "m" ? "male" : "velke";
}

function parseInputDate(str) {
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d) ? null : d;
}

function parseDateSafe(value) {
    if (!value) return null;

    if (value instanceof Date) {
        const copy = new Date(value);
        copy.setHours(0, 0, 0, 0);
        return isNaN(copy) ? null : copy;
    }

    if (typeof value === 'string' && value.startsWith('Date(')) {
        const nums = value.match(/\d+/g);
        if (!nums || nums.length < 3) return null;
        const parsed = new Date(Number(nums[0]), Number(nums[1]), Number(nums[2]));
        parsed.setHours(0, 0, 0, 0);
        return isNaN(parsed) ? null : parsed;
    }

    const parsed = new Date(value);
    if (isNaN(parsed)) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

function formatDateSK(dateValue) {
    const d = parseDateSafe(dateValue);
    return d ? d.toLocaleDateString('sk-SK').replace(/\s/g, '') : '';
}

function formatDateTimeSK(dateValue, timeValue = '') {
    const datePart = formatDateSK(dateValue);
    return [datePart, timeValue].filter(Boolean).join(' ');
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function voltageToPercent(voltage) {
    if (voltage == null || isNaN(voltage)) return null;
    const min = 3.0;
    const max = 4.2;
    const percent = ((voltage - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
}

function getBatteryClass(percent) {
    if (percent == null) return 'fill-low';
    if (percent >= 60) return 'fill-good';
    if (percent >= 25) return 'fill-mid';
    return 'fill-low';
}

function rowToDateTime(row) {
    const date = parseDateSafe(row.date);
    if (!date) return null;

    const result = new Date(date);
    const parts = String(row.time || '').trim().split(':');

    if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parts.length >= 3 ? parseInt(parts[2], 10) : 0;

        result.setHours(
            isNaN(hours) ? 0 : hours,
            isNaN(minutes) ? 0 : minutes,
            isNaN(seconds) ? 0 : seconds,
            0
        );
    } else {
        result.setHours(0, 0, 0, 0);
    }

    return result;
}

function compareRows(a, b) {
    const da = rowToDateTime(a);
    const db = rowToDateTime(b);

    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;

    return da - db;
}

/* ===== DEVICES SETTINGS FROM GOOGLE SHEET ===== */

async function loadDeviceSettingsFromSheet() {
    if (!SETTINGS_API_URL || SETTINGS_API_URL.includes("SEM_VLOZ")) {
        throw new Error("Nie je nastavené SETTINGS_API_URL.");
    }

    const resp = await fetch(SETTINGS_API_URL, { method: 'GET' });

    if (!resp.ok) {
        throw new Error(`Nepodarilo sa načítať device settings. HTTP ${resp.status}`);
    }

    const rows = await resp.json();
    deviceSettingsMap = {};

    if (!Array.isArray(rows)) return;

    rows.forEach(row => {
        const deviceId = String(row.deviceId || '').trim();
        if (!deviceId) return;

        deviceSettingsMap[deviceId] = {
            name: row.name || deviceId,
            objemMale: row.objemMale,
            objemVelke: row.objemVelke,
            building: row.building || '',
            note: row.note || ''
        };
    });
}

function getDeviceConfig(deviceId) {
    const cfg = deviceSettingsMap[deviceId] || {};
    return {
        name: cfg.name || deviceId,
        objemMale: Number(cfg.objemMale) > 0 ? Number(cfg.objemMale) : 3,
        objemVelke: Number(cfg.objemVelke) > 0 ? Number(cfg.objemVelke) : 6,
        building: cfg.building || '',
        note: cfg.note || ''
    };
}

async function saveDeviceConfig(deviceId, config) {
    if (!SETTINGS_API_URL || SETTINGS_API_URL.includes("SEM_VLOZ")) {
        throw new Error("Nie je nastavené SETTINGS_API_URL.");
    }

    const payload = {
        deviceId,
        name: config.name,
        objemMale: config.objemMale,
        objemVelke: config.objemVelke,
        building: config.building,
        note: config.note
    };

    const resp = await fetch(SETTINGS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        throw new Error(`Uloženie zlyhalo. HTTP ${resp.status}`);
    }

    const result = await resp.json();

    if (!result.success) {
        throw new Error(result.error || 'Nepodarilo sa uložiť nastavenia.');
    }

    deviceSettingsMap[deviceId] = { ...payload };
}

/* ===== DEVICES / UI ===== */

function buildDevices(rows) {
    const grouped = {};

    rows.forEach(row => {
        const id = String(row.deviceId || '').trim();
        if (!id) return;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(row);
    });

    Object.values(grouped).forEach(list => list.sort(compareRows));

    return Object.keys(grouped).sort().map(id => {
        const deviceRows = grouped[id];
        const cfg = getDeviceConfig(id);

        let maleCount = 0;
        let velkeCount = 0;
        let totalLiters = 0;

        deviceRows.forEach(r => {
            const type = normalizeType(r.type);
            if (type === 'male') {
                maleCount++;
                totalLiters += cfg.objemMale;
            } else {
                velkeCount++;
                totalLiters += cfg.objemVelke;
            }
        });

        const latestRow = deviceRows[deviceRows.length - 1] || null;
        const latestBattery = latestRow?.battery ?? null;

        return {
            id,
            name: cfg.name,
            building: cfg.building,
            note: cfg.note,
            objemMale: cfg.objemMale,
            objemVelke: cfg.objemVelke,
            rows: deviceRows,
            latestBattery,
            batteryPercent: voltageToPercent(latestBattery),
            lastSeenDate: latestRow?.date || null,
            lastSeenTime: latestRow?.time || '',
            stats: {
                male: maleCount,
                velke: velkeCount,
                total: maleCount + velkeCount,
                liters: totalLiters
            }
        };
    });
}

function ensureSelectedDevice() {
    if (!devices.length) {
        selectedDeviceId = null;
        localStorage.removeItem('selectedDeviceId');
        return null;
    }

    const exists = devices.some(d => d.id === selectedDeviceId);
    if (!selectedDeviceId || !exists) {
        selectedDeviceId = devices[0].id;
        localStorage.setItem('selectedDeviceId', selectedDeviceId);
    }
    return selectedDeviceId;
}

function getSelectedDevice() {
    return devices.find(d => d.id === selectedDeviceId) || null;
}

function getDeviceFilterKey(deviceId) {
    return `deviceFilter_${deviceId}`;
}

function saveDeviceFilter(deviceId, data) {
    localStorage.setItem(getDeviceFilterKey(deviceId), JSON.stringify(data));
}

function loadDeviceFilter(deviceId) {
    try {
        return JSON.parse(localStorage.getItem(getDeviceFilterKey(deviceId)) || 'null');
    } catch {
        return null;
    }
}

function renderDeviceSubmenu() {
    const submenu = document.getElementById('deviceSubmenu');
    if (!submenu) return;

    submenu.classList.toggle('hidden', !devicesMenuOpen);
    submenu.innerHTML = '';

    devices.forEach(device => {
        const btn = document.createElement('button');
        btn.className = 'submenu-btn';
        btn.dataset.deviceId = device.id;
        btn.innerHTML = `
            ${escapeHtml(device.name)}
            <span class="submenu-meta">${escapeHtml(device.id)}</span>
        `;
        btn.addEventListener('click', () => showDeviceDetail(device.id));
        submenu.appendChild(btn);
    });
}

function updateSubmenuActive(deviceId) {
    document.querySelectorAll('.submenu-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.deviceId === deviceId);
    });
}

function populateDeviceSettingsSelect() {
    const select = document.getElementById('settings-device-select');
    if (!select) return;

    select.innerHTML = '';

    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = `${device.name} (${device.id})`;
        if (device.id === selectedDeviceId) option.selected = true;
        select.appendChild(option);
    });
}

function toggleDevicesMenu() {
    devicesMenuOpen = !devicesMenuOpen;
    localStorage.setItem('devicesMenuOpen', String(devicesMenuOpen));
    renderDeviceSubmenu();
    showDevicesList();
}

function renderDevicesList() {
    const totalFlushes = devices.reduce((sum, d) => sum + d.stats.total, 0);
    const totalLiters = devices.reduce((sum, d) => sum + d.stats.liters, 0);

    document.getElementById('devicesCount').textContent = devices.length;
    document.getElementById('devicesTotalFlushes').textContent = totalFlushes;
    document.getElementById('devicesTotalLiters').textContent = totalLiters.toFixed(0) + ' L';

    const grid = document.getElementById('devicesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!devices.length) {
        grid.innerHTML = `<div class="empty-state">Zatiaľ neboli načítané žiadne zariadenia.</div>`;
        return;
    }

    devices.forEach(device => {
        const batteryPercent = device.batteryPercent;
        const batteryVoltage = device.latestBattery != null ? `${Number(device.latestBattery).toFixed(2)} V` : '—';
        const lastSeen = device.lastSeenDate ? formatDateTimeSK(device.lastSeenDate, device.lastSeenTime) : '—';

        const card = document.createElement('div');
        card.className = 'device-card';
        card.innerHTML = `
            <h3>${escapeHtml(device.name)}</h3>
            <div class="device-id">ID: ${escapeHtml(device.id)}</div>
            ${device.building ? `<div class="muted" style="margin-bottom:8px;">Budova: ${escapeHtml(device.building)}</div>` : ''}

            <div class="device-metrics">
                <div class="device-metric-line">
                    <span>Batéria</span>
                    <span>${batteryVoltage}${batteryPercent != null ? ` (${batteryPercent}%)` : ''}</span>
                </div>

                <div class="battery-wrap">
                    <div class="battery-bar">
                        <div class="battery-fill ${getBatteryClass(batteryPercent)}" style="width:${batteryPercent ?? 0}%"></div>
                    </div>
                </div>

                <div class="device-metric-line">
                    <span>Posledná aktivita</span>
                    <span>${escapeHtml(lastSeen)}</span>
                </div>

                <div class="device-metric-line">
                    <span>Malé spláchnutia</span>
                    <span>${device.stats.male}</span>
                </div>

                <div class="device-metric-line">
                    <span>Veľké spláchnutia</span>
                    <span>${device.stats.velke}</span>
                </div>

                <div class="device-metric-line">
                    <span>Spotreba</span>
                    <span>${device.stats.liters.toFixed(0)} L</span>
                </div>
            </div>

            <div class="inline-actions">
                <button class="btn-primary open-device-btn">Otvoriť detail</button>
                <button class="btn-secondary open-device-settings-btn">Nastavenia</button>
            </div>
        `;

        card.querySelector('.open-device-btn')?.addEventListener('click', () => showDeviceDetail(device.id));
        card.querySelector('.open-device-settings-btn')?.addEventListener('click', () => showDeviceSettings(device.id));

        grid.appendChild(card);
    });
}

function showDevicesList() {
    setRootMenuActive('menu-devices-root');
    showSection('section-devices-list');
    renderDevicesList();
    updateSubmenuActive('');
}

function fillDeviceDetailHeader(device) {
    document.getElementById('deviceTitle').textContent = device.name;
    document.getElementById('deviceSubtitle').textContent =
        `ID: ${device.id}${device.building ? ` · Budova: ${device.building}` : ''}`;

    document.getElementById('deviceBatteryInfo').textContent =
        device.latestBattery != null
            ? `${Number(device.latestBattery).toFixed(2)} V${device.batteryPercent != null ? ` (${device.batteryPercent}%)` : ''}`
            : '—';

    document.getElementById('deviceLastSeen').textContent =
        device.lastSeenDate ? formatDateTimeSK(device.lastSeenDate, device.lastSeenTime) : '—';

    document.getElementById('deviceLitersInfo').textContent = `${device.objemMale} / ${device.objemVelke} L`;
    document.getElementById('label-male').textContent = `Malé (${device.objemMale}L)`;
    document.getElementById('label-velke').textContent = `Veľké (${device.objemVelke}L)`;
}

function setQuickFilter(days, btn) {
    const device = getSelectedDevice();
    if (!device) return;

    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    globalQuickFilter = String(days);
    localStorage.setItem('globalQuickFilter', globalQuickFilter);

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    const from = start.toLocaleDateString('sv-SE');
    const to = end.toLocaleDateString('sv-SE');

    document.getElementById('dateFrom').value = from;
    document.getElementById('dateTo').value = to;

    saveDeviceFilter(device.id, {
        type: 'quick',
        quickDays: String(days),
        dateFrom: from,
        dateTo: to
    });

    applyDateFilter(true);
}

function applyDateFilter(isQuick = false) {
    const device = getSelectedDevice();
    if (!device) return;

    if (!isQuick) {
        document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    }

    const fv = document.getElementById('dateFrom')?.value || '';
    const tv = document.getElementById('dateTo')?.value || '';

    const fromDate = fv ? parseInputDate(fv) : new Date(2000, 0, 1);
    const toDate = tv ? parseInputDate(tv) : new Date();

    if (!fromDate || !toDate) {
        showToast('Neplatný rozsah dátumov', false);
        return;
    }

    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const filtered = device.rows.filter(r => {
        const d = parseDateSafe(r.date);
        return d && d >= fromDate && d <= toDate;
    });

    currentFilteredRows = filtered;
    populateDeviceDetail(filtered);

    saveDeviceFilter(device.id, {
        type: isQuick ? 'quick' : 'custom',
        quickDays: isQuick ? globalQuickFilter : null,
        dateFrom: fv,
        dateTo: tv
    });
}

function aggregateByDate(rows, startVal, endVal, deviceConfig) {
    const agg = {};
    if (!startVal || !endVal) return { labels: [], male: [], velke: [] };

    let start = parseInputDate(startVal);
    let end = parseInputDate(endVal);
    if (!start || !end) return { labels: [], male: [], velke: [] };

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    let curr = new Date(start);
    while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        agg[`${y}-${m}-${d}`] = { male: 0, velke: 0 };
        curr.setDate(curr.getDate() + 1);
    }

    rows.forEach(r => {
        const d = parseDateSafe(r.date);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!agg[key]) return;
        agg[key][normalizeType(r.type)]++;
    });

    const keys = Object.keys(agg).sort();

    return {
        labels: keys,
        male: keys.map(k => agg[k].male * deviceConfig.objemMale),
        velke: keys.map(k => agg[k].velke * deviceConfig.objemVelke)
    };
}

function getDayShort(dateStr) {
    const d = new Date(dateStr);
    const days = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
    return days[d.getDay()];
}

function populateDeviceDetail(rows) {
    const device = getSelectedDevice();
    if (!device) return;

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    const textColor = isDark ? '#97a1af' : '#667085';

    let cM = 0;
    let cV = 0;
    let litTotal = 0;

    rows.slice().reverse().forEach((r, idx) => {
        const type = normalizeType(r.type);
        const lit = type === 'male' ? device.objemMale : device.objemVelke;

        if (idx < 150) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDateSK(r.date)}</td>
                <td>${escapeHtml(r.time || '')}</td>
                <td>${type === 'male' ? 'M' : 'V'}</td>
                <td>${lit}</td>
                <td>${r.battery != null && !isNaN(r.battery) ? Number(r.battery).toFixed(2) + ' V' : '—'}</td>
            `;
            tbody.appendChild(tr);
        }

        if (type === 'male') cM++;
        else cV++;

        litTotal += lit;
    });

    document.getElementById('countMale').textContent = cM;
    document.getElementById('countVelke').textContent = cV;
    document.getElementById('countTotal').textContent = cM + cV;
    document.getElementById('totalLiters').textContent = litTotal.toFixed(0) + ' L';

    const dateFrom = document.getElementById('dateFrom')?.value || '';
    const dateTo = document.getElementById('dateTo')?.value || '';
    const agg = aggregateByDate(rows, dateFrom, dateTo, device);

    const dailyTotals = agg.male.map((val, i) => val + agg.velke[i]);
    const daysCount = agg.labels.length || 1;
    const avg = litTotal / daysCount;

    document.getElementById('avgLiters').textContent = avg.toFixed(1) + ' L';

    const maxVal = Math.max(...dailyTotals, avg, 5);
    const chartMax = Math.ceil((maxVal * 1.2) / 5) * 5;

    const canvas = document.getElementById('chart');
    const ctx = canvas.getContext('2d');
    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        plugins: [edgeLinePlugin],
        data: {
            labels: agg.labels.map(l => {
                const d = new Date(l);
                const day = d.getDate();
                const month = d.getMonth() + 1;
                const dayShort = getDayShort(l);

                return [`${day}.${month}.`, dayShort];
            }),
            datasets: [
                {
                    type: 'bar',
                    label: 'Malé',
                    data: agg.male,
                    backgroundColor: '#2563eb'
                },
                {
                    type: 'bar',
                    label: 'Veľké',
                    data: agg.velke,
                    backgroundColor: '#93c5fd'
                },
                {
                    type: 'line',
                    label: 'Priemer',
                    data: [],
                    borderColor: '#dc2626',
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        color: textColor,
                        font: { size: 11 }
                    }
                },
                edgeLine: {
                    avgValue: avg
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 10 }
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: chartMax,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function showDeviceDetail(deviceId) {
    selectedDeviceId = deviceId;
    localStorage.setItem('selectedDeviceId', selectedDeviceId);

    const device = getSelectedDevice();
    if (!device) return;

    setRootMenuActive('menu-devices-root');
    showSection('section-device-detail');
    updateSubmenuActive(deviceId);
    fillDeviceDetailHeader(device);

    const savedFilter = loadDeviceFilter(deviceId);
    const quickValue = savedFilter?.quickDays || globalQuickFilter || '7';

    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));

    document.getElementById('dateFrom').value = savedFilter?.dateFrom || '';
    document.getElementById('dateTo').value = savedFilter?.dateTo || '';

    if (savedFilter?.type === 'quick') {
        const btn = document.querySelector(`.btn-filter[data-days="${quickValue}"]`);
        if (btn) {
            setQuickFilter(Number(quickValue), btn);
            return;
        }
    }

    if (savedFilter?.dateFrom && savedFilter?.dateTo) {
        applyDateFilter(false);
        return;
    }

    const btn = document.querySelector(`.btn-filter[data-days="${globalQuickFilter}"]`) ||
                document.querySelector(`.btn-filter[data-days="7"]`);
    if (btn) setQuickFilter(Number(btn.dataset.days), btn);
}

function showGlobalSettings() {
    setRootMenuActive('menu-settings-global');
    showSection('section-settings-global');
    document.getElementById('globalQuickFilterInput').value = globalQuickFilter;
    document.getElementById('sheetIdDisplay').value = SHEET_ID;
}

function saveGlobalSettings() {
    globalQuickFilter = document.getElementById('globalQuickFilterInput')?.value || '7';
    localStorage.setItem('globalQuickFilter', globalQuickFilter);
    showToast('Globálne nastavenia uložené ✅');
}

function fillDeviceSettingsForm(device) {
    if (!device) return;

    document.getElementById('cfg-device-name').value = device.name;
    document.getElementById('cfg-device-building').value = device.building || '';
    document.getElementById('cfg-device-male').value = device.objemMale;
    document.getElementById('cfg-device-velke').value = device.objemVelke;
    document.getElementById('cfg-device-note').value = device.note || '';

    document.getElementById('cfg-device-battery').value =
        device.latestBattery != null
            ? `${Number(device.latestBattery).toFixed(2)} V${device.batteryPercent != null ? ` (${device.batteryPercent}%)` : ''}`
            : '—';

    document.getElementById('cfg-device-lastseen').value =
        device.lastSeenDate ? formatDateTimeSK(device.lastSeenDate, device.lastSeenTime) : '—';

    document.getElementById('cfg-device-rowcount').value = device.rows.length;
}

function fillCurrentDeviceSettingsForm() {
    const device = getSelectedDevice();
    fillDeviceSettingsForm(device);
}

function showDeviceSettings(deviceId = null) {
    if (deviceId) {
        selectedDeviceId = deviceId;
        localStorage.setItem('selectedDeviceId', selectedDeviceId);
    } else {
        ensureSelectedDevice();
    }

    const device = getSelectedDevice();
    if (!device) {
        showToast('Nie je dostupné žiadne zariadenie.', false);
        return;
    }

    setRootMenuActive('menu-settings-device');
    showSection('section-settings-device');
    populateDeviceSettingsSelect();
    fillDeviceSettingsForm(device);
}

async function saveCurrentDeviceSettings() {
    const device = getSelectedDevice();
    if (!device) return;

    const name = document.getElementById('cfg-device-name')?.value.trim() || device.id;
    const building = document.getElementById('cfg-device-building')?.value.trim() || '';
    const note = document.getElementById('cfg-device-note')?.value.trim() || '';
    const objemMale = parseFloat(document.getElementById('cfg-device-male')?.value);
    const objemVelke = parseFloat(document.getElementById('cfg-device-velke')?.value);

    if (isNaN(objemMale) || objemMale <= 0 || isNaN(objemVelke) || objemVelke <= 0) {
        showToast('Zadaj platné litre pre malé aj veľké spláchnutie.', false);
        return;
    }

    try {
        await saveDeviceConfig(device.id, {
            name,
            building,
            note,
            objemMale,
            objemVelke
        });

        devices = buildDevices(allFetchedRows);
        ensureSelectedDevice();
        renderDeviceSubmenu();
        populateDeviceSettingsSelect();
        updateSubmenuActive(device.id);
        showToast('Nastavenia zariadenia uložené ✅');
        showDeviceDetail(device.id);
    } catch (err) {
        console.error(err);
        showToast(`Uloženie zlyhalo: ${err.message}`, false);
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);

    if (document.getElementById('section-device-detail')?.classList.contains('active')) {
        populateDeviceDetail(currentFilteredRows);
    }
}

async function updateAll() {
    const container = document.getElementById('lastUpdateContainer');
    if (container) container.classList.add('loading');

    try {
        await loadDeviceSettingsFromSheet();

        const resp = await fetch(SHEET_GVIZ_URL);
        if (!resp.ok) {
            throw new Error(`Nepodarilo sa načítať logy. HTTP ${resp.status}`);
        }

        const gv = parseGViz(await resp.text());

        allFetchedRows = (gv.table.rows || [])
            .map(r => ({
                date: r.c[0]?.v || null,
                time: r.c[1]?.v || '',
                type: r.c[2]?.v || '',
                deviceId: String(r.c[3]?.v || '').trim(),
                battery: r.c[4]?.v != null && r.c[4]?.v !== '' ? parseFloat(r.c[4]?.v) : null
            }))
            .filter(row => row.deviceId);

        allFetchedRows.sort(compareRows);
        devices = buildDevices(allFetchedRows);
        ensureSelectedDevice();
        renderDeviceSubmenu();
        populateDeviceSettingsSelect();

        if (document.getElementById('section-settings-global')?.classList.contains('active')) {
            showGlobalSettings();
        } else if (document.getElementById('section-settings-device')?.classList.contains('active')) {
            showDeviceSettings(selectedDeviceId);
        } else if (document.getElementById('section-device-detail')?.classList.contains('active') && selectedDeviceId) {
            showDeviceDetail(selectedDeviceId);
        } else {
            showDevicesList();
        }

        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = `Aktuálne: ${new Date().toLocaleString('sk-SK')}`;
        }
    } catch (err) {
        console.error(err);

        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) lastUpdate.textContent = "Chyba načítania";

        showToast(`Nepodarilo sa načítať dáta: ${err.message}`, false);
    } finally {
        if (container) container.classList.remove('loading');
    }
}