"use client";

import { Fragment, useMemo } from "react";
import { CHALLENGE_META } from "@/lib/cardMeta";

type Kind = "big" | "sheep" | "build" | "challenge" | "action" | "attack" | "draw" | "coin" | "win" | "points" | "quote";

// Subtle tints close to the log's own text colour - a hint of what happened, not a highlight
const KIND_CLASS: Record<Kind, string> = {
	big: "text-[#5a3048]",
	sheep: "text-[#5fa7b0]",
	build: "text-[#5fa7b0]",
	challenge: "text-[#857bc9]",
	action: "text-[#c98462]",
	attack: "text-[#c86f7f]",
	draw: "text-[#6f95c4]",
	coin: "text-[#b38f55]",
	win: "text-[#5a3048]",
	points: "text-[#5a3048]",
	quote: "italic",
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Phrases the engine's log messages use (see pushLog calls in engine.ts). Earlier patterns win
// when two could match at the same spot.
const PATTERNS: { kind: Kind; source: string }[] = [
	{ kind: "big", source: String.raw`Game over!|Final Round|The Draw Pile is empty!|The flock has gathered\.` },
	{
		kind: "sheep",
		source: String.raw`(?:Double Rainbow|Half-Rainbow [A-Z]\w*|Painted [A-Z]\w*/[A-Z]\w*|Double-(?:Headed|Butted) [A-Z]\w*/[A-Z]\w*|[A-Z]\w*) (?:FrankenSheep|Sheep)`,
	},
	{
		kind: "challenge",
		source: [...new Set(Object.values(CHALLENGE_META).map((c) => c.name))].map(escape).join("|") + "|Re-Flip",
	},
	{ kind: "build", source: String.raw`\b(?:built|painted|added|recovered)\b` },
	{ kind: "action", source: String.raw`\b(?:Wheat|Wolf|[Yy]oinked|Body ?Swapped|lured|halved)\b` },
	{ kind: "attack", source: String.raw`\b(?:sent|packing|to the discard pile|against|triggers)\b` },
	{ kind: "draw", source: String.raw`\b(?:drew a card|skipped drawing|discarded|skipped recovering)\b` },
	{ kind: "coin", source: String.raw`\b(?:heads|butts|Heads|Butts|guesses|guessing)\b|Coin flip|New flip` },
	{ kind: "win", source: String.raw`\b(?:wins|won|goes first)\b` },
	{ kind: "points", source: String.raw`\b\d+ (?:point\(s\)|card\(s\)|cards?\b)` },
	{ kind: "quote", source: String.raw`"[^"]*"` },
];

// Colours what happened in a log line, by kind
export function LogText({ text, players }: { text: string; players: { name: string }[] }) {
	const regex = useMemo(() => {
		// Longest names first, so "Sam 2" wins over "Sam"
		const names = players
			.map((p) => p.name)
			.filter(Boolean)
			.sort((a, b) => b.length - a.length);
		const groups = [
			// Whole names only - "Sam" shouldn't match inside "Sample"
			names.length ? `(?<![A-Za-z0-9])(?:${names.map(escape).join("|")})(?![A-Za-z0-9])` : "(?!)",
			...PATTERNS.map((p) => p.source),
		];
		return new RegExp(groups.map((g) => `(${g})`).join("|"), "g");
	}, [players]);

	const parts: React.ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(regex)) {
		const i = m.index!;
		if (i > last) parts.push(text.slice(last, i));
		const group = m.slice(1).findIndex((g) => g !== undefined);
		// Player names in dark ink, so who did what stands out - matching them first also stops
		// a name like "Wolf" being coloured as a card
		if (group === 0)
			parts.push(
				<span key={i} className="text-[#3d1a2c]">
					{m[0]}
				</span>,
			);
		else parts.push(<span key={i} className={KIND_CLASS[PATTERNS[group - 1].kind]}>{m[0]}</span>);
		last = i + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
