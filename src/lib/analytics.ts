import { db } from "./db";
import { DISCARD_KINDS } from "./types";
import { EXPANSION_PACKS, packsLabel } from "./deck";
import {
	EVENT_DIMENSIONS,
	EVENT_FIELDS,
	EVENT_TYPES,
	EventTypeName,
	ExploreQuery,
	FieldDef,
	Filters,
	GAME_COLUMNS,
	PLAYER_COLUMNS,
	SHARED_GAME_DIMENSIONS,
} from "./analyticsSchema";

type Row = Record<string, unknown>;

function requireDb() {
	if (!db) throw new HttpError(503, "MySQL is not configured - set MYSQL_URL to enable game history.");
	return db;
}

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
	const [rows] = await requireDb().query(sql, params);
	return rows as T[];
}

// --- Filters ---

export function parseFilters(params: URLSearchParams): Filters {
	const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
	const oneOf = <const T extends string>(v: string | null, allowed: readonly T[], fallback: NoInfer<T>): T =>
		allowed.includes(v as T) ? (v as T) : fallback;
	return {
		from: date(params.get("from")),
		to: date(params.get("to")),
		players: /^[2-4]$/.test(params.get("players") || "") ? params.get("players")! : undefined,
		status: oneOf(params.get("status"), ["completed", "abandoned", "all"], "completed"),
		bots: oneOf(params.get("bots"), ["any", "none", "some"], "any"),
		visibility: oneOf(params.get("visibility"), ["any", "public", "private"], "any"),
		packs: oneOf(params.get("packs"), ["any", "base", "expansions", ...EXPANSION_PACKS], "any"),
	};
}

function gameWhere(f: Filters, alias = "g"): { sql: string; params: unknown[] } {
	const clauses: string[] = [];
	const params: unknown[] = [];
	if (f.from) {
		clauses.push(`${alias}.started_at >= ?`);
		params.push(`${f.from} 00:00:00`);
	}
	if (f.to) {
		clauses.push(`${alias}.started_at < DATE_ADD(?, INTERVAL 1 DAY)`);
		params.push(`${f.to} 00:00:00`);
	}
	if (f.players) {
		clauses.push(`${alias}.player_count = ?`);
		params.push(Number(f.players));
	}
	if (f.status && f.status !== "all") {
		clauses.push(`${alias}.status = ?`);
		params.push(f.status);
	}
	if (f.bots === "none") clauses.push(`${alias}.bot_count = 0`);
	if (f.bots === "some") clauses.push(`${alias}.bot_count > 0`);
	if (f.visibility === "public") clauses.push(`${alias}.is_public = 1`);
	if (f.visibility === "private") clauses.push(`${alias}.is_public = 0`);
	if (f.packs === "base") clauses.push(`${alias}.packs = 'base'`);
	else if (f.packs === "expansions") clauses.push(`${alias}.packs <> 'base'`);
	else if (f.packs && f.packs !== "any") {
		clauses.push(`FIND_IN_SET(?, ${alias}.packs) > 0`);
		params.push(f.packs);
	}
	return { sql: clauses.length ? clauses.join(" AND ") : "1=1", params };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// --- Overview ---

export async function overview(f: Filters) {
	const w = gameWhere(f);
	const [summary] = await q(
		`SELECT COUNT(*) AS games,
			SUM(g.status = 'completed') AS completed,
			SUM(g.status = 'abandoned') AS abandoned,
			AVG(g.duration_ms) AS avg_duration_ms,
			AVG(g.turns) AS avg_turns,
			AVG(g.winning_score) AS avg_winning_score,
			AVG(g.was_tiebreak) AS tiebreak_rate,
			AVG(g.player_count) AS avg_players,
			SUM(g.human_count) AS human_seats,
			SUM(g.bot_count) AS bot_seats,
			AVG(g.bot_count > 0) AS games_with_bots_rate,
			AVG(g.replaced_count > 0) AS games_with_replacement_rate,
			AVG(g.is_public) AS public_rate,
			AVG(g.packs <> 'base') AS expansion_rate,
			AVG(g.sheep_built) AS avg_sheep_built,
			AVG(g.actions_played) AS avg_actions,
			AVG(g.challenges_played) AS avg_challenges,
			SUM(g.event_count) AS events,
			MIN(g.started_at) AS first_game,
			MAX(g.started_at) AS last_game
		FROM games g WHERE ${w.sql}`,
		w.params,
	);
	const perDay = await q(
		`SELECT DATE_FORMAT(g.started_at, '%Y-%m-%d') AS day, COUNT(*) AS games,
			SUM(g.status = 'completed') AS completed, SUM(g.status = 'abandoned') AS abandoned
		FROM games g WHERE ${w.sql} GROUP BY day ORDER BY day`,
		w.params,
	);
	const byPlayers = await q(
		`SELECT g.player_count AS players, COUNT(*) AS games, AVG(g.duration_ms) AS avg_duration_ms,
			AVG(g.turns) AS avg_turns, AVG(g.winning_score) AS avg_winning_score, AVG(g.was_tiebreak) AS tiebreak_rate
		FROM games g WHERE ${w.sql} GROUP BY g.player_count ORDER BY g.player_count`,
		w.params,
	);
	const byPacks = await q(
		`SELECT g.packs, COUNT(*) AS games, AVG(g.duration_ms) AS avg_duration_ms, AVG(g.turns) AS avg_turns,
			AVG(g.winning_score) AS avg_winning_score, AVG(g.was_tiebreak) AS tiebreak_rate,
			AVG(g.deck_size) AS avg_deck_size, AVG(g.challenges_played) AS avg_challenges
		FROM games g WHERE ${w.sql} GROUP BY g.packs ORDER BY games DESC`,
		w.params,
	);
	const duration = await q(
		`SELECT LEAST(FLOOR(g.duration_ms / 60000 / 5) * 5, 120) AS bucket, COUNT(*) AS games
		FROM games g WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`,
		w.params,
	);
	const turns = await q(
		`SELECT FLOOR(g.turns / 5) * 5 AS bucket, COUNT(*) AS games
		FROM games g WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`,
		w.params,
	);
	const hour = await q(
		`SELECT HOUR(g.started_at) AS hour, COUNT(*) AS games FROM games g WHERE ${w.sql} GROUP BY hour ORDER BY hour`,
		w.params,
	);
	const weekday = await q(
		`SELECT WEEKDAY(g.started_at) AS weekday, COUNT(*) AS games FROM games g WHERE ${w.sql} GROUP BY weekday ORDER BY weekday`,
		w.params,
	);
	const winningScore = await q(
		`SELECT g.winning_score AS score, COUNT(*) AS games FROM games g
		WHERE ${w.sql} AND g.winning_score IS NOT NULL GROUP BY score ORDER BY score`,
		w.params,
	);
	return { summary, perDay, byPlayers, byPacks, duration, turns, hour, weekday, winningScore };
}

// --- Games list & detail ---

const GAME_SORTS: Record<string, string> = {
	newest: "g.started_at DESC",
	oldest: "g.started_at ASC",
	longest: "g.duration_ms DESC",
	shortest: "g.duration_ms ASC",
	most_turns: "g.turns DESC",
	highest_score: "g.winning_score DESC",
};

export async function listGames(f: Filters, page: number, pageSize: number, sort: string) {
	const w = gameWhere(f);
	const order = GAME_SORTS[sort] ?? GAME_SORTS.newest;
	const [{ total }] = await q<{ total: number }>(`SELECT COUNT(*) AS total FROM games g WHERE ${w.sql}`, w.params);
	const rows = await q(
		`SELECT g.* FROM games g WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
		[...w.params, pageSize, page * pageSize],
	);
	return { total: Number(total), page, pageSize, rows };
}

export async function gameDetail(id: number) {
	const [game] = await q("SELECT * FROM games WHERE id = ?", [id]);
	if (!game) throw new HttpError(404, "Game not found");
	const players = await q("SELECT * FROM game_players WHERE game_id = ? ORDER BY seat", [id]);
	const events = await q(
		"SELECT seq, t_ms, turn, type, actor_seat, target_seat, data FROM game_events WHERE game_id = ? ORDER BY seq",
		[id],
	);
	return { game, players, events };
}

export async function deleteGame(id: number) {
	await q("DELETE FROM games WHERE id = ?", [id]);
}

// --- Topic breakdowns ---

function eventsJoin(f: Filters) {
	const w = gameWhere(f);
	return { from: `game_events e JOIN games g ON g.id = e.game_id`, where: w.sql, params: w.params };
}
const jstr = (key: string) => `JSON_UNQUOTE(JSON_EXTRACT(e.data, '$.${key}'))`;
const jnum = (key: string) => `CAST(JSON_EXTRACT(e.data, '$.${key}') AS DECIMAL(12,3))`;
const jbool = (key: string) => `(JSON_EXTRACT(e.data, '$.${key}') = TRUE)`;

async function gameCount(f: Filters): Promise<number> {
	const w = gameWhere(f);
	const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM games g WHERE ${w.sql}`, w.params);
	return Number(n);
}

export async function sheepStats(f: Filters) {
	const j = eventsJoin(f);
	const games = await gameCount(f);
	const byKind = await q(
		`SELECT ${jstr("kind")} AS kind, ${jstr("source")} AS source, COUNT(*) AS n, AVG(${jnum("points")}) AS avg_points
		FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built' GROUP BY kind, source ORDER BY n DESC`,
		j.params,
	);
	const colors = await q(
		`SELECT color, COUNT(*) AS n FROM (
			SELECT ${jstr("headColor")} AS color FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built'
			UNION ALL SELECT ${jstr("buttColor")} FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built'
			UNION ALL SELECT ${jstr("extraColor")} FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built'
		) c WHERE color IS NOT NULL AND color <> 'null' GROUP BY color ORDER BY n DESC`,
		[...j.params, ...j.params, ...j.params],
	);
	const modifiers = await q(
		`SELECT COALESCE(NULLIF(${jstr("modifier")}, 'null'), 'none') AS modifier, COUNT(*) AS n
		FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built' GROUP BY modifier ORDER BY n DESC`,
		j.params,
	);
	const byTurn = await q(
		`SELECT FLOOR(e.turn / 5) * 5 AS bucket, COUNT(*) AS n
		FROM ${j.from} WHERE ${j.where} AND e.type = 'sheep_built' GROUP BY bucket ORDER BY bucket`,
		j.params,
	);
	const w = gameWhere(f);
	const [finalField] = await q(
		`SELECT AVG(p.sheep_count) AS sheep, AVG(p.basic) AS basic, AVG(p.half_rainbow) AS half_rainbow,
			AVG(p.full_rainbow) AS full_rainbow, AVG(p.painted) AS painted,
			AVG(p.franken_heads) AS franken_heads, AVG(p.franken_butts) AS franken_butts,
			AVG(p.field_points) AS field_points
		FROM game_players p JOIN games g ON g.id = p.game_id WHERE ${w.sql}`,
		w.params,
	);
	return { games, byKind, colors, modifiers, byTurn, finalField };
}

export async function actionStats(f: Filters) {
	const j = eventsJoin(f);
	const games = await gameCount(f);
	const actions = await q(
		`SELECT ${jstr("action")} AS action, COUNT(*) AS n, AVG(${jnum("points")}) AS avg_points,
			AVG(${jnum("cards")}) AS avg_cards
		FROM ${j.from} WHERE ${j.where} AND e.type = 'action' GROUP BY action ORDER BY n DESC`,
		j.params,
	);
	const actionTargets = await q(
		`SELECT ${jstr("action")} AS action, ${jstr("kind")} AS kind, COUNT(*) AS n
		FROM ${j.from} WHERE ${j.where} AND e.type = 'action' AND ${jstr("action")} IN ('wheat', 'wolf')
		GROUP BY action, kind ORDER BY n DESC`,
		j.params,
	);
	const bodyswaps = await q(
		`SELECT ${jstr("fromKind")} AS from_kind, ${jstr("toKind")} AS to_kind,
			SUM(${jbool("ownSheep")}) AS own, COUNT(*) AS n
		FROM ${j.from} WHERE ${j.where} AND e.type = 'bodyswap' GROUP BY from_kind, to_kind ORDER BY n DESC`,
		j.params,
	);
	const [discards] = await q(
		`SELECT COUNT(*) AS n, AVG(${jnum("count")}) AS avg_cards, SUM(${jnum("count")}) AS total_cards
		FROM ${j.from} WHERE ${j.where} AND e.type = 'discard'`,
		j.params,
	);
	// Card kinds are only on discard events recorded after they were added - count those games separately
	const [discardedCards] = await q(
		`SELECT COUNT(DISTINCT CASE WHEN ${jnum("head")} IS NOT NULL THEN e.game_id END) AS games,
			${DISCARD_KINDS.map((k) => `SUM(${jnum(k)}) AS ${k}`).join(", ")}
		FROM ${j.from} WHERE ${j.where} AND e.type = 'discard'`,
		j.params,
	);
	const byTurn = await q(
		`SELECT FLOOR(e.turn / 5) * 5 AS bucket, ${jstr("action")} AS action, COUNT(*) AS n
		FROM ${j.from} WHERE ${j.where} AND e.type = 'action' GROUP BY bucket, action ORDER BY bucket`,
		j.params,
	);
	return { games, actions, actionTargets, bodyswaps, discards, discardedCards, byTurn };
}

export async function challengeStats(f: Filters) {
	const j = eventsJoin(f);
	const games = await gameCount(f);
	const byType = await q(
		`SELECT ${jstr("challenge")} AS challenge, COUNT(*) AS resolved,
			AVG(${jbool("challengerWon")}) AS challenger_win_rate,
			AVG(${jnum("flips")}) AS avg_flips, AVG(${jnum("count")}) AS avg_affected, AVG(${jnum("points")}) AS avg_points
		FROM ${j.from} WHERE ${j.where} AND e.type = 'challenge_resolved' GROUP BY challenge ORDER BY resolved DESC`,
		j.params,
	);
	const played = await q(
		`SELECT ${jstr("challenge")} AS challenge, COUNT(*) AS played,
			AVG(${jnum("targetPoints")} >= ${jnum("challengerPoints")}) AS targeted_leader_rate
		FROM ${j.from} WHERE ${j.where} AND e.type = 'challenge_played' GROUP BY challenge`,
		j.params,
	);
	const [flips] = await q(
		`SELECT COUNT(*) AS flips,
			AVG(${jstr("flip")} = 'heads') AS heads_rate,
			AVG(${jstr("guess")} = 'heads') AS guess_heads_rate,
			AVG(CASE WHEN NOT ${jbool("reflip")} THEN ${jbool("challengerWon")} END) AS first_flip_challenger_win_rate,
			SUM(${jbool("reflip")}) AS reflips,
			AVG(CASE WHEN ${jbool("reflip")} THEN ${jbool("reflipChangedOutcome")} END) AS reflip_changed_rate
		FROM ${j.from} WHERE ${j.where} AND e.type = 'coin_flip'`,
		j.params,
	);
	const reflipBy = await q(
		`SELECT ${jstr("reflipBy")} AS reflip_by, COUNT(*) AS n, AVG(${jbool("reflipChangedOutcome")}) AS changed_rate
		FROM ${j.from} WHERE ${j.where} AND e.type = 'coin_flip' AND ${jbool("reflip")} GROUP BY reflip_by`,
		j.params,
	);
	const w = gameWhere(f);
	const [penalty] = await q(
		`SELECT AVG(p.challenge_penalty) AS avg_penalty, AVG(p.challenge_penalty > 0) AS penalised_rate,
			AVG(CASE WHEN p.challenge_penalty > 0 THEN p.is_winner END) AS penalised_win_rate
		FROM game_players p JOIN games g ON g.id = p.game_id WHERE ${w.sql} AND g.status = 'completed'`,
		w.params,
	);
	return { games, byType, played, flips, reflipBy, penalty };
}

export async function seatStats(f: Filters) {
	const w = gameWhere({ ...f, status: "completed" });
	const bySeat = await q(
		`SELECT g.player_count AS players, p.seat, COUNT(*) AS n, AVG(p.is_winner) AS win_rate,
			AVG(p.score) AS avg_score, AVG(p.placement) AS avg_placement
		FROM game_players p JOIN games g ON g.id = p.game_id WHERE ${w.sql}
		GROUP BY g.player_count, p.seat ORDER BY g.player_count, p.seat`,
		w.params,
	);
	const byType = await q(
		`SELECT CASE WHEN p.is_bot THEN 'bot' WHEN p.was_replaced THEN 'replaced human' ELSE 'human' END AS kind,
			COUNT(*) AS n, AVG(p.is_winner) AS win_rate, AVG(p.score) AS avg_score, AVG(p.placement) AS avg_placement,
			AVG(p.sheep_built) AS avg_sheep_built, AVG(p.actions_played) AS avg_actions,
			AVG(p.challenges_played) AS avg_challenges
		FROM game_players p JOIN games g ON g.id = p.game_id WHERE ${w.sql} GROUP BY kind ORDER BY n DESC`,
		w.params,
	);
	const scores = await q(
		`SELECT p.score, COUNT(*) AS n FROM game_players p JOIN games g ON g.id = p.game_id
		WHERE ${w.sql} GROUP BY p.score ORDER BY p.score`,
		w.params,
	);
	const margin = await q(
		`SELECT margin, COUNT(*) AS n FROM (
			SELECT g.id, MAX(p.score) - (
				SELECT p2.score FROM game_players p2 WHERE p2.game_id = g.id ORDER BY p2.score DESC LIMIT 1 OFFSET 1
			) AS margin
			FROM games g JOIN game_players p ON p.game_id = g.id WHERE ${w.sql} GROUP BY g.id
		) m GROUP BY margin ORDER BY margin`,
		w.params,
	);
	const [targeting] = await q(
		`SELECT AVG(p.times_targeted) AS avg_times_targeted,
			AVG(CASE WHEN p.is_winner THEN p.times_targeted END) AS winner_times_targeted,
			AVG(CASE WHEN NOT p.is_winner THEN p.times_targeted END) AS loser_times_targeted
		FROM game_players p JOIN games g ON g.id = p.game_id WHERE ${w.sql}`,
		w.params,
	);
	return { bySeat, byType, scores, margin, targeting };
}

// --- Explorer: builds a GROUP BY query from whitelisted parts only ---

function findField(list: FieldDef[], key: string | undefined) {
	return key ? list.find((f) => f.key === key) : undefined;
}

function sharedDimension(key: string): string | null {
	switch (key) {
		case "g.player_count":
			return "g.player_count";
		case "g.status":
			return "g.status";
		case "g.has_bots":
			return "(g.bot_count > 0)";
		case "g.packs":
			return "g.packs";
		case "g.has_expansion":
			return "(g.packs <> 'base')";
		case "g.day":
			return "DATE_FORMAT(g.started_at, '%Y-%m-%d')";
		case "g.week":
			return "DATE_FORMAT(g.started_at, '%x-W%v')";
		case "g.hour":
			return "HOUR(g.started_at)";
		case "g.weekday":
			return "CONCAT(WEEKDAY(g.started_at) + 1, ' ', LEFT(DAYNAME(g.started_at), 3))";
	}
	return null;
}

function eventExpr(key: string, eventType: EventTypeName | "" | undefined, forMetric: boolean): string {
	const dim = EVENT_DIMENSIONS.find((d) => d.key === key);
	if (dim) {
		if (key === "turn_bucket") return "FLOOR(e.turn / 5) * 5";
		if (key === "minute") return "FLOOR(e.t_ms / 60000)";
		return `e.${key}`;
	}
	const fields = eventType ? EVENT_FIELDS[eventType] : Object.values(EVENT_FIELDS).flat();
	const field = fields.find((f) => `data.${f.key}` === key);
	if (!field) throw new HttpError(400, `Unknown field: ${key}`);
	if (field.kind === "num") return jnum(field.key);
	if (field.kind === "bool") return forMetric ? jbool(field.key) : jstr(field.key);
	return jstr(field.key);
}

function columnExpr(source: "games" | "players", key: string): string {
	if (source === "games") {
		if (!findField(GAME_COLUMNS, key)) throw new HttpError(400, `Unknown column: ${key}`);
		return key === "duration_min" ? "ROUND(g.duration_ms / 60000)" : `g.${key}`;
	}
	if (!findField(PLAYER_COLUMNS, key)) throw new HttpError(400, `Unknown column: ${key}`);
	return `p.${key}`;
}

function resolveExpr(query: ExploreQuery, key: string, forMetric = false): string {
	const shared = sharedDimension(key);
	if (shared) return shared;
	if (query.source === "events") return eventExpr(key, query.eventType, forMetric);
	if (query.source === "players" && key.startsWith("g.")) return columnExpr("games", key.slice(2));
	return columnExpr(query.source, key);
}

export async function explore(f: Filters, query: ExploreQuery) {
	if (!["events", "games", "players"].includes(query.source)) throw new HttpError(400, "Bad source");
	if (query.eventType && !EVENT_TYPES.includes(query.eventType)) throw new HttpError(400, "Bad event type");

	const w = gameWhere(f);
	const params: unknown[] = [];
	let from: string;
	const where: string[] = [w.sql];
	params.push(...w.params);

	if (query.source === "events") {
		from = "game_events e JOIN games g ON g.id = e.game_id";
		if (query.eventType) {
			where.push("e.type = ?");
			params.push(query.eventType);
		}
	} else if (query.source === "players") {
		from = "game_players p JOIN games g ON g.id = p.game_id";
	} else {
		from = "games g";
	}

	for (const cond of query.where ?? []) {
		if (!cond.field) continue;
		where.push(`${resolveExpr(query, cond.field)} = ?`);
		params.push(cond.value);
	}

	const groupExpr = resolveExpr(query, query.groupBy);
	const splitExpr = query.splitBy ? resolveExpr(query, query.splitBy) : null;

	let metricExpr: string;
	switch (query.metric) {
		case "count":
			metricExpr = "COUNT(*)";
			break;
		case "games":
			metricExpr = "COUNT(DISTINCT g.id)";
			break;
		case "avg":
		case "sum":
		case "min":
		case "max":
		case "pct_true": {
			if (!query.metricField) throw new HttpError(400, "Pick a field for this metric");
			const expr = resolveExpr(query, query.metricField, true);
			metricExpr =
				query.metric === "pct_true" ? `AVG(${expr}) * 100` : `${query.metric.toUpperCase()}(${expr})`;
			break;
		}
		default:
			throw new HttpError(400, "Bad metric");
	}

	const sql = `SELECT ${groupExpr} AS grp${splitExpr ? `, ${splitExpr} AS split` : ""},
		${metricExpr} AS value, COUNT(*) AS n
		FROM ${from} WHERE ${where.join(" AND ")}
		GROUP BY grp${splitExpr ? ", split" : ""} ORDER BY grp${splitExpr ? ", split" : ""} LIMIT 2000`;
	const rows = await q<{ grp: unknown; split?: unknown; value: unknown; n: unknown }>(sql, params);
	// Stored pack lists ("base,expansion1") read better as pack names
	const label = (key: string | undefined, v: unknown) =>
		v === null ? "(none)" : key === "g.packs" ? packsLabel(String(v)) : String(v);
	return {
		rows: rows.map((r) => ({
			group: label(query.groupBy, r.grp),
			split: splitExpr ? label(query.splitBy, r.split) : undefined,
			value: num(r.value),
			n: Number(r.n),
		})),
		sql,
	};
}
