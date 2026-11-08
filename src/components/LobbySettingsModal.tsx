"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ban, Lock, Star } from "lucide-react";
import {
	LobbyView,
	PackId,
	RECONNECT_SECONDS_OPTIONS,
	TURN_SECONDS_OPTIONS,
} from "@/lib/types";
import { PACKS, PACK_ORDER, packCardCount } from "@/lib/deck";
import { Modal } from "@/components/Modal";

// 120 -> "2 min", 30 -> "30s"
const fmtSeconds = (s: number) =>
	s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`;

// A row of choices, one selected - like a segmented control
function OptionPicker({
	options,
	value,
	disabled,
	onChange,
	label,
	offLabel,
	offIcon,
}: {
	options: readonly number[];
	value: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	label: string;
	// What the 0 option is called, e.g. "Disabled", and optionally an icon to show instead
	offLabel: string;
	offIcon?: React.ReactNode;
}) {
	// The selected pill is one element that slides to whichever option is chosen
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const [pill, setPill] = useState<{
		left: number;
		top: number;
		width: number;
		height: number;
	} | null>(null);
	const index = options.indexOf(value);
	useLayoutEffect(() => {
		const measure = () => {
			const el = buttons.current[index];
			setPill(
				el
					? {
							left: el.offsetLeft,
							top: el.offsetTop,
							width: el.offsetWidth,
							height: el.offsetHeight,
						}
					: null,
			);
		};
		measure();
		// The modal can change width while open
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [index]);

	return (
		<div
			role="radiogroup"
			aria-label={label}
			className="relative flex gap-1 bg-[#fbeaf3] rounded-lg p-1 mt-2"
		>
			{pill && (
				<span
					aria-hidden="true"
					className={`absolute rounded-md shadow-sm transition-all duration-200 ease-out motion-reduce:transition-none ${
						disabled ? "bg-[#b5a8ae]" : "bg-[#c05090]"
					}`}
					style={pill}
				/>
			)}
			{options.map((o, i) => (
				<button
					key={o}
					ref={(el) => {
						buttons.current[i] = el;
					}}
					type="button"
					role="radio"
					aria-checked={o === value}
					aria-label={o === 0 ? offLabel : undefined}
					title={o === 0 ? offLabel : undefined}
					disabled={disabled}
					onClick={() => onChange(o)}
					className={`relative flex-1 min-w-0 px-1.5 py-1 rounded-md whitespace-nowrap text-[12px] font-extrabold transition-colors duration-200 disabled:cursor-not-allowed ${
						o === value
							? "text-white"
							: "text-[#9a7888] enabled:hover:text-[#7a3a58] enabled:hover:bg-white/70"
					}`}
				>
					{o === 0 ? (offIcon ?? offLabel) : fmtSeconds(o)}
				</button>
			))}
		</div>
	);
}

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
			title={disabled ? "Locked" : undefined}
			className={`relative shrink-0 w-12 h-7 rounded-full transition ${
				disabled
					? `cursor-not-allowed ${on ? "bg-[#b5a8ae]" : "bg-[#e2dadd]"}`
					: on
						? "bg-[#c05090]"
						: "bg-[#d8c0cc]"
			}`}
		>
			<span
				className={`absolute top-1 left-1 w-5 h-5 rounded-full shadow transition-transform flex items-center justify-center ${disabled ? "bg-[#f3eff1]" : "bg-white"} ${on ? "translate-x-5" : ""}`}
			>
				{disabled && (
					<Lock
						size={11}
						strokeWidth={3}
						className="text-[#9a8f94]"
					/>
				)}
			</span>
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
	onSetTimers,
	canUseHidden,
}: {
	open: boolean;
	state: LobbyView;
	canEdit: boolean;
	onClose: () => void;
	onSetPublic: (isPublic: boolean) => void;
	onSetPacks: (packs: PackId[]) => void;
	onSetStreamerMode: (enabled: boolean) => void;
	onSetTimers: (timers: {
		turnSeconds?: number;
		reconnectSeconds?: number;
	}) => void;
	// Playtesters can see and switch on hidden card packs
	canUseHidden: boolean;
}) {
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
		onSetPacks(
			enabled
				? state.packs.filter((p) => p !== id)
				: [...state.packs, id],
		);
	};

	return (
		<Modal
			open={open}
			onBackdropClick={onClose}
			backdropClassName="bg-[rgba(74,50,32,0.35)]"
			className="z-[70] p-6"
			labelledBy="lobby-settings-title"
			panelClassName="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-7 max-w-[440px] md:max-w-[760px] w-full text-left border-[3px] border-white max-h-[90vh] overflow-y-auto"
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

			<h3 className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-2">
				Settings
			</h3>
			<div className="grid md:grid-cols-2 gap-2 mb-5">
				{!state.isActivity && (
					<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3">
						<div>
							<div className="font-bold text-[#5a3048]">
								Public lobby
							</div>
							<div className="text-[12px] font-semibold text-[#9a7888]">
								Anyone can find and join it from the lobby
								browser. Turning it off changes the code.
							</div>
						</div>
						<Toggle
							on={state.isPublic}
							disabled={!canEdit}
							onChange={() => onSetPublic(!state.isPublic)}
							label="Public lobby"
						/>
					</div>
				)}
				{!state.isActivity && (
					<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between gap-3">
						<div>
							<div className="font-bold text-[#5a3048]">
								Streamer mode
							</div>
							<div className="text-[12px] font-semibold text-[#9a7888]">
								Blurs the lobby code so it won't leak on stream.
								Players can still click it to copy.
							</div>
						</div>
						<Toggle
							on={state.streamerMode}
							disabled={!canEdit}
							onChange={() =>
								onSetStreamerMode(!state.streamerMode)
							}
							label="Streamer mode"
						/>
					</div>
				)}
				<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex flex-col">
					<div className="font-bold text-[#5a3048]">
						Turn duration
					</div>
					<div className="flex-1 text-[12px] font-semibold text-[#9a7888]">
						When time runs out, the players turn ends automatically
						and play moves on to the next player.
					</div>
					<OptionPicker
						label="Turn duration"
						offLabel="Disabled"
						offIcon={
							<Ban
								size={14}
								strokeWidth={2.75}
								className="inline-block align-[-2px]"
							/>
						}
						options={TURN_SECONDS_OPTIONS}
						value={state.turnSeconds}
						disabled={!canEdit}
						onChange={(turnSeconds) => onSetTimers({ turnSeconds })}
					/>
				</div>
				<div className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex flex-col">
					<div className="font-bold text-[#5a3048]">
						Replace disconnected players
					</div>
					<div className="flex-1 text-[12px] font-semibold text-[#9a7888]">
						How long before a bot takes over a disconnected players
						seat. The player can take it back by rejoining.
					</div>
					<OptionPicker
						label="Replace disconnected players after"
						offLabel="Disabled"
						offIcon={
							<Ban
								size={14}
								strokeWidth={2.75}
								className="inline-block align-[-2px]"
							/>
						}
						options={RECONNECT_SECONDS_OPTIONS}
						value={state.reconnectSeconds}
						disabled={!canEdit}
						onChange={(reconnectSeconds) =>
							onSetTimers({ reconnectSeconds })
						}
					/>
				</div>
			</div>

			<h3 className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-2">
				Card packs
			</h3>
			<ul className="grid md:grid-cols-2 gap-2">
				{PACK_ORDER.filter(
					(id) => !PACKS[id].hidden || canUseHidden,
				).map((id) => {
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
									{pack.alwaysOn && (
										<span className="text-[11px] font-extrabold text-[#8a7f84] bg-[#ece6e9] rounded-full px-2 py-0.5 flex items-center gap-1">
											<Lock size={10} strokeWidth={3} />
											Always on
										</span>
									)}
									{pack.hidden && (
										<span
											title="Playtest pack - only playtesters can see this"
											aria-label="Playtest pack"
											className="text-[#f0c419] bg-[#fff4c2] rounded-full p-1"
										>
											<Star
												size={12}
												fill="currentColor"
											/>
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
