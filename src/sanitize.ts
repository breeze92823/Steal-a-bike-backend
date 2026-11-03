import {
  CURRENCY_MAX, INCOME_MAX, TREADMILL_LEVEL_MAX, PLAY_SECONDS_MAX, BIKES_MAX, PLACED_MAX, FOUND_MAX, FUSE_MAX,
  DAILY_CLAIMED_MAX, ID_PATTERN, BIKE_NAME_PATTERN, OWNED_TRAILS_MAX,
} from "./constants.js";
import type { PlayerDoc } from "./db.js";

export function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function clampNum(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}
export function clampInt(v: number, max: number, min = 0): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
const isBike = (v: unknown): v is string => typeof v === "string" && BIKE_NAME_PATTERN.test(v);

// Bike names, duplicates kept (you can own three of one bike for the Fuse Machine).
export function sanitizeBikes(raw: unknown, max: number): string[] {
  return Array.isArray(raw) ? raw.filter(isBike).slice(0, max) : [];
}
// Unique bike names.
export function sanitizeNameSet(raw: unknown, max: number): string[] {
  return [...new Set(sanitizeBikes(raw, Infinity))].slice(0, max);
}
export function sanitizeIds(raw: unknown, max = OWNED_TRAILS_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isId))].slice(0, max);
}

// The game is client-authoritative -- no server-side gameplay validation. What IS enforced:
// shape and bounds, so a malformed payload can never corrupt this player's own Mongo document.
// A forged number can only ever affect the sender's own save.
export function sanitizeProgress(raw: unknown): Partial<PlayerDoc> | null {
  if (!isObject(raw)) return null;
  const out: Partial<PlayerDoc> = {};

  if (finite(raw.cash)) out.cash = clampNum(raw.cash, CURRENCY_MAX);
  // `gems` is server-owned (gems.ts): a save never carries it.
  if (finite(raw.speed)) out.speed = clampNum(raw.speed, CURRENCY_MAX);
  if (finite(raw.income)) out.income = clampNum(raw.income, INCOME_MAX);
  if (finite(raw.treadmill)) out.treadmill = clampInt(raw.treadmill, TREADMILL_LEVEL_MAX, 1);
  if (finite(raw.playtime)) out.playtime = clampInt(raw.playtime, PLAY_SECONDS_MAX);
  if (finite(raw.lastSeen)) out.lastSeen = clampInt(raw.lastSeen, Date.now() + 10 * 60 * 1000);

  if (raw.bikes !== undefined) out.bikes = sanitizeBikes(raw.bikes, BIKES_MAX);
  if (raw.placed !== undefined) out.placed = sanitizeBikes(raw.placed, PLACED_MAX);
  if (raw.found !== undefined) out.found = sanitizeNameSet(raw.found, FOUND_MAX);
  if (raw.claimed !== undefined) out.claimed = sanitizeNameSet(raw.claimed, FOUND_MAX);

  if (raw.trails !== undefined) out.trails = sanitizeIds(raw.trails);
  // The equipped trail must be owned ("" = none); without the list in this save, trust the shape.
  if (raw.trail === "") out.trail = "";
  else if (isId(raw.trail) && (!out.trails || out.trails.includes(raw.trail))) out.trail = raw.trail;

  if (finite(raw.fuse)) out.fuse = clampInt(raw.fuse, FUSE_MAX);
  if (finite(raw.dailyClaimed)) out.dailyClaimed = clampInt(raw.dailyClaimed, DAILY_CLAIMED_MAX);
  if (finite(raw.dailyLast)) out.dailyLast = clampInt(raw.dailyLast, Date.now() + 10 * 60 * 1000);
  return out;
}
