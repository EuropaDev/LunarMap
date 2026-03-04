// ============================================
// SATELLITE TRACKER — OPTIMIZED SCRIPT
// ============================================

console.log('🛰️ Satellite Tracker v0.4 — Initializing…');

// ── Satellite images ──────────────────────────────────────
const satelliteImages = {
    iss:      'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg?_=20221203083003',
    hubble:   'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal:   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png',
    santasat: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Christmas_satellite.jpg/320px-Christmas_satellite.jpg',
    ufo:      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Sputnik_asm.jpg/320px-Sputnik_asm.jpg'
};

// ── Cached DOM refs (avoid repeated getElementById) ───────
const DOM = {
    info:         null,
    tooltip:      null,
    timeDisplay:  null,
    satName:      null,
    satImage:     null,
    imageLoading: null,
    satType:      null,
    satOrbit:     null,
    satLat:       null,
    satLng:       null,
    satAlt:       null,
    satVel:       null,
    satOperator:  null,
    satDesc:      null,
    aiDescSection:null,
    sidebar:      null,
    sidebarOverlay:null,
    searchInput:  null,
    searchResults:null,
    labelBtn:     null,
    gridBtn:      null,
    borderBtn:    null,
    menuSidebar:  null,
    menuOverlay:  null,
    menuToggle:   null,
    dynamicLight: null,
};

// ── State ─────────────────────────────────────────────────
let layer           = null;
let selectedSat     = null;
const satPositions  = new Map();
const satAltitudes  = new Map();
let showLabels      = true;
let showGrid        = false;
let showBorders     = false;
let showClouds      = false;
let cloudLayer      = null;
let gridLayer       = null;
let borderLayer     = null;
let userMarker      = null;
let mapStyle        = 0;
const baseLayers    = [];
let currentBaseLayer= null;
let userLocation    = null;
let allSatellites   = [];
let timeWarp        = 1;
let simulationTime  = new Date();
let realStartTime   = new Date();
let orbitPathLayer  = null;

// Animation / throttle flags
let rafId           = null;
let nightDirty      = true;      // re-draw night layer?
let lastNightRedraw = 0;         // real timestamp of last night redraw
const NIGHT_INTERVAL= 8000;     // ms between night layer redraws (8 s)
let mouseRafPending = false;     // throttle tooltip mousemove with RAF

console.log('✅ Variables initialized');

// ── Map ───────────────────────────────────────────────────
const map = L.map('map', {
    center: [20, 0], zoom: 3, minZoom: 2, maxZoom: 8,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

console.log('✅ Leaflet map initialized');

// Base layers
baseLayers[0] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',  { noWrap: true, bounds: [[-85,-180],[85,180]] });
baseLayers[1] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                  { noWrap: true, bounds: [[-85,-180],[85,180]] });
baseLayers[2] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                             { noWrap: true, bounds: [[-85,-180],[85,180]] });

currentBaseLayer = baseLayers[0];
currentBaseLayer.addTo(map);
console.log('✅ Base layers loaded');

// ── i18n ──────────────────────────────────────────────────
function applyTranslations(t) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.placeholder = t[key];
    });
}
window.addEventListener('message', e => {
    if (e.data?.type === 'langChange' && e.data.translations) {
        applyTranslations(e.data.translations);
        console.log(`🌐 Language: ${e.data.lang}`);
    }
});

// ── DOM init (after DOMContentLoaded) ────────────────────
function initDOM() {
    DOM.info          = document.getElementById('info');
    DOM.tooltip       = document.getElementById('tooltip');
    DOM.timeDisplay   = document.getElementById('timeDisplay');
    DOM.satName       = document.getElementById('satName');
    DOM.satImage      = document.getElementById('satImage');
    DOM.imageLoading  = document.getElementById('imageLoading');
    DOM.satType       = document.getElementById('satType');
    DOM.satOrbit      = document.getElementById('satOrbit');
    DOM.satLat        = document.getElementById('satLat');
    DOM.satLng        = document.getElementById('satLng');
    DOM.satAlt        = document.getElementById('satAlt');
    DOM.satVel        = document.getElementById('satVel');
    DOM.satOperator   = document.getElementById('satOperator');
    DOM.satDesc       = document.getElementById('satDesc');
    DOM.aiDescSection = document.getElementById('aiDescSection');
    DOM.sidebar       = document.getElementById('sidebar');
    DOM.sidebarOverlay= document.getElementById('sidebarOverlay');
    DOM.searchInput   = document.getElementById('searchInput');
    DOM.searchResults = document.getElementById('searchResults');
    DOM.labelBtn      = document.getElementById('labelBtn');
    DOM.gridBtn       = document.getElementById('gridBtn');
    DOM.borderBtn     = document.getElementById('borderBtn');
    DOM.menuSidebar   = document.getElementById('menuSidebar');
    DOM.menuOverlay   = document.getElementById('menuOverlay');
    DOM.menuToggle    = document.querySelector('.menu-toggle');
    DOM.dynamicLight  = document.getElementById('dynamicLight');

    const saved = localStorage.getItem('anthropic_api_key');
    const input = document.getElementById('apiKeyInput');
    if (saved && input) input.value = saved;
}

// ── Menu ──────────────────────────────────────────────────
function toggleMenu() {
    DOM.menuSidebar.classList.toggle('active');
    DOM.menuToggle.classList.toggle('active');
    DOM.menuOverlay.classList.toggle('active');
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId + 'Section');
    section.classList.toggle('active');
    event.currentTarget.classList.toggle('active');
}

// ── Time Warp ─────────────────────────────────────────────
function setTimeWarp(speed) {
    timeWarp      = speed;
    realStartTime = new Date(simulationTime);
    document.querySelectorAll('.timewarp-btn:not(.timewarp-reset)').forEach(b => b.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

function resetTime() {
    simulationTime = new Date();
    realStartTime  = new Date();
    timeWarp       = 1;
    document.querySelectorAll('.timewarp-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.timewarp-btn')[1].classList.add('active');
    updateTimeDisplay();
}

const _timeFmt = { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' };
function updateTimeDisplay() {
    DOM.timeDisplay.innerText = simulationTime.toLocaleString('en-US', _timeFmt);
}

// ── Map controls ──────────────────────────────────────────
function cycleMapStyle() {
    map.removeLayer(currentBaseLayer);
    mapStyle = (mapStyle + 1) % 3;
    currentBaseLayer = baseLayers[mapStyle];
    currentBaseLayer.addTo(map);
    nightDirty = true;
}

function toggleLabels() {
    showLabels = !showLabels;
    DOM.labelBtn.classList.toggle('active', showLabels);
}

function toggleGrid() {
    showGrid = !showGrid;
    DOM.gridBtn.classList.toggle('active', showGrid);
    if (showGrid) {
        if (!gridLayer) {
            gridLayer = L.layerGroup();
            const lineStyle = { color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false };
            for (let lat = -80; lat <= 80; lat += 20)
                L.polyline([[lat,-180],[lat,180]], lineStyle).addTo(gridLayer);
            for (let lng = -180; lng <= 180; lng += 20)
                L.polyline([[-85,lng],[85,lng]], lineStyle).addTo(gridLayer);
        }
        gridLayer.addTo(map);
    } else if (gridLayer) {
        map.removeLayer(gridLayer);
    }
}

function toggleBorders() {
    showBorders = !showBorders;
    DOM.borderBtn.classList.toggle('active', showBorders);
    if (showBorders) {
        if (!borderLayer) borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { opacity: 0.7, maxZoom: 8 });
        borderLayer.addTo(map);
    } else if (borderLayer) {
        map.removeLayer(borderLayer);
    }
}

function toggleClouds() {
    showClouds = !showClouds;
    const btn = document.getElementById('cloudBtn');
    btn && btn.classList.toggle('active', showClouds);
    if (showClouds) {
        if (!cloudLayer) cloudLayer = L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=546c29aeefa27989df830200ec92848e', { opacity: 0.5, maxZoom: 8 });
        cloudLayer.addTo(map);
    } else if (cloudLayer) {
        map.removeLayer(cloudLayer);
    }
}

function goToLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        map.setView([lat, lng], 5);
        userLocation = { lat, lng };
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'user-location', iconSize: [16,16], iconAnchor: [8,8] })
        }).addTo(map);
    });
}

function toggleFullscreen() {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
}

// ── Search (debounced) ────────────────────────────────────
let searchTimer = null;

function initSearch() {
    DOM.searchInput.addEventListener('input', e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(e.target.value), 120);
    });
    document.addEventListener('click', e => {
        if (!DOM.searchInput.contains(e.target) && !DOM.searchResults.contains(e.target))
            DOM.searchResults.classList.remove('show');
    }, { passive: true });
}

function runSearch(raw) {
    const query = raw.toLowerCase().trim();
    if (query.length < 2) { DOM.searchResults.classList.remove('show'); return; }
    const filtered = allSatellites.filter(s => s.type !== 'ufo' && s.name.toLowerCase().includes(query)).slice(0, 10);
    if (!filtered.length) { DOM.searchResults.classList.remove('show'); return; }
    DOM.searchResults.innerHTML = filtered.map(s =>
        `<div class="search-result-item" onclick="selectSatellite('${s.name.replace(/'/g,"\\'")}')">${s.name}</div>`
    ).join('');
    DOM.searchResults.classList.add('show');
}

function selectSatellite(name) {
    const sat = allSatellites.find(s => s.name === name);
    if (!sat) return;
    openSatelliteInfo(sat);
    DOM.searchResults.classList.remove('show');
    DOM.searchInput.value = '';
    const pos = getPos(sat.satrec, simulationTime);
    if (pos) {
        let lng = pos.lng;
        while (lng > 180) lng -= 360;
        while (lng < -180) lng += 360;
        map.flyTo([pos.lat, lng], 5, { duration: 1.8, easeLinearity: 0.4 });
    }
}

// ── Orbit helpers ─────────────────────────────────────────
function getOrbitColor(alt) {
    if (alt < 400)   return '#ef4444';
    if (alt < 2000)  return '#f97316';
    if (alt < 35700) return '#eab308';
    if (alt >= 35700 && alt <= 35900) return '#3b82f6';
    if (alt > 35900) return '#a855f7';
    return '#22c55e';
}

function getOrbitName(alt) {
    if (selectedSat?.type === 'santasat') return 'Ho Ho Ho! 🎅🎄';
    if (selectedSat?.type === 'ufo')      return 'CLASSIFIED 🛸👽';
    if (alt < 400)   return 'VLEO';
    if (alt < 2000)  return 'LEO';
    if (alt < 35700) return 'MEO';
    if (alt >= 35700 && alt <= 35900) return 'GEO';
    if (alt > 35900) return 'Beyond GEO';
    return 'HEO';
}

// ── Orbit path ────────────────────────────────────────────
function drawOrbitPath(sat) {
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
    const points = [];
    const now = simulationTime;
    for (let i = 0; i < 90; i++) {
        const pos = getPos(sat.satrec, new Date(now.getTime() + i * 60000));
        if (pos) points.push([pos.lat, pos.lng]);
    }
    if (points.length)
        orbitPathLayer = L.polyline(points, { color:'#a78bfa', weight:3, opacity:0.7, dashArray:'10,10' }).addTo(map);
}

// ── Sidebar ───────────────────────────────────────────────
function closeSidebar() {
    DOM.sidebar.classList.remove('active');
    DOM.sidebarOverlay.classList.remove('active');
    selectedSat = null;
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
}

function openSatelliteInfo(sat) {
    selectedSat = sat;
    DOM.sidebar.classList.add('active');
    DOM.sidebarOverlay.classList.add('active');
    DOM.satName.innerText = sat.name;
    DOM.imageLoading.style.display = 'block';
    DOM.satImage.style.display = 'none';

    const typeMap = { iss:'iss', tiangong:'tiangong', hubble:'hubble', santasat:'santasat', ufo:'ufo' };
    let imgSrc = satelliteImages[typeMap[sat.type]] || (sat.isTrain ? satelliteImages.starlink : satelliteImages.normal);

    DOM.satImage.onload  = () => { DOM.imageLoading.style.display = 'none'; DOM.satImage.style.display = 'block'; };
    DOM.satImage.onerror = () => { DOM.imageLoading.innerText = 'Image failed'; };
    DOM.satImage.src = imgSrc;

    const typeNames = {
        iss:'International Space Station', tiangong:'Tiangong Space Station',
        hubble:'Hubble Space Telescope', santasat:'🎅 Santa Satellite — Christmas Special',
        ufo:'👽 Unidentified Flying Object'
    };
    DOM.satType.innerText = sat.isTrain ? 'Starlink Train' : (typeNames[sat.type] || 'Satellite');

    updateSatellitePosition();
    drawOrbitPath(sat);
    loadSatAIInfo(sat.name);
}

// ── AI / Gemini ───────────────────────────────────────────
const GEMINI_KEY = 'AIzaSyAypd7t_gDUcmjIKhwPXffcn9-G2o50b3s';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';

function aiCacheGet(k) { try { const v = sessionStorage.getItem('ai_' + k); return v ? JSON.parse(v) : null; } catch { return null; } }
function aiCacheSet(k, v) { try { sessionStorage.setItem('ai_' + k, JSON.stringify(v)); } catch {} }
const aiInflight = new Set();

async function loadSatAIInfo(satName) {
    const cached = aiCacheGet(satName);
    if (cached) { DOM.satOperator.innerText = cached.operator; DOM.satDesc.innerText = cached.description; return; }
    if (!GEMINI_KEY || GEMINI_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        DOM.satOperator.innerText = '-';
        DOM.satDesc.innerText = '🔑 Set GEMINI_KEY in script.js';
        return;
    }
    if (aiInflight.has(satName)) return;
    aiInflight.add(satName);
    DOM.satOperator.innerText = DOM.satDesc.innerText = '…';
    DOM.aiDescSection.classList.add('loading');

    const lang   = localStorage.getItem('selectedLang') || 'en';
    const prompt = `Satellite:"${satName}" lang:"${lang}". Respond ONLY raw JSON (no markdown): {"operator":"<builder/operator>","description":"<2-3 sentences: launch year, purpose, orbit, notable facts>"}`;

    try {
        const res  = await fetch(GEMINI_URL + GEMINI_KEY, {
            method: 'POST', headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ maxOutputTokens:250, temperature:0.1 } })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates?.length) throw new Error('Empty response');
        let raw = (data.candidates[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g,'').trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON: ' + raw.slice(0,60));
        const obj = JSON.parse(match[0]);
        aiCacheSet(satName, obj);
        DOM.satOperator.innerText = obj.operator    || 'Unknown';
        DOM.satDesc.innerText     = obj.description || '-';
    } catch (e) {
        DOM.satOperator.innerText = '-';
        DOM.satDesc.innerText     = '⚠️ ' + e.message;
        console.error('Gemini error [' + satName + ']:', e);
    }
    aiInflight.delete(satName);
    DOM.aiDescSection.classList.remove('loading');
}

function updateSatellitePosition() {
    if (!selectedSat) return;
    const p = getPos(selectedSat.satrec, simulationTime);
    if (!p) return;
    DOM.satLat.innerText = p.lat.toFixed(4) + '°';
    DOM.satLng.innerText = p.lng.toFixed(4) + '°';
    const pv = satellite.propagate(selectedSat.satrec, simulationTime);
    if (pv.position) {
        const { x, y, z } = pv.position;
        const alt = Math.sqrt(x*x + y*y + z*z) - 6371;
        DOM.satAlt.innerText   = alt.toFixed(2);
        DOM.satOrbit.innerText = getOrbitName(alt);
        if (pv.velocity) {
            const { x: vx, y: vy, z: vz } = pv.velocity;
            DOM.satVel.innerText = Math.sqrt(vx*vx + vy*vy + vz*vz).toFixed(2);
        }
    }
}

// ── Night Layer (throttled) ───────────────────────────────
const NightLayer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
        m.getPanes().overlayPane.appendChild(this._c);
        m.on('moveend zoomend viewreset', () => { nightDirty = true; });
        this._reset();
    },
    _reset() {
        const s  = map.getSize();
        const tl = map.containerPointToLayerPoint([0,0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width  = s.x;
        this._c.height = s.y;
        this._draw();
    },
    _draw() {
        const s   = map.getSize();
        const ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        // Step=12 (was 6) → ~4× fewer SunCalc calls
        for (let y = 0; y < s.y; y += 12) {
            for (let x = 0; x < s.x; x += 12) {
                const ll = map.containerPointToLatLng([x, y]);
                if (!ll || ll.lat > 85 || ll.lat < -85) continue;
                const alt = SunCalc.getPosition(simulationTime, ll.lat, ll.lng).altitude * 180 / Math.PI;
                let d = 0;
                if      (alt < -18) d = 0.5;
                else if (alt < -12) d = 0.35 + (alt + 12) / -6 * 0.15;
                else if (alt <  -6) d = 0.2  + (alt +  6) / -6 * 0.15;
                else if (alt <   0) d = alt  / -6 * 0.2;
                if (d > 0) { ctx.fillStyle = `rgba(10,14,39,${d})`; ctx.fillRect(x, y, 12, 12); }
            }
        }
        ctx.filter = 'blur(14px)';
        ctx.drawImage(this._c, 0, 0);
        ctx.filter = 'none';
    }
});

const nightLayerInst = new NightLayer();
nightLayerInst.addTo(map);
console.log('✅ Night layer added');

// ── Satellite Canvas Layer ────────────────────────────────
const Layer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer';
        m.getPanes().overlayPane.appendChild(this._c);
        m.on('moveend zoomend viewreset', () => this._reset());
        this._c.addEventListener('click',     e => this._onClick(e));
        // throttled mousemove via RAF
        this._c.addEventListener('mousemove', e => {
            this._pendingMouse = e;
            if (!mouseRafPending) {
                mouseRafPending = true;
                requestAnimationFrame(() => {
                    if (this._pendingMouse) this._onMouseMove(this._pendingMouse);
                    mouseRafPending = false;
                });
            }
        }, { passive: true });
        this._c.addEventListener('mouseout', () => { DOM.tooltip.style.display = 'none'; }, { passive: true });
        this._reset();
    },
    _reset() {
        const s  = map.getSize();
        const tl = map.containerPointToLayerPoint([0,0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width  = s.x;
        this._c.height = s.y;
        this._draw();
    },
    _onMouseMove(e) {
        if (!this._d || !showLabels) return;
        const rect = this._c.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let found = null;
        for (const sat of this._d) {
            if (sat.type === 'ufo') continue;
            const pos = satPositions.get(sat.name);
            if (!pos) continue;
            const r = sat.type !== 'normal' ? 20 : 6;
            const dx = pos.x - mx, dy = pos.y - my;
            if (dx*dx + dy*dy < r*r) { found = sat.name; break; }
        }
        if (found) {
            DOM.tooltip.innerText = found;
            DOM.tooltip.style.cssText = `display:block;left:${e.clientX+15}px;top:${e.clientY-10}px`;
        } else {
            DOM.tooltip.style.display = 'none';
        }
    },
    _onClick(e) {
        if (!this._d) return;
        const rect = this._c.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        for (const sat of this._d) {
            if (sat.type === 'ufo') continue;
            const pos = satPositions.get(sat.name);
            if (!pos) continue;
            const r = sat.type !== 'normal' ? 20 : 6;
            const dx = pos.x - mx, dy = pos.y - my;
            if (dx*dx + dy*dy < r*r) { openSatelliteInfo(sat); return; }
        }
    },
    _draw() {
        if (!this._d) return;
        const s   = map.getSize();
        const ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        satPositions.clear();

        for (const sat of this._d) {
            if (sat.type === 'ufo') continue;
            const p = getPos(sat.satrec, simulationTime);
            if (!p) continue;

            let lng = p.lng;
            while (lng > 180)  lng -= 360;
            while (lng < -180) lng += 360;

            const pt = map.latLngToContainerPoint([p.lat, lng]);
            if (pt.x < -50 || pt.x > s.x+50 || pt.y < -50 || pt.y > s.y+50) continue;

            satPositions.set(sat.name, { x: pt.x, y: pt.y });

            if (sat.type !== 'normal') {
                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.font = '28px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 15;
                if      (sat.type === 'iss')      { ctx.shadowColor = 'rgba(167,139,250,0.8)'; ctx.fillText('🛰️', 0, 0); }
                else if (sat.type === 'tiangong') { ctx.shadowColor = 'rgba(192,132,252,0.8)'; ctx.fillText('🛰️', 0, 0); }
                else if (sat.type === 'hubble')   { ctx.shadowColor = 'rgba(129,140,248,0.8)'; ctx.fillText('🛰️', 0, 0); }
                else if (sat.type === 'santasat') { ctx.shadowColor = 'rgba(255,0,0,0.9)';     ctx.fillText('🎅🎄',0, 0); }
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 1, 0, 6.2832);
                ctx.fillStyle = getOrbitColor(satAltitudes.get(sat.name) || 0);
                ctx.fill();
            }
        }
    }
});

layer = new Layer();
layer.addTo(map);
console.log('✅ Satellite layer added');

// ── Helper: get lat/lng position ──────────────────────────
function getPos(satrec, date) {
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        const g = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
        return { lat: satellite.degreesLat(g.latitude), lng: satellite.degreesLong(g.longitude) };
    } catch { return null; }
}

// ── TLE Fetch ─────────────────────────────────────────────
console.log('📡 Fetching TLE data…');

const easterEggTLE = `
SANTASAT
1 99999U 24001A   24001.50000000  .00000000  00000-0  00000-0 0    10
2 99999  90.0000   0.0000 0001000   0.0000   0.0000 15.00000000    18
UFO-UNKNOWN
1 88888U 24002A   24001.50000000  .00000000  00000-0  00000-0 0    10
2 88888  45.0000 180.0000 0001000   0.0000   0.0000 16.00000000    18`;

fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    .then(r => r.text())
    .then(tle => {
        const lines = (tle + '\n' + easterEggTLE).split('\n');
        const data  = [];
        const now   = new Date();

        for (let i = 0; i < lines.length; i += 3) {
            if (!lines[i+2]) continue;
            const n = lines[i].trim();
            if (!n) continue;

            let type    = 'normal';
            let isTrain = false;
            if      (n === 'ISS (ZARYA)')                    type = 'iss';
            else if (n === 'CSS (MENGTIAN)')                 type = 'tiangong';
            else if (n === 'HST')                            type = 'hubble';
            else if (n.includes('STARLINK') && n.match(/STARLINK-\d{4,}/)) isTrain = true;
            else if (n.includes('SANTASAT'))                 type = 'santasat';
            else if (n.includes('UFO'))                      type = 'ufo';

            const satrec = satellite.twoline2satrec(lines[i+1].trim(), lines[i+2].trim());
            if (!satrec) continue;
            data.push({ satrec, type, name: n, isTrain });
            const pv = satellite.propagate(satrec, now);
            if (pv.position) {
                const { x, y, z } = pv.position;
                satAltitudes.set(n, Math.sqrt(x*x + y*y + z*z) - 6371);
            }
        }

        layer._d    = data;
        allSatellites = data;
        const visible = data.filter(s => s.type !== 'ufo').length;
        DOM.info.innerText = visible;
        console.log(`✅ Loaded ${data.length} satellites (${visible} visible)`);

        // ── Main animation loop (RAF) ──────────────────────
        let lastTime = performance.now();
        function tick(now) {
            const dt = now - lastTime;
            lastTime = now;

            if (timeWarp > 0) {
                simulationTime = new Date(realStartTime.getTime() + (Date.now() - realStartTime.getTime()) * timeWarp);
                updateTimeDisplay();
            }
            layer._draw();
            updateSatellitePosition();

            // Night layer: only redraw when dirty or interval elapsed
            const realNow = Date.now();
            if (nightDirty || (realNow - lastNightRedraw) > NIGHT_INTERVAL) {
                nightLayerInst._reset();
                lastNightRedraw = realNow;
                nightDirty = false;
            }

            rafId = requestAnimationFrame(tick);
        }
        rafId = requestAnimationFrame(tick);
        console.log('✅ RAF animation loop started');
    })
    .catch(err => console.error('❌ TLE fetch error:', err));

// ── GitHub Auth ───────────────────────────────────────────
const GITHUB_CLIENT_ID = 'Ov23liGR0rMbfspzNYrn';
const REDIRECT_URI = window.location.origin + window.location.pathname;

function githubLogin() {
    const user = localStorage.getItem('github_user');
    if (user) {
        if (confirm('Do you want to sign out?')) {
            localStorage.removeItem('github_user');
            localStorage.removeItem('github_token');
            updateGitHubButton();
        }
    } else {
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;
    }
}

function updateGitHubButton() {
    const btn  = document.getElementById('githubBtn');
    const user = localStorage.getItem('github_user');
    if (user) {
        btn.classList.add('logged-in');
        btn.title = `Signed in as ${JSON.parse(user).login}`;
    } else {
        btn.classList.remove('logged-in');
        btn.title = 'Sign in with GitHub';
    }
}

// ── Dynamic Light (passive) ───────────────────────────────
document.addEventListener('mousemove', e => {
    if (DOM.dynamicLight) {
        DOM.dynamicLight.style.left = `${e.clientX - 350}px`;
        DOM.dynamicLight.style.top  = `${e.clientY - 350}px`;
    }
}, { passive: true });

// ── Theme ─────────────────────────────────────────────────
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mapsat_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

(function applyTheme() {
    const saved = localStorage.getItem('mapsat_theme') || 'mission';
    document.documentElement.setAttribute('data-theme', saved);
    window.addEventListener('DOMContentLoaded', () => {
        initDOM();
        initSearch();
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === saved));
        updateTimeDisplay();
    });
})();

// ── OAuth callback ────────────────────────────────────────
window.addEventListener('load', () => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
        const mockUser = { login:'user_'+Math.random().toString(36).substr(2,5), id:Date.now(), avatar_url:'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png' };
        localStorage.setItem('github_user', JSON.stringify(mockUser));
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    updateGitHubButton();
});

console.log('🎉 Satellite Tracker fully initialized (optimized build)');
