"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdminStats } from "@/lib/stats";
import type { Filters } from "@/lib/analyticsSchema";
import { packsLabel } from "@/lib/deck";
import { ApiError, FilterBar, Loading, Message, SectionTitle, Stat, StatGrid, api } from "./admin/Shared";
import { ActionsTab, ChallengesTab, OverviewTab, SeatsTab, SheepTab } from "./admin/TopicTabs";
import { GamesTab } from "./admin/GamesTab";
import { ExplorerTab } from "./admin/ExplorerTab";
import { RolesTab } from "./admin/RolesTab";
import type { Permission } from "@/lib/roleDefs";

const REFRESH_MS = 10_000;

const TABS = [
	{ id: "live", label: "Live", needsDb: false, filtered: false, perm: "view_stats" },
	{ id: "overview", label: "Overview", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "games", label: "Games", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "sheep", label: "Sheep", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "actions", label: "Actions", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "challenges", label: "Challenges", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "seats", label: "Seats & balance", needsDb: true, filtered: true, perm: "view_stats" },
	{ id: "explore", label: "Explore", needsDb: true, filtered: true, perm: "manage" },
	{ id: "roles", label: "Roles", needsDb: false, filtered: false, perm: "manage" },
] as const satisfies readonly { id: string; label: string; needsDb: boolean; filtered: boolean; perm: Permission }[];
type TabId = (typeof TABS)[number]["id"];

interface Status {
	mysql: boolean;
	user: { id: string; username: string; permissions: Permission[] };
}

type Auth = { kind: "loading" } | { kind: "unauthenticated" } | { kind: "forbidden" } | { kind: "error"; message: string } | { kind: "ok"; status: Status };

function readStored<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}
function writeStored(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// storage unavailable - not important
	}
}

export function AdminDashboard() {
	const [auth, setAuth] = useState<Auth>({ kind: "loading" });
	const [tab, setTab] = useState<TabId>("live");
	const [filters, setFilters] = useState<Filters>({ status: "completed" });

	useEffect(() => {
		setTab(readStored<TabId>("itslam_admin_tab", "live"));
		setFilters(readStored<Filters>("itslam_admin_filters", { status: "completed" }));
		api<Status>("/api/admin/status")
			.then((status) => setAuth({ kind: "ok", status }))
			.catch((e) => {
				if (e instanceof ApiError && e.status === 401) setAuth({ kind: "unauthenticated" });
				else if (e instanceof ApiError && e.status === 403) setAuth({ kind: "forbidden" });
				else setAuth({ kind: "error", message: (e as Error).message });
			});
	}, []);

	const chooseTab = (t: TabId) => {
		setTab(t);
		writeStored("itslam_admin_tab", t);
	};
	const changeFilters = (f: Filters) => {
		setFilters(f);
		writeStored("itslam_admin_filters", f);
	};
	const permissions = auth.kind === "ok" ? auth.status.user.permissions : [];
	const tabs = TABS.filter((t) => permissions.includes(t.perm));
	const current = tabs.find((t) => t.id === tab) ?? TABS[0];
	const mysql = auth.kind === "ok" && auth.status.mysql;
	const canManage = permissions.includes("manage");

	return (
		<main className="min-h-screen w-full flex justify-center p-4 sm:p-6">
			<div className="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-4 sm:p-7 max-w-[1200px] w-full border-[3px] border-white self-start">
				<div className="flex items-center justify-between gap-3">
					<Link href="/" className="text-[#a06080] text-[12px] font-bold underline hover:text-[#c05090] transition">
						&larr; Back to the game
					</Link>
					{auth.kind === "ok" && (
						<span className="text-[#a06080] text-[12px] font-bold">
							{auth.status.user.username} ·{" "}
							<a href="/auth/logout" className="underline hover:text-[#c05090] transition">
								Log out
							</a>
						</span>
					)}
				</div>
				<h1 className="font-display text-3xl mt-2 text-[#7a3a58] tracking-wide font-extrabold">Admin</h1>

				{auth.kind === "loading" && <Loading />}
				{auth.kind === "unauthenticated" && (
					<Message title="You're not logged in">
						<a href="/auth/discord" className="inline-block mt-2 font-extrabold text-[14px] px-5 py-2.5 rounded-full bg-[#5865F2] text-white hover:brightness-110 transition">
							Log in with Discord
						</a>
					</Message>
				)}
				{auth.kind === "forbidden" && <Message title="No admin access">Your Discord account doesn&rsquo;t have the Viewer or Admin role.</Message>}
				{auth.kind === "error" && <Message title="Couldn't load the admin area">{auth.message}</Message>}

				{auth.kind === "ok" && (
					<>
						<nav className="flex gap-1 overflow-x-auto mt-3 mb-4 bg-[#f5d0e8] p-1 rounded-xl">
							{tabs.map((t) => (
								<button
									key={t.id}
									onClick={() => chooseTab(t.id)}
									className={`px-3 py-1.5 text-[13px] font-extrabold rounded-lg whitespace-nowrap transition ${
										current.id === t.id ? "bg-white text-[#7a3a58] shadow-sm" : "text-[#8a5a70] hover:text-[#7a3a58]"
									}`}
								>
									{t.label}
								</button>
							))}
						</nav>

						{current.needsDb && !mysql ? (
							<Message title="Game history isn't enabled">
								Set <code>MYSQL_URL</code> and restart the server to start recording games.
							</Message>
						) : (
							<>
								{current.filtered && (
									<div className="mb-4">
										<FilterBar filters={filters} onChange={changeFilters} />
									</div>
								)}
								{current.id === "live" && <LiveTab />}
								{current.id === "overview" && <OverviewTab filters={filters} />}
								{current.id === "games" && <GamesTab filters={filters} canManage={canManage} />}
								{current.id === "sheep" && <SheepTab filters={filters} />}
								{current.id === "actions" && <ActionsTab filters={filters} />}
								{current.id === "challenges" && <ChallengesTab filters={filters} />}
								{current.id === "seats" && <SeatsTab filters={filters} />}
								{current.id === "explore" && <ExplorerTab filters={filters} />}
								{current.id === "roles" && <RolesTab myId={auth.status.user.id} mysql={mysql} />}
							</>
						)}
					</>
				)}
			</div>
		</main>
	);
}

// --- Live tab (in-memory server state) ---

function formatUptime(s: number): string {
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

function formatAge(ts: number): string {
	const mins = Math.floor((Date.now() - ts) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function LiveTab() {
	const [stats, setStats] = useState<AdminStats | null>(null);
	const [fetchedAt, setFetchedAt] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setStats(await api<AdminStats>("/api/admin/stats"));
			setFetchedAt(Date.now());
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		load();
		const id = setInterval(load, REFRESH_MS);
		return () => clearInterval(id);
	}, [load]);

	if (!stats) return error ? <Message title="Couldn't load stats">{error}</Message> : <Loading />;
	const { live, server } = stats;
	const lobbies = [...stats.lobbies].sort((a, b) => b.createdAt - a.createdAt);

	return (
		<>
			<p className="text-[#8a5a70] text-[12px] font-semibold">
				Updated {new Date(fetchedAt).toLocaleTimeString()} &middot; refreshes every {REFRESH_MS / 1000}s
				{error && <span className="text-[#a03040]"> · last refresh failed</span>}
			</p>

			<SectionTitle>Right now</SectionTitle>
			<StatGrid>
				<Stat label="Connections" value={live.connectedSockets} info="Open socket connections to the server right now, including people on the menu who aren't in a lobby." />
				<Stat label="Players online" value={live.humansOnline} info="Human players currently connected to a lobby or game." />
				<Stat label="Lobbies" value={live.lobbies} info="Lobbies that currently exist, whether waiting in the lobby screen or mid-game." />
				<Stat label="Games live" value={live.gamesInProgress} info="Lobbies with a game currently in progress." />
				<Stat label="Public lobbies" value={live.publicLobbies} info="Lobbies currently listed in the public lobby browser." />
				<Stat label="Using expansions" value={live.expansionLobbies} info="Lobbies with at least one expansion pack switched on." />
				<Stat label="Bots" value={live.bots} info="Bot seats across all current lobbies, including bots that took over from a player who left." />
			</StatGrid>

			<SectionTitle>Server</SectionTitle>
			<StatGrid>
				<Stat label="Uptime" value={formatUptime(server.uptimeSeconds)} info="How long the server process has been running since its last restart or deploy." />
				<Stat label="Memory" value={`${server.memoryMb} MB`} info="Memory currently used by the server process." />
				<Stat label="Redis" value={server.redis} info="Status of the Redis connection used to keep lobbies alive across restarts." />
				<Stat label="Node" value={server.node} info="Node.js version the server is running on." />
			</StatGrid>

			<SectionTitle>Lobbies ({lobbies.length})</SectionTitle>
			{lobbies.length === 0 ? (
				<p className="text-[13px] text-[#8a5a70] font-semibold">No lobbies open.</p>
			) : (
				<div className="overflow-x-auto bg-white rounded-xl border-2 border-[#f5d0e8]">
					<table className="w-full text-[13px] text-left">
						<thead className="text-[11px] uppercase tracking-wide text-[#8a5a70]">
							<tr>
								{["Code", "Status", "Visibility", "Card packs", "Players", "Opened"].map((h) => (
									<th key={h} className="px-3 py-2 font-extrabold">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="text-[#3d1a2c] font-semibold">
							{lobbies.map((l) => (
								<tr key={l.code} className="border-t border-[#f5d0e8]">
									<td className="px-3 py-2 font-extrabold tracking-widest">{l.code}</td>
									<td className="px-3 py-2 capitalize">{l.status}</td>
									<td className="px-3 py-2">{l.isPublic ? "Public" : "Private"}</td>
									<td className="px-3 py-2 whitespace-nowrap">{packsLabel(l.packs)}</td>
									<td className="px-3 py-2 tabular-nums">
										{l.humansOnline} online / {l.players}
										{l.bots > 0 && ` (${l.bots} bot${l.bots > 1 ? "s" : ""})`}
									</td>
									<td className="px-3 py-2 whitespace-nowrap">{formatAge(l.createdAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
