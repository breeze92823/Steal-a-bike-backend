import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("roster and presence", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  it("relays the profile picture, bounded", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a", username: "Ann", pfp: "https://static.bloxity.io/img/pfps/3.png" });
    const b = await colyseus.connectTo(room, { userId: "guest-b", username: "Bo", pfp: "javascript:alert(1)" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(a.sessionId)!.pfp, "https://static.bloxity.io/img/pfps/3.png");
    assert.strictEqual(room.state.players.get(b.sessionId)!.pfp, "", "only http(s) pictures are relayed");
  });

  it("relays pose, bike, trail and the Bloxity skin, bounded", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const look = JSON.stringify({ equipped: { hatId: "3" }, skin: null });
    const a = await colyseus.connectTo(room, { userId: "guest-a", username: "Ann", avatar: look });
    await sleep(30);
    const p = room.state.players.get(a.sessionId)!;
    assert.strictEqual(p.avatar, look, "the join options carry the skin");

    a.send("pose", { x: 5, y: 1, z: -40, yaw: 7, speed: 99999, state: 9 });
    a.send("loadout", { trail: "rainbow", bike: "Club Tourer" });
    a.send("setAvatar", { avatar: "x".repeat(5000) });
    await sleep(50);
    assert.strictEqual(p.z, -40);
    assert.ok(Math.abs(p.yaw) <= Math.PI, "yaw is wrapped");
    assert.strictEqual(p.speed, 500);
    assert.strictEqual(p.state, 2);
    assert.strictEqual(p.trail, "rainbow");
    assert.strictEqual(p.bike, "Club Tourer");
    assert.strictEqual(p.avatar, look, "an oversized look is ignored");

    a.send("loadout", { trail: "", bike: "<script>" });
    await sleep(30);
    assert.strictEqual(p.trail, "");
    assert.strictEqual(p.bike, "Club Tourer", "a malformed bike name is ignored");
  });
});
