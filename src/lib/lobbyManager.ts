import * as engine from "./engine";
import type { ChatRecord } from "./chatModeration";
import { PACKS, normalizePacks } from "./deck";
import { discordPlayerName as baseDiscordName } from "./playerName";
import {
	DEFAULT_RECONNECT_SECONDS,
	DEFAULT_TURN_SECONDS,
	GameState,
	GameView,
	LobbyView,
	LobbiesPage,
	MAX_PLAYERS,
	PackId,
	PlayerView,
	PublicLobbyEntry,
	RECONNECT_SECONDS_OPTIONS,
	TURN_SECONDS_OPTIONS,
} from "./types";

export interface LobbyPlayer {
	id: string;
	name: string;
	socketId: string | null;
	connected: boolean;
	isBot?: boolean;
	isReplacement?: boolean; // true when a human was swapped for a bot mid-game
	tutorialSeen?: boolean; // finished or skipped the tutorial in an earlier game in this lobby
	// Signed-in players' Discord account - recorded with the game so it shows in their stats.
	// Never sent to other players.
	discordId?: string;
	discordName?: string;
}

export interface DiscordIdentity {
	id: string;
	username: string;
}

// A signed-in player's in-game name, unique within the lobby
export function discordPlayerName(username: string, lobby?: Lobby, selfId?: string): string {
	return baseDiscordName(username, lobby?.players.filter((p) => p.id !== selfId).map((p) => p.name));
}

export interface Lobby {
	code: string;
	hostId: string;
	players: LobbyPlayer[];
	game: GameState | null;
	createdAt: number;
	isPublic: boolean;
	// Card packs shuffled into the deck - missing on lobbies saved before packs existed
	packs?: PackId[];
	// Discord Activity instance this lobby belongs to - everyone in that voice channel shares it
	activityId?: string;
	// Blurs the lobby code on everyone's screen so it can't leak on a stream
	streamerMode?: boolean;
	// Recent chat, oldest first - capped so it stays small in Redis
	chat?: ChatRecord[];
	// Lobby settings - missing on lobbies saved before they existed, which get the defaults
	turnSeconds?: number;
	reconnectSeconds?: number;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MIN_PLAYERS = 2;

const BOT_NAMES = [
	"Baa-rbara",
	"Wool-fred",
	"Shear-lock",
	"Fleece McCloud",
	"Ewe-nice",
];

export class LobbyManager {
	private lobbies = new Map<string, Lobby>();
	// Called just before a lobby is removed - used to record abandoned games
	onRemove?: (lobby: Lobby) => void;

	private genCode(): string {
		let code: string;
		do {
			code = Array.from(
				{ length: 4 },
				() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
			).join("");
		} while (this.lobbies.has(code));
		return code;
	}

	createLobby(hostPlayerId: string, hostName: string, discord?: DiscordIdentity | null): Lobby {
		const code = this.genCode();
		const lobby: Lobby = {
			code,
			hostId: hostPlayerId,
			players: [
				{
					id: hostPlayerId,
					name: hostName,
					socketId: null,
					connected: true,
					discordId: discord?.id,
					discordName: discord?.username,
				},
			],
			game: null,
			createdAt: Date.now(),
			isPublic: false,
			packs: normalizePacks([]),
		};
		this.lobbies.set(code, lobby);
		return lobby;
	}

	findActivityLobby(activityId: string): Lobby | undefined {
		for (const lobby of this.lobbies.values())
			if (lobby.activityId === activityId) return lobby;
		return undefined;
	}

	getLobby(code: string | undefined | null): Lobby | undefined {
		return this.lobbies.get((code || "").toUpperCase());
	}

	// discord: the player's signed-in account, if any. Their name is then their Discord name.
	joinLobby(code: string, playerId: string, name: string, discord?: DiscordIdentity | null): Lobby {
		const lobby = this.getLobby(code);
		if (!lobby) throw new Error("Lobby not found. Check the code and try again.");
		if (discord) name = discordPlayerName(discord.username, lobby, playerId);
		const existing = lobby.players.find((p) => p.id === playerId);
		if (existing) {
			if (!lobby.game) existing.name = name || existing.name;
			this.setDiscord(lobby, existing, discord);
			return lobby;
		}
		if (lobby.game?.started) throw new Error("That game has already started.");
		if (lobby.players.length >= MAX_PLAYERS)
			throw new Error(`Lobby is full (${MAX_PLAYERS} players max).`);
		if (lobby.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
			throw new Error("That name is already taken in this lobby.");
		lobby.players.push({
			id: playerId,
			name,
			socketId: null,
			connected: true,
			discordId: discord?.id,
			discordName: discord?.username,
		});
		return lobby;
	}

	// Ties a seat to whoever is signed in on it. Outside a game a signed-in player's name
	// follows their Discord name; during one, reconnecting signed out keeps the seat's account
	// so the game still counts towards their stats.
	setDiscord(lobby: Lobby, player: LobbyPlayer, discord: DiscordIdentity | null | undefined): void {
		if (!discord && lobby.game) return;
		player.discordId = discord?.id;
		player.discordName = discord?.username;
		if (discord && !lobby.game) player.name = discordPlayerName(discord.username, lobby, player.id);
	}

	deleteLobby(code: string): void {
		const lobby = this.lobbies.get(code);
		if (lobby) this.onRemove?.(lobby);
		this.lobbies.delete(code);
	}

	removeEmptyLobbies(): void {
		for (const [code, lobby] of this.lobbies) {
			const anyConnected = lobby.players.some((p) => p.connected);
			if (!anyConnected && Date.now() - lobby.createdAt > 5 * 60 * 1000)
				this.deleteLobby(code);
		}
	}

	startGame(lobby: Lobby): GameState {
		if (lobby.players.length < MIN_PLAYERS)
			throw new Error(`Need at least ${MIN_PLAYERS} players to start.`);
		if (lobby.players.length > MAX_PLAYERS)
			throw new Error(`Maximum ${MAX_PLAYERS} players.`);
		const offline = lobby.players.find((p) => !p.connected && !p.isBot);
		if (offline)
			throw new Error(
				`${offline.name} is offline - please wait for them to reconnect or kick them from the lobby.`,
			);
		lobby.game = engine.createGame(
			lobby.players.map((p) => ({
				id: p.id,
				name: p.name,
				skipTutorial: p.isBot || p.tutorialSeen,
			})),
			normalizePacks(lobby.packs),
		);
		return lobby.game;
	}

	addBot(lobby: Lobby): Lobby {
		if (lobby.game?.started)
			throw new Error("Cannot add bots after the game has started.");
		if (lobby.players.length >= MAX_PLAYERS)
			throw new Error(`Lobby is full (${MAX_PLAYERS} players max).`);
		const usedNames = new Set(lobby.players.map((p) => p.name));
		const available = BOT_NAMES.filter((n) => !usedNames.has(n));
		const pool = available.length > 0 ? available : BOT_NAMES;
		const name = pool[Math.floor(Math.random() * pool.length)];
		const id = "bot_" + Math.random().toString(36).slice(2, 10);
		lobby.players.push({ id, name, socketId: null, connected: true, isBot: true });
		return lobby;
	}

	findPlayer(lobby: Lobby, playerId: string | null): LobbyPlayer | undefined {
		return lobby.players.find((p) => p.id === playerId);
	}

	// Clients notice the new code in their next state update and rejoin under it
	regenerateCode(lobby: Lobby): void {
		const newCode = this.genCode();
		this.lobbies.delete(lobby.code);
		lobby.code = newCode;
		this.lobbies.set(newCode, lobby);
	}

	setLobbyPublic(lobby: Lobby, isPublic: boolean): void {
		if (!isPublic && lobby.isPublic) this.regenerateCode(lobby);
		lobby.isPublic = isPublic;
	}

	setLobbyPacks(lobby: Lobby, packs: string[], canUseHidden: boolean): void {
		if (lobby.game && !lobby.game.ended)
			throw new Error("Cannot change card packs during a game.");
		const current = normalizePacks(lobby.packs);
		const next = normalizePacks(packs);
		// Anyone can switch a hidden pack off, but only playtesters can switch one on
		const blocked = next.find((id) => PACKS[id].hidden && !current.includes(id));
		if (blocked && !canUseHidden)
			throw new Error(`Only playtesters can enable ${PACKS[blocked].name}.`);
		lobby.packs = next;
	}

	// Lobbies closest to filling up first (they'll start soonest), then the newest
	setLobbyTimers(lobby: Lobby, timers: { turnSeconds?: unknown; reconnectSeconds?: unknown }): void {
		if (lobby.game && !lobby.game.ended) throw new Error("Cannot change timers during a game.");
		const { turnSeconds, reconnectSeconds } = timers;
		if (turnSeconds !== undefined) {
			if (!(TURN_SECONDS_OPTIONS as readonly unknown[]).includes(turnSeconds))
				throw new Error("Invalid turn duration.");
			lobby.turnSeconds = turnSeconds as number;
		}
		if (reconnectSeconds !== undefined) {
			if (!(RECONNECT_SECONDS_OPTIONS as readonly unknown[]).includes(reconnectSeconds))
				throw new Error("Invalid reconnect time.");
			lobby.reconnectSeconds = reconnectSeconds as number;
		}
	}

	turnSecondsOf(lobby: Lobby): number {
		return lobby.turnSeconds ?? DEFAULT_TURN_SECONDS;
	}

	reconnectSecondsOf(lobby: Lobby): number {
		return lobby.reconnectSeconds ?? DEFAULT_RECONNECT_SECONDS;
	}

	listPublicLobbies(search?: string, page = 0, pageSize = 10): LobbiesPage {
		const q = (search ?? "").toLowerCase().trim();
		const all: (PublicLobbyEntry & { createdAt: number })[] = [];
		for (const lobby of this.lobbies.values()) {
			if (!lobby.isPublic || lobby.game || lobby.players.length >= MAX_PLAYERS)
				continue;
			const host = lobby.players.find((p) => p.id === lobby.hostId);
			const hostName = host?.name ?? "Shepherd";
			if (q && !hostName.toLowerCase().includes(q) && !lobby.code.toLowerCase().includes(q))
				continue;
			all.push({
				code: lobby.code,
				hostName,
				playerCount: lobby.players.length,
				packs: normalizePacks(lobby.packs),
				createdAt: lobby.createdAt,
			});
		}
		all.sort((a, b) => b.playerCount - a.playerCount || b.createdAt - a.createdAt);
		return {
			entries: all.slice(page * pageSize, (page + 1) * pageSize).map(({ createdAt: _c, ...e }) => e),
			total: all.length,
			page,
			pageSize,
		};
	}

	getAllLobbies(): Lobby[] {
		return Array.from(this.lobbies.values());
	}

	loadLobby(lobby: Lobby): void {
		// Reset createdAt so removeEmptyLobbies allows time to reconnect
		lobby.createdAt = Date.now();
		// Lobbies saved before bots were kept online come back with them marked offline
		for (const p of lobby.players) if (p.isBot) p.connected = true;
		this.lobbies.set(lobby.code, lobby);
	}

	passHost(lobby: Lobby): boolean {
		const next = lobby.players.find((p) => p.id !== lobby.hostId && !p.isBot);
		if (!next) return false;
		lobby.hostId = next.id;
		return true;
	}

	kickPlayer(lobby: Lobby, targetId: string): LobbyPlayer {
		if (lobby.game?.started) throw new Error("Cannot kick players during a game.");
		if (targetId === lobby.hostId) throw new Error("Cannot kick the host.");
		const idx = lobby.players.findIndex((p) => p.id === targetId);
		if (idx === -1) throw new Error("Player not found.");
		return lobby.players.splice(idx, 1)[0];
	}

	// The people who all have to vote before a coin flip is skipped: everyone in the game who's
	// connected and not a bot. Bots never hold things up, and nobody waits on someone who's gone.
	flipSkipVoters(lobby: Lobby): string[] {
		const g = lobby.game;
		if (!g) return [];
		return lobby.players.filter((p) => !p.isBot && p.connected && g.players[p.id]).map((p) => p.id);
	}

	// Whether everyone who has to vote to skip the current coin flip has done so
	flipSkipAgreed(lobby: Lobby): boolean {
		const votes = lobby.game?.pendingChallenge?.skipVotes ?? [];
		const voters = this.flipSkipVoters(lobby);
		return voters.length > 0 && voters.every((id) => votes.includes(id));
	}

	viewFor(lobby: Lobby, viewerId: string | null): LobbyView {
		const publicPlayers = lobby.players.map((p) => ({
			id: p.id,
			name: p.name,
			connected: p.connected || !!p.isBot,
			isBot: p.isBot || false,
			hasStats: !!p.discordId && !p.isBot,
		}));

		if (!lobby.game) {
			return {
				code: lobby.code,
				hostId: lobby.hostId,
				players: publicPlayers,
				game: null,
				isPublic: lobby.isPublic,
				isActivity: !!lobby.activityId,
				packs: normalizePacks(lobby.packs),
				streamerMode: !!lobby.streamerMode,
				turnSeconds: this.turnSecondsOf(lobby),
				reconnectSeconds: this.reconnectSecondsOf(lobby),
			};
		}

		const g = lobby.game;
		const pc = g.pendingChallenge;
		// Skip-vote progress while the coin flip is showing
		const voters = pc?.stage === "awaiting_reflip" ? this.flipSkipVoters(lobby) : [];
		const votes = pc?.skipVotes ?? [];
		const skip =
			pc?.stage === "awaiting_reflip"
				? {
						skipVotes: voters.filter((id) => votes.includes(id)).length,
						skipNeeded: voters.length,
						skipVoted: !!viewerId && votes.includes(viewerId),
					}
				: {};

		const playersView: PlayerView[] = g.order.map((pid) => {
			const p = g.players[pid];
			return {
				id: p.id,
				name: p.name,
				field: p.field,
				handCount: p.hand.length,
				hand: pid === viewerId ? p.hand : undefined,
			};
		});

		const gameView: GameView = {
			order: g.order,
			turnIndex: g.turnIndex,
			// Nobody has the turn until the tutorial phase is over
			currentPlayerId: g.phase === "tutorial" ? "" : engine.currentPlayerId(g),
			phase: g.phase,
			deckCount: g.deck.length,
			discard: g.discard,
			discardCount: g.discard.length,
			players: playersView,
			pendingChallenge: pc ? {
				challengerId: pc.challengerId,
				targetId: pc.targetId,
				challengeType: pc.challengeType,
				guess: pc.guess,
				stage: pc.stage,
				winnerId: pc.winnerId,
				loserId: pc.loserId,
				flipResult: pc.flipResult,
				flipCount: pc.flipCount,
				reflipMsLeft:
					pc.stage === "awaiting_reflip" && pc.reflipDeadline
						? Math.max(0, pc.reflipDeadline - Date.now())
						: undefined,
				...skip,
			} : null,
			log: g.log.slice(-40),
			finalRoundActive: g.finalRoundActive,
			finalRoundRemaining: g.finalRoundQueue?.length ?? 0,
			ended: g.ended,
			results: g.results,
			challengeUsedThisTurn: g.challengeUsedThisTurn,
			tutorialProgress:
				g.phase === "tutorial" && g.tutorial ? { ...g.tutorial } : null,
			turnMsLeft: g.turnDeadline && !g.ended ? Math.max(0, g.turnDeadline - Date.now()) : undefined,
		};

		return {
			code: lobby.code,
			hostId: lobby.hostId,
			players: publicPlayers,
			game: gameView,
			isPublic: lobby.isPublic,
			isActivity: !!lobby.activityId,
			packs: normalizePacks(lobby.packs),
			streamerMode: !!lobby.streamerMode,
			turnSeconds: this.turnSecondsOf(lobby),
			reconnectSeconds: this.reconnectSecondsOf(lobby),
		};
	}
}

export const lobbyManager = new LobbyManager();
