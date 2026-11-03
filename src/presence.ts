import { AVATAR_MAX_LEN, BASE_FLOORS_MAX, BIKE_NAME_PATTERN, EMOTE_PATTERN, ID_PATTERN, PLACED_MAX, POSE_BOUNDS, TREADMILL_LEVEL_MAX } from "./constants.js";
import type { PlayerState } from "./rooms/schema/WorldState.js";

// Presence: what the other clients need to draw a player in the world (client remotePlayers.js).
// Relayed through the roster as sent, only bounded here -- like the rest of the game it is
// client-authoritative and purely cosmetic.

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// `pose` { x, y, z, yaw, speed, state }: feet position (m), heading (rad), speed (m/s) and what the
// body is doing (0 on foot, 1 riding or training on a bike, 2 walking a bike by the handlebars).
export function applyPose(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  const b = POSE_BOUNDS;
  if (finite(m.x)) p.x = clamp(m.x, -b.xy, b.xy);
  if (finite(m.y)) p.y = clamp(m.y, -b.xy, b.xy);
  if (finite(m.z)) p.z = clamp(m.z, -b.xy, b.xy);
  if (finite(m.yaw)) p.yaw = Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw));
  if (finite(m.speed)) p.speed = clamp(m.speed, 0, b.speed);
  if (finite(m.state)) p.state = clamp(Math.floor(m.state), 0, 2);
}

// `loadout` { trail, bike }: the equipped trail id ("" = none) and the name of the bike being
// ridden or held ("" = the starter bicycle).
export function applyLoadout(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  if (m.trail === "" || (typeof m.trail === "string" && ID_PATTERN.test(m.trail))) p.trail = m.trail as string;
  if (m.bike === "" || (typeof m.bike === "string" && BIKE_NAME_PATTERN.test(m.bike))) p.bike = m.bike as string;
}

// `setAvatar` { avatar }: the Bloxity look as an opaque JSON string ("" = default), length-capped.
export function applyAvatar(p: PlayerState, msg: unknown): void {
  const a = (msg as { avatar?: unknown })?.avatar;
  if (typeof a === "string" && a.length <= AVATAR_MAX_LEN) p.avatar = a;
}

// `emote` { emote }: Boxity only tells the player who picked it, so the others hear it here.
export function applyEmote(p: PlayerState, msg: unknown): void {
  const e = (msg as { emote?: unknown })?.emote;
  if (typeof e === "string" && EMOTE_PATTERN.test(e)) p.emote = e;
}

// `base` { floors, placed: [names], treadmill }: what stands on the sender's plot, drawn by everyone
// (client plots.js). Bike names are checked like a save's; the list is stored "|"-joined.
export function applyBase(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  if (finite(m.floors)) p.floors = clamp(Math.floor(m.floors), 1, BASE_FLOORS_MAX);
  if (finite(m.treadmill)) p.treadmill = clamp(Math.floor(m.treadmill), 1, Math.min(255, TREADMILL_LEVEL_MAX));
  if (Array.isArray(m.placed)) p.placed = m.placed.filter((n): n is string => typeof n === "string" && BIKE_NAME_PATTERN.test(n)).slice(0, PLACED_MAX).join("|");
}
