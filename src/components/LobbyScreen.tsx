"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { LobbyView, PackId } from "@/lib/types";
import { PACKS } from "@/lib/deck";
import { SiteFooter } from "@/components/SiteFooter";
import { LobbySettingsModal } from "@/components/LobbySettingsModal";

export function LobbyScreen({
	state,
	myId,
	onStart,
	onLeave,
	onAddBot,
	onSetPublic,
	onSetPacks,
	onSetStreamerMode,
	onRegenerateCode,
	onKick,
}: {
	state: LobbyView;
	myId: string;
	onStart: () => void;
	onLeave: () => void;
	onAddBot: () => void;
	onSetPublic: (isPublic: boolean) => void;
	onSetPacks: (packs: PackId[]) => void;
	onSetStreamerMode: (enabled: boolean) => void;
	onRegenerateCode: () => void;
	onKick: (targetId: string) => void;
}) {
	const iAmHost = state.hostId === myId;
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [copied, setCopied] = useState(false);
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
		<section className="min-h-screen w-full flex flex-col items-center justify-center p-6">
			<div className="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-8 max-w-[440px] w-full text-center">
				{state.isActivity ? (
					<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-[18px]">
						Anyone in the voice channel can join this flock
					</p>
				) : (
					<>
						<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs">
							{copied ? "Copied to clipboard!" : "Lobby code - click to copy"}
						</p>
						<div className="flex items-center justify-center gap-2 my-1.5 mb-[18px]">
							<button
								onClick={copyCode}
								title="Copy lobby code"
								aria-label={state.streamerMode ? "Copy hidden lobby code" : `Copy lobby code ${state.code}`}
								className="font-display text-5xl text-[#7a3a58] font-extrabold rounded-xl px-2 hover:bg-[#ffe0f0] transition"
							>
								{/* Fixed-width cells so every code is the same width - the display font is proportional */}
								<span className={`flex gap-[0.15em] ${state.streamerMode ? "blur-md select-none" : ""}`}>
									{state.code.split("").map((ch, i) => (
										<span key={i} className="inline-block w-[0.85em] text-center">
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

				<ul className="flex flex-col gap-2 mb-[18px]">
					{state.players.map((p) => (
						<li
							key={p.id}
							className="bg-white rounded-xl px-4 py-2.5 font-bold border-2 border-[#f5d0e8] flex items-center justify-between gap-2"
						>
							<span className="truncate">
								{p.name}
								{p.id === myId ? " (you)" : ""}
								{p.id === state.hostId ? " ⭐" : ""}
								{p.isBot ? (
									<span className="ml-1.5 text-[11px] font-extrabold text-[#9a7888] bg-[#f5d0e8] rounded-full px-2 py-0.5">
										Bot
									</span>
								) : null}
							</span>
							<div className="flex items-center gap-2 shrink-0">
								<span
									className={`text-[11px] font-extrabold text-white rounded-full px-2 py-0.5 ${p.connected ? "bg-[#c05090]" : "bg-[#c8a0b5]"}`}
								>
									{p.connected ? "Online" : "Offline"}
								</span>
								{iAmHost && p.id !== myId && (
									<button
										onClick={() => onKick(p.id)}
										title={`Kick ${p.name}`}
										className="text-[11px] font-extrabold text-[#c05090] border border-[#f5d0e8] rounded-full w-6 h-6 flex items-center justify-center hover:bg-[#ffe0f0] hover:border-[#c05090] transition leading-none"
									>
										×
									</button>
								)}
							</div>
						</li>
					))}
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
						disabled={state.players.length < minPlayers || !!offline}
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
						{state.isActivity ? "Voice channel" : state.isPublic ? "Public" : "Private"} ·{" "}
						{state.streamerMode ? "Streamer mode · " : ""}
						{state.packs.map((id) => PACKS[id].name).join(" + ")}
					</span>
				</button>
				<button
					onClick={onLeave}
					className="text-[#8a5a70] font-bold underline text-sm"
				>
					Leave lobby
				</button>
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
				onAddBot={onAddBot}
			/>
		</section>
	);
}
