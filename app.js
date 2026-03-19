const SHEET_ID = "10SkH1lLlO-pF1v_WwDpeD_XJLNLAoFEglbJS7TIZY5A";
const SHEET_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const SETTINGS_API_URL = "https://script.google.com/macros/s/AKfycbxSWa-6TrdmombKg4nRUtYncO5gh55eS_TUDVW_0ncRwmXq18iPcKfCEAuoNXWLxtai/exec";

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
        ctx.strokeStyle = '#ef4444';
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
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', toggleSidebar);

    const menuDevicesRoot = document.getElementById('menu-devices-root');
    if (menuDevicesRoot) menuDevicesRoot.addEventListener('click', toggleDevicesMenu);

    const menuSettingsGlobal = document.getElementById('menu-settings-global');
    if (menuSettingsGlobal) menuSettingsGlobal.addEventListener('click', showGlobalSettings);

    const menuSettingsDevice = document.getElementById('menu-settings-device');
    if (menuSettingsDevice) menuSettingsDevice.addEventListener('click', () => showDeviceSettings());

    const backToDevicesBtn = document.getElementById('backToDevicesBtn');
    if (backToDevicesBtn) backToDevicesBtn.addEventListener('click', showDevicesList);

    const openDeviceSettingsBtn = document.getElementById('openDeviceSettingsBtn');
    if (openDeviceSettingsBtn) openDeviceSettingsBtn.addEventListener('click', () => showDeviceSettings());

    const applyDateFilterBtn = document.getElementById('applyDateFilterBtn');
    if (applyDateFilterBtn) applyDateFilterBtn.addEventListener('click', () => applyDateFilter(false));

    const toggleThemeBtn = document.getElementById('toggleThemeBtn');
    if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', toggleTheme);

    const saveGlobalSettingsBtn = document.getElementById('saveGlobalSettingsBtn');
    if (saveGlobalSettingsBtn) saveGlobalSettingsBtn.addEventListener('click', saveGlobalSettings);

    const saveDeviceSettingsBtn = document.getElementById('saveDeviceSettingsBtn');
    if (saveDeviceSettingsBtn) saveDeviceSettingsBtn.addEventListener('click', saveCurrentDeviceSettings);

    const backToDeviceDetailBtn = document.getElementById('backToDeviceDetailBtn');
    if (backToDeviceDetailBtn) {
        backToDeviceDetailBtn.addEventListener('click', () => {
            if (selectedDeviceId) showDeviceDetail(selectedDeviceId);
        });
    }

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
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
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

function compareRows(a, b) {
    const da = parseDateSafe(a.date);
    const db = parseDateSafe(b.date);

    if (da && db) {
        const diff = da - db;
        if (diff !== 0) return diff;
    }

    return String(a.time || '').localeCompare(String(b.time || ''));
}

/* ===== DEVICES SETTINGS FROM GOOGLE SHEET ===== */

async function loadDeviceSettingsFromSheet() {
    if (!SETTINGS_API_URL || SETTINGS_API_URL.includes("SEM_VLOZ")) {
        throw new Error("Nie je nastavené SETTINGS_API_URL.");
    }

    const resp = await fetch(SETTINGS_API_URL, {
        method: 'GET'
    });

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
        const id = String(row.deviceId || 'nezname-zariadenie').trim();
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

function toggleDevicesMenu() {
    devicesMenuOpen = !devicesMenuOpen;
    localStorage.setItem('devicesMenuOpen', String(devicesMenuOpen));
    renderDeviceSubmenu();
    showDevicesList();
}

function renderDevicesList() {
    const totalFlushes = devices.reduce((sum, d) => sum + d.stats.total, 0);
    const totalLiters = devices.reduce((sum, d) => sum + d.stats.liters, 0);

    const devicesCount = document.getElementById('devicesCount');
    const devicesTotalFlushes = document.getElementById('devicesTotalFlushes');
    const devicesTotalLiters = document.getElementById('devicesTotalLiters');

    if (devicesCount) devicesCount.textContent = devices.length;
    if (devicesTotalFlushes) devicesTotalFlushes.textContent = totalFlushes;
    if (devicesTotalLiters) devicesTotalLiters.textContent = totalLiters.toFixed(0) + ' L';

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

        const openDetailBtn = card.querySelector('.open-device-btn');
        const openSettingsBtn = card.querySelector('.open-device-settings-btn');

        if (openDetailBtn) openDetailBtn.addEventListener('click', () => showDeviceDetail(device.id));
        if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => showDeviceSettings(device.id));

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
    const deviceTitle = document.getElementById('deviceTitle');
    const deviceSubtitle = document.getElementById('deviceSubtitle');
    const deviceBatteryInfo = document.getElementById('deviceBatteryInfo');
    const deviceLastSeen = document.getElementById('deviceLastSeen');
    const deviceLitersInfo = document.getElementById('deviceLitersInfo');
    const labelMale = document.getElementById('label-male');
    const labelVelke = document.getElementById('label-velke');

    if (deviceTitle) deviceTitle.textContent = device.name;
    if (deviceSubtitle) {
        deviceSubtitle.textContent =
            `ID: ${device.id}${device.building ? ` · Budova: ${device.building}` : ''}`;
    }

    if (deviceBatteryInfo) {
        deviceBatteryInfo.textContent =
            device.latestBattery != null
                ? `${Number(device.latestBattery).toFixed(2)} V${device.batteryPercent != null ? ` (${device.batteryPercent}%)` : ''}`
                : '—';
    }

    if (deviceLastSeen) {
        deviceLastSeen.textContent =
            device.lastSeenDate ? formatDateTimeSK(device.lastSeenDate, device.lastSeenTime) : '—';
    }

    if (deviceLitersInfo) {
        deviceLitersInfo.textContent = `${device.objemMale} / ${device.objemVelke} L`;
    }

    if (labelMale) labelMale.textContent = `Malé (${device.objemMale}L)`;
    if (labelVelke) labelVelke.textContent = `Veľké (${device.objemVelke}L)`;
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

    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    if (dateFrom) dateFrom.value = from;
    if (dateTo) dateTo.value = to;

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
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

function populateDeviceDetail(rows) {
    const device = getSelectedDevice();
    if (!device) return;

    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#9ca3af' : '#6b7280';

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

    const countMale = document.getElementById('countMale');
    const countVelke = document.getElementById('countVelke');
    const countTotal = document.getElementById('countTotal');
    const totalLiters = document.getElementById('totalLiters');
    const avgLiters = document.getElementById('avgLiters');

    if (countMale) countMale.textContent = cM;
    if (countVelke) countVelke.textContent = cV;
    if (countTotal) countTotal.textContent = cM + cV;
    if (totalLiters) totalLiters.textContent = litTotal.toFixed(0) + ' L';

    const dateFrom = document.getElementById('dateFrom')?.value || '';
    const dateTo = document.getElementById('dateTo')?.value || '';
    const agg = aggregateByDate(rows, dateFrom, dateTo, device);

    const dailyTotals = agg.male.map((val, i) => val + agg.velke[i]);
    const daysCount = agg.labels.length || 1;
    const avg = litTotal / daysCount;

    if (avgLiters) avgLiters.textContent = avg.toFixed(1) + ' L';

    const maxVal = Math.max(...dailyTotals, avg, 5);
    const chartMax = Math.ceil((maxVal * 1.2) / 5) * 5;

    const canvas = document.getElementById('chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        plugins: [edgeLinePlugin],
        data: {
            labels: agg.labels.map(l => l.split('-').slice(1).reverse().join('.')),
            datasets: [
                {
                    type: 'bar',
                    label: 'Malé',
                    data: agg.male,
                    backgroundColor: '#2563eb',
                    borderRadius: 3
                },
                {
                    type: 'bar',
                    label: 'Veľké',
                    data: agg.velke,
                    backgroundColor: '#93c5fd',
                    borderRadius: 3
                },
                {
                    type: 'line',
                    label: 'Priemer',
                    data: [],
                    borderColor: '#ef4444',
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

    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    if (dateFrom) dateFrom.value = savedFilter?.dateFrom || '';
    if (dateTo) dateTo.value = savedFilter?.dateTo || '';

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

    const globalQuickFilterInput = document.getElementById('globalQuickFilterInput');
    const sheetIdDisplay = document.getElementById('sheetIdDisplay');

    if (globalQuickFilterInput) globalQuickFilterInput.value = globalQuickFilter;
    if (sheetIdDisplay) sheetIdDisplay.value = SHEET_ID;
}

function saveGlobalSettings() {
    const globalQuickFilterInput = document.getElementById('globalQuickFilterInput');
    globalQuickFilter = globalQuickFilterInput?.value || '7';
    localStorage.setItem('globalQuickFilter', globalQuickFilter);
    showToast('Globálne nastavenia uložené ✅');
}

function fillDeviceSettingsForm(device) {
    const deviceSettingsSubtitle = document.getElementById('deviceSettingsSubtitle');
    const cfgName = document.getElementById('cfg-device-name');
    const cfgBuilding = document.getElementById('cfg-device-building');
    const cfgMale = document.getElementById('cfg-device-male');
    const cfgVelke = document.getElementById('cfg-device-velke');
    const cfgNote = document.getElementById('cfg-device-note');
    const cfgBattery = document.getElementById('cfg-device-battery');
    const cfgLastSeen = document.getElementById('cfg-device-lastseen');
    const cfgRowCount = document.getElementById('cfg-device-rowcount');

    if (deviceSettingsSubtitle) {
        deviceSettingsSubtitle.textContent =
            `Upravuješ zariadenie: ${device.name} (${device.id})`;
    }

    if (cfgName) cfgName.value = device.name;
    if (cfgBuilding) cfgBuilding.value = device.building || '';
    if (cfgMale) cfgMale.value = device.objemMale;
    if (cfgVelke) cfgVelke.value = device.objemVelke;
    if (cfgNote) cfgNote.value = device.note || '';

    if (cfgBattery) {
        cfgBattery.value =
            device.latestBattery != null
                ? `${Number(device.latestBattery).toFixed(2)} V${device.batteryPercent != null ? ` (${device.batteryPercent}%)` : ''}`
                : '—';
    }

    if (cfgLastSeen) {
        cfgLastSeen.value =
            device.lastSeenDate ? formatDateTimeSK(device.lastSeenDate, device.lastSeenTime) : '—';
    }

    if (cfgRowCount) cfgRowCount.value = device.rows.length;
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
        renderDeviceSubmenu();
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
        /* 1. načítaj nastavenia zariadení z Devices */
        await loadDeviceSettingsFromSheet();

        /* 2. načítaj logy */
        const resp = await fetch(SHEET_GVIZ_URL);
        if (!resp.ok) {
            throw new Error(`Nepodarilo sa načítať logy. HTTP ${resp.status}`);
        }

        const gv = parseGViz(await resp.text());

        allFetchedRows = (gv.table.rows || []).map(r => ({
            date: r.c[0]?.v || null,
            time: r.c[1]?.v || '',
            type: r.c[2]?.v || '',
            deviceId: String(r.c[3]?.v || 'nezname-zariadenie'),
            battery: r.c[4]?.v != null && r.c[4]?.v !== '' ? parseFloat(r.c[4]?.v) : null
        }));

        allFetchedRows.sort(compareRows);
        devices = buildDevices(allFetchedRows);
        ensureSelectedDevice();
        renderDeviceSubmenu();

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