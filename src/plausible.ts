import { CASH_FLOOR, CASH_PER_SEC, INCOME_MAX, SAVE_GAP_MAX_S, SPEED_FLOOR, SPEED_PER_SEC } from "./constants.js";
import type { PlayerDoc } from "./db.js";

// A light guard for the leaderboard, not a server-side economy: the game is client-authoritative,
// so a forged save could otherwise put 1e30 cash on the Most Cash board. The server counts the
// seconds it has really seen this account play (`earnSeconds`, its own clock, never the client's)
// and refuses a save whose cash / speed is beyond the best the game can pay in that time: income
// from a full base of the dearest bikes plus selling stolen bikes as fast as they can be stolen
// (rates in constants.ts, from the client's config.js). A refused number keeps its stored value.

export interface EarnClock {
  seconds: number; // server-seen play time of the account
  at: number; // epoch ms of the last save
}

export const cashCeiling = (seconds: number) => CASH_FLOOR + seconds * CASH_PER_SEC;
export const speedCeiling = (seconds: number) => SPEED_FLOOR + seconds * SPEED_PER_SEC;

// Advances the clock to `now` (a long silence counts as at most SAVE_GAP_MAX_S).
export function tick(clock: EarnClock, now: number): void {
  clock.seconds += Math.min(Math.max(0, (now - clock.at) / 1000), SAVE_GAP_MAX_S);
  clock.at = now;
}

// The patch without the numbers the clock can't explain; `refused` names what was dropped.
export function plausible(patch: Partial<PlayerDoc>, clock: EarnClock): { patch: Partial<PlayerDoc>; refused: string[] } {
  const out = { ...patch };
  const refused: string[] = [];
  if (out.cash !== undefined && out.cash > cashCeiling(clock.seconds)) {
    delete out.cash;
    refused.push("cash");
  }
  if (out.speed !== undefined && out.speed > speedCeiling(clock.seconds)) {
    delete out.speed;
    refused.push("speed");
  }
  if (out.income !== undefined && out.income > INCOME_MAX) {
    delete out.income;
    refused.push("income");
  }
  return { patch: out, refused };
}
