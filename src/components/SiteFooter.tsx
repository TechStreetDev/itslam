"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { isDiscordActivity } from "@/lib/discordActivity";
import { onAuth } from "@/lib/signIn";
import { canOpenAdmin, Permission } from "@/lib/roleDefs";
import { LoginButton } from "@/components/LoginButton";

interface Me {
	loginEnabled: boolean;
	user: { id: string; username: string; permissions: Permission[] } | null;
}

export const DONATE_URL = "https://buymeacoffee.com/techstreet";

const linkClass = "underline decoration-white/40 underline-offset-2 hover:decoration-white transition";

// Sits on the meadow background, below the page's panel. account: show the log in / log out
// links - off where the page already has them in its header.
export function SiteFooter({ account = true }: { account?: boolean }) {
	const [me, setMe] = useState<Me | null>(null);

	const inActivity = isDiscordActivity();

	useEffect(() => {
		if (inActivity) return;
		const load = () =>
			fetch("/api/me")
				.then((r) => (r.ok ? r.json() : null))
				.then(setMe)
				.catch(() => setMe(null));
		load();
		// Signed in from the popup - pick up the new session cookie
		return onAuth((result) => {
			if (result.ok) load();
		});
	}, [inActivity]);

	// Leaving the page would drop the Activity's launch params, and login is already Discord's
	if (inActivity) return null;

	const links: React.ReactNode[] = [
		<Link key="privacy" href="/privacy" className={linkClass}>
			Privacy
		</Link>,
		<a key="discord" href="https://discord.gg/SwtaMCV4BE" target="_blank" rel="noopener noreferrer" className={linkClass}>
			Community Discord
		</a>,
	];
	if (me?.user && canOpenAdmin(me.user.permissions))
		links.push(
			<Link key="admin" href="/admin" className={linkClass}>
				Admin
			</Link>,
		);
	if (account && me?.user)
		links.push(
			<a key="logout" href="/auth/logout" className={linkClass} title={`Logged in as ${me.user.username}`}>
				Log out
			</a>,
		);

	return (
		<footer className="mt-4 w-full flex flex-col items-center gap-2.5 text-[12px] font-bold text-white [text-shadow:0_1px_3px_rgba(60,20,40,0.45)]">
			<div className="flex flex-wrap items-center justify-center gap-2">
				{account && !me?.user && me?.loginEnabled && <LoginButton size="sm" />}
				<a
					href={DONATE_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 rounded-full bg-[#ffdd00] text-[#3d2a00] px-3.5 py-1.5 text-[12px] font-extrabold shadow-[0_3px_10px_rgba(60,20,40,0.25)] [text-shadow:none] hover:brightness-105 active:scale-[0.98] transition"
				>
					<Coffee size={14} strokeWidth={2.5} />
					Support the developer
				</a>
			</div>
			<nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
				{links.map((l, i) => (
					<span key={i} className="flex items-center gap-2">
						{i > 0 && <span className="opacity-60">&middot;</span>}
						{l}
					</span>
				))}
			</nav>
			<p className="text-[11px] font-semibold opacity-85 text-center px-4">
				An online adaptation of the card game by{" "}
				<a href="https://www.youtube.com/@Zedaph" target="_blank" rel="noopener noreferrer" className={linkClass}>
					Zedaph
				</a>
			</p>
		</footer>
	);
}
