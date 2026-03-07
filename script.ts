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

// Three.js runtime stub — resolved from CDN
declare const THREE: {
    Scene: new () => ThreeScene;
    PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => ThreeCamera;
    WebGLRenderer: new (opts: { antialias: boolean; alpha: boolean }) => ThreeRenderer;
    SphereGeometry: new (radius: number, widthSeg: number, heightSeg: number) => ThreeGeometry;
    BufferGeometry: new () => ThreeBufferGeometry;
    BufferAttribute: new (arr: Float32Array, itemSize: number) => ThreeBufferAttribute;
    Float32BufferAttribute: new (arr: number[], itemSize: number) => ThreeBufferAttribute;
    PointsMaterial: new (opts: object) => ThreeMaterial;
    MeshPhongMaterial: new (opts: object) => ThreeMaterial;
    Points: new (geo: ThreeBufferGeometry, mat: ThreeMaterial) => ThreeObject3D;
    Mesh: new (geo: ThreeGeometry, mat: ThreeMaterial) => ThreeObject3D;
    AmbientLight: new (color: number) => ThreeObject3D;
    DirectionalLight: new (color: number, intensity: number) => ThreeDirectionalLight;
    TextureLoader: new () => { load(url: string): ThreeTexture };
    Vector3: new (x: number, y: number, z: number) => ThreeVector3;
    Quaternion: new () => ThreeQuaternion;
    Color: new (c: string | number) => { r: number; g: number; b: number };
    BackSide: number;
};

// Minimal Three.js type stubs
interface ThreeScene    { add(o: object): void; remove(o: object): void; }
interface ThreeCamera   { position: ThreeVector3; aspect: number; updateProjectionMatrix(): void; }
interface ThreeRenderer { domElement: HTMLCanvasElement; setSize(w: number, h: number): void; setPixelRatio(r: number): void; setClearColor(c: number, a: number): void; render(s: ThreeScene, c: ThreeCamera): void; }
interface ThreeGeometry {}
interface ThreeBufferGeometry { setAttribute(name: string, attr: ThreeBufferAttribute): void; }
interface ThreeBufferAttribute {}
interface ThreeMaterial {}
interface ThreeTexture {}
interface ThreeObject3D { quaternion: ThreeQuaternion; position: ThreeVector3; }
interface ThreeDirectionalLight extends ThreeObject3D {}
interface ThreeVector3  { x: number; y: number; z: number; set(x: number, y: number, z: number): ThreeVector3; }
interface ThreeQuaternion { setFromAxisAngle(axis: ThreeVector3, angle: number): ThreeQuaternion; multiply(q: ThreeQuaternion): ThreeQuaternion; copy(q: ThreeQuaternion): void; }

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

// FIX: Maximum safe warp factor to prevent Date overflow and runaway computation
const MAX_WARP = 10_000;

// FIX: Orbit path is expensive — only recalculate when sim time has jumped
// more than this many milliseconds since the last build.
const ORBIT_PATH_REBUILD_THRESHOLD_MS = 5_000;

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
    if (altKm < 400)                      return 'VLEO';
    if (altKm < 2000)                     return 'LEO';
    if (altKm < 35700)                    return 'MEO';
    if (altKm >= 35700 && altKm <= 35900) return 'GEO';
    if (altKm > 35900)                    return 'Beyond GEO';
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

// FIX: Helper — returns false if any component of a vector is NaN or non-finite.
function isValidVector(v: EciVector): boolean {
    return isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
}

/**
 * Computes the geodetic position of a satellite at the given time.
 * Returns null if propagation fails (decayed orbit, invalid TLE, NaN result, etc.)
 */
export function getSatPosition(satrec: SatRec, date: Date): GeoPosition | null {
    // FIX: Guard against invalid dates (e.g. from extreme warp overflow)
    if (!isFinite(date.getTime())) return null;

    try {
        const pv = satellite.propagate(satrec, date);
        // FIX: Also validate that position vectors are finite, not just truthy
        if (!pv.position || !isValidVector(pv.position)) return null;

        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;

        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lng = satellite.degreesLong(geo.longitude);

        // FIX: Reject NaN coordinates before they propagate downstream
        if (!isFinite(lat) || !isFinite(lng)) return null;

        return { lat, lng };
    } catch {
        return null;
    }
}

/**
 * Computes the full orbital state (position + altitude + velocity + regime).
 * Returns null on propagation failure.
 */
export function getSatelliteState(satrec: SatRec, date: Date): SatelliteState | null {
    // FIX: Guard against invalid dates
    if (!isFinite(date.getTime())) return null;

    try {
        const pv = satellite.propagate(satrec, date);
        // FIX: Validate position vector
        if (!pv.position || !isValidVector(pv.position)) return null;

        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;

        const geo   = satellite.eciToGeodetic(pv.position, gmst);
        const lat   = satellite.degreesLat(geo.latitude);
        const lng   = satellite.degreesLong(geo.longitude);

        if (!isFinite(lat) || !isFinite(lng)) return null;

        const altKm  = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
        if (!isFinite(altKm) || altKm < 0) return null;  // FIX: Negative alt = decayed

        const velKms = pv.velocity && isValidVector(pv.velocity)
            ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
            : 0;

        return {
            position: { lat, lng },
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

    // FIX: Don't compute anything with an invalid date
    if (!isFinite(date.getTime())) return cache;

    for (const entry of entries) {
        const pv = satellite.propagate(entry.satrec, date);
        // FIX: Validate vector before using it
        if (pv.position && isValidVector(pv.position)) {
            const alt = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
            if (isFinite(alt) && alt >= 0) {
                cache.set(entry.name, alt);
            }
        }
    }
    return cache;
}

// ── Longitude Normaliser ──────────────────────

/**
 * Wraps a longitude value into the [-180, 180] range.
 *
 * FIX: The original while-loop version hangs forever on NaN / ±Infinity.
 *      Use modulo arithmetic instead — O(1) and safe for any finite input.
 */
export function normalizeLng(lng: number): number {
    // FIX: Reject non-finite values immediately
    if (!isFinite(lng)) return 0;
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ── Orbit Path Builder ────────────────────────

/**
 * Generates a sequence of future [lat, lng] pairs to visualise the
 * predicted orbit ground track over the next `minutes` steps.
 *
 * FIX: Skips invalid propagation results instead of passing NaN into Leaflet.
 */
export function buildOrbitPath(
    satrec:  SatRec,
    from:    Date,
    minutes: number = ORBIT_PATH_MINUTES
): [number, number][] {
    // FIX: Guard against invalid start date
    if (!isFinite(from.getTime())) return [];

    const points: [number, number][] = [];
    for (let i = 0; i < minutes; i++) {
        const t   = new Date(from.getTime() + i * 60_000);
        const pos = getSatPosition(satrec, t);
        // FIX: getSatPosition already returns null for bad values — just skip
        if (pos) points.push([pos.lat, pos.lng]);
    }
    return points;
}

/**
 * Cache entry for throttled orbit-path rebuilding.
 * Stores the last build time so we can skip redundant rebuilds.
 */
export interface OrbitPathCache {
    points:    [number, number][];
    builtAtMs: number;   // simulated time (ms) when path was last built
}

/**
 * Returns a (possibly cached) orbit path.
 * Only rebuilds when the simulated time has advanced beyond the threshold.
 *
 * FIX: Prevents `buildOrbitPath` from being called every animation frame,
 *      which caused a cascade of expensive propagations at high warp.
 */
export function getOrbitPathCached(
    satrec:    SatRec,
    simNow:    Date,
    existing:  OrbitPathCache | null,
    minutes:   number = ORBIT_PATH_MINUTES,
    threshMs:  number = ORBIT_PATH_REBUILD_THRESHOLD_MS
): OrbitPathCache {
    const nowMs = simNow.getTime();
    if (existing && Math.abs(nowMs - existing.builtAtMs) < threshMs) {
        return existing;   // still fresh
    }
    return {
        points:    buildOrbitPath(satrec, simNow, minutes),
        builtAtMs: nowMs
    };
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
    private _warp:     number = 1;
    private _simBase:  Date;
    private _realBase: number;

    constructor(startTime: Date = new Date()) {
        this._simBase  = startTime;
        this._realBase = Date.now();
    }

    /** Returns the current simulated time. */
    now(): Date {
        const elapsed = (Date.now() - this._realBase) * this._warp;
        const ms      = this._simBase.getTime() + elapsed;

        // FIX: Clamp to safe JS Date range to prevent overflow/NaN propagation
        const SAFE_MAX = 8_640_000_000_000_000; // ±100M days from epoch
        const clamped  = Math.max(-SAFE_MAX, Math.min(SAFE_MAX, ms));
        return new Date(clamped);
    }

    /**
     * Adjusts the warp factor without discontinuity.
     * FIX: Clamp warp to MAX_WARP to prevent runaway computation.
     */
    setTimeWarp(warp: number): void {
        this._simBase  = this.now();
        this._realBase = Date.now();
        // FIX: Enforce bounds — allow reverse time but cap magnitude
        this._warp = Math.max(-MAX_WARP, Math.min(MAX_WARP, warp));
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
    // FIX: Don't feed invalid dates to SunCalc
    if (!isFinite(date.getTime())) return 0;

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
    if (entry.isTrain) return SATELLITE_IMAGES.starlink;
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
    // FIX: Guard against invalid Date objects (e.g. from extreme warp)
    if (!isFinite(date.getTime())) return 'Invalid time';
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
            // FIX: Skip tick entirely if the clock has produced an invalid time
            if (!isFinite(now.getTime())) return;
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

// ── Satellite Tracker ─────────────────────────

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

// ── Satellite Tracking ────────────────────────

/** Represents a satellite currently being tracked on the 2D map. */
export interface TrackingState {
    sat:    SatelliteEntry;
    active: boolean;
}

/**
 * Manages map-pan tracking of a single satellite.
 * Integrates with the AnimationLoop via its onTick callback.
 */
export class SatelliteTracker {
    private _tracked: SatelliteEntry | null = null;
    private readonly _panFn: (lat: number, lng: number) => void;

    /**
     * @param panFn  Called every tick while tracking is active.
     *               Should pan/centre the map to the given coordinates.
     */
    constructor(panFn: (lat: number, lng: number) => void) {
        this._panFn = panFn;
    }

    /** Start tracking a satellite. Replaces any currently tracked sat. */
    track(sat: SatelliteEntry): void {
        this._tracked = sat;
        this._syncUI(true);
    }

    /** Stop tracking without selecting a different satellite. */
    stop(): void {
        this._tracked = null;
        this._syncUI(false);
    }

    /** Toggle tracking on the given sat; stops if it's already the tracked one. */
    toggle(sat: SatelliteEntry): void {
        if (this._tracked === sat) this.stop();
        else this.track(sat);
    }

    /** Called every animation frame. Pans the map if tracking is active. */
    tick(simNow: Date): void {
        if (!this._tracked || !isFinite(simNow.getTime())) return;
        const pos = getSatPosition(this._tracked.satrec, simNow);
        if (pos) this._panFn(pos.lat, normalizeLng(pos.lng));
    }

    get tracked(): SatelliteEntry | null { return this._tracked; }
    get isTracking(): boolean            { return this._tracked !== null; }

    private _syncUI(active: boolean): void {
        const btn   = document.getElementById('trackBtn');
        const icon  = btn?.querySelector('.track-btn-icon');
        const label = btn?.querySelector('.track-btn-label');
        if (!btn) return;
        btn.classList.toggle('active', active);
        if (icon)  icon.textContent  = active ? '⏹' : '🎯';
        if (label) label.textContent = active ? 'STOP TRACKING' : 'TRACK SATELLITE';
    }
}

// ── 3D Globe ──────────────────────────────────

/** Configuration for the 3D globe renderer. */
export interface GlobeConfig {
    earthRadius:   number;   // scene units (default 2)
    fov:           number;   // camera FOV degrees
    initialCamZ:   number;   // initial camera distance
    leoZoomCamZ:   number;   // camera distance in LEO-zoom mode
    leoAltScale:   number;   // exaggeration factor for LEO orbit heights
    starCount:     number;
    updateIntervalMs: number; // satellite point cloud refresh rate
}

const DEFAULT_GLOBE_CONFIG: GlobeConfig = {
    earthRadius:      2,
    fov:              45,
    initialCamZ:      7,
    leoZoomCamZ:      3.8,
    leoAltScale:      9,
    starCount:        6000,
    updateIntervalMs: 600,
};

/**
 * Converts geodetic coordinates + altitude to a 3D scene position.
 *
 * @param lat       Degrees latitude
 * @param lng       Degrees longitude
 * @param altKm     Altitude above Earth surface in km
 * @param altScale  Exaggeration factor (1 = realistic, >1 = spread out)
 * @param earthR    Earth sphere radius in scene units
 */
export function latLngAltToVector3(
    lat:      number,
    lng:      number,
    altKm:    number,
    altScale: number,
    earthR:   number
): ThreeVector3 {
    const r   = earthR + (altKm / 6371) * earthR * altScale;
    const phi = (90 - lat) * (Math.PI / 180);
    const tht = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(tht),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(tht)
    );
}

/**
 * Generates star field geometry.
 */
export function buildStarGeometry(count: number): ThreeBufferGeometry {
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (let i = 0; i < count; i++) {
        const phi = Math.acos(2 * Math.random() - 1);
        const tht = Math.random() * Math.PI * 2;
        const r   = 80 + Math.random() * 20;
        pos.push(
            r * Math.sin(phi) * Math.cos(tht),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(tht)
        );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
}

/**
 * Builds the coloured satellite point-cloud geometry for the globe.
 *
 * @param entries      All loaded satellites
 * @param altCache     Precomputed altitude map
 * @param simNow       Current simulated time
 * @param altScale     LEO exaggeration factor
 * @param earthR       Earth sphere radius in scene units
 */
export function buildSatellitePointCloud(
    entries:   SatelliteEntry[],
    altCache:  Map<string, number>,
    simNow:    Date,
    altScale:  number,
    earthR:    number
): { geometry: ThreeBufferGeometry; material: ThreeMaterial } {
    const positions: number[] = [];
    const colors:    number[] = [];

    const palette: Record<string, { r: number; g: number; b: number }> = {
        vleo:   new THREE.Color('#ef4444'),
        leo:    new THREE.Color('#f97316'),
        meo:    new THREE.Color('#eab308'),
        geo:    new THREE.Color('#3b82f6'),
        beyond: new THREE.Color('#a855f7'),
    };

    for (const sat of entries) {
        const pos = getSatPosition(sat.satrec, simNow);
        if (!pos) continue;
        const alt = altCache.get(sat.name) ?? 400;
        const v   = latLngAltToVector3(pos.lat, pos.lng, alt, altScale, earthR);
        positions.push(v.x, v.y, v.z);
        const col = alt < 400 ? palette.vleo : alt < 2000 ? palette.leo : alt < 35700 ? palette.meo : alt <= 35900 ? palette.geo : palette.beyond;
        colors.push(col.r, col.g, col.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 });
    return { geometry: geo, material: mat };
}

/**
 * Full 3D globe view manager.
 *
 * Lifecycle:
 *   const globe = new GlobeView(container, config);
 *   globe.init(allSatellites, altCache, getClock);
 *   globe.show();
 *   globe.setLeoZoom(true);
 *   globe.hide();
 */
export class GlobeView {
    private _scene:       ThreeScene   | null = null;
    private _camera:      ThreeCamera  | null = null;
    private _renderer:    ThreeRenderer | null = null;
    private _earth:       ThreeObject3D | null = null;
    private _atm:         ThreeObject3D | null = null;
    private _satPoints:   ThreeObject3D | null = null;
    private _animFrame:   number | null = null;
    private _lastUpdate:  number = 0;
    private _rotX:        number = 0.3;
    private _rotY:        number = 0;
    private _mouseDown:   boolean = false;
    private _lastMouse:   { x: number; y: number } = { x: 0, y: 0 };
    private _leoZoom:     boolean = false;
    private _visible:     boolean = false;

    private _entries:   SatelliteEntry[]     = [];
    private _altCache:  Map<string, number>  = new Map();
    private _getClock:  () => Date = () => new Date();

    readonly cfg: GlobeConfig;
    private readonly _container: HTMLElement;

    constructor(container: HTMLElement, cfg: Partial<GlobeConfig> = {}) {
        this._container = container;
        this.cfg        = { ...DEFAULT_GLOBE_CONFIG, ...cfg };
    }

    /** Provide satellite data + clock. Call before show(). */
    init(
        entries:  SatelliteEntry[],
        altCache: Map<string, number>,
        getClock: () => Date
    ): void {
        this._entries  = entries;
        this._altCache = altCache;
        this._getClock = getClock;
        if (!this._scene) this._build();
    }

    show(): void {
        this._container.style.display = 'block';
        this._visible = true;
        this._scheduleFrame();
    }

    hide(): void {
        this._visible = false;
        this._container.style.display = 'none';
        if (this._animFrame !== null) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    }

    /** Toggle LEO altitude exaggeration and animate camera zoom. */
    setLeoZoom(enabled: boolean): void {
        this._leoZoom = enabled;
        const targetZ = enabled ? this.cfg.leoZoomCamZ : this.cfg.initialCamZ;
        this._animateCamZ(targetZ);
        this._rebuildSatPoints();
    }

    get leoZoom(): boolean  { return this._leoZoom; }
    get visible(): boolean  { return this._visible; }

    // ── Private ──────────────────────────────────

    private _build(): void {
        const { earthRadius: R, fov, initialCamZ, starCount } = this.cfg;
        const w = window.innerWidth, h = window.innerHeight;

        this._scene    = new THREE.Scene();
        this._camera   = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
        this._camera.position.set(0, 0, initialCamZ);

        this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this._renderer.setSize(w, h);
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._renderer.setClearColor(0x000000, 0);
        this._container.appendChild(this._renderer.domElement);

        // Stars
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 });
        this._scene.add(new THREE.Points(buildStarGeometry(starCount), starMat));

        // Earth
        const loader   = new THREE.TextureLoader();
        const earthMat = new THREE.MeshPhongMaterial({
            map:       loader.load('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Land_ocean_ice_cloud_hires.jpg/1024px-Land_ocean_ice_cloud_hires.jpg'),
            specular:  new THREE.Color(0x111111),
            shininess: 8,
        });
        this._earth = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), earthMat);
        this._scene.add(this._earth);

        // Atmosphere
        const atmMat = new THREE.MeshPhongMaterial({ color: 0x0088ff, transparent: true, opacity: 0.08, side: THREE.BackSide });
        this._atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 32, 32), atmMat);
        this._scene.add(this._atm);

        // Lights
        this._scene.add(new THREE.AmbientLight(0x222244));
        const sun = new THREE.DirectionalLight(0xfff5ee, 1.3);
        sun.position.set(8, 4, 6);
        this._scene.add(sun);
        const fill = new THREE.DirectionalLight(0x4466aa, 0.3);
        fill.position.set(-8, -4, -6);
        this._scene.add(fill);

        this._attachInputHandlers();
        window.addEventListener('resize', () => this._onResize());
    }

    private _attachInputHandlers(): void {
        const c = this._renderer!.domElement;
        c.addEventListener('mousedown',  e => { this._mouseDown = true;  this._lastMouse = { x: e.clientX, y: e.clientY }; });
        c.addEventListener('mouseup',    () => { this._mouseDown = false; });
        c.addEventListener('mouseleave', () => { this._mouseDown = false; });
        c.addEventListener('mousemove',  e => {
            if (!this._mouseDown) return;
            this._rotY += (e.clientX - this._lastMouse.x) * 0.006;
            this._rotX += (e.clientY - this._lastMouse.y) * 0.006;
            this._rotX  = Math.max(-1.4, Math.min(1.4, this._rotX));
            this._lastMouse = { x: e.clientX, y: e.clientY };
        });
        c.addEventListener('wheel', e => {
            e.preventDefault();
            const cam = this._camera!;
            cam.position.z = Math.max(2.8, Math.min(18, cam.position.z + (e as WheelEvent).deltaY * 0.012));
        }, { passive: false });

        let touchLast: Touch | null = null;
        c.addEventListener('touchstart',  e => { touchLast = e.touches[0]; }, { passive: true });
        c.addEventListener('touchend',    () => { touchLast = null; });
        c.addEventListener('touchmove',   e => {
            if (!touchLast) return;
            const t = e.touches[0];
            this._rotY += (t.clientX - touchLast.clientX) * 0.006;
            this._rotX += (t.clientY - touchLast.clientY) * 0.006;
            this._rotX  = Math.max(-1.4, Math.min(1.4, this._rotX));
            touchLast   = t;
        }, { passive: true });
    }

    private _onResize(): void {
        if (!this._camera || !this._renderer) return;
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private _rebuildSatPoints(): void {
        if (!this._scene) return;
        if (this._satPoints) { this._scene.remove(this._satPoints); this._satPoints = null; }
        const now = this._getClock();
        if (!isFinite(now.getTime())) return;
        const altScale = this._leoZoom ? this.cfg.leoAltScale : 1;
        const { geometry, material } = buildSatellitePointCloud(this._entries, this._altCache, now, altScale, this.cfg.earthRadius);
        this._satPoints = new THREE.Points(geometry, material);
        this._scene.add(this._satPoints);
    }

    private _scheduleFrame(): void {
        if (!this._visible) return;
        this._animFrame = requestAnimationFrame(() => {
            this._render();
            this._scheduleFrame();
        });
    }

    private _render(): void {
        if (!this._scene || !this._camera || !this._renderer) return;
        const now = Date.now();
        if (now - this._lastUpdate > this.cfg.updateIntervalMs) {
            this._rebuildSatPoints();
            this._lastUpdate = now;
        }

        const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this._rotX);
        const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._rotY);
        const q  = qY.multiply(qX);

        if (this._earth)     this._earth.quaternion.copy(q);
        if (this._atm)       this._atm.quaternion.copy(q);
        if (this._satPoints) this._satPoints.quaternion.copy(q);

        this._renderer.render(this._scene, this._camera);
    }

    private _animateCamZ(targetZ: number): void {
        const step = (): void => {
            if (!this._camera) return;
            const diff = targetZ - this._camera.position.z;
            if (Math.abs(diff) < 0.01) { this._camera.position.z = targetZ; return; }
            this._camera.position.z += diff * 0.12;
            requestAnimationFrame(step);
        };
        step();
    }
}
