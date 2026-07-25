import {Card, Color} from "./types";
import {COLOR_HEX, CHALLENGE_META} from "./deck";
export {COLOR_HEX, CHALLENGE_META};

export function capitalize(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export interface CardMeta {
	icon: string;
	label: string;
	sub?: string;
	color: Color | null;
}

const ACTION_META: Record<string, {icon: string, label: string, sub: string}> = {
	wheat: {icon: "🌾", label: "Wheat", sub: "Lure a sheep"},
	wolf: {icon: "🐺", label: "Wolf", sub: "Remove a sheep"},
	yoink: {icon: "✋", label: "Yoink!", sub: "Take 2 cards"},
	reflip: {icon: "🔄", label: "Re-Flip", sub: "Flip again"},
};

const MODIFIER_META: Record<string, {icon: string, label: string, sub: string}> = {
	paint: {icon: "🎨", label: "Paint", sub: "Any head + any butt"},
	franken:{icon: "🧵", label: "Franken", sub: "2 heads or 2 butts"},
};

export function cardMeta(card: Card): CardMeta {
	if (card.category === "head") {
		return {
			icon: "🙂",
			label: (card.rainbow ? "Rainbow" : capitalize(card.color)) + " Head",
			color: card.rainbow ? "rainbow" : card.color,
		};
	}

	if (card.category === "butt") {
		return {
			icon: "🍑",
			label: (card.rainbow ? "Rainbow" : capitalize(card.color)) + " Butt",
			color: card.rainbow ? "rainbow" : card.color,
		};
	}

	if (card.category === "action") {
		return {...ACTION_META[card.action], color: null};
	}

	if (card.category === "modifier") {
		return {...MODIFIER_META[card.modifier], color: null};
	}

	return {
		icon: "🪙",
		label: CHALLENGE_META[card.challengeType].name,
		sub: "Coin flip!",
		color: null,
	};
}
