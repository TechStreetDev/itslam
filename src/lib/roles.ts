import { db } from "./db";
import type { SessionUser } from "./auth";
import { Permission, Role, permissionsFor, withLowerRoles } from "./roleDefs";

// IDs listed in ADMIN_DISCORD_IDS are always admins (so you can't lock yourself
// out) and are seeded into the database. Everyone else is managed from /admin.
let dbRoles = new Map<string, Role[]>();

function envAdminIds(): Set<string> {
	return new Set(
		(process.env.ADMIN_DISCORD_IDS || "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);
}

export interface DiscordProfile {
	id: string;
	username: string | null;
	avatar: string | null;
}

export interface RoleEntry {
	user: DiscordProfile;
	roles: Role[];
	addedBy: DiscordProfile | null;
	createdAt: string | null;
	lastLoginAt: string | null;
	fromEnv: boolean;
}

// MySQL returns SET columns as a comma-separated string
function parseRoles(raw: string | null): Role[] {
	return withLowerRoles((raw || "").split(","));
}

async function refresh(): Promise<void> {
	if (!db) return;
	const [rows] = await db.query("SELECT discord_id, roles FROM user_roles");
	dbRoles = new Map((rows as { discord_id: string; roles: string }[]).map((r) => [r.discord_id, parseRoles(r.roles)]));
}

export async function initRoles(): Promise<void> {
	if (!db) return;
	const envIds = [...envAdminIds()];
	if (envIds.length > 0) {
		await db.query("INSERT IGNORE INTO user_roles (discord_id, roles) VALUES ?", [
			envIds.map((id) => [id, "admin"]),
		]);
	}
	await refresh();
}

export function rolesOf(discordId: string | null | undefined): Role[] {
	if (!discordId) return [];
	const roles: string[] = [...(dbRoles.get(discordId) ?? [])];
	if (envAdminIds().has(discordId)) roles.push("admin");
	return withLowerRoles(roles);
}

export function can(user: SessionUser | null | undefined, permission: Permission): boolean {
	return !!user && permissionsFor(rolesOf(user.id)).includes(permission);
}

// Keeps a role holder's cached Discord name/avatar up to date. Only people with a
// role are stored, so this is a no-op for everyone else.
export async function touchRoleProfile(user: SessionUser): Promise<void> {
	if (!db) return;
	try {
		await db.query("UPDATE user_roles SET username = ?, avatar = ?, last_login_at = ? WHERE discord_id = ?", [
			user.username.slice(0, 100),
			user.avatar,
			new Date(),
			user.id,
		]);
	} catch (e) {
		console.error("[MySQL] touchRoleProfile failed:", (e as Error).message);
	}
}

type RoleRow = {
	discord_id: string;
	roles: string;
	username: string | null;
	avatar: string | null;
	last_login_at: Date | null;
	added_by: string | null;
	created_at: Date;
	by_username: string | null;
	by_avatar: string | null;
};

export async function listRoles(): Promise<RoleEntry[]> {
	const envIds = envAdminIds();
	if (!db) {
		return [...envIds].map((id) => ({
			user: { id, username: null, avatar: null },
			roles: ["admin"],
			addedBy: null,
			createdAt: null,
			lastLoginAt: null,
			fromEnv: true,
		}));
	}
	const [rows] = await db.query(
		`SELECT r.discord_id, r.roles, r.username, r.avatar, r.last_login_at, r.added_by, r.created_at,
			b.username AS by_username, b.avatar AS by_avatar
		FROM user_roles r LEFT JOIN user_roles b ON b.discord_id = r.added_by
		ORDER BY r.created_at`,
	);
	return (rows as RoleRow[]).map((r) => ({
		user: { id: r.discord_id, username: r.username, avatar: r.avatar },
		roles: rolesOf(r.discord_id),
		addedBy: r.added_by ? { id: r.added_by, username: r.by_username, avatar: r.by_avatar } : null,
		createdAt: r.created_at.toISOString(),
		lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
		fromEnv: envIds.has(r.discord_id),
	}));
}

// Gives someone exactly these roles. An empty list removes them entirely.
export async function setRoles(discordId: string, roles: string[], by: string): Promise<void> {
	if (!db) throw new Error("Database is not configured");
	if (!/^\d{15,22}$/.test(discordId)) throw new Error("That doesn't look like a Discord user ID");
	const next = withLowerRoles(roles);
	const fromEnv = envAdminIds().has(discordId);
	if (fromEnv && !next.includes("admin"))
		throw new Error("This admin comes from ADMIN_DISCORD_IDS - remove them there instead");
	if (discordId === by && !next.includes("admin")) throw new Error("You can't remove your own admin role");

	if (next.length === 0) {
		await db.query("DELETE FROM user_roles WHERE discord_id = ?", [discordId]);
	} else {
		await db.query(
			`INSERT INTO user_roles (discord_id, roles, added_by) VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE roles = VALUES(roles)`,
			[discordId, next.join(","), by],
		);
		// Fill in their name/avatar straight away if they've logged in recently
		await db.query(
			`UPDATE user_roles r
			JOIN logins l ON l.id = (SELECT MAX(l2.id) FROM logins l2 WHERE l2.discord_id = r.discord_id)
			SET r.username = l.username, r.avatar = l.avatar, r.last_login_at = l.created_at
			WHERE r.discord_id = ? AND r.username IS NULL`,
			[discordId],
		);
	}
	await refresh();
}
