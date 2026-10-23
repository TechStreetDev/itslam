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

// Records a successful Discord login. Failures are logged, never thrown - a
// broken history table shouldn't stop anyone logging in.
export async function recordLogin(user: SessionUser, isAdmin: boolean): Promise<void> {
	if (!db) return;
	try {
		// Timestamps come from Node so they match how the rest of the app stores dates (UTC)
		await db.query("INSERT INTO logins (discord_id, username, avatar, is_admin, created_at) VALUES (?, ?, ?, ?, ?)", [
			user.id,
			user.username.slice(0, 100),
			user.avatar,
			isAdmin,
			new Date(),
		]);
	} catch (e) {
		console.error("[MySQL] recordLogin failed:", (e as Error).message);
	}
}
