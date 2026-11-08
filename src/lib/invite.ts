"use client";

// Invite links (/join/CODE) hand the lobby code to the main page through session storage,
// so the address bar ends up back at plain "/". Read on load, then cleared.
const KEY = "flock_invite";

export function stashInvite(code: string) {
	try {
		sessionStorage.setItem(KEY, code);
	} catch {
		// storage blocked - they'll land on the normal landing page
	}
}

export function readInvite(): string | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return sessionStorage.getItem(KEY) || undefined;
	} catch {
		return undefined;
	}
}

export function clearInvite() {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// nothing to clear
	}
}
