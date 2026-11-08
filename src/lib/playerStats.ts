import type { IncomingMessage, ServerResponse } from "http";
import type { SessionUser } from "./auth";
import { db } from "./db";
import { sendJson } from "./adminApi";
import { listRoles, rolesOf } from "./roles";
import { ROLES, Role } from "./roleDefs";

type Row = Record<string, any>;

const HISTORY_PAGE_SIZE = 4;

async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
	const [rows] = await db!.query(sql, params);
	return rows as T[];
}

// Lifetime totals for one Discord account. Only finished games count - unfinished ones
// still show in the history, but can't be won or lost.
export async function playerSummary(discordId: string) {
	const [totals] = await q(
		`SELECT COUNT(*) AS games, SUM(p.is_winner) AS wins, MAX(p.score) AS best_score
		FROM game_players p JOIN games g ON g.id = p.game_id
		WHERE p.discord_id = ? AND g.status = 'completed'`,
		[discordId],
	);
	return { games: Number(totals.games), wins: Number(totals.wins ?? 0), bestScore: totals.best_score ?? null };
}

// One page of a player's games, newest first, with everyone's result in each.
// Other players are shown by name only if they were signed in - never by account ID.
export async function playerHistory(discordId: string, page: number) {
	const [{ total }] = await q<{ total: number }>(
		"SELECT COUNT(*) AS total FROM game_players WHERE discord_id = ?",
		[discordId],
	);
	const games = await q(
		`SELECT g.id, g.status, g.started_at, g.duration_ms, g.player_count, g.packs, g.source, g.turns,
			p.seat, p.score, p.placement, p.is_winner, p.was_replaced
		FROM game_players p JOIN games g ON g.id = p.game_id
		WHERE p.discord_id = ?
		ORDER BY g.started_at DESC LIMIT ? OFFSET ?`,
		[discordId, HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE],
	);
	const ids = games.map((g) => g.id);
	const seats = ids.length
		? await q(
				`SELECT game_id, seat, is_bot, was_replaced, username, score, placement, is_winner
				FROM game_players WHERE game_id IN (?) ORDER BY seat`,
				[ids],
			)
		: [];
	const rows = games.map((g) => ({
		...g,
		players: seats
			.filter((s) => s.game_id === g.id)
			.map(({ game_id: _id, ...s }) => ({ ...s, you: s.seat === g.seat })),
	}));
	return { total: Number(total), page, pageSize: HISTORY_PAGE_SIZE, rows };
}

// --- Admin: everyone who has logged in or been given a role ---

// Spelled out in full - the bare aliases would be ambiguous with the joined tables' columns
const LAST_LOGIN = "COALESCE(u.last_login_at, r.last_login_at)";
const USER_SORTS: Record<string, string> = {
	recent: `${LAST_LOGIN} IS NULL, ${LAST_LOGIN} DESC`,
	name: "COALESCE(u.username, r.username) IS NULL, COALESCE(u.username, r.username) ASC",
	games: `COALESCE(s.games, 0) DESC, ${LAST_LOGIN} DESC`,
	wins: "COALESCE(s.wins, 0) DESC, COALESCE(s.games, 0) DESC",
	win_rate: "s.wins / NULLIF(s.games, 0) DESC, COALESCE(s.games, 0) DESC",
	best_score: "s.best_score DESC",
	last_game: "s.last_game DESC",
};

// Same totals as playerSummary (finished games only), for every account at once
const USER_GAMES = `SELECT p.discord_id, COUNT(*) AS games, SUM(p.is_winner) AS wins, MAX(p.score) AS best_score,
		MAX(g.started_at) AS last_game
	FROM game_players p JOIN games g ON g.id = p.game_id
	WHERE p.discord_id IS NOT NULL AND g.status = 'completed'
	GROUP BY p.discord_id`;

// Logged-in players plus role holders who haven't logged in yet. Role holders' cached
// profile fills in for anyone missing from users.
const USER_FROM = `(SELECT discord_id FROM users UNION SELECT discord_id FROM user_roles) ids
	LEFT JOIN users u ON u.discord_id = ids.discord_id
	LEFT JOIN user_roles r ON r.discord_id = ids.discord_id`;
const USER_COLUMNS = `ids.discord_id, COALESCE(u.username, r.username) AS username, COALESCE(u.avatar, r.avatar) AS avatar,
	u.first_login_at, COALESCE(u.last_login_at, r.last_login_at) AS last_login_at`;

// role: "any" for anyone with a role, a role id for that role or higher, otherwise everyone
export async function listUsers(search: string, role: string, page: number, pageSize: number, sort: string) {
	const order = USER_SORTS[sort] ?? USER_SORTS.recent;
	const clauses: string[] = [];
	const params: unknown[] = [];
	const term = search.trim();
	if (term) {
		clauses.push("(COALESCE(u.username, r.username) LIKE ? OR ids.discord_id = ?)");
		params.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`, term);
	}
	if (role === "any") clauses.push("r.discord_id IS NOT NULL");
	else if ((ROLES as readonly string[]).includes(role)) {
		// Env admins are stored as just 'admin', so match the role or anything above it
		const atLeast = ROLES.slice(ROLES.indexOf(role as Role));
		clauses.push(`(${atLeast.map(() => "FIND_IN_SET(?, r.roles) > 0").join(" OR ")})`);
		params.push(...atLeast);
	}
	const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
	const [{ total }] = await q<{ total: number }>(`SELECT COUNT(*) AS total FROM ${USER_FROM} ${where}`, params);
	const rows = await q(
		`SELECT ${USER_COLUMNS}, COALESCE(s.games, 0) AS games, COALESCE(s.wins, 0) AS wins,
			s.wins / NULLIF(s.games, 0) AS win_rate, s.best_score, s.last_game
		FROM ${USER_FROM} LEFT JOIN (${USER_GAMES}) s ON s.discord_id = ids.discord_id
		${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
		[...params, pageSize, page * pageSize],
	);
	return {
		total: Number(total),
		page,
		pageSize,
		rows: rows.map((r) => ({ ...r, roles: rolesOf(r.discord_id) })),
	};
}

export async function userDetail(discordId: string) {
	const [user] = await q(
		`SELECT ${USER_COLUMNS} FROM ${USER_FROM} WHERE ids.discord_id = ?`,
		[discordId],
	);
	if (!user) return null;
	const [role] = await listRoles(discordId);
	return { user, stats: await playerSummary(discordId), role: role ?? null };
}

// Handles /api/me/stats and /api/me/games for the signed-in player. Returns false for other paths.
export async function handlePlayerStatsApi(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	user: SessionUser | null,
): Promise<boolean> {
	const path = url.pathname;
	if (path !== "/api/me/stats" && path !== "/api/me/games") return false;
	if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" }), true;
	if (!user) return sendJson(res, 401, { error: "Sign in with Discord to see your stats" }), true;
	if (!db) return sendJson(res, 503, { error: "Game history isn't enabled on this server" }), true;
	try {
		if (path === "/api/me/stats") sendJson(res, 200, await playerSummary(user.id));
		else {
			const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
			sendJson(res, 200, await playerHistory(user.id, page));
		}
	} catch (e) {
		console.error("[Player stats]", e);
		sendJson(res, 500, { error: "Couldn't load your stats" });
	}
	return true;
}
