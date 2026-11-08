"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/discordActivity";
import { packsLabel } from "@/lib/deck";
import { Modal } from "@/components/Modal";

type Row = Record<string, any>;

interface Summary {
	games: number;
	wins: number;
	bestScore: number | null;
}

interface History {
	total: number;
	page: number;
	pageSize: number;
	rows: Row[];
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
// Placements only go up to 4th
const ordinal = (n: number) => `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n] ?? "th"}`;

// Gold, silver and bronze for the podium - everything else (and unfinished games) stays muted
const RANK_STYLES: Record<number, string> = {
	1: "bg-[#f2c94c] text-[#5a4300] border-[#d9a91f]",
	2: "bg-[#dfe3e8] text-[#3f4650] border-[#b8bfc8]",
	3: "bg-[#e3a46f] text-[#5a2e0c] border-[#c27c43]",
};
const rankStyle = (place: number | null) =>
	(place && RANK_STYLES[place]) || "bg-[#f7eef3] text-[#8a5a70] border-[#e8d3df]";

// Final standings, winner first. Unfinished games have no placements, so they stay in seat order.
const standings = (players: Row[]) =>
	[...players].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || num(a.seat) - num(b.seat));

function fmtPlayTime(ms: number): string {
	const m = Math.round(ms / 60000);
	if (m < 60) return `${m}m`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const fmtDate = (s: string) =>
	new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

async function get<T>(path: string): Promise<T> {
	const res = await fetch(path, { headers: authHeaders() });
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(json.error || "Couldn't load your stats.");
	return json as T;
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="bg-white rounded-xl border-2 border-[#f5d0e8] px-3 py-2.5">
			<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">{label}</p>
			<p className="font-display text-2xl font-extrabold text-[#7a3a58] leading-tight tabular-nums">{value}</p>
		</div>
	);
}

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [summary, setSummary] = useState<Summary | null>(null);
	const [history, setHistory] = useState<History | null>(null);
	const [page, setPage] = useState(0);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return;
		setError("");
		get<Summary>("/api/me/stats").then(setSummary, (e) => setError(e.message));
	}, [open]);

	useEffect(() => {
		if (!open) return;
		get<History>(`/api/me/games?page=${page}`).then(setHistory, (e) => setError(e.message));
	}, [open, page]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const winRate = summary && summary.games > 0 ? Math.round((summary.wins / summary.games) * 100) : null;
	const totalPages = history ? Math.max(1, Math.ceil(history.total / history.pageSize)) : 1;

	return (
		<Modal
			open={open}
			onBackdropClick={onClose}
			backdropClassName="bg-[rgba(74,50,32,0.35)]"
			className="z-[70] p-4 sm:p-6"
			labelledBy="stats-title"
			panelClassName="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-5 sm:p-7 max-w-[560px] w-full text-left border-[3px] border-white max-h-[90vh] overflow-y-auto"
		>
			<div className="flex items-center justify-between mb-4">
				<h2 id="stats-title" className="font-display text-2xl text-[#7a3a58] tracking-wide font-extrabold">
					My stats
				</h2>
				<button
					onClick={onClose}
					aria-label="Close stats"
					className="text-[#c05090] font-extrabold text-xl w-8 h-8 rounded-full hover:bg-[#ffe0f0] transition leading-none"
				>
					×
				</button>
			</div>

			{error ? (
				<p className="text-[#c03060] font-bold text-sm py-4 text-center">{error}</p>
			) : !summary || !history ? (
				<div className="flex justify-center py-8">
					<div className="w-8 h-8 rounded-full border-4 border-[#c05090] border-t-transparent animate-spin" />
				</div>
			) : history.total === 0 ? (
				<p className="text-[#8a5a70] font-semibold text-sm py-6 text-center leading-relaxed">
					No games yet! Games you play while signed in with Discord will show up here.
				</p>
			) : (
				<>
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
						<StatTile label="Games played" value={summary.games} />
						<StatTile label="Games won" value={summary.wins} />
						<StatTile label="Win rate" value={winRate === null ? "-" : `${winRate}%`} />
						<StatTile label="Best score" value={summary.bestScore ?? "-"} />
					</div>

					<h3 className="font-extrabold text-[14px] text-[#7a3a58] mt-5 mb-2">Recent games</h3>
					<ul className="flex flex-col gap-2">
						{history.rows.map((g) => {
							const finished = g.status === "completed";
							const place = finished ? num(g.placement) : null;
							return (
								<li key={g.id} className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 flex gap-3">
									<div
										className={`shrink-0 w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center ${rankStyle(place)}`}
										title={finished ? `${ordinal(place!)} of ${g.player_count}` : "Unfinished"}
									>
										<span className="font-display text-xl font-extrabold leading-none">
											{finished ? ordinal(place!) : "–"}
										</span>
										<span className="text-[10px] font-extrabold leading-tight mt-0.5">
											{finished ? `of ${g.player_count}` : "unfinished"}
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline justify-between gap-2">
											<p className="font-extrabold text-[13px] text-[#3d1a2c]">
												{!finished ? "Unfinished game" : place === 1 ? "You won!" : `You came ${ordinal(place!)}`}
												{g.was_replaced ? <span className="text-[#9a7888] font-bold"> · left early</span> : null}
											</p>
											<p className="text-[11px] font-bold text-[#9a7888] whitespace-nowrap">{fmtDate(g.started_at)}</p>
										</div>
										<ol className="mt-1 flex flex-col gap-0.5">
											{standings(g.players as Row[]).map((p) => (
												<li
													key={p.seat}
													className={`flex items-center gap-2 text-[12px] rounded-md px-1.5 py-0.5 ${
														p.you ? "bg-[#ffe8f3] font-extrabold text-[#c05090]" : "font-semibold text-[#5a3048]"
													}`}
												>
													<span
														className={`w-7 shrink-0 text-center text-[10px] font-extrabold rounded border ${rankStyle(finished ? p.placement : null)}`}
													>
														{finished && p.placement ? ordinal(p.placement) : "-"}
													</span>
													<span className="flex-1 truncate">
														{p.you ? "You" : p.is_bot ? "Bot" : (p.username ?? "Guest")}
													</span>
													<span className="tabular-nums">{p.score ?? ""}</span>
												</li>
											))}
										</ol>
										<p className="text-[11px] font-semibold text-[#9a7888] mt-1">
											{fmtPlayTime(num(g.duration_ms))} · {packsLabel(g.packs)}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
					{history.total > history.pageSize && (
						<div className="flex items-center justify-between mt-3">
							<button
								onClick={() => setPage(page - 1)}
								disabled={page === 0}
								className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
							>
								&larr; Newer
							</button>
							<span className="text-[11px] font-bold text-[#8a5a70]">
								{page + 1} / {totalPages}
							</span>
							<button
								onClick={() => setPage(page + 1)}
								disabled={page >= totalPages - 1}
								className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
							>
								Older &rarr;
							</button>
						</div>
					)}
				</>
			)}
		</Modal>
	);
}
