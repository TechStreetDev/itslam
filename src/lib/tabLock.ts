"use client";

// Only one tab per browser may hold the game connection, since every tab shares
// the same flock_player_id and would otherwise fight over the same seat.
// Lives at module level so React strict mode's double effects don't contend for it.

export type TabStatus = "pending" | "active" | "blocked";

const LOCK_NAME = "flock_active_tab";
const CHANNEL_NAME = "flock_tab";

let status: TabStatus = "pending";
let release: (() => void) | null = null;
let started = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function setStatus(next: TabStatus) {
	status = next;
	listeners.forEach((l) => l());
}

function hold(): Promise<void> {
	setStatus("active");
	return new Promise<void>((resolve) => {
		release = resolve;
	});
}

function start() {
	if (started || typeof window === "undefined") return;
	started = true;

	// Web Locks need a secure context; without them, behave as before.
	if (!navigator.locks) {
		setStatus("active");
		return;
	}

	if (typeof BroadcastChannel !== "undefined") {
		channel = new BroadcastChannel(CHANNEL_NAME);
		channel.onmessage = (e) => {
			if (e.data === "takeover" && release) {
				const r = release;
				release = null;
				setStatus("blocked");
				r();
			}
		};
	}

	navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
		if (!lock) {
			setStatus("blocked");
			return;
		}
		return hold();
	});
}

export function takeOverTab() {
	if (status !== "blocked" || !navigator.locks) return;
	setStatus("pending");
	channel?.postMessage("takeover");
	navigator.locks.request(LOCK_NAME, () => hold());
}

export function subscribeTabStatus(listener: () => void) {
	start();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getTabStatus(): TabStatus {
	return status;
}

export function getServerTabStatus(): TabStatus {
	return "pending";
}
