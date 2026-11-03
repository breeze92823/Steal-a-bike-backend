import { MongoClient, type Collection } from "mongodb";

import { LEADERBOARD_STATS } from "./constants.js";

// Bloxity Legion hosting injects MONGODB_URI per game+channel -- an isolated database with
// scoped credentials. A local `npm start` normally has no Mongo reachable, so a missing or
// unreachable URI must degrade to "no persistence" rather than crash the room.

// The persisted client state (what `saveProgress` carries, see sanitize.ts). The client keeps
// nothing in the browser: this document is the player's only save.
export interface PlayerDoc {
  _id: string; // Bloxity user id -- see WorldRoom.ts (guests are never saved)
  username?: string; // display name as of the last save
  cash?: number; // the HUD's cash (the Most Cash board ranks it)
  gems?: number; // server-owned: only the Gems webhook (gems.ts) adds to it
  giftAt?: number; // epoch ms of the last FREE GIFT! paid out (server-written)
  earnSeconds?: number; // play time the server has seen (plausible.ts), server-written
  speed?: number; // the bike counter trained on the treadmill
  income?: number; // $/s: treadmill + every bike in the base
  treadmill?: number; // treadmill level
  bikes?: string[]; // bikes owned and unsold, one name per bike (duplicates allowed)
  placed?: string[]; // bikes parked in the base, in slot order
  floors?: number; // base floors built (1..BASE_FLOORS_MAX)
  found?: string[]; // Bike Index: discovered bikes
  claimed?: string[]; // Bike Index: discovery rewards taken
  trails?: string[]; // owned trail ids
  trail?: string; // the equipped trail, "" = none
  fuse?: number; // Fuse Machine tiers fused
  dailyClaimed?: number; // Daily Rewards: days claimed this cycle
  dailyLast?: number; // epoch ms of the last claim
  playtime?: number; // s with the game visible
  lastSeen?: number; // epoch ms of the last activity
  version: number;
  updatedAt: Date;
}

let client: MongoClient | null = null;
let players: Collection<PlayerDoc> | null = null;
let purchases: Collection<{ _id: string; userId: string; sku: string; at: Date }> | null = null;

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI not set -- player progress will not persist");
    return;
  }
  try {
    client = new MongoClient(uri);
    await client.connect();
    // No dbName passed to .db() -- the injected URI already points at this game+channel's database.
    players = client.db().collection<PlayerDoc>("players");
    purchases = client.db().collection("purchases"); // one row per Gems transaction: _id = transactionId
    console.log("[db] connected to MongoDB");
    // The leaderboards sort and count by these (leaderboard.ts).
    for (const stat of LEADERBOARD_STATS) {
      players.createIndex({ [stat]: -1 }).catch((err) => console.warn(`[db] index on ${stat} failed`, err));
    }
  } catch (err) {
    console.warn("[db] connect failed -- player progress will not persist:", err);
    client = null;
    players = null;
  }
}

// Null whenever Mongo is unset/unreachable -- every caller must treat that as "skip persistence".
export function getPlayers(): Collection<PlayerDoc> | null {
  return players;
}

export function getPurchases() {
  return purchases;
}

// Test-only seam: exercise the save/load logic against an in-memory fake collection.
export function __setPlayersForTest(fake: Collection<PlayerDoc> | null): void {
  players = fake;
}

export function __setPurchasesForTest(fake: typeof purchases): void {
  purchases = fake;
}
