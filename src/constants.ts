// The game slug registered on bloxity.io (the client's GAME_SLUG in src/config.js). The hosting env
// BLOXITY_GAME_ID wins when set; this is the fallback for local runs and tests.
export const GAME_SLUG = "steal-a-bike";

// Keep in step with the client's src/config.js (NET) by hand.
// A room is the hub with its PLOT_COUNT bases (client LAYOUT.plotCenters): one base per player,
// so a room holds that many players and the next one gets a new room (party play needs 2-100).
export const PLOT_COUNT = 7;
export const ROOM_MAX_CLIENTS = 7;
// A base's floors (client BASE.floors): the ground plus up to two decks.
export const BASE_FLOORS_MAX = 3;

// Longest accepted strings.
export const NAME_MAX = 64;
// Profile picture URL (Bloxity `pfp`), relayed so other players can draw it.
export const PFP_MAX_LEN = 512;
// Presence (presence.ts): the Bloxity look JSON { equipped, proportions, skin } relayed so the
// others can dress the remote avatar, and the pose bounds (metres; speed in m/s).
export const AVATAR_MAX_LEN = 3000;
export const POSE_BOUNDS = { xy: 2000, speed: 500 };

// Colyseus drops the whole connection for a WebSocket message above this (default 4 KB).
export const MAX_PAYLOAD_BYTES = 128 * 1024;

// How long a dropped connection (WiFi blip, backgrounded tab) may reconnect with the same session.
export const RECONNECT_SECONDS = 20;

// Upper bounds for saved values, so a forged payload cannot store a bogus number.
export const CURRENCY_MAX = 1e18; // cash, speed (the top board entry in the hub reads ~$12T)
// $/s: a full base (12 pads) of the dearest catalog bike ($25M/s) plus the treadmill, with the 1.5x
// Income boost, rounded up (client config.js INDEX_WORLDS / BASE).
export const INCOME_MAX = 5e8;
export const TREADMILL_LEVEL_MAX = 200;
export const PLAY_SECONDS_MAX = 31_536_000; // ~1 year
// Bikes you own (sellshop.js), placed in the base (base.js), the Bike Index and trails.
export const BIKES_MAX = 2000;
export const PLACED_MAX = 64; // >= the client's BASE.floors slots, all floors
export const FOUND_MAX = 512;
export const OWNED_TRAILS_MAX = 64;
export const FUSE_MAX = 64;
export const DAILY_CLAIMED_MAX = 1000;

// Leaderboards (leaderboard.ts; client market.js MOST CASH board): the saved doc fields ranked,
// rows per board and how often the lists are re-read and re-sent. "Global top 50", refreshed
// every 60 s, exactly as the board in the hub says.
export const LEADERBOARD_STATS = ["cash", "speed"] as const;
export type LeaderboardStat = (typeof LEADERBOARD_STATS)[number];
export const LEADERBOARD_SIZE = 50;
export const LEADERBOARD_EVERY_MS = 60 * 1000;

// Plausibility (plausible.ts): what the economy can pay per second of play, with generous slack.
// Cash: a full base's income plus selling a dearest-bike steal ($25M/s x 75 = $1.9B) every ~10 s;
// speed: the treadmill's best rate (50 x the 14x trail) with a x4 click every 0.45 s. The floors
// cover starting money, Daily Rewards and the Bike Index's one-off discovery rewards.
export const CASH_FLOOR = 5e9;
export const CASH_PER_SEC = 1e9;
export const SPEED_FLOOR = 1e6;
export const SPEED_PER_SEC = 2e4;
export const SAVE_GAP_MAX_S = 120; // a save counts for at most this much play time since the last

// Bloxity's own boards (platformBoards.ts; the client's LEADERBOARDS in config.js declares the
// same ones): how often scores are reported and the most in one call. Most Cash first: the portal
// opens on it.
export const PLATFORM_BOARD_EVERY_MS = 30 * 1000;
export const PLATFORM_BOARD_BATCH = 200;
export const PLATFORM_BOARDS = [
  { id: "cash", label: "Most Cash", order: "desc", mode: "best", format: "compact", reset: "none" },
  { id: "speed", label: "Top Speed", order: "desc", mode: "best", format: "compact", reset: "none" },
] as const;

// Gems (gems.ts): the Gems-purchase webhook grants these per SKU (the SKUs are created in the
// game's Bloxity dashboard; add one here per product). Gems are server-owned: saveProgress never
// carries them.
export const GEM_PACKS: Record<string, number> = { gems_100: 100, gems_500: 500, gems_1200: 1200 };

// `emote` (presence.ts): a Bloxity emote id plus a number that makes a repeat of it a change.
export const EMOTE_PATTERN = /^[A-Za-z0-9_-]{1,64}#[0-9]{1,3}$/;

// Catalog ids (trails): slugs. Bike names are free text from the client catalog
// ("Club Tourer"), so they get a looser pattern.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const BIKE_NAME_PATTERN = /^[A-Za-z0-9 '.&!_-]{1,48}$/;

// The client's per-browser fallback id for players who are not signed in to Bloxity.
// Guests are never persisted.
export const GUEST_ID_PREFIX = "guest-";
// Ids the client makes in VITE_DEV_MODE (no SDK): saved only when no Bloxity API is configured
// (a local server), never on a deployed one.
export const DEV_ID_PREFIX = "dev-";
