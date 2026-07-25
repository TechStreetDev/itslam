"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActionCard,
	Card,
	ChallengeCard,
	GameView,
	HeadCard,
	ButtCard,
	ModifierCard,
	LobbyView,
} from "@/lib/types";
import { CHALLENGE_META, cardMeta, capitalize } from "@/lib/cardMeta";
import { CardChip } from "./CardChip";
import {
	SheepChip,
	isSwappable,
	canBodyswapComplete,
	computeBodyswapRemoveId,
} from "./SheepChip";
import { ChallengeOverlay } from "./ChallengeOverlay";
import { ResultsOverlay } from "./ResultsOverlay";
import { DevPanel } from "./DevPanel";

type Pending =
	| { kind: "await_wheat_sheep"; card: ActionCard }
	| { kind: "await_wolf_sheep"; card: ActionCard }
	| { kind: "await_yoink_opp"; card: ActionCard }
	| { kind: "await_challenge_opp"; card: ChallengeCard }
	| { kind: "await_bodyswap_target"; card: HeadCard | ButtCard };

type Move =
	| { kind: "hint"; text: string }
	| { kind: "add_sheep_ready"; head: HeadCard; butt: ButtCard; label: string }
	| {
			kind: "franken_ready";
			a: HeadCard | ButtCard;
			b: HeadCard | ButtCard;
			modifier: ModifierCard;
			label: string;
	  }
	| {
			kind: "paint_ready";
			head: HeadCard;
			butt: ButtCard;
			modifier: ModifierCard;
			label: string;
	  }
	| { kind: "wheat_ready"; card: ActionCard }
	| { kind: "wolf_ready"; card: ActionCard }
	| { kind: "yoink_ready"; card: ActionCard }
	| { kind: "reflip_ready"; card: ActionCard }
	| { kind: "challenge_ready"; card: ChallengeCard }
	| { kind: "bodyswap_ready"; card: HeadCard | ButtCard };

export function GameScreen({
	state,
	myId,
	emit,
	onBackToMenu,
}: {
	state: LobbyView;
	myId: string;
	emit: (event: string, payload?: any) => void;
	onBackToMenu: () => void;
}) {
	const game = state.game as GameView;
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [pending, setPending] = useState<Pending | null>(null);
	const [discardMode, setDiscardMode] = useState(false);
	const [discardSelected, setDiscardSelected] = useState<Set<string>>(
		new Set(),
	);
	const [logOpen, setLogOpen] = useState(false);
	const [firstTimeOpen, setFirstTimeOpen] = useState(() => {
		try {
			return !localStorage.getItem(`flock-tutorial-${state.code}`);
		} catch {
			return true;
		}
	});
	function dismissTutorial() {
		try {
			localStorage.setItem(`flock-tutorial-${state.code}`, "1");
		} catch {}
		setFirstTimeOpen(false);
	}
	const [endGameConfirm, setEndGameConfirm] = useState(false);
	const [devOpen, setDevOpen] = useState(false);
	const iAmHost = state.hostId === myId;
	const isDev = process.env.NODE_ENV !== "production";

	const me = game.players.find((p) => p.id === myId)!;
	const myHand = me.hand || [];
	const opponents = game.players.filter((p) => p.id !== myId);
	const isMyTurn = game.currentPlayerId === myId;
	const myTurnPlayable =
		isMyTurn &&
		game.phase === "play" &&
		!game.ended &&
		!game.pendingChallenge;

	const selectedCards = useMemo(
		() => myHand.filter((c) => selected.has(c.id)),
		[myHand, selected],
	);

	function toggleHandSelect(card: Card) {
		if (discardMode || !isMyTurn) return;
		const isAutoPending =
			pending?.kind === "await_wheat_sheep" ||
			pending?.kind === "await_wolf_sheep" ||
			pending?.kind === "await_bodyswap_target";
		if (pending && !isAutoPending) return;
		const newSelected = new Set(selected);
		if (newSelected.has(card.id)) newSelected.delete(card.id);
		else newSelected.add(card.id);
		const newCards = myHand.filter((c) => newSelected.has(c.id));
		const newMove = detectMove(newCards);
		setSelected(newSelected);
		if (newMove?.kind === "wheat_ready")
			setPending({ kind: "await_wheat_sheep", card: newMove.card });
		else if (newMove?.kind === "wolf_ready")
			setPending({ kind: "await_wolf_sheep", card: newMove.card });
		else if (newMove?.kind === "bodyswap_ready")
			setPending({ kind: "await_bodyswap_target", card: newMove.card });
		else setPending(null);
	}

	function toggleDiscardPick(card: Card) {
		if (card.category === "challenge") return;
		const need = myHand.length - 7;
		setDiscardSelected((prev) => {
			const next = new Set(prev);
			if (next.has(card.id)) next.delete(card.id);
			else {
				if (next.size >= need) return prev;
				next.add(card.id);
			}
			return next;
		});
	}

	const move: Move | null = useMemo(
		() => detectMove(selectedCards),
		[selectedCards],
	);

	function clearSelection() {
		setSelected(new Set());
	}

	function handleOpponentClick(pid: string) {
		if (!pending) return;
		if (pending.kind === "await_yoink_opp") {
			emit("play_action", {
				cardId: pending.card.id,
				targetPlayerId: pid,
			});
			setPending(null);
			clearSelection();
		} else if (pending.kind === "await_challenge_opp") {
			openGuess(pending.card, pid);
		}
	}

	// Auto-draw
	useEffect(() => {
		if (
			isMyTurn &&
			game.phase === "draw" &&
			!game.ended &&
			!game.pendingChallenge
		) {
			const t = setTimeout(() => emit("draw"), 400);
			return () => clearTimeout(t);
		}
	}, [isMyTurn, game.phase, game.ended, !!game.pendingChallenge]);

	// Clear selection at the start and end of every turn
	useEffect(() => {
		setSelected(new Set());
		setPending(null);
	}, [game.currentPlayerId]);

	// Track newly drawn card for animation
	const prevHandIdsRef = useRef(new Set(myHand.map((c) => c.id)));
	const [newCardId, setNewCardId] = useState<string | null>(null);
	useEffect(() => {
		const added = myHand.find((c) => !prevHandIdsRef.current.has(c.id));
		prevHandIdsRef.current = new Set(myHand.map((c) => c.id));
		if (added) {
			setNewCardId(added.id);
			const t = setTimeout(() => setNewCardId(null), 500);
			return () => clearTimeout(t);
		}
	}, [myHand.map((c) => c.id).join(",")]);

	const [guessTarget, setGuessTarget] = useState<{
		card: ChallengeCard;
		targetPlayerId: string;
	} | null>(null);
	function openGuess(card: ChallengeCard, targetPlayerId: string) {
		setGuessTarget({ card, targetPlayerId });
		setPending(null);
	}
	function submitGuess(guess: "heads" | "butts") {
		if (!guessTarget) return;
		emit("play_challenge", {
			cardId: guessTarget.card.id,
			targetPlayerId: guessTarget.targetPlayerId,
			guess,
		});
		setGuessTarget(null);
		clearSelection();
	}

	function sheepOptsFor(ownerId: string, entity: any) {
		if (!pending) return {};
		if (
			(pending.kind === "await_wheat_sheep" ||
				pending.kind === "await_wolf_sheep") &&
			ownerId !== myId
		) {
			return {
				clickable: true,
				onClick: () => {
					emit("play_action", {
						cardId: pending.card.id,
						targetPlayerId: ownerId,
						targetSheepId: entity.id,
					});
					setPending(null);
					clearSelection();
				},
			};
		}
		if (
			pending.kind === "await_bodyswap_target" &&
			isSwappable(entity) &&
			canBodyswapComplete(entity, pending.card)
		) {
			return {
				swappable: true,
				clickable: true,
				onClick: () => {
					const removeCardId = computeBodyswapRemoveId(
						entity,
						pending.card,
					);
					emit("bodyswap", {
						handCardId: pending.card.id,
						targetPlayerId: ownerId,
						targetSheepId: entity.id,
						removeCardId,
					});
					setPending(null);
					clearSelection();
				},
			};
		}
		return {};
	}

	function isTargetableOpponent(): boolean {
		return (
			!!pending &&
			["await_yoink_opp", "await_challenge_opp"].includes(pending.kind)
		);
	}

	function handleBaa() {
		if (myHand.length > 7) {
			setDiscardMode(true);
			setDiscardSelected(new Set());
		} else {
			emit("end_turn", { discardCardIds: [] });
		}
	}
	function confirmDiscard() {
		emit("end_turn", { discardCardIds: Array.from(discardSelected) });
		setDiscardMode(false);
		setDiscardSelected(new Set());
		clearSelection();
	}
	function handleMidTurnDiscard(ids: string[]) {
		emit("discard_cards", { cardIds: ids });
		clearSelection();
	}

	const discardableSelectedIds = useMemo(
		() =>
			selectedCards
				.filter((c) => c.category !== "challenge")
				.map((c) => c.id),
		[selectedCards],
	);

	const resultsShown = game.ended && game.results;

	return (
		<section className="flex flex-col h-screen overflow-hidden">
			<header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#a05578] text-[#fff0f5] flex-wrap">
				<div className="flex items-center gap-2.5">
					<span className="font-display font-extrabold text-lg">
						ITSLAM
					</span>
					<span className="bg-white/10 rounded-full px-2.5 py-1 text-sm font-bold">
						&#127200; <b>{game.deckCount}</b>
					</span>
					<span className="bg-white/10 rounded-full px-2.5 py-1 text-sm font-bold">
						&#128465; <b>{game.discardCount}</b>
					</span>
				</div>
				<div className="font-display font-extrabold text-[#ffeef5] flex-1 text-center">
					{game.ended
						? "Game over!"
						: isMyTurn
							? "It's your turn!"
							: `${game.players.find((p) => p.id === game.currentPlayerId)?.name}'s turn`}
				</div>
				<div className="flex items-center gap-3">
					{iAmHost && !game.ended && (
						<button
							onClick={() => setEndGameConfirm(true)}
							className="text-[#ffc0dc] underline font-bold text-sm"
						>
							End game
						</button>
					)}
					{isDev && (
						<button
							onClick={() => setDevOpen((o) => !o)}
							className="text-[#ffc0e8] underline font-bold text-xs"
						>
							DEV
						</button>
					)}
					<button
						onClick={() => setLogOpen(true)}
						className="text-[#fbf4e4] underline font-bold text-sm"
					>
						Log
					</button>
				</div>
			</header>

			<div className="flex gap-2.5 px-3.5 py-2.5 overflow-x-auto flex-shrink-0">
				{opponents.map((p) => {
					const isTurn = p.id === game.currentPlayerId;
					const connected =
						state.players.find((x) => x.id === p.id)?.connected ??
						true;
					const targetable = isTargetableOpponent();
					return (
						<div
							key={p.id}
							onClick={() =>
								targetable && handleOpponentClick(p.id)
							}
							className={[
								"bg-white/60 border-2 rounded-2xl px-3 py-2 min-w-[260px] flex-shrink-0 transition",
								isTurn
									? "border-[#c0407a] shadow-[0_0_0_3px_rgba(192,64,122,0.35)]"
									: "border-white/90",
								targetable
									? "border-[#c03060] shadow-[0_0_0_3px_rgba(192,48,96,0.3)] cursor-pointer"
									: "",
								!connected ? "opacity-50" : "",
							].join(" ")}
						>
							<div className="flex items-center justify-between font-extrabold mb-1.5">
								<span>{p.name}</span>
								<span className="text-xs text-[#8a5a70] font-bold">
									{p.handCount} card
									{p.handCount === 1 ? "" : "s"}
								</span>
							</div>
							<div className="flex gap-1 flex-wrap min-h-[30px]">
								{p.field.map((entity) => (
									<SheepChip
										key={entity.id}
										entity={entity}
										{...sheepOptsFor(p.id, entity)}
									/>
								))}
							</div>
						</div>
					);
				})}
			</div>

			{game.finalRoundActive && !game.ended && (
				<div className="text-center bg-[#e0609a] text-[#4a1a38] font-extrabold font-display py-1.5">
					&#127937; Final Round - last turns underway!
				</div>
			)}

			<main className="flex-1 overflow-y-auto px-4 py-2.5">
				<div className="font-extrabold text-[#8a5a70] text-sm uppercase tracking-wide mb-1.5">
					Your field
				</div>
				<div className="flex gap-2.5 flex-wrap min-h-[100px] content-start">
					{me.field.map((entity) => (
						<SheepChip
							key={entity.id}
							entity={entity}
							{...sheepOptsFor(myId, entity)}
						/>
					))}
					{me.field.length === 0 && (
						<span className="opacity-55 font-bold">
							No sheep yet - play a Head + Butt card!
						</span>
					)}
				</div>
			</main>

			<MoveBar
				discardMode={discardMode}
				discardNeed={Math.max(0, myHand.length - 7)}
				discardCount={discardSelected.size}
				onConfirmDiscard={confirmDiscard}
				onCancelDiscard={() => {
					setDiscardMode(false);
					setDiscardSelected(new Set());
				}}
				pending={pending}
				onCancelPending={() => setPending(null)}
				myTurnPlayable={myTurnPlayable}
				move={move}
				challengeUsedThisTurn={game.challengeUsedThisTurn}
				onClear={clearSelection}
				onAddSheep={(head, butt) => {
					emit("play_sheep", {
						headCardId: head.id,
						buttCardId: butt.id,
					});
					clearSelection();
				}}
				onFranken={(a, b, modifier) => {
					const payload: any = {
						modifierCardId: modifier.id,
						extraCardId: b.id,
					};
					payload[
						a.category === "head" ? "headCardId" : "buttCardId"
					] = a.id;
					emit("play_sheep", payload);
					clearSelection();
				}}
				onPaint={(head, butt, modifier) => {
					emit("play_sheep", {
						headCardId: head.id,
						buttCardId: butt.id,
						modifierCardId: modifier.id,
					});
					clearSelection();
				}}
				onChooseYoinkTarget={(card) =>
					setPending({ kind: "await_yoink_opp", card })
				}
				onChooseChallengeTarget={(card) =>
					setPending({ kind: "await_challenge_opp", card })
				}
				discardableSelectedIds={discardableSelectedIds}
				onMidTurnDiscard={handleMidTurnDiscard}
			/>

			<div className="flex-shrink-0">
				<CardFan
					cards={myHand}
					selected={selected}
					discardMode={discardMode}
					discardSelected={discardSelected}
					newCardId={newCardId}
					onSelect={toggleHandSelect}
					onDiscardPick={toggleDiscardPick}
				/>
			</div>

			{!discardMode && (
				<div className="fixed bottom-5 right-5 z-[40] flex flex-col items-end gap-1.5">
					{myHand.length > 7 && game.phase === "play" && isMyTurn && (
						<span className="bg-[#fff0f5]/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-[#8a5a70] shadow">
							Discard {discardSelected.size}/{myHand.length - 7}
						</span>
					)}
					<button
						onClick={handleBaa}
						disabled={!myTurnPlayable}
						className="font-extrabold text-sm px-5 py-3 rounded-full shadow-lg bg-[#a05578] text-[#fff0f5] border border-white/20 disabled:opacity-40 active:translate-y-px transition"
					>
						Baa! (end turn)
					</button>
				</div>
			)}

			{guessTarget && (
				<div className="fixed inset-0 bg-[rgba(0,0,0,0.55)] flex items-center justify-center z-50 p-5">
					<div className="bg-[#fff0f5] rounded-[22px] p-7 max-w-[480px] w-full text-center shadow-2xl">
						<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
							Is that sheep looking at you?
						</h2>
						<p className="mb-3">
							{
								CHALLENGE_META[guessTarget.card.challengeType]
									.desc
							}
						</p>
						<div className="flex gap-2.5 justify-center flex-wrap">
							<button
								onClick={() => submitGuess("heads")}
								className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c05090] text-white active:translate-y-px"
							>
								&#128064; Heads (looking at me)
							</button>
							<button
								onClick={() => submitGuess("butts")}
								className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#e0609a] text-[#4a1a38] active:translate-y-px"
							>
								&#128017; Butts (not looking)
							</button>
						</div>
						<button
							onClick={() => setGuessTarget(null)}
							className="mt-3 text-[#8a5a70] font-bold underline text-sm"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{game.pendingChallenge && (
				<ChallengeOverlay
					game={game}
					myId={myId}
					myHand={myHand}
					emit={emit}
				/>
			)}
			{resultsShown && (
				<ResultsOverlay
					game={game}
					results={game.results!}
					onBack={onBackToMenu}
				/>
			)}
			{isDev && devOpen && <DevPanel emit={emit} />}

			{firstTimeOpen && (
				<div className="fixed inset-0 bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-[70] p-4">
					<div className="bg-[#fff0f5] rounded-[22px] p-6 max-w-[820px] w-full text-center shadow-2xl">
						<div className="text-3xl mb-2">&#128017;</div>
						<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-1">
							First time playing?
						</h2>
						<p className="text-[#8a5a70] font-semibold mb-4">
							Watch the quick-start video to learn how ITSLAM
							works!
						</p>
						<div
							className="relative w-full rounded-[12px] overflow-hidden"
							style={{ paddingBottom: "56.25%" }}
						>
							<iframe
								className="absolute inset-0 w-full h-full"
								src="https://www.youtube.com/embed/0o2nsB1hVK0"
								title="ITSLAM tutorial"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowFullScreen
							/>
						</div>
						<button
							onClick={dismissTutorial}
							className="mt-4 text-[#8a5a70] font-bold underline text-sm"
						>
							Skip - I know how to play
						</button>
					</div>
				</div>
			)}

			{endGameConfirm && (
				<div className="fixed inset-0 bg-[rgba(0,0,0,0.55)] flex items-center justify-center z-[70] p-5">
					<div className="bg-[#fff0f5] rounded-[22px] p-7 max-w-[380px] w-full text-center shadow-2xl">
						<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
							End the game?
						</h2>
						<p className="text-[#8a5a70] font-semibold mb-5">
							This will return everyone to the lobby. The current
							game state will be lost.
						</p>
						<div className="flex gap-2.5 justify-center">
							<button
								onClick={() => {
									emit("abort_game");
									setEndGameConfirm(false);
								}}
								className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#c03060] text-white active:translate-y-px"
							>
								End game
							</button>
							<button
								onClick={() => setEndGameConfirm(false)}
								className="font-extrabold text-sm px-5 py-3 rounded-full shadow bg-[#f0d0e5] text-[#7a3a58] active:translate-y-px"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}

			{logOpen && (
				<div className="fixed top-0 right-0 bottom-0 w-[300px] max-w-[86vw] bg-[#fff0f5] shadow-2xl z-[60] flex flex-col">
					<div className="flex justify-between items-center px-4 py-3.5 border-b-2 border-[#f5d0e8] font-extrabold">
						<span>What's been happening</span>
						<button
							onClick={() => setLogOpen(false)}
							className="text-[#8a5a70] underline font-bold text-sm"
						>
							Close
						</button>
					</div>
					<ul className="px-4 py-2.5 overflow-y-auto flex-1 list-none m-0">
						{[...game.log].reverse().map((entry, i) => (
							<li
								key={i}
								className="py-1.5 border-b border-[#f5d0e8] text-sm text-[#8a5a70] font-semibold"
							>
								{entry.text}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function detectMove(sel: Card[]): Move | null {
	if (sel.length === 0) return null;
	if (sel.length === 1) {
		const c = sel[0];
		if (c.category === "head" || c.category === "butt")
			return { kind: "bodyswap_ready", card: c };
		if (c.category === "action" && c.action === "wheat")
			return { kind: "wheat_ready", card: c };
		if (c.category === "action" && c.action === "wolf")
			return { kind: "wolf_ready", card: c };
		if (c.category === "action" && c.action === "yoink")
			return { kind: "yoink_ready", card: c };
		if (c.category === "action" && c.action === "reflip")
			return { kind: "reflip_ready", card: c };
		if (c.category === "challenge")
			return { kind: "challenge_ready", card: c };
		if (c.category === "modifier")
			return {
				kind: "hint",
				text: `Select ${c.modifier === "franken" ? "two Head or two Butt cards" : "one Head and one Butt card"} to go with your ${c.modifier === "franken" ? "Franken" : "Paint"} card.`,
			};
		return null;
	}
	if (sel.length === 2) {
		const heads = sel.filter((c): c is HeadCard => c.category === "head");
		const butts = sel.filter((c): c is ButtCard => c.category === "butt");
		if (heads.length === 1 && butts.length === 1) {
			const h = heads[0],
				b = butts[0];
			if (h.rainbow && b.rainbow)
				return {
					kind: "add_sheep_ready",
					head: h,
					butt: b,
					label: "Full Rainbow Sheep (2 pts)",
				};
			if (h.rainbow || b.rainbow)
				return {
					kind: "add_sheep_ready",
					head: h,
					butt: b,
					label: "Half Rainbow Sheep (1 pt)",
				};
			if (h.color === b.color)
				return {
					kind: "add_sheep_ready",
					head: h,
					butt: b,
					label: `Basic ${capitalize(h.color)} Sheep (1 pt)`,
				};
			return {
				kind: "hint",
				text: "Those colors don\u2019t match - add a Paint card to mix colors.",
			};
		}
		if (heads.length === 2)
			return {
				kind: "hint",
				text: "Add a Franken card to combine these two heads.",
			};
		if (butts.length === 2)
			return {
				kind: "hint",
				text: "Add a Franken card to combine these two butts.",
			};
		return {
			kind: "hint",
			text: "That combination doesn\u2019t make a valid move.",
		};
	}
	if (sel.length === 3) {
		const modifier = sel.find(
			(c): c is ModifierCard => c.category === "modifier",
		);
		if (!modifier)
			return {
				kind: "hint",
				text: "Pick at most a Head, a Butt, and one Modifier card.",
			};
		const rest = sel.filter((c) => c.id !== modifier.id);
		if (modifier.modifier === "franken") {
			const heads = rest.filter(
				(c): c is HeadCard => c.category === "head",
			);
			const butts = rest.filter(
				(c): c is ButtCard => c.category === "butt",
			);
			if (heads.length === 2)
				return {
					kind: "franken_ready",
					a: heads[0],
					b: heads[1],
					modifier,
					label: `FrankenSheep (2 Heads) - protects flock from Wolf${heads[0].rainbow && heads[1].rainbow ? " (2 pts)" : ""}`,
				};
			if (butts.length === 2)
				return {
					kind: "franken_ready",
					a: butts[0],
					b: butts[1],
					modifier,
					label: `FrankenSheep (2 Butts) - protects flock from Wheat${butts[0].rainbow && butts[1].rainbow ? " (2 pts)" : ""}`,
				};
			return {
				kind: "hint",
				text: "FrankenSheep needs 2 Head cards or 2 Butt cards.",
			};
		}
		if (modifier.modifier === "paint") {
			const head = rest.find((c): c is HeadCard => c.category === "head");
			const butt = rest.find((c): c is ButtCard => c.category === "butt");
			if (head && butt)
				return {
					kind: "paint_ready",
					head,
					butt,
					modifier,
					label: `Painted Sheep (${capitalize(head.color)} + ${capitalize(butt.color)})`,
				};
			return {
				kind: "hint",
				text: "A Painted Sheep needs one Head and one Butt card.",
			};
		}
	}
	return { kind: "hint", text: "Select up to 3 cards to build a move." };
}

function CardFan({
	cards,
	selected,
	discardMode,
	discardSelected,
	newCardId,
	onSelect,
	onDiscardPick,
}: {
	cards: Card[];
	selected: Set<string>;
	discardMode: boolean;
	discardSelected: Set<string>;
	newCardId: string | null;
	onSelect: (c: Card) => void;
	onDiscardPick: (c: Card) => void;
}) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(600);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		setContainerWidth(el.getBoundingClientRect().width);
		const ro = new ResizeObserver((entries) =>
			setContainerWidth(entries[0].contentRect.width),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const n = cards.length;
	if (n === 0)
		return (
			<div className="px-8 mb-8 h-[132px] md:h-[152px] lg:h-[168px]" />
		);

	const mid = (n - 1) / 2;
	const spreadBudget = containerWidth * 0.85;
	const spacing = n > 1 ? Math.min(80, spreadBudget / (n - 1)) : 0;
	const angleStep = n <= 1 ? 0 : Math.min(5, 28 / (n - 1));
	const hoveredIdx = hoveredId
		? cards.findIndex((c) => c.id === hoveredId)
		: -1;

	return (
		<div
			ref={containerRef}
			className="px-8 mb-8 relative h-[132px] md:h-[152px] lg:h-[168px] w-full"
		>
			{cards.map((card, i) => {
				const angle = (i - mid) * angleStep;
				const spread =
					hoveredIdx >= 0
						? i < hoveredIdx
							? -8
							: i > hoveredIdx
								? 8
								: 0
						: 0;
				const xOffset = (i - mid) * spacing + spread;
				const isSelected = selected.has(card.id);
				const isDiscard = discardMode && discardSelected.has(card.id);
				const isHovered = hoveredId === card.id;
				return (
					<div
						key={card.id}
						onMouseEnter={() => setHoveredId(card.id)}
						onMouseLeave={() => setHoveredId(null)}
						style={{
							position: "absolute",
							bottom: 0,
							left: "50%",
							transformOrigin: "bottom center",
							transform: `translateX(calc(-50% + ${xOffset}px)) rotate(${angle}deg)`,
							transition: "transform 0.15s ease",
							zIndex: isHovered
								? n + 20
								: isSelected || isDiscard
									? n + 10
									: n - Math.abs(Math.round(i - mid)),
						}}
					>
						<div
							className="transition-transform duration-150"
							style={{
								transform: isHovered
									? "translateY(-24px)"
									: undefined,
							}}
						>
							<div
								className={
									newCardId === card.id
										? "card-deal"
										: undefined
								}
							>
								<CardChip
									card={card}
									selected={
										discardMode ? isDiscard : isSelected
									}
									discardPick={isDiscard}
									onClick={
										discardMode ? onDiscardPick : onSelect
									}
								/>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function MoveBar(props: {
	discardMode: boolean;
	discardNeed: number;
	discardCount: number;
	onConfirmDiscard: () => void;
	onCancelDiscard: () => void;
	pending: Pending | null;
	onCancelPending: () => void;
	myTurnPlayable: boolean;
	move: Move | null;
	challengeUsedThisTurn: boolean;
	onClear: () => void;
	onAddSheep: (head: HeadCard, butt: ButtCard) => void;
	onFranken: (
		a: HeadCard | ButtCard,
		b: HeadCard | ButtCard,
		modifier: ModifierCard,
	) => void;
	onPaint: (head: HeadCard, butt: ButtCard, modifier: ModifierCard) => void;
	onChooseYoinkTarget: (card: ActionCard) => void;
	onChooseChallengeTarget: (card: ChallengeCard) => void;
	discardableSelectedIds: string[];
	onMidTurnDiscard: (ids: string[]) => void;
}) {
	const panel = `fixed bottom-5 left-5 z-[40] bg-[#fff0f5] border-2 border-[#e0609a] rounded-2xl px-4 py-3 shadow-lg max-w-[260px] flex flex-col gap-2`;
	const btn = (extra: string) =>
		`font-extrabold text-sm px-4 py-2 rounded-full shadow active:translate-y-px transition ${extra}`;

	const discardBtn = props.discardableSelectedIds.length > 0 &&
		props.myTurnPlayable &&
		!props.discardMode && (
			<button
				onClick={() =>
					props.onMidTurnDiscard(props.discardableSelectedIds)
				}
				className={btn("bg-[#c03060] text-white")}
			>
				Discard {props.discardableSelectedIds.length} card
				{props.discardableSelectedIds.length !== 1 ? "s" : ""}
			</button>
		);

	if (props.discardMode) {
		return (
			<div className={panel}>
				<div className="font-bold text-sm">
					Choose {props.discardNeed} card
					{props.discardNeed === 1 ? "" : "s"} to discard, then
					confirm.
				</div>
				<div className="flex gap-2 flex-wrap">
					<button
						disabled={props.discardCount !== props.discardNeed}
						onClick={props.onConfirmDiscard}
						className={btn(
							"bg-[#a05578] text-[#fff0f5] disabled:opacity-50",
						)}
					>
						Confirm Baa
					</button>
					<button
						onClick={props.onCancelDiscard}
						className="text-[#8a5a70] underline font-bold text-sm self-center"
					>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	if (props.pending) {
		const d: Record<Pending["kind"], string> = {
			await_wheat_sheep: `Click any opponent's Sheep to lure it to your field.`,
			await_wolf_sheep: `Click any opponent's Sheep to send it to the discard pile.`,
			await_yoink_opp: `Click an opponent to yoink cards from.`,
			await_challenge_opp: `Click an opponent to challenge.`,
			await_bodyswap_target: `Click a highlighted Sheep to complete it with your card.`,
		};
		return (
			<div className={panel}>
				<div className="font-bold text-sm">{d[props.pending.kind]}</div>
				<div className="flex gap-2 flex-wrap items-center">
					{discardBtn}
					<button
						onClick={props.onCancelPending}
						className="text-[#8a5a70] underline font-bold text-sm"
					>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	if (!props.myTurnPlayable) return null;

	const move = props.move;
	let mainContent: React.ReactNode = null;
	let actionBtn: React.ReactNode = null;

	if (move?.kind === "hint") {
		mainContent = <div className="font-bold text-sm">{move.text}</div>;
	} else if (move?.kind === "add_sheep_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Add a <b>{move.label}</b> to your field?
			</div>
		);
		actionBtn = (
			<button
				onClick={() => props.onAddSheep(move.head, move.butt)}
				className={btn("bg-[#c05090] text-white")}
			>
				Add Sheep
			</button>
		);
	} else if (move?.kind === "franken_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Combine into a <b>{move.label}</b>?
			</div>
		);
		actionBtn = (
			<button
				onClick={() => props.onFranken(move.a, move.b, move.modifier)}
				className={btn("bg-[#c05090] text-white")}
			>
				Combine
			</button>
		);
	} else if (move?.kind === "paint_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Add a <b>{move.label}</b> to your field?
			</div>
		);
		actionBtn = (
			<button
				onClick={() =>
					props.onPaint(move.head, move.butt, move.modifier)
				}
				className={btn("bg-[#c05090] text-white")}
			>
				Paint Sheep
			</button>
		);
	} else if (move?.kind === "yoink_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Choose an opponent to yoink 2 cards from.
			</div>
		);
		actionBtn = (
			<button
				onClick={() => props.onChooseYoinkTarget(move.card)}
				className={btn("bg-[#e0609a] text-[#4a1a38]")}
			>
				Choose target&hellip;
			</button>
		);
	} else if (move?.kind === "reflip_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Re-Flip can be played after a challenge coin flip to re-flip the
				result.
			</div>
		);
	} else if (move?.kind === "challenge_ready") {
		if (props.challengeUsedThisTurn) {
			mainContent = (
				<div className="font-bold text-sm">
					You already played a Challenge card this turn.
				</div>
			);
		} else {
			mainContent = (
				<div className="font-bold text-sm">
					<b>{cardMeta(move.card).label}</b> - choose who to
					challenge.
				</div>
			);
			actionBtn = (
				<button
					onClick={() => props.onChooseChallengeTarget(move.card)}
					className={btn("bg-[#e0609a] text-[#4a1a38]")}
				>
					Choose opponent&hellip;
				</button>
			);
		}
	}

	if (!mainContent && !discardBtn) return null;

	return (
		<div className={panel}>
			{mainContent}
			<div className="flex gap-2 flex-wrap items-center">
				{actionBtn}
				{discardBtn}
				{(mainContent || actionBtn) && (
					<button
						onClick={props.onClear}
						className="text-[#8a5a70] underline font-bold text-sm"
					>
						Clear
					</button>
				)}
			</div>
		</div>
	);
}
