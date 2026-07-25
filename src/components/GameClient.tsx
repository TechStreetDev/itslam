"use client";

import { useFlockSocket } from "@/hooks/useFlockSocket";
import { LandingScreen } from "@/components/LandingScreen";
import { LobbyScreen } from "@/components/LobbyScreen";
import { GameScreen } from "@/components/GameScreen";

export function GameClient() {
	const {
		state,
		connected,
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
		kickPlayer,
	} = useFlockSocket();

	return (
		<>
			<div className="fixed top-3.5 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 items-center pointer-events-none">
				{toasts.map((t) => (
					<div
						key={t.id}
						className={`animate-toast-in px-[18px] py-2.5 rounded-full font-bold text-white shadow-lg ${t.error ? "bg-[#c0503a]" : "bg-[#4a3220]"}`}
					>
						{t.msg}
					</div>
				))}
			</div>

			{!connected && (
				<div className="fixed inset-0 flex items-center justify-center bg-[#f5efe6]">
					<div className="w-10 h-10 rounded-full border-4 border-[#4a3220] border-t-transparent animate-spin" />
				</div>
			)}
			{connected && !state && (
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
					isDev={process.env.NODE_ENV === "development"}
					onSetPublic={setPublic}
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
