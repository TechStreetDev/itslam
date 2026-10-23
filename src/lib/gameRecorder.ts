import { db } from "./db";
import { entityPoints } from "./engine";
import { normalizePacks } from "./deck";
import type { Lobby } from "./lobbyManager";
import type { SheepKind } from "./types";

const EVENT_CHUNK = 500;
const SHEEP_KINDS: SheepKind[] = ["basic", "half_rainbow", "full_rainbow", "painted", "franken_heads", "franken_butts"];

// Writes a finished (or abandoned) game to MySQL. Only seat numbers are stored -
// never names, player ids, lobby codes or anything else that could identify someone.
export async function recordGame(lobby: Lobby, status: "completed" | "abandoned"): Promise<void> {
	const game = lobby.game;
	if (!db || !game || !game.started || game.recorded) return;
	game.recorded = true;

	const seatOf = new Map(game.order.map((id, seat) => [id, seat]));
	const seat = (id?: string) => (id !== undefined && seatOf.has(id) ? seatOf.get(id)! : null);
	const events = game.events ?? [];
	const results = status === "completed" ? game.results : null;

	const lobbyPlayer = (id: string) => lobby.players.find((p) => p.id === id);
	const isBot = (id: string) => id.startsWith("bot_");
	const wasReplaced = (id: string) =>
		!!lobbyPlayer(id)?.isReplacement || events.some((e) => e.type === "player_replaced" && e.actor === id);

	const count = (type: string, pred: (e: (typeof events)[number]) => boolean = () => true) =>
		events.filter((e) => e.type === type && pred(e)).length;

	// Placement: rank by score, ties broken in favour of the tiebreak winner
	const placements = new Map<string, number>();
	if (results) {
		const ranked = [...game.order].sort((a, b) => {
			const diff = results.scores[b] - results.scores[a];
			if (diff !== 0) return diff;
			return (b === results.winnerId ? 1 : 0) - (a === results.winnerId ? 1 : 0);
		});
		ranked.forEach((id, i) => placements.set(id, i + 1));
	}

	const startedAt = game.startedAt ?? lobby.createdAt;
	const endedAt = Date.now();
	const humans = game.order.filter((id) => !isBot(id));

	const conn = await db.getConnection();
	try {
		await conn.beginTransaction();
		const [res] = await conn.query(
			`INSERT INTO games SET ?`,
			{
				status,
				started_at: new Date(startedAt),
				ended_at: new Date(endedAt),
				duration_ms: Math.max(0, endedAt - startedAt),
				player_count: game.order.length,
				human_count: humans.length,
				bot_count: game.order.length - humans.length,
				replaced_count: humans.filter(wasReplaced).length,
				is_public: lobby.isPublic,
				packs: normalizePacks(game.packs).join(","),
				deck_size: game.deckSize ?? null,
				turns: game.turnNumber ?? 0,
				final_round_reached: game.finalRoundActive || game.ended,
				winner_seat: results ? seat(results.winnerId) : null,
				winner_is_bot: results ? isBot(results.winnerId) : null,
				winning_score: results ? results.scores[results.winnerId] : null,
				was_tiebreak: results ? results.wasTiebreak : null,
				tied_count: results ? results.tied.length : null,
				deck_left: game.deck.length,
				discard_size: game.discard.length,
				sheep_built: count("sheep_built"),
				actions_played: count("action"),
				bodyswaps: count("bodyswap"),
				challenges_played: count("challenge_played"),
				coin_flips: count("coin_flip"),
				reflips: count("coin_flip", (e) => e.data?.reflip === true),
				event_count: events.length,
			},
		);
		const gameId = (res as { insertId: number }).insertId;

		const playerRows = game.order.map((id, s) => {
			const p = game.players[id];
			const fieldPts = p.field.reduce((sum, e) => sum + entityPoints(e), 0);
			const penalty = p.hand.filter((c) => c.category === "challenge").length * 3;
			const kinds = Object.fromEntries(SHEEP_KINDS.map((k) => [k, p.field.filter((e) => e.kind === k).length]));
			return [
				gameId,
				s,
				isBot(id),
				wasReplaced(id),
				results ? results.scores[id] : null,
				results ? placements.get(id)! : null,
				results ? results.winnerId === id : false,
				fieldPts,
				penalty,
				p.field.length,
				p.hand.length,
				...SHEEP_KINDS.map((k) => kinds[k]),
				count("turn_end", (e) => e.actor === id),
				count("sheep_built", (e) => e.actor === id),
				count("action", (e) => e.actor === id),
				count("challenge_played", (e) => e.actor === id),
				count("challenge_resolved", (e) => e.actor === id),
				events.filter((e) => e.target === id && (e.type === "action" || e.type === "challenge_played")).length,
			];
		});
		await conn.query(
			`INSERT INTO game_players (game_id, seat, is_bot, was_replaced, score, placement, is_winner,
				field_points, challenge_penalty, sheep_count, hand_size, ${SHEEP_KINDS.join(", ")},
				turns_taken, sheep_built, actions_played, challenges_played, challenges_won, times_targeted) VALUES ?`,
			[playerRows],
		);

		for (let i = 0; i < events.length; i += EVENT_CHUNK) {
			const rows = events.slice(i, i + EVENT_CHUNK).map((e, j) => [
				gameId,
				i + j,
				Math.max(0, e.t),
				e.turn,
				e.type,
				seat(e.actor),
				seat(e.target),
				e.data ? JSON.stringify(e.data) : null,
			]);
			await conn.query(
				"INSERT INTO game_events (game_id, seq, t_ms, turn, type, actor_seat, target_seat, data) VALUES ?",
				[rows],
			);
		}
		await conn.commit();
	} catch (e) {
		await conn.rollback().catch(() => {});
		game.recorded = false;
		console.error("[MySQL] recordGame failed:", (e as Error).message);
	} finally {
		conn.release();
	}
}
