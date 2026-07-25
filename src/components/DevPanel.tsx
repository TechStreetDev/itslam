"use client";

import { useState } from "react";
import { COLORS } from "@/lib/deck";

type Tab = "head" | "butt" | "action" | "modifier" | "challenge";

const ALL_COLORS = [...COLORS, "rainbow" as const];

const ACTIONS = ["wheat", "wolf", "yoink", "reflip"] as const;
const MODIFIERS = ["paint", "franken"] as const;
const CHALLENGES = [
	"lure2",
	"remove2",
	"halve2",
	"yoink_hand",
	"recover1",
] as const;

export function DevPanel({
	emit,
}: {
	emit: (event: string, payload: any) => void;
}) {
	const [tab, setTab] = useState<Tab>("head");

	function give(spec: any) {
		emit("dev_give_card", spec);
	}

	const tabBtn = (t: Tab, label: string) => (
		<button
			key={t}
			onClick={() => setTab(t)}
			className={`px-2 py-0.5 rounded text-xs font-bold ${tab === t ? "bg-[#7a3a58] text-white" : "bg-white/40 text-[#7a3a58]"}`}
		>
			{label}
		</button>
	);

	return (
		<div className="fixed bottom-20 right-3 z-[200] bg-[#fff0f5] border-2 border-[#7a3a58] rounded-xl p-3 shadow-xl w-[260px] text-left">
			<div className="text-[10px] font-extrabold text-[#7a3a58] mb-2 uppercase tracking-widest">
				Dev - Give Card
			</div>
			<div className="flex gap-1 mb-2.5 flex-wrap">
				{tabBtn("head", "Head")}
				{tabBtn("butt", "Butt")}
				{tabBtn("action", "Action")}
				{tabBtn("modifier", "Modifier")}
				{tabBtn("challenge", "Challenge")}
			</div>

			{(tab === "head" || tab === "butt") && (
				<div className="flex flex-wrap gap-1">
					{ALL_COLORS.map((color) => (
						<button
							key={color}
							title={color}
							onClick={() => give({ category: tab, color })}
							className="w-6 h-6 rounded border border-[#7a3a58]/30 text-[9px] font-bold flex items-center justify-center overflow-hidden"
							style={{
								background:
									color === "rainbow"
										? "linear-gradient(135deg,red,orange,yellow,green,blue,violet)"
										: getColorHex(color),
							}}
						/>
					))}
				</div>
			)}

			{tab === "action" && (
				<div className="flex flex-col gap-1">
					{ACTIONS.map((a) => (
						<button
							key={a}
							onClick={() =>
								give({ category: "action", action: a })
							}
							className="text-xs font-bold px-3 py-1.5 rounded bg-[#e0609a] text-[#4a1a38] text-left capitalize"
						>
							{a}
						</button>
					))}
				</div>
			)}

			{tab === "modifier" && (
				<div className="flex flex-col gap-1">
					{MODIFIERS.map((m) => (
						<button
							key={m}
							onClick={() =>
								give({ category: "modifier", modifier: m })
							}
							className="text-xs font-bold px-3 py-1.5 rounded bg-[#e0609a] text-[#4a1a38] text-left capitalize"
						>
							{m}
						</button>
					))}
				</div>
			)}

			{tab === "challenge" && (
				<div className="flex flex-col gap-1">
					{CHALLENGES.map((c) => (
						<button
							key={c}
							onClick={() =>
								give({
									category: "challenge",
									challengeType: c,
								})
							}
							className="text-xs font-bold px-3 py-1.5 rounded bg-[#c05090] text-white text-left"
						>
							{c}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function getColorHex(color: string): string {
	const map: Record<string, string> = {
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
	};
	
	return map[color] ?? "#ccc";
}
