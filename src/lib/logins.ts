import { db } from "./db";
import type { SessionUser } from "./auth";

// Login history is personal data - keep it only as long as the privacy policy says
export const LOGIN_RETENTION_DAYS = 90;

export async function pruneLogins(): Promise<void> {
	if (!db) return;
	try {
		const cutoff = new Date(Date.now() - LOGIN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
		await db.query("DELETE FROM logins WHERE created_at < ?", [cutoff]);
	} catch (e) {
		console.error("[MySQL] pruneLogins failed:", (e as Error).message);
	}
}

// Records a successful Discord login, and keeps the account's entry in `users` up to date.
// Failures are logged, never thrown - a broken history table shouldn't stop anyone logging in.
export async function recordLogin(user: SessionUser, isAdmin: boolean): Promise<void> {
	if (!db) return;
	try {
		// Timestamps come from Node so they match how the rest of the app stores dates (UTC)
		const now = new Date();
		const name = user.username.slice(0, 100);
		await db.query("INSERT INTO logins (discord_id, username, avatar, is_admin, created_at) VALUES (?, ?, ?, ?, ?)", [
			user.id,
			name,
			user.avatar,
			isAdmin,
			now,
		]);
		await db.query(
			`INSERT INTO users (discord_id, username, avatar, first_login_at, last_login_at) VALUES (?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE username = VALUES(username), avatar = VALUES(avatar), last_login_at = VALUES(last_login_at)`,
			[user.id, name, user.avatar, now, now],
		);
	} catch (e) {
		console.error("[MySQL] recordLogin failed:", (e as Error).message);
	}
}
