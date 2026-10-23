"use client";

import type { DiscordSDK } from "@discord/embedded-app-sdk";

// Discord launches Activities with these query params on the page URL
export function isDiscordActivity(): boolean {
	if (typeof window === "undefined") return false;
	return new URLSearchParams(window.location.search).has("frame_id");
}

export interface ActivitySession {
	sdk: DiscordSDK;
	instanceId: string;
	// Signed session for the socket, since cookies don't reach the Activity iframe
	token: string;
}

let pending: Promise<ActivitySession> | null = null;
let current: ActivitySession | null = null;

// Our session cookie doesn't reach the Activity, so API calls carry the token instead
export function authHeaders(): Record<string, string> {
	return current ? { Authorization: `Bearer ${current.token}` } : {};
}

// The Activity sandbox can't open new tabs itself - Discord asks the user first
export function openExternal(url: string) {
	if (current) current.sdk.commands.openExternalLink({ url }).catch(() => {});
	else window.open(url, "_blank", "noopener");
}

// Runs once per page load - strict mode's double effects share the same handshake
export function startActivity(): Promise<ActivitySession> {
	pending ??= connect().catch((e) => {
		pending = null;
		throw e;
	});
	return pending;
}

async function connect(): Promise<ActivitySession> {
	const me = await fetch("/api/me").then((r) => r.json());
	const clientId: string | null = me.discordClientId;
	if (!clientId)
		throw new Error("Discord sign-in isn't set up on this server.");

	const { DiscordSDK } = await import("@discord/embedded-app-sdk");
	const sdk = new DiscordSDK(clientId);
	await sdk.ready();

	const { code } = await sdk.commands.authorize({
		client_id: clientId,
		response_type: "code",
		state: "",
		prompt: "none",
		scope: ["identify", "rpc.activities.write"],
	});

	const res = await fetch("/api/discord/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});
	if (!res.ok) throw new Error("Discord sign-in failed.");
	const { access_token, token } = await res.json();
	await sdk.commands.authenticate({ access_token });

	current = { sdk, instanceId: sdk.instanceId, token };
	sdk
		.subscribe("ACTIVITY_LAYOUT_MODE_UPDATE", (e: { layout_mode?: number }) => {
			pip = e.layout_mode === 1;
			pipListeners.forEach((l) => l());
		})
		.catch(() => {});
	// Route every external link through Discord rather than a dead-end sandboxed tab
	document.addEventListener("click", (e) => {
		const a = (e.target as Element | null)?.closest?.(
			"a[href]",
		) as HTMLAnchorElement | null;
		if (
			!a ||
			!/^https?:/.test(a.href) ||
			new URL(a.href).origin === location.origin
		)
			return;
		e.preventDefault();
		openExternal(a.href);
	});
	return current;
}

// Whether Discord has shrunk the Activity into its picture-in-picture window.
// Subscribed once per session: the SDK only tells Discord to unsubscribe after it
// drops the listener, so a quick unsubscribe/resubscribe (React strict mode) loses events.
let pip = false;
const pipListeners = new Set<() => void>();

export function subscribePip(listener: () => void) {
	pipListeners.add(listener);
	return () => {
		pipListeners.delete(listener);
	};
}

export function getPip(): boolean {
	return pip;
}

// Activities can't add presence buttons, but the status lines can link out
const SITE_URL = "https://itslam.online";

// Shows lobby / game status under "Playing Is That Sheep Looking At Me?" on Discord profiles
export function setActivityPresence(
	session: ActivitySession,
	presence: {
		details: string;
		state?: string;
		partySize?: [number, number];
		startedAt?: number;
	},
) {
	session.sdk.commands
		.setActivity({
			activity: {
				type: 0,
				details: presence.details,
				details_url: SITE_URL,
				state: presence.state,
				party: presence.partySize
					? { size: presence.partySize }
					: undefined,
				timestamps: presence.startedAt
					? { start: presence.startedAt }
					: undefined,
			},
		})
		.catch(() => {
			// Presence is cosmetic - ignore if the user declined the scope
		});
}
