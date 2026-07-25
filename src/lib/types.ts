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

export type GamePhase = "draw" | "play" | "ended";

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
}

export interface LogEntry {
	ts: number;
	text: string;
}

export interface GameResults {
	scores: Record<string, number>;
	winnerId: string;
	tied: string[];
	wasTiebreak: boolean;
}

export interface GameState {
	players: Record<string, Player>;
	order: string[];
	turnIndex: number;
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
}

export interface LobbyView {
	code: string;
	hostId: string;
	players: LobbyPlayerPublic[];
	game: GameView | null;
	isPublic: boolean;
}

export interface PublicLobbyEntry {
	code: string;
	hostName: string;
	playerCount: number;
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
