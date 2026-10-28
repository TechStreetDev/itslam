"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { LobbyView, MAX_PLAYERS, PackId } from "@/lib/types";
import { PACKS, PACK_ORDER, packCardCount } from "@/lib/deck";
import { authHeaders } from "@/lib/discordActivity";
import { Modal } from "@/components/Modal";

function Toggle({
	on,
	disabled,
	onChange,
	label,
}: {
	on: boolean;
	disabled?: boolean;
	onChange: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			disabled={disabled}
			onClick={onChange}
			className={`relative shrink-0 w-12 h-7 rounded-full transition ${on ? "bg-[#c05090]" : "bg-[#d8c0cc]"} disabled:opacity-60 disabled:cursor-not-allowed`}
		>
			<span
				className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`}
			/>
		</button>
	);
}

export function LobbySettingsModal({
	open,
	state,
	canEdit,
	onClose,
	onSetPublic,
	onSetPacks,
	onSetStreamerMode,
	onAddBot,
}: {
	open: boolean;
	state: LobbyView;
	canEdit: boolean;
	onClose: () => void;
	onSetPublic: (isPublic: boolean) => void;
	onSetPacks: (packs: PackId[]) => void;
	onSetStreamerMode: (enabled: boolean) => void;
	onAddBot: () => void;
}) {
	const lobbyFull = state.players.length >= MAX_PLAYERS;
	const [permissions, setPermissions] = useState<string[]>([]);
	useEffect(() => {
		fetch("/api/me", { headers: authHeaders() })
			.then((r) => r.json())
			.then((me) => setPermissions(me.user?.permissions ?? []))
			.catch(() => {});
	}, []);
	const canUseHidden = permissions.includes("hidden_packs");
	const canAddBot = canEdit && permissions.includes("add_bots");

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const togglePack = (id: PackId) => {
		const enabled = state.packs.includes(id);
		onSetPacks(enabled ? state.packs.filter((p) => p !== id) : [...state.packs, id]);
	};

	return (
		<Modal
			open={open}
			onBackdropClick={onClose}
			backdropClassName="bg-[rgba(74,50,32,0.35)]"
			className="z-[70] p-6"
			labelledBy="lobby-settings-title"
			panelClassName="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-7 max-w-[440px] w-full text-left border-[3px] border-white max-h-[90vh] overflow-y-auto"
		>
			<div className="flex items-center justify-between mb-4">
				<h2
					id="lobby-settings-title"
					className="font-display text-2xl text-[#7a3a58] tracking-wide font-extrabold"
				>
					Lobby settings
				</h2>
				<button
					onClick={onClose}
					aria-label="Close settings"
					className="text-[#c05090] font-extrabold text-xl w-8 h-8 rounded-full hover:bg-[#ffe0f0] transition leading-none"
				>
					×
				</button>
			</div>

			{!canEdit && (
				<p className="text-[#8a5a70] font-semibold text-[13px] mb-4">
					Only the host can change these settings.
				</p>
			)}

			{!state.isActivity && (
				<>
					<h3 className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-2">
						Visibility
					</h3>
					<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3 mb-2">
						<div>
							<div className="font-bold text-[#5a3048]">Public lobby</div>
							<div className="text-[12px] font-semibold text-[#9a7888]">
								List this lobby in the lobby browser so anyone can join.
								Turning it off gives the lobby a new code.
							</div>
						</div>
						<Toggle
							on={state.isPublic}
							disabled={!canEdit}
							onChange={() => onSetPublic(!state.isPublic)}
							label="Public lobby"
						/>
					</div>
					<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3 mb-5">
						<div>
							<div className="font-bold text-[#5a3048]">Streamer mode</div>
							<div className="text-[12px] font-semibold text-[#9a7888]">
								Blur the lobby code on everyone's screen. Players can
								still click it to copy.
							</div>
						</div>
						<Toggle
							on={state.streamerMode}
							disabled={!canEdit}
							onChange={() => onSetStreamerMode(!state.streamerMode)}
							label="Streamer mode"
						/>
					</div>
				</>
			)}

			{canAddBot && (
				<>
					<h3 className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-2">
						Players
					</h3>
					<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3 mb-5">
						<div>
							<div className="font-bold text-[#5a3048] flex items-center gap-1.5">
								Bots
								<span
									title="Playtester feature - only playtesters can see this"
									aria-label="Playtester feature"
									className="text-[#f0c419] bg-[#fff4c2] rounded-full p-1"
								>
									<Star size={12} fill="currentColor" />
								</span>
							</div>
							<div className="text-[12px] font-semibold text-[#9a7888]">
								{lobbyFull
									? `The lobby is full (${MAX_PLAYERS} players max).`
									: "Fill an empty seat with a computer player."}
							</div>
						</div>
						<button
							type="button"
							onClick={onAddBot}
							disabled={lobbyFull}
							className="shrink-0 h-7 px-3 rounded-full bg-[#c05090] text-white text-[13px] font-extrabold hover:brightness-105 active:translate-y-px transition disabled:opacity-60 disabled:cursor-not-allowed"
						>
							+ Add
						</button>
					</div>
				</>
			)}

			<h3 className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-2">
				Card packs
			</h3>
			<ul className="flex flex-col gap-2">
				{PACK_ORDER.filter((id) => !PACKS[id].hidden || canUseHidden).map((id) => {
					const pack = PACKS[id];
					const count = packCardCount(id);
					const enabled = state.packs.includes(id);
					return (
						<li
							key={id}
							className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3"
						>
							<div>
								<div className="font-bold text-[#5a3048] flex items-center gap-1.5">
									{pack.name}
									<span className="text-[11px] font-extrabold text-[#9a7888] bg-[#f5d0e8] rounded-full px-2 py-0.5">
										{count} card{count === 1 ? "" : "s"}
									</span>
									
									{pack.hidden && (
										<span
											title="Playtest pack - only playtesters can see this"
											aria-label="Playtest pack"
											className="text-[#f0c419] bg-[#fff4c2] rounded-full p-1"
										>
											<Star size={12} fill="currentColor" />
										</span>
									)}
								</div>
								<div className="text-[12px] font-semibold text-[#9a7888]">
									{pack.description}
								</div>
							</div>
							<Toggle
								on={enabled}
								disabled={!canEdit || pack.alwaysOn}
								onChange={() => togglePack(id)}
								label={pack.name}
							/>
						</li>
					);
				})}
			</ul>
		</Modal>
	);
}
