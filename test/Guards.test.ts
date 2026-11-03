import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest, __setPurchasesForTest } from "../src/db.js";
import { CASH_FLOOR } from "../src/constants.js";
import { accountFor } from "../src/auth.js";
import { gemsWebhook } from "../src/gems.js";
import { __resetPlatformBoardsForTest, queueScores, reportScores } from "../src/platformBoards.js";
import { cashCeiling, plausible } from "../src/plausible.js";
import { fakePlayers, fakePurchases, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

const res = () => {
  const r: any = { code: 0, body: null };
  r.status = (c: number) => ((r.code = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  return r;
};
const req = (body: unknown, secret?: string) => ({ body, header: (n: string) => (n === "x-legion-webhook-secret" ? secret : undefined) }) as any;

describe("plausibility", () => {
  it("refuses cash and speed the play time cannot explain", () => {
    const { patch, refused } = plausible({ cash: 1e30, speed: 1e30, income: 10, treadmill: 2 }, { seconds: 10, at: 0 });
    assert.deepStrictEqual(refused, ["cash", "speed"]);
    assert.strictEqual(patch.cash, undefined);
    assert.strictEqual(patch.income, 10);
  });
  it("lets a normal player's numbers through", () => {
    const { refused } = plausible({ cash: 3300, speed: 598 }, { seconds: 0, at: 0 });
    assert.deepStrictEqual(refused, []);
    assert.ok(cashCeiling(3600) > cashCeiling(0));
  });

  describe("saves", () => {
    let colyseus: ColyseusTestServer<typeof appConfig>;
    before(async () => (colyseus = await testServer()));
    beforeEach(async () => await colyseus.cleanup());
    afterEach(() => __setPlayersForTest(null));

    it("never stores a forged cash number but keeps the rest of the save", async () => {
      const fake = fakePlayers([{ _id: "u1", username: "Ann", cash: 100, version: 1, updatedAt: new Date() }]);
      __setPlayersForTest(fake);
      fake.release();
      const room = await colyseus.createRoom<WorldState>("world", {});
      const c = await colyseus.connectTo(room, { userId: "u1", username: "Ann" });
      c.onMessage("progress", () => {});
      c.onMessage("leaderboard", () => {});
      await sleep(100);
      c.send("saveProgress", { cash: 1e30, bikes: ["BMX"] });
      await sleep(100);
      assert.strictEqual(fake.docs.get("u1")!.cash, 100, "the forged cash is not stored");
      assert.deepStrictEqual(fake.docs.get("u1")!.bikes, ["BMX"]);
      c.send("saveProgress", { cash: CASH_FLOOR - 1 });
      await sleep(100);
      assert.strictEqual(fake.docs.get("u1")!.cash, CASH_FLOOR - 1);
    });
  });
});

describe("auth", () => {
  it("trusts the sent id outside production, and only a checked token inside it", async () => {
    assert.strictEqual(await accountFor("u1", undefined, false), "u1");
    assert.strictEqual(await accountFor("guest-a", "tok", false), "", "guests are never accounts");
    assert.strictEqual(await accountFor("u1", undefined, true), "", "no token in production = guest");
    assert.strictEqual(await accountFor("dev-x", "tok", true), "", "dev ids are refused in production");
  });
});

describe("platform boards", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    __resetPlatformBoardsForTest();
    delete process.env.BLOXITY_REPORT_TOKEN;
    delete process.env.BLOXITY_GAME_ID;
  });
  it("reports queued scores as legion_ ids with the board definitions", async () => {
    process.env.BLOXITY_REPORT_TOKEN = "t";
    process.env.BLOXITY_GAME_ID = "steal-a-bike";
    let sent: any = null;
    globalThis.fetch = (async (url: string, init: any) => ((sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization }), { ok: true, json: async () => ({}) })) as any;
    queueScores("abc#m1", { cash: 1234.9, speed: 0 });
    await reportScores();
    assert.ok(sent.url.endsWith("/v1/leaderboards/hosted/steal-a-bike/report"));
    assert.strictEqual(sent.auth, "Bearer t");
    assert.deepStrictEqual(sent.body.scores, [{ board: "cash", userId: "legion_abc", score: 1234 }]);
    assert.strictEqual(sent.body.boards[0].id, "cash");
  });
});

describe("gems webhook", () => {
  afterEach(() => {
    __setPlayersForTest(null);
    __setPurchasesForTest(null);
    delete process.env.LEGION_WEBHOOK_SECRET;
  });
  it("grants once per transaction, refuses unknown skus and wrong secrets", async () => {
    const players = fakePlayers();
    players.release();
    __setPlayersForTest(players);
    __setPurchasesForTest(fakePurchases());
    process.env.LEGION_WEBHOOK_SECRET = "s3";
    const body = { transactionId: "tx1", userId: "u7", sku: "gems_500" };

    let r = res();
    await gemsWebhook(req(body, "wrong"), r);
    assert.strictEqual(r.code, 401);

    r = res();
    await gemsWebhook(req(body, "s3"), r);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(players.docs.get("u7")!.gems, 500);

    r = res();
    await gemsWebhook(req(body, "s3"), r); // Bloxity retries: answered 200, nothing granted again
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.duplicate, true);
    assert.strictEqual(players.docs.get("u7")!.gems, 500);

    r = res();
    await gemsWebhook(req({ ...body, transactionId: "tx2", sku: "nope" }, "s3"), r);
    assert.strictEqual(r.code, 400);
  });
});
