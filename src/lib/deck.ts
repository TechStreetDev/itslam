import {
	ActionType,
	Card,
	ChallengeType,
	Color,
	ModifierType,
	PackId,
} from "./types";

export const COLORS: Exclude<Color, "rainbow">[] = [
	"white",
	"orange",
	"magenta",
	"cyan",
	"yellow",
	"lime",
	"pink",
	"grey",
	"beige",
	"mint",
	"purple",
	"blue",
	"brown",
	"green",
	"red",
	"black",
];

export const COLOR_HEX: Record<Color, string> = {
	white: "#f5f3ee",
	orange: "#e8873a",
	magenta: "#d94fa0",
	cyan: "#3ec6d9",
	yellow: "#f0cf3a",
	lime: "#a8d94a",
	pink: "#f2a0c4",
	grey: "#9aa0a6",
	beige: "#dcc6a0",
	mint: "#7fd9b6",
	purple: "#9b6fd9",
	blue: "#4f7fd9",
	brown: "#8a5a3a",
	green: "#4fa85a",
	red: "#d94f4f",
	black: "#3a3a3a",
	rainbow: "rainbow",
};

export const CHALLENGE_TYPES = {
	LURE2: "lure2" as ChallengeType,
	REMOVE2: "remove2" as ChallengeType,
	HALVE2: "halve2" as ChallengeType,
	YOINK_HAND: "yoink_hand" as ChallengeType,
	RECOVER1: "recover1" as ChallengeType,
};

export const CHALLENGE_META: Record<
	ChallengeType,
	{name: string; color: string; desc: string}
> = {
	lure2: {
		name: "Lure 2 Sheep",
		color: "green",
		desc: "Lure 2 sheep of your choice from the opponent\u2019s field to yours (bypasses FrankenSheep protection).",
	},
	remove2: {
		name: "Remove 2 Sheep",
		color: "red",
		desc: "Send 2 sheep of your choice from the opponent\u2019s field to the discard pile (bypasses FrankenSheep protection).",
	},
	halve2: {
		name: "Halve 2 Sheep",
		color: "black",
		desc: "Split 2 sheep from the opponent\u2019s field: you take half of each to your hand, they keep the other half.",
	},
	yoink_hand: {
		name: "Yoink Entire Hand",
		color: "rainbow",
		desc: "Take your opponent\u2019s entire hand into yours.",
	},
	recover1: {
		name: "Recover 1 Sheep",
		color: "rainbow",
		desc: "Build a sheep out of cards from the discard pile and add it to your own field.",
	},
};

// Distributive Omit so each card variant keeps its own fields
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type CardSpec = DistributiveOmit<Card, "id">;

export interface CardPack {
	id: PackId;
	name: string;
	description: string;
	// Always included in every game and can't be toggled off
	alwaysOn?: boolean;
	// Only shown to, and can only be switched on by, playtesters and admins
	hidden?: boolean;
	cards: {card: CardSpec; count: number}[];
}

const sheepParts = (color: Color, rainbow = false, count = 1) => [
	{card: {category: "head", color, rainbow} as CardSpec, count},
	{card: {category: "butt", color, rainbow} as CardSpec, count},
];

const action = (action: ActionType, count: number) =>
	({card: {category: "action", action} as CardSpec, count});

const modifier = (modifier: ModifierType, count: number) =>
	({card: {category: "modifier", modifier} as CardSpec, count});

const challenge = (challengeType: ChallengeType, count = 1) =>
	({card: {category: "challenge", challengeType} as CardSpec, count});

// Card packs a lobby can include. To add a pack: add its id to PackId in
// types.ts, define it here, and add it to PACK_ORDER.
export const PACKS: Record<PackId, CardPack> = {
	base: {
		id: "base",
		name: "Base Game",
		description: "The original ITSLAM game.",
		alwaysOn: true,
		cards: [
			...COLORS.flatMap((color) => sheepParts(color)),
			...sheepParts("rainbow", true, 2),
			action("wheat", 3),
			action("wolf", 2),
			action("yoink", 2),
			action("reflip", 2),
			modifier("paint", 2),
			modifier("franken", 2),
			...Object.values(CHALLENGE_TYPES).map((type) => challenge(type)),
		],
	},
	expansion: {
		id: "expansion",
		name: "Expansion Pack",
		description: "Extra cards shuffled in alongside the base game.",
		hidden: true,
		cards: [],
	},
};

export const PACK_ORDER: PackId[] = ["base", "expansion"];

// Validates a requested pack list, always keeping the always-on packs
export function normalizePacks(packs: readonly string[] | undefined): PackId[] {
	const wanted = new Set(packs ?? []);
	return PACK_ORDER.filter((id) => PACKS[id].alwaysOn || wanted.has(id));
}

// Expansion packs - everything that isn't always on
export const EXPANSION_PACKS: PackId[] = PACK_ORDER.filter((id) => !PACKS[id].alwaysOn);

// "base,expansion" (as stored in the games table) or a pack list -> "Base Game + Expansion Pack"
export function packsLabel(packs: string | readonly string[] | null | undefined): string {
	const ids = typeof packs === "string" ? packs.split(",") : (packs ?? []);
	if (ids.length === 0) return PACKS.base.name;
	return ids.map((id) => PACKS[id as PackId]?.name ?? id).join(" + ");
}

export function packCardCount(id: PackId): number {
	return PACKS[id].cards.reduce((sum, c) => sum + c.count, 0);
}

let idCounter = 1;
function nextId(): string {
	return "c" + idCounter++;
}

export function buildDeck(packs: readonly PackId[] = ["base"]): Card[] {
	idCounter = 1;
	const cards: Card[] = [];

	for (const packId of normalizePacks(packs)) {
		for (const {card, count} of PACKS[packId].cards) {
			for (let i = 0; i < count; i++)
				cards.push({...card, id: nextId()} as Card);
		}
	}

	return cards;
}

export function shuffle<T>(arr: T[]): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	
	return a;
}
