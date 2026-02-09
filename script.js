const translations = {
    en: {
        liveTracking: 'Live Tracking',
        satellites: 'Satellites',
        type: 'Type',
        orbit: 'Orbit',
        latitude: 'Latitude',
        longitude: 'Longitude',
        altitude: 'Altitude (km)',
        velocity: 'Velocity (km/s)',
        loading: 'Loading...',
        searchPlaceholder: 'Search satellites...'
    },
    tr: {
        liveTracking: 'Canlı Takip',
        satellites: 'Uydular',
        type: 'Tür',
        orbit: 'Yörünge',
        latitude: 'Enlem',
        longitude: 'Boylam',
        altitude: 'Yükseklik (km)',
        velocity: 'Hız (km/s)',
        loading: 'Yükleniyor...',
        searchPlaceholder: 'Uydu ara...'
    }
};

let currentLang = 'en';

function changeLang() {
    currentLang = document.getElementById('langSelect').value;
    document.querySelector('.info-title').innerText = translations[currentLang].liveTracking;
    document.querySelector('.stat-label').innerText = translations[currentLang].satellites;
    document.getElementById('searchInput').placeholder = translations[currentLang].searchPlaceholder;
}

const satelliteImages = {
    iss: 'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Tiangong_space_station.png/800px-Tiangong_space_station.png',
    hubble: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://images.unsplash.com/photo-1581822261290-991b38693d1b?w=800&q=80',
    normal: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png'
};

let layer = null, selectedSat = null, satPositions = new Map(), satAltitudes = new Map();
let showLabels = true, showGrid = false, showBorders = false, showClouds = false;
let cloudLayer = null, gridLayer = null, borderLayer = null, userMarker = null;
let mapStyle = 0, baseLayers = [], currentBaseLayer = null;
let userLocation = null;
let allSatellites = [];
let timeWarp = 1;
let simulationTime = new Date();

const map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 8,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

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

function setTimeWarp(speed) {
    timeWarp = speed;
    document.querySelectorAll('.timewarp-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
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
            for (let lat = -80; lat <= 80; lat += 20) {
                L.polyline([[lat, -180], [lat, 180]], { color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false }).addTo(gridLayer);
            }
            for (let lng = -180; lng <= 180; lng += 20) {
                L.polyline([[-85, lng], [85, lng]], { color: 'rgba(148,163,184,0.3)', weight: 1, interactive: false }).addTo(gridLayer);
            }
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
        if (!borderLayer) {
            borderLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
                opacity: 0.7,
                maxZoom: 8
            });
        }
        borderLayer.addTo(map);
    } else {
        if (borderLayer) map.removeLayer(borderLayer);
    }
}

function toggleClouds() {
    showClouds = !showClouds;
    document.getElementById('cloudBtn').classList.toggle('active', showClouds);
    if (showClouds) {
        if (!cloudLayer) {
            cloudLayer = L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=546c29aeefa27989df830200ec92848e', {
                opacity: 0.5,
                maxZoom: 8
            });
        }
        cloudLayer.addTo(map);
    } else {
        if (cloudLayer) map.removeLayer(cloudLayer);
    }
}

function goToLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
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
        });
    }
}

// Search functionality
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', (e) => {
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
    }
}

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

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    selectedSat = null;
}

function openSatelliteInfo(sat) {
    selectedSat = sat;
    document.getElementById('sidebar').classList.add('active');
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
    imgElement.onerror = () => loadingElement.innerText = 'Image failed';
    imgElement.src = imgSrc;

    const typeNames = { iss: 'International Space Station', tiangong: 'Tiangong Space Station', hubble: 'Hubble Space Telescope' };
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
        const s = map.getSize(), ctx = this._c.getContext('2d');
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
        const s = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]);
        this._c.style.transform = `translate(${tl.x}px,${tl.y}px)`;
        this._c.width = s.x; this._c.height = s.y;
        this._draw();
    },
    _onMouseMove(e) {
        if (!this._d || !showLabels) return;
        const rect = this._c.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
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
        } else tooltip.style.display = 'none';
    },
    _onClick(e) {
        if (!this._d) return;
        const rect = this._c.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        this._d.forEach(sat => {
            const pos = satPositions.get(sat.name);
            if (pos && Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2) < (sat.type !== 'normal' ? 20 : 6)) {
                openSatelliteInfo(sat);
            }
        });
    },
    _draw() {
        if (!this._d) return;
        const s = map.getSize(), ctx = this._c.getContext('2d');
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
                ctx.shadowBlur = 10;
                if (sat.type === 'iss') {
                    ctx.shadowColor = 'rgba(167,139,250,0.8)';
                    ctx.fillStyle = '#a78bfa';
                    ctx.fillRect(-26, -12, 8, 24);
                    ctx.fillRect(18, -12, 8, 24);
                    ctx.fillStyle = '#e0e7ff';
                    ctx.fillRect(-12, -6, 24, 12);
                } else if (sat.type === 'tiangong') {
                    ctx.shadowColor = 'rgba(192,132,252,0.8)';
                    ctx.fillStyle = '#c084fc';
                    ctx.fillRect(-24, -11, 7, 22);
                    ctx.fillRect(17, -11, 7, 22);
                    ctx.fillStyle = '#f3e8ff';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.shadowColor = 'rgba(129,140,248,0.8)';
                    ctx.fillStyle = '#818cf8';
                    ctx.fillRect(-20, -10, 6, 20);
                    ctx.fillRect(14, -10, 6, 20);
                    ctx.fillStyle = '#c7d2fe';
                    ctx.fillRect(-10, -5, 20, 10);
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

fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    .then(r => r.text())
    .then(tle => {
        const lines = tle.split('\n'), data = [];
        for (let i = 0; i < lines.length; i += 3) {
            if (!lines[i + 2]) continue;
            const n = lines[i].trim();
            let type = 'normal', isTrain = false;

            if (n.includes('ISS') && !n.includes('PROGRESS') && !n.includes('DRAGON')) type = 'iss';
            else if (n.includes('TIANGONG')) type = 'tiangong';
            else if (n.includes('HUBBLE') || n.includes('HST')) type = 'hubble';
            else if (n.includes('STARLINK') && n.match(/STARLINK-\d{4,}/)) isTrain = true;

            const satrec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
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
        document.getElementById('info').innerText = data.length;
        
        setInterval(() => {
            if (timeWarp > 0) {
                simulationTime = new Date(simulationTime.getTime() + timeWarp * 150);
                updateTimeDisplay();
            }
            layer._draw();
            updateSatellitePosition();
        }, 150);
    });

function getPos(satrec, date) {
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        const g = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
        return { lat: satellite.degreesLat(g.latitude), lng: satellite.degreesLong(g.longitude) };
    } catch (e) { return null; }
}

updateTimeDisplay();
// ... (önceki tüm kod aynı kalacak)

// Menu fonksiyonları ekle
function toggleMenu() {
    const menuPanel = document.getElementById('menuPanel');
    const menuToggle = document.querySelector('.menu-toggle');
    menuPanel.classList.toggle('show');
    menuToggle.classList.toggle('active');
}

function showHelp() {
    alert('Satellite Tracker v0.3\n\nControls:\n- Click satellites to view details\n- Use time warp to speed up simulation\n- Search for specific satellites\n- Toggle layers with buttons on the left');
    toggleMenu();
}

function showContact() {
    alert('Contact:\n\nFor questions and feedback, please visit our GitHub repository or contact us via email.');
    toggleMenu();
}
// ... (önceki tüm kod aynı)

function toggleMenu() {
    const menuSidebar = document.getElementById('menuSidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    menuSidebar.classList.toggle('active');
    menuToggle.classList.toggle('active');
}

// ... (geri kalan kod aynı)
// ISS için:
if (sat.type === 'iss') {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(167,139,250,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText('🛰️', 0, 0);
    ctx.restore();
}
// Tiangong için:
else if (sat.type === 'tiangong') {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(192,132,252,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText('🛰️', 0, 0);
    ctx.restore();
}
// Hubble için:
else if (sat.type === 'hubble') {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(129,140,248,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText('🛰️', 0, 0);
    ctx.restore();
}
