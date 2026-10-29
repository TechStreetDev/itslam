"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { io, Socket } from "socket.io-client";
import { ChatMessage, LobbiesPage, LobbyView, PackId, SessionInfo } from "@/lib/types";
import { onAuth } from "@/lib/signIn";
import {
	getServerTabStatus,
	getTabStatus,
	subscribeTabStatus,
	takeOverTab,
} from "@/lib/tabLock";
import {
	ActivitySession,
	isDiscordActivity,
	startActivity,
} from "@/lib/discordActivity";

function uuid(): string {
	return (
		"p-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
	);
}

// Whether we're inside a Discord Activity never changes after load
const subscribeNever = () => () => {};

export interface ToastItem {
	id: number;
	msg: string;
	error?: boolean;
}

export function useFlockSocket() {
	const socketRef = useRef<Socket | null>(null);
	const [state, setState] = useState<LobbyView | null>(null);
	const [lobbiesPage, setLobbiesPage] = useState<LobbiesPage | null>(null);
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const [landingError, setLandingError] = useState("");
	const [connected, setConnected] = useState(false);
	const [reconnecting, setReconnecting] = useState(false);
	const [session, setSession] = useState<SessionInfo | null>(null);
	const [chat, setChat] = useState<ChatMessage[]>([]);
	const [chatHistoryTs, setChatHistoryTs] = useState(0);
	const myIdRef = useRef<string>("");
	const savedCodeRef = useRef<string>("");
	const toastCounter = useRef(0);
	const lastLogTsRef = useRef<number>(-1);
	const tabStatus = useSyncExternalStore(
		subscribeTabStatus,
		getTabStatus,
		getServerTabStatus,
	);
	const activityMode = useSyncExternalStore(
		subscribeNever,
		isDiscordActivity,
		() => false,
	);
	const [activity, setActivity] = useState<ActivitySession | null>(null);
	const [activityError, setActivityError] = useState("");

	useEffect(() => {
		if (!activityMode) return;
		startActivity()
			.then(setActivity)
			.catch((e) =>
				setActivityError(e?.message || "Couldn't connect to Discord."),
			);
	}, [activityMode]);

	const toast = useCallback((msg: string, error?: boolean) => {
		const id = toastCounter.current++;
		setToasts((t) => [...t, { id, msg, error }]);
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
	}, []);

	useEffect(() => {
		if (tabStatus !== "active") return;
		// Activity players sign in through Discord first and are seated by the server
		if (activityMode && !activity) return;
		let myId = localStorage.getItem("flock_player_id");
		if (!myId) {
			myId = uuid();
			localStorage.setItem("flock_player_id", myId);
		}
		myIdRef.current = myId;
		savedCodeRef.current = activity
			? ""
			: localStorage.getItem("flock_code") || "";

		const socket = io({
			path: "/socket.io",
			auth: activity ? { token: activity.token } : undefined,
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setConnected(true);
			setReconnecting(false);
			if (activity) {
				socket.emit("join_activity", {
					instanceId: activity.instanceId,
				});
			} else if (savedCodeRef.current) {
				socket.emit("rejoin", {
					playerId: myIdRef.current,
					code: savedCodeRef.current,
				});
			}
		});
		socket.on("disconnect", (reason) => {
			// A deliberate client disconnect (unmount / tab takeover) won't retry.
			if (reason !== "io client disconnect") setReconnecting(true);
		});
		socket.on(
			"joined",
			({ code, playerId }: { code: string; playerId: string }) => {
				myIdRef.current = playerId;
				savedCodeRef.current = code;
				if (!activity) localStorage.setItem("flock_code", code);
			},
		);
		socket.on("state", (s: LobbyView) => {
			if (savedCodeRef.current && s.code !== savedCodeRef.current) {
				savedCodeRef.current = s.code;
				localStorage.setItem("flock_code", s.code);
				socket.emit("rejoin", {
					playerId: myIdRef.current,
					code: s.code,
				});
			}
			if (s.game) {
				const log = s.game.log;
				const maxTs = log.length > 0 ? log[log.length - 1].ts : 0;
				if (lastLogTsRef.current === -1) {
					lastLogTsRef.current = maxTs;
				} else {
					const newEntries = log.filter(
						(e) => e.ts > lastLogTsRef.current,
					);
					for (const entry of newEntries) toast(entry.text);
					if (maxTs > lastLogTsRef.current)
						lastLogTsRef.current = maxTs;
				}
			} else {
				lastLogTsRef.current = -1;
			}
			setState(s);
		});
		socket.on("lobbies_list", (page: LobbiesPage) => {
			setLobbiesPage(page);
		});
		socket.on("session", setSession);
		socket.on("chat_history", (history: ChatMessage[]) => {
			setChat(history);
			setChatHistoryTs(history.length ? history[history.length - 1].ts : 0);
		});
		socket.on("chat", (msg: ChatMessage) =>
			setChat((c) => [...c, msg].slice(-100)),
		);
		socket.on("kicked", () => {
			localStorage.removeItem("flock_code");
			savedCodeRef.current = "";
			setState(null);
			setChat([]);
			setLandingError("You were kicked from the lobby.");
		});
		socket.on("disbanded", () => {
			localStorage.removeItem("flock_code");
			savedCodeRef.current = "";
			setState(null);
			setChat([]);
			setLandingError("The host left and the lobby was disbanded.");
		});
		socket.on("error_msg", (msg: string) => {
			setState((prev) => {
				if (!prev) {
					if (savedCodeRef.current) {
						localStorage.removeItem("flock_code");
						savedCodeRef.current = "";
					}
					setLandingError(msg);
				} else {
					toast(msg, true);
				}
				return prev;
			});
		});

		return () => {
			socket.disconnect();
			socketRef.current = null;
			lastLogTsRef.current = -1;
			setConnected(false);
			setReconnecting(false);
			setState(null);
			setSession(null);
			setChat([]);
		};
	}, [toast, tabStatus, activityMode, activity]);

	// A popup sign-in upgrades the live socket in place - no reconnect, so nobody's
	// seat flickers offline mid-game
	useEffect(
		() =>
			onAuth((result) => {
				if (result.ok && result.token) {
					socketRef.current?.emit("authenticate", { token: result.token });
					toast(`Signed in as ${result.user?.username ?? "you"}`);
				} else {
					toast("Discord sign-in didn't work - try again.", true);
				}
			}),
		[toast],
	);

	const emit = useCallback((event: string, payload?: any) => {
		socketRef.current?.emit(event, payload);
	}, []);

	const sendChat = useCallback(
		(text: string) => {
			emit("chat_send", { text });
		},
		[emit],
	);

	// Resolves with an error message, or null once the report is saved
	const reportChat = useCallback(
		async (messageId: string, reason: string, details: string): Promise<string | null> => {
			const socket = socketRef.current;
			if (!socket) return "Not connected - try again in a moment.";
			try {
				const res = await socket
					.timeout(10000)
					.emitWithAck("chat_report", { messageId, reason, details });
				return res?.error ?? null;
			} catch {
				return "Couldn't reach the server - try again.";
			}
		},
		[],
	);

	const sendQuickChat = useCallback(
		(quick: number) => {
			emit("chat_send", { quick });
		},
		[emit],
	);

	const createLobby = useCallback(
		(name: string) => {
			localStorage.setItem("flock_name", name);
			setLandingError("");
			emit("create_lobby", { playerId: myIdRef.current, name });
		},
		[emit],
	);

	const joinLobby = useCallback(
		(name: string, code: string) => {
			localStorage.setItem("flock_name", name);
			setLandingError("");
			emit("join_lobby", {
				playerId: myIdRef.current,
				name,
				code: code.toUpperCase(),
			});
		},
		[emit],
	);

	const joinActivity = useCallback(() => {
		if (!activity) return;
		setLandingError("");
		emit("join_activity", { instanceId: activity.instanceId });
	}, [emit, activity]);

	const leaveLobby = useCallback(() => {
		emit("leave_lobby");
		localStorage.removeItem("flock_code");
		setState(null);
		setChat([]);
		// The Activity has no landing page to fall back to - offer a way back in
		if (activity) setLandingError("You left the voice channel game.");
	}, [emit, activity]);

	const listLobbies = useCallback(
		(opts?: { search?: string; page?: number }) => {
			emit("list_lobbies", opts ?? {});
		},
		[emit],
	);

	const kickPlayer = useCallback(
		(targetId: string) => {
			emit("kick_player", { targetId });
		},
		[emit],
	);

	const setPublic = useCallback(
		(isPublic: boolean) => {
			emit("set_public", { isPublic });
		},
		[emit],
	);

	const setPacks = useCallback(
		(packs: PackId[]) => {
			emit("set_packs", { packs });
		},
		[emit],
	);

	const setStreamerMode = useCallback(
		(enabled: boolean) => {
			emit("set_streamer_mode", { enabled });
		}, [emit],
	);

	const regenerateCode = useCallback(() => {
		emit("regenerate_code");
	}, [emit]);

	return {
		state,
		connected,
		reconnecting,
		tabStatus,
		takeOverTab,
		activityMode,
		activity,
		activityError,
		joinActivity,
		myId: myIdRef.current,
		toasts,
		toast,
		landingError,
		emit,
		createLobby,
		joinLobby,
		leaveLobby,
		lobbiesPage,
		listLobbies,
		setPublic,
		setPacks,
		setStreamerMode,
		regenerateCode,
		kickPlayer,
		session,
		chat,
		chatHistoryTs,
		sendChat,
		sendQuickChat,
		reportChat,
	};
}
