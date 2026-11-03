import assert from "assert";
import { offlineEarnings } from "../src/offline.js";
import { OFFLINE_MAX_S } from "../src/constants.js";

describe("offlineEarnings", () => {
  const now = 1_000_000_000_000;
  it("pays income x seconds away", () => {
    assert.deepStrictEqual(offlineEarnings({ income: 10, lastSeen: now - 3600_000 }, now), { cash: 36000, seconds: 3600 });
  });
  it("caps at the offline maximum", () => {
    const r = offlineEarnings({ income: 1, lastSeen: now - 100 * 3600_000 }, now);
    assert.deepStrictEqual(r, { cash: OFFLINE_MAX_S, seconds: OFFLINE_MAX_S });
  });
  it("pays nothing for no income, no lastSeen or a short absence", () => {
    assert.strictEqual(offlineEarnings({ income: 0, lastSeen: now - 3600_000 }, now), null);
    assert.strictEqual(offlineEarnings({ income: 10 }, now), null);
    assert.strictEqual(offlineEarnings({ income: 10, lastSeen: now - 30_000 }, now), null);
  });
});
