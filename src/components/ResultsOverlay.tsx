"use client";

import { GameResults, GameView } from "@/lib/types";

export function ResultsOverlay({
	game,
	results,
	onBack,
}: {
	game: GameView;
	results: GameResults;
	onBack: () => void;
}) {
	const ranked = [...game.order].sort(
		(a, b) => results.scores[b] - results.scores[a],
	);
	// Rendered inside a Modal in GameScreen, which provides the backdrop and panel
	return (
		<>
			<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-3">
				&#127942; Final Scores
			</h2>
			{ranked.map((pid) => {
				const p = game.players.find((x) => x.id === pid)!;
				const isWinner = pid === results.winnerId;
				const penalty = results.challengePenalties?.[pid] ?? 0;
				const heldCards = penalty / 3;
				return (
					<div
						key={pid}
						className="py-2 px-1 border-b border-dashed border-[#f5d0e8]"
					>
						<div
							className={`flex justify-between font-bold ${isWinner ? "text-[#9e3878] text-lg" : ""}`}
						>
							<span>
								{p.name}
								{isWinner ? " \ud83d\udc51" : ""}
							</span>
							<span>{results.scores[pid]} pts</span>
						</div>
						{penalty > 0 && (
							<div className="flex justify-between gap-3 mt-1 text-xs font-bold text-[#c03060] text-left">
								<span>
									Held {heldCards} unused Challenge card
									{heldCards === 1 ? "" : "s"}
								</span>
								<span className="whitespace-nowrap tabular-nums">
									Lost {penalty} points
								</span>
							</div>
						)}
					</div>
				);
			})}
			{ranked.some((pid) => (results.challengePenalties?.[pid] ?? 0) > 0) && (
				<p className="text-[#8a5a70] text-xs font-semibold mt-3 mb-0">
					Every Challenge card still in hand at the end costs 3 points.
				</p>
			)}
			{results.wasTiebreak && (
				<p className="text-[#8a5a70] font-semibold mt-3">
					It was a tie - the winner was decided by a coin flip!
				</p>
			)}
			<button
				onClick={onBack}
				className="mt-5 font-extrabold text-[15px] px-5 py-3 rounded-full shadow bg-[#c05090] text-white hover:brightness-105 active:translate-y-px transition"
			>
				Back to menu
			</button>
			<p className="text-[#a06080] text-[11px] font-semibold mt-4">
				Enjoyed the game? Share feedback on{" "}
				<a
					href="https://discord.gg/SwtaMCV4BE"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-[#c05090] transition"
				>
					Discord
				</a>
			</p>
		</>
	);
}
