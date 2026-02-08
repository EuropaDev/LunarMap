const translations = {
    en: { liveTracking: 'Live Tracking', satellites: 'Satellites', type: 'Type', orbit: 'Orbit', latitude: 'Latitude', longitude: 'Longitude', altitude: 'Altitude (km)', velocity: 'Velocity (km/s)', loading: 'Loading...' },
    tr: { liveTracking: 'Canlı Takip', satellites: 'Uydular', type: 'Tür', orbit: 'Yörünge', latitude: 'Enlem', longitude: 'Boylam', altitude: 'Yükseklik (km)', velocity: 'Hız (km/s)', loading: 'Yükleniyor...' }
};

let currentLang = 'en';
// ... (Tüm değişkenler ve Leaflet harita tanımları buraya gelecek)

const map = L.map('map', {
    center: [20, 0], zoom: 3, minZoom: 2, maxZoom: 8,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

// ... (Tüm katman, buton ve veri çekme fonksiyonlarını buraya ekle)

// Kodunun en sonunda bulunan fetch ve setInterval kısımlarını da unutma.