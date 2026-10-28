"use client";

import { useMemo, useState } from "react";
import type { Filters } from "@/lib/analyticsSchema";
import { packsLabel } from "@/lib/deck";
import { ChartCard, DataTable, LineChart, SERIES } from "./Charts";
import {
	ErrorNote,
	InfoTip,
	Loading,
	Select,
	Stat,
	StatGrid,
	api,
	dec,
	filtersToQuery,
	fmtDuration,
	ghostButtonClass,
	n,
	prettyKey,
	useApi,
} from "./Shared";

type Row = Record<string, any>;

const SORTS = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "longest", label: "Longest" },
	{ value: "shortest", label: "Shortest" },
	{ value: "most_turns", label: "Most turns" },
	{ value: "highest_score", label: "Highest score" },
] as const;

const sourceLabel = (s: string | null) => (s === "discord" ? "Discord" : s === "website" ? "Website" : "Unknown");
const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function GamesTab({ filters, canManage }: { filters: Filters; canManage: boolean }) {
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("newest");
	const [selected, setSelected] = useState<number | null>(null);
	const pageSize = 25;
	const list = useApi<{ total: number; rows: Row[] }>(
		`/api/admin/games?${filtersToQuery(filters, { page, pageSize, sort })}`,
	);

	if (selected !== null)
		return (
			<GameDetail
				id={selected}
				canDelete={canManage}
				onBack={() => setSelected(null)}
				onDeleted={() => {
					setSelected(null);
					list.reload();
				}}
			/>
		);

	const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;
	return (
		<>
			<div className="flex items-end justify-between gap-2 mb-2">
				<p className="text-[13px] font-semibold text-[#8a5a70]">
					{list.data ? `${list.data.total.toLocaleString()} games` : ""}
				</p>
				<Select label="Sort" value={sort} onChange={(v) => (setSort(v), setPage(0))} options={[...SORTS]} />
			</div>
			{list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
			{!list.data ? (
				<Loading />
			) : list.data.rows.length === 0 ? (
				<p className="text-[13px] font-semibold text-[#8a5a70] py-6">No games match these filters.</p>
			) : (
				<div className="overflow-x-auto bg-white rounded-xl border-2 border-[#f5d0e8]">
					<table className="w-full text-[13px] text-left">
						<thead className="text-[11px] uppercase tracking-wide text-[#8a5a70]">
							<tr>
								{["#", "Started", "Status", "Source", "Players", "Packs", "Duration", "Turns", "Winner", "Score", "Challenges"].map((h) => (
									<th key={h} className="px-3 py-2 font-extrabold whitespace-nowrap">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="text-[#3d1a2c] font-semibold">
							{list.data.rows.map((g) => (
								<tr
									key={g.id}
									onClick={() => setSelected(g.id)}
									className="border-t border-[#f5d0e8] cursor-pointer hover:bg-[#fff6fa]"
								>
									<td className="px-3 py-2 text-[#8a5a70]">{g.id}</td>
									<td className="px-3 py-2 whitespace-nowrap">{fmtDate(g.started_at)}</td>
									<td className="px-3 py-2 capitalize">{g.status}</td>
									<td className="px-3 py-2">{sourceLabel(g.source)}</td>
									<td className="px-3 py-2 whitespace-nowrap">
										{g.player_count}
										{n(g.bot_count) > 0 && <span className="text-[#9a7888]"> ({g.bot_count} bot)</span>}
									</td>
									<td className="px-3 py-2 whitespace-nowrap">{packsLabel(g.packs)}</td>
									<td className="px-3 py-2 whitespace-nowrap">{fmtDuration(n(g.duration_ms))}</td>
									<td className="px-3 py-2 tabular-nums">{g.turns}</td>
									<td className="px-3 py-2 whitespace-nowrap">
										{g.winner_seat === null ? "-" : `Seat ${n(g.winner_seat) + 1}${g.winner_is_bot ? " (bot)" : ""}`}
										{g.was_tiebreak ? " · tiebreak" : ""}
									</td>
									<td className="px-3 py-2 tabular-nums">{g.winning_score ?? "-"}</td>
									<td className="px-3 py-2 tabular-nums">{g.challenges_played}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{list.data && list.data.total > pageSize && (
				<div className="flex items-center justify-between mt-3">
					<button className={ghostButtonClass} disabled={page === 0} onClick={() => setPage(page - 1)}>
						&larr; Prev
					</button>
					<span className="text-[12px] font-bold text-[#8a5a70]">
						Page {page + 1} / {totalPages}
					</span>
					<button className={ghostButtonClass} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
						Next &rarr;
					</button>
				</div>
			)}
		</>
	);
}

function describeEvent(e: Row): string {
	const d = e.data ?? {};
	const who = e.actor_seat === null ? "" : `Seat ${n(e.actor_seat) + 1}`;
	const target = e.target_seat === null ? "" : `Seat ${n(e.target_seat) + 1}`;
	switch (e.type) {
		case "draw":
			return `${who} drew ${d.cards} (deck ${d.deckLeft})`;
		case "sheep_built":
			return `${who} ${d.source === "discard" ? "recovered" : "built"} ${prettyKey(d.kind)} (${d.points} pt)`;
		case "action":
			return d.action === "yoink"
				? `${who} Yoinked ${d.cards} card(s) from ${target}`
				: `${who} played ${prettyKey(d.action)} on ${target}'s ${prettyKey(d.kind)}`;
		case "bodyswap":
			return `${who} BodySwapped ${target}'s ${prettyKey(d.fromKind)} into ${prettyKey(d.toKind)}`;
		case "challenge_played":
			return `${who} challenged ${target} with ${prettyKey(d.challenge)}, guessing ${d.guess}`;
		case "coin_flip":
			return `${d.reflip ? `Re-Flip by ${d.reflipBy}: ` : "Coin flip: "}${d.flip} - ${d.challengerWon ? "challenger" : "defender"} wins`;
		case "challenge_resolved":
			return `${who} won ${prettyKey(d.challenge)} vs ${target} (${d.count} affected, ${d.points} pts)`;
		case "discard":
			return `${who} discarded ${d.count}`;
		case "turn_end":
			return `${who} ended turn - ${d.fieldSize} sheep, ${d.fieldPoints} pts, ${d.handSize} in hand`;
		case "final_round":
			return "Deck empty - final round begins";
		case "player_replaced":
			return `${who} left and was replaced by a bot`;
		case "game_end":
			return `${who} wins with ${d.winningScore}${d.wasTiebreak ? " (tiebreak)" : ""}`;
	}
	return e.type;
}

function GameDetail({
	id,
	canDelete,
	onBack,
	onDeleted,
}: {
	id: number;
	canDelete: boolean;
	onBack: () => void;
	onDeleted: () => void;
}) {
	const state = useApi<{ game: Row; players: Row[]; events: Row[] }>(`/api/admin/games/${id}`);
	const [typeFilter, setTypeFilter] = useState("all");
	const [deleting, setDeleting] = useState(false);

	const progression = useMemo(() => {
		if (!state.data) return [];
		const { players, events } = state.data;
		return players.map((p, i) => ({
			label: `Seat ${n(p.seat) + 1}`,
			color: SERIES[i],
			points: [
				{ x: 0, y: 0 },
				...events
					.filter((e) => e.type === "turn_end" && e.actor_seat === p.seat)
					.map((e) => ({ x: n(e.turn), y: n(e.data?.fieldPoints) })),
			],
		}));
	}, [state.data]);

	if (state.error) return <ErrorNote error={state.error} onRetry={state.reload} />;
	if (!state.data) return <Loading />;
	const { game: g, players, events } = state.data;
	const types = ["all", ...new Set(events.map((e) => e.type))];
	const shown = typeFilter === "all" ? events : events.filter((e) => e.type === typeFilter);

	async function remove() {
		if (!confirm(`Delete game #${id} and all its events? This can't be undone.`)) return;
		setDeleting(true);
		try {
			await api(`/api/admin/games/${id}`, { method: "DELETE" });
			onDeleted();
		} catch (e) {
			alert((e as Error).message);
			setDeleting(false);
		}
	}

	return (
		<>
			<div className="flex items-center justify-between gap-2 mb-3">
				<button className={ghostButtonClass} onClick={onBack}>
					&larr; All games
				</button>
				{canDelete && (
					<button className={ghostButtonClass} onClick={remove} disabled={deleting}>
						Delete game
					</button>
				)}
			</div>
			<h2 className="font-extrabold text-xl text-[#7a3a58]">
				Game #{g.id} <span className="text-[13px] text-[#8a5a70] capitalize">· {g.status}</span>
			</h2>
			<p className="text-[12px] text-[#8a5a70] font-semibold mb-3">
				{fmtDate(g.started_at)} → {fmtDate(g.ended_at)} · {sourceLabel(g.source)} · {g.is_public ? "Public" : "Private"} lobby · {packsLabel(g.packs)}
				{g.deck_size !== null && ` (${g.deck_size} cards)`}
			</p>
			<StatGrid>
				<Stat label="Duration" value={fmtDuration(n(g.duration_ms))} info="Real time from the game starting (including the tutorial) to it ending." />
				<Stat label="Turns" value={g.turns} info="Turns taken in this game, counting every player's turn." />
				<Stat label="Winner" value={g.winner_seat === null ? "-" : `Seat ${n(g.winner_seat) + 1}`} hint={g.was_tiebreak ? "won a tiebreak" : undefined} info="Seat that won. Seat 1 took the first turn. Blank if the game was abandoned." />
				<Stat label="Winning score" value={g.winning_score ?? "-"} info="The winner's final score, after challenge-card penalties." />
				<Stat label="Sheep built" value={g.sheep_built} info="Sheep added to any field during this game, from hand or recovered from the discard pile." />
				<Stat label="Actions / BodySwaps" value={`${g.actions_played} / ${g.bodyswaps}`} info="Action cards played (Wheat, Wolf, Yoink) / BodySwaps made, across all players." />
				<Stat label="Challenges / flips" value={`${g.challenges_played} / ${g.coin_flips}`} hint={`${g.reflips} re-flips`} info="Challenge cards played / total coin flips, including Re-Flips." />
				<Stat label="Deck / discard at end" value={`${g.deck_left} / ${g.discard_size}`} info="Cards left in the draw pile / cards in the discard pile when the game ended." />
			</StatGrid>

			<div className="mt-3">
				<ChartCard title="Field points over the game" subtitle="At the end of each player's turn" info="Each player's field points, sampled at the end of each of their turns - shows how the lead changed hands.">
					<LineChart series={progression} xLabel="Turn" />
				</ChartCard>
			</div>

			<div className="mt-3">
				<ChartCard title="Players" info="Per-seat breakdown for this game: final standing, points, end-of-game field and hand, and what each player did.">
					<DataTable
						columns={["Seat", "Type", "Place", "Score", "Field pts", "Penalty", "Sheep", "Hand", "Basic", "½ rainbow", "Rainbow", "Painted", "2-head", "2-butt", "Turns", "Built", "Actions", "Challenges", "Won", "Targeted"]}
						rows={players.map((p) => [
							n(p.seat) + 1,
							p.is_bot ? "Bot" : p.was_replaced ? "Human → bot" : "Human",
							p.placement ?? "-",
							p.score ?? "-",
							p.field_points,
							p.challenge_penalty,
							p.sheep_count,
							p.hand_size,
							p.basic,
							p.half_rainbow,
							p.full_rainbow,
							p.painted,
							p.franken_heads,
							p.franken_butts,
							p.turns_taken,
							p.sheep_built,
							p.actions_played,
							p.challenges_played,
							p.challenges_won,
							p.times_targeted,
						])}
					/>
				</ChartCard>
			</div>

			<div className="mt-3">
				<section className="bg-white rounded-xl border-2 border-[#f5d0e8] p-4">
					<div className="flex items-end justify-between gap-2 mb-2">
						<div>
							<div className="flex items-center gap-1.5">
								<h3 className="font-extrabold text-[14px] text-[#3d1a2c]">Event timeline</h3>
								<InfoTip text="Every recorded event in this game in order - draws, sheep built, actions, challenges, coin flips, discards and turn ends. Players are shown by seat only." />
							</div>
							<p className="text-[12px] text-[#8a5a70] font-semibold">
								{shown.length} of {events.length} events
							</p>
						</div>
						<Select value={typeFilter} onChange={setTypeFilter} options={types.map((t) => ({ value: t, label: t === "all" ? "All events" : prettyKey(t) }))} />
					</div>
					<DataTable
						columns={["#", "Time", "Turn", "Event", "Details"]}
						rows={shown.map((e) => [e.seq, fmtDuration(n(e.t_ms)), e.turn, prettyKey(e.type), describeEvent(e)])}
					/>
				</section>
			</div>
			<p className="text-[11px] text-[#9a7888] font-semibold mt-2">Avg {dec(events.length / Math.max(1, n(g.turns)))} events per turn</p>
		</>
	);
}
