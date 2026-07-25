"use client";

import { useEffect, useRef, useState } from "react";
import { Card, GameView, PartCard, SheepEntity } from "@/lib/types";
import { CHALLENGE_META, cardMeta } from "@/lib/cardMeta";
import { SheepChip } from "./SheepChip";
import { CardChip } from "./CardChip";

export function ChallengeOverlay({
	game,
	myId,
	myHand,
	emit,
}: {
	game: GameView;
	myId: string;
	myHand: Card[];
	emit: (event: string, payload?: any) => void;
}) {
	const pc = game.pendingChallenge!;

	// Animation state - triggers on each new flip/reflip
	const [flipping, setFlipping] = useState(false);
	const animFlipCountRef = useRef(0);
	useEffect(() => {
		const fc = pc.flipCount ?? 0;
		if (pc.stage === "awaiting_reflip" && fc > animFlipCountRef.current) {
			animFlipCountRef.current = fc;
			setFlipping(true);
			const t = setTimeout(() => setFlipping(false), 1200);
			return () => clearTimeout(t);
		}
	}, [pc.flipCount, pc.stage]);
	// Also true on the first render after flipCount advances (before the effect fires)
	const isFlipping =
		flipping ||
		(pc.stage === "awaiting_reflip" &&
			(pc.flipCount ?? 0) > animFlipCountRef.current);

	// Countdown timer for the reflip window (6s, resets on each reflip)
	const [countdown, setCountdown] = useState(6);
	useEffect(() => {
		if (pc.stage !== "awaiting_reflip") {
			setCountdown(6);
			return;
		}
		setCountdown(6);
		const interval = setInterval(
			() => setCountdown((prev) => Math.max(0, prev - 1)),
			1000,
		);
		return () => clearInterval(interval);
	}, [pc.stage, pc.flipCount]);

	const challenger = game.players.find((p) => p.id === pc.challengerId)!;
	const target = game.players.find((p) => p.id === pc.targetId)!;
	const meta = CHALLENGE_META[pc.challengeType];

	const box =
		"bg-[#fff0f5] rounded-[22px] p-7 max-w-[480px] w-full text-center shadow-2xl max-h-[86vh] overflow-y-auto";
	const wrap = (children: React.ReactNode) => (
		<div className="fixed inset-0 bg-[rgba(0,0,0,0.55)] flex items-center justify-center z-50 p-5">
			<div className={box}>{children}</div>
		</div>
	);

	if (pc.stage === "awaiting_flip") {
		if (pc.guess === null) {
			if (pc.challengerId === myId) {
				return wrap(
					<>
						<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
							Re-Flip! Guess again.
						</h2>
						<p className="mb-3">{meta.desc}</p>
						<div className="flex gap-2.5 justify-center mt-3.5">
							<GuessBtn
								label="👀 Heads (looking at me)"
								primary
								onClick={() =>
									emit("challenge_guess", { guess: "heads" })
								}
							/>
							<GuessBtn
								label="🐑 Butts (not looking)"
								onClick={() =>
									emit("challenge_guess", { guess: "butts" })
								}
							/>
						</div>
					</>,
				);
			}
			return wrap(
				<>
					<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
						Re-Flip!
					</h2>
					<p>{challenger.name} needs to guess again&hellip;</p>
				</>,
			);
		}

		return wrap(
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-1">
					{challenger.name} vs {target.name}
				</h2>
				<p className="mb-2">
					{challenger.name} guessed <b>{pc.guess}</b>. {meta.name}
				</p>
				<div className="coin-face w-[90px] h-[90px] rounded-full mx-auto my-2.5 flex items-center justify-center font-display font-extrabold text-[#7a3a58]">
					FLIP ME
				</div>
				{pc.targetId !== myId && (
					<p className="text-[#8a5a70] font-semibold">
						Waiting for {target.name} to flip&hellip;
					</p>
				)}
				<div className="flex gap-2.5 justify-center mt-3.5">
					{pc.targetId === myId && (
						<GuessBtn
							label="Flip the coin!"
							primary
							onClick={() => emit("resolve_flip")}
						/>
					)}
				</div>
			</>,
		);
	}

	if (pc.stage === "awaiting_reflip") {
		const winner = game.players.find((p) => p.id === pc.winnerId);
		const myReflip = myHand.find(
			(c) => c.category === "action" && c.action === "reflip",
		);
		const resultLabel =
			pc.flipResult === "heads" ? "👀 Heads!" : "🐑 Butts!";
		const coinSrc =
			pc.flipResult === "heads"
				? "/assets/coin/front.png"
				: "/assets/coin/back.png";

		return wrap(
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-1">
					{isFlipping ? "Flipping…" : resultLabel}
				</h2>
				<p className="mb-2">
					{!isFlipping && winner ? (
						<>
							<b>{winner.name}</b> wins the challenge!
						</>
					) : (
						<>&nbsp;</>
					)}
				</p>
				<div
					className={`coin-face w-[90px] h-[90px] rounded-full mx-auto my-2.5 overflow-hidden${isFlipping ? " coin-flipping" : ""}`}
				>
					{pc.flipResult && (
						<img
							src={coinSrc}
							className="w-full h-full object-cover"
							alt={pc.flipResult}
						/>
					)}
				</div>
				<p className="text-[#8a5a70] text-sm font-semibold mb-3">
					{isFlipping ? " " : `${countdown}s to re-flip`}
				</p>
				{myReflip && !isFlipping && (
					<button
						onClick={() =>
							emit("play_reflip", { cardId: myReflip.id })
						}
						className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#e0609a] text-[#4a1a38] active:translate-y-px"
					>
						Play Re-Flip
					</button>
				)}
			</>,
		);
	}

	// awaiting_selection
	if (pc.winnerId !== myId) {
		const winner = game.players.find((p) => p.id === pc.winnerId)!;
		return wrap(
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
					{meta.name}
				</h2>
				<p>
					{winner.name} won the flip and is choosing the
					effect&hellip;
				</p>
			</>,
		);
	}

	const loser = game.players.find((p) => p.id === pc.loserId)!;
	return wrap(
		<SelectionBody
			pc={pc}
			loser={loser}
			discard={game.discard}
			emit={emit}
		/>,
	);
}

function GuessBtn({
	label,
	primary,
	onClick,
}: {
	label: string;
	primary?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`font-extrabold text-sm px-5 py-3 rounded-full shadow transition active:translate-y-px ${primary ? "bg-[#c05090] text-white" : "bg-[#e0609a] text-[#4a1a38]"}`}
		>
			{label}
		</button>
	);
}

function SelectionBody({
	pc,
	loser,
	discard,
	emit,
}: {
	pc: NonNullable<GameView["pendingChallenge"]>;
	loser: { id: string; name: string; field: SheepEntity[] };
	discard: Card[];
	emit: (event: string, payload?: any) => void;
}) {
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [halves, setHalves] = useState<
		{ sheepId: string; keepCardId: string }[]
	>([]);
	const [halvePicking, setHalvePicking] = useState<SheepEntity | null>(null);
	const [recoverPicked, setRecoverPicked] = useState<Card[]>([]);

	if (pc.challengeType === "lure2" || pc.challengeType === "remove2") {
		const verb =
			pc.challengeType === "lure2"
				? "lure to your field"
				: "send to the discard pile";
		return (
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
					You won! &#127881;
				</h2>
				<p className="mb-2">
					Pick up to 2 Sheep from {loser.name}'s field to {verb}.
				</p>
				<div className="flex flex-wrap gap-2 justify-center my-3.5 max-h-[260px] overflow-y-auto">
					{loser.field.map((entity) => (
						<SheepChip
							key={entity.id}
							entity={entity}
							clickable
							selected={picked.has(entity.id)}
							onClick={() => {
								setPicked((prev) => {
									const next = new Set(prev);
									if (next.has(entity.id))
										next.delete(entity.id);
									else {
										if (next.size >= 2) return prev;
										next.add(entity.id);
									}
									return next;
								});
							}}
						/>
					))}
				</div>
				<button
					onClick={() =>
						emit("resolve_challenge_effect", {
							sheepIds: Array.from(picked),
						})
					}
					className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c05090] text-white active:translate-y-px"
				>
					Confirm
				</button>
			</>
		);
	}

	if (pc.challengeType === "halve2") {
		return (
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
					You won! &#127881;
				</h2>
				<p className="mb-2">
					Pick up to 2 Sheep from {loser.name}'s field. For each,
					choose which half you keep - the rest goes to {loser.name}.
				</p>
				<div className="flex flex-wrap gap-2 justify-center my-3.5 max-h-[260px] overflow-y-auto">
					{loser.field.map((entity) => (
						<SheepChip
							key={entity.id}
							entity={entity}
							clickable
							selected={halves.some(
								(h) => h.sheepId === entity.id,
							)}
							onClick={() => {
								if (
									halves.some(
										(h) => h.sheepId === entity.id,
									) ||
									halves.length >= 2
								)
									return;
								setHalvePicking(entity);
							}}
						/>
					))}
				</div>
				<p className="text-[#8a5a70] font-semibold mb-2">
					{halves.length}/2 chosen
				</p>
				<button
					onClick={() => emit("resolve_challenge_effect", { halves })}
					className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c05090] text-white active:translate-y-px"
				>
					Confirm
				</button>

				{halvePicking && (
					<div className="fixed inset-0 bg-[rgba(0,0,0,0.55)] flex items-center justify-center z-[90] p-5">
						<div className="bg-[#fff0f5] rounded-[22px] p-6 max-w-[360px] w-full text-center shadow-2xl">
							<h3 className="font-display text-lg mb-3">
								Which half do you keep?
							</h3>
							<div className="flex gap-2.5 justify-center flex-wrap">
								{partsOf(halvePicking).map((card) => (
									<button
										key={card.id}
										onClick={() => {
											setHalves((prev) => [
												...prev,
												{
													sheepId: halvePicking.id,
													keepCardId: card.id,
												},
											]);
											setHalvePicking(null);
										}}
										className="font-bold text-sm px-4 py-2 rounded-lg bg-[#e0609a] text-[#4a1a38]"
									>
										{cardMeta(card).label}
									</button>
								))}
							</div>
						</div>
					</div>
				)}
			</>
		);
	}

	// recover1
	const toggleRecover = (card: Card) => {
		setRecoverPicked((prev) => {
			const exists = prev.find((c) => c.id === card.id);
			if (exists) return prev.filter((c) => c.id !== card.id);
			if (prev.length >= 3) return prev;
			return [...prev, card];
		});
	};
	const buildAndSend = () => {
		const modifier = recoverPicked.find((c) => c.category === "modifier");
		const rest = recoverPicked.filter((c) => c !== modifier);
		const payload: any = {};
		if (modifier) payload.modifierCardId = modifier.id;
		if (
			modifier &&
			modifier.category === "modifier" &&
			modifier.modifier === "franken"
		) {
			const sameCategory = rest.filter(
				(c) => c.category === rest[0]?.category,
			);
			if (sameCategory.length === 2) {
				payload[
					sameCategory[0].category === "head"
						? "headCardId"
						: "buttCardId"
				] = sameCategory[0].id;
				payload.extraCardId = sameCategory[1].id;
			}
		} else {
			const h = rest.find((c) => c.category === "head");
			const b = rest.find((c) => c.category === "butt");
			if (h) payload.headCardId = h.id;
			if (b) payload.buttCardId = b.id;
		}
		emit("resolve_challenge_effect", payload);
	};

	return (
		<>
			<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
				You won! &#127881;
			</h2>
			<p className="mb-2">Build a Sheep from the discard pile.</p>
			<div className="flex flex-wrap gap-2 justify-center my-3.5 max-h-[260px] overflow-y-auto">
				{discard.map((card) => (
					<CardChip
						key={card.id}
						card={card}
						mini
						selected={recoverPicked.some((c) => c.id === card.id)}
						onClick={() => toggleRecover(card)}
					/>
				))}
			</div>
			<p className="text-[#8a5a70] font-semibold mb-3">
				{recoverPicked.length
					? recoverPicked.map((c) => cardMeta(c).label).join(" + ")
					: "Tap cards to select: 1 modifier (optional) + matching head/butt cards."}
			</p>
			<div className="flex gap-2.5 justify-center flex-wrap">
				<button
					onClick={buildAndSend}
					className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c05090] text-white active:translate-y-px"
				>
					Build Sheep
				</button>
				<button
					onClick={() => emit("resolve_challenge_effect", {})}
					className="font-bold text-sm px-4 py-3 rounded-full text-[#8a5a70] underline"
				>
					Skip
				</button>
			</div>
		</>
	);
}

function partsOf(entity: SheepEntity): PartCard[] {
	if (entity.kind === "franken_heads")
		return [entity.head as PartCard, entity.extra as PartCard];
	if (entity.kind === "franken_butts")
		return [entity.butt as PartCard, entity.extra as PartCard];
	return [entity.head as PartCard, entity.butt as PartCard];
}
