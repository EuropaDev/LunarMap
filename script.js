// ============================================
// SATELLITE TRACKER — OPTIMIZED v0.6
// ============================================

console.log('🛰️ Satellite Tracker v0.6 - Initializing...');

const satelliteImages = {
    iss:      'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg',
    hubble:   'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal:   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png'
};

// Global state
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
let trackingSat      = null;

// ── Time Warp ────────────────────────────────
const MAX_WARP = 10_000;
let timeWarp = 1;
let simBase  = new Date();
let realBase = Date.now();

function getSimTime() {
    const elapsedReal = Date.now() - realBase;
    const ms = simBase.getTime() + elapsedReal * timeWarp;
    const SAFE = 8_640_000_000_000_000;
    return new Date(Math.max(-SAFE, Math.min(SAFE, ms)));
}
function getSimulationTime() { return getSimTime(); }

// ── Map Init ─────────────────────────────────
const map = L.map('map', {
    center: [20, 0], zoom: 3, minZoom: 2, maxZoom: 8,
    maxBounds: [[-85,-180],[85,180]], maxBoundsViscosity: 1.0, zoomControl: false
});

baseLayers[0] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { noWrap:true, bounds:[[-85,-180],[85,180]] });
baseLayers[1] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                { noWrap:true, bounds:[[-85,-180],[85,180]] });
baseLayers[2] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           { noWrap:true, bounds:[[-85,-180],[85,180]] });
currentBaseLayer = baseLayers[0];
currentBaseLayer.addTo(map);
console.log('✅ Map initialized');

// ── i18n ─────────────────────────────────────
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
    if (e.data?.type === 'langChange' && e.data.translations)
        applyTranslations(e.data.translations);
});

// ── Menu ─────────────────────────────────────
function toggleMenu() {
    document.getElementById('menuSidebar').classList.toggle('active');
    document.querySelector('.menu-toggle').classList.toggle('active');
    document.getElementById('menuOverlay').classList.toggle('active');
}
function toggleSection(sectionId) {
    document.getElementById(sectionId + 'Section').classList.toggle('active');
    event.currentTarget.classList.toggle('active');
}

// ── Time Warp Controls ───────────────────────
function setTimeWarp(speed) {
    simBase  = getSimTime();
    realBase = Date.now();
    timeWarp = Math.max(-MAX_WARP, Math.min(MAX_WARP, speed));
    document.querySelectorAll('.timewarp-btn').forEach(btn => {
        if (!btn.classList.contains('timewarp-reset')) btn.classList.remove('active');
    });
    if (event?.target) event.target.classList.add('active');
    nightLayerRef?._scheduleDraw();
}
function resetTime() {
    simBase = new Date(); realBase = Date.now(); timeWarp = 1;
    document.querySelectorAll('.timewarp-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.timewarp-btn')[1]?.classList.add('active');
    updateTimeDisplay();
    nightLayerRef?._scheduleDraw();
}
function updateTimeDisplay() {
    const t = getSimTime();
    if (!isFinite(t.getTime())) { document.getElementById('timeDisplay').innerText = 'Invalid time'; return; }
    document.getElementById('timeDisplay').innerText = t.toLocaleString('en-US', {
        year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
}

// ── Map Controls ─────────────────────────────
function cycleMapStyle() {
    map.removeLayer(currentBaseLayer);
    mapStyle = (mapStyle + 1) % 3;
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
                L.polyline([[lat,-180],[lat,180]], { color:'rgba(148,163,184,0.3)', weight:1, interactive:false }).addTo(gridLayer);
            for (let lng = -180; lng <= 180; lng += 20)
                L.polyline([[-85,lng],[85,lng]], { color:'rgba(148,163,184,0.3)', weight:1, interactive:false }).addTo(gridLayer);
        }
        gridLayer.addTo(map);
    } else { if (gridLayer) map.removeLayer(gridLayer); }
}
function toggleBorders() {
    showBorders = !showBorders;
    document.getElementById('borderBtn').classList.toggle('active', showBorders);
    if (showBorders) {
        if (!borderLayer) borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { opacity:0.7, maxZoom:8 });
        borderLayer.addTo(map);
    } else { if (borderLayer) map.removeLayer(borderLayer); }
}
function toggleClouds() {
    showClouds = !showClouds;
    document.getElementById('cloudBtn')?.classList.toggle('active', showClouds);
    if (showClouds) {
        if (!cloudLayer) cloudLayer = L.tileLayer(
            'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=546c29aeefa27989df830200ec92848e',
            { opacity:0.5, maxZoom:8 }
        );
        cloudLayer.addTo(map);
    } else { if (cloudLayer) map.removeLayer(cloudLayer); }
}
function goToLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        map.setView([lat,lng], 5);
        userLocation = { lat, lng };
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([lat,lng], {
            icon: L.divIcon({ className:'user-location', iconSize:[16,16], iconAnchor:[8,8] })
        }).addTo(map);
    });
}
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

// ── Search ───────────────────────────────────
const searchInput   = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('show'); return; }
    const found = allSatellites.filter(s => s.name.toLowerCase().includes(q)).slice(0, 10);
    if (found.length) {
        searchResults.innerHTML = found.map(s =>
            `<div class="search-result-item" onclick="selectSatellite('${s.name.replace(/'/g,"\\'")}'">${s.name}</div>`
        ).join('');
        searchResults.classList.add('show');
    } else searchResults.classList.remove('show');
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
    if (pos) map.flyTo([pos.lat, normalizeLng(pos.lng)], 5, { duration:1.8, easeLinearity:0.4 });
}

// ── Orbit Helpers ────────────────────────────
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
function normalizeLng(lng) {
    if (!isFinite(lng)) return 0;
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ── Orbit Path (cached, max 1 rebuild/5s) ────
let _orbitPathSat = null, _orbitPathBuiltAt = 0;

function drawOrbitPath(sat) {
    const now = getSimTime();
    if (!isFinite(now.getTime())) return;
    const nowMs = now.getTime();
    if (_orbitPathSat === sat && Math.abs(nowMs - _orbitPathBuiltAt) < 5000) return;
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
    const points = [];
    for (let i = 0; i < 90; i++) {
        const pos = getPos(sat.satrec, new Date(nowMs + i * 60_000));
        if (pos) points.push([pos.lat, pos.lng]);
    }
    if (points.length)
        orbitPathLayer = L.polyline(points, { color:'#a78bfa', weight:3, opacity:0.7, dashArray:'10,10' }).addTo(map);
    _orbitPathSat = sat;
    _orbitPathBuiltAt = nowMs;
}

// ── Sidebar ──────────────────────────────────
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    selectedSat = null;
    if (orbitPathLayer) { map.removeLayer(orbitPathLayer); orbitPathLayer = null; }
    _orbitPathSat = null;
    if (trackingSat) {
        trackingSat = null;
        const btn = document.getElementById('trackBtn');
        if (btn) {
            btn.classList.remove('active');
            btn.querySelector('.track-btn-icon').textContent = '🎯';
            btn.querySelector('.track-btn-label').textContent = 'TRACK SATELLITE';
        }
    }
}

function openSatelliteInfo(sat) {
    selectedSat = sat;
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.getElementById('satName').innerText = sat.name;

    const imgEl = document.getElementById('satImage'), loadEl = document.getElementById('imageLoading');
    loadEl.style.display = 'block'; imgEl.style.display = 'none';
    let imgSrc = satelliteImages.normal;
    if      (sat.type === 'iss')      imgSrc = satelliteImages.iss;
    else if (sat.type === 'tiangong') imgSrc = satelliteImages.tiangong;
    else if (sat.type === 'hubble')   imgSrc = satelliteImages.hubble;
    else if (sat.isTrain)             imgSrc = satelliteImages.starlink;
    imgEl.onload  = () => { loadEl.style.display = 'none'; imgEl.style.display = 'block'; };
    imgEl.onerror = () => { loadEl.innerText = 'Image failed'; };
    imgEl.src = imgSrc;

    const typeNames = { iss:'International Space Station', tiangong:'Tiangong Space Station', hubble:'Hubble Space Telescope' };
    document.getElementById('satType').innerText = sat.isTrain ? 'Starlink Train' : (typeNames[sat.type] || 'Satellite');
    updateSatellitePosition();
    drawOrbitPath(sat);
    loadSatAIInfo(sat.name);
}

// ── AI Info ──────────────────────────────────
const GEMINI_KEY = 'AIzaSyAypd7t_gDUcmjIKhwPXffcn9-G2o50b3s';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';

function aiCacheGet(k) { try { const v = sessionStorage.getItem('ai_'+k); return v ? JSON.parse(v) : null; } catch { return null; } }
function aiCacheSet(k, v) { try { sessionStorage.setItem('ai_'+k, JSON.stringify(v)); } catch {} }
const aiInflight = new Set();

async function loadSatAIInfo(satName) {
    const opEl = document.getElementById('satOperator'), descEl = document.getElementById('satDesc');
    const section = document.getElementById('aiDescSection');
    const cached = aiCacheGet(satName);
    if (cached) { opEl.innerText = cached.operator; descEl.innerText = cached.description; return; }
    if (!GEMINI_KEY || GEMINI_KEY === 'YOUR_GEMINI_API_KEY_HERE') { opEl.innerText = '-'; descEl.innerText = '🔑 API key gerekli'; return; }
    if (aiInflight.has(satName)) return;
    aiInflight.add(satName);
    opEl.innerText = descEl.innerText = '...';
    section.classList.add('loading');
    const lang   = localStorage.getItem('selectedLang') || 'en';
    const prompt = `Satellite:"${satName}" lang:"${lang}". Respond ONLY with raw JSON (no markdown): {"operator":"<builder/operator>","description":"<2-3 sentences: launch year, purpose, orbit, notable facts>"}`;
    try {
        const res  = await fetch(GEMINI_URL + GEMINI_KEY, {
            method:'POST', headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ maxOutputTokens:250, temperature:0.1 } })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates?.length) throw new Error('Empty response');
        let raw = (data.candidates[0]?.content?.parts?.[0]?.text || '').replace(/```json/g,'').replace(/```/g,'').trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON');
        const obj = JSON.parse(match[0]);
        aiCacheSet(satName, obj);
        opEl.innerText   = obj.operator    || 'Unknown';
        descEl.innerText = obj.description || '-';
    } catch(e) {
        opEl.innerText = '-'; descEl.innerText = '⚠️ ' + e.message;
    }
    aiInflight.delete(satName);
    section.classList.remove('loading');
}

function updateSatellitePosition() {
    if (!selectedSat) return;
    const now = getSimTime();
    if (!isFinite(now.getTime())) return;
    const p = getPos(selectedSat.satrec, now);
    if (!p) return;
    document.getElementById('satLat').innerText = p.lat.toFixed(4) + '°';
    document.getElementById('satLng').innerText = p.lng.toFixed(4) + '°';
    const pv = satellite.propagate(selectedSat.satrec, now);
    if (pv.position) {
        const { x, y, z } = pv.position;
        if (!isFinite(x)||!isFinite(y)||!isFinite(z)) return;
        const alt = Math.sqrt(x*x+y*y+z*z) - 6371;
        if (!isFinite(alt)||alt<0) return;
        document.getElementById('satAlt').innerText   = alt.toFixed(2);
        document.getElementById('satOrbit').innerText = getOrbitName(alt);
        if (pv.velocity) {
            const { x:vx,y:vy,z:vz } = pv.velocity;
            if (isFinite(vx)&&isFinite(vy)&&isFinite(vz))
                document.getElementById('satVel').innerText = Math.sqrt(vx*vx+vy*vy+vz*vz).toFixed(2);
        }
    }
}

// ── getPos ───────────────────────────────────
function getPos(satrec, date) {
    if (!isFinite(date.getTime())) return null;
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        const { x,y,z } = pv.position;
        if (!isFinite(x)||!isFinite(y)||!isFinite(z)) return null;
        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;
        const g   = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(g.latitude);
        const lng = satellite.degreesLong(g.longitude);
        if (!isFinite(lat)||!isFinite(lng)) return null;
        return { lat, lng };
    } catch { return null; }
}

// ============================================
// OPTIMIZED NIGHT LAYER
// FIX 1: Step 20px instead of 6px → 11x fewer SunCalc calls
// FIX 2: Throttle to max 1 draw/second
// FIX 3: Debounce 120ms on map events
// FIX 4: Skip during active pan
// ============================================
let nightLayerRef = null;
let _mapDragging  = false;
map.on('dragstart', () => { _mapDragging = true; });
map.on('dragend',   () => { _mapDragging = false; nightLayerRef?._scheduleDraw(); });

const NightLayer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
        m.getPanes().overlayPane.appendChild(this._c);
        this._lastDrawMs = 0; this._lastSimMs = 0; this._pending = false;
        m.on('moveend zoomend viewreset', () => this._scheduleDraw());
        this._scheduleDraw();
    },
    _scheduleDraw() {
        if (this._pending) return;
        this._pending = true;
        setTimeout(() => { this._pending = false; if (!_mapDragging) this._reset(); }, 120);
    },
    _reset() {
        const s = map.getSize(), tl = map.containerPointToLayerPoint([0,0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x; this._c.height = s.y;
        this._draw();
    },
    _draw() {
        const now = getSimTime();
        if (!isFinite(now.getTime())) return;
        const nowMs = Date.now(), simMs = now.getTime();
        const simJumped = Math.abs(simMs - this._lastSimMs) > 60_000;
        if (nowMs - this._lastDrawMs < 1000 && !simJumped) return;
        this._lastDrawMs = nowMs; this._lastSimMs = simMs;

        const s = map.getSize(), ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        const STEP = 20; // was 6 — 11x faster, blur hides pixel size
        for (let y = 0; y < s.y; y += STEP) {
            for (let x = 0; x < s.x; x += STEP) {
                const ll = map.containerPointToLatLng([x, y]);
                if (!ll || ll.lat > 85 || ll.lat < -85) continue;
                const pos = SunCalc.getPosition(now, ll.lat, ll.lng);
                const alt = pos.altitude * 180 / Math.PI;
                let d = 0;
                if      (alt < -18) d = 0.5;
                else if (alt < -12) d = 0.35 + ((alt+12)/-6)*0.15;
                else if (alt <  -6) d = 0.2  + ((alt+6) /-6)*0.15;
                else if (alt <   0) d = (alt/-6)*0.2;
                if (d > 0) { ctx.fillStyle = `rgba(10,14,39,${d})`; ctx.fillRect(x,y,STEP,STEP); }
            }
        }
        ctx.filter = 'blur(18px)'; ctx.drawImage(this._c, 0, 0); ctx.filter = 'none';
    }
});
nightLayerRef = new NightLayer();
nightLayerRef.addTo(map);

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
        const s = map.getSize(), tl = map.containerPointToLayerPoint([0,0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x; this._c.height = s.y;
        this._draw();
    },
    _hitTest(x, y) {
        if (!this._d) return null;
        for (const sat of this._d) {
            const pos = satPositions.get(sat.name);
            const r   = sat.type !== 'normal' ? 20 : 6;
            if (pos && Math.hypot(pos.x-x, pos.y-y) < r) return sat;
        }
        return null;
    },
    _onMouseMove(e) {
        if (!showLabels) return;
        const rect = this._c.getBoundingClientRect();
        const found = this._hitTest(e.clientX-rect.left, e.clientY-rect.top);
        const tooltip = document.getElementById('tooltip');
        if (found) {
            tooltip.innerText = found.name;
            tooltip.style.left = (e.clientX+15)+'px';
            tooltip.style.top  = (e.clientY-10)+'px';
            tooltip.style.display = 'block';
        } else tooltip.style.display = 'none';
    },
    _onClick(e) {
        const rect  = this._c.getBoundingClientRect();
        const found = this._hitTest(e.clientX-rect.left, e.clientY-rect.top);
        if (found) openSatelliteInfo(found);
    },
    _draw() {
        if (!this._d) return;
        const now = getSimTime();
        if (!isFinite(now.getTime())) return;
        const s   = map.getSize(), ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        satPositions.clear();
        const PAD = 60;
        for (const sat of this._d) {
            const p = getPos(sat.satrec, now);
            if (!p) continue;
            const lng = normalizeLng(p.lng);
            const pt  = map.latLngToContainerPoint([p.lat, lng]);
            if (pt.x < -PAD || pt.x > s.x+PAD || pt.y < -PAD || pt.y > s.y+PAD) continue;
            satPositions.set(sat.name, { x:pt.x, y:pt.y });
            if (sat.type !== 'normal') {
                ctx.save(); ctx.translate(pt.x, pt.y);
                ctx.font = '28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowBlur = 15;
                const colors = { iss:'rgba(167,139,250,0.8)', tiangong:'rgba(192,132,252,0.8)', hubble:'rgba(129,140,248,0.8)' };
                ctx.shadowColor = colors[sat.type] || 'rgba(255,255,255,0.5)';
                ctx.fillText('🛰️', 0, 0); ctx.restore();
            } else {
                const alt = satAltitudes.get(sat.name) || 0;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, 1, 0, Math.PI*2);
                ctx.fillStyle = getOrbitColor(alt); ctx.fill();
            }
        }
    }
});
layer = new SatLayer();
layer.addTo(map);
console.log('✅ Satellite layer added');

// ============================================
// TLE LOADING — localStorage cache (4h TTL)
// Eliminates network fetch on every page load
// ============================================
const TLE_CACHE_KEY = 'mapsat_tle_data';
const TLE_CACHE_TS  = 'mapsat_tle_ts';
const TLE_TTL_MS    = 4 * 60 * 60 * 1000;
const TLE_SOURCES   = [
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    'https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
];

function parseTLE(tle) {
    const lines = tle.split('\n'), data = [];
    for (let i = 0; i < lines.length - 2; i += 3) {
        const n = lines[i].trim();
        if (!n || !lines[i+2]) continue;
        let type = 'normal', isTrain = false;
        if      (n === 'ISS (ZARYA)')        type    = 'iss';
        else if (n === 'CSS (MENGTIAN)')      type    = 'tiangong';
        else if (n === 'HST')                 type    = 'hubble';
        else if (/^STARLINK-\d{4,}$/.test(n)) isTrain = true;
        const satrec = satellite.twoline2satrec(lines[i+1].trim(), lines[i+2].trim());
        if (!satrec) continue;
        data.push({ satrec, type, name:n, isTrain });
        const pv = satellite.propagate(satrec, new Date());
        if (pv.position) {
            const { x,y,z } = pv.position;
            if (isFinite(x)&&isFinite(y)&&isFinite(z)) {
                const alt = Math.sqrt(x*x+y*y+z*z) - 6371;
                if (isFinite(alt)&&alt>=0) satAltitudes.set(n, alt);
            }
        }
    }
    return data;
}

function getTLEFromCache() {
    try {
        const ts  = parseInt(localStorage.getItem(TLE_CACHE_TS)||'0', 10);
        const raw = localStorage.getItem(TLE_CACHE_KEY);
        if (raw && Date.now()-ts < TLE_TTL_MS) {
            console.log(`✅ TLE from cache (${Math.round((Date.now()-ts)/60000)}m old)`);
            return raw;
        }
    } catch {}
    return null;
}

function saveTLEToCache(raw) {
    try {
        localStorage.setItem(TLE_CACHE_KEY, raw);
        localStorage.setItem(TLE_CACHE_TS, Date.now().toString());
    } catch {
        try { localStorage.removeItem(TLE_CACHE_KEY); localStorage.removeItem(TLE_CACHE_TS); } catch {}
    }
}

async function fetchTLE() {
    const cached = getTLEFromCache();
    if (cached) return cached;
    for (const url of TLE_SOURCES) {
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 12000);
            const res  = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (text.length < 1000) throw new Error('Too short');
            saveTLEToCache(text);
            console.log(`✅ TLE fetched from network`);
            return text;
        } catch(e) { console.warn(`⚠️ ${url}: ${e.message}`); }
    }
    throw new Error('All TLE sources failed');
}

document.getElementById('info').innerText = '...';

fetchTLE()
    .then(tle => {
        const data = parseTLE(tle);
        layer._d = data; allSatellites = data;
        document.getElementById('info').innerText = data.length;
        console.log(`✅ ${data.length} satellites loaded`);

        let _lastOrbitRefresh = 0, _nightTick = 0;

        // Animation loop — 200ms interval
        setInterval(() => {
            const now = getSimTime();
            if (!isFinite(now.getTime())) return;
            updateTimeDisplay();
            layer._draw();
            updateSatellitePosition();

            // Tracking: pan to satellite
            if (trackingSat) {
                const pos = getPos(trackingSat.satrec, now);
                if (pos) map.panTo([pos.lat, normalizeLng(pos.lng)], { animate:true, duration:0.4, easeLinearity:0.5 });
            }

            // Orbit path: max 1 refresh per 5s
            const rNow = Date.now();
            if (selectedSat && rNow - _lastOrbitRefresh > 5000) {
                drawOrbitPath(selectedSat); _lastOrbitRefresh = rNow;
            }

            // Night layer: trigger every 30s real-time (1x warp)
            _nightTick++;
            if (_nightTick % 150 === 0) nightLayerRef?._scheduleDraw();

        }, 200);
    })
    .catch(err => {
        console.error('❌ TLE error:', err);
        document.getElementById('info').innerText = 'ERR';
    });

// ── GitHub Auth ──────────────────────────────
const GITHUB_CLIENT_ID = 'Ov23liGR0rMbfspzNYrn';
const REDIRECT_URI     = window.location.origin + window.location.pathname;

function githubLogin() {
    const user = localStorage.getItem('github_user');
    if (user) {
        if (confirm('Do you want to sign out?')) {
            localStorage.removeItem('github_user'); localStorage.removeItem('github_token');
            updateGitHubButton();
        }
    } else {
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;
    }
}
function updateGitHubButton() {
    const btn = document.getElementById('githubBtn'), user = localStorage.getItem('github_user');
    if (user) { btn.classList.add('logged-in'); btn.title = `Signed in as ${JSON.parse(user).login}`; }
    else      { btn.classList.remove('logged-in'); btn.title = 'Sign in with GitHub'; }
}
window.addEventListener('load', () => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
        const u = { login:'user_'+Math.random().toString(36).substr(2,5), id:Date.now(),
                    avatar_url:'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png' };
        localStorage.setItem('github_user', JSON.stringify(u));
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    updateGitHubButton();
});

// ── Dynamic Light ────────────────────────────
document.addEventListener('mousemove', (e) => {
    const light = document.getElementById('dynamicLight');
    if (light) { light.style.left = `${e.clientX-300}px`; light.style.top = `${e.clientY-300}px`; }
});

updateTimeDisplay();

// ── Theme ────────────────────────────────────
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mapsat_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme===theme));
}
(function() {
    const saved = localStorage.getItem('mapsat_theme') || 'mission';
    document.documentElement.setAttribute('data-theme', saved);
    window.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme===saved));
    });
})();

// ============================================
// SATELLITE TRACKING
// ============================================
function toggleTracking() {
    if (!selectedSat) return;
    if (trackingSat === selectedSat) {
        trackingSat = null;
        const btn = document.getElementById('trackBtn');
        btn.classList.remove('active');
        btn.querySelector('.track-btn-icon').textContent = '🎯';
        btn.querySelector('.track-btn-label').textContent = 'TRACK SATELLITE';
    } else {
        trackingSat = selectedSat;
        const btn = document.getElementById('trackBtn');
        btn.classList.add('active');
        btn.querySelector('.track-btn-icon').textContent = '⏹';
        btn.querySelector('.track-btn-label').textContent = 'STOP TRACKING';
    }
}

// ============================================
// 3D GLOBE
// ============================================
let is3DMode = false, isLeoZoom = false;
let globeScene, globeCamera, globeRenderer;
let globeEarth, globeAtm, globeSatPoints;
let globeMouseDown = false, globeLastMouse = { x:0, y:0 };
let globeRotX = 0.3, globeRotY = 0;
let globeAnimFrame = null, lastGlobeUpdate = 0;
const EARTH_R = 2;

function toggle3DMode() {
    is3DMode = !is3DMode;
    const btn = document.getElementById('btn3D'), leoBtn = document.getElementById('leoZoomBtn');
    const container = document.getElementById('globe-container');
    btn.classList.toggle('active', is3DMode);
    container.style.display = is3DMode ? 'block' : 'none';
    leoBtn.disabled = !is3DMode;
    leoBtn.classList.toggle('leo-available', is3DMode);
    if (is3DMode) {
        if (!globeScene) initGlobe();
        if (globeAnimFrame) cancelAnimationFrame(globeAnimFrame);
        renderGlobe();
    } else {
        if (globeAnimFrame) { cancelAnimationFrame(globeAnimFrame); globeAnimFrame = null; }
        if (isLeoZoom) { isLeoZoom = false; leoBtn.classList.remove('active'); }
    }
}

function latLngAltTo3D(lat, lng, alt, altScale) {
    const r   = EARTH_R + (alt/6371)*EARTH_R*altScale;
    const phi = (90-lat)*Math.PI/180, tht = (lng+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(tht), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(tht));
}

function initGlobe() {
    const container = document.getElementById('globe-container');
    globeScene  = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
    globeCamera.position.z = 7;
    globeRenderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    globeRenderer.setSize(window.innerWidth, window.innerHeight);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    globeRenderer.setClearColor(0x000000, 0);
    container.appendChild(globeRenderer.domElement);

    const starPos = [];
    for (let i = 0; i < 6000; i++) {
        const phi = Math.acos(2*Math.random()-1), tht = Math.random()*Math.PI*2, r = 80+Math.random()*20;
        starPos.push(r*Math.sin(phi)*Math.cos(tht), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(tht));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    globeScene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:0.25 })));

    const loader = new THREE.TextureLoader();
    globeEarth   = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R,64,64),
        new THREE.MeshPhongMaterial({ map:loader.load('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Land_ocean_ice_cloud_hires.jpg/1024px-Land_ocean_ice_cloud_hires.jpg'), specular:new THREE.Color(0x111111), shininess:8 }));
    globeScene.add(globeEarth);

    globeAtm = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.04,32,32),
        new THREE.MeshPhongMaterial({ color:0x0088ff, transparent:true, opacity:0.08, side:THREE.BackSide }));
    globeScene.add(globeAtm);

    globeScene.add(new THREE.AmbientLight(0x222244));
    const sun = new THREE.DirectionalLight(0xfff5ee, 1.3); sun.position.set(8,4,6); globeScene.add(sun);
    const fill = new THREE.DirectionalLight(0x4466aa, 0.3); fill.position.set(-8,-4,-6); globeScene.add(fill);

    const c = globeRenderer.domElement;
    c.addEventListener('mousedown',  e => { globeMouseDown=true; globeLastMouse={x:e.clientX,y:e.clientY}; });
    c.addEventListener('mouseup',    () => { globeMouseDown=false; });
    c.addEventListener('mouseleave', () => { globeMouseDown=false; });
    c.addEventListener('mousemove',  e => {
        if (!globeMouseDown) return;
        globeRotY+=(e.clientX-globeLastMouse.x)*0.006;
        globeRotX+=(e.clientY-globeLastMouse.y)*0.006;
        globeRotX=Math.max(-1.4,Math.min(1.4,globeRotX));
        globeLastMouse={x:e.clientX,y:e.clientY};
    });
    c.addEventListener('wheel', e => {
        e.preventDefault();
        globeCamera.position.z=Math.max(2.8,Math.min(18,globeCamera.position.z+e.deltaY*0.012));
    }, { passive:false });
    let tLast=null;
    c.addEventListener('touchstart', e=>{tLast=e.touches[0];},{passive:true});
    c.addEventListener('touchend',   ()=>{tLast=null;});
    c.addEventListener('touchmove',  e=>{
        if(!tLast)return;
        const t=e.touches[0];
        globeRotY+=(t.clientX-tLast.clientX)*0.006;
        globeRotX+=(t.clientY-tLast.clientY)*0.006;
        globeRotX=Math.max(-1.4,Math.min(1.4,globeRotX));
        tLast=t;
    },{passive:true});
    window.addEventListener('resize', () => {
        if (!globeCamera||!globeRenderer) return;
        globeCamera.aspect=window.innerWidth/window.innerHeight;
        globeCamera.updateProjectionMatrix();
        globeRenderer.setSize(window.innerWidth,window.innerHeight);
    });
    updateGlobeSats();
}

function updateGlobeSats() {
    if (!globeScene||!allSatellites.length) return;
    if (globeSatPoints) { globeScene.remove(globeSatPoints); globeSatPoints=null; }
    const now = getSimTime();
    if (!isFinite(now.getTime())) return;
    const altScale = isLeoZoom ? 9 : 1;
    const positions=[], colors=[];
    const C = {
        vleo:new THREE.Color('#ef4444'), leo:new THREE.Color('#f97316'),
        meo:new THREE.Color('#eab308'), geo:new THREE.Color('#3b82f6'), beyond:new THREE.Color('#a855f7')
    };
    for (const sat of allSatellites) {
        const p = getPos(sat.satrec, now); if (!p) continue;
        const alt = satAltitudes.get(sat.name)||400;
        const v = latLngAltTo3D(p.lat,p.lng,alt,altScale);
        positions.push(v.x,v.y,v.z);
        const col=alt<400?C.vleo:alt<2000?C.leo:alt<35700?C.meo:alt<=35900?C.geo:C.beyond;
        colors.push(col.r,col.g,col.b);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',   new THREE.Float32BufferAttribute(colors,3));
    globeSatPoints=new THREE.Points(geo,new THREE.PointsMaterial({size:0.035,vertexColors:true,sizeAttenuation:true,transparent:true,opacity:0.95}));
    globeScene.add(globeSatPoints);
}

function renderGlobe() {
    if (!is3DMode) return;
    globeAnimFrame = requestAnimationFrame(renderGlobe);
    const now = Date.now();
    if (now-lastGlobeUpdate>600) { updateGlobeSats(); lastGlobeUpdate=now; }
    const qX=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),globeRotX);
    const qY=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),globeRotY);
    const q=qY.multiply(qX);
    globeEarth.quaternion.copy(q); globeAtm.quaternion.copy(q);
    if (globeSatPoints) globeSatPoints.quaternion.copy(q);
    globeRenderer.render(globeScene,globeCamera);
}

function toggleLeoZoom() {
    if (!is3DMode) return;
    isLeoZoom=!isLeoZoom;
    document.getElementById('leoZoomBtn').classList.toggle('active',isLeoZoom);
    const targetZ=isLeoZoom?3.8:7;
    const step=()=>{
        if (!globeCamera) return;
        const diff=targetZ-globeCamera.position.z;
        if (Math.abs(diff)<0.01){globeCamera.position.z=targetZ;return;}
        globeCamera.position.z+=diff*0.12;
        requestAnimationFrame(step);
    };
    step(); updateGlobeSats();
}

console.log('🎉 Satellite Tracker v0.6 ready!');
