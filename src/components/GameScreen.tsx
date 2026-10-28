"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Pin, PinOff, X } from "lucide-react";
import {
	ActionCard,
	Card,
	ChallengeCard,
	GameView,
	HeadCard,
	ButtCard,
	ModifierCard,
	LobbyView,
	LogEntry,
	SheepEntity,
} from "@/lib/types";
import { CHALLENGE_META, cardMeta, capitalize } from "@/lib/cardMeta";
import { entityPoints } from "@/lib/engine";
import { CardChip } from "./CardChip";
import {
	SheepChip,
	isSwappable,
	canBodyswapComplete,
	computeBodyswapRemoveId,
} from "./SheepChip";
import { ChallengeOverlay } from "./ChallengeOverlay";
import { ResultsOverlay } from "./ResultsOverlay";
import { Modal } from "./Modal";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { DevPanel } from "./DevPanel";
import { TutorialVideo } from "./TutorialVideo";

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

const modalPanel =
	"bg-[#fff0f5] rounded-[22px] p-7 max-w-[480px] w-full text-center shadow-2xl";

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
	const [discardSelected, setDiscardSelected] = useState<Set<string>>(
		new Set(),
	);
	const [logOpen, setLogOpen] = useState(false);
	// Set when undocking, so the overlay takes over from the docked column in place
	const [logEnterInstant, setLogEnterInstant] = useState(false);
	// Desktop can dock the log beside the game instead of over it; remembered
	const [logDocked, setLogDockedState] = useState(() => {
		try {
			return localStorage.getItem("flock_log_docked") === "1";
		} catch {
			return false;
		}
	});
	function setLogDocked(docked: boolean) {
		setLogDockedState(docked);
		try {
			localStorage.setItem("flock_log_docked", docked ? "1" : "0");
		} catch {}
	}
	const wideScreen = useMediaQuery("(min-width: 1024px)");
	// Too narrow to dock - fall back to the overlay
	const logDockedNow = logDocked && wideScreen;
	// Nobody can start playing until every player has finished or skipped the video
	const tutorial = game.tutorialProgress;
	const myTutorial = tutorial?.[myId] ?? 1;
	// Closed locally - hides the video straight away, even before the server confirms
	const [tutorialDismissed, setTutorialDismissed] = useState(false);
	const firstTimeOpen = !!tutorial && myTutorial < 1 && !tutorialDismissed;
	const lastSentPct = useRef(-1);
	function reportTutorialProgress(progress: number) {
		const pct = Math.floor(progress * 100);
		if (pct <= lastSentPct.current) return;
		lastSentPct.current = pct;
		emit("tutorial_progress", { progress: pct >= 100 ? 1 : pct / 100 });
	}
	function dismissTutorial() {
		lastSentPct.current = 100;
		setTutorialDismissed(true);
		emit("tutorial_progress", { progress: 1 });
	}
	// Keep telling the server we're ready until it shows up in the state
	// (covers a dropped message or a reconnect mid-tutorial)
	const awaitingReadyAck = !!tutorial && tutorialDismissed && myTutorial < 1;
	useEffect(() => {
		if (!awaitingReadyAck) return;
		const t = setInterval(
			() => emit("tutorial_progress", { progress: 1 }),
			1500,
		);
		return () => clearInterval(t);
	}, [awaitingReadyAck]);
	const [endGameConfirm, setEndGameConfirm] = useState(false);
	const [devOpen, setDevOpen] = useState(false);
	const iAmHost = state.hostId === myId;
	const isDev = process.env.NODE_ENV !== "production";

	const me = game.players.find((p) => p.id === myId)!;
	const myHand = me.hand || [];
	// Local-only hand order: cards the player has arranged keep their spot,
	// anything new goes on the end in the order the server dealt it
	// Saved per lobby so it survives a refresh; ids no longer in hand are ignored
	const [handOrder, setHandOrderState] = useState<string[]>(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem("flock_hand_order") || "null",
			);
			return saved?.code === state.code && Array.isArray(saved.ids)
				? saved.ids
				: [];
		} catch {
			return [];
		}
	});
	function setHandOrder(ids: string[]) {
		setHandOrderState(ids);
		try {
			localStorage.setItem(
				"flock_hand_order",
				JSON.stringify({ code: state.code, ids }),
			);
		} catch {}
	}
	const orderedHand = useMemo(() => {
		const byId = new Map(myHand.map((c) => [c.id, c]));
		const placed = handOrder
			.map((id) => byId.get(id))
			.filter((c): c is Card => !!c);
		const placedIds = new Set(placed.map((c) => c.id));
		return [...placed, ...myHand.filter((c) => !placedIds.has(c.id))];
	}, [myHand, handOrder]);
	const opponents = game.players.filter((p) => p.id !== myId);
	const isMyTurn = game.currentPlayerId === myId;
	// Final phase of the turn: picking cards to get back down to 7
	const discardMode = isMyTurn && game.phase === "discard" && !game.ended;
	const discardNeed = Math.max(0, myHand.length - 7);
	// Only picks still in hand count, capped at what's needed, so a stale or extra
	// pick can never be shown or sent
	const discardPicks = new Set(
		myHand
			.filter((c) => discardSelected.has(c.id))
			.slice(0, discardNeed)
			.map((c) => c.id),
	);
	// Field total; the hidden challenge-card penalty only shows once the game ends
	const fieldPts = (p: { id: string; field: SheepEntity[] }) =>
		game.results?.scores[p.id] ??
		p.field.reduce((sum, e) => sum + entityPoints(e), 0);
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
			pending?.kind === "await_bodyswap_target" ||
			pending?.kind === "await_yoink_opp" ||
			pending?.kind === "await_challenge_opp";
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
		else if (newMove?.kind === "yoink_ready")
			setPending({ kind: "await_yoink_opp", card: newMove.card });
		else if (
			newMove?.kind === "challenge_ready" &&
			!game.challengeUsedThisTurn
		)
			setPending({ kind: "await_challenge_opp", card: newMove.card });
		else setPending(null);
	}

	function toggleDiscardPick(card: Card) {
		if (card.category === "challenge") return;
		if (discardPicks.has(card.id)) {
			const next = new Set(discardPicks);
			next.delete(card.id);
			setDiscardSelected(next);
		} else if (discardPicks.size < discardNeed) {
			setDiscardSelected(new Set(discardPicks).add(card.id));
		}
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
			!game.pendingChallenge &&
			!tutorial
		) {
			const t = setTimeout(() => emit("draw"), 400);
			return () => clearTimeout(t);
		}
	}, [isMyTurn, game.phase, game.ended, !!game.pendingChallenge, !!tutorial]);

	// Clear selection at the start and end of every turn
	useEffect(() => {
		setSelected(new Set());
		setPending(null);
		setDiscardSelected(new Set());
	}, [game.currentPlayerId]);

	// Track newly drawn card for animation
	const prevHandIdsRef = useRef(new Set(myHand.map((c) => c.id)));
	const prevPhaseRef = useRef(game.phase);
	const [newCardId, setNewCardId] = useState<string | null>(null);
	// Cards picked up by this turn's draw, highlighted until the turn ends
	const [drawnIds, setDrawnIds] = useState<Set<string>>(new Set());
	useEffect(() => {
		const addedCards = myHand.filter(
			(c) => !prevHandIdsRef.current.has(c.id),
		);
		const wasDraw = isMyTurn && prevPhaseRef.current === "draw";
		prevHandIdsRef.current = new Set(myHand.map((c) => c.id));
		if (wasDraw && addedCards.length > 0) {
			setDrawnIds(new Set(addedCards.map((c) => c.id)));
		}
		const added = addedCards[0];
		if (added) {
			setNewCardId(added.id);
			const t = setTimeout(() => setNewCardId(null), 500);
			return () => clearTimeout(t);
		}
	}, [myHand.map((c) => c.id).join(",")]);

	// Runs after the hand effect so it sees the phase from before this update
	useEffect(() => {
		prevPhaseRef.current = game.phase;
	}, [game.phase]);

	useEffect(() => {
		setDrawnIds(new Set());
	}, [game.currentPlayerId]);

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
		if (discardMode) {
			if (discardPicks.size !== discardNeed) return;
			emit("end_turn", { discardCardIds: Array.from(discardPicks) });
			setDiscardSelected(new Set());
		} else if (discardNeed > 0) {
			// Moves on to the discard phase - no more plays this turn
			clearSelection();
			setPending(null);
			setDiscardSelected(new Set());
			emit("start_discard");
		} else {
			emit("end_turn", { discardCardIds: [] });
		}
	}

	function handleBackToPlay() {
		setDiscardSelected(new Set());
		emit("cancel_discard");
	}

	const resultsShown = game.ended && game.results;

	function logHeader(docked: boolean) {
		return (
			<div className="flex justify-between items-center gap-3 px-4 py-2.5 border-b-2 border-[#f5d0e8] font-extrabold">
				<span>What's been happening</span>
				<div className="flex items-center gap-1">
					{docked ? (
						<IconButton
							label="Undock - show the log over the game"
							onClick={() => {
								setLogDocked(false);
								// Already on screen - don't slide it in again
								setLogEnterInstant(true);
								setLogOpen(true);
							}}
						>
							<PinOff size={18} strokeWidth={2.5} />
						</IconButton>
					) : (
						wideScreen && (
							<IconButton
								label="Dock - keep the log open beside the game"
								onClick={() => {
									setLogDocked(true);
									setLogOpen(false);
								}}
							>
								<Pin size={18} strokeWidth={2.5} />
							</IconButton>
						)
					)}
					<IconButton
						label="Close log"
						onClick={() =>
							docked ? setLogDocked(false) : setLogOpen(false)
						}
					>
						<X size={20} strokeWidth={2.5} />
					</IconButton>
				</div>
			</div>
		);
	}

	const logEntries = (
		<div className="px-4 py-2.5 overflow-y-auto flex-1">
			{groupLogByTurn(game.log)
				.reverse()
				.map((group, gi) => (
					<div key={gi} className="mb-3">
						{group.turn !== undefined && (
							<div className="sticky top-0 bg-[#fff0f5] pt-1 pb-1 text-xs font-extrabold uppercase tracking-wide text-[#c0407a] border-b-2 border-[#f5d0e8]">
								{group.turn === 0
									? "Setup"
									: `Turn ${group.turn} · ${
											game.players.find(
												(p) => p.id === group.playerId,
											)?.name ?? "?"
										}`}
							</div>
						)}
						<ul className="list-none m-0 p-0">
							{group.entries.map((entry, i) => (
								<li
									key={i}
									className="py-1.5 border-b border-[#f5d0e8] last:border-b-0 text-sm text-[#8a5a70] font-semibold"
								>
									{entry.text}
								</li>
							))}
						</ul>
					</div>
				))}
		</div>
	);

	// Mobile hand drawer. It gets out of the way whenever the player has to tap
	// something on the board, and pops open when it's time to discard.
	const [handOpen, setHandOpen] = useState(false);
	useEffect(() => {
		// Bodyswap waits for "Choose a sheep" - the card may be half of a new sheep
		if (pending && pending.kind !== "await_bodyswap_target")
			setHandOpen(false);
	}, [pending]);
	useEffect(() => {
		if (discardMode) setHandOpen(true);
	}, [discardMode]);
	useEffect(() => {
		if (game.ended) setHandOpen(false);
	}, [game.ended]);

	const moveBarProps: React.ComponentProps<typeof MoveBar> = {
		pending,
		onCancelPending: () => {
			setPending(null);
			clearSelection();
		},
		myTurnPlayable,
		move,
		challengeUsedThisTurn: game.challengeUsedThisTurn,
		onClear: clearSelection,
		onAddSheep: (head, butt) => {
			emit("play_sheep", {
				headCardId: head.id,
				buttCardId: butt.id,
			});
			clearSelection();
		},
		onFranken: (a, b, modifier) => {
			const payload: any = {
				modifierCardId: modifier.id,
				extraCardId: b.id,
			};
			payload[a.category === "head" ? "headCardId" : "buttCardId"] = a.id;
			emit("play_sheep", payload);
			clearSelection();
		},
		onPaint: (head, butt, modifier) => {
			emit("play_sheep", {
				headCardId: head.id,
				buttCardId: butt.id,
				modifierCardId: modifier.id,
			});
			clearSelection();
		},
	};

	const turnNotes = discardMode ? (
		<>
			<button
				onClick={handleBackToPlay}
				className="bg-[#fff0f5]/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-[#8a5a70] underline shadow"
			>
				&larr; Back to play
			</button>
			<span className="bg-[#fff0f5]/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-[#8a5a70] shadow text-center">
				Pick {discardNeed} card{discardNeed === 1 ? "" : "s"} to discard
			</span>
		</>
	) : (
		myTurnPlayable &&
		discardNeed > 0 && (
			<span className="bg-[#fff0f5]/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-bold text-[#8a5a70] shadow text-center">
				Over 7 cards - you&apos;ll discard {discardNeed} when you Baa
			</span>
		)
	);

	const baaButton = (extra = "") => (
		<button
			onClick={handleBaa}
			disabled={
				discardMode
					? discardPicks.size !== discardNeed
					: !myTurnPlayable
			}
			className={`font-extrabold text-sm px-5 py-3 rounded-full shadow-lg bg-[#a05578] text-[#fff0f5] border border-white/20 disabled:opacity-40 active:translate-y-px transition whitespace-nowrap ${extra}`}
		>
			{discardMode
				? discardPicks.size === discardNeed
					? "Baa! (end turn)"
					: `Discard ${discardPicks.size}/${discardNeed}`
				: "Baa! (end turn)"}
		</button>
	);

	return (
		<div className="flex h-screen">
			<section className="flex flex-col h-screen overflow-hidden flex-1 min-w-0">
				<header className="flex items-center justify-between gap-x-2 gap-y-1.5 px-4 py-2.5 bg-[#a05578] text-[#fff0f5] flex-wrap">
					<div className="flex items-center gap-2.5">
						<span className="font-display font-extrabold text-lg">
							ITSLAM
						</span>
						<span className="bg-white/10 rounded-full px-2.5 py-1 text-sm font-bold">
							&#127200; <b>{game.deckCount}</b>
						</span>
					</div>
					{/* Mobile: drops to its own full-width line under the logo and links */}
					<div className="order-last basis-full flex justify-center min-w-0 md:order-none md:basis-auto md:flex-1">
						<span className="font-display font-extrabold text-[#ffeef5] text-center bg-black/10 rounded-full px-3 py-1 text-sm truncate w-full md:w-auto md:px-4 md:text-base">
							{game.ended
								? "Game over!"
								: tutorial
									? "Waiting for everyone to watch the tutorial..."
									: isMyTurn
										? "It's your turn!"
										: `${game.players.find((p) => p.id === game.currentPlayerId)?.name}'s turn`}
						</span>
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
						{/* The docked log is already on screen */}
						{!logDockedNow && (
							<button
								onClick={() => {
									setLogEnterInstant(false);
									setLogOpen(true);
								}}
								className="text-[#fbf4e4] underline font-bold text-sm"
							>
								Game Log
							</button>
						)}
					</div>
				</header>

				<div className="opponents-scroll flex gap-2.5 px-3.5 pt-2.5 pb-3 mb-1 overflow-x-auto flex-shrink-0 short:[zoom:0.8] short:mb-0">
					{opponents.map((p) => {
						const isTurn = p.id === game.currentPlayerId;
						const lobbyPlayer = state.players.find(
							(x) => x.id === p.id,
						);
						const connected = lobbyPlayer?.connected ?? true;
						const isBot = !!lobbyPlayer?.isBot;
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
									!connected ? "opacity-70" : "",
								].join(" ")}
							>
								<div className="flex items-start justify-between gap-2 mb-1.5">
									<div className="min-w-0">
										<div className="flex items-center gap-1 font-extrabold leading-tight">
											<span className="truncate">
												{p.name}
											</span>
											{isBot && (
												<span
													title="Bot"
													className="flex-shrink-0"
												>
													<Bot
														size={15}
														strokeWidth={2.5}
														className="text-[#8a5a70]"
													/>
												</span>
											)}
											{!connected && !isBot && (
												<span
													title="Reconnecting..."
													className="flex-shrink-0"
												>
													<LoaderCircle
														size={15}
														strokeWidth={2.5}
														className="text-[#c0407a] animate-spin"
													/>
												</span>
											)}
										</div>
										<div className="text-[11px] text-[#8a5a70] font-bold">
											{p.handCount} card
											{p.handCount === 1 ? "" : "s"} in
											hand
										</div>
									</div>
									{tutorial ? (
										<TutorialPill
											progress={tutorial[p.id] ?? 1}
										/>
									) : (
										<PointsPill pts={fieldPts(p)} />
									)}
								</div>
								<div className="flex gap-2 flex-wrap min-h-[30px]">
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
					<div className="flex items-center gap-2 mb-1.5">
						<span className="font-extrabold text-[#8a5a70] text-sm uppercase tracking-wide">
							Your field
						</span>
						{tutorial ? (
							<TutorialPill progress={myTutorial} />
						) : (
							<PointsPill pts={fieldPts(me)} />
						)}
					</div>
					<div className="flex gap-3 flex-wrap min-h-[100px] content-start">
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

				<div className="hidden md:block">
					<MoveBar {...moveBarProps} />
				</div>

				<div className="flex-shrink-0 hidden md:block">
					<CardFan
						cards={orderedHand}
						selected={selected}
						discardMode={discardMode}
						disabled={!isMyTurn && !discardMode}
						discardSelected={discardPicks}
						newCardId={newCardId}
						drawnIds={drawnIds}
						onSelect={toggleHandSelect}
						onDiscardPick={toggleDiscardPick}
						onReorder={setHandOrder}
					/>
				</div>

				<div
					className="fixed bottom-5 right-5 z-[40] hidden md:flex flex-col items-end gap-1.5"
					// Stay clear of the docked log
					style={logDockedNow ? { right: 320 } : undefined}
				>
					{turnNotes}
					{baaButton()}
				</div>

				{/* Mobile: the hand lives in a drawer instead of the fan */}
				<div className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-[#fff0f5]/85 backdrop-blur-sm border-t-2 border-white/80">
					{pending ? (
						<>
							<div className="flex-1 font-bold text-sm text-[#7a3a58] leading-snug">
								{pendingText(pending)}
							</div>
							<button
								onClick={moveBarProps.onCancelPending}
								className="text-[#8a5a70] underline font-bold text-sm px-2"
							>
								Clear
							</button>
						</>
					) : (
						<>
							<button
								onClick={() => setHandOpen(true)}
								className={[
									"flex-1 basis-0 min-w-0 h-11 flex items-center justify-center gap-2 rounded-full pl-2 pr-3 font-extrabold text-sm shadow transition active:translate-y-px",
									myTurnPlayable || discardMode
										? "bg-[#c05090] text-white"
										: "bg-white text-[#7a3a58]",
								].join(" ")}
							>
								<HandStackPreview count={myHand.length} />
								<span className="truncate">
									{discardMode
										? `Discard ${discardNeed}`
										: myTurnPlayable
											? "Play cards"
											: "Your hand"}
								</span>
							</button>
							{!discardMode &&
								baaButton(
									"flex-1 basis-0 h-11 !px-3 !py-0 !shadow",
								)}
						</>
					)}
				</div>

				<HandDrawer
					open={
						handOpen &&
						(!pending || pending.kind === "await_bodyswap_target")
					}
					onClose={() => setHandOpen(false)}
					title={
						discardMode
							? `Pick ${discardNeed} card${discardNeed === 1 ? "" : "s"} to discard`
							: isMyTurn
								? "Your hand"
								: "Your hand - waiting for your turn"
					}
				>
					<HandGrid
						cards={orderedHand}
						selected={selected}
						discardMode={discardMode}
						disabled={!isMyTurn && !discardMode}
						discardSelected={discardPicks}
						drawnIds={drawnIds}
						onSelect={toggleHandSelect}
						onDiscardPick={toggleDiscardPick}
						onReorder={setHandOrder}
					/>
					<p className="text-center text-[11px] font-bold text-[#8a5a70] opacity-70 mt-2 mb-0">
						Drag cards to rearrange your hand
					</p>
					<MoveBar
						{...moveBarProps}
						inline
						onPickTarget={() => setHandOpen(false)}
					/>
					{(myTurnPlayable || discardMode) && (
						<div className="flex flex-col items-stretch gap-1.5 mt-3">
							{turnNotes}
							{baaButton()}
						</div>
					)}
				</HandDrawer>

				<Modal open={!!guessTarget} panelClassName={modalPanel}>
					{guessTarget && (
						<>
							<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
								Is that sheep looking at you?
							</h2>
							<p className="mb-3">
								{
									CHALLENGE_META[
										guessTarget.card.challengeType
									].desc
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
						</>
					)}
				</Modal>

				<Modal
					open={!!game.pendingChallenge}
					panelClassName={`${modalPanel} max-h-[86vh] overflow-y-auto`}
				>
					{game.pendingChallenge && (
						<ChallengeOverlay
							game={game}
							myId={myId}
							myHand={myHand}
							emit={emit}
						/>
					)}
				</Modal>
				<Modal
					open={!!resultsShown}
					panelClassName={`${modalPanel} max-h-[86vh] overflow-y-auto`}
				>
					{resultsShown && (
						<ResultsOverlay
							game={game}
							results={game.results!}
							onBack={onBackToMenu}
						/>
					)}
				</Modal>
				{isDev && devOpen && <DevPanel emit={emit} />}

				<Modal
					open={firstTimeOpen}
					backdropClassName="bg-[rgba(0,0,0,0.6)]"
					className="z-[70] p-4"
					panelClassName="bg-[#fff0f5] rounded-[22px] p-6 max-w-[820px] w-full text-center shadow-2xl"
				>
					{firstTimeOpen && (
						<>
							<div className="text-3xl mb-2">&#128017;</div>
							<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-1">
								First time playing?
							</h2>
							<p className="text-[#8a5a70] font-semibold mb-4">
								Watch the quick-start video to learn how ITSLAM
								works!
							</p>
							<TutorialVideo
								videoId="0o2nsB1hVK0"
								onProgress={reportTutorialProgress}
								onEnded={dismissTutorial}
							/>
							<div className="mt-3">
								<TutorialStatusList
									players={game.players}
									tutorial={tutorial!}
								/>
							</div>
							<button
								onClick={dismissTutorial}
								className="mt-4 text-[#8a5a70] font-bold underline text-sm"
							>
								Skip - I know how to play
							</button>
						</>
					)}
				</Modal>

				<Modal
					open={endGameConfirm}
					className="z-[70] p-5"
					panelClassName="bg-[#fff0f5] rounded-[22px] p-7 max-w-[380px] w-full text-center shadow-2xl"
				>
					<h2 className="font-display text-2xl text-[#7a3a58] mt-0 mb-2">
						End the game?
					</h2>
					<p className="text-[#8a5a70] font-semibold mb-5">
						This will return everyone to the lobby. The
						current game state will be lost.
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
				</Modal>

				{/* Unmounted outright when docking, so it doesn't play its exit
				    animation while the docked column takes its place */}
				{!logDockedNow && (
					<LogPanel
						open={logOpen}
						enterInstant={logEnterInstant}
						onClose={() => setLogOpen(false)}
					>
						{logHeader(false)}
						{logEntries}
					</LogPanel>
				)}
			</section>

			{/* Desktop: the log docked as a column beside the game */}
			{logDockedNow && (
				<aside className="w-[300px] flex-shrink-0 h-screen bg-[#fff0f5] border-l-2 border-[#f5d0e8] flex flex-col">
					{logHeader(true)}
					{logEntries}
				</aside>
			)}
		</div>
	);
}

// Consecutive log entries from the same turn, oldest first
function groupLogByTurn(log: LogEntry[]) {
	const groups: {
		turn?: number;
		playerId?: string;
		entries: LogEntry[];
	}[] = [];
	for (const entry of log) {
		const last = groups[groups.length - 1];
		if (last && last.turn === entry.turn) last.entries.push(entry);
		else
			groups.push({
				turn: entry.turn,
				playerId: entry.playerId,
				entries: [entry],
			});
	}
	return groups;
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

function PointsPill({ pts }: { pts: number }) {
	return (
		<span className="flex-shrink-0 bg-[#c0407a] text-white rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums shadow-sm">
			{pts} pt{pts === 1 ? "" : "s"}
		</span>
	);
}

function TutorialStatusList({
	players,
	tutorial,
}: {
	players: { id: string; name: string }[];
	tutorial: Record<string, number>;
}) {
	return (
		<div className="flex gap-2 flex-wrap justify-center">
			{players.map((p) => (
				<span
					key={p.id}
					className="flex items-center gap-1.5 text-xs font-bold text-[#8a5a70]"
				>
					{p.name}
					<TutorialPill progress={tutorial[p.id] ?? 1} />
				</span>
			))}
		</div>
	);
}

function TutorialPill({ progress }: { progress: number }) {
	if (progress >= 1)
		return (
			<span className="flex-shrink-0 bg-[#3a9a5a] text-white rounded-full px-2.5 py-0.5 text-xs font-extrabold shadow-sm">
				Ready!
			</span>
		);
	return (
		<span className="flex-shrink-0 bg-[#f0d0e5] text-[#7a3a58] rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums shadow-sm">
			&#128250; Tutorial {Math.floor(progress * 100)}%
		</span>
	);
}

function CardFan({
	cards,
	selected,
	discardMode,
	disabled,
	discardSelected,
	newCardId,
	drawnIds,
	onSelect,
	onDiscardPick,
	onReorder,
}: {
	cards: Card[];
	selected: Set<string>;
	discardMode: boolean;
	disabled: boolean;
	discardSelected: Set<string>;
	newCardId: string | null;
	drawnIds: Set<string>;
	onSelect: (c: Card) => void;
	onDiscardPick: (c: Card) => void;
	onReorder: (ids: string[]) => void;
}) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(600);
	// Matches the `short:` variant in globals.css, where the hand uses smaller cards
	const shortScreen = useMediaQuery("(min-width: 768px) and (max-height: 650px)");
	// Drag-to-reorder works any time, even when it isn't your turn. It only
	// counts as a drag once the pointer has moved a little, so taps still select.
	const [drag, setDrag] = useState<{
		id: string;
		pointerId: number;
		startX: number;
		x: number;
		active: boolean;
	} | null>(null);
	const suppressClickRef = useRef(false);

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
	const mid = (n - 1) / 2;
	const spreadBudget = containerWidth * 0.85;
	const spacing = n > 1 ? Math.min(shortScreen ? 58 : 80, spreadBudget / (n - 1)) : 0;
	const angleStep = n <= 1 ? 0 : Math.min(5, 28 / (n - 1));

	// Pointer x relative to the fan's centre line
	function relX(clientX: number) {
		const rect = containerRef.current?.getBoundingClientRect();
		return rect ? clientX - (rect.left + rect.width / 2) : 0;
	}
	// Slot the dragged card would land in if dropped at this pointer x
	function dropIndex(clientX: number) {
		if (spacing === 0) return 0;
		const idx = Math.round(relX(clientX) / spacing + mid);
		return Math.max(0, Math.min(n - 1, idx));
	}

	useEffect(() => {
		if (!drag) return;
		function onMove(e: PointerEvent) {
			if (e.pointerId !== drag!.pointerId) return;
			setDrag(
				(d) =>
					d && {
						...d,
						x: e.clientX,
						active: d.active || Math.abs(e.clientX - d.startX) > 6,
					},
			);
		}
		function onUp(e: PointerEvent) {
			if (e.pointerId !== drag!.pointerId) return;
			if (drag!.active) {
				const rest = cards
					.map((c) => c.id)
					.filter((id) => id !== drag!.id);
				rest.splice(dropIndex(e.clientX), 0, drag!.id);
				onReorder(rest);
				// The click that follows the drop shouldn't select the card
				suppressClickRef.current = true;
				setTimeout(() => (suppressClickRef.current = false), 0);
			}
			setDrag(null);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [drag, cards, spacing, mid, n]);

	if (n === 0)
		return (
			<div className="px-8 mb-8 h-[132px] md:h-[152px] lg:h-[168px] short:h-[108px] short:mb-6" />
		);

	const dragging = drag?.active ? drag : null;
	// While dragging, the other cards shuffle to show where the drop will land
	let layout = cards;
	if (dragging) {
		const draggedCard = cards.find((c) => c.id === dragging.id);
		if (draggedCard) {
			layout = cards.filter((c) => c.id !== dragging.id);
			layout.splice(dropIndex(dragging.x), 0, draggedCard);
		}
	}
	const activeHoverId = disabled || dragging ? null : hoveredId;
	const hoveredIdx = activeHoverId
		? layout.findIndex((c) => c.id === hoveredId)
		: -1;

	return (
		<div
			ref={containerRef}
			onClickCapture={(e) => {
				if (suppressClickRef.current) {
					e.stopPropagation();
					suppressClickRef.current = false;
				}
			}}
			className="px-8 mb-8 relative h-[132px] md:h-[152px] lg:h-[168px] short:h-[108px] short:mb-6 w-full"
		>
			{layout.map((card, i) => {
				const isDragged = dragging?.id === card.id;
				const spread =
					hoveredIdx >= 0
						? i < hoveredIdx
							? -8
							: i > hoveredIdx
								? 8
								: 0
						: 0;
				// The dragged card follows the pointer instead of its slot, but
				// can't wander past the ends of the fan
				const fanEdge = mid * spacing + 24;
				const xOffset = isDragged
					? Math.max(-fanEdge, Math.min(fanEdge, relX(dragging.x)))
					: (i - mid) * spacing + spread;
				const angle = isDragged
					? spacing
						? (xOffset / spacing) * angleStep
						: 0
					: (i - mid) * angleStep;
				const isSelected = selected.has(card.id);
				const isDiscard = discardMode && discardSelected.has(card.id);
				const isHovered = activeHoverId === card.id;
				return (
					<div
						key={card.id}
						onMouseEnter={() => setHoveredId(card.id)}
						onMouseLeave={() => setHoveredId(null)}
						onPointerDown={(e) => {
							if (e.button !== 0) return;
							setDrag({
								id: card.id,
								pointerId: e.pointerId,
								startX: e.clientX,
								x: e.clientX,
								active: false,
							});
						}}
						style={{
							position: "absolute",
							bottom: 0,
							left: "50%",
							transformOrigin: "bottom center",
							transform: `translateX(calc(-50% + ${xOffset}px)) rotate(${angle}deg)${isDragged ? " translateY(-20px)" : ""}`,
							transition: isDragged
								? "none"
								: "transform 0.15s ease",
							touchAction: "none",
							cursor: isDragged ? "grabbing" : undefined,
							zIndex: isDragged
								? n + 30
								: isHovered
									? n + 20
									: isSelected || isDiscard
										? n + 10 + i
										: i,
						}}
					>
						<div
							className={
								disabled
									? "transition-transform duration-300 ease-out"
									: "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
							}
							style={{
								transform: isHovered
									? "translateY(-24px)"
									: disabled
										? "translateY(8px)"
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
									disabled={disabled}
									drawn={drawnIds.has(card.id)}
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

function pendingText(pending: Pending): string {
	switch (pending.kind) {
		case "await_wheat_sheep":
			return "Click any opponent's Sheep to lure it to your field.";
		case "await_wolf_sheep":
			return "Click any opponent's Sheep to send it to the discard pile.";
		case "await_yoink_opp":
			return "Click an opponent to yoink 2 cards from.";
		case "await_challenge_opp":
			// Matches the end-of-game scoring in engine.ts
			return `Click an opponent to challenge with ${cardMeta(pending.card).label}. If it's still in your hand when the game ends, it costs you 3 points.`;
		case "await_bodyswap_target":
			return "Click a highlighted Sheep to complete it with your card.";
	}
}

// Mini fanned card backs for the mobile "open hand" button
function HandStackPreview({ count }: { count: number }) {
	const shown = Math.min(count, 3);
	return (
		<span className="relative w-[34px] h-[26px] flex-shrink-0">
			{Array.from({ length: shown }).map((_, i) => (
				<span
					key={i}
					className="absolute bottom-0 left-1/2 w-[15px] h-[22px] rounded-[3px] bg-[#f5b8d4] border border-white shadow-sm"
					style={{
						transformOrigin: "bottom center",
						transform: `translateX(calc(-50% + ${(i - (shown - 1) / 2) * 7}px)) rotate(${(i - (shown - 1) / 2) * 12}deg)`,
					}}
				/>
			))}
			<span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7a3a58] text-white text-[10px] font-black flex items-center justify-center tabular-nums">
				{count}
			</span>
		</span>
	);
}

function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(
		() => typeof window !== "undefined" && window.matchMedia(query).matches,
	);
	useEffect(() => {
		const mq = window.matchMedia(query);
		setMatches(mq.matches);
		const onChange = () => setMatches(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [query]);
	return matches;
}

function LogPanel({
	open,
	enterInstant,
	onClose,
	children,
}: {
	open: boolean;
	// Skip the slide-in (e.g. taking over from the docked log in place)
	enterInstant?: boolean;
	onClose: () => void;
	children: React.ReactNode;
}) {
	const { mounted, closing, onAnimationEnd } = useExitAnimation(open);
	if (!mounted) return null;
	return (
		<div
			className={[
				"fixed inset-0 z-[60]",
				closing ? "pointer-events-none" : "",
			].join(" ")}
		>
			{/* Clicking anywhere off the log closes it */}
			<div
				className={[
					"absolute inset-0 bg-[rgba(0,0,0,0.3)]",
					closing ? "drawer-fade-out" : "drawer-fade",
				].join(" ")}
				onClick={onClose}
			/>
			<div
				onAnimationEnd={onAnimationEnd}
				className={[
					"absolute top-0 right-0 bottom-0 w-[300px] max-w-[86vw] bg-[#fff0f5] shadow-2xl flex flex-col",
					closing
						? "panel-out-right"
						: enterInstant
							? ""
							: "panel-in-right",
				].join(" ")}
			>
				{children}
			</div>
		</div>
	);
}

function IconButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			title={label}
			aria-label={label}
			className="flex items-center justify-center w-9 h-9 rounded-full text-[#8a5a70] hover:bg-[#f5d0e8] hover:text-[#7a3a58] active:translate-y-px transition"
		>
			{children}
		</button>
	);
}

function HandDrawer({
	open,
	title,
	onClose,
	children,
}: {
	open: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	const { mounted, closing, onAnimationEnd } = useExitAnimation(open);
	if (!mounted) return null;

	return (
		<div
			className={[
				"md:hidden fixed inset-0 z-[45] flex flex-col justify-end",
				closing ? "pointer-events-none" : "",
			].join(" ")}
		>
			<div
				className={[
					"absolute inset-0 bg-[rgba(0,0,0,0.45)]",
					closing ? "drawer-fade-out" : "drawer-fade",
				].join(" ")}
				onClick={onClose}
			/>
			<div
				onAnimationEnd={onAnimationEnd}
				className={[
					"relative bg-[#fff0f5] rounded-t-[22px] shadow-2xl max-h-[85vh] flex flex-col",
					closing ? "drawer-down" : "drawer-up",
				].join(" ")}
			>
				<div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2 border-b-2 border-[#f5d0e8]">
					<div className="flex-1">
						<div className="mx-auto mb-1.5 w-10 h-1.5 rounded-full bg-[#e8b8cf]" />
						<span className="font-display font-extrabold text-[#7a3a58]">
							{title}
						</span>
					</div>
					<IconButton label="Close hand" onClick={onClose}>
						<X size={20} strokeWidth={2.5} />
					</IconButton>
				</div>
				<div className="overflow-y-auto px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
					{children}
				</div>
			</div>
		</div>
	);
}

function HandGrid({
	cards,
	selected,
	discardMode,
	disabled,
	discardSelected,
	drawnIds,
	onSelect,
	onDiscardPick,
	onReorder,
}: {
	cards: Card[];
	selected: Set<string>;
	discardMode: boolean;
	disabled: boolean;
	discardSelected: Set<string>;
	drawnIds: Set<string>;
	onSelect: (c: Card) => void;
	onDiscardPick: (c: Card) => void;
	onReorder: (ids: string[]) => void;
}) {
	// Same tap-vs-drag rule as the fan: it's a drag once the finger has moved a
	// little. The grid reshuffles live under the finger while a ghost card follows it.
	const [drag, setDrag] = useState<{
		id: string;
		pointerId: number;
		startX: number;
		startY: number;
		x: number;
		y: number;
		overIdx: number | null;
		active: boolean;
	} | null>(null);
	const suppressClickRef = useRef(false);

	function slotAt(x: number, y: number): number | null {
		const el = document
			.elementFromPoint(x, y)
			?.closest<HTMLElement>("[data-hand-slot]");
		return el ? Number(el.dataset.handSlot) : null;
	}

	function previewOrder(d: NonNullable<typeof drag>): Card[] {
		const dragged = cards.find((c) => c.id === d.id);
		if (!dragged || d.overIdx === null) return cards;
		const rest = cards.filter((c) => c.id !== d.id);
		rest.splice(d.overIdx, 0, dragged);
		return rest;
	}

	useEffect(() => {
		if (!drag) return;
		function onMove(e: PointerEvent) {
			if (e.pointerId !== drag!.pointerId) return;
			setDrag((d) => {
				if (!d) return d;
				const active =
					d.active ||
					Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8;
				const over = active ? slotAt(e.clientX, e.clientY) : null;
				return {
					...d,
					x: e.clientX,
					y: e.clientY,
					active,
					overIdx: over ?? d.overIdx,
				};
			});
		}
		function onUp(e: PointerEvent) {
			if (e.pointerId !== drag!.pointerId) return;
			if (drag!.active) {
				onReorder(previewOrder(drag!).map((c) => c.id));
				suppressClickRef.current = true;
				setTimeout(() => (suppressClickRef.current = false), 0);
			}
			setDrag(null);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [drag, cards]);

	const dragging = drag?.active ? drag : null;
	const layout = dragging ? previewOrder(dragging) : cards;
	const ghost = dragging && cards.find((c) => c.id === dragging.id);

	if (cards.length === 0)
		return (
			<div className="text-center py-8 font-bold text-[#8a5a70] opacity-60">
				No cards in hand
			</div>
		);

	return (
		<>
			<div
				onClickCapture={(e) => {
					if (suppressClickRef.current) {
						e.stopPropagation();
						suppressClickRef.current = false;
					}
				}}
				className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-x-2 gap-y-4 justify-items-center pt-4"
			>
				{layout.map((card, i) => {
					const isDragged = dragging?.id === card.id;
					const isDiscard =
						discardMode && discardSelected.has(card.id);
					return (
						<div
							key={card.id}
							data-hand-slot={i}
							onPointerDown={(e) => {
								if (e.button !== 0) return;
								setDrag({
									id: card.id,
									pointerId: e.pointerId,
									startX: e.clientX,
									startY: e.clientY,
									x: e.clientX,
									y: e.clientY,
									overIdx: i,
									active: false,
								});
							}}
							style={{ touchAction: "none" }}
							className={
								isDragged
									? "rounded-[8px] outline outline-2 outline-dashed outline-[#c05090] outline-offset-2 opacity-30"
									: undefined
							}
						>
							<CardChip
								card={card}
								selected={
									discardMode
										? isDiscard
										: selected.has(card.id)
								}
								discardPick={isDiscard}
								disabled={disabled}
								drawn={drawnIds.has(card.id)}
								onClick={discardMode ? onDiscardPick : onSelect}
							/>
						</div>
					);
				})}
			</div>
			{ghost && dragging && (
				<div
					className="fixed z-[80] pointer-events-none"
					style={{
						left: dragging.x,
						top: dragging.y,
						transform:
							"translate(-50%, -60%) rotate(-4deg) scale(1.08)",
						filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.35))",
					}}
				>
					<CardChip card={ghost} disabled={disabled} />
				</div>
			)}
		</>
	);
}

function MoveBar(props: {
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
	// Sits in the flow (mobile hand drawer) instead of floating bottom-left
	inline?: boolean;
	// Closes the drawer so a target on the board can be tapped
	onPickTarget?: () => void;
}) {
	const panel = props.inline
		? `mt-3 bg-white/70 border-2 border-[#e0609a] rounded-2xl px-4 py-3 flex flex-col gap-2`
		: `fixed bottom-5 left-5 z-[40] bg-[#fff0f5] border-2 border-[#e0609a] rounded-2xl px-4 py-3 shadow-lg max-w-[260px] flex flex-col gap-2`;
	const btn = (extra: string) =>
		`font-extrabold text-sm px-4 py-2 rounded-full shadow active:translate-y-px transition ${extra}`;

	if (props.pending) {
		// In the mobile drawer a lone Head/Butt might just be the first half of a
		// new sheep, so the swap is offered rather than jumping straight to the board
		const offerSwap =
			props.inline && props.pending.kind === "await_bodyswap_target";
		return (
			<div className={panel}>
				<div className="font-bold text-sm">
					{offerSwap
						? "Pick another card to build a sheep, or swap this one onto a sheep in play."
						: pendingText(props.pending)}
				</div>
				<div className="flex gap-2 flex-wrap items-center">
					{offerSwap && props.onPickTarget && (
						<button
							onClick={props.onPickTarget}
							className={btn("bg-[#c05090] text-white")}
						>
							Choose a sheep
						</button>
					)}
					<button
						onClick={props.onCancelPending}
						className="text-[#8a5a70] underline font-bold text-sm"
					>
						Clear
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
	} else if (move?.kind === "reflip_ready") {
		mainContent = (
			<div className="font-bold text-sm">
				Keep this one! Whenever a challenge coin is flipped, you get a
				few seconds to play Re-Flip and flip it again - a button will
				pop up on the coin screen.
			</div>
		);
	} else if (
		move?.kind === "challenge_ready" &&
		props.challengeUsedThisTurn
	) {
		mainContent = (
			<div className="font-bold text-sm">
				You already played a Challenge card this turn.
			</div>
		);
	}

	if (!mainContent) return null;

	return (
		<div className={panel}>
			{mainContent}
			<div className="flex gap-2 flex-wrap items-center">
				{actionBtn}
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
