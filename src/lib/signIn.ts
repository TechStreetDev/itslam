"use client";

// Discord sign-in in a popup, so a player can sign in mid-game without leaving it.
// The popup's last page (popupResult in auth.ts) reports back here on a BroadcastChannel,
// plus window.opener when Discord hasn't cut the popup off from us.

const AUTH_CHANNEL = "itslam-auth";

export interface AuthResult {
	type: "itslam:auth";
	ok: boolean;
	token?: string;
	user?: { id: string; username: string; avatar: string | null };
}

type Listener = (result: AuthResult) => void;
const listeners = new Set<Listener>();
let wired = false;
let lastToken: string | undefined;

function deliver(data: unknown) {
	const result = data as AuthResult | null;
	if (result?.type !== "itslam:auth") return;
	// Both channels usually deliver the same result
	if (result.ok && result.token === lastToken) return;
	lastToken = result.token;
	listeners.forEach((l) => l(result));
}

function wire() {
	if (wired || typeof window === "undefined") return;
	wired = true;
	try {
		new BroadcastChannel(AUTH_CHANNEL).onmessage = (e) => deliver(e.data);
	} catch {
		// Old browsers - window.opener below still covers most popups
	}
	window.addEventListener("message", (e) => {
		if (e.origin === window.location.origin) deliver(e.data);
	});
}

export function onAuth(listener: Listener): () => void {
	wire();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function signInWithPopup() {
	wire();
	const w = 500;
	const h = 760;
	const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
	const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
	const popup = window.open(
		"/auth/discord?popup=1",
		"itslam-signin",
		`popup,width=${w},height=${h},left=${left},top=${top}`,
	);
	// Popup blocked - sign in in this tab instead; the lobby is rejoined on the way back
	if (!popup) window.location.href = "/auth/discord";
}
