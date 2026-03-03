// ============================================
// SATELLITE TRACKER - MAIN SCRIPT
// ============================================

console.log('🛰️ Satellite Tracker v0.4 - Initializing...');

// Satellite image URLs
const satelliteImages = {
    iss: 'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg?_=20221203083003',
    hubble: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png',
    santasat: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Christmas_satellite.jpg/320px-Christmas_satellite.jpg',
    // FIX: Güvenilir UFO görseli (Wikimedia)
    ufo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Sputnik_asm.jpg/320px-Sputnik_asm.jpg'
};

// Global variables
let layer = null;
let selectedSat = null;
let satPositions = new Map();
let satAltitudes = new Map();
let showLabels = true;
let showGrid = false;
let showBorders = false;
let showClouds = false;
let cloudLayer = null;
let gridLayer = null;
let borderLayer = null;
let userMarker = null;
let mapStyle = 0;
let baseLayers = [];
let currentBaseLayer = null;
let userLocation = null;
let allSatellites = [];
let timeWarp = 1;
let simulationTime = new Date();
let realStartTime = new Date();
let orbitPathLayer = null;

console.log('✅ Variables initialized');

// Initialize map
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

// Base map layers
baseLayers[0] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    noWrap: true,
    bounds: [[-85, -180], [85, 180]]
});
baseLayers[1] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    noWrap: true,
    bounds: [[-85, -180], [85, 180]]
});
baseLayers[2] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    noWrap: true,
    bounds: [[-85, -180], [85, 180]]
});

currentBaseLayer = baseLayers[0];
currentBaseLayer.addTo(map);

console.log('✅ Base layers loaded');

// ============================================
// FIX: TRANSLATION (i18n) - postMessage Listener
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
    if (e.data && e.data.type === 'langChange' && e.data.translations) {
        applyTranslations(e.data.translations);
        console.log(`🌐 Language applied: ${e.data.lang}`);
    }
});

// ============================================
// MENU FUNCTIONS
// ============================================

function toggleMenu() {
    const menuSidebar = document.getElementById('menuSidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    const menuOverlay = document.getElementById('menuOverlay');
    menuSidebar.classList.toggle('active');
    menuToggle.classList.toggle('active');
    menuOverlay.classList.toggle('active');
    console.log('📋 Menu toggled');
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId + 'Section');
    const button = event.currentTarget;
    section.classList.toggle('active');
    button.classList.toggle('active');
    console.log(`📂 Section ${sectionId} toggled`);
}

// ============================================
// TIME WARP FUNCTIONS
// ============================================

function setTimeWarp(speed) {
    timeWarp = speed;
    realStartTime = new Date(simulationTime);
    document.querySelectorAll('.timewarp-btn').forEach(btn => {
        if (!btn.classList.contains('timewarp-reset')) {
            btn.classList.remove('active');
        }
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    console.log(`⏱️ Time warp set to ${speed}x`);
}

function resetTime() {
    simulationTime = new Date();
    realStartTime = new Date();
    timeWarp = 1;
    document.querySelectorAll('.timewarp-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.timewarp-btn')[1].classList.add('active');
    updateTimeDisplay();
    console.log('🔄 Time reset to current');
}

function updateTimeDisplay() {
    const options = {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    };
    document.getElementById('timeDisplay').innerText = simulationTime.toLocaleString('en-US', options);
}

// ============================================
// MAP CONTROL FUNCTIONS
// ============================================

function cycleMapStyle() {
    map.removeLayer(currentBaseLayer);
    mapStyle = (mapStyle + 1) % 3;
    currentBaseLayer = baseLayers[mapStyle];
    currentBaseLayer.addTo(map);
    console.log(`🗺️ Map style changed to ${mapStyle}`);
}

function toggleLabels() {
    showLabels = !showLabels;
    document.getElementById('labelBtn').classList.toggle('active', showLabels);
    console.log(`🏷️ Labels ${showLabels ? 'enabled' : 'disabled'}`);
}

function toggleGrid() {
    showGrid = !showGrid;
    document.getElementById('gridBtn').classList.toggle('active', showGrid);
    if (showGrid) {
        if (!gridLayer) {
            gridLayer = L.layerGroup();
            for (let lat = -80; lat <= 80; lat += 20) {
                L.polyline([[lat, -180], [lat, 180]], {
                    color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false
                }).addTo(gridLayer);
            }
            for (let lng = -180; lng <= 180; lng += 20) {
                L.polyline([[-85, lng], [85, lng]], {
                    color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false
                }).addTo(gridLayer);
            }
        }
        gridLayer.addTo(map);
    } else {
        if (gridLayer) map.removeLayer(gridLayer);
    }
    console.log(`🌐 Grid ${showGrid ? 'enabled' : 'disabled'}`);
}

function toggleBorders() {
    showBorders = !showBorders;
    document.getElementById('borderBtn').classList.toggle('active', showBorders);
    if (showBorders) {
        if (!borderLayer) {
            borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
                opacity: 0.7, maxZoom: 8
            });
        }
        borderLayer.addTo(map);
    } else {
        if (borderLayer) map.removeLayer(borderLayer);
    }
    console.log(`🗺️ Borders ${showBorders ? 'enabled' : 'disabled'}`);
}

function toggleClouds() {
    showClouds = !showClouds;
    document.getElementById('cloudBtn') && document.getElementById('cloudBtn').classList.toggle('active', showClouds);
    if (showClouds) {
        if (!cloudLayer) {
            cloudLayer = L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=546c29aeefa27989df830200ec92848e', {
                opacity: 0.5, maxZoom: 8
            });
        }
        cloudLayer.addTo(map);
    } else {
        if (cloudLayer) map.removeLayer(cloudLayer);
    }
    console.log(`☁️ Clouds ${showClouds ? 'enabled' : 'disabled'}`);
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
            console.log(`📍 Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        });
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length < 2) {
        searchResults.classList.remove('show');
        return;
    }
    // FIX: UFO'yu arama sonuçlarından hariç tut
    const filtered = allSatellites.filter(sat =>
        sat.name.toLowerCase().includes(query) && sat.type !== 'ufo'
    ).slice(0, 10);

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
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
    }
});

function selectSatellite(name) {
    const sat = allSatellites.find(s => s.name === name);
    if (sat) {
        openSatelliteInfo(sat);
        searchResults.classList.remove('show');
        searchInput.value = '';
        // Haritada uyduya uç
        const pos = getPos(sat.satrec, simulationTime);
        if (pos) {
            let lng = pos.lng;
            while (lng > 180) lng -= 360;
            while (lng < -180) lng += 360;
            map.flyTo([pos.lat, lng], 5, { duration: 1.8, easeLinearity: 0.4 });
        }
        console.log(`🔍 Selected & flying to: ${name}`);
    }
}

// ============================================
// ORBIT FUNCTIONS
// ============================================

function getOrbitColor(alt) {
    if (alt < 400) return '#ef4444';
    if (alt < 2000) return '#f97316';
    if (alt < 35700) return '#eab308';
    if (alt >= 35700 && alt <= 35900) return '#3b82f6';
    if (alt > 35900) return '#a855f7';
    return '#22c55e';
}

function getOrbitName(alt) {
    if (selectedSat) {
        if (selectedSat.type === 'santasat') return 'Ho Ho Ho! 🎅🎄';
        if (selectedSat.type === 'ufo') return 'CLASSIFIED 🛸👽';
    }
    if (alt < 400) return 'VLEO';
    if (alt < 2000) return 'LEO';
    if (alt < 35700) return 'MEO';
    if (alt >= 35700 && alt <= 35900) return 'GEO';
    if (alt > 35900) return 'Beyond GEO';
    return 'HEO';
}

// ============================================
// ORBIT PATH
// ============================================

function drawOrbitPath(sat) {
    if (orbitPathLayer) {
        map.removeLayer(orbitPathLayer);
        orbitPathLayer = null;
    }
    const points = [];
    const now = simulationTime;
    for (let i = 0; i < 90; i++) {
        const time = new Date(now.getTime() + i * 60 * 1000);
        const pos = getPos(sat.satrec, time);
        if (pos) points.push([pos.lat, pos.lng]);
    }
    if (points.length > 0) {
        orbitPathLayer = L.polyline(points, {
            color: '#a78bfa', weight: 3, opacity: 0.7, dashArray: '10, 10'
        }).addTo(map);
        console.log('🛸 Orbit path drawn');
    }
}

// ============================================
// SIDEBAR FUNCTIONS
// ============================================

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    selectedSat = null;
    if (orbitPathLayer) {
        map.removeLayer(orbitPathLayer);
        orbitPathLayer = null;
    }
    console.log('❌ Sidebar closed');
}

function openSatelliteInfo(sat) {
    selectedSat = sat;
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.getElementById('satName').innerText = sat.name;

    const imgElement = document.getElementById('satImage');
    const loadingElement = document.getElementById('imageLoading');
    loadingElement.style.display = 'block';
    imgElement.style.display = 'none';

    let imgSrc = satelliteImages.normal;
    if (sat.type === 'iss') imgSrc = satelliteImages.iss;
    else if (sat.type === 'tiangong') imgSrc = satelliteImages.tiangong;
    else if (sat.type === 'hubble') imgSrc = satelliteImages.hubble;
    else if (sat.type === 'santasat') imgSrc = satelliteImages.santasat;
    else if (sat.type === 'ufo') imgSrc = satelliteImages.ufo;
    else if (sat.isTrain) imgSrc = satelliteImages.starlink;

    imgElement.onload = () => {
        loadingElement.style.display = 'none';
        imgElement.style.display = 'block';
    };
    imgElement.onerror = () => {
        loadingElement.innerText = 'Image failed';
        console.error('❌ Image load failed:', imgSrc);
    };
    imgElement.src = imgSrc;

    const typeNames = {
        iss: 'International Space Station',
        tiangong: 'Tiangong Space Station',
        hubble: 'Hubble Space Telescope',
        santasat: '🎅 Santa Satellite - Christmas Special',
        ufo: '👽 Unidentified Flying Object'
    };
    document.getElementById('satType').innerText = sat.isTrain ? 'Starlink Train' : (typeNames[sat.type] || 'Satellite');

    updateSatellitePosition();
    drawOrbitPath(sat);
    loadSatAIInfo(sat.name);
    console.log(`ℹ️ Opened info for: ${sat.name}`);
}

// ============================================
// AI INFO — Anthropic API
// ============================================

let aiInfoCache = {};

// ── GEMINI API — Ucretsiz ─────────────────────────────────
// aistudio.google.com -> Get API Key -> buraya yapistir:
const GEMINI_KEY = 'AIzaSyBSaPUESmqGGfQ8KP2myWanPo7v_QQ9LFY';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';
// ──────────────────────────────────────────────────────────

function aiCacheGet(k){try{const v=sessionStorage.getItem('ai_'+k);return v?JSON.parse(v):null;}catch(e){return null;}}
function aiCacheSet(k,v){try{sessionStorage.setItem('ai_'+k,JSON.stringify(v));}catch(e){}}
const aiInflight = new Set();

async function loadSatAIInfo(satName) {
    const opEl    = document.getElementById('satOperator');
    const descEl  = document.getElementById('satDesc');
    const section = document.getElementById('aiDescSection');

    const cached = aiCacheGet(satName);
    if (cached) {
        opEl.innerText   = cached.operator;
        descEl.innerText = cached.description;
        return;
    }

    if (aiInflight.has(satName)) return;
    aiInflight.add(satName);
    opEl.innerText = descEl.innerText = '...';
    section.classList.add('loading');

    const lang   = localStorage.getItem('selectedLang') || 'en';
    const prompt = 'Satellite:"' + satName + '" lang:"' + lang + '". Reply ONLY valid JSON: {"operator":"<builder/operator, 1 line>","description":"<2-3 sentences: launch year, purpose, orbit, notable facts>"}';

    try {
        const res  = await fetch(GEMINI_URL + GEMINI_KEY, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                contents          : [{ parts: [{ text: prompt }] }],
                generationConfig  : { maxOutputTokens: 220, temperature: 0.2 }
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        const raw = (data.candidates[0].content.parts[0].text || '{}')
                        .replace(/```json|```/g, '').trim();
        const obj = JSON.parse(raw);

        aiCacheSet(satName, obj);
        opEl.innerText   = obj.operator    || 'Unknown';
        descEl.innerText = obj.description || '-';
    } catch (e) {
        opEl.innerText = descEl.innerText = '-';
        console.warn('Gemini:', satName, e.message);
    }

    aiInflight.delete(satName);
    section.classList.remove('loading');
}

function updateSatellitePosition() {
    if (!selectedSat) return;
    const p = getPos(selectedSat.satrec, simulationTime);
    if (p) {
        document.getElementById('satLat').innerText = p.lat.toFixed(4) + '°';
        document.getElementById('satLng').innerText = p.lng.toFixed(4) + '°';
        const pv = satellite.propagate(selectedSat.satrec, simulationTime);
        if (pv.position) {
            const alt = Math.sqrt(pv.position.x ** 2 + pv.position.y ** 2 + pv.position.z ** 2) - 6371;
            document.getElementById('satAlt').innerText = alt.toFixed(2);
            document.getElementById('satOrbit').innerText = getOrbitName(alt);
            if (pv.velocity) {
                const vel = Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2);
                document.getElementById('satVel').innerText = vel.toFixed(2);
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
        const s = map.getSize();
        const tl = map.containerPointToLayerPoint([0, 0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x;
        this._c.height = s.y;
        this._draw();
    },
    _draw() {
        const s = map.getSize();
        const ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        for (let y = 0; y < s.y; y += 6) {
            for (let x = 0; x < s.x; x += 6) {
                const ll = map.containerPointToLatLng([x, y]);
                if (!ll || ll.lat > 85 || ll.lat < -85) continue;
                const pos = SunCalc.getPosition(simulationTime, ll.lat, ll.lng);
                const alt = pos.altitude * 180 / Math.PI;
                let d = 0;
                if (alt < -18) d = 0.5;
                else if (alt < -12) d = 0.35 + ((alt + 12) / -6) * 0.15;
                else if (alt < -6) d = 0.2 + ((alt + 6) / -6) * 0.15;
                else if (alt < 0) d = (alt / -6) * 0.2;
                if (d > 0) {
                    ctx.fillStyle = `rgba(10,14,39,${d})`;
                    ctx.fillRect(x, y, 6, 6);
                }
            }
        }
        ctx.filter = 'blur(12px)';
        ctx.drawImage(this._c, 0, 0);
        ctx.filter = 'none';
    }
});

new NightLayer().addTo(map);
console.log('✅ Night layer added');

// ============================================
// SATELLITE LAYER
// ============================================

const Layer = L.Layer.extend({
    onAdd(m) {
        this._c = L.DomUtil.create('canvas', 'leaflet-layer');
        this._c.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer';
        m.getPanes().overlayPane.appendChild(this._c);
        m.on('moveend zoomend viewreset', () => this._reset());
        this._c.addEventListener('click', e => this._onClick(e));
        this._c.addEventListener('mousemove', e => this._onMouseMove(e));
        this._c.addEventListener('mouseout', () => document.getElementById('tooltip').style.display = 'none');
        this._reset();
    },
    _reset() {
        const s = map.getSize();
        const tl = map.containerPointToLayerPoint([0, 0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x;
        this._c.height = s.y;
        this._draw();
    },
    _onMouseMove(e) {
        if (!this._d || !showLabels) return;
        const rect = this._c.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let found = null;
        this._d.forEach(sat => {
            // FIX: UFO haritada tıklanamaz
            if (sat.type === 'ufo') return;
            const pos = satPositions.get(sat.name);
            if (pos && Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2) < (sat.type !== 'normal' ? 20 : 6)) {
                found = { name: sat.name, mx: e.clientX, my: e.clientY };
            }
        });
        const tooltip = document.getElementById('tooltip');
        if (found) {
            tooltip.innerText = found.name;
            tooltip.style.left = (found.mx + 15) + 'px';
            tooltip.style.top = (found.my - 10) + 'px';
            tooltip.style.display = 'block';
        } else {
            tooltip.style.display = 'none';
        }
    },
    _onClick(e) {
        if (!this._d) return;
        const rect = this._c.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this._d.forEach(sat => {
            // FIX: UFO haritada tıklanamaz
            if (sat.type === 'ufo') return;
            const pos = satPositions.get(sat.name);
            if (pos && Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2) < (sat.type !== 'normal' ? 20 : 6)) {
                openSatelliteInfo(sat);
            }
        });
    },
    _draw() {
        if (!this._d) return;
        const s = map.getSize();
        const ctx = this._c.getContext('2d');
        ctx.clearRect(0, 0, s.x, s.y);
        satPositions.clear();

        this._d.forEach(sat => {
            // FIX: UFO haritada çizilmez
            if (sat.type === 'ufo') return;

            const p = getPos(sat.satrec, simulationTime);
            if (!p) return;

            let lng = p.lng;
            while (lng > 180) lng -= 360;
            while (lng < -180) lng += 360;

            const pt = map.latLngToContainerPoint([p.lat, lng]);
            if (pt.x < -50 || pt.x > s.x + 50 || pt.y < -50 || pt.y > s.y + 50) return;

            satPositions.set(sat.name, { x: pt.x, y: pt.y });

            if (sat.type !== 'normal') {
                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.font = '28px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 15;

                if (sat.type === 'iss') {
                    ctx.shadowColor = 'rgba(167,139,250,0.8)';
                    ctx.fillText('🛰️', 0, 0);
                } else if (sat.type === 'tiangong') {
                    ctx.shadowColor = 'rgba(192,132,252,0.8)';
                    ctx.fillText('🛰️', 0, 0);
                } else if (sat.type === 'hubble') {
                    ctx.shadowColor = 'rgba(129,140,248,0.8)';
                    ctx.fillText('🛰️', 0, 0);
                } else if (sat.type === 'santasat') {
                    ctx.shadowColor = 'rgba(255,0,0,0.9)';
                    ctx.fillText('🎅🎄', 0, 0);
                }

                ctx.restore();
            } else {
                const alt = satAltitudes.get(sat.name) || 0;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 1, 0, Math.PI * 2);
                ctx.fillStyle = getOrbitColor(alt);
                ctx.fill();
            }
        });
    }
});

layer = new Layer();
layer.addTo(map);
console.log('✅ Satellite layer added');

// ============================================
// HELPER FUNCTIONS
// ============================================

function getPos(satrec, date) {
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        const g = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
        return {
            lat: satellite.degreesLat(g.latitude),
            lng: satellite.degreesLong(g.longitude)
        };
    } catch (e) {
        return null;
    }
}

// ============================================
// LOAD TLE DATA
// ============================================

console.log('📡 Fetching TLE data...');

// FIX: Easter egg TLE verisini önceden hazırla
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
        console.log('📡 TLE data received, parsing...');

        // Easter egg'leri ekle
        const fullTLE = tle + '\n' + easterEggTLE;
        const lines = fullTLE.split('\n');
        const data = [];

        for (let i = 0; i < lines.length; i += 3) {
            if (!lines[i + 2]) continue;

            const n = lines[i].trim();
            if (!n) continue;

            let type = 'normal';
            let isTrain = false;

            // Kesin isim eşleşmesi (kullanıcı doğruladı)
            if (n === 'ISS (ZARYA)') {
                type = 'iss';
            } else if (n === 'CSS (MENGTIAN)') {
                type = 'tiangong';
            } else if (n === 'HST') {
                type = 'hubble';
            } else if (n.includes('STARLINK') && n.match(/STARLINK-\d{4,}/)) {
                isTrain = true;
            } else if (n.includes('SANTASAT')) {
                type = 'santasat';
            } else if (n.includes('UFO')) {
                type = 'ufo';
            }

            const satrec = satellite.twoline2satrec(lines[i + 1].trim(), lines[i + 2].trim());
            if (satrec) {
                data.push({ satrec, type, name: n, isTrain });

                const pv = satellite.propagate(satrec, new Date());
                if (pv.position) {
                    const alt = Math.sqrt(pv.position.x ** 2 + pv.position.y ** 2 + pv.position.z ** 2) - 6371;
                    satAltitudes.set(n, alt);
                }
            }
        }

        layer._d = data;
        allSatellites = data;

        // FIX: Sayım - UFO'yu hariç tut
        const visibleCount = data.filter(s => s.type !== 'ufo').length;
        document.getElementById('info').innerText = visibleCount;

        console.log(`✅ Loaded ${data.length} satellites (${visibleCount} visible on map)`);
        console.log(`   - ISS: ${data.filter(s => s.type === 'iss').map(s => s.name).join(', ') || 'not found'}`);
        console.log(`   - Tiangong: ${data.filter(s => s.type === 'tiangong').map(s => s.name).join(', ') || 'not found'}`);
        console.log(`   - Hubble: ${data.filter(s => s.type === 'hubble').length}`);
        console.log(`   - Starlink trains: ${data.filter(s => s.isTrain).length}`);

        // Start animation loop
        setInterval(() => {
            if (timeWarp > 0) {
                const elapsed = new Date().getTime() - realStartTime.getTime();
                simulationTime = new Date(realStartTime.getTime() + elapsed * timeWarp);
                updateTimeDisplay();
            }
            layer._draw();
            updateSatellitePosition();
        }, 150);

        console.log('✅ Animation loop started');
    })
    .catch(err => {
        console.error('❌ TLE fetch error:', err);
    });

// ============================================
// GITHUB AUTH
// ============================================

const GITHUB_CLIENT_ID = 'Ov23liGR0rMbfspzNYrn';
const REDIRECT_URI = window.location.origin + window.location.pathname;

function githubLogin() {
    const user = localStorage.getItem('github_user');
    if (user) {
        if (confirm('Do you want to sign out?')) {
            localStorage.removeItem('github_user');
            localStorage.removeItem('github_token');
            updateGitHubButton();
            console.log('👋 GitHub signed out');
        }
    } else {
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;
        window.location.href = authUrl;
        console.log('🔐 Redirecting to GitHub OAuth...');
    }
}

function updateGitHubButton() {
    const btn = document.getElementById('githubBtn');
    const user = localStorage.getItem('github_user');
    if (user) {
        btn.classList.add('logged-in');
        const userData = JSON.parse(user);
        btn.title = `Signed in as ${userData.login}`;
        console.log(`✅ GitHub user: ${userData.login}`);
    } else {
        btn.classList.remove('logged-in');
        btn.title = 'Sign in with GitHub';
    }
}

window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        console.log('🔐 GitHub OAuth code received');
        const mockUser = {
            login: 'user_' + Math.random().toString(36).substr(2, 5),
            id: Date.now(),
            avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
        };
        localStorage.setItem('github_user', JSON.stringify(mockUser));
        updateGitHubButton();
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log('✅ GitHub auth completed (simulated)');
    }
    updateGitHubButton();
});

// Dynamic Light Effect
document.addEventListener('mousemove', (e) => {
    const light = document.getElementById('dynamicLight');
    if (light) {
        light.style.left = `${e.clientX - 300}px`;
        light.style.top = `${e.clientY - 300}px`;
    }
});

// Initialize time display
updateTimeDisplay();

console.log('🎉 Satellite Tracker v0.4 fully initialized!');
console.log('✅ Dynamic Light Active');
console.log('✅ Orbit Path Ready');
console.log('🎅 SantaSat Loaded (map only)');
console.log('🛸 UFO Loaded (sidebar only, hidden on map)');

// ============================================
// TEMA YÖNETİMİ
// ============================================

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mapsat_theme', theme);

    // Aktif butonu güncelle
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    console.log(`🎨 Theme set: ${theme}`);
}

// Kaydedilmiş temayı uygula
(function() {
    const saved = localStorage.getItem('mapsat_theme') || 'mission';
    document.documentElement.setAttribute('data-theme', saved);
    // DOM hazır olunca butonları güncelle
    window.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === saved);
        });
    });
})();
