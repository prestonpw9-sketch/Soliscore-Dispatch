import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// TrueScale — blueprint scaling + dimensioning model, geometry, and persistence.
//
// Coordinate system: every stored point is in "base image pixels" — the pixel
// space of the blueprint rendered at its base resolution (scale 1.0), BEFORE any
// on-screen zoom/pan. This keeps calibration and dimensions stable no matter how
// the user zooms while measuring.
// ─────────────────────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

export type ScaleSource = 'manual' | 'preset';

/**
 * The active drawing scale. `unitsPerPixel` (real inches per base-image pixel)
 * is the single source of truth — it is derived either from a manual reference
 * line the user drew over a known length, or from a standard architectural scale
 * preset combined with the PDF's true physical page size.
 */
export interface Calibration {
  /** Real-world inches represented by one base-image pixel. */
  unitsPerPixel: number;
  source: ScaleSource;
  /** Human-readable description, e.g. `1/4" = 1'-0"` or `10' reference`. */
  label: string;
  /** Reference line endpoints (present for manual calibrations, for display). */
  a?: Pt;
  b?: Pt;
}

/** A dimension line drawn between two points (rendered with arrowheads + label). */
export interface DimLine {
  id: string;
  a: Pt;
  b: Pt;
  color: string;
  /** Stroke width in base image pixels. */
  width: number;
  /** Optional label override; when absent the measured length is shown. */
  label?: string;
}

export type LengthUnit = 'ft' | 'in';

export const TRUESCALE_VERSION = 1 as const;

/** A saved TrueScale document (annotations for one blueprint page). */
export interface TrueScaleDoc {
  version: typeof TRUESCALE_VERSION;
  /** Object name of the source file in the `blueprints` bucket. */
  sourcePath: string;
  /** Friendly display name of the source blueprint. */
  sourceName: string;
  /** 1-based PDF page index (1 for images). */
  page: number;
  calibration: Calibration | null;
  dimensions: DimLine[];
  savedAt: string;
  savedBy?: string;
}

// ── Geometry ────────────────────────────────────────────────────────────────

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Real-world length (inches) of a pixel distance, or null if not calibrated. */
export function realInchesForPixels(cal: Calibration | null, pixels: number): number | null {
  if (!cal || !Number.isFinite(cal.unitsPerPixel) || cal.unitsPerPixel <= 0) return null;
  return pixels * cal.unitsPerPixel;
}

/** Convert a user value + unit into inches. */
export function toInches(value: number, unit: LengthUnit): number {
  return unit === 'ft' ? value * 12 : value;
}

/** Build a manual calibration from a reference line + its real length in inches. */
export function manualCalibration(a: Pt, b: Pt, realInches: number): Calibration | null {
  const px = dist(a, b);
  if (px <= 0 || realInches <= 0) return null;
  return {
    unitsPerPixel: realInches / px,
    source: 'manual',
    label: `${formatFeetInches(realInches)} ref`,
    a,
    b,
  };
}

// ── Standard architectural scales ─────────────────────────────────────────────

export interface ArchScale {
  label: string;
  /** Paper inches that represent one real-world foot at this scale. */
  paperInchesPerFoot: number;
}

/** Standard architectural drawing scales (paper inches per foot). */
export const ARCH_SCALES: ArchScale[] = [
  { label: `3/32" = 1'-0"`, paperInchesPerFoot: 3 / 32 },
  { label: `1/8" = 1'-0"`, paperInchesPerFoot: 1 / 8 },
  { label: `3/16" = 1'-0"`, paperInchesPerFoot: 3 / 16 },
  { label: `1/4" = 1'-0"`, paperInchesPerFoot: 1 / 4 },
  { label: `3/8" = 1'-0"`, paperInchesPerFoot: 3 / 8 },
  { label: `1/2" = 1'-0"`, paperInchesPerFoot: 1 / 2 },
  { label: `5/8" = 1'-0"`, paperInchesPerFoot: 5 / 8 },
  { label: `3/4" = 1'-0"`, paperInchesPerFoot: 3 / 4 },
  { label: `7/8" = 1'-0"`, paperInchesPerFoot: 7 / 8 },
  { label: `1" = 1'-0"`, paperInchesPerFoot: 1 },
];

/**
 * Build a calibration from a standard scale + the rendered page's true pixel
 * density (base pixels per paper inch). Only valid when the PDF page is at its
 * real plotted size (`pxPerInch` known); returns null otherwise.
 */
export function presetCalibration(scale: ArchScale, pxPerInch: number | null | undefined): Calibration | null {
  if (!pxPerInch || pxPerInch <= 0 || scale.paperInchesPerFoot <= 0) return null;
  // real inches per paper inch = 12" per (paperInchesPerFoot) → divide by px/inch
  const realInchesPerPaperInch = 12 / scale.paperInchesPerFoot;
  return {
    unitsPerPixel: realInchesPerPaperInch / pxPerInch,
    source: 'preset',
    label: scale.label,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function reduceEighths(eighths: number): string {
  // eighths is 1..7
  let num = eighths;
  let den = 8;
  while (num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${num}/${den}`;
}

/**
 * Format inches as architectural feet-inches to the nearest 1/8",
 * e.g. 150.3 → `12' 6 1/4"`. Returns `—` for non-finite input.
 */
export function formatFeetInches(inches: number): string {
  if (!Number.isFinite(inches)) return '—';
  const sign = inches < 0 ? '-' : '';
  const totalEighths = Math.round(Math.abs(inches) * 8);
  const ft = Math.floor(totalEighths / (12 * 8));
  const remAfterFeet = totalEighths - ft * 12 * 8;
  const inWhole = Math.floor(remAfterFeet / 8);
  const frac = remAfterFeet - inWhole * 8;

  const inchPart =
    frac === 0
      ? `${inWhole}"`
      : inWhole === 0
        ? `${reduceEighths(frac)}"`
        : `${inWhole} ${reduceEighths(frac)}"`;

  if (ft === 0) return `${sign}${inchPart}`;
  // Suppress a bare 0" so we show e.g. 12' not 12' 0"
  if (frac === 0 && inWhole === 0) return `${sign}${ft}'`;
  return `${sign}${ft}' ${inchPart}`;
}

/** Format inches as decimal feet, e.g. 150.3 → `12.53 ft`. */
export function formatDecimalFeet(inches: number): string {
  if (!Number.isFinite(inches)) return '—';
  return `${(inches / 12).toFixed(2)} ft`;
}

/** The label shown on a dimension line given the current calibration. */
export function dimensionLabel(cal: Calibration | null, line: DimLine): string {
  if (line.label && line.label.trim()) return line.label;
  const inches = realInchesForPixels(cal, dist(line.a, line.b));
  if (inches == null) return `${Math.round(dist(line.a, line.b))} px`;
  return formatFeetInches(inches);
}

// ── Persistence (Supabase Storage, `blueprints` bucket, `truescale/` prefix) ──

const BUCKET = 'blueprints';
export const TRUESCALE_PREFIX = 'truescale';

/** Blueprint listings should hide the TrueScale sidecar folder. */
export function isTrueScaleEntry(name: string): boolean {
  return name === TRUESCALE_PREFIX || name.startsWith(`${TRUESCALE_PREFIX}/`);
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 80);
}

/** Deterministic sidecar path for a given source blueprint + page. */
export function buildDocPath(sourcePath: string, page: number): string {
  return `${TRUESCALE_PREFIX}/${slug(sourcePath)}__p${page}.json`;
}

export interface SavedDocInfo {
  path: string;
  updatedAt?: string;
}

/** List every saved TrueScale sidecar document. */
export async function listTrueScaleDocs(): Promise<SavedDocInfo[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(TRUESCALE_PREFIX, { limit: 500, sortBy: { column: 'updated_at', order: 'desc' } });
  if (error) {
    console.error('TrueScale: list docs failed:', error.message);
    return [];
  }
  return (data ?? [])
    .filter(f => f.name.endsWith('.json'))
    .map(f => ({ path: `${TRUESCALE_PREFIX}/${f.name}`, updatedAt: f.updated_at }));
}

/** Load and parse a saved document by its storage path. */
export async function loadTrueScaleDoc(path: string): Promise<TrueScaleDoc | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error('TrueScale: load failed:', error?.message);
    return null;
  }
  try {
    const text = await data.text();
    return JSON.parse(text) as TrueScaleDoc;
  } catch (err) {
    console.error('TrueScale: parse failed:', err);
    return null;
  }
}

/** Upsert a document into storage. Returns the stored path on success. */
export async function saveTrueScaleDoc(doc: TrueScaleDoc): Promise<string> {
  const path = buildDocPath(doc.sourcePath, doc.page);
  const body = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { upsert: true, contentType: 'application/json' });
  if (error) throw error;
  return path;
}

/** Delete a saved document. */
export async function deleteTrueScaleDoc(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** Default color palette for dimension lines. */
export const TRUESCALE_COLORS = [
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#0f172a', // near-black
  '#ffffff', // white (for dark plans)
];
