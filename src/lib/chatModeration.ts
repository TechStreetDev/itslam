import { db } from "./db";
import { HttpError } from "./analytics";
import type { DiscordProfile } from "./roles";
import type { ChatMessage, ReportReason } from "./types";

// A chat message as the server keeps it: who sent typed messages stays here and is
// never sent to other players - only admins see it, through reports
export interface ChatRecord extends ChatMessage {
	discordId?: string;
	discordName?: string;
}

// What players get - strips who's behind each message
export function publicChat(m: ChatRecord): ChatMessage {
	const { discordId: _id, discordName: _name, ...msg } = m;
	return msg;
}

// Reports are personal data - keep them only as long as the privacy policy says
export const REPORT_RETENTION_DAYS = 180;

// --- Mutes (cached in memory - checked on every typed message) ---

interface Mute {
	until: number | null; // ms since epoch, null = permanent
}

let mutes = new Map<string, Mute>();
const muteListeners = new Set<(discordId: string) => void>();

// Lets the socket server tell a muted player's open game straight away
export function onMuteChange(listener: (discordId: string) => void) {
	muteListeners.add(listener);
}

export async function initMutes(): Promise<void> {
	if (!db) return;
	const [rows] = await db.query(
		"SELECT discord_id, muted_until FROM chat_mutes WHERE muted_until IS NULL OR muted_until > ?",
		[new Date()],
	);
	mutes = new Map(
		(rows as { discord_id: string; muted_until: Date | null }[]).map((r) => [
			r.discord_id,
			{ until: r.muted_until ? r.muted_until.getTime() : null },
		]),
	);
}

export function muteOf(discordId: string | null | undefined): Mute | null {
	if (!discordId) return null;
	const m = mutes.get(discordId);
	if (!m) return null;
	if (m.until !== null && m.until <= Date.now()) {
		mutes.delete(discordId);
		return null;
	}
	return m;
}

export interface MuteEntry {
	user: DiscordProfile;
	until: string | null;
	reason: string | null;
	mutedBy: DiscordProfile;
	createdAt: string;
}

export async function listMutes(): Promise<MuteEntry[]> {
	if (!db) return [];
	const [rows] = await db.query(
		`SELECT m.discord_id, m.username, m.muted_until, m.reason, m.muted_by, m.created_at,
			r.username AS by_username, r.avatar AS by_avatar
		FROM chat_mutes m LEFT JOIN user_roles r ON r.discord_id = m.muted_by
		WHERE m.muted_until IS NULL OR m.muted_until > ?
		ORDER BY m.created_at DESC`,
		[new Date()],
	);
	return (rows as any[]).map((r) => ({
		user: { id: r.discord_id, username: r.username, avatar: null },
		until: r.muted_until ? r.muted_until.toISOString() : null,
		reason: r.reason,
		mutedBy: { id: r.muted_by, username: r.by_username, avatar: r.by_avatar },
		createdAt: r.created_at.toISOString(),
	}));
}

// minutes: null for a permanent mute
export async function setMute(
	discordId: string,
	minutes: number | null,
	reason: string | null,
	username: string | null,
	by: string,
): Promise<void> {
	if (!db) throw new HttpError(503, "Database is not configured");
	if (!/^\d{15,22}$/.test(discordId)) throw new HttpError(400, "That doesn't look like a Discord user ID");
	if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0))
		throw new HttpError(400, "Pick how long to mute for");
	const until = minutes === null ? null : new Date(Date.now() + minutes * 60_000);
	await db.query(
		`INSERT INTO chat_mutes (discord_id, username, muted_until, reason, muted_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE username = COALESCE(VALUES(username), username),
			muted_until = VALUES(muted_until), reason = VALUES(reason),
			muted_by = VALUES(muted_by), created_at = VALUES(created_at)`,
		[discordId, username?.slice(0, 100) ?? null, until, reason?.slice(0, 500) || null, by, new Date()],
	);
	mutes.set(discordId, { until: until ? until.getTime() : null });
	muteListeners.forEach((l) => l(discordId));
}

export async function removeMute(discordId: string): Promise<void> {
	if (!db) throw new HttpError(503, "Database is not configured");
	await db.query("DELETE FROM chat_mutes WHERE discord_id = ?", [discordId]);
	mutes.delete(discordId);
	muteListeners.forEach((l) => l(discordId));
}

// --- Reports ---

export async function createReport(r: {
	reason: ReportReason;
	details: string | null;
	lobbyCode: string;
	message: ChatRecord & { discordId: string };
	reporterDiscordId: string | null;
	reporterName: string;
	context: ChatRecord[];
}): Promise<void> {
	if (!db) throw new Error("Reporting isn't available right now.");
	await db.query(
		`INSERT INTO chat_reports (created_at, reason, details, lobby_code, message_id, message_text,
			reported_discord_id, reported_name, reported_username, reporter_discord_id, reporter_name, context)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			new Date(),
			r.reason,
			r.details,
			r.lobbyCode,
			r.message.id,
			r.message.text.slice(0, 255),
			r.message.discordId,
			r.message.name.slice(0, 100),
			r.message.discordName?.slice(0, 100) ?? null,
			r.reporterDiscordId,
			r.reporterName.slice(0, 100),
			JSON.stringify(r.context),
		],
	);
}

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface ReportSummary {
	id: number;
	createdAt: string;
	status: ReportStatus;
	reason: ReportReason;
	messageText: string;
	reported: DiscordProfile & { name: string };
	reporterName: string;
}

export interface ReportDetail extends ReportSummary {
	details: string | null;
	lobbyCode: string;
	messageId: string;
	reporterDiscordId: string | null;
	context: ChatRecord[];
	resolvedBy: DiscordProfile | null;
	resolvedAt: string | null;
	resolutionNote: string | null;
	// Every report against this player, including this one
	reportsAgainst: number;
	mute: MuteEntry | null;
}

function summary(r: any): ReportSummary {
	return {
		id: r.id,
		createdAt: r.created_at.toISOString(),
		status: r.status,
		reason: r.reason,
		messageText: r.message_text,
		reported: { id: r.reported_discord_id, username: r.reported_username, avatar: null, name: r.reported_name },
		reporterName: r.reporter_name,
	};
}

export async function listReports(status: string, page: number, pageSize = 25) {
	if (!db) return { entries: [] as ReportSummary[], total: 0, page, pageSize, open: 0 };
	const where = status === "all" ? "" : "WHERE status = ?";
	const args = status === "all" ? [] : [status];
	const [rows] = await db.query(
		`SELECT id, created_at, status, reason, message_text, reported_discord_id, reported_name, reported_username, reporter_name
		FROM chat_reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		[...args, pageSize, page * pageSize],
	);
	const [[{ total }]] = (await db.query(`SELECT COUNT(*) AS total FROM chat_reports ${where}`, args)) as any;
	const [[{ open }]] = (await db.query("SELECT COUNT(*) AS open FROM chat_reports WHERE status = 'open'")) as any;
	return { entries: (rows as any[]).map(summary), total: Number(total), page, pageSize, open: Number(open) };
}

export async function reportDetail(id: number): Promise<ReportDetail> {
	if (!db) throw new HttpError(503, "Database is not configured");
	const [rows] = await db.query(
		`SELECT c.*, r.username AS by_username, r.avatar AS by_avatar
		FROM chat_reports c LEFT JOIN user_roles r ON r.discord_id = c.resolved_by
		WHERE c.id = ?`,
		[id],
	);
	const r = (rows as any[])[0];
	if (!r) throw new HttpError(404, "Report not found");
	const [[{ count }]] = (await db.query(
		"SELECT COUNT(*) AS count FROM chat_reports WHERE reported_discord_id = ?",
		[r.reported_discord_id],
	)) as any;
	const mute = (await listMutes()).find((m) => m.user.id === r.reported_discord_id) ?? null;
	return {
		...summary(r),
		details: r.details,
		lobbyCode: r.lobby_code,
		messageId: r.message_id,
		reporterDiscordId: r.reporter_discord_id,
		// mysql2 parses JSON columns already
		context: typeof r.context === "string" ? JSON.parse(r.context) : r.context,
		resolvedBy: r.resolved_by ? { id: r.resolved_by, username: r.by_username, avatar: r.by_avatar } : null,
		resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
		resolutionNote: r.resolution_note,
		reportsAgainst: Number(count),
		mute,
	};
}

export async function setReportStatus(id: number, status: ReportStatus, note: string | null, by: string) {
	if (!db) throw new HttpError(503, "Database is not configured");
	if (!["open", "resolved", "dismissed"].includes(status)) throw new HttpError(400, "Unknown status");
	const reopened = status === "open";
	await db.query(
		"UPDATE chat_reports SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE id = ?",
		[status, reopened ? null : by, reopened ? null : new Date(), reopened ? null : note?.slice(0, 500) || null, id],
	);
}

export async function pruneReports(): Promise<void> {
	if (!db) return;
	try {
		const cutoff = new Date(Date.now() - REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
		await db.query("DELETE FROM chat_reports WHERE created_at < ?", [cutoff]);
		await db.query("DELETE FROM chat_mutes WHERE muted_until IS NOT NULL AND muted_until < ?", [new Date()]);
	} catch (e) {
		console.error("[MySQL] pruneReports failed:", (e as Error).message);
	}
}
