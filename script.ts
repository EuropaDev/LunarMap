// ============================================
// SATELLITE TRACKER - TypeScript Module
// satellite-tracker.ts
// ============================================

// ── Types ────────────────────────────────────

/** Satellite type identifiers */
export type SatType = 'iss' | 'tiangong' | 'hubble' | 'normal';

/** Orbit regime names */
export type OrbitName = 'VLEO' | 'LEO' | 'MEO' | 'GEO' | 'Beyond GEO' | 'HEO';

/** A parsed satellite entry from TLE data */
export interface SatelliteEntry {
    readonly name:    string;
    readonly satrec:  SatRec;
    readonly type:    SatType;
    readonly isTrain: boolean;
}

/** 2D screen position */
export interface ScreenPoint {
    x: number;
    y: number;
}

/** Geodetic position */
export interface GeoPosition {
    lat: number;
    lng: number;
}

/** Full propagation result */
export interface SatelliteState {
    position: GeoPosition;
    altKm:    number;
    velKms:   number;
    orbit:    OrbitName;
}

/** AI-generated satellite metadata */
export interface SatAIInfo {
    operator:    string;
    description: string;
}

/** Gemini API response shape (partial) */
interface GeminiResponse {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message: string };
}

// External library stubs — resolved at runtime via CDN
declare const satellite: {
    twoline2satrec(tle1: string, tle2: string): SatRec | null;
    propagate(satrec: SatRec, date: Date): { position?: EciVector; velocity?: EciVector };
    eciToGeodetic(pos: EciVector, gmst: number): { latitude: number; longitude: number };
    gstime(date: Date): number;
    degreesLat(rad: number): number;
    degreesLong(rad: number): number;
};
declare const SunCalc: {
    getPosition(date: Date, lat: number, lng: number): { altitude: number };
};
declare const L: LeafletStatic; // Leaflet

// Opaque type stubs
type SatRec      = object & { _brand: 'SatRec' };
type EciVector   = { x: number; y: number; z: number };
type LeafletStatic = Record<string, unknown>;

// ── Constants ─────────────────────────────────

const GEMINI_KEY = 'AIzaSyAypd7t_gDUcmjIKhwPXffcn9-G2o50b3s';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';
const TLE_URL    = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const EARTH_RADIUS_KM = 6371;
const ANIMATION_INTERVAL_MS = 150;
const ORBIT_PATH_MINUTES    = 90;

const SATELLITE_IMAGES: Record<SatType | 'starlink', string> = {
    iss:      'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg',
    hubble:   'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal:   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png'
};

const SAT_TYPE_LABELS: Record<SatType, string> = {
    iss:      'International Space Station',
    tiangong: 'Tiangong Space Station',
    hubble:   'Hubble Space Telescope',
    normal:   'Satellite'
};

const ORBIT_COLORS: [number, string][] = [
    [400,   '#ef4444'],   // VLEO
    [2000,  '#f97316'],   // LEO
    [35700, '#eab308'],   // MEO
    [35900, '#3b82f6'],   // GEO
    [Infinity, '#a855f7'] // Beyond GEO
];

// ── Orbit Utilities ───────────────────────────

/**
 * Returns the CSS color associated with the given altitude in km.
 */
export function getOrbitColor(altKm: number): string {
    for (const [threshold, color] of ORBIT_COLORS) {
        if (altKm <= threshold) return color;
    }
    return '#22c55e';
}

/**
 * Returns the orbit regime name for a given altitude.
 */
export function getOrbitName(altKm: number): OrbitName {
    if (altKm < 400)                     return 'VLEO';
    if (altKm < 2000)                    return 'LEO';
    if (altKm < 35700)                   return 'MEO';
    if (altKm >= 35700 && altKm <= 35900) return 'GEO';
    if (altKm > 35900)                   return 'Beyond GEO';
    return 'HEO';
}

// ── TLE Parser ────────────────────────────────

/**
 * Classifies a satellite name into a SatType.
 */
function classifySatellite(name: string): { type: SatType; isTrain: boolean } {
    if (name === 'ISS (ZARYA)')    return { type: 'iss',      isTrain: false };
    if (name === 'CSS (MENGTIAN)') return { type: 'tiangong', isTrain: false };
    if (name === 'HST')            return { type: 'hubble',   isTrain: false };
    if (/^STARLINK-\d{4,}$/.test(name)) return { type: 'normal', isTrain: true };
    return { type: 'normal', isTrain: false };
}

/**
 * Parses a raw TLE text block into an array of SatelliteEntry objects.
 * Skips any line group that cannot produce a valid satrec.
 */
export function parseTLE(rawTLE: string): SatelliteEntry[] {
    const lines   = rawTLE.split('\n');
    const entries: SatelliteEntry[] = [];

    for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i].trim();
        const tle1 = lines[i + 1]?.trim();
        const tle2 = lines[i + 2]?.trim();
        if (!name || !tle1 || !tle2) continue;

        const satrec = satellite.twoline2satrec(tle1, tle2);
        if (!satrec) continue;

        const { type, isTrain } = classifySatellite(name);
        entries.push({ name, satrec, type, isTrain });
    }

    return entries;
}

// ── Propagation ───────────────────────────────

/**
 * Computes the geodetic position of a satellite at the given time.
 * Returns null if propagation fails (decayed orbit, invalid TLE, etc.)
 */
export function getSatPosition(satrec: SatRec, date: Date): GeoPosition | null {
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;
        const gmst = satellite.gstime(date);
        const geo  = satellite.eciToGeodetic(pv.position, gmst);
        return {
            lat: satellite.degreesLat(geo.latitude),
            lng: satellite.degreesLong(geo.longitude)
        };
    } catch {
        return null;
    }
}

/**
 * Computes the full orbital state (position + altitude + velocity + regime).
 * Returns null on propagation failure.
 */
export function getSatelliteState(satrec: SatRec, date: Date): SatelliteState | null {
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position) return null;

        const gmst    = satellite.gstime(date);
        const geo     = satellite.eciToGeodetic(pv.position, gmst);
        const altKm   = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
        const velKms  = pv.velocity
            ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
            : 0;

        return {
            position: {
                lat: satellite.degreesLat(geo.latitude),
                lng: satellite.degreesLong(geo.longitude)
            },
            altKm,
            velKms,
            orbit: getOrbitName(altKm)
        };
    } catch {
        return null;
    }
}

// ── Altitude Cache ────────────────────────────

/**
 * Pre-computes and stores the current altitude for every satellite.
 * This avoids redundant propagation during the render loop.
 */
export function buildAltitudeCache(
    entries: SatelliteEntry[],
    date: Date = new Date()
): Map<string, number> {
    const cache = new Map<string, number>();
    for (const entry of entries) {
        const pv = satellite.propagate(entry.satrec, date);
        if (pv.position) {
            const alt = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
            cache.set(entry.name, alt);
        }
    }
    return cache;
}

// ── Longitude Normaliser ──────────────────────

/**
 * Wraps a longitude value into the [-180, 180] range.
 */
export function normalizeLng(lng: number): number {
    let n = lng;
    while (n > 180)  n -= 360;
    while (n < -180) n += 360;
    return n;
}

// ── Orbit Path Builder ────────────────────────

/**
 * Generates a sequence of future [lat, lng] pairs to visualise the
 * predicted orbit ground track over the next `minutes` steps.
 */
export function buildOrbitPath(
    satrec: SatRec,
    from:   Date,
    minutes: number = ORBIT_PATH_MINUTES
): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i < minutes; i++) {
        const t   = new Date(from.getTime() + i * 60_000);
        const pos = getSatPosition(satrec, t);
        if (pos) points.push([pos.lat, pos.lng]);
    }
    return points;
}

// ── Simulation Clock ──────────────────────────

/**
 * A lightweight simulation clock that supports time-warp.
 *
 * @example
 * const clock = new SimulationClock();
 * clock.setTimeWarp(10);  // 10× speed
 * setInterval(() => console.log(clock.now()), 100);
 */
export class SimulationClock {
    private _warp:      number = 1;
    private _simBase:   Date;
    private _realBase:  number;

    constructor(startTime: Date = new Date()) {
        this._simBase  = startTime;
        this._realBase = Date.now();
    }

    /** Returns the current simulated time. */
    now(): Date {
        const elapsed = (Date.now() - this._realBase) * this._warp;
        return new Date(this._simBase.getTime() + elapsed);
    }

    /** Adjusts the warp factor without discontinuity. */
    setTimeWarp(warp: number): void {
        this._simBase  = this.now();
        this._realBase = Date.now();
        this._warp     = warp;
    }

    /** Resets the clock to real current time at 1× speed. */
    reset(): void {
        this._simBase  = new Date();
        this._realBase = Date.now();
        this._warp     = 1;
    }

    get warp(): number { return this._warp; }
}

// ── AI Info Service ───────────────────────────

/**
 * Fetches operator + description for a satellite from the Gemini API.
 * Results are cached in sessionStorage to avoid repeat calls.
 */
export class SatAIService {
    private readonly _inflight = new Set<string>();

    /** Retrieves cached AI info for a satellite name, if available. */
    getCached(name: string): SatAIInfo | null {
        try {
            const raw = sessionStorage.getItem(`ai_${name}`);
            return raw ? (JSON.parse(raw) as SatAIInfo) : null;
        } catch {
            return null;
        }
    }

    private _setCache(name: string, info: SatAIInfo): void {
        try { sessionStorage.setItem(`ai_${name}`, JSON.stringify(info)); } catch {}
    }

    /**
     * Fetches AI info for a satellite.
     * Skips the request if a key is not configured or the call is already in flight.
     */
    async fetch(satName: string, lang = 'en'): Promise<SatAIInfo> {
        const cached = this.getCached(satName);
        if (cached) return cached;

        if (!GEMINI_KEY || GEMINI_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            return { operator: '-', description: '🔑 Set GEMINI_KEY in the source.' };
        }

        if (this._inflight.has(satName)) {
            return { operator: '...', description: '...' };
        }

        this._inflight.add(satName);

        const prompt =
            `Satellite:"${satName}" lang:"${lang}". ` +
            `Respond ONLY with raw JSON (no markdown): ` +
            `{"operator":"<builder/operator>","description":"<2-3 sentences: launch year, purpose, orbit, notable facts>"}`;

        try {
            const res = await fetch(GEMINI_URL + GEMINI_KEY, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    contents:         [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 250, temperature: 0.1 }
                })
            });

            const data: GeminiResponse = await res.json();
            if (data.error) throw new Error(data.error.message);
            if (!data.candidates?.length) throw new Error('Empty Gemini response');

            let raw = data.candidates[0]?.content?.parts?.[0]?.text ?? '';
            raw     = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error(`No JSON found in: ${raw.slice(0, 60)}`);

            const info = JSON.parse(match[0]) as SatAIInfo;
            this._setCache(satName, info);
            return info;

        } finally {
            this._inflight.delete(satName);
        }
    }
}

// ── Night Shadow Layer ────────────────────────

/**
 * Configuration for the night-shadow canvas renderer.
 */
export interface NightLayerConfig {
    stepPx:       number;   // pixel sampling grid size (default 6)
    blurPx:       number;   // shadow blur radius (default 12)
    maxOpacity:   number;   // darkest shadow opacity (default 0.5)
    shadowColor:  string;   // base shadow RGB (default '10,14,39')
}

/**
 * Computes the shadow opacity at a given geographic point for the
 * current simulation time.
 *
 * Exposed as a pure function so it can be tested independently of the DOM.
 */
export function nightOpacity(
    lat:  number,
    lng:  number,
    date: Date,
    cfg:  Pick<NightLayerConfig, 'maxOpacity'> = { maxOpacity: 0.5 }
): number {
    const sunPos = SunCalc.getPosition(date, lat, lng);
    const altDeg = sunPos.altitude * (180 / Math.PI);

    if (altDeg < -18) return cfg.maxOpacity;
    if (altDeg < -12) return 0.35 + ((altDeg + 12) / -6) * 0.15;
    if (altDeg < -6)  return 0.2  + ((altDeg + 6)  / -6) * 0.15;
    if (altDeg < 0)   return (altDeg / -6) * 0.2;
    return 0;
}

// ── Satellite Image Resolver ──────────────────

/**
 * Returns the best-match image URL for a given satellite entry.
 */
export function resolveSatelliteImage(entry: Pick<SatelliteEntry, 'type' | 'isTrain'>): string {
    if (entry.isTrain)            return SATELLITE_IMAGES.starlink;
    return SATELLITE_IMAGES[entry.type] ?? SATELLITE_IMAGES.normal;
}

/**
 * Returns the human-readable type label for a satellite.
 */
export function resolveSatelliteLabel(entry: Pick<SatelliteEntry, 'type' | 'isTrain'>): string {
    if (entry.isTrain) return 'Starlink Train';
    return SAT_TYPE_LABELS[entry.type] ?? 'Satellite';
}

// ── TLE Loader ────────────────────────────────

/**
 * Fetches TLE data from Celestrak and parses it into satellite entries.
 * Throws on network or parse error.
 */
export async function loadSatellites(): Promise<SatelliteEntry[]> {
    const res = await fetch(TLE_URL);
    if (!res.ok) throw new Error(`TLE fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    return parseTLE(text);
}

// ── Time Display Formatter ────────────────────

const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
};

/**
 * Formats a Date for the HUD time display.
 */
export function formatSimTime(date: Date, locale = 'en-US'): string {
    return date.toLocaleString(locale, TIME_FORMAT_OPTIONS);
}

// ── Animation Loop ────────────────────────────

/**
 * Minimal interface the loop needs from the renderer.
 */
export interface Renderer {
    draw(): void;
    updateSidebarPosition(): void;
}

/**
 * Manages the fixed-interval animation loop.
 * Decoupled from the renderer so it can be paused or replaced independently.
 */
export class AnimationLoop {
    private _id:       ReturnType<typeof setInterval> | null = null;
    private readonly _clock:    SimulationClock;
    private readonly _renderer: Renderer;
    private readonly _onTick:   (time: Date) => void;

    constructor(
        clock:    SimulationClock,
        renderer: Renderer,
        onTick:   (time: Date) => void
    ) {
        this._clock    = clock;
        this._renderer = renderer;
        this._onTick   = onTick;
    }

    start(): void {
        if (this._id !== null) return;
        this._id = setInterval(() => {
            const now = this._clock.now();
            this._onTick(now);
            this._renderer.draw();
            this._renderer.updateSidebarPosition();
        }, ANIMATION_INTERVAL_MS);
    }

    stop(): void {
        if (this._id !== null) { clearInterval(this._id); this._id = null; }
    }

    get running(): boolean { return this._id !== null; }
}

// ── i18n Helper ───────────────────────────────

export type Translations = Record<string, string>;

/**
 * Applies a translation map to all elements that carry
 * `data-i18n` / `data-i18n-placeholder` attributes.
 */
export function applyTranslations(
    t:    Translations,
    root: ParentNode = document
): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n')!;
        if (t[key] !== undefined) el.textContent = t[key];
    });
    root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder')!;
        if (t[key] !== undefined) el.placeholder = t[key];
    });
}

// ── Theme Manager ─────────────────────────────

const THEME_STORAGE_KEY = 'mapsat_theme';
const DEFAULT_THEME     = 'mission';

/**
 * Applies and persists a UI theme.
 */
export function setTheme(theme: string): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelectorAll<HTMLElement>('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

/**
 * Restores the previously saved theme, or falls back to the default.
 * Call this once at startup, before the DOM renders visible content.
 */
export function restoreTheme(): void {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', saved);
    // Defer button sync until the DOM is fully ready
    window.addEventListener('DOMContentLoaded', () => setTheme(saved));
}
