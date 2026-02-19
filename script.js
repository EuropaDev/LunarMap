// ============================================
// SATELLITE TRACKER - DEBUGGED & OPTIMIZED
// ============================================

console.log('🛰️ Starting Satellite Tracker...');

const satelliteImages = {
    iss: 'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Tiangong_space_station.png/800px-Tiangong_space_station.png',
    hubble: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://commons.wikimedia.org/wiki/File:Starlink_Mission_(47926144123).jpg',
    normal: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png'
};

let layer = null;
let selectedSat = null;
let satPositions = new Map();
let satAltitudes = new Map();
let showLabels = true;
let showGrid = false;
let showBorders = false;
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

console.log('✅ Variables initialized');

// Initialize map
const map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 10,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

console.log('✅ Map created');

// Base layers
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

console.log('✅ Base layer added');

// ============================================
// UI FUNCTIONS
// ============================================

function toggleMenu() {
    const menuSidebar = document.getElementById('menuSidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    const menuOverlay = document.getElementById('menuOverlay');
    
    menuSidebar.classList.toggle('active');
    menuToggle.classList.toggle('active');
    menuOverlay.classList.toggle('active');
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId + 'Section');
    const button = event.currentTarget;
    
    section.classList.toggle('active');
    button.classList.toggle('active');
}

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
    
    console.log('⏱️ Time warp:', speed);
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
    console.log('🔄 Time reset');
}

function updateTimeDisplay() {
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('timeDisplay').innerText = simulationTime.toLocaleString('en-US', options);
}

function cycleMapStyle() {
    map.removeLayer(currentBaseLayer);
    mapStyle = (mapStyle + 1) % 3;
    currentBaseLayer = baseLayers[mapStyle];
    currentBaseLayer.addTo(map);
    console.log('🗺️ Map style:', mapStyle);
}

function toggleLabels() {
    showLabels = !showLabels;
    document.getElementById('labelBtn').classList.toggle('active', showLabels);
    console.log('🏷️ Labels:', showLabels);
}

function toggleGrid() {
    showGrid = !showGrid;
    document.getElementById('gridBtn').classList.toggle('active', showGrid);
    
    if (showGrid) {
        if (!gridLayer) {
            gridLayer = L.layerGroup();
            for (let lat = -80; lat <= 80; lat += 20) {
                L.polyline([[lat, -180], [lat, 180]], { 
                    color: 'rgba(148,163,184,0.3)', 
                    weight: 1, 
                    interactive: false 
                }).addTo(gridLayer);
            }
            for (let lng = -180; lng <= 180; lng += 20) {
                L.polyline([[-85, lng], [85, lng]], { 
                    color: 'rgba(148,163,184,0.3)', 
                    weight: 1, 
                    interactive: false 
                }).addTo(gridLayer);
            }
        }
        gridLayer.addTo(map);
    } else {
        if (gridLayer) map.removeLayer(gridLayer);
    }
    
    console.log('🌐 Grid:', showGrid);
}

function toggleBorders() {
    showBorders = !showBorders;
    document.getElementById('borderBtn').classList.toggle('active', showBorders);
    
    if (showBorders) {
        if (!borderLayer) {
            borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
                opacity: 0.7,
                maxZoom: 10
            });
        }
        borderLayer.addTo(map);
    } else {
        if (borderLayer) map.removeLayer(borderLayer);
    }
    
    console.log('🗺️ Borders:', showBorders);
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
                icon: L.divIcon({
                    className: 'user-location',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).addTo(map);
            
            console.log('📍 Location:', lat, lng);
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
// SEARCH
// ============================================

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchTimeout;

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }

        const filtered = allSatellites.filter(sat => 
            sat.name.toLowerCase().includes(query)
        ).slice(0, 10);

        if (filtered.length > 0) {
            searchResults.innerHTML = filtered.map(sat => 
                `<div class="search-result-item" onclick="selectSatellite('${sat.name.replace(/'/g, "\\'")}')">${sat.name}</div>`
            ).join('');
            searchResults.classList.add('show');
        } else {
            searchResults.classList.remove('show');
        }
    }, 300);
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
    }
});

function selectSatellite(name) {
    const sat = allSatellites.find(s => s.name === name);
    if (sat) {
        const p = getPos(sat.satrec, simulationTime);
        if (p) {
            map.flyTo([p.lat, p.lng], 10, { duration: 1.5 });
        }
        openSatelliteInfo(sat);
        searchResults.classList.remove('show');
        searchInput.value = '';
        console.log('🔍 Selected:', name);
    }
}

// ============================================
// ORBIT HELPERS
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
    if (alt < 400) return 'VLEO';
    if (alt < 2000) return 'LEO';
    if (alt < 35700) return 'MEO';
    if (alt >= 35700 && alt <= 35900) return 'GEO';
    if (alt > 35900) return 'Beyond GEO';
    return 'HEO';
}

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
// SIDEBAR
// ============================================

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    selectedSat = null;
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
    else if (sat.isTrain) imgSrc = satelliteImages.starlink;

    imgElement.onload = () => {
        loadingElement.style.display = 'none';
        imgElement.style.display = 'block';
    };
    
    imgElement.onerror = () => {
        loadingElement.innerText = 'Image failed';
    };
    
    imgElement.src = imgSrc;

    const typeNames = { 
        iss: 'International Space Station', 
        tiangong: 'Tiangong Space Station', 
        hubble: 'Hubble Space Telescope' 
    };
    
    document.getElementById('satType').innerText = sat.isTrain ? 'Starlink Train' : (typeNames[sat.type] || 'Satellite');

    updateSatellitePosition();
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
        
        for (let y = 0; y < s.y; y += 10) {
            for (let x = 0; x < s.x; x += 10) {
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
                    ctx.fillRect(x, y, 10, 10);
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
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                if (sat.type === 'iss') {
                    ctx.shadowColor = 'rgba(167,139,250,0.8)';
                } else if (sat.type === 'tiangong') {
                    ctx.shadowColor = 'rgba(192,132,252,0.8)';
                } else {
                    ctx.shadowColor = 'rgba(129,140,248,0.8)';
                }
                
                ctx.shadowBlur = 10;
                ctx.fillText('🛰️', 0, 0);
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
// LOAD TLE DATA
// ============================================

console.log('📡 Fetching TLE...');

fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
    })
    .then(tle => {
        console.log('📡 TLE received, length:', tle.length);
        
const lines = tle.split('\n');
const data = [];
const specialSats = new Set(); // ISS, Hubble, Tiangong sadece 1 kez

for (let i = 0; i < lines.length - 2; i += 3) {
    const n = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    
    if (!n || !l1 || !l2) continue;
    
    let type = 'normal', isTrain = false;

    if (n.includes('ISS') && !n.includes('PROGRESS') && !n.includes('DRAGON')) {
        if (specialSats.has('iss')) continue; // Skip duplicate ISS
        type = 'iss';
        specialSats.add('iss');
    } else if (n.includes('TIANGONG')) {
        if (specialSats.has('tiangong')) continue; // Skip duplicate
        type = 'tiangong';
        specialSats.add('tiangong');
    } else if (n.includes('HUBBLE') || n.includes('HST')) {
        if (specialSats.has('hubble')) continue; // Skip duplicate
        type = 'hubble';
        specialSats.add('hubble');
    } else if (n.includes('STARLINK') && n.match(/STARLINK-\d{4,}/)) {
        isTrain = true;
    }
            try {
                const satrec = satellite.twoline2satrec(l1, l2);
                if (satrec) {
                    data.push({ satrec, type, name: n, isTrain });
                    const pv = satellite.propagate(satrec, new Date());
                    if (pv.position) {
                        const alt = Math.sqrt(pv.position.x ** 2 + pv.position.y ** 2 + pv.position.z ** 2) - 6371;
                        satAltitudes.set(n, alt);
                    }
                }
            } catch (e) {
                // Skip invalid
            }
        }
        
        layer._d = data;
        allSatellites = data;
        document.getElementById('info').innerText = data.length;
        
        console.log('✅ Loaded', data.length, 'satellites');
        
        // Animation loop
        const drawLoop = () => {
            if (timeWarp > 0) {
                const elapsed = Date.now() - realStartTime.getTime();
                simulationTime = new Date(realStartTime.getTime() + elapsed * timeWarp);
                updateTimeDisplay();
            }
            if (layer && layer._draw) layer._draw();
            updateSatellitePosition();
            requestAnimationFrame(drawLoop);
        };
        requestAnimationFrame(drawLoop);
        
        console.log('✅ Animation started');
    })
    .catch(err => {
        console.error('❌ TLE error:', err);
        document.getElementById('info').innerText = 'ERR';
        setTimeout(() => location.reload(), 5000);
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
        }
    } else {
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;
        window.location.href = authUrl;
    }
}

function updateGitHubButton() {
    const btn = document.getElementById('githubBtn');
    const user = localStorage.getItem('github_user');
    
    if (user) {
        btn.classList.add('logged-in');
        const userData = JSON.parse(user);
        btn.title = `Signed in as ${userData.login}`;
    } else {
        btn.classList.remove('logged-in');
        btn.title = 'Sign in with GitHub';
    }
}

window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        const mockUser = {
            login: 'user_' + Math.random().toString(36).substr(2, 5),
            id: Date.now()
        };
        
        localStorage.setItem('github_user', JSON.stringify(mockUser));
        updateGitHubButton();
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    updateGitHubButton();
});

// Google Translate cleanup
setTimeout(() => {
    const elements = document.querySelectorAll('.goog-te-gadget span');
    elements.forEach(el => {
        if (el.textContent.includes('Powered by') || 
            el.textContent.includes('Translate') ||
            el.textContent.includes(':')) {
            el.style.display = 'none';
        }
    });
}, 1500);

updateTimeDisplay();

console.log('🎉 Ready!');
