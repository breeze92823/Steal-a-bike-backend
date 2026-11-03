import { schema, t, type SchemaType } from "@colyseus/schema";

// The live roster: who is in the room. Durable progress lives in Mongo (src/db.ts).
// To sync something new about a player, add a field here and accept it in a WorldRoom message.
export const PlayerState = schema(
  {
    username: t.string().default(""), // Bloxity displayName/username
    signedIn: t.boolean().default(false), // verified Bloxity id: only signed-in players are saved
    pfp: t.string().default(""), // Bloxity profile picture URL ("" = none)
    // Presence (presence.ts, `pose` / `loadout` / `setAvatar`): what the others draw in the world.
    x: t.float64().default(0), // feet position, metres
    y: t.float64().default(0),
    z: t.float64().default(0),
    yaw: t.float32().default(0), // heading, rad
    speed: t.float32().default(0), // m/s, for dead reckoning and the animation
    state: t.uint8().default(0), // 0 on foot, 1 on a bike, 2 walking a bike
    trail: t.string().default(""), // equipped trail id, "" = none
    bike: t.string().default(""), // bike being ridden / held, "" = the starter bicycle
    uid: t.string().default(""), // the checked account id, "" for a guest: Bloxity chat messages name their sender by it
    emote: t.string().default(""), // "<emote id>#<n>": the last Bloxity emote started
    avatar: t.string().default(""), // Bloxity look JSON { equipped, proportions, skin }, "" = default
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    players: t.map(PlayerState), // keyed by sessionId
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
