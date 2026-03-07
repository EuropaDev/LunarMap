// ============================================
// SATELLITE TRACKER — TypeScript v0.6
// Optimized: shared geo cache, 30fps globe,
// theme-aware i18n, TLE caching
// ============================================

// ── Types ────────────────────────────────────

export type SatType   = 'iss' | 'tiangong' | 'hubble' | 'normal';
export type OrbitName = 'VLEO' | 'LEO' | 'MEO' | 'GEO' | 'Beyond GEO' | 'HEO';
export type ThemeName = 'mission' | 'modern';

export interface SatelliteEntry {
    readonly name:    string;
    readonly satrec:  SatRec;
    readonly type:    SatType;
    readonly isTrain: boolean;
}

export interface ScreenPoint  { x: number; y: number; }
export interface GeoPosition  { lat: number; lng: number; }

export interface SatelliteState {
    position: GeoPosition;
    altKm:    number;
    velKms:   number;
    orbit:    OrbitName;
}

export interface SatAIInfo {
    operator:    string;
    description: string;
}

export type Translations = Record<string, string>;

/** Gemini API response (partial) */
interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message: string };
}

// ── External library stubs ───────────────────

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
declare const L: LeafletStatic;
declare const THREE: ThreeStatic;

type SatRec        = object & { _brand: 'SatRec' };
type EciVector     = { x: number; y: number; z: number };
type LeafletStatic = Record<string, unknown>;

// Three.js minimal stubs
declare interface ThreeStatic {
    Scene: new () => ThreeScene;
    PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => ThreeCamera;
    WebGLRenderer: new (opts: { antialias: boolean; alpha: boolean }) => ThreeRenderer;
    SphereGeometry: new (r: number, ws: number, hs: number) => ThreeGeometry;
    BufferGeometry: new () => ThreeBufferGeometry;
    Float32BufferAttribute: new (arr: number[], itemSize: number) => ThreeBufferAttribute;
    PointsMaterial: new (opts: object) => ThreeMaterial;
    MeshPhongMaterial: new (opts: object) => ThreeMaterial;
    Points: new (geo: ThreeBufferGeometry, mat: ThreeMaterial) => ThreeObject3D;
    Mesh: new (geo: ThreeGeometry, mat: ThreeMaterial) => ThreeObject3D;
    AmbientLight: new (color: number) => ThreeObject3D;
    DirectionalLight: new (color: number, intensity: number) => ThreeDirectionalLight;
    TextureLoader: new () => { load(url: string): unknown };
    Vector3: new (x: number, y: number, z: number) => ThreeVector3;
    Quaternion: new () => ThreeQuaternion;
    Color: new (c: string | number) => { r: number; g: number; b: number };
    BackSide: number;
}
interface ThreeScene        { add(o: object): void; remove(o: object): void; }
interface ThreeCamera       { position: ThreeVector3; aspect: number; updateProjectionMatrix(): void; }
interface ThreeRenderer     { domElement: HTMLCanvasElement; setSize(w: number, h: number): void; setPixelRatio(r: number): void; setClearColor(c: number, a: number): void; render(s: ThreeScene, c: ThreeCamera): void; }
interface ThreeGeometry     {}
interface ThreeBufferGeometry { setAttribute(name: string, attr: ThreeBufferAttribute): void; }
interface ThreeBufferAttribute {}
interface ThreeMaterial     {}
interface ThreeObject3D     { quaternion: ThreeQuaternion; position: ThreeVector3; }
interface ThreeDirectionalLight extends ThreeObject3D {}
interface ThreeVector3      { x: number; y: number; z: number; set(x: number, y: number, z: number): ThreeVector3; }
interface ThreeQuaternion   { setFromAxisAngle(axis: ThreeVector3, angle: number): ThreeQuaternion; multiply(q: ThreeQuaternion): ThreeQuaternion; copy(q: ThreeQuaternion): void; }

// ── Constants ────────────────────────────────

const GEMINI_KEY             = 'AIzaSyAypd7t_gDUcmjIKhwPXffcn9-G2o50b3s';
const GEMINI_URL             = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=';
const TLE_URL                = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const TLE_FALLBACK_URL       = 'https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const TLE_CACHE_KEY          = 'mapsat_tle_data';
const TLE_CACHE_TS           = 'mapsat_tle_ts';
const TLE_TTL_MS             = 4 * 60 * 60 * 1000;   // 4 hours
const TLE_FETCH_TIMEOUT_MS   = 12_000;
const EARTH_RADIUS_KM        = 6371;
const MAX_WARP               = 10_000;
const ANIMATION_INTERVAL_MS  = 200;
const ORBIT_PATH_MINUTES     = 90;
const ORBIT_PATH_TTL_MS      = 5_000;
const NIGHT_STEP_PX          = 20;   // was 6 — 11x faster
const NIGHT_THROTTLE_MS      = 1_000;
const NIGHT_DEBOUNCE_MS      = 120;
const GLOBE_FPS_CAP_MS       = 33;   // ~30fps
const GLOBE_SAT_REFRESH_MS   = 300;
const GLOBE_GEO_CACHE_MIN    = 100;  // min entries before using 2D cache

// ── Orbit Utilities ──────────────────────────

const ORBIT_THRESHOLDS: ReadonlyArray<[number, string]> = [
    [400,      '#ef4444'],
    [2000,     '#f97316'],
    [35700,    '#eab308'],
    [35900,    '#3b82f6'],
    [Infinity, '#a855f7'],
];

export function getOrbitColor(altKm: number): string {
    for (const [t, c] of ORBIT_THRESHOLDS) if (altKm <= t) return c;
    return '#22c55e';
}

export function getOrbitName(altKm: number): OrbitName {
    if (altKm < 400)                       return 'VLEO';
    if (altKm < 2000)                      return 'LEO';
    if (altKm < 35700)                     return 'MEO';
    if (altKm >= 35700 && altKm <= 35900)  return 'GEO';
    if (altKm > 35900)                     return 'Beyond GEO';
    return 'HEO';
}

// ── Longitude Normaliser ─────────────────────

export function normalizeLng(lng: number): number {
    if (!isFinite(lng)) return 0;
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ── TLE Parser ───────────────────────────────

function classifySatellite(name: string): { type: SatType; isTrain: boolean } {
    if (name === 'ISS (ZARYA)')              return { type: 'iss',      isTrain: false };
    if (name === 'CSS (MENGTIAN)')           return { type: 'tiangong', isTrain: false };
    if (name === 'HST')                      return { type: 'hubble',   isTrain: false };
    if (/^STARLINK-\d{4,}$/.test(name))      return { type: 'normal',   isTrain: true  };
    return { type: 'normal', isTrain: false };
}

export function parseTLE(rawTLE: string): SatelliteEntry[] {
    const lines = rawTLE.split('\n'), entries: SatelliteEntry[] = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i].trim(), tle1 = lines[i+1]?.trim(), tle2 = lines[i+2]?.trim();
        if (!name || !tle1 || !tle2) continue;
        const satrec = satellite.twoline2satrec(tle1, tle2);
        if (!satrec) continue;
        const { type, isTrain } = classifySatellite(name);
        entries.push({ name, satrec, type, isTrain });
    }
    return entries;
}

// ── Propagation ──────────────────────────────

function isValidVec(v: EciVector): boolean {
    return isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
}

export function getSatPosition(satrec: SatRec, date: Date): GeoPosition | null {
    if (!isFinite(date.getTime())) return null;
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position || !isValidVec(pv.position)) return null;
        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const lat  = satellite.degreesLat(geo.latitude);
        const lng  = satellite.degreesLong(geo.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { lat, lng };
    } catch { return null; }
}

export function getSatelliteState(satrec: SatRec, date: Date): SatelliteState | null {
    if (!isFinite(date.getTime())) return null;
    try {
        const pv = satellite.propagate(satrec, date);
        if (!pv.position || !isValidVec(pv.position)) return null;
        const gmst = satellite.gstime(date);
        if (!isFinite(gmst)) return null;
        const geo   = satellite.eciToGeodetic(pv.position, gmst);
        const lat   = satellite.degreesLat(geo.latitude);
        const lng   = satellite.degreesLong(geo.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        const altKm = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
        if (!isFinite(altKm) || altKm < 0) return null;
        const velKms = pv.velocity && isValidVec(pv.velocity)
            ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
        return { position: { lat, lng }, altKm, velKms, orbit: getOrbitName(altKm) };
    } catch { return null; }
}

export function buildAltitudeCache(entries: SatelliteEntry[], date = new Date()): Map<string, number> {
    const cache = new Map<string, number>();
    if (!isFinite(date.getTime())) return cache;
    for (const e of entries) {
        const pv = satellite.propagate(e.satrec, date);
        if (pv.position && isValidVec(pv.position)) {
            const alt = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - EARTH_RADIUS_KM;
            if (isFinite(alt) && alt >= 0) cache.set(e.name, alt);
        }
    }
    return cache;
}

// ── OPTIMIZED: Shared Geo Cache ──────────────
/**
 * Shared position cache populated by the 2D canvas layer each frame.
 * The 3D globe reads from this instead of re-propagating all satellites,
 * reducing CPU load by ~100% during 3D mode.
 */
export type SatGeoCache = Map<string, GeoPosition>;

/**
 * Chunked position cache manager.
 * Decouples propagation from rendering by updating satellite positions
 * in small batches (POS_CHUNK per tick) rather than all at once.
 *
 * Architecture:
 *   setInterval(50ms)  → updateChunk() — propagates POS_CHUNK satellites
 *   requestAnimationFrame → draw()    — reads from cache, zero propagation
 *
 * Full cache refresh: totalSats / POS_CHUNK × 50ms ≈ 850ms for 10,000 sats
 */
export class PositionCacheManager {
    private readonly _cache:  Map<string, GeoPosition> = new Map();
    private readonly _altCache: Map<string, number>;
    private _entries: SatelliteEntry[] = [];
    private _chunkIdx = 0;
    readonly chunkSize: number;

    constructor(altCache: Map<string, number>, chunkSize = 600) {
        this._altCache = altCache;
        this.chunkSize = chunkSize;
    }

    setEntries(entries: SatelliteEntry[]): void {
        this._entries = entries;
        this._chunkIdx = 0;
    }

    /** Update one chunk of satellite positions. Call every ~50ms. */
    updateChunk(simNow: Date): void {
        if (!this._entries.length || !isFinite(simNow.getTime())) return;
        const total = this._entries.length;
        const start = this._chunkIdx * this.chunkSize;
        const end   = Math.min(start + this.chunkSize, total);
        for (let i = start; i < end; i++) {
            const sat = this._entries[i];
            const p   = getSatPosition(sat.satrec, simNow);
            if (p) this._cache.set(sat.name, p);
        }
        this._chunkIdx = end >= total ? 0 : this._chunkIdx + 1;
    }

    /** Prime the cache for all satellites in deferred batches (called once on load). */
    primeCacheAsync(entries: SatelliteEntry[], batchSize = 500, delayMs = 200): void {
        this._entries = entries;
        let idx = 0;
        const run = (): void => {
            const now = new Date();
            const end = Math.min(idx + batchSize, entries.length);
            for (let i = idx; i < end; i++) {
                const p = getSatPosition(entries[i].satrec, now);
                if (p) this._cache.set(entries[i].name, p);
            }
            idx = end;
            if (idx < entries.length) setTimeout(run, 0);
        };
        setTimeout(run, delayMs);
    }

    get(name: string): GeoPosition | undefined { return this._cache.get(name); }
    get size(): number { return this._cache.size; }
    get cache(): ReadonlyMap<string, GeoPosition> { return this._cache; }
}

/**
 * Builds a fresh geo cache by propagating all satellites.
 * Used as fallback when the 2D layer hasn't populated the cache yet.
 */
export function buildGeoCache(entries: SatelliteEntry[], date: Date): SatGeoCache {
    const cache: SatGeoCache = new Map();
    if (!isFinite(date.getTime())) return cache;
    for (const e of entries) {
        const p = getSatPosition(e.satrec, date);
        if (p) cache.set(e.name, p);
    }
    return cache;
}

// ── Orbit Path ───────────────────────────────

export function buildOrbitPath(satrec: SatRec, from: Date, minutes = ORBIT_PATH_MINUTES): [number, number][] {
    if (!isFinite(from.getTime())) return [];
    const pts: [number, number][] = [];
    for (let i = 0; i < minutes; i++) {
        const p = getSatPosition(satrec, new Date(from.getTime() + i * 60_000));
        if (p) pts.push([p.lat, p.lng]);
    }
    return pts;
}

export interface OrbitPathCache { points: [number, number][]; builtAtMs: number; }

export function getOrbitPathCached(
    satrec:  SatRec, simNow: Date,
    existing: OrbitPathCache | null,
    minutes  = ORBIT_PATH_MINUTES,
    threshMs = ORBIT_PATH_TTL_MS
): OrbitPathCache {
    const nowMs = simNow.getTime();
    if (existing && Math.abs(nowMs - existing.builtAtMs) < threshMs) return existing;
    return { points: buildOrbitPath(satrec, simNow, minutes), builtAtMs: nowMs };
}

// ── Simulation Clock ─────────────────────────

export class SimulationClock {
    private _warp     = 1;
    private _simBase: Date;
    private _realBase: number;

    constructor(start = new Date()) {
        this._simBase  = start;
        this._realBase = Date.now();
    }
    now(): Date {
        const ms = this._simBase.getTime() + (Date.now() - this._realBase) * this._warp;
        const SAFE = 8_640_000_000_000_000;
        return new Date(Math.max(-SAFE, Math.min(SAFE, ms)));
    }
    setTimeWarp(warp: number): void {
        this._simBase  = this.now();
        this._realBase = Date.now();
        this._warp     = Math.max(-MAX_WARP, Math.min(MAX_WARP, warp));
    }
    reset(): void { this._simBase = new Date(); this._realBase = Date.now(); this._warp = 1; }
    get warp(): number { return this._warp; }
}

// ── Night Layer ──────────────────────────────

export interface NightLayerConfig {
    stepPx:     number;   // default: NIGHT_STEP_PX (20)
    blurPx:     number;   // default: 18
    maxOpacity: number;   // default: 0.5
    throttleMs: number;   // default: NIGHT_THROTTLE_MS (1000)
    debounceMs: number;   // default: NIGHT_DEBOUNCE_MS (120)
}

export function nightOpacity(lat: number, lng: number, date: Date, maxOp = 0.5): number {
    if (!isFinite(date.getTime())) return 0;
    const alt = SunCalc.getPosition(date, lat, lng).altitude * (180 / Math.PI);
    if (alt < -18) return maxOp;
    if (alt < -12) return 0.35 + ((alt + 12) / -6) * 0.15;
    if (alt < -6)  return 0.2  + ((alt + 6)  / -6) * 0.15;
    if (alt < 0)   return (alt / -6) * 0.2;
    return 0;
}

// ── AI Info Service ──────────────────────────

export class SatAIService {
    private readonly _inflight = new Set<string>();

    getCached(name: string): SatAIInfo | null {
        try { const r = sessionStorage.getItem(`ai_${name}`); return r ? JSON.parse(r) : null; } catch { return null; }
    }
    private _setCache(name: string, info: SatAIInfo): void {
        try { sessionStorage.setItem(`ai_${name}`, JSON.stringify(info)); } catch {}
    }
    async fetch(satName: string, lang = 'en'): Promise<SatAIInfo> {
        const cached = this.getCached(satName);
        if (cached) return cached;
        if (!GEMINI_KEY || GEMINI_KEY === 'YOUR_GEMINI_API_KEY_HERE')
            return { operator: '-', description: '🔑 Set GEMINI_KEY' };
        if (this._inflight.has(satName)) return { operator: '...', description: '...' };
        this._inflight.add(satName);
        const prompt = `Satellite:"${satName}" lang:"${lang}". ONLY raw JSON: {"operator":"...","description":"..."}`;
        try {
            const res  = await fetch(GEMINI_URL + GEMINI_KEY, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 250, temperature: 0.1 } })
            });
            const data: GeminiResponse = await res.json();
            if (data.error) throw new Error(data.error.message);
            if (!data.candidates?.length) throw new Error('Empty response');
            let raw = (data.candidates[0]?.content?.parts?.[0]?.text ?? '')
                .replace(/```json/g, '').replace(/```/g, '').trim();
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON');
            const info = JSON.parse(match[0]) as SatAIInfo;
            this._setCache(satName, info);
            return info;
        } finally { this._inflight.delete(satName); }
    }
}

// ── TLE Loader with Cache ────────────────────

/**
 * Configuration for TLE loading with localStorage cache.
 * Cache avoids repeated network fetches — loads instantly after first visit.
 */
export interface TLELoaderConfig {
    sources:    string[];    // URLs to try in order
    ttlMs:      number;      // cache lifetime in ms
    timeoutMs:  number;      // per-source fetch timeout
    cacheKey:   string;
    cacheTsKey: string;
}

export const DEFAULT_TLE_CONFIG: TLELoaderConfig = {
    sources:    [TLE_URL, TLE_FALLBACK_URL],
    ttlMs:      TLE_TTL_MS,
    timeoutMs:  TLE_FETCH_TIMEOUT_MS,
    cacheKey:   TLE_CACHE_KEY,
    cacheTsKey: TLE_CACHE_TS,
};

export class TLELoader {
    constructor(private readonly cfg: TLELoaderConfig = DEFAULT_TLE_CONFIG) {}

    fromCache(): string | null {
        try {
            const ts  = parseInt(localStorage.getItem(this.cfg.cacheTsKey) ?? '0', 10);
            const raw = localStorage.getItem(this.cfg.cacheKey);
            if (raw && Date.now() - ts < this.cfg.ttlMs) return raw;
        } catch {}
        return null;
    }

    saveToCache(raw: string): void {
        try {
            localStorage.setItem(this.cfg.cacheKey, raw);
            localStorage.setItem(this.cfg.cacheTsKey, Date.now().toString());
        } catch {
            try { localStorage.removeItem(this.cfg.cacheKey); localStorage.removeItem(this.cfg.cacheTsKey); } catch {}
        }
    }

    async load(): Promise<string> {
        const cached = this.fromCache();
        if (cached) return cached;
        for (const url of this.cfg.sources) {
            try {
                const ctrl = new AbortController();
                const tid  = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
                const res  = await fetch(url, { signal: ctrl.signal });
                clearTimeout(tid);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                if (text.length < 1000) throw new Error('Response too short');
                this.saveToCache(text);
                return text;
            } catch (e) { console.warn(`TLE source failed (${url}):`, e); }
        }
        throw new Error('All TLE sources failed');
    }
}

// ── Satellite Tracker ────────────────────────

export class SatelliteTracker {
    private _tracked: SatelliteEntry | null = null;
    private _translations: Translations = {};

    constructor(private readonly _panFn: (lat: number, lng: number) => void) {}

    setTranslations(t: Translations): void {
        this._translations = t;
        if (this._tracked) this._syncUI(true);  // refresh labels on language change
    }

    toggle(sat: SatelliteEntry): void {
        if (this._tracked === sat) this.stop();
        else this.start(sat);
    }

    start(sat: SatelliteEntry): void { this._tracked = sat; this._syncUI(true); }
    stop(): void { this._tracked = null; this._syncUI(false); }

    tick(simNow: Date): void {
        if (!this._tracked || !isFinite(simNow.getTime())) return;
        const pos = getSatPosition(this._tracked.satrec, simNow);
        if (pos) this._panFn(pos.lat, normalizeLng(pos.lng));
    }

    get tracked(): SatelliteEntry | null { return this._tracked; }
    get isTracking(): boolean { return this._tracked !== null; }

    private _syncUI(active: boolean): void {
        const btn   = document.getElementById('trackBtn');
        const icon  = btn?.querySelector('.track-btn-icon');
        const label = btn?.querySelector('.track-btn-label');
        if (!btn) return;
        btn.classList.toggle('active', active);
        if (icon)  icon.textContent  = active ? '⏹' : '🎯';
        if (label) label.textContent = active
            ? (this._translations.stopTracking ?? 'STOP TRACKING')
            : (this._translations.trackSat     ?? 'TRACK SATELLITE');
    }
}

// ── Theme Manager ────────────────────────────

const THEME_KEY     = 'mapsat_theme';
const DEFAULT_THEME = 'mission';

export function setTheme(theme: ThemeName): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll<HTMLElement>('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
    });
    // Broadcast to lang.html iframe so it can match its own color scheme
    const iframe = document.querySelector<HTMLIFrameElement>('.lang-selector iframe');
    iframe?.contentWindow?.postMessage({ type: 'themeChange', theme }, '*');
}

export function restoreTheme(): void {
    const saved = (localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME) as ThemeName;
    document.documentElement.setAttribute('data-theme', saved);
    window.addEventListener('DOMContentLoaded', () => setTheme(saved));
}

// ── i18n ─────────────────────────────────────

export function applyTranslations(t: Translations, root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n')!;
        if (t[key] !== undefined) el.textContent = t[key];
    });
    root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder')!;
        if (t[key] !== undefined) el.placeholder = t[key];
    });
}

// ── Time Formatters ──────────────────────────

export function formatSimTime(date: Date, locale = 'en-US'): string {
    if (!isFinite(date.getTime())) return 'Invalid time';
    return date.toLocaleString(locale, {
        year:'numeric', month:'short', day:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
}

// ── Animation Loop ───────────────────────────

export interface LoopRenderer {
    draw(): void;
    updateSidebarPosition(): void;
}

export class AnimationLoop {
    private _id: ReturnType<typeof setInterval> | null = null;
    constructor(
        private readonly _clock:    SimulationClock,
        private readonly _renderer: LoopRenderer,
        private readonly _onTick:   (t: Date) => void
    ) {}
    start(): void {
        if (this._id !== null) return;
        this._id = setInterval(() => {
            const now = this._clock.now();
            if (!isFinite(now.getTime())) return;
            this._onTick(now);
            this._renderer.draw();
            this._renderer.updateSidebarPosition();
        }, ANIMATION_INTERVAL_MS);
    }
    stop(): void { if (this._id !== null) { clearInterval(this._id); this._id = null; } }
    get running(): boolean { return this._id !== null; }
}

// ── 3D Globe ─────────────────────────────────

export interface GlobeConfig {
    earthRadius:     number;
    fov:             number;
    initialCamZ:     number;
    leoZoomCamZ:     number;
    leoAltScale:     number;
    starCount:       number;
    fpsCap:          number;   // ms per frame (~33 = 30fps)
    satRefreshMs:    number;   // satellite cloud refresh interval
    geoCacheMinSize: number;   // min entries before trusting 2D cache
}

export const DEFAULT_GLOBE_CONFIG: GlobeConfig = {
    earthRadius:     2,
    fov:             45,
    initialCamZ:     7,
    leoZoomCamZ:     3.8,
    leoAltScale:     9,
    starCount:       6000,
    fpsCap:          GLOBE_FPS_CAP_MS,
    satRefreshMs:    GLOBE_SAT_REFRESH_MS,
    geoCacheMinSize: GLOBE_GEO_CACHE_MIN,
};

export function latLngAltToVector3(lat: number, lng: number, altKm: number, altScale: number, earthR: number): ThreeVector3 {
    const r   = earthR + (altKm / EARTH_RADIUS_KM) * earthR * altScale;
    const phi = (90 - lat) * (Math.PI / 180);
    const tht = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(tht),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(tht)
    );
}

/**
 * Builds the satellite point cloud for the 3D globe.
 *
 * OPTIMIZATION: Accepts an optional geoCache (populated by the 2D canvas layer
 * every 200ms). When available with enough entries, skips all propagation calls —
 * reducing 3D update cost to nearly zero additional CPU work.
 *
 * Falls back to calling getSatPosition() only for satellites absent from cache.
 */
export function buildGlobeSatCloud(
    entries:   SatelliteEntry[],
    altCache:  Map<string, number>,
    simNow:    Date,
    altScale:  number,
    earthR:    number,
    geoCache?: SatGeoCache,
    minCacheSize = GLOBE_GEO_CACHE_MIN
): { geometry: ThreeBufferGeometry; material: ThreeMaterial } {
    const positions: number[] = [], colors: number[] = [];
    const useCache = (geoCache?.size ?? 0) >= minCacheSize;
    const palette = {
        vleo: new THREE.Color('#ef4444'), leo: new THREE.Color('#f97316'),
        meo:  new THREE.Color('#eab308'), geo: new THREE.Color('#3b82f6'),
        beyond: new THREE.Color('#a855f7'),
    };
    for (const sat of entries) {
        let pos: GeoPosition | null = useCache ? (geoCache!.get(sat.name) ?? null) : null;
        if (!pos) pos = getSatPosition(sat.satrec, simNow);
        if (!pos) continue;
        const alt = altCache.get(sat.name) ?? 400;
        const v   = latLngAltToVector3(pos.lat, pos.lng, alt, altScale, earthR);
        positions.push(v.x, v.y, v.z);
        const col = alt < 400 ? palette.vleo : alt < 2000 ? palette.leo
            : alt < 35700 ? palette.meo : alt <= 35900 ? palette.geo : palette.beyond;
        colors.push(col.r, col.g, col.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.035, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95
    });
    return { geometry: geo, material: mat };
}

/**
 * Full 3D globe renderer.
 *
 * Key optimization: pass a SatGeoCache reference (shared with 2D layer)
 * so satellite updates don't require any extra propagation.
 */
export class GlobeView {
    private _scene:     ThreeScene    | null = null;
    private _camera:    ThreeCamera   | null = null;
    private _renderer:  ThreeRenderer | null = null;
    private _earth:     ThreeObject3D | null = null;
    private _atm:       ThreeObject3D | null = null;
    private _satPts:    ThreeObject3D | null = null;
    private _animFrame: number | null = null;
    private _lastFrame  = 0;
    private _lastUpdate = 0;
    private _rotX = 0.3, _rotY = 0;
    private _mouseDown = false, _lastMouse = { x: 0, y: 0 };
    private _leoZoom  = false;
    private _visible  = false;
    private _entries: SatelliteEntry[]    = [];
    private _altCache: Map<string, number> = new Map();
    private _geoCache: SatGeoCache        = new Map();
    private _getClock: () => Date         = () => new Date();

    readonly cfg: GlobeConfig;
    private readonly _container: HTMLElement;

    constructor(container: HTMLElement, cfg: Partial<GlobeConfig> = {}) {
        this._container = container;
        this.cfg        = { ...DEFAULT_GLOBE_CONFIG, ...cfg };
    }

    init(entries: SatelliteEntry[], altCache: Map<string, number>, geoCache: SatGeoCache, getClock: () => Date): void {
        this._entries  = entries;
        this._altCache = altCache;
        this._geoCache = geoCache;
        this._getClock = getClock;
        if (!this._scene) this._build();
    }

    /** Update the shared geo cache reference (called each 2D frame automatically). */
    updateGeoCache(cache: SatGeoCache): void { this._geoCache = cache; }

    show(): void { this._container.style.display = 'block'; this._visible = true;  this._scheduleFrame(); }
    hide(): void { this._container.style.display = 'none';  this._visible = false;
        if (this._animFrame !== null) { cancelAnimationFrame(this._animFrame); this._animFrame = null; } }

    setLeoZoom(enabled: boolean): void {
        this._leoZoom = enabled;
        this._animateCamZ(enabled ? this.cfg.leoZoomCamZ : this.cfg.initialCamZ);
        this._rebuildSatPoints();
    }

    get leoZoom(): boolean { return this._leoZoom; }
    get visible(): boolean { return this._visible; }

    private _build(): void {
        const { earthRadius: R, fov, initialCamZ, starCount } = this.cfg;
        this._scene    = new THREE.Scene();
        this._camera   = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
        this._camera.position.set(0, 0, initialCamZ);
        this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._renderer.setClearColor(0x000000, 0);
        this._container.appendChild(this._renderer.domElement);

        // Stars
        const sp: number[] = [];
        for (let i = 0; i < starCount; i++) {
            const phi = Math.acos(2 * Math.random() - 1), tht = Math.random() * Math.PI * 2, r = 80 + Math.random() * 20;
            sp.push(r*Math.sin(phi)*Math.cos(tht), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(tht));
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        this._scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));

        // Earth
        const loader = new THREE.TextureLoader();
        this._earth  = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64),
            new THREE.MeshPhongMaterial({
                map: loader.load('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Land_ocean_ice_cloud_hires.jpg/1024px-Land_ocean_ice_cloud_hires.jpg'),
                specular: new THREE.Color(0x111111), shininess: 8
            }));
        this._scene.add(this._earth);

        // Atmosphere
        this._atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 32, 32),
            new THREE.MeshPhongMaterial({ color: 0x0088ff, transparent: true, opacity: 0.08, side: THREE.BackSide }));
        this._scene.add(this._atm);

        // Lights
        this._scene.add(new THREE.AmbientLight(0x222244));
        const sun = new THREE.DirectionalLight(0xfff5ee, 1.3); sun.position.set(8, 4, 6);  this._scene.add(sun);
        const fll = new THREE.DirectionalLight(0x4466aa, 0.3); fll.position.set(-8,-4,-6); this._scene.add(fll);

        this._attachInput();
        window.addEventListener('resize', () => this._onResize());
        this._rebuildSatPoints();
    }

    private _attachInput(): void {
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
        let tl: Touch | null = null;
        c.addEventListener('touchstart', e => { tl = e.touches[0]; },        { passive: true });
        c.addEventListener('touchend',   () => { tl = null; });
        c.addEventListener('touchmove',  e => {
            if (!tl) return;
            const t = e.touches[0];
            this._rotY += (t.clientX - tl.clientX) * 0.006;
            this._rotX += (t.clientY - tl.clientY) * 0.006;
            this._rotX  = Math.max(-1.4, Math.min(1.4, this._rotX));
            tl = t;
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
        if (this._satPts) { this._scene.remove(this._satPts); this._satPts = null; }
        const now = this._getClock();
        if (!isFinite(now.getTime())) return;
        const altScale = this._leoZoom ? this.cfg.leoAltScale : 1;
        const { geometry, material } = buildGlobeSatCloud(
            this._entries, this._altCache, now, altScale, this.cfg.earthRadius,
            this._geoCache, this.cfg.geoCacheMinSize
        );
        this._satPts = new THREE.Points(geometry, material);
        this._scene.add(this._satPts);
    }

    private _scheduleFrame(): void {
        if (!this._visible) return;
        this._animFrame = requestAnimationFrame(() => {
            this._renderFrame();
            this._scheduleFrame();
        });
    }

    private _renderFrame(): void {
        if (!this._scene || !this._camera || !this._renderer) return;
        // 30fps cap — halves GPU load vs uncapped rAF
        const now = Date.now();
        if (now - this._lastFrame < this.cfg.fpsCap) return;
        this._lastFrame = now;

        if (now - this._lastUpdate > this.cfg.satRefreshMs) {
            this._rebuildSatPoints();
            this._lastUpdate = now;
        }

        const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this._rotX);
        const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._rotY);
        const q  = qY.multiply(qX);
        if (this._earth)  this._earth.quaternion.copy(q);
        if (this._atm)    this._atm.quaternion.copy(q);
        if (this._satPts) this._satPts.quaternion.copy(q);
        this._renderer.render(this._scene, this._camera);
    }

    private _animateCamZ(targetZ: number): void {
        const step = (): void => {
            if (!this._camera) return;
            const d = targetZ - this._camera.position.z;
            if (Math.abs(d) < 0.01) { this._camera.position.z = targetZ; return; }
            this._camera.position.z += d * 0.12;
            requestAnimationFrame(step);
        };
        step();
    }
}

// ── Satellite Image / Label Resolvers ────────

const SAT_IMAGES: Record<SatType | 'starlink', string> = {
    iss:      'https://upload.wikimedia.org/wikipedia/commons/0/04/International_Space_Station_after_undocking_of_STS-132.jpg',
    tiangong: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/1280px-Chinese_Tiangong_Space_Station.jpg',
    hubble:   'https://upload.wikimedia.org/wikipedia/commons/3/3f/HST-SM4.jpeg',
    starlink: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Starlink_Mission_%2847926144123%29.jpg',
    normal:   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/International_Space_Station.svg/800px-International_Space_Station.svg.png',
};
const SAT_LABELS: Record<SatType, string> = {
    iss: 'International Space Station', tiangong: 'Tiangong Space Station',
    hubble: 'Hubble Space Telescope', normal: 'Satellite',
};

/**
 * Batched canvas satellite renderer.
 *
 * Groups satellites by orbit color and issues a single fillStyle change
 * per color group, then draws all satellites of that color with fillRect.
 *
 * Performance: ~30,000 canvas ops → ~6 canvas ops (one per orbit tier)
 * fillRect is also ~3x faster than arc for 1-2px dots.
 *
 * Color buckets (by altitude):
 *   VLEO  <400km    #ef4444
 *   LEO   <2000km   #f97316
 *   MEO   <35700km  #eab308
 *   GEO   ~35800km  #3b82f6
 *   HEO   >35900km  #a855f7
 */
export interface DrawBuckets { [color: string]: number[]; }  // flat [x0,y0,x1,y1,...]
export interface SpecialSat   { sat: SatelliteEntry; x: number; y: number; }

export function buildDrawBuckets(
    entries:   SatelliteEntry[],
    posCache:  ReadonlyMap<string, GeoPosition>,
    altCache:  ReadonlyMap<string, number>,
    latLngToXY: (lat: number, lng: number) => { x: number; y: number } | null,
    viewW: number, viewH: number, pad = 60
): { buckets: DrawBuckets; special: SpecialSat[]; screenPositions: Map<string, ScreenPoint> } {
    const buckets: DrawBuckets = {
        '#ef4444': [], '#f97316': [], '#eab308': [],
        '#3b82f6': [], '#a855f7': [], '#22c55e': []
    };
    const special: SpecialSat[] = [];
    const screenPositions = new Map<string, ScreenPoint>();

    for (const sat of entries) {
        const geo = posCache.get(sat.name);
        if (!geo) continue;
        const pt = latLngToXY(geo.lat, normalizeLng(geo.lng));
        if (!pt) continue;
        const x = pt.x | 0, y = pt.y | 0;  // fast integer floor
        if (x < -pad || x > viewW + pad || y < -pad || y > viewH + pad) continue;
        screenPositions.set(sat.name, { x, y });
        if (sat.type !== 'normal') {
            special.push({ sat, x, y });
        } else {
            const color = getOrbitColor(altCache.get(sat.name) ?? 0);
            (buckets[color] ??= []).push(x, y);
        }
    }
    return { buckets, special, screenPositions };
}

export function resolveSatelliteImage(e: Pick<SatelliteEntry, 'type' | 'isTrain'>): string {
    return e.isTrain ? SAT_IMAGES.starlink : (SAT_IMAGES[e.type] ?? SAT_IMAGES.normal);
}
export function resolveSatelliteLabel(e: Pick<SatelliteEntry, 'type' | 'isTrain'>): string {
    return e.isTrain ? 'Starlink Train' : (SAT_LABELS[e.type] ?? 'Satellite');
}
