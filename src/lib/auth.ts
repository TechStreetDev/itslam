import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { track } from "./stats";
import { can, rolesOf, touchRoleProfile } from "./roles";
import { permissionsFor } from "./roleDefs";
import { recordLogin } from "./logins";

const SESSION_COOKIE = "itslam_session";
const STATE_COOKIE = "itslam_oauth_state";
const SESSION_TTL_S = 7 * 24 * 60 * 60; // 7 days
const STATE_TTL_S = 10 * 60;

export interface SessionUser {
	id: string;
	username: string;
	avatar: string | null;
}

interface Session extends SessionUser {
	exp: number;
}

const secure = process.env.NODE_ENV === "production";

function sessionSecret(): string {
	const s = process.env.SESSION_SECRET;
	if (!s) throw new Error("SESSION_SECRET is not set");
	return s;
}

export function authConfigured(): boolean {
	return !!(
		process.env.DISCORD_CLIENT_ID &&
		process.env.DISCORD_CLIENT_SECRET &&
		process.env.SESSION_SECRET
	);
}

function redirectUri(): string {
	const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
	return `${base.replace(/\/$/, "")}/auth/discord/callback`;
}

export function isAdmin(user: SessionUser | null): boolean {
	return !!user && rolesOf(user.id).includes("admin");
}

// What the client is told about the logged-in user's access
export function userAccess(user: SessionUser) {
	const roles = rolesOf(user.id);
	return { roles, permissions: permissionsFor(roles), isAdmin: roles.includes("admin") };
}

// --- Signed cookie helpers ---

function sign(payload: string): string {
	return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(session: Session): string {
	const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
	return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string): Session | null {
	const [payload, sig] = value.split(".");
	if (!payload || !sig) return null;
	const expected = Buffer.from(sign(payload));
	const given = Buffer.from(sig);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	try {
		const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
		if (session.exp < Date.now() / 1000) return null;
		return session;
	} catch {
		return null;
	}
}

function parseCookies(req: IncomingMessage): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of (req.headers.cookie || "").split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		try {
			out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
		} catch {
			// ignore malformed cookie values
		}
	}
	return out;
}

function cookie(name: string, value: string, maxAge: number): string {
	return [
		`${name}=${encodeURIComponent(value)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${maxAge}`,
		secure ? "Secure" : "",
	]
		.filter(Boolean)
		.join("; ");
}

export function getSessionUser(req: IncomingMessage): SessionUser | null {
	if (!authConfigured()) return null;
	// Discord Activities send their session as a bearer token instead of a cookie
	const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
	const raw = bearer || parseCookies(req)[SESSION_COOKIE];
	if (!raw) return null;
	const session = decodeSession(raw);
	if (!session) return null;
	return { id: session.id, username: session.username, avatar: session.avatar };
}

function redirect(res: ServerResponse, location: string, cookies: string[] = []) {
	res.writeHead(302, { Location: location, "Set-Cookie": cookies });
	res.end();
}

// --- OAuth flow ---

// Trades an OAuth code for the Discord user. The Activity SDK flow has no redirect URI.
async function exchangeCode(code: string, redirect_uri?: string) {
	const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.DISCORD_CLIENT_ID!,
			client_secret: process.env.DISCORD_CLIENT_SECRET!,
			grant_type: "authorization_code",
			code,
			...(redirect_uri ? { redirect_uri } : {}),
		}),
	});
	if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
	const { access_token } = (await tokenRes.json()) as { access_token: string };

	const userRes = await fetch("https://discord.com/api/users/@me", {
		headers: { Authorization: `Bearer ${access_token}` },
	});
	if (!userRes.ok) throw new Error(`user fetch ${userRes.status}`);
	const user = (await userRes.json()) as {
		id: string;
		username: string;
		global_name?: string | null;
		avatar: string | null;
	};

	const session: Session = {
		id: user.id,
		username: user.global_name || user.username,
		avatar: user.avatar,
		exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
	};
	return { access_token, session };
}

async function recordSessionLogin(session: Session) {
	track("logins");
	await recordLogin(session, isAdmin(session));
	await touchRoleProfile(session);
}

export function startLogin(res: ServerResponse) {
	const state = randomBytes(16).toString("hex");
	const params = new URLSearchParams({
		client_id: process.env.DISCORD_CLIENT_ID!,
		redirect_uri: redirectUri(),
		response_type: "code",
		scope: "identify",
		state,
		prompt: "none",
	});
	redirect(res, `https://discord.com/oauth2/authorize?${params}`, [
		cookie(STATE_COOKIE, state, STATE_TTL_S),
	]);
}

export async function finishLogin(req: IncomingMessage, res: ServerResponse, url: URL) {
	const clearState = cookie(STATE_COOKIE, "", 0);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const expectedState = parseCookies(req)[STATE_COOKIE];
	if (!code || !state || !expectedState || state !== expectedState) {
		redirect(res, "/?login=failed", [clearState]);
		return;
	}

	try {
		const { session } = await exchangeCode(code, redirectUri());
		await recordSessionLogin(session);
		const dest = can(session, "view_stats") ? "/admin" : "/";
		redirect(res, dest, [clearState, cookie(SESSION_COOKIE, encodeSession(session), SESSION_TTL_S)]);
	} catch (e) {
		console.error("[Auth] Discord login failed:", (e as Error).message);
		redirect(res, "/?login=failed", [clearState]);
	}
}

// --- Discord Activity ---
// Activities run in an iframe on discordsays.com where our cookies don't reach, so the
// client holds the signed session itself and hands it to the socket on connect.

export async function activityLogin(code: string) {
	const { access_token, session } = await exchangeCode(code);
	await recordSessionLogin(session);
	const { exp: _exp, ...user } = session;
	return { access_token, token: encodeSession(session), user: { ...user, ...userAccess(user) } };
}

export function sessionFromToken(token: unknown): SessionUser | null {
	if (!authConfigured() || typeof token !== "string") return null;
	const session = decodeSession(token);
	if (!session) return null;
	return { id: session.id, username: session.username, avatar: session.avatar };
}

export function logout(res: ServerResponse) {
	redirect(res, "/", [cookie(SESSION_COOKIE, "", 0)]);
}
