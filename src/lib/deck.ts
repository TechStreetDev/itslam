import { Card, ChallengeType, Color } from "./types";

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
	{ name: string; color: string; desc: string }
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

const COUNTS = {
	wheat: 3,
	wolf: 2,
	yoink: 2,
	reflip: 2,
	paint: 2,
	franken: 2,
};

let idCounter = 1;
function nextId(): string {
	return "c" + idCounter++;
}

export function buildDeck(): Card[] {
	idCounter = 1;
	const cards: Card[] = [];

	for (const color of COLORS) {
		cards.push({ id: nextId(), category: "head", color, rainbow: false });
		cards.push({ id: nextId(), category: "butt", color, rainbow: false });
	}

	for (let i = 0; i < 2; i++) {
		cards.push({
			id: nextId(),
			category: "head",
			color: "rainbow",
			rainbow: true,
		});
		
		cards.push({
			id: nextId(),
			category: "butt",
			color: "rainbow",
			rainbow: true,
		});
	}

	for (let i = 0; i < COUNTS.wheat; i++)
		cards.push({ id: nextId(), category: "action", action: "wheat" });
	for (let i = 0; i < COUNTS.wolf; i++)
		cards.push({ id: nextId(), category: "action", action: "wolf" });
	for (let i = 0; i < COUNTS.yoink; i++)
		cards.push({ id: nextId(), category: "action", action: "yoink" });
	for (let i = 0; i < COUNTS.reflip; i++)
		cards.push({ id: nextId(), category: "action", action: "reflip" });

	for (let i = 0; i < COUNTS.paint; i++)
		cards.push({ id: nextId(), category: "modifier", modifier: "paint" });
	for (let i = 0; i < COUNTS.franken; i++)
		cards.push({ id: nextId(), category: "modifier", modifier: "franken" });

	for (const type of Object.values(CHALLENGE_TYPES)) {
		cards.push({
			id: nextId(),
			category: "challenge",
			challengeType: type,
		});
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
