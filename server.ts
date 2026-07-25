import { createServer } from "http";
import next from "next";
import { Server, Socket } from "socket.io";
import * as engine from "./src/lib/engine";
import { lobbyManager, Lobby } from "./src/lib/lobbyManager";
import * as bot from "./src/lib/bot";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const BOT_DELAY_MS = 900;
const REFLIP_WINDOW_MS = 6000;
const pendingBotActions = new Set<string>();
const pendingReflipTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingResetTimers = new Map<string, ReturnType<typeof setTimeout>>();

app.prepare().then(() => {
	const httpServer = createServer((req, res) => handle(req, res));
	const io = new Server(httpServer);

	function resetLobbyGame(lobby: Lobby) {
		pendingResetTimers.delete(lobby.code);
		if (!lobby.game?.ended) return;
		lobby.game = null;
		broadcast(lobby);
	}

	function broadcast(lobby: Lobby) {
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
			pendingResetTimers.set(
				lobby.code,
				setTimeout(() => resetLobbyGame(lobby), 12000),
			);
		}
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
		const t = setTimeout(() => {
			pendingReflipTimers.delete(lobby.code);
			if (!lobby.game) return;
			try {
				engine.commitFlipResult(lobby.game);
				broadcast(lobby);
			} catch (e) {
				console.error("Reflip commit:", e);
			}
		}, REFLIP_WINDOW_MS);
		pendingReflipTimers.set(lobby.code, t);
	}

	function scheduleBotAction(lobby: Lobby) {
		if (!lobby.game || lobby.game.ended || lobby.game.phase === "ended")
			return;
		if (pendingBotActions.has(lobby.code)) return;

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
			p.connected = true;
			p.isBot = true;
			p.socketId = null;
		} else {
			p.connected = false;
			p.socketId = null;
		}
	}

	setInterval(() => lobbyManager.removeEmptyLobbies(), 60 * 1000).unref();

	io.on("connection", (socket: Socket) => {
		let currentCode: string | null = null;
		let currentPlayerId: string | null = null;

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
					const cleanName = validateName(name);
					const lobby = lobbyManager.createLobby(playerId, cleanName);
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
					const cleanName = validateName(name);
					const lobby = lobbyManager.joinLobby(
						code,
						playerId,
						cleanName,
					);
					currentCode = lobby.code;
					currentPlayerId = playerId;
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
					const lobby = lobbyManager.getLobby(code);
					if (!lobby) throw new Error("That lobby no longer exists.");
					const p = lobbyManager.findPlayer(lobby, playerId);
					if (!p) throw new Error("You are not part of that lobby.");
					currentCode = lobby.code;
					currentPlayerId = playerId;
					p.socketId = socket.id;
					p.connected = true;
					p.isBot = false; // Restore human control on rejoin
					socket.join(lobby.code);
					socket.emit("joined", { code: lobby.code, playerId });
					broadcast(lobby);
				} catch (e: any) {
					socket.emit("error_msg", e.message);
				}
			},
		);

		socket.on("set_public", ({ isPublic }: { isPublic: boolean }) =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error(
						"Only the host can change lobby visibility.",
					);
				lobbyManager.setLobbyPublic(lobby, isPublic);
				currentCode = lobby.code; // code may have changed if made private
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

		socket.on("add_bot", () =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can add a bot.");
				lobbyManager.addBot(lobby);
			}),
		);

		socket.on("start_game", () =>
			withLobby((lobby) => {
				if (lobby.hostId !== currentPlayerId)
					throw new Error("Only the host can start the game.");
				lobbyManager.startGame(lobby);
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

		socket.on("discard_cards", ({ cardIds }: { cardIds: string[] }) =>
			withLobby((lobby) => {
				engine.discardCards(
					lobby.game!,
					currentPlayerId!,
					cardIds || [],
				);
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
			lobbyManager.deleteLobby(lobby.code);
		}

		socket.on("leave_lobby", () => {
			if (!currentCode) return;
			const lobby = lobbyManager.getLobby(currentCode);
			if (lobby) {
				if (currentPlayerId === lobby.hostId && !lobbyManager.passHost(lobby)) {
					disbandLobby(lobby);
				} else {
					replaceWithBot(lobby, currentPlayerId);
					broadcast(lobby);
				}
			}
			currentCode = null;
			currentPlayerId = null;
		});

		socket.on("disconnect", () => {
			if (!currentCode) return;
			const lobby = lobbyManager.getLobby(currentCode);
			if (lobby) {
				if (currentPlayerId === lobby.hostId && !lobbyManager.passHost(lobby)) {
					disbandLobby(lobby);
				} else {
					replaceWithBot(lobby, currentPlayerId);
					broadcast(lobby);
				}
			}
		});
	});

	httpServer.listen(port, () => {
		console.log(`> ITSLAM ready on http://localhost:${port}`);
	});
});
