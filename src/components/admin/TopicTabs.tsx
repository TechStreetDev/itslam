"use client";

import type { Filters } from "@/lib/analyticsSchema";
import { packsLabel } from "@/lib/deck";
import { ACCENT, BarChart, ChartCard, ColumnChart, DataTable, SERIES, fmt1, fmtInt } from "./Charts";
import {
	ChartGrid,
	ErrorNote,
	Loading,
	SectionTitle,
	Stat,
	StatGrid,
	dec,
	filtersToQuery,
	fmtDuration,
	n,
	nOrNull,
	pct,
	prettyKey,
	useApi,
} from "./Shared";

type Row = Record<string, any>;

function useTopic<T>(topic: string, filters: Filters) {
	return useApi<T>(`/api/admin/${topic}?${filtersToQuery(filters)}`);
}

function Wrap({
	state,
	children,
}: {
	state: { data: unknown; error: string | null; reload: () => void };
	children: () => React.ReactNode;
}) {
	if (state.error) return <ErrorNote error={state.error} onRetry={state.reload} />;
	if (!state.data) return <Loading />;
	return <>{children()}</>;
}

const SHEEP_LABELS: Record<string, string> = {
	basic: "Basic",
	half_rainbow: "Half-rainbow",
	full_rainbow: "Double rainbow",
	painted: "Painted",
	franken_heads: "Double-headed",
	franken_butts: "Double-butted",
};
const CHALLENGE_LABELS: Record<string, string> = {
	lure2: "Lure 2",
	remove2: "Remove 2",
	halve2: "Halve 2",
	yoink_hand: "Yoink hand",
	recover1: "Recover 1",
};
const DISCARD_LABELS: Record<string, string> = {
	head: "Head",
	butt: "Butt",
	wheat: "Wheat",
	wolf: "Wolf",
	yoink: "Yoink",
	reflip: "Re-Flip",
	paint: "Paint",
	franken: "Franken",
};
const label = (map: Record<string, string>, k: unknown) => map[String(k)] ?? prettyKey(String(k ?? "(none)"));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const f2 = (v: number) => v.toFixed(2);

function fillDays(rows: Row[]): Row[] {
	if (rows.length === 0) return [];
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const out: Row[] = [];
	const end = new Date(rows[rows.length - 1].day + "T00:00:00Z");
	for (let d = new Date(rows[0].day + "T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		const key = d.toISOString().slice(0, 10);
		out.push(byDay.get(key) ?? { day: key, games: 0, completed: 0, abandoned: 0 });
	}
	return out;
}

// --- Overview ---

export function OverviewTab({ filters }: { filters: Filters }) {
	const state = useTopic<Row>("overview", filters);
	return (
		<Wrap state={state}>
			{() => {
				const d = state.data!;
				const s = d.summary;
				if (!n(s.games)) return <p className="text-[13px] font-semibold text-[#8a5a70] py-6">No games match these filters yet.</p>;
				const games = Math.max(1, n(s.games));
				const days = fillDays(d.perDay);
				return (
					<>
						<StatGrid>
							<Stat
								label="Games"
								value={fmtInt(n(s.games))}
								hint={`${fmtInt(n(s.completed))} completed · ${fmtInt(n(s.abandoned))} abandoned`}
								info="How many recorded games match the filters. Every other number on this page is averaged over these games."
							/>
							<Stat label="Avg duration" value={fmtDuration(nOrNull(s.avg_duration_ms))} info="Average real time from the game starting (including the tutorial) to it ending." />
							<Stat label="Avg turns" value={dec(s.avg_turns)} info="Average number of turns taken per game, counting every player's turn." />
							<Stat label="Avg winning score" value={dec(s.avg_winning_score)} info="Average final score of the winner, after challenge-card penalties. Completed games only." />
							<Stat label="Avg players" value={dec(s.avg_players)} info="Average number of seats per game, humans and bots together." />
							<Stat
								label="Humans / bots per game"
								value={`${dec(n(s.human_seats) / games)} / ${dec(n(s.bot_seats) / games)}`}
								info="Average seats per game that started as a human or as a bot. Humans who were later replaced by a bot count as human."
							/>
							<Stat label="Games with bots" value={pct(s.games_with_bots_rate)} info="Share of games that had at least one bot seat from the start." />
							<Stat label="Someone left mid-game" value={pct(s.games_with_replacement_rate)} info="Share of games where at least one human left or dropped and a bot took over their seat." />
							<Stat label="Tiebreaks" value={pct(s.tiebreak_rate, 1)} info="Share of games where the top score was tied and the winner was decided by tiebreak." />
							<Stat label="Public lobbies" value={pct(s.public_rate)} info="Share of games played in a lobby listed in the public lobby browser." />
							<Stat label="Games with expansions" value={pct(s.expansion_rate)} info="Share of games played with at least one expansion pack switched on." />
							<Stat
								label="Sheep / actions / challenges"
								value={`${dec(s.avg_sheep_built)} / ${dec(s.avg_actions)} / ${dec(s.avg_challenges)}`}
								hint="per game"
								info="Average per game of sheep built (from hand or recovered), action cards played (Wheat, Wolf, Yoink) and challenge cards played."
							/>
							<Stat label="Events per game" value={dec(n(s.events) / games)} info="Average number of recorded analytics events per game (draws, plays, flips, discards, turn ends…)." />
						</StatGrid>

						<ChartGrid>
							<div className="lg:col-span-2">
								<ChartCard
									title="Games per day"
									subtitle="UTC"
									info="Number of games started each day, split by whether they finished or were abandoned."
									table={{ columns: ["Day", "Completed", "Abandoned"], rows: days.map((r) => [r.day, n(r.completed), n(r.abandoned)]) }}
								>
									<ColumnChart
										data={days.map((r) => ({ label: r.day.slice(5), completed: n(r.completed), abandoned: n(r.abandoned) }))}
										series={[
											{ key: "completed", label: "Completed", color: SERIES[0] },
											{ key: "abandoned", label: "Abandoned", color: SERIES[1] },
										]}
									/>
								</ChartCard>
							</div>
							<ChartCard
								title="Games by player count"
								info="How many games were played with 2, 3 or 4 seats, with averages for each group."
								table={{
									columns: ["Players", "Games", "Avg duration", "Avg turns", "Avg winning score", "Tiebreaks"],
									rows: d.byPlayers.map((r: Row) => [r.players, n(r.games), fmtDuration(nOrNull(r.avg_duration_ms)), dec(r.avg_turns), dec(r.avg_winning_score), pct(r.tiebreak_rate, 1)]),
								}}
							>
								<BarChart
									data={d.byPlayers.map((r: Row) => ({
										label: `${r.players} players`,
										value: n(r.games),
										detail: [
											{ label: "Avg duration", value: fmtDuration(nOrNull(r.avg_duration_ms)) },
											{ label: "Avg turns", value: dec(r.avg_turns) },
										],
									}))}
								/>
							</ChartCard>
							<ChartCard
								title="Games by card packs"
								info="How many games were played with each combination of card packs, with averages for each group. Games recorded before packs existed count as base game only."
								table={{
									columns: ["Card packs", "Games", "Deck size", "Avg duration", "Avg turns", "Avg winning score", "Avg challenges", "Tiebreaks"],
									rows: d.byPacks.map((r: Row) => [packsLabel(r.packs), n(r.games), dec(r.avg_deck_size), fmtDuration(nOrNull(r.avg_duration_ms)), dec(r.avg_turns), dec(r.avg_winning_score), dec(r.avg_challenges), pct(r.tiebreak_rate, 1)]),
								}}
							>
								<BarChart
									data={d.byPacks.map((r: Row) => ({
										label: packsLabel(r.packs),
										value: n(r.games),
										detail: [
											{ label: "Avg duration", value: fmtDuration(nOrNull(r.avg_duration_ms)) },
											{ label: "Avg turns", value: dec(r.avg_turns) },
											{ label: "Avg winning score", value: dec(r.avg_winning_score) },
										],
									}))}
								/>
							</ChartCard>
							<ChartCard
								title="Winning score"
								subtitle="How many games were won with each score"
								info="Distribution of the winner's final score. Useful for seeing what score usually takes the game."
								table={{ columns: ["Score", "Games"], rows: d.winningScore.map((r: Row) => [r.score, n(r.games)]) }}
							>
								<ColumnChart data={d.winningScore.map((r: Row) => ({ label: String(r.score), games: n(r.games) }))} series={[{ key: "games", label: "Games", color: ACCENT }]} />
							</ChartCard>
							<ChartCard
								title="Game length"
								subtitle="Minutes, in 5-minute buckets (120+ grouped)"
								info="Distribution of real-time game length, from start to end."
								table={{ columns: ["Minutes", "Games"], rows: d.duration.map((r: Row) => [n(r.bucket) >= 120 ? "120+" : `${r.bucket}–${n(r.bucket) + 5}`, n(r.games)]) }}
							>
								<ColumnChart data={d.duration.map((r: Row) => ({ label: n(r.bucket) >= 120 ? "120+" : `${r.bucket}`, games: n(r.games) }))} series={[{ key: "games", label: "Games", color: ACCENT }]} />
							</ChartCard>
							<ChartCard
								title="Turns per game"
								subtitle="In buckets of 5"
								info="Distribution of how many turns a game lasts, counting every player's turn."
								table={{ columns: ["Turns", "Games"], rows: d.turns.map((r: Row) => [`${r.bucket}–${n(r.bucket) + 4}`, n(r.games)]) }}
							>
								<ColumnChart data={d.turns.map((r: Row) => ({ label: `${r.bucket}`, games: n(r.games) }))} series={[{ key: "games", label: "Games", color: ACCENT }]} />
							</ChartCard>
							<ChartCard title="When games start" subtitle="Hour of day, UTC" info="Number of games started in each hour of the day (UTC)." table={{ columns: ["Hour", "Games"], rows: d.hour.map((r: Row) => [r.hour, n(r.games)]) }}>
								<ColumnChart
									data={Array.from({ length: 24 }, (_, h) => ({ label: String(h), games: n(d.hour.find((r: Row) => n(r.hour) === h)?.games) }))}
									series={[{ key: "games", label: "Games", color: ACCENT }]}
								/>
							</ChartCard>
							<ChartCard title="Day of week" subtitle="UTC" info="Number of games started on each day of the week (UTC)." table={{ columns: ["Day", "Games"], rows: d.weekday.map((r: Row) => [WEEKDAYS[n(r.weekday)], n(r.games)]) }}>
								<ColumnChart
									data={WEEKDAYS.map((w, i) => ({ label: w, games: n(d.weekday.find((r: Row) => n(r.weekday) === i)?.games) }))}
									series={[{ key: "games", label: "Games", color: ACCENT }]}
								/>
							</ChartCard>
						</ChartGrid>
					</>
				);
			}}
		</Wrap>
	);
}

// --- Sheep ---

export function SheepTab({ filters }: { filters: Filters }) {
	const state = useTopic<Row>("sheep", filters);
	return (
		<Wrap state={state}>
			{() => {
				const d = state.data!;
				const games = Math.max(1, n(d.games));
				const pg = (v: unknown) => n(v) / games;
				const kinds = new Map<string, { hand: number; discard: number; points: number }>();
				for (const r of d.byKind as Row[]) {
					const k = kinds.get(r.kind) ?? { hand: 0, discard: 0, points: n(r.avg_points) };
					if (r.source === "discard") k.discard += n(r.n);
					else k.hand += n(r.n);
					kinds.set(r.kind, k);
				}
				const kindRows = [...kinds.entries()].sort((a, b) => b[1].hand + b[1].discard - (a[1].hand + a[1].discard));
				const totalBuilt = kindRows.reduce((s, [, v]) => s + v.hand + v.discard, 0);
				const totalRecovered = kindRows.reduce((s, [, v]) => s + v.discard, 0);
				const ff = d.finalField ?? {};
				return (
					<>
						<StatGrid>
							<Stat label="Sheep built" value={dec(totalBuilt / games)} hint="per game" info="Average sheep added to fields per game, whether built from hand or recovered from the discard pile." />
							<Stat label="Recovered from discard" value={dec(totalRecovered / games, 2)} hint="per game" info="Average sheep per game brought back from the discard pile by a Recover 1 challenge." />
							<Stat label="Sheep in field at end" value={dec(ff.sheep)} hint="average per player" info="Average number of sheep each player had in their field when the game ended." />
							<Stat label="Field points at end" value={dec(ff.field_points)} hint="average per player" info="Average points from sheep in each player's field at the end, before any challenge-card penalty." />
						</StatGrid>
						<ChartGrid>
							<ChartCard
								title="Sheep built by kind"
								subtitle="Per game - from hand vs recovered from the discard pile"
								info="Average number of each kind of sheep built per game. 'Recovered' sheep came back from the discard pile through a challenge."
								table={{
									columns: ["Kind", "From hand / game", "Recovered / game", "Total / game", "Share", "Points each"],
									rows: kindRows.map(([k, v]) => [label(SHEEP_LABELS, k), f2(pg(v.hand)), f2(pg(v.discard)), f2(pg(v.hand + v.discard)), pct((v.hand + v.discard) / Math.max(1, totalBuilt), 1), dec(v.points)]),
								}}
							>
								<ColumnChart
									data={kindRows.map(([k, v]) => ({ label: label(SHEEP_LABELS, k), hand: pg(v.hand), discard: pg(v.discard) }))}
									series={[
										{ key: "hand", label: "From hand", color: SERIES[0] },
										{ key: "discard", label: "Recovered", color: SERIES[1] },
									]}
									format={f2}
								/>
							</ChartCard>
							<ChartCard
								title="Field composition at game end"
								subtitle="Average sheep of each kind per player"
								info="What a typical player's field looked like when the game ended, average count of each sheep kind per player."
								table={{ columns: ["Kind", "Average"], rows: Object.keys(SHEEP_LABELS).map((k) => [SHEEP_LABELS[k], dec(ff[k], 2)]) }}
							>
								<BarChart data={Object.keys(SHEEP_LABELS).map((k) => ({ label: SHEEP_LABELS[k], value: n(ff[k]) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="Card colours used in sheep"
								subtitle="Parts per game"
								info="Average number of head, butt and extra (Franken) parts of each colour used to build sheep, per game."
								table={{ columns: ["Colour", "Parts / game"], rows: d.colors.map((r: Row) => [prettyKey(r.color), f2(pg(r.n))]) }}
							>
								<BarChart data={d.colors.map((r: Row) => ({ label: prettyKey(r.color), value: pg(r.n) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="Modifiers"
								subtitle="Sheep per game, by modifier used"
								info="Average sheep built per game with a Paint card, a Franken card, or no modifier at all."
								table={{ columns: ["Modifier", "Sheep / game"], rows: d.modifiers.map((r: Row) => [prettyKey(r.modifier), f2(pg(r.n))]) }}
							>
								<BarChart data={d.modifiers.map((r: Row) => ({ label: prettyKey(r.modifier), value: pg(r.n) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="When sheep get built"
								subtitle="Sheep per game, by turn number (buckets of 5)"
								info="Average sheep built per game during each 5-turn window - shows whether flocks are built early or late."
								table={{ columns: ["Turns", "Sheep / game"], rows: d.byTurn.map((r: Row) => [`${r.bucket}–${n(r.bucket) + 4}`, f2(pg(r.n))]) }}
							>
								<ColumnChart data={d.byTurn.map((r: Row) => ({ label: String(r.bucket), n: pg(r.n) }))} series={[{ key: "n", label: "Sheep / game", color: ACCENT }]} format={f2} />
							</ChartCard>
						</ChartGrid>
					</>
				);
			}}
		</Wrap>
	);
}

// --- Actions ---

export function ActionsTab({ filters }: { filters: Filters }) {
	const state = useTopic<Row>("actions", filters);
	return (
		<Wrap state={state}>
			{() => {
				const d = state.data!;
				const games = Math.max(1, n(d.games));
				const pg = (v: unknown) => n(v) / games;
				const actionKeys = ["wheat", "wolf", "yoink"];
				const actionInfo: Record<string, string> = {
					wheat: "Average Wheat cards played per game. Wheat lures an opponent's sheep into your field.",
					wolf: "Average Wolf cards played per game. Wolf sends an opponent's sheep to the discard pile.",
					yoink: "Average Yoink cards played per game. Yoink takes 2 cards from an opponent's hand.",
				};
				const buckets = [...new Set((d.byTurn as Row[]).map((r) => n(r.bucket)))].sort((a, b) => a - b);
				// Card kinds only exist on discards recorded after they were tracked, so average over those games
				const dc = d.discardedCards ?? {};
				const dcGames = n(dc.games);
				const discardKinds = Object.keys(DISCARD_LABELS);
				const totalDiscarded = discardKinds.reduce((s, k) => s + n(dc[k]), 0);
				const dpg = (v: unknown) => (dcGames ? n(v) / dcGames : 0);
				return (
					<>
						<StatGrid>
							{actionKeys.map((a) => {
								const r = (d.actions as Row[]).find((x) => x.action === a);
								return <Stat key={a} label={prettyKey(a)} value={dec(pg(r?.n), 2)} hint="per game" info={actionInfo[a]} />;
							})}
							<Stat
								label="Discards"
								value={dec(pg(d.discards?.n), 2)}
								hint={`per game · ${dec(d.discards?.avg_cards)} cards each time`}
								info="Average times per game a player ended their turn over 7 cards and had to discard down to 7."
							/>
						</StatGrid>
						<ChartGrid>
							<ChartCard
								title="Action cards played"
								subtitle="Per game"
								info="Average action cards played per game, with what they hit: points of the targeted sheep (Wheat/Wolf) and cards taken (Yoink)."
								table={{
									columns: ["Action", "Per game", "Avg target points", "Avg cards taken"],
									rows: d.actions.map((r: Row) => [prettyKey(r.action), f2(pg(r.n)), dec(r.avg_points, 2), dec(r.avg_cards, 2)]),
								}}
							>
								<BarChart data={d.actions.map((r: Row) => ({ label: prettyKey(r.action), value: pg(r.n) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="Cards discarded"
								subtitle="Per game, by card type"
								info="Which cards players choose to throw away when discarding down to 7, averaged per game. Rainbow is the share of Head/Butt discards that were rainbow parts."
								table={{
									columns: ["Card", "Per game", "Share of discards"],
									rows: [
										...discardKinds.map((k) => [DISCARD_LABELS[k], f2(dpg(dc[k])), pct(n(dc[k]) / Math.max(1, totalDiscarded), 1)]),
										["(of which rainbow parts)", f2(dpg(dc.rainbow)), pct(n(dc.rainbow) / Math.max(1, totalDiscarded), 1)],
									],
								}}
							>
								{dcGames === 0 ? (
									<p className="text-[13px] text-[#8a5a70] font-semibold">No discards with card types recorded yet.</p>
								) : (
									<BarChart
										data={discardKinds.map((k) => ({
											label: DISCARD_LABELS[k],
											value: dpg(dc[k]),
											detail: [{ label: "Share", value: pct(n(dc[k]) / Math.max(1, totalDiscarded), 1) }],
										}))}
										format={f2}
									/>
								)}
							</ChartCard>
							<ChartCard
								title="What Wheat and Wolf target"
								subtitle="Sheep kind taken or removed, per game"
								info="Average times per game each kind of sheep was lured away by Wheat or destroyed by Wolf."
								table={{ columns: ["Action", "Sheep kind", "Per game"], rows: d.actionTargets.map((r: Row) => [prettyKey(r.action), label(SHEEP_LABELS, r.kind), f2(pg(r.n))]) }}
							>
								<ColumnChart
									mode="grouped"
									data={Object.keys(SHEEP_LABELS).map((k) => ({
										label: SHEEP_LABELS[k],
										wheat: pg((d.actionTargets as Row[]).find((r) => r.action === "wheat" && r.kind === k)?.n),
										wolf: pg((d.actionTargets as Row[]).find((r) => r.action === "wolf" && r.kind === k)?.n),
									}))}
									series={[
										{ key: "wheat", label: "Wheat", color: SERIES[0] },
										{ key: "wolf", label: "Wolf", color: SERIES[1] },
									]}
									format={f2}
								/>
							</ChartCard>
							<ChartCard
								title="Actions over the game"
								subtitle="Per game, by turn number (buckets of 5)"
								info="Average action cards played per game during each 5-turn window - shows when in a game each action tends to be used."
								table={{ columns: ["Turns", "Action", "Per game"], rows: d.byTurn.map((r: Row) => [r.bucket, prettyKey(r.action), f2(pg(r.n))]) }}
							>
								<ColumnChart
									data={buckets.map((b) => ({
										label: String(b),
										...Object.fromEntries(actionKeys.map((a) => [a, pg((d.byTurn as Row[]).find((r) => n(r.bucket) === b && r.action === a)?.n)])),
									}))}
									series={actionKeys.map((a, i) => ({ key: a, label: prettyKey(a), color: SERIES[i] }))}
									format={f2}
								/>
							</ChartCard>
							<ChartCard
								title="Body Swaps"
								subtitle="What sheep were turned into what, per game"
								info="Average Body Swaps per game, swapping a head or butt from your hand onto a sheep in play - grouped by the sheep kind before and after."
							>
								{d.bodyswaps.length === 0 ? (
									<p className="text-[13px] text-[#8a5a70] font-semibold">No Body Swaps yet.</p>
								) : (
									<DataTable
										columns={["From", "To", "Per game", "On own sheep"]}
										rows={d.bodyswaps.map((r: Row) => [label(SHEEP_LABELS, r.from_kind), label(SHEEP_LABELS, r.to_kind), f2(pg(r.n)), pct(n(r.own) / Math.max(1, n(r.n)))])}
									/>
								)}
							</ChartCard>
						</ChartGrid>
					</>
				);
			}}
		</Wrap>
	);
}

// --- Challenges ---

export function ChallengesTab({ filters }: { filters: Filters }) {
	const state = useTopic<Row>("challenges", filters);
	return (
		<Wrap state={state}>
			{() => {
				const d = state.data!;
				const games = Math.max(1, n(d.games));
				const pg = (v: unknown) => n(v) / games;
				const f = d.flips ?? {};
				const types = (d.byType as Row[]).map((r) => ({ ...r, ...(d.played as Row[]).find((p) => p.challenge === r.challenge) }));
				const totalPlayed = types.reduce((s, r) => s + n(r.played), 0);
				return (
					<>
						<StatGrid>
							<Stat label="Challenges played" value={dec(totalPlayed / games, 2)} hint="per game" info="Average challenge cards played per game. A player can play at most one challenge per turn." />
							<Stat label="Coin lands heads" value={pct(f.heads_rate, 1)} hint="should be ~50%" info="Share of all coin flips (including Re-Flips) that landed heads. A sanity check that the coin is fair." />
							<Stat label="Players guess heads" value={pct(f.guess_heads_rate, 1)} info="Share of challenge guesses where the challenger called heads (sheep looking at me) rather than butts." />
							<Stat label="Challenger wins first flip" value={pct(f.first_flip_challenger_win_rate, 1)} info="Share of first flips (before any Re-Flip) where the challenger's guess was right." />
							<Stat label="Re-flips played" value={dec(pg(f.reflips), 2)} hint="per game" info="Average Re-Flip cards played per game to flip a challenge coin again." />
							<Stat label="Re-flip changed the result" value={pct(f.reflip_changed_rate, 1)} info="Share of Re-Flips where the new flip changed who won the challenge." />
							<Stat
								label="Ended holding challenges"
								value={pct(d.penalty?.penalised_rate, 1)}
								hint={`avg penalty ${dec(d.penalty?.avg_penalty, 2)} pts`}
								info="Share of players who finished a completed game with unplayed challenge cards in hand, which cost 3 points each."
							/>
							<Stat label="…and still won" value={pct(d.penalty?.penalised_win_rate, 1)} info="Of the players who ended holding challenge cards, the share who won anyway." />
						</StatGrid>
						<ChartGrid>
							<ChartCard
								title="Challenger win rate by challenge"
								subtitle="After any Re-Flips"
								info="For each challenge type, the share of resolved challenges the challenger won, once any Re-Flips are settled."
								table={{
									columns: ["Challenge", "Per game", "Challenger wins", "Avg flips", "Avg affected", "Avg points moved", "Targeted the leader"],
									rows: types.map((r) => [label(CHALLENGE_LABELS, r.challenge), f2(pg(r.played)), pct(r.challenger_win_rate, 1), dec(r.avg_flips, 2), dec(r.avg_affected, 2), dec(r.avg_points, 2), pct(r.targeted_leader_rate)]),
								}}
							>
								<BarChart
									data={types.map((r) => ({
										label: label(CHALLENGE_LABELS, r.challenge),
										value: n(r.challenger_win_rate) * 100,
										detail: [{ label: "Per game", value: f2(pg(r.played)) }],
									}))}
									format={(v) => `${v.toFixed(1)}%`}
								/>
							</ChartCard>
							<ChartCard
								title="Challenges played by type"
								subtitle="Per game"
								info="Average number of each challenge card played per game."
								table={{ columns: ["Challenge", "Per game"], rows: types.map((r) => [label(CHALLENGE_LABELS, r.challenge), f2(pg(r.played))]) }}
							>
								<BarChart data={types.map((r) => ({ label: label(CHALLENGE_LABELS, r.challenge), value: pg(r.played) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="Average impact"
								subtitle="Sheep or cards affected when a challenge resolves"
								info="Average number of sheep or cards a challenge moved or removed when it resolved, and the points involved."
								table={{ columns: ["Challenge", "Avg affected", "Avg points"], rows: types.map((r) => [label(CHALLENGE_LABELS, r.challenge), dec(r.avg_affected, 2), dec(r.avg_points, 2)]) }}
							>
								<BarChart data={types.map((r) => ({ label: label(CHALLENGE_LABELS, r.challenge), value: n(r.avg_affected) }))} format={f2} />
							</ChartCard>
							<ChartCard
								title="Who plays Re-Flip"
								subtitle="Per game"
								info="Average Re-Flips per game, split by who played it (the challenger, the target, or another player), and how often it changed the result."
								table={{ columns: ["Played by", "Per game", "Changed result"], rows: d.reflipBy.map((r: Row) => [prettyKey(r.reflip_by), f2(pg(r.n)), pct(r.changed_rate, 1)]) }}
							>
								{d.reflipBy.length === 0 ? (
									<p className="text-[13px] text-[#8a5a70] font-semibold">No Re-Flips yet.</p>
								) : (
									<BarChart
										data={d.reflipBy.map((r: Row) => ({ label: prettyKey(r.reflip_by), value: pg(r.n), detail: [{ label: "Changed result", value: pct(r.changed_rate, 1) }] }))}
										format={f2}
									/>
								)}
							</ChartCard>
						</ChartGrid>
					</>
				);
			}}
		</Wrap>
	);
}

// --- Seats & balance ---

export function SeatsTab({ filters }: { filters: Filters }) {
	const state = useTopic<Row>("seats", filters);
	return (
		<Wrap state={state}>
			{() => {
				const d = state.data!;
				const counts = [...new Set((d.bySeat as Row[]).map((r) => n(r.players)))].sort();
				const t = d.targeting ?? {};
				return (
					<>
						<p className="text-[12px] text-[#8a5a70] font-semibold">
							Completed games only. Seat 1 takes the first turn. In a fair game each seat wins about 1 / players of the time.
						</p>
						<ChartGrid>
							{counts.map((c) => {
								const rows = (d.bySeat as Row[]).filter((r) => n(r.players) === c);
								return (
									<ChartCard
										key={c}
										title={`Win rate by seat - ${c} players`}
										subtitle={`Fair share: ${(100 / c).toFixed(0)}%`}
										info={`In ${c}-player games, how often each seat won. Seat 1 goes first. Bars well above or below the fair line suggest a turn-order advantage.`}
										table={{ columns: ["Seat", "Games", "Win rate", "Avg score", "Avg placement"], rows: rows.map((r) => [n(r.seat) + 1, n(r.n), pct(r.win_rate, 1), dec(r.avg_score), dec(r.avg_placement, 2)]) }}
									>
										<BarChart
											labelWidth={70}
											data={rows.map((r) => ({
												label: `Seat ${n(r.seat) + 1}`,
												value: n(r.win_rate) * 100,
												detail: [
													{ label: "Games", value: fmtInt(n(r.n)) },
													{ label: "Avg score", value: dec(r.avg_score) },
												],
											}))}
											format={(v) => `${v.toFixed(1)}%`}
											reference={{ value: 100 / c, label: `fair ${(100 / c).toFixed(0)}%` }}
										/>
									</ChartCard>
								);
							})}
							<ChartCard
								title="Bots vs humans"
								subtitle="Win rate by player type"
								info="Win rate and per-game averages for bot seats, human seats, and humans who were replaced by a bot partway through."
								table={{
									columns: ["Type", "Seats", "Win rate", "Avg score", "Avg placement", "Sheep built / game", "Actions / game", "Challenges / game"],
									rows: d.byType.map((r: Row) => [prettyKey(r.kind), n(r.n), pct(r.win_rate, 1), dec(r.avg_score), dec(r.avg_placement, 2), dec(r.avg_sheep_built), dec(r.avg_actions), dec(r.avg_challenges)]),
								}}
							>
								<BarChart
									data={d.byType.map((r: Row) => ({ label: prettyKey(r.kind), value: n(r.win_rate) * 100, detail: [{ label: "Seats", value: fmtInt(n(r.n)) }] }))}
									format={(v) => `${v.toFixed(1)}%`}
								/>
							</ChartCard>
							<ChartCard
								title="Final scores"
								subtitle="Every player's score, all seats"
								info="Distribution of every player's final score (winners and losers), after challenge-card penalties."
								table={{ columns: ["Score", "Players"], rows: d.scores.map((r: Row) => [r.score, n(r.n)]) }}
							>
								<ColumnChart data={d.scores.map((r: Row) => ({ label: String(r.score), n: n(r.n) }))} series={[{ key: "n", label: "Players", color: ACCENT }]} />
							</ChartCard>
							<ChartCard
								title="Winning margin"
								subtitle="Points between 1st and 2nd (0 = tie)"
								info="How close games are: the gap between the top score and the runner-up. 0 means the top score was tied."
								table={{ columns: ["Margin", "Games"], rows: d.margin.map((r: Row) => [r.margin, n(r.n)]) }}
							>
								<ColumnChart data={d.margin.map((r: Row) => ({ label: String(r.margin), n: n(r.n) }))} series={[{ key: "n", label: "Games", color: ACCENT }]} />
							</ChartCard>
							<ChartCard
								title="Being targeted"
								subtitle="Per player, per game"
								info="Average times a player was hit by an action card or challenged in a game - split by whether they went on to win."
							>
								<div className="grid grid-cols-3 gap-2">
									<Stat label="Everyone" value={fmt1(n(t.avg_times_targeted))} info="Average times any player was targeted in a game." />
									<Stat label="Winners" value={fmt1(n(t.winner_times_targeted))} info="Average times the eventual winner was targeted in a game." />
									<Stat label="Others" value={fmt1(n(t.loser_times_targeted))} info="Average times a player who didn't win was targeted in a game." />
								</div>
							</ChartCard>
						</ChartGrid>
					</>
				);
			}}
		</Wrap>
	);
}

export { SectionTitle };
