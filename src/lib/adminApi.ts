import type { IncomingMessage, ServerResponse } from "http";
import type { SessionUser } from "./auth";
import { can, listRoles, setRoles } from "./roles";
import { userAccess } from "./auth";
import { db } from "./db";
import {
	HttpError,
	parseFilters,
	overview,
	listGames,
	gameDetail,
	deleteGame,
	sheepStats,
	actionStats,
	challengeStats,
	seatStats,
	explore,
} from "./analytics";
import type { ExploreQuery } from "./analyticsSchema";
import { listMutes, listReports, removeMute, reportDetail, setMute, setReportStatus } from "./chatModeration";

const MAX_BODY = 64 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
	res.end(JSON.stringify(body));
}

export function readJson(req: IncomingMessage): Promise<any> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				reject(new HttpError(413, "Request too large"));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
			} catch {
				reject(new HttpError(400, "Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

// Handles everything under /api/admin/. Returns false if the path isn't an admin route.
export async function handleAdminApi(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	user: SessionUser | null,
	liveStats: () => Promise<unknown>,
): Promise<boolean> {
	const path = url.pathname;
	if (!path.startsWith("/api/admin/")) return false;

	if (!user) return sendJson(res, 401, { error: "Not logged in" }), true;
	if (!can(user, "view_stats") && !can(user, "moderate_chat")) return sendJson(res, 403, { error: "No access" }), true;

	const method = req.method || "GET";
	// Mutations need a custom header, which cross-site forms/fetches can't send without CORS approval
	if (method !== "GET" && req.headers["x-requested-with"] !== "itslam-admin")
		return sendJson(res, 403, { error: "Missing CSRF header" }), true;

	const filters = parseFilters(url.searchParams);
	const route = `${method} ${path}`;
	const gameMatch = path.match(/^\/api\/admin\/games\/(\d+)$/);
	const roleMatch = path.match(/^\/api\/admin\/roles\/(\d+)$/);
	// Viewers can read statistics; everything else needs the admin role
	const manageOnly =
		(gameMatch && method === "DELETE") ||
		route === "POST /api/admin/explore" ||
		path.startsWith("/api/admin/roles");
	if (manageOnly && !can(user, "manage")) return sendJson(res, 403, { error: "Admins only" }), true;
	const reportMatch = path.match(/^\/api\/admin\/reports\/(\d+)$/);
	const muteMatch = path.match(/^\/api\/admin\/mutes\/(\d+)$/);
	// Reports hold chat messages and who sent them - moderators only, not every stats viewer
	const moderation = path.startsWith("/api/admin/reports") || path.startsWith("/api/admin/mutes");
	if (moderation && !can(user, "moderate_chat")) return sendJson(res, 403, { error: "Moderators only" }), true;
	// Moderators can only reach the reports - everything else is statistics or management
	if (!moderation && route !== "GET /api/admin/status" && !can(user, "view_stats"))
		return sendJson(res, 403, { error: "No access" }), true;

	try {
		let body: unknown;
		if (route === "GET /api/admin/stats") body = await liveStats();
		else if (route === "GET /api/admin/status")
			body = { mysql: !!db, user: { ...user, ...userAccess(user) } };
		else if (route === "GET /api/admin/overview") body = await overview(filters);
		else if (route === "GET /api/admin/games") {
			const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
			const pageSize = Math.min(100, Math.max(5, parseInt(url.searchParams.get("pageSize") || "25", 10) || 25));
			body = await listGames(filters, page, pageSize, url.searchParams.get("sort") || "newest");
		} else if (gameMatch && method === "GET") body = await gameDetail(Number(gameMatch[1]));
		else if (gameMatch && method === "DELETE") {
			await deleteGame(Number(gameMatch[1]));
			body = { ok: true };
		} else if (route === "GET /api/admin/sheep") body = await sheepStats(filters);
		else if (route === "GET /api/admin/actions") body = await actionStats(filters);
		else if (route === "GET /api/admin/challenges") body = await challengeStats(filters);
		else if (route === "GET /api/admin/seats") body = await seatStats(filters);
		else if (route === "POST /api/admin/explore") body = await explore(filters, (await readJson(req)) as ExploreQuery);
		else if (route === "GET /api/admin/roles") body = await listRoles();
		else if (roleMatch && method === "PUT") {
			const { roles } = await readJson(req);
			if (!Array.isArray(roles)) throw new HttpError(400, "roles must be a list");
			await setRoles(roleMatch[1], roles.map(String), user.id);
			body = await listRoles();
		} else if (roleMatch && method === "DELETE") {
			await setRoles(roleMatch[1], [], user.id);
			body = await listRoles();
		} else if (route === "GET /api/admin/reports") {
			const status = url.searchParams.get("status") || "open";
			const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
			body = await listReports(status, page);
		} else if (reportMatch && method === "GET") body = await reportDetail(Number(reportMatch[1]));
		else if (reportMatch && method === "POST") {
			const { status, note } = await readJson(req);
			await setReportStatus(Number(reportMatch[1]), status, typeof note === "string" ? note : null, user.id);
			body = await reportDetail(Number(reportMatch[1]));
		} else if (route === "GET /api/admin/mutes") body = await listMutes();
		else if (muteMatch && method === "PUT") {
			// minutes: null for a permanent mute
			const { minutes, reason, username } = await readJson(req);
			await setMute(
				muteMatch[1],
				minutes === null ? null : Number(minutes),
				typeof reason === "string" ? reason : null,
				typeof username === "string" ? username : null,
				user.id,
			);
			body = await listMutes();
		} else if (muteMatch && method === "DELETE") {
			await removeMute(muteMatch[1]);
			body = await listMutes();
		} else return sendJson(res, 404, { error: "Not found" }), true;

		sendJson(res, 200, body);
	} catch (e) {
		if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
		else if (e instanceof Error && !(e as any).code) sendJson(res, 400, { error: e.message });
		else {
			console.error("[Admin API]", e);
			sendJson(res, 500, { error: (e as Error).message || "Internal error" });
		}
	}
	return true;
}
