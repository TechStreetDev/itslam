"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { LobbiesPage, LobbyView } from "@/lib/types";

function uuid(): string {
	return (
		"p-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
	);
}

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
	const myIdRef = useRef<string>("");
	const savedCodeRef = useRef<string>("");
	const toastCounter = useRef(0);
	const lastLogTsRef = useRef<number>(-1);

	const toast = useCallback((msg: string, error?: boolean) => {
		const id = toastCounter.current++;
		setToasts((t) => [...t, { id, msg, error }]);
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
	}, []);

	useEffect(() => {
		let myId = localStorage.getItem("flock_player_id");
		if (!myId) {
			myId = uuid();
			localStorage.setItem("flock_player_id", myId);
		}
		myIdRef.current = myId;
		savedCodeRef.current = localStorage.getItem("flock_code") || "";

		const socket = io({ path: "/socket.io" });
		socketRef.current = socket;

		socket.on("connect", () => {
			setConnected(true);
			if (savedCodeRef.current) {
				socket.emit("rejoin", {
					playerId: myIdRef.current,
					code: savedCodeRef.current,
				});
			}
		});
		socket.on("joined", ({ code }: { code: string }) => {
			savedCodeRef.current = code;
			localStorage.setItem("flock_code", code);
		});
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
		socket.on("kicked", () => {
			localStorage.removeItem("flock_code");
			savedCodeRef.current = "";
			setState(null);
			setLandingError("You were kicked from the lobby.");
		});
		socket.on("disbanded", () => {
			localStorage.removeItem("flock_code");
			savedCodeRef.current = "";
			setState(null);
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
		};
	}, [toast]);

	const emit = useCallback((event: string, payload?: any) => {
		socketRef.current?.emit(event, payload);
	}, []);

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

	const leaveLobby = useCallback(() => {
		emit("leave_lobby");
		localStorage.removeItem("flock_code");
		setState(null);
	}, [emit]);

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

	return {
		state,
		connected,
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
		kickPlayer,
	};
}
