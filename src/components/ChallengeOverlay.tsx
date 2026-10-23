"use client";

import { useEffect, useRef, useState } from "react";
import { Card, GameView, PartCard, SheepEntity } from "@/lib/types";
import { CHALLENGE_META, cardMeta } from "@/lib/cardMeta";
import { SheepChip } from "./SheepChip";
import { CardChip } from "./CardChip";

// Keep in sync with FLIP_ANIMATION_MS / REFLIP_WINDOW_MS in server.ts
const FLIP_ANIMATION_MS = 2000;
const REFLIP_WINDOW_MS = 10000;

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
			const t = setTimeout(() => setFlipping(false), FLIP_ANIMATION_MS);
			return () => clearTimeout(t);
		}
	}, [pc.flipCount, pc.stage]);
	// Also true on the first render after flipCount advances (before the effect fires)
	const isFlipping =
		flipping ||
		(pc.stage === "awaiting_reflip" &&
			(pc.flipCount ?? 0) > animFlipCountRef.current);

	// Re-Flip window countdown. The server sends how long is left (including the
	// flip animation); we turn that into a local deadline so clocks don't matter.
	const deadlineRef = useRef(0);
	const [msLeft, setMsLeft] = useState(0);
	useEffect(() => {
		if (pc.stage !== "awaiting_reflip" || pc.reflipMsLeft === undefined) return;
		deadlineRef.current = Date.now() + pc.reflipMsLeft;
		const tick = () => setMsLeft(Math.max(0, deadlineRef.current - Date.now()));
		tick();
		const interval = setInterval(tick, 100);
		return () => clearInterval(interval);
	}, [pc.stage, pc.flipCount, pc.reflipMsLeft]);

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

		const other = pc.guess === "heads" ? "butts" : "heads";
		return wrap(
			<>
				<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-1">
					{meta.name}
				</p>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-3">
					{challenger.name} vs {target.name}
				</h2>
				<Stakes
					rows={[
						{ face: pc.guess!, winner: challenger.name },
						{ face: other, winner: target.name },
					]}
				/>
				<p className="text-[13px] text-[#5a3048] mb-1">
					<b>Winner gets to:</b> {meta.desc}
				</p>
				<div className="coin-face w-[90px] h-[90px] rounded-full mx-auto my-2.5 overflow-hidden">
					<img
						src="/assets/coin/unknown.png"
						className="w-full h-full object-cover"
						alt="Coin waiting to be flipped"
					/>
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
		const loser = game.players.find((p) => p.id === pc.loserId);
		const myReflips = myHand.filter(
			(c) => c.category === "action" && c.action === "reflip",
		);
		const resultLabel =
			pc.flipResult === "heads" ? "👀 Heads!" : "🐑 Butts!";
		// The server's deadline includes the animation; only count the window itself
		const windowLeft = Math.min(REFLIP_WINDOW_MS, msLeft);
		const secondsLeft = Math.ceil(windowLeft / 1000);
		const pctLeft = (windowLeft / REFLIP_WINDOW_MS) * 100;
		const reflipPitch =
			pc.loserId === myId
				? "You're losing this flip - flip the coin again for another chance!"
				: pc.winnerId === myId
					? "You're winning - a Re-Flip would risk your win."
					: `Flip again to give ${loser?.name ?? "them"} another chance.`;

		return wrap(
			<>
				<p className="uppercase tracking-wide font-extrabold text-[#8a5a70] text-xs mb-1">
					{meta.name}
					{(pc.flipCount ?? 1) > 1 && ` · flip ${pc.flipCount}`}
				</p>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-1">
					{isFlipping ? "Flipping…" : resultLabel}
				</h2>
				<p className="mb-2 min-h-[1.5em]">
					{!isFlipping && winner && loser ? (
						<>
							<b>{winner.id === myId ? "You win" : `${winner.name} wins`}</b>
							{" - "}
							{meta.name} hits{" "}
							<b>{loser.id === myId ? "you" : loser.name}</b>
						</>
					) : (
						<>
							{challenger.name} guessed <b>{pc.guess}</b>
						</>
					)}
				</p>
				{/* Two-sided coin: both faces show while it spins, then it lands on the result */}
				<div className="coin-3d w-[90px] h-[90px] mx-auto my-2.5">
					<div
						className={`coin-spinner${isFlipping ? " coin-flipping" : ""}`}
						style={
							{
								"--coin-end": `${pc.flipResult === "butts" ? 3060 : 2880}deg`,
								transform: `rotateY(${pc.flipResult === "butts" ? 180 : 0}deg)`,
							} as React.CSSProperties
						}
						role="img"
						aria-label={isFlipping ? "Coin flipping" : `Coin landed on ${pc.flipResult}`}
					>
						<div className="coin-face coin-side">
							<img src="/assets/coin/front.png" alt="" />
						</div>
						<div className="coin-face coin-side coin-side-back">
							<img src="/assets/coin/back.png" alt="" />
						</div>
					</div>
				</div>
				{!isFlipping && (
					<>
						<div
							className="mt-3 mb-1 h-2 rounded-full bg-[#f5d0e8] overflow-hidden"
							role="progressbar"
							aria-label="Re-Flip window"
							aria-valuenow={secondsLeft}
							aria-valuemin={0}
							aria-valuemax={REFLIP_WINDOW_MS / 1000}
						>
							<div
								className="h-full bg-[#c05090] transition-[width] duration-100 ease-linear"
								style={{ width: `${pctLeft}%` }}
							/>
						</div>
						<p className="text-[#8a5a70] text-[13px] font-semibold mb-3">
							{secondsLeft > 0
								? `${secondsLeft}s for anyone holding a 🔄 Re-Flip card to flip again`
								: "Locking in the result…"}
						</p>

						{myReflips.length > 0 && secondsLeft > 0 && (
							<div className="bg-white border-2 border-[#e0609a] rounded-2xl p-3 flex items-center gap-3 text-left">
								<CardChip card={myReflips[0]} mini />
								<div className="flex-1 min-w-0">
									<p className="font-extrabold text-[#7a3a58] text-sm">
										You have{" "}
										{myReflips.length > 1
											? `${myReflips.length} Re-Flips`
											: "a Re-Flip"}
									</p>
									<p className="text-[12px] text-[#5a3048] font-semibold leading-snug">
										{reflipPitch}
									</p>
								</div>
								<button
									onClick={() =>
										emit("play_reflip", { cardId: myReflips[0].id })
									}
									className="shrink-0 font-extrabold text-sm px-4 py-3 rounded-full shadow bg-[#c05090] text-white hover:brightness-105 active:translate-y-px"
								>
									🔄 Re-Flip
								</button>
							</div>
						)}
					</>
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

// Shows what each coin face means before the flip
function Stakes({ rows }: { rows: { face: "heads" | "butts"; winner: string }[] }) {
	return (
		<div className="grid grid-cols-2 gap-2 mb-3">
			{rows.map((r) => (
				<div
					key={r.face}
					className="bg-white rounded-xl border-2 border-[#f5d0e8] px-3 py-2 text-[13px]"
				>
					<p className="font-extrabold text-[#7a3a58]">
						{r.face === "heads" ? "👀 Heads" : "🐑 Butts"}
					</p>
					<p className="text-[#5a3048] font-semibold leading-snug">
						<b>{r.winner}</b> wins
					</p>
				</div>
			))}
		</div>
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
		const toggleSheep = (entity: SheepEntity) =>
			setHalves((prev) => {
				if (prev.some((h) => h.sheepId === entity.id))
					return prev.filter((h) => h.sheepId !== entity.id);
				if (prev.length >= 2) return prev;
				// Pre-select the first half - the player can switch it below
				return [...prev, { sheepId: entity.id, keepCardId: partsOf(entity)[0].id }];
			});
		const chooseHalf = (sheepId: string, keepCardId: string) =>
			setHalves((prev) =>
				prev.map((h) => (h.sheepId === sheepId ? { ...h, keepCardId } : h)),
			);
		const chosen = halves.flatMap((h) => {
			const entity = loser.field.find((e) => e.id === h.sheepId);
			return entity ? [{ ...h, entity }] : [];
		});

		return (
			<>
				<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
					You won! &#127881;
				</h2>
				<p className="mb-2">
					Tap up to 2 of {loser.name}&rsquo;s Sheep to halve, then choose which
					half you take. The other half goes back to {loser.name}&rsquo;s hand.
				</p>
				<div className="flex flex-wrap gap-2 justify-center my-3 max-h-[200px] overflow-y-auto">
					{loser.field.map((entity) => {
						const isPicked = halves.some((h) => h.sheepId === entity.id);
						return (
							<SheepChip
								key={entity.id}
								entity={entity}
								clickable={isPicked || halves.length < 2}
								selected={isPicked}
								onClick={() => toggleSheep(entity)}
							/>
						);
					})}
				</div>

				{chosen.map(({ entity, keepCardId }, i) => (
					<div
						key={entity.id}
						className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 mb-2 text-left"
					>
						<div className="flex items-center justify-between mb-2">
							<p className="font-extrabold text-[13px] text-[#7a3a58]">
								Sheep {i + 1}: which half do you take?
							</p>
							<button
								onClick={() => toggleSheep(entity)}
								className="text-[12px] font-extrabold text-[#8a5a70] underline"
							>
								Remove
							</button>
						</div>
						<div className="flex gap-2">
							{partsOf(entity).map((card) => {
								const isKept = card.id === keepCardId;
								return (
									<button
										key={card.id}
										onClick={() => chooseHalf(entity.id, card.id)}
										aria-pressed={isKept}
										className={`flex-1 rounded-xl border-2 px-2 py-2 text-[13px] font-bold transition ${
											isKept
												? "border-[#c05090] bg-[#fde4f0] text-[#7a3a58]"
												: "border-[#f5d0e8] bg-white text-[#8a5a70] hover:border-[#e0a0c0]"
										}`}
									>
										<span className="block text-[11px] font-extrabold uppercase tracking-wide">
											{isKept ? "✓ You take" : `${loser.name} gets`}
										</span>
										{cardMeta(card).label}
									</button>
								);
							})}
						</div>
						{entity.modifierCard && (
							<p className="text-[11px] text-[#8a5a70] font-semibold mt-1.5">
								You also take its {cardMeta(entity.modifierCard).label} card.
							</p>
						)}
					</div>
				))}

				<p className="text-[#8a5a70] font-semibold mb-2 text-sm">
					{halves.length}/2 Sheep chosen
				</p>
				<button
					onClick={() => emit("resolve_challenge_effect", { halves })}
					className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c05090] text-white active:translate-y-px"
				>
					{halves.length === 0 ? "Halve nothing" : `Halve ${halves.length} Sheep`}
				</button>
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
