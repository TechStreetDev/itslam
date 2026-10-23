"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isDiscordActivity } from "@/lib/discordActivity";

interface Me {
	loginEnabled: boolean;
	user: { id: string; username: string; permissions: string[] } | null;
}

const linkClass = "text-[11px] font-semibold text-[#8a5a70] underline hover:text-[#c05090] transition";

export function SiteFooter() {
	const [me, setMe] = useState<Me | null>(null);

	const inActivity = isDiscordActivity();

	useEffect(() => {
		if (inActivity) return;
		fetch("/api/me")
			.then((r) => (r.ok ? r.json() : null))
			.then(setMe)
			.catch(() => setMe(null));
	}, [inActivity]);

	// Leaving the page would drop the Activity's launch params, and login is already Discord's
	if (inActivity) return null;

	return (
		<footer className="mt-4 text-center text-[11px] font-semibold text-[#8a5a70] flex items-center justify-center gap-1.5">
			<Link href="/privacy" className={linkClass}>
				Privacy Policy
			</Link>
			{me?.user ? (
				<>
					<span>&middot;</span>
					{me.user.permissions.includes("view_stats") && (
						<>
							<Link href="/admin" className={linkClass}>
								Admin
							</Link>
							<span>&middot;</span>
						</>
					)}
					<a href="/auth/logout" className={linkClass} title={`Logged in as ${me.user.username}`}>
						Log out
					</a>
				</>
			) : (
				me?.loginEnabled && (
					<>
						<span>&middot;</span>
						<a href="/auth/discord" className={linkClass}>
							Log in
						</a>
					</>
				)
			)}
		</footer>
	);
}
