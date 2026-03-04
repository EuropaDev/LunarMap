// ============================================
// SATELLITE TRACKER - MAIN SCRIPT
// ============================================

console.log('🛰️ Satellite Tracker v0.5 - Initializing...');

const satelliteImages = {
    iss:      'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg',
    hubble:   'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal:   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png'
};

// Global variables
let layer            = null;
let selectedSat      = null;
let satPositions     = new Map();
let satAltitudes     = new Map();
let showLabels       = true;
let showGrid         = false;
let showBorders      = false;
let showClouds       = false;
let cloudLayer       = null;
let gridLayer        = null;
let borderLayer      = null;
let userMarker       = null;
let mapStyle         = 0;
let baseLayers       = [];
let currentBaseLayer = null;
let userLocation     = null;
let allSatellites    = [];
let orbitPathLayer   = null;

// ============================================
// FIX: TIME WARP — Two-base approach
// ─────────────────────────────────────────────
// The original code set realStartTime = new Date(simulationTime),
// which is WRONG: realStartTime must be a real wall-clock timestamp.
// When warp was changed multiple times the elapsed calculation went
// negative and satellites jumped to invalid positions.
//
// Solution: keep two bases that are snapped together every time the
// warp factor changes.
//   simBase  = simulated time at the moment of the last warp change
//   realBase = real wall-clock ms at the moment of the last warp change
// ============================================
let timeWarp = 1;
let simBase  = new Date();   // sim time when warp was last set
let realBase = Date.now();   // real ms  when warp was last set

/** Returns the correct current simulated time at any warp factor. */
function getSimTime() {
    const elapsedReal = Date.now() - realBase;          // always ≥ 0
    const ms = simBase.getTime() + elapsedReal * timeWarp;
    // Clamp to safe JS Date range to prevent NaN overflow
    const SAFE = 8_640_000_000_000_000;
    return new Date(Math.max(-SAFE, Math.min(SAFE, ms)));
}

// Expose as a readable alias used throughout the file
function getSimulationTime() { return getSimTime(); }

console.log('✅ Variables initialized');

// ── Map ──────────────────────────────────────

const map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 8,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

console.log('✅ Leaflet map initialized');

baseLayers[0] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { noWrap: true, bounds: [[-85, -180], [85, 180]] });
baseLayers[1] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                { noWrap: true, bounds: [[-85, -180], [85, 180]] });
baseLayers[2] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           { noWrap: true, bounds: [[-85, -180], [85, 180]] });

currentBaseLayer = baseLayers[0];
currentBaseLayer.addTo(map);
console.log('✅ Base layers loaded');

// ============================================
// TRANSLATION (i18n)
// ============================================

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

window.addEventListener('message', (e) => {
    if (e.data?.type === 'langChange' && e.data.translations) {
        applyTranslations(e.data.translations);
        console.log(`🌐 Language applied: ${e.data.lang}`);
    }
});

// ============================================
// MENU FUNCTIONS
// ============================================

function toggleMenu() {
    const menuSidebar = document.getElementById('menuSidebar');
    const menuToggle  = document.querySelector('.menu-toggle');
    const menuOverlay = document.getElementById('menuOverlay');
    menuSidebar.classList.toggle('active');
    menuToggle.classList.toggle('active');
    menuOverlay.classList.toggle('active');
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId + 'Section');
    const button  = event.currentTarget;
    section.classList.toggle('active');
    button.classList.toggle('active');
}

// ============================================
// TIME WARP FUNCTIONS
// ============================================

const MAX_WARP = 10_000;

function setTimeWarp(speed) {
    // FIX: Snap both bases to *right now* before changing warp factor.
    // This prevents elapsed-time from jumping when warp changes.
    simBase  = getSimTime();            // current sim position
    realBase = Date.now();              // current real position
    timeWarp = Math.max(-MAX_WARP, Math.min(MAX_WARP, speed));

    document.querySelectorAll('.timewarp-btn').forEach(btn => {
        if (!btn.classList.contains('timewarp-reset')) btn.classList.remove('active');
    });
    if (event?.target) event.target.classList.add('active');
    console.log(`⏱️ Time warp: ${speed}x`);
}

function resetTime() {
    simBase  = new Date();
    realBase = Date.now();
    timeWarp = 1;
    document.querySelectorAll('.timewarp-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.timewarp-btn')[1]?.classList.add('active');
    updateTimeDisplay();
}

function updateTimeDisplay() {
    const t = getSimTime();
    if (!isFinite(t.getTime())) {
        document.getElementById('timeDisplay').innerText = 'Invalid time';
        return;
    }
    const options = {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    };
    document.getElementById('timeDisplay').innerText = t.toLocaleString('en-US', options);
}

// ============================================
// MAP CONTROL FUNCTIONS
// ============================================

function cycleMapStyle() {
    map.removeLayer(currentBaseLayer);
    mapStyle         = (mapStyle + 1) % 3;
    currentBaseLayer = baseLayers[mapStyle];
    currentBaseLayer.addTo(map);
}

function toggleLabels() {
    showLabels = !showLabels;
    document.getElementById('labelBtn').classList.toggle('active', showLabels);
}

function toggleGrid() {
    showGrid = !showGrid;
    document.getElementById('gridBtn').classList.toggle('active', showGrid);
    if (showGrid) {
        if (!gridLayer) {
            gridLayer = L.layerGroup();
            for (let lat = -80; lat <= 80; lat += 20)
                L.polyline([[lat, -180], [lat, 180]], { color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false }).addTo(gridLayer);
            for (let lng = -180; lng <= 180; lng += 20)
                L.polyline([[-85, lng], [85, lng]], { color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false }).addTo(gridLayer);
        }
        gridLayer.addTo(map);
    } else {
        if (gridLayer) map.removeLayer(gridLayer);
    }
}

function toggleBorders() {
    showBorders = !showBorders;
    document.getElementById('borderBtn').classList.toggle('active', showBorders);
    if (showBorders) {
        if (!borderLayer)
            borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { opacity: 0.7, maxZoom: 8 });
        borderLayer.addTo(map);
    } else {
        if (borderLayer) map.removeLayer(borderLayer);
    }
}

function toggleClouds() {
    showClouds = !showClouds;
    document.getElementById('cloudBtn')?.classList.toggle('active', showClouds);
    if (showClouds) {
        if (!cloudLayer)
            cloudLayer = L.tileLayer(
                'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=546c29aeefa27989df830200ec92848e',
                { opacity: 0.5, maxZoom: 8 }
            );
        cloudLayer.addTo(map);
    } else {
        if (cloudLayer) map.removeLayer(cloudLayer);
    }
}

function goToLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            map.setView([lat, lng], 5);
            userLocation = { lat, lng };
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({ className: 'user-location', iconSize: [16, 16], iconAnchor: [8, 8] })
            }).addTo(map);
        });
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

const searchInput   = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length < 2) { searchResults.classList.remove('show'); return; }
    const filtered = allSatellites.filter(sat => sat.name.toLowerCase().includes(query)).slice(0, 10);
    if (filtered.length > 0) {
        searchResults.innerHTML = filtered.map(sat =>
            `<div class="search-result-item" onclick="selectSatellite('${sat.name.replace(/'/g, "\\'")}')">${sat.name}</div>`
        ).join('');
        searchResults.classList.add('show');
    } else {
        searchResults.classList.remove('show');
    }
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target))
        searchResults.classList.remove('show');
});

function selectSatellite(name) {
    const sat = allSatellites.find(s => s.name === name);
    if (!sat) return;
    openSatelliteInfo(sat);
    searchResults.classList.remove('show');
    searchInput.value = '';
    const pos = getPos(sat.satrec, getSimTime());
    if (pos) {
        // FIX: use safe normalizeLng instead of while-loop
        map.flyTo([pos.lat, normalizeLng(pos.lng)], 5, { duration: 1.8, easeLinearity: 0.4 });
    }
}

// ============================================
// ORBIT HELPERS
// ============================================

function getOrbitColor(alt) {
    if (alt < 400)                    return '#ef4444';
    if (alt < 2000)                   return '#f97316';
    if (alt < 35700)                  return '#eab308';
    if (alt >= 35700 && alt <= 35900) return '#3b82f6';
    if (alt > 35900)                  return '#a855f7';
    return '#22c55e';
}

function getOrbitName(alt) {
    if (alt < 400)                    return 'VLEO';
    if (alt < 2000)                   return 'LEO';
    if (alt < 35700)                  return 'MEO';
    if (alt >= 35700 && alt <= 35900) return 'GEO';
    if (alt > 35900)                  return 'Beyond GEO';
    return 'HEO';
}

// ============================================
// FIX: normalizeLng — O(1), no infinite loop
// ============================================
function normalizeLng(lng) {
    if (!isFinite(lng)) return 0;
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ============================================
// ORBIT PATH
// ============================================

function drawOrbitPath(sat) {
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
    const now    = getSimTime();
    // FIX: Don't draw if sim time is invalid
    if (!isFinite(now.getTime())) return;

    const points = [];
    for (let i = 0; i < 90; i++) {
        const time = new Date(now.getTime() + i * 60_000);
        const pos  = getPos(sat.satrec, time);
        if (pos) points.push([pos.lat, pos.lng]);
    }
    if (points.length > 0) {
        orbitPathLayer = L.polyline(points, {
            color: '#a78bfa', weight: 3, opacity: 0.7, dashArray: '10, 10'
        }).addTo(map);
    }
}

// ============================================
// SIDEBAR
// ============================================

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    selectedSat = null;
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
}

function openSatelliteInfo(sat) {
    selectedSat = sat;
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.getElementById('satName').innerText = sat.name;

    const imgElement     = document.getElementById('satImage');
    const loadingElement = document.getElementById('imageLoading');
    loadingElement.style.display = 'block';
    imgElement.style.display     = 'none';

    let imgSrc = satelliteImages.normal;
    if      (sat.type === 'iss')      imgSrc = satelliteImages.iss;
    else if (sat.type === 'tiangong') imgSrc = satelliteImages.tiangong;
    else if (sat.type === 'hubble')   imgSrc = satelliteImages.hubble;
    else if (sat.isTrain)             imgSrc = satelliteImages.starlink;

    imgElement.onload  = () => { loadingElement.style.display = 'none'; imgElement.style.display = 'block'; };
    imgElement.onerror = () => { loadingElement.innerText = 'Image failed'; };
    imgElement.src     = imgSrc;

    const typeNames = { iss: 'International Space Station', tiangong: 'Tiangong Space Station', hubble: 'Hubble Space Telescope' };
    document.getElementById('satType').innerText = sat.isTrain ? 'Starlink Train' : (typeNames[sat.type] || 'Satellite');

    updateSatellitePosition();
    drawOrbitPath(sat);
    loadSatAIInfo(sat.name);
}

// ============================================
// AI INFO — Gemini API
// ============================================

const GEMINI_KEY = 'AIzaSyAypd7t_gDUcmjIKhwPXffcn9-G2o50b3s';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';

function aiCacheGet(k) {
    try { const v = sessionStorage.getItem('ai_' + k); return v ? JSON.parse(v) : null; } catch { return null; }
}
function aiCacheSet(k, v) {
    try { sessionStorage.setItem('ai_' + k, JSON.stringify(v)); } catch {}
}

const aiInflight = new Set();

async function loadSatAIInfo(satName) {
    const opEl    = document.getElementById('satOperator');
    const descEl  = document.getElementById('satDesc');
    const section = document.getElementById('aiDescSection');
    const cached  = aiCacheGet(satName);
    if (cached) { opEl.innerText = cached.operator; descEl.innerText = cached.description; return; }
    if (!GEMINI_KEY || GEMINI_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        opEl.innerText = '-'; descEl.innerText = '🔑 GEMINI_KEY alanına API key girin.'; return;
    }
    if (aiInflight.has(satName)) return;
    aiInflight.add(satName);
    opEl.innerText = descEl.innerText = '...';
    section.classList.add('loading');
    const lang   = localStorage.getItem('selectedLang') || 'en';
    const prompt = `Satellite:"${satName}" lang:"${lang}". Respond ONLY with raw JSON (no markdown): {"operator":"<builder/operator>","description":"<2-3 sentences: launch year, purpose, orbit, notable facts>"}`;
    try {
        const res  = await fetch(GEMINI_URL + GEMINI_KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 250, temperature: 0.1 } })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates?.length) throw new Error('Empty response');
        let raw = data.candidates[0]?.content?.parts?.[0]?.text || '';
        raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON: ' + raw.slice(0, 60));
        const obj = JSON.parse(match[0]);
        aiCacheSet(satName, obj);
        opEl.innerText   = obj.operator    || 'Unknown';
        descEl.innerText = obj.description || '-';
    } catch (e) {
        opEl.innerText = '-'; descEl.innerText = '⚠️ ' + e.message;
        console.error('Gemini AI error:', satName, e);
    }
    aiInflight.delete(satName);
    section.classList.remove('loading');
}

function updateSatellitePosition() {
    if (!selectedSat) return;
    const now = getSimTime();
    // FIX: Skip update if sim time is invalid
    if (!isFinite(now.getTime())) return;

    const p = getPos(selectedSat.satrec, now);
    if (!p) return;
    document.getElementById('satLat').innerText = p.lat.toFixed(4) + '°';
    document.getElementById('satLng').innerText = p.lng.toFixed(4) + '°';

    const pv = satellite.propagate(selectedSat.satrec, now);
    if (pv.position) {
        const x = pv.position.x, y = pv.position.y, z = pv.position.z;
        // FIX: Validate before computing
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
        const alt = Math.sqrt(x*x + y*y + z*z) - 6371;
        if (!isFinite(alt) || alt < 0) return;
        document.getElementById('satAlt').innerText   = alt.toFixed(2);
        document.getElementById('satOrbit').innerText = getOrbitName(alt);
        if (pv.velocity) {
            const vx = pv.velocity.x, vy = pv.velocity.y, vz = pv.velocity.z;
            if (isFinite(vx) && isFinite(vy) && isFinite(vz)) {
                document.getElementById('satVel').innerText = Math.sqrt(vx*vx + vy*vy + vz*vz).toFixed(2);
            }
        }
    }
}

// ============================================
// NIGHT LAYER
// ============================================

const NightLayer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
        m.getPanes().overlayPane.appendChild(this._c);
        m.on('moveend zoomend viewreset', () => this._reset());
        this._reset();
    },
    _reset() {
        const s = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x; this._c.height = s.y;
        this._draw();
    },
    _draw() {
        const now = getSimTime();
        // FIX: Don't draw shadow with invalid time
        if (!isFinite(now.getTime())) return;

        const s = map.getSize(), ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        for (let y = 0; y < s.y; y += 6) {
            for (let x = 0; x < s.x; x += 6) {
                const ll = map.containerPointToLatLng([x, y]);
                if (!ll || ll.lat > 85 || ll.lat < -85) continue;
                const pos = SunCalc.getPosition(now, ll.lat, ll.lng);
                const alt = pos.altitude * 180 / Math.PI;
                let d = 0;
                if      (alt < -18) d = 0.5;
                else if (alt < -12) d = 0.35 + ((alt + 12) / -6) * 0.15;
                else if (alt < -6)  d = 0.2  + ((alt + 6)  / -6) * 0.15;
                else if (alt < 0)   d = (alt / -6) * 0.2;
                if (d > 0) { ctx.fillStyle = `rgba(10,14,39,${d})`; ctx.fillRect(x, y, 6, 6); }
            }
        }
        ctx.filter = 'blur(12px)';
        ctx.drawImage(this._c, 0, 0);
        ctx.filter = 'none';
    }
});

new NightLayer().addTo(map);

// ============================================
// SATELLITE CANVAS LAYER
// ============================================

const SatLayer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer';
        m.getPanes().overlayPane.appendChild(this._c);
        m.on('moveend zoomend viewreset', () => this._reset());
        this._c.addEventListener('click',     e => this._onClick(e));
        this._c.addEventListener('mousemove', e => this._onMouseMove(e));
        this._c.addEventListener('mouseout',  () => document.getElementById('tooltip').style.display = 'none');
        this._reset();
    },
    _reset() {
        const s = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x; this._c.height = s.y;
        this._draw();
    },
    _hitTest(x, y) {
        if (!this._d) return null;
        for (const sat of this._d) {
            const pos = satPositions.get(sat.name);
            const r   = sat.type !== 'normal' ? 20 : 6;
            if (pos && Math.hypot(pos.x - x, pos.y - y) < r) return sat;
        }
        return null;
    },
    _onMouseMove(e) {
        if (!showLabels) return;
        const rect  = this._c.getBoundingClientRect();
        const found = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
        const tooltip = document.getElementById('tooltip');
        if (found) {
            tooltip.innerText     = found.name;
            tooltip.style.left    = (e.clientX + 15) + 'px';
            tooltip.style.top     = (e.clientY - 10) + 'px';
            tooltip.style.display = 'block';
        } else {
            tooltip.style.display = 'none';
        }
    },
    _onClick(e) {
        const rect  = this._c.getBoundingClientRect();
        const found = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (found) openSatelliteInfo(found);
    },
    _draw() {
        if (!this._d) return;
        const now = getSimTime();
        // FIX: Skip entire draw if sim time is invalid
        if (!isFinite(now.getTime())) return;

        const s = map.getSize(), ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        satPositions.clear();

        for (const sat of this._d) {
            const p = getPos(sat.satrec, now);
            if (!p) continue;

            // FIX: normalizeLng instead of while-loop (crash on NaN)
            const lng = normalizeLng(p.lng);
            const pt  = map.latLngToContainerPoint([p.lat, lng]);
            if (pt.x < -50 || pt.x > s.x + 50 || pt.y < -50 || pt.y > s.y + 50) continue;

            satPositions.set(sat.name, { x: pt.x, y: pt.y });

            if (sat.type !== 'normal') {
                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.font = '28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowBlur  = 15;
                const colors    = { iss: 'rgba(167,139,250,0.8)', tiangong: 'rgba(192,132,252,0.8)', hubble: 'rgba(129,140,248,0.8)' };
                ctx.shadowColor = colors[sat.type] || 'rgba(255,255,255,0.5)';
                ctx.fillText('🛰️', 0, 0);
                ctx.restore();
            } else {
                const alt = satAltitudes.get(sat.name) || 0;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 1, 0, Math.PI * 2);
                ctx.fillStyle = getOrbitColor(alt);
                ctx.fill();
            }
        }
    }
});

layer = new SatLayer();
layer.addTo(map);
console.log('✅ Satellite layer added');

// ============================================
// HELPER — getPos with NaN guard
// ============================================

function getPos(satrec, date) {
    // FIX: Reject invalid dates before feeding to propagator
    if (!isFinite(date.getTime())) return null;
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        // FIX: Reject NaN vectors
        const { x, y, z } = pv.position;
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;

        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;

        const g   = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(g.latitude);
        const lng = satellite.degreesLong(g.longitude);

        // FIX: Reject NaN coordinates
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { lat, lng };
    } catch { return null; }
}

// ============================================
// LOAD TLE DATA
// ============================================

console.log('📡 Fetching TLE data...');

fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    .then(r => r.text())
    .then(tle => {
        const lines = tle.split('\n');
        const data  = [];

        for (let i = 0; i < lines.length - 2; i += 3) {
            const n = lines[i].trim();
            if (!n || !lines[i + 2]) continue;

            let type    = 'normal';
            let isTrain = false;

            if      (n === 'ISS (ZARYA)')        type    = 'iss';
            else if (n === 'CSS (MENGTIAN)')      type    = 'tiangong';
            else if (n === 'HST')                 type    = 'hubble';
            else if (/^STARLINK-\d{4,}$/.test(n)) isTrain = true;

            const satrec = satellite.twoline2satrec(lines[i + 1].trim(), lines[i + 2].trim());
            if (!satrec) continue;

            data.push({ satrec, type, name: n, isTrain });

            const pv = satellite.propagate(satrec, new Date());
            if (pv.position) {
                const { x, y, z } = pv.position;
                // FIX: Validate before caching altitude
                if (isFinite(x) && isFinite(y) && isFinite(z)) {
                    const alt = Math.sqrt(x*x + y*y + z*z) - 6371;
                    if (isFinite(alt) && alt >= 0) satAltitudes.set(n, alt);
                }
            }
        }

        layer._d      = data;
        allSatellites = data;
        document.getElementById('info').innerText = data.length;
        console.log(`✅ Loaded ${data.length} satellites`);

        setInterval(() => {
            // FIX: getSimTime() handles the correct warp math automatically.
            // No manual elapsed calculation needed here anymore.
            const now = getSimTime();
            if (!isFinite(now.getTime())) return;   // skip bad ticks
            updateTimeDisplay();
            layer._draw();
            updateSatellitePosition();
        }, 150);
    })
    .catch(err => console.error('❌ TLE fetch error:', err));

// ============================================
// GITHUB AUTH
// ============================================

const GITHUB_CLIENT_ID = 'Ov23liGR0rMbfspzNYrn';
const REDIRECT_URI     = window.location.origin + window.location.pathname;

function githubLogin() {
    const user = localStorage.getItem('github_user');
    if (user) {
        if (confirm('Do you want to sign out?')) {
            localStorage.removeItem('github_user');
            localStorage.removeItem('github_token');
            updateGitHubButton();
        }
    } else {
        window.location.href =
            `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;
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

window.addEventListener('load', () => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
        const mockUser = {
            login:      'user_' + Math.random().toString(36).substr(2, 5),
            id:         Date.now(),
            avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
        };
        localStorage.setItem('github_user', JSON.stringify(mockUser));
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    updateGitHubButton();
});

// Dynamic Light Effect
document.addEventListener('mousemove', (e) => {
    const light = document.getElementById('dynamicLight');
    if (light) { light.style.left = `${e.clientX - 300}px`; light.style.top = `${e.clientY - 300}px`; }
});

updateTimeDisplay();

// ============================================
// THEME MANAGEMENT
// ============================================

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mapsat_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

(function () {
    const saved = localStorage.getItem('mapsat_theme') || 'mission';
    document.documentElement.setAttribute('data-theme', saved);
    window.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === saved);
        });
    });
})();

console.log('🎉 Satellite Tracker v0.5 ready!');
