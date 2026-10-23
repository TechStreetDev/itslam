export type Color =
	| "white"
	| "orange"
	| "magenta"
	| "cyan"
	| "yellow"
	| "lime"
	| "pink"
	| "grey"
	| "beige"
	| "mint"
	| "purple"
	| "blue"
	| "brown"
	| "green"
	| "red"
	| "black"
	| "rainbow";

export type ActionType = "wheat" | "wolf" | "yoink" | "reflip";
export type ModifierType = "paint" | "franken";
export type PackId = "base" | "expansion";
export type ChallengeType =
	"lure2" | "remove2" | "halve2" | "yoink_hand" | "recover1";

export interface HeadCard {
	id: string;
	category: "head";
	color: Color;
	rainbow: boolean;
}
export interface ButtCard {
	id: string;
	category: "butt";
	color: Color;
	rainbow: boolean;
}
export interface ActionCard {
	id: string;
	category: "action";
	action: ActionType;
}
export interface ModifierCard {
	id: string;
	category: "modifier";
	modifier: ModifierType;
}
export interface ChallengeCard {
	id: string;
	category: "challenge";
	challengeType: ChallengeType;
}

export type Card =
	HeadCard | ButtCard | ActionCard | ModifierCard | ChallengeCard;
export type PartCard = HeadCard | ButtCard;

export type SheepKind =
	| "basic"
	| "half_rainbow"
	| "full_rainbow"
	| "painted"
	| "franken_heads"
	| "franken_butts";

export interface SheepEntity {
	id: string;
	kind: SheepKind;
	head: PartCard | null;
	butt: PartCard | null;
	extra: PartCard | null;
	modifierCard: ModifierCard | null;
}

export interface Player {
	id: string;
	name: string;
	hand: Card[];
	field: SheepEntity[];
}

// tutorial (once, before anyone's first turn) -> draw -> play -> discard (only when holding more than 7) -> next turn
export type GamePhase = "tutorial" | "draw" | "play" | "discard" | "ended";

export interface PendingChallenge {
	card: ChallengeCard;
	challengerId: string;
	targetId: string;
	challengeType: ChallengeType;
	guess: "heads" | "butts" | null;
	stage: "awaiting_flip" | "awaiting_reflip" | "awaiting_selection";
	winnerId?: string;
	loserId?: string;
	flipResult?: "heads" | "butts";
	flipCount?: number;
	reflipDeadline?: number; // server timestamp when the Re-Flip window closes
}

export interface LogEntry {
	ts: number;
	text: string;
	// Turn the entry happened in (0 = game setup). Missing on logs from older saved games.
	turn?: number;
	playerId?: string;
}

// Structured, anonymous record of what happened in a game - used for analytics.
// actor/target are player ids in memory and are converted to seat numbers before
// being stored, so nothing identifying leaves the server.
export type GameEventType =
	| "draw"
	| "sheep_built"
	| "action"
	| "bodyswap"
	| "challenge_played"
	| "coin_flip"
	| "challenge_resolved"
	| "discard"
	| "turn_end"
	| "final_round"
	| "player_replaced"
	| "game_end";

export type GameEventData = Record<string, string | number | boolean | null>;

// Card kinds counted on discard events (rainbow is a sub-count of head + butt)
export const DISCARD_KINDS = [
	"head",
	"butt",
	"rainbow",
	"wheat",
	"wolf",
	"yoink",
	"reflip",
	"paint",
	"franken",
] as const;
export type DiscardKind = (typeof DISCARD_KINDS)[number];

export interface GameEvent {
	t: number; // ms since game start
	turn: number;
	type: GameEventType;
	actor?: string;
	target?: string;
	data?: GameEventData;
}

export interface GameResults {
	scores: Record<string, number>;
	winnerId: string;
	tied: string[];
	wasTiebreak: boolean;
	// Points lost per player for challenge cards still in hand (3 each).
	// Optional - games that ended before this was added don't have it
	challengePenalties?: Record<string, number>;
}

export interface GameState {
	players: Record<string, Player>;
	packs?: PackId[];
	deckSize?: number;
	order: string[];
	turnIndex: number;
	turnNumber?: number;
	deck: Card[];
	discard: Card[];
	phase: GamePhase;
	drawnThisTurn: boolean;
	challengeUsedThisTurn: boolean;
	deckJustEmptied: boolean;
	deckJustEmptiedHandled?: boolean;
	finalRoundActive: boolean;
	finalRoundQueue: string[];
	pendingChallenge: PendingChallenge | null;
	log: LogEntry[];
	started: boolean;
	ended: boolean;
	results: GameResults | null;
	// Analytics - missing on games saved before analytics existed
	startedAt?: number;
	events?: GameEvent[];
	recorded?: boolean;
	// Tutorial video progress per player (0-1, 1 = ready). The game stays in the
	// "tutorial" phase until all are 1. Missing on games saved before this existed.
	tutorial?: Record<string, number>;
}

export interface LobbyPlayerPublic {
	id: string;
	name: string;
	connected: boolean;
	isBot?: boolean;
}

export interface PlayerView {
	id: string;
	name: string;
	field: SheepEntity[];
	handCount: number;
	hand?: Card[];
}

export interface PendingChallengeView {
	challengerId: string;
	targetId: string;
	challengeType: ChallengeType;
	guess: "heads" | "butts" | null;
	stage: "awaiting_flip" | "awaiting_reflip" | "awaiting_selection";
	winnerId?: string;
	loserId?: string;
	flipResult?: "heads" | "butts";
	flipCount?: number;
	// Time left in the Re-Flip window when this view was sent (avoids client clock skew)
	reflipMsLeft?: number;
}

export interface GameView {
	order: string[];
	turnIndex: number;
	currentPlayerId: string;
	phase: GamePhase;
	deckCount: number;
	discard: Card[];
	discardCount: number;
	players: PlayerView[];
	pendingChallenge: PendingChallengeView | null;
	log: LogEntry[];
	finalRoundActive: boolean;
	finalRoundRemaining: number;
	ended: boolean;
	results: GameResults | null;
	challengeUsedThisTurn: boolean;
	// Per-player tutorial progress (0-1) during the tutorial phase; null once play has begun
	tutorialProgress: Record<string, number> | null;
}

export const MAX_PLAYERS = 4;

export interface LobbyView {
	code: string;
	hostId: string;
	players: LobbyPlayerPublic[];
	game: GameView | null;
	isPublic: boolean;
	// Lobby tied to a Discord voice channel Activity - joined automatically, not by code
	isActivity?: boolean;
	packs: PackId[];
}

export interface PublicLobbyEntry {
	code: string;
	hostName: string;
	playerCount: number;
	packs: PackId[];
}

export interface LobbiesPage {
	entries: PublicLobbyEntry[];
	total: number;
	page: number;
	pageSize: number;
}

export interface CreateLobbyPayload {
	playerId: string;
	name: string;
}
export interface JoinLobbyPayload {
	playerId: string;
	name: string;
	code: string;
}
export interface RejoinPayload {
	playerId: string;
	code: string;
}
export interface PlaySheepPayload {
	headCardId?: string;
	buttCardId?: string;
	extraCardId?: string;
	modifierCardId?: string;
}
export interface PlayActionPayload {
	cardId: string;
	targetPlayerId: string;
	targetSheepId?: string;
}
export interface BodyswapPayload {
	handCardId: string;
	targetPlayerId: string;
	targetSheepId: string;
	removeCardId: string;
}
export interface PlayChallengePayload {
	cardId: string;
	targetPlayerId: string;
	guess: "heads" | "butts";
}
export interface ChallengeGuessPayload {
	guess: "heads" | "butts";
}
export interface EndTurnPayload {
	discardCardIds: string[];
}
export interface ResolveChallengeEffectPayload {
	sheepIds?: string[];
	halves?: { sheepId: string; keepCardId: string }[];
	headCardId?: string;
	buttCardId?: string;
	extraCardId?: string;
	modifierCardId?: string;
}
