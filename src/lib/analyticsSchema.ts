// Shared between server (to build safe SQL from whitelisted fields) and the admin UI
// (to populate the explorer's dropdowns). Every column/field name used in a dynamic
// query must come from here.

export type FieldKind = "cat" | "num" | "bool";
export interface FieldDef {
	key: string;
	label: string;
	kind: FieldKind;
}

export const EVENT_TYPES = [
	"draw",
	"sheep_built",
	"action",
	"bodyswap",
	"challenge_played",
	"coin_flip",
	"challenge_resolved",
	"discard",
	"turn_end",
	"final_round",
	"player_replaced",
	"game_end",
] as const;
export type EventTypeName = (typeof EVENT_TYPES)[number];

export const EVENT_FIELDS: Record<EventTypeName, FieldDef[]> = {
	draw: [
		{ key: "cards", label: "Cards drawn", kind: "num" },
		{ key: "deckLeft", label: "Deck left", kind: "num" },
		{ key: "handSize", label: "Hand size after", kind: "num" },
	],
	sheep_built: [
		{ key: "kind", label: "Sheep kind", kind: "cat" },
		{ key: "points", label: "Points", kind: "num" },
		{ key: "headColor", label: "Head colour", kind: "cat" },
		{ key: "buttColor", label: "Butt colour", kind: "cat" },
		{ key: "extraColor", label: "Extra part colour", kind: "cat" },
		{ key: "rainbowParts", label: "Rainbow parts", kind: "num" },
		{ key: "modifier", label: "Modifier", kind: "cat" },
		{ key: "source", label: "Source (hand/discard)", kind: "cat" },
	],
	action: [
		{ key: "action", label: "Action", kind: "cat" },
		{ key: "kind", label: "Target sheep kind", kind: "cat" },
		{ key: "points", label: "Target sheep points", kind: "num" },
		{ key: "cards", label: "Cards yoinked", kind: "num" },
	],
	bodyswap: [
		{ key: "fromKind", label: "From kind", kind: "cat" },
		{ key: "toKind", label: "To kind", kind: "cat" },
		{ key: "ownSheep", label: "Own sheep", kind: "bool" },
		{ key: "points", label: "Resulting points", kind: "num" },
	],
	challenge_played: [
		{ key: "challenge", label: "Challenge", kind: "cat" },
		{ key: "guess", label: "Guess", kind: "cat" },
		{ key: "challengerPoints", label: "Challenger field points", kind: "num" },
		{ key: "targetPoints", label: "Target field points", kind: "num" },
	],
	coin_flip: [
		{ key: "challenge", label: "Challenge", kind: "cat" },
		{ key: "guess", label: "Guess", kind: "cat" },
		{ key: "flip", label: "Flip result", kind: "cat" },
		{ key: "challengerWon", label: "Challenger won", kind: "bool" },
		{ key: "flipNumber", label: "Flip number", kind: "num" },
		{ key: "reflip", label: "Is a re-flip", kind: "bool" },
		{ key: "reflipBy", label: "Re-flip played by", kind: "cat" },
		{ key: "reflipChangedOutcome", label: "Re-flip changed outcome", kind: "bool" },
	],
	challenge_resolved: [
		{ key: "challenge", label: "Challenge", kind: "cat" },
		{ key: "challengerWon", label: "Challenger won", kind: "bool" },
		{ key: "flips", label: "Flips taken", kind: "num" },
		{ key: "count", label: "Sheep/cards affected", kind: "num" },
		{ key: "points", label: "Points affected", kind: "num" },
		{ key: "recoveredKind", label: "Recovered kind", kind: "cat" },
	],
	discard: [
		{ key: "count", label: "Cards discarded", kind: "num" },
		{ key: "head", label: "Heads discarded", kind: "num" },
		{ key: "butt", label: "Butts discarded", kind: "num" },
		{ key: "rainbow", label: "Rainbow parts discarded", kind: "num" },
		{ key: "wheat", label: "Wheat discarded", kind: "num" },
		{ key: "wolf", label: "Wolf discarded", kind: "num" },
		{ key: "yoink", label: "Yoink discarded", kind: "num" },
		{ key: "reflip", label: "Re-Flip discarded", kind: "num" },
		{ key: "paint", label: "Paint discarded", kind: "num" },
		{ key: "franken", label: "Franken discarded", kind: "num" },
	],
	turn_end: [
		{ key: "handSize", label: "Hand size", kind: "num" },
		{ key: "fieldSize", label: "Sheep in field", kind: "num" },
		{ key: "fieldPoints", label: "Field points", kind: "num" },
		{ key: "challengesInHand", label: "Challenges held", kind: "num" },
		{ key: "deckLeft", label: "Deck left", kind: "num" },
		{ key: "finalRound", label: "In final round", kind: "bool" },
	],
	final_round: [],
	player_replaced: [],
	game_end: [
		{ key: "winningScore", label: "Winning score", kind: "num" },
		{ key: "tied", label: "Players tied", kind: "num" },
		{ key: "wasTiebreak", label: "Was tiebreak", kind: "bool" },
	],
};

// Columns on the events table itself that can be grouped by
export const EVENT_DIMENSIONS: FieldDef[] = [
	{ key: "type", label: "Event type", kind: "cat" },
	{ key: "actor_seat", label: "Actor seat (0 = first)", kind: "cat" },
	{ key: "target_seat", label: "Target seat (0 = first)", kind: "cat" },
	{ key: "turn", label: "Turn", kind: "num" },
	{ key: "turn_bucket", label: "Turn (buckets of 5)", kind: "cat" },
	{ key: "minute", label: "Minute of game", kind: "num" },
];

export const GAME_COLUMNS: FieldDef[] = [
	{ key: "status", label: "Status", kind: "cat" },
	{ key: "player_count", label: "Players", kind: "cat" },
	{ key: "human_count", label: "Humans", kind: "cat" },
	{ key: "bot_count", label: "Bots", kind: "cat" },
	{ key: "replaced_count", label: "Humans replaced by bots", kind: "cat" },
	{ key: "is_public", label: "Public lobby", kind: "bool" },
	{ key: "source", label: "Source (website / discord)", kind: "cat" },
	{ key: "final_round_reached", label: "Final round reached", kind: "bool" },
	{ key: "winner_seat", label: "Winner seat (0 = first)", kind: "cat" },
	{ key: "winner_is_bot", label: "Winner is bot", kind: "bool" },
	{ key: "was_tiebreak", label: "Tiebreak", kind: "bool" },
	{ key: "tied_count", label: "Players tied", kind: "cat" },
	{ key: "duration_min", label: "Duration (min)", kind: "num" },
	{ key: "turns", label: "Turns", kind: "num" },
	{ key: "winning_score", label: "Winning score", kind: "num" },
	{ key: "deck_size", label: "Deck size at start", kind: "num" },
	{ key: "deck_left", label: "Deck left at end", kind: "num" },
	{ key: "discard_size", label: "Discard pile at end", kind: "num" },
	{ key: "sheep_built", label: "Sheep built", kind: "num" },
	{ key: "actions_played", label: "Actions played", kind: "num" },
	{ key: "bodyswaps", label: "BodySwaps", kind: "num" },
	{ key: "challenges_played", label: "Challenges played", kind: "num" },
	{ key: "coin_flips", label: "Coin flips", kind: "num" },
	{ key: "reflips", label: "Re-flips", kind: "num" },
	{ key: "event_count", label: "Events", kind: "num" },
];

export const PLAYER_COLUMNS: FieldDef[] = [
	{ key: "seat", label: "Seat (0 = first)", kind: "cat" },
	{ key: "is_bot", label: "Is bot", kind: "bool" },
	{ key: "was_replaced", label: "Replaced by bot", kind: "bool" },
	{ key: "is_winner", label: "Won", kind: "bool" },
	{ key: "placement", label: "Placement", kind: "cat" },
	{ key: "score", label: "Score", kind: "num" },
	{ key: "field_points", label: "Field points", kind: "num" },
	{ key: "challenge_penalty", label: "Challenge penalty", kind: "num" },
	{ key: "sheep_count", label: "Sheep at end", kind: "num" },
	{ key: "hand_size", label: "Hand size at end", kind: "num" },
	{ key: "basic", label: "Basic sheep", kind: "num" },
	{ key: "half_rainbow", label: "Half-rainbow sheep", kind: "num" },
	{ key: "full_rainbow", label: "Double-rainbow sheep", kind: "num" },
	{ key: "painted", label: "Painted sheep", kind: "num" },
	{ key: "franken_heads", label: "Double-headed sheep", kind: "num" },
	{ key: "franken_butts", label: "Double-butted sheep", kind: "num" },
	{ key: "turns_taken", label: "Turns taken", kind: "num" },
	{ key: "sheep_built", label: "Sheep built", kind: "num" },
	{ key: "actions_played", label: "Actions played", kind: "num" },
	{ key: "challenges_played", label: "Challenges played", kind: "num" },
	{ key: "challenges_won", label: "Challenges won (either side)", kind: "num" },
	{ key: "times_targeted", label: "Times targeted", kind: "num" },
];

// Game-level dimensions that every source can also be split by
export const SHARED_GAME_DIMENSIONS: FieldDef[] = [
	{ key: "g.player_count", label: "Players in game", kind: "cat" },
	{ key: "g.status", label: "Game status", kind: "cat" },
	{ key: "g.has_bots", label: "Game has bots", kind: "bool" },
	{ key: "g.packs", label: "Card packs", kind: "cat" },
	{ key: "g.has_expansion", label: "Game has expansions", kind: "bool" },
	{ key: "g.day", label: "Day", kind: "cat" },
	{ key: "g.week", label: "Week", kind: "cat" },
	{ key: "g.hour", label: "Hour of day (UTC)", kind: "cat" },
	{ key: "g.weekday", label: "Day of week", kind: "cat" },
];

export type ExploreSource = "events" | "games" | "players";
export type ExploreMetric = "count" | "games" | "avg" | "sum" | "min" | "max" | "pct_true";

export interface ExploreQuery {
	source: ExploreSource;
	eventType?: EventTypeName | "";
	groupBy: string;
	splitBy?: string;
	metric: ExploreMetric;
	metricField?: string;
	where?: { field: string; value: string }[];
}

export interface Filters {
	from?: string;
	to?: string;
	players?: string;
	status?: "completed" | "abandoned" | "all";
	bots?: "any" | "none" | "some";
	visibility?: "any" | "public" | "private";
	packs?: string;
}
