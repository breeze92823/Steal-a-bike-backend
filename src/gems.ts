import { EventEmitter } from "node:events";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

import { GEM_PACKS } from "./constants.js";
import { getPlayers, getPurchases } from "./db.js";

// Gems purchases (docs.bloxity.io "Gems webhook"): Bloxity POSTs a paid purchase here and the grant
// must be answered 2xx within 10 s, or the player is refunded. Pods share one database and the
// webhook can hit any pod, so each grant is keyed by `transactionId`: a retry is answered 200 and
// grants nothing twice. A 4xx is a permanent refusal (Bloxity refunds at once).
//   LEGION_WEBHOOK_SECRET   when set, the `x-legion-webhook-secret` header must match it.
// The grant is announced on `grants` so the room holding that player can tell them (WorldRoom).
export const grants = new EventEmitter();

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface Purchase {
  transactionId?: unknown;
  userId?: unknown;
  sku?: unknown;
}

// Express handler for the game's webhook URL (POST /webhooks/gems, set in the Bloxity dashboard).
export async function gemsWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.LEGION_WEBHOOK_SECRET;
  if (secret && !sameSecret(String(req.header("x-legion-webhook-secret") ?? ""), secret)) {
    res.status(401).json({ ok: false, error: "bad secret" });
    return;
  }
  const { transactionId, userId, sku } = (req.body ?? {}) as Purchase;
  if (typeof transactionId !== "string" || !transactionId || typeof userId !== "string" || !userId || typeof sku !== "string") {
    res.status(400).json({ ok: false, error: "bad body" });
    return;
  }
  const gems = GEM_PACKS[sku];
  if (!gems) {
    res.status(400).json({ ok: false, error: "unknown sku" }); // permanent: refunded
    return;
  }
  const players = getPlayers();
  const purchases = getPurchases();
  if (!players || !purchases) {
    res.status(503).json({ ok: false, error: "no database" }); // temporary: Bloxity retries
    return;
  }
  try {
    // The unique _id makes the claim atomic across pods: only the first insert wins.
    const claim = await purchases.updateOne({ _id: transactionId }, { $setOnInsert: { userId, sku, at: new Date() } }, { upsert: true });
    const first = (claim as { upsertedCount?: number }).upsertedCount !== 0;
    if (first) {
      await players.updateOne({ _id: userId }, { $inc: { gems }, $set: { updatedAt: new Date() }, $setOnInsert: { version: 1 } }, { upsert: true });
      grants.emit("grant", userId, gems);
    }
    res.status(200).json({ ok: true, duplicate: !first });
  } catch (err) {
    console.warn("[gems] grant failed", err);
    res.status(500).json({ ok: false }); // Bloxity retries 5xx
  }
}
