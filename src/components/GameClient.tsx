"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFlockSocket } from "@/hooks/useFlockSocket";
import { getPip, setActivityPresence, subscribePip } from "@/lib/discordActivity";
import { LobbyView, MAX_PLAYERS } from "@/lib/types";
import { LandingScreen } from "@/components/LandingScreen";
import { LobbyScreen } from "@/components/LobbyScreen";
import { GameScreen } from "@/components/GameScreen";
import { ActivityPreview } from "@/components/ActivityPreview";

const panelClass =
	"bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-9 max-w-[420px] w-full text-center border-[3px] border-white";
const primaryButtonClass =
	"mt-6 w-full font-extrabold text-[15px] px-5 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.18)] bg-[#c05090] text-white hover:brightness-105 active:translate-y-px active:scale-[0.98] transition";

function presenceFor(state: LobbyView | null) {
	if (!state) return { details: "Joining the flock" };
	const partySize: [number, number] = [state.players.length, MAX_PLAYERS];
	if (!state.game) return { details: "In the lobby", state: "Waiting to start", partySize };
	if (state.game.ended) return { details: "Counting sheep", state: "Game over", partySize };
	return { details: "Building a flock", state: "In a game", partySize };
}

export function GameClient() {
	const {
		state,
		connected,
		reconnecting,
		tabStatus,
		takeOverTab,
		activityMode,
		activity,
		activityError,
		joinActivity,
		myId,
		toasts,
		landingError,
		emit,
		createLobby,
		joinLobby,
		leaveLobby,
		lobbiesPage,
		listLobbies,
		setPublic,
		setPacks,
		setStreamerMode,
		regenerateCode,
		kickPlayer,
	} = useFlockSocket();

	// Mirror lobby/game status onto the players' Discord profiles
	const gameStartRef = useRef<number | undefined>(undefined);
	const presence = presenceFor(state);
	const presenceKey = JSON.stringify(presence);
	useEffect(() => {
		if (!activity) return;
		if (!state?.game) gameStartRef.current = undefined;
		else gameStartRef.current ??= Math.floor(Date.now() / 1000);
		setActivityPresence(activity, { ...presence, startedAt: gameStartRef.current });
	}, [activity, presenceKey]);

	// Discord's picture-in-picture window is too small for the board - show a summary over it
	const pip = useSyncExternalStore(subscribePip, getPip, () => false);
	// The page underneath would otherwise still scroll behind the preview
	useEffect(() => {
		if (!pip) return;
		const html = document.documentElement;
		html.style.overflow = "hidden";
		return () => {
			html.style.overflow = "";
		};
	}, [pip]);

	return (
		<>
			{pip && <ActivityPreview state={state} myId={myId} />}

			<div className="fixed top-3.5 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 items-center pointer-events-none">
				{reconnecting && (
					<div className="flex items-center gap-2.5 px-[18px] py-2.5 rounded-full font-bold text-white shadow-lg bg-[#c0503a]">
						<div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
						Connection lost, reconnecting…
					</div>
				)}
				
				{toasts.map((t) => (
					<div
						key={t.id}
						className={`animate-toast-in px-[18px] py-2.5 rounded-full font-bold text-white shadow-lg ${t.error ? "bg-[#c0503a]" : "bg-[#4a3220]"}`}
					>
						{t.msg}
					</div>
				))}
			</div>

			{tabStatus === "blocked" && (
				<section className="fixed inset-0 z-[90] flex items-center justify-center p-6">
					<div className={panelClass}>
						<h1 className="font-display text-2xl text-[#7a3a58] tracking-wide font-extrabold">
							Already open in another tab
						</h1>

						<p className="text-[#5a3048] text-[14px] font-medium mt-3 leading-relaxed">
							Is That Sheep Looking At Me? is already open in
							another tab of this browser. Currently only one tab
							is able to play at a time.
						</p>
						
						<button
							onClick={takeOverTab}
							className={primaryButtonClass}
						>
							Use this tab instead
						</button>
					</div>
				</section>
			)}

			{activityError && (
				<section className="fixed inset-0 z-[90] flex items-center justify-center p-6">
					<div className={panelClass}>
						<h1 className="font-display text-2xl text-[#7a3a58] tracking-wide font-extrabold">
							Couldn&apos;t connect to Discord
						</h1>
						<p className="text-[#5a3048] text-[14px] font-medium mt-3 leading-relaxed">
							{activityError} Close the Activity and launch it again
							from the channel.
						</p>
					</div>
				</section>
			)}

			{!activityError && tabStatus !== "blocked" && !connected && (
				<div className="fixed inset-0 flex items-center justify-center bg-[#f5efe6]">
					<div className="w-10 h-10 rounded-full border-4 border-[#4a3220] border-t-transparent animate-spin" />
				</div>
			)}

			{activityMode && connected && !state && (
				<section className="min-h-screen w-full flex items-center justify-center p-6">
					{landingError ? (
						<div className={panelClass}>
							<h1 className="font-display text-2xl text-[#7a3a58] tracking-wide font-extrabold">
								Not in the flock
							</h1>
							<p className="text-[#5a3048] text-[14px] font-medium mt-3 leading-relaxed">
								{landingError}
							</p>
							<button onClick={joinActivity} className={primaryButtonClass}>
								Join the channel game
							</button>
						</div>
					) : (
						<div className="w-10 h-10 rounded-full border-4 border-[#4a3220] border-t-transparent animate-spin" />
					)}
				</section>
			)}

			{!activityMode && connected && !state && (
				<LandingScreen
					onCreate={createLobby}
					onJoin={joinLobby}
					onBrowse={listLobbies}
					lobbiesPage={lobbiesPage}
					error={landingError}
				/>
			)}

			{state && !state.game && (
				<LobbyScreen
					state={state}
					myId={myId}
					onStart={() => emit("start_game")}
					onLeave={leaveLobby}
					onAddBot={() => emit("add_bot")}
					onSetPublic={setPublic}
					onSetPacks={setPacks}
					onSetStreamerMode={setStreamerMode}
					onRegenerateCode={regenerateCode}
					onKick={kickPlayer}
				/>
			)}

			{state && state.game && (
				<GameScreen
					state={state}
					myId={myId}
					emit={emit}
					onBackToMenu={() => emit("return_to_lobby")}
				/>
			)}
		</>
	);
}
