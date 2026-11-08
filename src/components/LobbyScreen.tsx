"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Check, Crown, Link2, Plus, RefreshCw } from "lucide-react";
import { LobbyView, MAX_PLAYERS, PackId } from "@/lib/types";
import { authHeaders } from "@/lib/discordActivity";
import { PACKS } from "@/lib/deck";
import { SiteFooter } from "@/components/SiteFooter";
import { LobbySettingsModal } from "@/components/LobbySettingsModal";
import {
	History,
	StatsLoader,
	StatsModal,
	Summary,
} from "@/components/StatsModal";
import { usePresence } from "@/hooks/usePresence";

type Row =
	| { kind: "player"; p: LobbyView["players"][number] }
	// The empty seat: invite someone, and/or (admin hosts) fill it with a bot
	| { kind: "seat" };

export function LobbyScreen({
	state,
	myId,
	onStart,
	onLeave,
	onAddBot,
	onSetPublic,
	onSetPacks,
	onSetStreamerMode,
	onSetTimers,
	onRegenerateCode,
	onKick,
	onLoadStats,
}: {
	state: LobbyView;
	myId: string;
	onStart: () => void;
	onLeave: () => void;
	onAddBot: () => void;
	onSetPublic: (isPublic: boolean) => void;
	onSetPacks: (packs: PackId[]) => void;
	onSetStreamerMode: (enabled: boolean) => void;
	onSetTimers: (timers: {
		turnSeconds?: number;
		reconnectSeconds?: number;
	}) => void;
	onRegenerateCode: () => void;
	onKick: (targetId: string) => void;
	onLoadStats: <T>(
		playerId: string,
		part: "summary" | "history",
		page?: number,
	) => Promise<T>;
}) {
	const iAmHost = state.hostId === myId;
	const [settingsOpen, setSettingsOpen] = useState(false);
	// What the signed-in user's roles let them do here (hidden packs, adding bots)
	const [permissions, setPermissions] = useState<string[]>([]);
	useEffect(() => {
		fetch("/api/me", { headers: authHeaders() })
			.then((r) => r.json())
			.then((me) => setPermissions(me.user?.permissions ?? []))
			.catch(() => {});
	}, []);
	const canAddBot = iAmHost && permissions.includes("add_bots");
	// Discord Activity lobbies are joined from the voice channel - there's no link to share
	const canInvite = !state.isActivity;
	const seatOpen =
		state.players.length < MAX_PLAYERS && (canInvite || canAddBot);
	// The player list, plus the empty seat while there's room
	const rows = usePresence<Row>(
		[
			...state.players.map((p) => ({ kind: "player" as const, p })),
			...(seatOpen ? [{ kind: "seat" as const }] : []),
		],
		(r) => (r.kind === "player" ? r.p.id : "empty-seat"),
		// Matches the seat-in / seat-out animations in globals.css
		300,
	);
	// The empty seat and a player swapping places (the lobby filling up, or someone leaving
	// a full one) shouldn't grow one row while shrinking the other: the seat just turns into the
	// new player, or opens back up exactly as the leaving row closes, so the panel holds still
	const playerJoined = rows.some(
		(r) => r.entering && r.item.kind === "player",
	);
	const playerLeft = rows.some((r) => r.leaving && r.item.kind === "player");
	const seatLeft = rows.some((r) => r.leaving && r.item.kind === "seat");
	const shownRows = rows.filter(
		(r) => !(r.item.kind === "seat" && r.leaving && playerJoined),
	);
	const rowClass = (r: (typeof rows)[number]) => {
		if (r.leaving) return "seat-out";
		if (!r.entering) return undefined;
		if (r.item.kind === "player") return seatLeft ? "seat-fade" : "seat-in";
		return playerLeft ? "seat-swap-in" : "seat-in";
	};
	// Whose stats are open, if anyone's
	const [statsFor, setStatsFor] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const statsLoader = (playerId: string): StatsLoader => ({
		summary: () => onLoadStats<Summary>(playerId, "summary"),
		history: (page) => onLoadStats<History>(playerId, "history", page),
	});
	const [copied, setCopied] = useState(false);
	// The empty seat's invite button says "Link copied!" for a moment
	const [inviteCopied, setInviteCopied] = useState(false);
	const inviteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(inviteTimer.current), []);
	const copyInvite = () => {
		navigator.clipboard
			.writeText(`${window.location.origin}/join/${state.code}`)
			.then(() => {
				setInviteCopied(true);
				clearTimeout(inviteTimer.current);
				inviteTimer.current = setTimeout(
					() => setInviteCopied(false),
					1800,
				);
			})
			.catch(() => {});
	};
	const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(copiedTimer.current), []);

	const copyCode = () => {
		navigator.clipboard
			.writeText(state.code)
			.then(() => {
				setCopied(true);
				clearTimeout(copiedTimer.current);
				copiedTimer.current = setTimeout(() => setCopied(false), 1800);
			})
			.catch(() => {});
	};
	const minPlayers = 2;
	// Starting with someone offline would leave the game waiting on a player who isn't there
	const offline = state.players.find((p) => !p.connected && !p.isBot);

	return (
		<section className="min-h-dvh w-full flex flex-col items-center justify-center p-6">
			<div className="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-8 max-w-[440px] w-full text-center">
				{state.isActivity ? (
					<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-[18px]">
						Anyone in the voice channel can join this flock
					</p>
				) : (
					<>
						<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs">
							{copied
								? "Copied to clipboard!"
								: "Lobby code - click to copy"}
						</p>
						<div className="flex items-center justify-center gap-2 my-1.5 mb-[18px]">
							<button
								onClick={copyCode}
								title="Copy lobby code"
								aria-label={
									state.streamerMode
										? "Copy hidden lobby code"
										: `Copy lobby code ${state.code}`
								}
								className="font-display text-5xl text-[#7a3a58] font-extrabold rounded-xl px-2 hover:bg-[#ffe0f0] transition"
							>
								{/* Fixed-width cells so every code is the same width - the display font is proportional */}
								<span
									className={`flex gap-[0.15em] ${state.streamerMode ? "blur-md select-none" : ""}`}
								>
									{state.code.split("").map((ch, i) => (
										<span
											key={i}
											className="inline-block w-[0.85em] text-center"
										>
											{ch}
										</span>
									))}
								</span>
							</button>
							{iAmHost && (
								<button
									onClick={onRegenerateCode}
									title="Generate a new lobby code"
									aria-label="Generate a new lobby code"
									className="text-[#c05090] border-2 border-[#f5d0e8] rounded-full w-9 h-9 flex items-center justify-center shrink-0 hover:bg-[#ffe0f0] hover:border-[#c05090] transition"
								>
									<RefreshCw size={16} strokeWidth={3} />
								</button>
							)}
						</div>
					</>
				)}

				{/* Rows grow in and shrink out, so everything below moves smoothly. Spacing is
					    each row's own padding (not the list's gap) so it animates too. */}
				<ul className="flex flex-col mb-[10px]">
					{shownRows.map((r) => {
						const { item: row, key, leaving } = r;
						return (
							<li
								key={key}
								className={rowClass(r)}
								aria-hidden={leaving || undefined}
							>
								<div className="pb-2">
									{row.kind === "player" ? (
										<div className="h-12 bg-white rounded-xl px-4 font-bold border-2 border-[#f5d0e8] flex items-center justify-between gap-2">
											<div className="flex items-center gap-1.5 min-w-0">
												<span className="truncate">
													{row.p.name}
													{row.p.id === myId
														? " (you)"
														: ""}
													{row.p.id ===
														state.hostId && (
														<Crown
															size={16}
															strokeWidth={2.5}
															fill="currentColor"
															className="inline-block ml-1.5 align-[-2px] text-[#f0b429]"
															aria-label="Lobby host"
														>
															<title>
																Lobby host
															</title>
														</Crown>
													)}
													{row.p.isBot ? (
														<span className="ml-1.5 text-[11px] font-extrabold text-[#9a7888] bg-[#f5d0e8] rounded-full px-2 py-0.5">
															Bot
														</span>
													) : null}
												</span>
												{row.p.hasStats && (
													<button
														onClick={() =>
															setStatsFor({
																id: row.p.id,
																name: row.p
																	.name,
															})
														}
														title={
															row.p.id === myId
																? "My stats"
																: `${row.p.name}'s stats`
														}
														aria-label={
															row.p.id === myId
																? "My stats"
																: `${row.p.name}'s stats`
														}
														className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[#b890a5] hover:text-[#c05090] hover:bg-[#ffe0f0] transition"
													>
														<BarChart3
															size={15}
															strokeWidth={2.5}
														/>
													</button>
												)}
											</div>
											<div className="flex items-center gap-2 shrink-0">
												<span
													className={`text-[11px] font-extrabold text-white rounded-full px-2 py-0.5 ${row.p.connected ? "bg-[#c05090]" : "bg-[#c8a0b5]"}`}
												>
													{row.p.connected
														? "Online"
														: "Offline"}
												</span>
												{iAmHost &&
													row.p.id !== myId && (
														<button
															onClick={() =>
																onKick(row.p.id)
															}
															title={`Kick ${row.p.name}`}
															className="text-[11px] font-extrabold text-[#c05090] border border-[#f5d0e8] rounded-full w-6 h-6 flex items-center justify-center hover:bg-[#ffe0f0] hover:border-[#c05090] transition leading-none"
														>
															×
														</button>
													)}
											</div>
										</div>
									) : (
										// Same h-12 as a player card. Admin hosts get it split: invite | add bot.
										<div className="h-12 rounded-xl border-2 border-dashed border-[#e0a8c8] flex items-stretch overflow-hidden">
											{canInvite && (
												<button
													onClick={copyInvite}
													disabled={leaving}
													title="Copy a link that takes friends straight to this lobby"
													className="flex-1 min-w-0 px-3 font-bold text-[#c05090] flex items-center justify-center gap-1.5 hover:bg-white/60 transition"
												>
													{inviteCopied ? (
														<Check
															size={16}
															strokeWidth={3}
														/>
													) : (
														<Link2
															size={16}
															strokeWidth={3}
														/>
													)}
													<span className="truncate">
														{inviteCopied
															? "Link copied!"
															: "Invite player"}
													</span>
												</button>
											)}
											{canInvite && canAddBot && (
												<div className="my-2.5 border-l-2 border-dashed border-[#e0a8c8]" />
											)}
											{canAddBot && (
												<button
													onClick={onAddBot}
													disabled={leaving}
													className="flex-1 min-w-0 px-3 font-bold text-[#c05090] flex items-center justify-center gap-1.5 hover:bg-white/60 transition"
												>
													<Plus
														size={16}
														strokeWidth={3}
													/>
													<span className="truncate">
														Add bot
													</span>
												</button>
											)}
										</div>
									)}
								</div>
							</li>
						);
					})}
				</ul>

				<p className="text-[#8a5a70] font-semibold mb-3.5">
					{iAmHost
						? state.players.length < minPlayers
							? `Need at least ${minPlayers} player${minPlayers > 1 ? "s" : ""} to start.`
							: offline
								? `${offline.name} is offline - please wait for them to reconnect or kick them from the lobby.`
								: "Ready when you are!"
						: "Waiting for the host to start…"}
				</p>

				{iAmHost && (
					<button
						onClick={onStart}
						disabled={
							state.players.length < minPlayers || !!offline
						}
						className="w-full mb-2 font-extrabold text-[15px] px-5 py-3 rounded-full shadow bg-[#c05090] text-white disabled:opacity-50 hover:brightness-105 active:translate-y-px transition"
					>
						Start Game
					</button>
				)}

				<button
					onClick={() => setSettingsOpen(true)}
					className="w-full mb-2.5 font-extrabold text-[14px] px-5 py-3 rounded-full border-2 bg-[#f5f0ff] text-[#5a3a8a] border-[#c8b8e8] hover:brightness-95 transition"
				>
					⚙ Lobby settings
					<span className="block text-[11px] font-bold opacity-75">
						{state.isActivity
							? "Voice channel"
							: state.isPublic
								? "Public"
								: "Private"}{" "}
						· {state.streamerMode ? "Streamer mode · " : ""}
						{state.packs.map((id) => PACKS[id].name).join(" + ")}
					</span>
				</button>
				<div className="flex items-center justify-center gap-4">
					<button
						onClick={onLeave}
						className="text-[#8a5a70] font-bold underline text-sm"
					>
						Leave lobby
					</button>
				</div>
			</div>
			<SiteFooter />
			<LobbySettingsModal
				open={settingsOpen}
				state={state}
				canEdit={iAmHost}
				onClose={() => setSettingsOpen(false)}
				onSetPublic={onSetPublic}
				onSetPacks={onSetPacks}
				onSetStreamerMode={onSetStreamerMode}
				onSetTimers={onSetTimers}
				canUseHidden={permissions.includes("hidden_packs")}
			/>
			{/* Your own stats come straight from your account; anyone else's via the server,
			    which knows whose seat is whose */}
			<StatsModal
				open={!!statsFor}
				onClose={() => setStatsFor(null)}
				name={
					statsFor && statsFor.id !== myId ? statsFor.name : undefined
				}
				loader={
					statsFor && statsFor.id !== myId
						? statsLoader(statsFor.id)
						: undefined
				}
			/>
		</section>
	);
}
