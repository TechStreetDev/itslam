import { createServer, IncomingMessage, ServerResponse } from "http";
import next from "next";
import { Server, Socket } from "socket.io";
import * as engine from "./src/lib/engine";
import { lobbyManager, Lobby } from "./src/lib/lobbyManager";
import * as bot from "./src/lib/bot";
import { connectRedis } from "./src/lib/redis";
import { saveLobby, deleteLobby as deleteFromRedis, loadAllLobbies } from "./src/lib/persistence";
import {
	authConfigured,
	getSessionUser,
	userAccess,
	startLogin,
	finishLogin,
	logout,
	activityLogin,
	sessionFromToken,
	SessionUser,
} from "./src/lib/auth";
import { collectStats, track } from "./src/lib/stats";
import { connectDb } from "./src/lib/db";
import { can, initRoles } from "./src/lib/roles";
import { pruneLogins } from "./src/lib/logins";
import { recordGame } from "./src/lib/gameRecorder";
import { handleAdminApi, readJson, sendJson } from "./src/lib/adminApi";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const BOT_DELAY_MS = 900;
// The coin animation plays first, then players get the full window to play a Re-Flip
const FLIP_ANIMATION_MS = 2000;
const REFLIP_WINDOW_MS = 10000;
const pendingBotActions = new Set<string>();
const pendingReflipTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingResetTimers = new Map<string, ReturnType<typeof setTimeout>>();

// How long a player who drops mid-game has to reconnect before a bot takes over
const RECONNECT_GRACE_MS = 10000;
const pendingBotTakeovers = new Map<string, ReturnType<typeof setTimeout>>();

// Discord Activity players are keyed by their Discord ID, so only that user's session may use it
const ACTIVITY_PLAYER_PREFIX = "discord_";

// Discord display names can hold anything - squeeze them into the lobby's name rules
function activityName(username: string, lobby?: Lobby): string {
	let base = username.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 19);
	if (base.length < 3) base = "Shepherd";
	const taken = new Set(lobby?.players.map((p) => p.name.toLowerCase()) ?? []);
	let name = base;
	for (let i = 2; taken.has(name.toLowerCase()); i++) {
		const suffix = ` ${i}`;
		name = base.slice(0, 19 - suffix.length) + suffix;
	}
	return name;
}

app.prepare().then(async () => {
	const httpServer = createServer((req, res) => {
		const url = new URL(req.url || "/", "http://localhost");
		if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) {
			handleApi(req, res, url).catch((e) => {
				console.error("API error:", e);
				if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
			});
			return;
		}
		handle(req, res);
	});
	const io = new Server(httpServer);

	async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
		const user = getSessionUser(req);
		switch (url.pathname) {
			case "/auth/discord":
				if (!authConfigured()) return sendJson(res, 503, { error: "Login is not configured" });
				return startLogin(res);
			case "/auth/discord/callback":
				if (!authConfigured()) return sendJson(res, 503, { error: "Login is not configured" });
				return finishLogin(req, res, url);
			case "/auth/logout":
				return logout(res);
			case "/api/discord/token": {
				if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
				if (!authConfigured()) return sendJson(res, 503, { error: "Login is not configured" });
				const { code } = await readJson(req);
				if (typeof code !== "string" || !code) return sendJson(res, 400, { error: "Missing code" });
				try {
					return sendJson(res, 200, await activityLogin(code));
				} catch (e) {
					console.error("[Auth] Discord Activity login failed:", (e as Error).message);
					return sendJson(res, 401, { error: "Discord sign-in failed" });
				}
			}
			case "/api/me":
				return sendJson(res, 200, {
					loginEnabled: authConfigured(),
					discordClientId: authConfigured() ? process.env.DISCORD_CLIENT_ID : null,
					user: user && { ...user, ...userAccess(user) },
				});
			default:
				if (
					await handleAdminApi(req, res, url, user, () =>
						collectStats(lobbyManager.getAllLobbies(), io.engine.clientsCount),
					)
				)
					return;
				return handle(req, res);
		}
	}

	function resetLobbyGame(lobby: Lobby) {
		pendingResetTimers.delete(lobby.code);
		if (!lobby.game?.ended) return;
		lobby.game = null;

		// Remove players who were bot-replacements for disconnected humans
		lobby.players = lobby.players.filter(p => !p.isReplacement);

		// If no humans remain, disband rather than leaving an empty/all-bot lobby
		if (!lobby.players.some(p => !p.isBot)) {
			disbandLobbyAll(lobby);
			return;
		}

		// If the host was removed (was a replacement bot), pass host or disband
		if (!lobby.players.some(p => p.id === lobby.hostId)) {
			if (!lobbyManager.passHost(lobby)) {
				disbandLobbyAll(lobby);
				return;
			}
		}

		broadcast(lobby);
	}

	function broadcast(lobby: Lobby) {
		// Bot and flip timers can fire after their lobby was disbanded - don't revive it
		if (lobbyManager.getLobby(lobby.code) !== lobby) return;
		// A Discord Activity lobby is tied to its voice channel - once every human has
		// left or been replaced by a bot, nobody can get back to it, so abandon the game
		if (lobby.activityId && !lobby.players.some((p) => !p.isBot)) {
			clearReflipTimer(lobby.code);
			disbandLobbyAll(lobby);
			return;
		}
		for (const p of lobby.players) {
			if (p.socketId && !p.isBot) {
				io.to(p.socketId).emit(
					"state",
					lobbyManager.viewFor(lobby, p.id),
				);
			}
		}
		scheduleBotAction(lobby);
		if (lobby.game?.ended && !pendingResetTimers.has(lobby.code)) {
			track("games_finished");
			recordGame(lobby, "completed");
			pendingResetTimers.set(
				lobby.code,
				setTimeout(() => resetLobbyGame(lobby), 12000),
			);
		}
		saveLobby(lobby);
	}

	function clearReflipTimer(code: string) {
		const t = pendingReflipTimers.get(code);
		if (t) {
			clearTimeout(t);
			pendingReflipTimers.delete(code);
		}
	}

	function startReflipTimer(lobby: Lobby) {
		clearReflipTimer(lobby.code);
		const delay = FLIP_ANIMATION_MS + REFLIP_WINDOW_MS;
		if (lobby.game?.pendingChallenge) lobby.game.pendingChallenge.reflipDeadline = Date.now() + delay;
		const t = setTimeout(() => {
			pendingReflipTimers.delete(lobby.code);
			if (!lobby.game) return;
			try {
				engine.commitFlipResult(lobby.game);
				broadcast(lobby);
			} catch (e) {
				console.error("Reflip commit:", e);
			}
		}, delay);
		pendingReflipTimers.set(lobby.code, t);
	}

	function scheduleBotAction(lobby: Lobby) {
		if (!lobby.game || lobby.game.ended || lobby.game.phase === "ended")
			return;
		
		if (pendingBotActions.has(lobby.code)) return;
		if (lobby.game.phase === "tutorial") return;

		const game = lobby.game;
		const pc = game.pendingChallenge;
		const isBot = (id: string) =>
			lobby.players.find((p) => p.id === id)?.isBot === true;

		if (pc) {
			if (pc.stage === "awaiting_flip") {
				if (pc.guess === null && isBot(pc.challengerId)) {
					pendingBotActions.add(lobby.code);
					setTimeout(() => {
						pendingBotActions.delete(lobby.code);
						try {
							bot.doBotReGuess(game, pc.challengerId);
							broadcast(lobby);
						} catch (e) {
							console.error("Bot re-guess:", e);
						}
					}, BOT_DELAY_MS);
					return;
				}
				if (pc.guess !== null && isBot(pc.targetId)) {
					pendingBotActions.add(lobby.code);
					setTimeout(() => {
						pendingBotActions.delete(lobby.code);
						try {
							bot.doBotFlip(game, pc.targetId);
							startReflipTimer(lobby);
							broadcast(lobby);
						} catch (e) {
							console.error("Bot flip:", e);
						}
					}, BOT_DELAY_MS);
					return;
				}
			}
			if (
				pc.stage === "awaiting_selection" &&
				pc.winnerId &&
				isBot(pc.winnerId)
			) {
				pendingBotActions.add(lobby.code);
				setTimeout(() => {
					pendingBotActions.delete(lobby.code);
					try {
						bot.resolveBotChallengeEffect(game, pc.winnerId!);
						broadcast(lobby);
					} catch (e) {
						console.error("Bot challenge effect:", e);
					}
				}, BOT_DELAY_MS);
				return;
			}
			return; // Challenge pending with human player, wait
		}

		const currentId = engine.currentPlayerId(game);
		if (!isBot(currentId)) return;

		pendingBotActions.add(lobby.code);
		setTimeout(() => {
			pendingBotActions.delete(lobby.code);
			try {
				if (game.phase === "draw") {
					bot.doBotDrawPhase(game, currentId);
					broadcast(lobby);
				} else if (game.phase === "play") {
					const played = bot.doBotPlayAction(game, currentId);
					if (played) {
						broadcast(lobby);
					} else if (!game.pendingChallenge) {
						bot.doBotEndTurn(game, currentId);
						broadcast(lobby);
					} else {
						broadcast(lobby); // Bot challenged a human; wait for them to flip
					}
				} else if (game.phase === "discard") {
					// A bot that took over a human's seat mid-discard
					bot.doBotEndTurn(game, currentId);
					broadcast(lobby);
				}
			} catch (e) {
				console.error("Bot action error:", e);
			}
		}, BOT_DELAY_MS);
	}

	function replaceWithBot(lobby: Lobby, playerId: string | null) {
		if (!playerId) return;
		const p = lobbyManager.findPlayer(lobby, playerId);
		if (!p) return;
		if (lobby.game && lobby.game.started && !lobby.game.ended) {
			if (!p.isBot) engine.recordReplacement(lobby.game, playerId);
			// A bot doesn't need the tutorial - don't hold the game up for it
			engine.setTutorialProgress(lobby.game, playerId, 1);
			p.connected = true;
			p.isBot = true;
			p.isReplacement = true;
			p.socketId = null;
		} else {
			p.connected = false;
			p.socketId = null;
		}
	}

	function clearBotTakeover(playerId: string) {
		const t = pendingBotTakeovers.get(playerId);
		if (t) {
			clearTimeout(t);
			pendingBotTakeovers.delete(playerId);
		}
	}

	function scheduleBotTakeover(lobby: Lobby, playerId: string) {
		clearBotTakeover(playerId);
		pendingBotTakeovers.set(
			playerId,
			setTimeout(() => {
				pendingBotTakeovers.delete(playerId);
				if (lobbyManager.getLobby(lobby.code) !== lobby) return;
				const p = lobbyManager.findPlayer(lobby, playerId);
				if (!p || p.connected || p.isBot) return;
				if (!lobby.game?.started || lobby.game.ended) return;
				replaceWithBot(lobby, playerId);
				broadcast(lobby);
			}, RECONNECT_GRACE_MS),
		);
	}

	function disbandLobbyAll(lobby: Lobby) {
		for (const p of lobby.players) {
			if (p.socketId) {
				io.to(p.socketId).emit("disbanded");
				io.sockets.sockets.get(p.socketId)?.leave(lobby.code);
			}
		}
		deleteFromRedis(lobby.code);
		lobbyManager.deleteLobby(lobby.code);
	}

	connectRedis();
	await connectDb();
	await initRoles().catch((e) => console.error("[MySQL] loading roles failed:", e.message));
	lobbyManager.onRemove = (lobby) => {
		if (lobby.game?.started && !lobby.game.ended) recordGame(lobby, "abandoned");
	};
	const storedLobbies = await loadAllLobbies();
	for (const lobby of storedLobbies) {
		lobbyManager.loadLobby(lobby);
		if (lobby.game && !lobby.game.ended) {
			if (lobby.game.pendingChallenge?.stage === "awaiting_reflip")
				startReflipTimer(lobby);
			scheduleBotAction(lobby);
		}
	}
	if (storedLobbies.length > 0)
		console.log(`> Restored ${storedLobbies.length} lobby/lobbies from Redis`);

	setInterval(() => lobbyManager.removeEmptyLobbies(), 60 * 1000).unref();
	pruneLogins();
	setInterval(pruneLogins, 6 * 60 * 60 * 1000).unref();

	io.on("connection", (socket: Socket) => {
		let currentCode: string | null = null;
		let currentPlayerId: string | null = null;
		// Web sockets carry the session cookie; Activity sockets pass the token on connect
		const socketUser: SessionUser | null =
			sessionFromToken(socket.handshake.auth?.token) ?? getSessionUser(socket.request);
		const activityPlayerId = socketUser ? ACTIVITY_PLAYER_PREFIX + socketUser.id : null;

		function checkPlayerId(playerId: unknown): string {
			if (typeof playerId !== "string" || !playerId) throw new Error("Invalid player.");
			if (playerId.startsWith(ACTIVITY_PLAYER_PREFIX) && playerId !== activityPlayerId)
				throw new Error("Invalid player.");
			return playerId;
		}

		function withLobby(cb: (lobby: Lobby) => void) {
			try {
				const lobby = lobbyManager.getLobby(currentCode);
				if (!lobby) throw new Error("Lobby no longer exists.");
				cb(lobby);
				broadcast(lobby);
			} catch (e: any) {
				socket.emit("error_msg", e.message || "Something went wrong.");
			}
		}

		function validateName(name: string): string {
			const n = (name || "").trim();
			if (n.length < 3)
				throw new Error("Name must be at least 3 characters.");
			if (n.length >= 20)
				throw new Error("Name must be less than 20 characters.");
			if (!/^[a-zA-Z0-9 ]+$/.test(n))
				throw new Error(
					"Name can only contain letters, numbers, and spaces.",
				);
			return n;
		}

		socket.on(
			"create_lobby",
			({ playerId, name }: { playerId: string; name: string }) => {
				try {
					checkPlayerId(playerId);
					const cleanName = validateName(name);
					const lobby = lobbyManager.createLobby(playerId, cleanName);
					track("lobbies_created");
					currentCode = lobby.code;
					currentPlayerId = playerId;
					lobbyManager.findPlayer(lobby, playerId)!.socketId =
						socket.id;
					socket.join(lobby.code);
					socket.emit("joined", { code: lobby.code, playerId });
					broadcast(lobby);
				} catch (e: any) {
					socket.emit("error_msg", e.message);
				}
			},
		);

		socket.on(
			"join_lobby",
			({
				playerId,
				name,
				code,
			}: {
				playerId: string;
				name: string;
				code: string;
			}) => {
				try {
					checkPlayerId(playerId);
					if (lobbyManager.getLobby(code)?.activityId)
						throw new Error("That lobby is a Discord Activity - join it from the channel.");
					const cleanName = validateName(name);
					const lobby = lobbyManager.joinLobby(
						code,
						playerId,
						cleanName,
					);
					currentCode = lobby.code;
					currentPlayerId = playerId;
					clearBotTakeover(playerId);
					const p = lobbyManager.findPlayer(lobby, playerId)!;
					p.socketId = socket.id;
					p.connected = true;
					socket.join(lobby.code);
					socket.emit("joined", { code: lobby.code, playerId });
					broadcast(lobby);
				} catch (e: any) {
					socket.emit("error_msg", e.message);
				}
			},
		);

		socket.on(
			"rejoin",
			({ playerId, code }: { playerId: string; code: string }) => {
				try {
					checkPlayerId(playerId);
					const lobby = lobbyManager.getLobby(code);
					if (!lobby) throw new Error("That lobby no longer exists.");
					const p = lobbyManager.findPlayer(lobby, playerId);
					if (!p) throw new Error("You are not part of that lobby.");
					currentCode = lobby.code;
					currentPlayerId = playerId;
					clearBotTakeover(playerId);
					p.socketId = socket.id;
					p.connected = true;
					p.isBot = false;
					p.isReplacement = false;
					socket.join(lobby.code);
					socket.emit("joined", { code: lobby.code, playerId });
					broadcast(lobby);
				} catch (e: any) {
					socket.emit("error_msg", e.message);
				}
			},
		);

		// Everyone in the same channel lands in the lobby for that Activity instance
		socket.on("join_activity", ({ instanceId }: { instanceId: string }) => {
			try {
				if (!socketUser || !activityPlayerId)
					throw new Error("Discord sign-in failed - try relaunching the Activity.");
				if (typeof instanceId !== "string" || !instanceId || instanceId.length > 128)
					throw new Error("Invalid Activity instance.");
				let lobby = lobbyManager.findActivityLobby(instanceId);
				if (!lobby) {
					lobby = lobbyManager.createLobby(activityPlayerId, activityName(socketUser.username));
					lobby.activityId = instanceId;
					track("lobbies_created");
				} else if (!lobbyManager.findPlayer(lobby, activityPlayerId)) {
					lobbyManager.joinLobby(lobby.code, activityPlayerId, activityName(socketUser.username, lobby));
				}
				const p = lobbyManager.findPlayer(lobby, activityPlayerId)!;
				currentCode = lobby.code;
				currentPlayerId = activityPlayerId;
				clearBotTakeover(activityPlayerId);
				p.socketId = socket.id;
				p.connected = true;
				p.isBot = false;
				p.isReplacement = false;
				socket.join(lobby.code);
				socket.emit("joined", { code: lobby.code, playerId: activityPlayerId });
				broadcast(lobby);
			} catch (e: any) {
				socket.emit("error_msg", e.message);
			}
		});

		socket.on("set_public", ({ isPublic }: { isPublic: boolean }) =>
			withLobby((lobby) => {
				if (lobby.activityId)
					throw new Error("Discord Activity lobbies can't be made public.");
				if (lobby.hostId !== currentPlayerId)
					throw new Error(
						"Only the host can change lobby visibility.",
					);
				const oldCode = lobby.code;
				lobbyManager.setLobbyPublic(lobby, isPublic);
				if (lobby.code !== oldCode) deleteFromRedis(oldCode);
				currentCode = lobby.code; // code may have changed if made private
			}),
		);

		socket.on("set_streamer_mode", ({ enabled }: { enabled: boolean }) =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId) {
					throw new Error("Only the host can change streamer mode.");
				}

				lobby.streamerMode = !!enabled;
			}),
		);

		socket.on("regenerate_code", () =>
			withLobby((lobby) => {
				if (lobby.activityId) {
					throw new Error("Discord Activity lobbies don't use a code.");
				}

				if (lobby.hostId !== currentPlayerId) {
					throw new Error("Only the host can change the lobby code.");
				}

				if (lobby.game) {
					throw new Error("Cannot change the lobby code during a game.");
				}

				const oldCode = lobby.code;
				lobbyManager.regenerateCode(lobby);
				deleteFromRedis(oldCode);
				currentCode = lobby.code;
			}),
		);

		socket.on("set_packs", ({ packs }: { packs: string[] }) =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can change card packs.");
				if (!Array.isArray(packs)) throw new Error("Invalid card packs.");
				const playtester = can(socketUser, "hidden_packs");
				lobbyManager.setLobbyPacks(lobby, packs, playtester);
			}),
		);

		socket.on(
			"list_lobbies",
			(payload: { search?: string; page?: number } | undefined) => {
				const { search, page } = payload ?? {};
				socket.emit(
					"lobbies_list",
					lobbyManager.listPublicLobbies(search, page),
				);
			},
		);

		socket.on("kick_player", ({ targetId }: { targetId: string }) => {
			try {
				const lobby = lobbyManager.getLobby(currentCode);
				if (!lobby) throw new Error("Lobby no longer exists.");
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can kick players.");
				const kicked = lobbyManager.kickPlayer(lobby, targetId);
				if (kicked.socketId) {
					io.to(kicked.socketId).emit("kicked");
					io.sockets.sockets.get(kicked.socketId)?.leave(lobby.code);
				}
				broadcast(lobby);
			} catch (e: any) {
				socket.emit("error_msg", e.message || "Something went wrong.");
			}
		});

		socket.on("start_game", () =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can start the game.");
				lobbyManager.startGame(lobby);
				track("games_started");
			}),
		);

		socket.on("tutorial_progress", ({ progress }: { progress: number }) =>
			withLobby((lobby) => {
				if (!lobby.game || !currentPlayerId) return;
				engine.setTutorialProgress(lobby.game, currentPlayerId, progress);
				if ((lobby.game.tutorial?.[currentPlayerId] ?? 1) >= 1) {
					const p = lobbyManager.findPlayer(lobby, currentPlayerId);
					if (p) p.tutorialSeen = true;
				}
			}),
		);

		socket.on("draw", () =>
			withLobby((lobby) => {
				engine.drawPhase(lobby.game!, currentPlayerId!);
			}),
		);

		socket.on("play_sheep", (payload: engine.PlaySheepPayload) =>
			withLobby((lobby) => {
				engine.playSheep(lobby.game!, currentPlayerId!, payload || {});
			}),
		);

		socket.on("play_action", (payload: engine.PlayActionPayload) =>
			withLobby((lobby) => {
				engine.playAction(lobby.game!, currentPlayerId!, payload);
			}),
		);

		socket.on("bodyswap", (payload: engine.BodyswapPayload) =>
			withLobby((lobby) => {
				engine.bodyswap(lobby.game!, currentPlayerId!, payload);
			}),
		);

		socket.on("play_challenge", (payload: engine.PlayChallengePayload) =>
			withLobby((lobby) => {
				engine.playChallenge(lobby.game!, currentPlayerId!, payload);
			}),
		);

		socket.on("play_reflip", ({ cardId }: { cardId: string }) =>
			withLobby((lobby) => {
				engine.playReflip(lobby.game!, currentPlayerId!, cardId);
				startReflipTimer(lobby);
			}),
		);

		socket.on(
			"challenge_guess",
			({ guess }: { guess: "heads" | "butts" }) =>
				withLobby((lobby) => {
					engine.setChallengeGuess(
						lobby.game!,
						currentPlayerId!,
						guess,
					);
				}),
		);

		socket.on("resolve_flip", () =>
			withLobby((lobby) => {
				engine.resolveFlip(lobby.game!, currentPlayerId!);
				startReflipTimer(lobby);
			}),
		);

		socket.on(
			"resolve_challenge_effect",
			(selections: engine.ResolveChallengeEffectPayload) =>
				withLobby((lobby) => {
					engine.resolveChallengeEffect(
						lobby.game!,
						currentPlayerId!,
						selections || {},
					);
				}),
		);

		socket.on("start_discard", () =>
			withLobby((lobby) => {
				engine.startDiscard(lobby.game!, currentPlayerId!);
			}),
		);

		socket.on("cancel_discard", () =>
			withLobby((lobby) => {
				engine.cancelDiscard(lobby.game!, currentPlayerId!);
			}),
		);

		socket.on(
			"end_turn",
			({ discardCardIds }: { discardCardIds: string[] }) =>
				withLobby((lobby) => {
					engine.endTurn(
						lobby.game!,
						currentPlayerId!,
						discardCardIds || [],
					);
				}),
		);

		socket.on("abort_game", () =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can end the game.");
				const t = pendingResetTimers.get(lobby.code);
				if (t) {
					clearTimeout(t);
					pendingResetTimers.delete(lobby.code);
				}
				lobby.game = null;
			}),
		);

		socket.on("return_to_lobby", () =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can return to lobby.");
				const t = pendingResetTimers.get(lobby.code);
				if (t) {
					clearTimeout(t);
					pendingResetTimers.delete(lobby.code);
				}
				lobby.game = null;
			}),
		);

		socket.on("add_bot", () =>
			withLobby((lobby) => {
				if (!can(socketUser, "add_bots")) {
					throw new Error("Only playtesters can add bots.");
				}

				if (lobby.hostId !== currentPlayerId) {
					throw new Error("Only the host can add a bot.");
				}
				
				lobbyManager.addBot(lobby);
			}),
		);

		if (dev) {
			socket.on("dev_give_card", (spec: any) =>
				withLobby((lobby) => {
					if (!lobby.game || !currentPlayerId) return;
					const player = lobby.game.players[currentPlayerId];
					if (!player) return;
					const id = "dev_" + Math.random().toString(36).slice(2, 8);
					let card: import("./src/lib/types").Card | null = null;
					if (spec.category === "head")
						card = {
							id,
							category: "head",
							color: spec.color,
							rainbow: spec.color === "rainbow",
						};
					else if (spec.category === "butt")
						card = {
							id,
							category: "butt",
							color: spec.color,
							rainbow: spec.color === "rainbow",
						};
					else if (spec.category === "action")
						card = { id, category: "action", action: spec.action };
					else if (spec.category === "modifier")
						card = {
							id,
							category: "modifier",
							modifier: spec.modifier,
						};
					else if (spec.category === "challenge")
						card = {
							id,
							category: "challenge",
							challengeType: spec.challengeType,
						};
					if (card) player.hand.push(card);
				}),
			);
		}

		function disbandLobby(lobby: Lobby) {
			for (const p of lobby.players) {
				if (p.socketId && p.id !== currentPlayerId) {
					io.to(p.socketId).emit("disbanded");
					io.sockets.sockets.get(p.socketId)?.leave(lobby.code);
				}
			}
			deleteFromRedis(lobby.code);
			lobbyManager.deleteLobby(lobby.code);
		}

		socket.on("leave_lobby", () => {
			if (!currentCode) return;
			const lobby = lobbyManager.getLobby(currentCode);
			if (lobby && currentPlayerId) {
				clearBotTakeover(currentPlayerId);
				if (lobby.game && lobby.game.started && !lobby.game.ended) {
					// Mid-game - replace with bot as host passing/disbanding is deferred to game end
					replaceWithBot(lobby, currentPlayerId);
					broadcast(lobby);
				} else if (currentPlayerId === lobby.hostId && !lobbyManager.passHost(lobby)) {
					disbandLobby(lobby);
				} else {
					// Leaving on purpose outside a game - drop them so they can't hold up the next start
					lobby.players = lobby.players.filter((p) => p.id !== currentPlayerId);
					broadcast(lobby);
				}
			}
			socket.leave(currentCode);
			currentCode = null;
			currentPlayerId = null;
		});

		socket.on("disconnect", () => {
			if (!currentCode) return;
			const lobby = lobbyManager.getLobby(currentCode);
			const p = lobby && lobbyManager.findPlayer(lobby, currentPlayerId);
			// A refresh can rejoin on a new socket before this old one reports its disconnect
			if (!lobby || !p || p.socketId !== socket.id) return;
			if (lobby.game && lobby.game.started && !lobby.game.ended) {
				// Mid-game - give them a moment to reconnect before a bot takes their seat
				p.connected = false;
				p.socketId = null;
				scheduleBotTakeover(lobby, p.id);
				broadcast(lobby);
			} else if (currentPlayerId === lobby.hostId && !lobbyManager.passHost(lobby)) {
				disbandLobby(lobby);
			} else if (lobby.activityId) {
				// Closing the Activity means leaving the channel game - don't leave an offline seat behind
				lobby.players = lobby.players.filter((pl) => pl.id !== currentPlayerId);
				broadcast(lobby);
			} else {
				replaceWithBot(lobby, currentPlayerId);
				broadcast(lobby);
			}
		});
	});

	httpServer.listen(port, () => {
		console.log(`> ITSLAM ready on http://localhost:${port}`);
	});
});
