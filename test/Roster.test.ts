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

  it("gives every player their own plot, reuses a freed one and relays each base", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a", username: "Ann", base: { floors: 2, placed: ["BMX", "Club Tourer"], treadmill: 3 } });
    const b = await colyseus.connectTo(room, { userId: "guest-b", username: "Bo" });
    await sleep(50);
    const pa = room.state.players.get(a.sessionId)!;
    const pb = room.state.players.get(b.sessionId)!;
    assert.strictEqual(pa.plot, 0);
    assert.strictEqual(pb.plot, 1);
    assert.strictEqual(pa.floors, 2, "the join options carry the base");
    assert.strictEqual(pa.placed, "BMX|Club Tourer");
    assert.strictEqual(pa.treadmill, 3);

    b.send("base", { floors: 9, placed: ["Vispo", "<x>", 5], treadmill: 0 });
    await sleep(50);
    assert.strictEqual(pb.floors, 3, "floors are capped");
    assert.strictEqual(pb.placed, "Vispo", "junk names are dropped");
    assert.strictEqual(pb.treadmill, 1);

    await a.leave(true);
    await sleep(50);
    const c = await colyseus.connectTo(room, { userId: "guest-c", username: "Cy" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(c.sessionId)!.plot, 0, "a freed plot goes to the next player");
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
