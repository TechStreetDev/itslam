"use client";

import { Pause } from "lucide-react";
import { entityPoints } from "@/lib/engine";
import { LobbyView, MAX_PLAYERS } from "@/lib/types";

// Shown instead of the game while Discord has the Activity in its small
// picture-in-picture window - the full board is unreadable at that size
export function ActivityPreview({ state, myId }: { state: LobbyView | null; myId: string }) {
	const game = state?.game;
	const nameOf = (id: string) => state?.players.find((p) => p.id === id)?.name ?? "Someone";

	let status = "Joining the flock…";
	let highlight = false;
	if (state && !game) status = `In the lobby · ${state.players.length}/${MAX_PLAYERS} players`;
	else if (game?.ended && game.results)
		status = game.results.winnerId === myId ? "You won!" : `${nameOf(game.results.winnerId)} won!`;
	else if (game?.phase === "tutorial") status = "Watching the tutorial";
	else if (game) {
		highlight = game.currentPlayerId === myId;
		status = highlight ? "It's your turn!" : `${nameOf(game.currentPlayerId)}'s turn`;
	}

	const scores = game
		? game.players
				.map((p) => ({
					id: p.id,
					name: p.name,
					pts: game.results?.scores[p.id] ?? p.field.reduce((sum, e) => sum + entityPoints(e), 0),
				}))
				.sort((a, b) => b.pts - a.pts)
		: [];

	return (
		<section className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-2 p-3 bg-[#a05578] text-[#fff0f5] text-center overflow-hidden">
			<div className="font-display font-extrabold text-sm opacity-80 tracking-wide">ITSLAM</div>
			<div
				className={[
					"font-display font-extrabold rounded-full px-4 py-1 max-w-full truncate",
					highlight ? "bg-[#fff0f5] text-[#a05578] text-lg" : "bg-black/15 text-base",
				].join(" ")}
			>
				{status}
			</div>
			
			<div className="flex items-center gap-1 text-[11px] font-bold opacity-70">
				<Pause size={12} strokeWidth={3} />
				Open the Activity to play
			</div>
		</section>
	);
}
