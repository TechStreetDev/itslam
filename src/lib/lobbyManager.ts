import * as engine from "./engine";
import { PACKS, normalizePacks } from "./deck";
import {
	GameState,
	GameView,
	LobbyView,
	LobbiesPage,
	MAX_PLAYERS,
	PackId,
	PlayerView,
	PublicLobbyEntry,
} from "./types";

export interface LobbyPlayer {
	id: string;
	name: string;
	socketId: string | null;
	connected: boolean;
	isBot?: boolean;
	isReplacement?: boolean; // true when a human was swapped for a bot mid-game
	tutorialSeen?: boolean; // finished or skipped the tutorial in an earlier game in this lobby
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

	createLobby(hostPlayerId: string, hostName: string): Lobby {
		const code = this.genCode();
		const lobby: Lobby = {
			code,
			hostId: hostPlayerId,
			players: [{ id: hostPlayerId, name: hostName, socketId: null, connected: true }],
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

	joinLobby(code: string, playerId: string, name: string): Lobby {
		const lobby = this.getLobby(code);
		if (!lobby) throw new Error("Lobby not found. Check the code and try again.");
		const existing = lobby.players.find((p) => p.id === playerId);
		if (existing) {
			existing.name = name || existing.name;
			return lobby;
		}
		if (lobby.game?.started) throw new Error("That game has already started.");
		if (lobby.players.length >= MAX_PLAYERS)
			throw new Error(`Lobby is full (${MAX_PLAYERS} players max).`);
		if (lobby.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
			throw new Error("That name is already taken in this lobby.");
		lobby.players.push({ id: playerId, name, socketId: null, connected: true });
		return lobby;
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

	setLobbyPublic(lobby: Lobby, isPublic: boolean): void {
		if (!isPublic && lobby.isPublic) {
			const newCode = this.genCode();
			this.lobbies.delete(lobby.code);
			lobby.code = newCode;
			this.lobbies.set(newCode, lobby);
		}
		
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

	listPublicLobbies(search?: string, page = 0, pageSize = 10): LobbiesPage {
		const q = (search ?? "").toLowerCase().trim();
		const all: PublicLobbyEntry[] = [];
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
			});
		}
		return {
			entries: all.slice(page * pageSize, (page + 1) * pageSize),
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

	viewFor(lobby: Lobby, viewerId: string | null): LobbyView {
		const publicPlayers = lobby.players.map((p) => ({
			id: p.id,
			name: p.name,
			connected: p.connected,
			isBot: p.isBot || false,
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
			};
		}

		const g = lobby.game;
		const pc = g.pendingChallenge;

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
			} : null,
			log: g.log.slice(-40),
			finalRoundActive: g.finalRoundActive,
			finalRoundRemaining: g.finalRoundQueue?.length ?? 0,
			ended: g.ended,
			results: g.results,
			challengeUsedThisTurn: g.challengeUsedThisTurn,
			tutorialProgress:
				g.phase === "tutorial" && g.tutorial ? { ...g.tutorial } : null,
		};

		return {
			code: lobby.code,
			hostId: lobby.hostId,
			players: publicPlayers,
			game: gameView,
			isPublic: lobby.isPublic,
			isActivity: !!lobby.activityId,
			packs: normalizePacks(lobby.packs),
		};
	}
}

export const lobbyManager = new LobbyManager();
