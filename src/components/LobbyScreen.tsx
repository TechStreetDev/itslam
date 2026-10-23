"use client";

import { useState } from "react";
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
	onKick,
	isDev,
}: {
	state: LobbyView;
	myId: string;
	onStart: () => void;
	onLeave: () => void;
	onAddBot: () => void;
	onSetPublic: (isPublic: boolean) => void;
	onSetPacks: (packs: PackId[]) => void;
	onKick: (targetId: string) => void;
	isDev?: boolean;
}) {
	const iAmHost = state.hostId === myId;
	const [settingsOpen, setSettingsOpen] = useState(false);
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
							Lobby code - share it with your flock
						</p>
						<div className="font-display text-5xl tracking-[0.2em] text-[#7a3a58] my-1.5 mb-[18px] font-extrabold">
							{state.code}
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
					<>
						<button
							onClick={onStart}
							disabled={state.players.length < minPlayers || !!offline}
							className="w-full mb-2 font-extrabold text-[15px] px-5 py-3 rounded-full shadow bg-[#c05090] text-white disabled:opacity-50 hover:brightness-105 active:translate-y-px transition"
						>
							Start Game
						</button>
						{isDev && state.players.length < 4 && (
							<button
								onClick={onAddBot}
								className="w-full mb-2 font-extrabold text-[15px] px-5 py-3 rounded-full shadow bg-[#9a7888] text-white hover:brightness-105 active:translate-y-px transition"
							>
								+ Add Bot
							</button>
						)}
					</>
				)}
				<button
					onClick={() => setSettingsOpen(true)}
					className="w-full mb-2.5 font-extrabold text-[14px] px-5 py-3 rounded-full border-2 bg-[#f5f0ff] text-[#5a3a8a] border-[#c8b8e8] hover:brightness-95 transition"
				>
					⚙ Lobby settings
					<span className="block text-[11px] font-bold opacity-75">
						{state.isActivity ? "Voice channel" : state.isPublic ? "Public" : "Private"} ·{" "}
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
			{settingsOpen && (
				<LobbySettingsModal
					state={state}
					canEdit={iAmHost}
					onClose={() => setSettingsOpen(false)}
					onSetPublic={onSetPublic}
					onSetPacks={onSetPacks}
				/>
			)}
		</section>
	);
}
