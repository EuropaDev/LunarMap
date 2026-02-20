// i18n.js - Smart Translation System
const translations = {
    en: {
        menu: "Menu",
        controls: "🎮 Controls",
        contact: "📧 Contact",
        poweredBy: "Powered By",
        clickSatellite: "Click satellite to view details",
        searchSatellite: "Search satellites by name",
        timeWarp: "Time Warp: Speed up simulation",
        toggleGrid: "Toggle grid lines",
        toggleBorders: "Toggle country borders",
        cycleMap: "Cycle map styles",
        searchPlaceholder: "Search satellites...",
        timeWarpTitle: "TIME WARP",
        loading: "Loading...",
        type: "Type",
        orbit: "Orbit",
        latitude: "Latitude",
        longitude: "Longitude",
        altitude: "Altitude (km)",
        velocity: "Velocity (km/s)"
    },
    tr: {
        menu: "Menü",
        controls: "🎮 Kontroller",
        contact: "📧 İletişim",
        poweredBy: "Destekleyen",
        clickSatellite: "Detayları görmek için uyduya tıklayın",
        searchSatellite: "Uyduları ada göre arayın",
        timeWarp: "Zaman Hızlandırma: Simülasyonu hızlandır",
        toggleGrid: "Izgara çizgilerini aç/kapat",
        toggleBorders: "Ülke sınırlarını aç/kapat",
        cycleMap: "Harita stillerini değiştir",
        searchPlaceholder: "Uydu ara...",
        timeWarpTitle: "ZAMAN HIZLANDIRMA",
        loading: "Yükleniyor...",
        type: "Tür",
        orbit: "Yörünge",
        latitude: "Enlem",
        longitude: "Boylam",
        altitude: "Yükseklik (km)",
        velocity: "Hız (km/s)"
    },
    es: {
        menu: "Menú",
        controls: "🎮 Controles",
        contact: "📧 Contacto",
        poweredBy: "Desarrollado por",
        clickSatellite: "Haz clic en el satélite para ver detalles",
        searchSatellite: "Buscar satélites por nombre",
        timeWarp: "Time Warp: Acelerar simulación",
        toggleGrid: "Alternar líneas de cuadrícula",
        toggleBorders: "Alternar fronteras",
        cycleMap: "Cambiar estilos de mapa",
        searchPlaceholder: "Buscar satélites...",
        timeWarpTitle: "ACELERACIÓN TEMPORAL",
        loading: "Cargando...",
        type: "Tipo",
        orbit: "Órbita",
        latitude: "Latitud",
        longitude: "Longitud",
        altitude: "Altitud (km)",
        velocity: "Velocidad (km/s)"
    },
    fr: {
        menu: "Menu",
        controls: "🎮 Contrôles",
        contact: "📧 Contact",
        poweredBy: "Propulsé par",
        clickSatellite: "Cliquez sur le satellite pour voir les détails",
        searchSatellite: "Rechercher des satellites par nom",
        timeWarp: "Time Warp: Accélérer la simulation",
        toggleGrid: "Basculer les lignes de grille",
        toggleBorders: "Basculer les frontières",
        cycleMap: "Changer de style de carte",
        searchPlaceholder: "Rechercher des satellites...",
        timeWarpTitle: "ACCÉLÉRATION TEMPORELLE",
        loading: "Chargement...",
        type: "Type",
        orbit: "Orbite",
        latitude: "Latitude",
        longitude: "Longitude",
        altitude: "Altitude (km)",
        velocity: "Vitesse (km/s)"
    },
    de: {
        menu: "Menü",
        controls: "🎮 Steuerung",
        contact: "📧 Kontakt",
        poweredBy: "Bereitgestellt von",
        clickSatellite: "Klicken Sie auf den Satelliten für Details",
        searchSatellite: "Satelliten nach Namen suchen",
        timeWarp: "Time Warp: Simulation beschleunigen",
        toggleGrid: "Gitterlinien umschalten",
        toggleBorders: "Grenzen umschalten",
        cycleMap: "Kartenstile wechseln",
        searchPlaceholder: "Satelliten suchen...",
        timeWarpTitle: "ZEITBESCHLEUNIGUNG",
        loading: "Wird geladen...",
        type: "Typ",
        orbit: "Umlaufbahn",
        latitude: "Breitengrad",
        longitude: "Längengrad",
        altitude: "Höhe (km)",
        velocity: "Geschwindigkeit (km/s)"
    },
    ru: {
        menu: "Меню",
        controls: "🎮 Управление",
        contact: "📧 Контакт",
        poweredBy: "При поддержке",
        clickSatellite: "Нажмите на спутник для просмотра деталей",
        searchSatellite: "Поиск спутников по названию",
        timeWarp: "Time Warp: Ускорение симуляции",
        toggleGrid: "Переключить линии сетки",
        toggleBorders: "Переключить границы",
        cycleMap: "Сменить стиль карты",
        searchPlaceholder: "Поиск спутников...",
        timeWarpTitle: "УСКОРЕНИЕ ВРЕМЕНИ",
        loading: "Загрузка...",
        type: "Тип",
        orbit: "Орбита",
        latitude: "Широта",
        longitude: "Долгота",
        altitude: "Высота (км)",
        velocity: "Скорость (км/с)"
    },
    zh: {
        menu: "菜单",
        controls: "🎮 控制",
        contact: "📧 联系",
        poweredBy: "技术支持",
        clickSatellite: "点击卫星查看详情",
        searchSatellite: "按名称搜索卫星",
        timeWarp: "时间加速：加速模拟",
        toggleGrid: "切换网格线",
        toggleBorders: "切换边界",
        cycleMap: "切换地图样式",
        searchPlaceholder: "搜索卫星...",
        timeWarpTitle: "时间加速",
        loading: "加载中...",
        type: "类型",
        orbit: "轨道",
        latitude: "纬度",
        longitude: "经度",
        altitude: "高度 (公里)",
        velocity: "速度 (公里/秒)"
    },
    ja: {
        menu: "メニュー",
        controls: "🎮 コントロール",
        contact: "📧 連絡先",
        poweredBy: "提供元",
        clickSatellite: "衛星をクリックして詳細を表示",
        searchSatellite: "名前で衛星を検索",
        timeWarp: "タイムワープ：シミュレーションを加速",
        toggleGrid: "グリッド線の切り替え",
        toggleBorders: "境界線の切り替え",
        cycleMap: "地図スタイルの切り替え",
        searchPlaceholder: "衛星を検索...",
        timeWarpTitle: "タイムワープ",
        loading: "読み込み中...",
        type: "タイプ",
        orbit: "軌道",
        latitude: "緯度",
        longitude: "経度",
        altitude: "高度 (km)",
        velocity: "速度 (km/s)"
    },
    ar: {
        menu: "القائمة",
        controls: "🎮 التحكم",
        contact: "📧 اتصل",
        poweredBy: "مدعوم من",
        clickSatellite: "انقر على القمر الصناعي لعرض التفاصيل",
        searchSatellite: "البحث عن الأقمار الصناعية بالاسم",
        timeWarp: "تسريع الوقت: تسريع المحاكاة",
        toggleGrid: "تبديل خطوط الشبكة",
        toggleBorders: "تبديل الحدود",
        cycleMap: "تغيير أنماط الخريطة",
        searchPlaceholder: "البحث عن الأقمار الصناعية...",
        timeWarpTitle: "تسريع الوقت",
        loading: "جاري التحميل...",
        type: "النوع",
        orbit: "المدار",
        latitude: "خط العرض",
        longitude: "خط الطول",
        altitude: "الارتفاع (كم)",
        velocity: "السرعة (كم/ث)"
    }
};

let currentLang = localStorage.getItem('language') || 'en';

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang] && translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });
}

// Initialize language
window.addEventListener('load', () => {
    const langSelect = document.getElementById('langSelect');
    langSelect.value = currentLang;
    changeLanguage(currentLang);
});
