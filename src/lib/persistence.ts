import { redis } from "./redis";
import { Lobby } from "./lobbyManager";

const LOBBY_TTL = 7200; // 2 hours

function stripSockets(lobby: Lobby): Lobby {
	return {
		...lobby,
		players: lobby.players.map((p) => ({
			...p, socketId: null,
			connected: false
		})),
	};
}

export async function saveLobby(lobby: Lobby): Promise<void> {
	if (!redis) return;
	
	try {
		await redis.set(`lobby:${lobby.code}`, JSON.stringify(stripSockets(lobby)), "EX", LOBBY_TTL);
	} catch (e) {
		console.error("[Redis] saveLobby failed:", (e as Error).message);
	}
}

export async function deleteLobby(code: string): Promise<void> {
	if (!redis) return;
	try {
		await redis.del(`lobby:${code}`);
	} catch (e) {
		console.error("[Redis] deleteLobby failed:", (e as Error).message);
	}
}

export async function loadAllLobbies(): Promise<Lobby[]> {
	if (!redis) return [];

	try {
		const keys = await redis.keys("lobby:*");
		if (!keys.length) return [];

		return (await redis.mget(...keys))
			.filter((v): v is string => v !== null)
			.map((v) => JSON.parse(v) as Lobby)
			.filter((l) => !l.game?.ended);
	} catch (e) {
		console.error("[Redis] loadAllLobbies failed:", (e as Error).message);
		return [];
	}
}
