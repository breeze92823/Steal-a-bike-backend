import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { sanitizeProgress } from "../src/sanitize.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("sanitizeProgress", () => {
  it("bounds numbers and drops malformed lists", () => {
    const out = sanitizeProgress({ cash: -5, gems: "x", speed: 1e99, treadmill: 0, bikes: ["Club Tourer", "<b>", "Club Tourer"], found: ["A", "A"], trails: ["red", "x y"], trail: "blue" })!;
    assert.strictEqual(out.cash, 0);
    assert.strictEqual(out.gems, undefined);
    assert.strictEqual(out.speed, 1e18);
    assert.strictEqual(out.treadmill, 1);
    assert.deepStrictEqual(out.bikes, ["Club Tourer", "Club Tourer"], "duplicates stay, junk goes");
    assert.deepStrictEqual(out.found, ["A"]);
    assert.deepStrictEqual(out.trails, ["red"]);
    assert.strictEqual(out.trail, undefined, "an unowned trail is not equipped");
  });
  it("rejects non-objects", () => assert.strictEqual(sanitizeProgress([1]), null));
});

describe("progress", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());
  afterEach(() => __setPlayersForTest(null));

  it("loads the saved doc, then saves only after the load", async () => {
    const fake = fakePlayers([{ _id: "u1", username: "Ann", cash: 777, bikes: ["Club Tourer"], version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u1", username: "Ann" });
    let doc: any = null;
    c.onMessage("progress", (m: any) => (doc = m));
    c.onMessage("leaderboard", () => {});
    c.send("saveProgress", { cash: 1 }); // before the load: ignored
    await sleep(30);
    assert.strictEqual(fake.docs.get("u1")!.cash, 777);
    fake.release();
    await sleep(100);
    assert.strictEqual(doc?.cash, 777);
    c.send("saveProgress", { cash: 900, bikes: ["Club Tourer", "BMX"] });
    await sleep(100);
    assert.strictEqual(fake.docs.get("u1")!.cash, 900);
    assert.deepStrictEqual(fake.docs.get("u1")!.bikes, ["Club Tourer", "BMX"]);
  });

  it("never saves guests", async () => {
    const fake = fakePlayers();
    __setPlayersForTest(fake);
    fake.release();
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "guest-z", username: "G" });
    c.onMessage("noProgress", () => {});
    c.onMessage("leaderboard", () => {});
    c.send("saveProgress", { cash: 5 });
    await sleep(100);
    assert.strictEqual(fake.docs.size, 0);
  });
});
