import { redis } from "./redis";
import type { Lobby } from "./lobbyManager";
import { EXPANSION_PACKS, normalizePacks } from "./deck";

export type Counter = "lobbies_created" | "games_started" | "games_finished" | "logins";

const COUNTERS: Counter[] = ["lobbies_created", "games_started", "games_finished", "logins"];
const startedAt = Date.now();

// Fallback when Redis isn't configured - resets on restart
const memory: Record<Counter, number> = {
	lobbies_created: 0,
	games_started: 0,
	games_finished: 0,
	logins: 0,
};

export function track(counter: Counter): void {
	memory[counter]++;
	if (!redis) return;
	redis.incr(`stats:${counter}`).catch((e) => console.error("[Redis] stats incr failed:", e.message));
}

async function readCounters(): Promise<{ values: Record<Counter, number>; persistent: boolean }> {
	if (!redis) return { values: { ...memory }, persistent: false };
	try {
		const raw = await redis.mget(COUNTERS.map((c) => `stats:${c}`));
		const values = { ...memory };
		COUNTERS.forEach((c, i) => (values[c] = parseInt(raw[i] || "0", 10)));
		return { values, persistent: true };
	} catch {
		return { values: { ...memory }, persistent: false };
	}
}

export async function collectStats(lobbies: Lobby[], connectedSockets: number) {
	let players = 0;
	let humansOnline = 0;
	let bots = 0;
	let publicLobbies = 0;
	let gamesInProgress = 0;
	let expansionLobbies = 0;

	for (const lobby of lobbies) {
		if (lobby.isPublic) publicLobbies++;
		if (normalizePacks(lobby.packs).some((id) => EXPANSION_PACKS.includes(id))) expansionLobbies++;
		if (lobby.game?.started && !lobby.game.ended) gamesInProgress++;
		for (const p of lobby.players) {
			players++;
			if (p.isBot) bots++;
			else if (p.connected) humansOnline++;
		}
	}

	const { values, persistent } = await readCounters();
	const mem = process.memoryUsage();

	return {
		live: {
			connectedSockets,
			lobbies: lobbies.length,
			publicLobbies,
			expansionLobbies,
			gamesInProgress,
			players,
			humansOnline,
			bots,
		},
		totals: values,
		totalsPersistent: persistent,
		server: {
			uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
			memoryMb: Math.round(mem.rss / 1024 / 1024),
			node: process.version,
			redis: redis?.status ?? "disabled",
		},
		lobbies: lobbies.map((l) => ({
			code: l.code,
			isPublic: l.isPublic,
			source: l.activityId ? "discord" : "website",
			packs: normalizePacks(l.packs),
			players: l.players.length,
			humansOnline: l.players.filter((p) => !p.isBot && p.connected).length,
			bots: l.players.filter((p) => p.isBot).length,
			status: !l.game ? "lobby" : l.game.ended ? "ended" : "playing",
			createdAt: l.createdAt,
		})),
	};
}

export type AdminStats = Awaited<ReturnType<typeof collectStats>>;
