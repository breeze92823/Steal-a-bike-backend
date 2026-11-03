import { INCOME_MAX, OFFLINE_MAX_S, OFFLINE_MIN_S, OFFLINE_SHARE } from "./constants.js";
import type { PlayerDoc } from "./db.js";

// What a returning player earned while away: income ($/s) x the seconds since the server last saw
// them (capped at OFFLINE_MAX_S, the client's "$X/12h Offline!" banner). null when there is nothing
// to pay (new account, no income, or back within OFFLINE_MIN_S).
export function offlineEarnings(doc: Pick<PlayerDoc, "income" | "lastSeen">, now: number): { cash: number; seconds: number } | null {
  const income = Math.min(doc.income ?? 0, INCOME_MAX);
  if (!(income > 0) || !doc.lastSeen) return null;
  const seconds = Math.min(Math.floor((now - doc.lastSeen) / 1000), OFFLINE_MAX_S);
  if (!(seconds >= OFFLINE_MIN_S)) return null;
  return { cash: Math.floor(income * seconds * OFFLINE_SHARE), seconds };
}
