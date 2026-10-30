import { LUNCH_UNCONFIRMED, sanitizeLunch, type LunchConfig } from './lunch.ts';
import { initialMachine } from './machine.ts';
import type { OutboxRow } from './outbox.ts';
import type { MachineState } from './types.ts';
import {
  DEFAULT_BATTERY_EVERY_MS,
  DEFAULT_DWELL_MS,
  DEFAULT_SPEED_MPH,
  DEFAULT_SPEED_SUSTAIN_MS,
  type ShopLocation,
} from './types.ts';

const SHOP_KEY = 'itdg-shop';
const CONSENT_KEY = 'itdg-shift-consent';
const STATE_KEY = 'itdg-shift-state';
const OUTBOX_KEY = 'itdg-shift-outbox';
const DWELL_KEY = 'itdg-shift-dwell-ms';
const SPEED_KEY = 'itdg-shift-speed-mph';
const LUNCH_KEY = 'itdg-shift-lunch';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode */ }
}

export function loadShop(): ShopLocation | null {
  const raw = readJson(SHOP_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const shop = raw as Partial<ShopLocation>;
  const latitude = Number(shop.latitude);
  const longitude = Number(shop.longitude);
  if (!shop.id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: String(shop.id),
    name: String(shop.name ?? 'Shop'),
    latitude,
    longitude,
    radiusMeters: Number(shop.radiusMeters) || 90,
  };
}

export function saveShop(shop: ShopLocation): void {
  writeJson(SHOP_KEY, shop);
}

export function loadConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch { /* private mode */ }
}

export function loadMachine(): MachineState {
  const raw = readJson(STATE_KEY);
  if (!raw || typeof raw !== 'object') return initialMachine();
  const state = raw as MachineState;
  if (!Array.isArray(state.segments) || !Array.isArray(state.batterySamples)) return initialMachine();
  return {
    ...initialMachine(),
    ...state,
    segments: state.segments,
    batterySamples: state.batterySamples,
  };
}

export function saveMachine(state: MachineState): void {
  writeJson(STATE_KEY, state);
}

export function loadOutbox(): OutboxRow[] {
  const raw = readJson(OUTBOX_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const row = item as OutboxRow;
    if (!row.table || !row.record || typeof row.record.id !== 'string') return [];
    return [row];
  });
}

export function saveOutbox(rows: OutboxRow[]): void {
  writeJson(OUTBOX_KEY, rows);
}

export function loadDwellMs(): number {
  const value = Number(readJson(DWELL_KEY));
  if (value === 3 * 60_000 || value === 4 * 60_000 || value === 5 * 60_000) return value;
  return DEFAULT_DWELL_MS;
}

export function saveDwellMs(dwellMs: number): void {
  writeJson(DWELL_KEY, dwellMs);
}

export function loadSpeedMph(): number {
  const value = Number(readJson(SPEED_KEY));
  if (Number.isFinite(value) && value >= 5 && value <= 25) return value;
  return DEFAULT_SPEED_MPH;
}

export function saveSpeedMph(speedMph: number): void {
  writeJson(SPEED_KEY, speedMph);
}

/** Last lunch window read from payroll_settings. Off until the server confirms it. */
export function loadLunch(): LunchConfig {
  const raw = readJson(LUNCH_KEY);
  if (!raw) return { ...LUNCH_UNCONFIRMED };
  return sanitizeLunch(raw, LUNCH_UNCONFIRMED);
}

export function saveLunch(lunch: LunchConfig): void {
  writeJson(LUNCH_KEY, lunch);
}

export const SHIFT_SPEED_SUSTAIN_MS = DEFAULT_SPEED_SUSTAIN_MS;
export const SHIFT_BATTERY_EVERY_MS = DEFAULT_BATTERY_EVERY_MS;
