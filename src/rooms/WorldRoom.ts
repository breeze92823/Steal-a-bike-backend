import { Room, Client, CloseCode } from "colyseus";
import { WorldState, PlayerState } from "./schema/WorldState.js";
import { GUEST_ID_PREFIX, LEADERBOARD_EVERY_MS, NAME_MAX, PFP_MAX_LEN, RECONNECT_SECONDS, ROOM_MAX_CLIENTS } from "../constants.js";
import { getPlayers, type PlayerDoc } from "../db.js";
import { sanitizeProgress } from "../sanitize.js";
import { applyAvatar, applyEmote, applyLoadout, applyPose } from "../presence.js";
import { ranksOf, topBoards } from "../leaderboard.js";
import { accountFor } from "../auth.js";
import { queueScores } from "../platformBoards.js";
import { plausible, tick, type EarnClock } from "../plausible.js";
import { grants } from "../gems.js";

function sanitizeName(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, NAME_MAX) : "";
}

function sanitizePfp(raw: unknown): string {
  return typeof raw === "string" && raw.length <= PFP_MAX_LEN && /^https?:\/\//i.test(raw) ? raw : "";
}

interface Who {
  userId?: string;
  username?: string;
  pfp?: string;
  token?: string;
}

/**
 * Room every client joins via `client.joinOrCreate("world", { userId, username, pfp, token })`:
 * the shared hub where players see each other (pose, bike, trail and Bloxity skin are relayed
 * through the roster). Loads and saves each signed-in player's progress (MongoDB, see db.ts) --
 * the client keeps no save of its own, so this is the only place progress lives. The game is
 * client-authoritative: no gameplay rules live here, saves are only bounded (sanitize.ts). Full
 * rooms spill into a fresh one automatically (maxClients); the Bloxity matchmaker lists them.
 */
export class WorldRoom extends Room<{ state: WorldState }> {
  state = new WorldState();
  maxClients = ROOM_MAX_CLIENTS;

  // sessionId -> user id (verified Bloxity id). Deliberately NOT part of WorldState: it only gates
  // this room's own Mongo reads/writes. Guests have no entry.
  userIds = new Map<string, string>();

  // sessionIds that already got a progress/noProgress answer for their current identity.
  private identified = new Set<string>();
  // sessionIds whose current identity's save has been read: only these may write. A save sent
  // before the load answered would overwrite the stored progress with a fresh player's defaults.
  private loaded = new Set<string>();
  // sessionId -> the server's own count of this account's play seconds (plausible.ts), set with the load.
  private clocks = new Map<string, EarnClock>();

  messages = {
    // Debounced push of the client's whole progress. Upserts, so a first save creates the document.
    saveProgress: async (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const sane = sanitizeProgress(msg);
      if (!p || !sane || !this.loaded.has(client.sessionId)) return;

      const userId = this.userIds.get(client.sessionId);
      if (!userId) return;
      const players = getPlayers();
      if (!players) return; // Mongo unset/unreachable -- degrade silently
      // Cash / speed beyond what the time played can explain are not stored (plausible.ts).
      const clock = this.clocks.get(client.sessionId);
      if (!clock) return;
      tick(clock, Date.now());
      const { patch, refused } = plausible(sane, clock);
      if (refused.length) console.warn(`[WorldRoom] refused ${refused.join(", ")} from ${userId} after ${Math.floor(clock.seconds)}s`);
      try {
        await players.updateOne(
          { _id: userId },
          {
            // Display name comes from this connection's own PlayerState, not `msg`.
            $set: { ...patch, username: p.username || "Player", earnSeconds: clock.seconds, updatedAt: new Date() },
            $setOnInsert: { version: 1 },
          },
          { upsert: true },
        );
        // Bloxity's own boards (the trophy button).
        queueScores(userId, { ...(patch.cash !== undefined && { cash: patch.cash }), ...(patch.speed !== undefined && { speed: patch.speed }) });
      } catch (err) {
        console.warn("[WorldRoom] saveProgress failed", err);
      }
    },
    // Presence (presence.ts): the sender's pose ~10x/s, its trail / bike and its Bloxity look,
    // relayed through the roster so everyone draws them in the world (client remotePlayers.js).
    pose: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyPose(p, msg);
    },
    loadout: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyLoadout(p, msg);
    },
    setAvatar: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyAvatar(p, msg);
    },
    // Boxity only tells the player who picked an emote, so the others hear it here.
    emote: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyEmote(p, msg);
    },
    // Re-states identity after a login/logout that happens AFTER join (a guest who signs in
    // mid-session). The server answers with progress/noProgress for the new identity.
    identify: async (client: Client, msg: Who) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (typeof msg?.username === "string") p.username = sanitizeName(msg.username);
      if (typeof msg?.pfp === "string") p.pfp = sanitizePfp(msg.pfp);
      const who = await this.resolve(msg);
      if (!this.state.players.has(client.sessionId)) return;
      this.setUserId(client, p, who.userId);
    },
    // The player asks for the lists again (e.g. walked up to the board).
    leaderboard: (client: Client): void => void this.sendLeaderboard(client),
  };

  // Leaderboards (leaderboard.ts): everyone gets the top lists + their own ranks every
  // LEADERBOARD_EVERY_MS, and once right after their save loads.
  onCreate() {
    // The platform's server browser lists rooms with this.
    void this.setMetadata({ mode: "hub", modeName: "Steal a Bike" });
    this.clock.setInterval(() => {
      for (const c of this.clients) void this.sendLeaderboard(c);
    }, LEADERBOARD_EVERY_MS);
    // A Gems purchase paid out by the webhook (gems.ts): tell the player here (a player on another
    // pod gets the new balance with their next `progress`).
    grants.on("grant", this.onGrant);
  }

  private onGrant = async (userId: string) => {
    const players = getPlayers();
    for (const [sid, uid] of this.userIds) {
      if (uid !== userId) continue;
      const gems = (await players?.findOne({ _id: userId }, { projection: { gems: 1 } }))?.gems ?? 0;
      this.clients.find((c) => c.sessionId === sid)?.send("gems", { gems });
    }
  };

  onDispose() {
    grants.off("grant", this.onGrant);
  }

  // `leaderboard` { boards: { cash|speed: [{ name, value }] }, ranks: { stat: n | null } }.
  private async sendLeaderboard(client: Client) {
    const userId = this.userIds.get(client.sessionId) ?? "";
    const [boards, ranks] = await Promise.all([topBoards(), ranksOf(userId)]);
    if (!this.state.players.has(client.sessionId)) return;
    try {
      client.send("leaderboard", { boards, ranks });
    } catch {
      // Gone meanwhile.
    }
  }

  // Who a join / identify really is (auth.ts): in production the Bloxity token is checked with
  // Bloxity and the id it names is the account; no good token = guest. Locally the sent id is trusted.
  private async resolve(w: Who | undefined): Promise<Who> {
    return { userId: await accountFor(typeof w?.userId === "string" ? w.userId : "", w?.token) };
  }

  async onJoin(client: Client, options?: Who & { pose?: unknown; loadout?: unknown; avatar?: string }) {
    const p = new PlayerState();
    p.username = sanitizeName(options?.username);
    p.pfp = sanitizePfp(options?.pfp);
    // Presence from the join options, so the others draw the newcomer right away.
    applyPose(p, options?.pose);
    applyLoadout(p, options?.loadout);
    applyAvatar(p, options);
    this.state.players.set(client.sessionId, p);
    const who = await this.resolve(options);
    if (this.state.players.get(client.sessionId) !== p) return; // left while the token was checked
    this.setUserId(client, p, who.userId);
  }

  // A deliberate `room.leave()` closes with CONSENTED -- drop the player at once. Anything
  // else (WiFi blip, backgrounded tab) gets RECONNECT_SECONDS to reconnect with the same session.
  async onLeave(client: Client, code?: number) {
    if (code === CloseCode.CONSENTED) {
      void this.stampLastSeen(client.sessionId);
      this.forgetSession(client.sessionId);
      return;
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      void this.stampLastSeen(client.sessionId);
      this.forgetSession(client.sessionId);
    }
  }

  // Server-clock "last seen" for a player who has really gone. Call before forgetSession.
  private async stampLastSeen(sessionId: string) {
    const userId = this.userIds.get(sessionId);
    const players = getPlayers();
    if (!userId || !players) return;
    try {
      await players.updateOne({ _id: userId }, { $set: { lastSeen: Date.now() } });
    } catch (err) {
      console.warn("[WorldRoom] stampLastSeen failed", err);
    }
  }

  // Drops a session's per-connection bookkeeping.
  private forgetSession(sessionId: string) {
    this.state.players.delete(sessionId);
    this.userIds.delete(sessionId);
    this.identified.delete(sessionId);
    this.loaded.delete(sessionId);
    this.clocks.delete(sessionId);
  }

  // Called from both onJoin and `identify` with an already-resolved id (guest ids are dropped,
  // see GUEST_ID_PREFIX). Answers with progress / noProgress / serverError.
  private setUserId(client: Client, p: PlayerState, raw = "") {
    let userId = raw.slice(0, 128);
    // Guests (client-made `guest-...` ids) get no identity: nothing is loaded or saved for them.
    if (userId.startsWith(GUEST_ID_PREFIX)) userId = "";
    const prev = this.userIds.get(client.sessionId) || "";
    // No change (e.g. a username-only identify) -- but the very first call must still answer.
    if (userId === prev && this.identified.has(client.sessionId)) return;
    this.identified.add(client.sessionId);
    this.loaded.delete(client.sessionId); // no writes until the new identity's save is read
    p.signedIn = !!userId;
    p.uid = userId; // Bloxity chat messages name their sender by this id

    if (userId) {
      // Evict any OTHER live session already claiming this account, so one account never has
      // two writers (a crashed tab lingers up to RECONNECT_SECONDS via allowReconnection in onLeave).
      for (const [sid, uid] of this.userIds) {
        if (sid === client.sessionId || uid !== userId) continue;
        this.forgetSession(sid);
        const stale = this.clients.find((c) => c.sessionId === sid);
        if (stale) {
          try {
            stale.leave(CloseCode.CONSENTED);
          } catch {
            // Already gone -- nothing to clean up.
          }
        }
      }
      this.userIds.set(client.sessionId, userId);
    } else {
      // No identity: stop persisting for this connection. (The client flushes a final
      // saveProgress under the OLD id before sending `identify`.)
      this.userIds.delete(client.sessionId);
    }

    void this.loadProgress(client, userId, p);
  }

  // Sends the saved doc to just this client so it can hydrate its state ("progress"), or
  // "noProgress" when there is nothing to load (new account, guest, or Mongo unset). A failed read
  // sends "serverError" and keeps saving off, so a save that could not be read is never overwritten.
  private async loadProgress(client: Client, userId: string, p: PlayerState) {
    const players = getPlayers();
    let doc: PlayerDoc | null = null;
    if (userId && players) {
      try {
        doc = await players.findOne({ _id: userId });
      } catch (err) {
        console.warn("[WorldRoom] loadProgress failed", err);
        client.send("serverError", {});
        return;
      }
    }
    // The player may have left, or switched identity again, while the read was in flight.
    if (this.state.players.get(client.sessionId) !== p || (this.userIds.get(client.sessionId) ?? "") !== userId) return;

    this.loaded.add(client.sessionId);
    const now = Date.now();
    this.clocks.set(client.sessionId, { seconds: doc?.earnSeconds ?? 0, at: now });
    if (!doc) client.send("noProgress", { serverTime: now });
    else client.send("progress", { ...(sanitizeProgress(doc) ?? {}), gems: doc.gems ?? 0, serverTime: now });
    void this.sendLeaderboard(client);
  }
}
