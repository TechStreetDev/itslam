import { buildDeck, shuffle, CHALLENGE_META } from "./deck";
import {
	Card,
	GameState,
	HeadCard,
	ButtCard,
	ModifierCard,
	PartCard,
	PackId,
	Player,
	SheepEntity,
	SheepKind,
	PendingChallenge,
	GameEventType,
	GameEventData,
	DISCARD_KINDS,
	DiscardKind,
	PlaySheepPayload,
	PlayActionPayload,
	BodyswapPayload,
	PlayChallengePayload,
	ResolveChallengeEffectPayload,
} from "./types";

export type {
	PlaySheepPayload,
	PlayActionPayload,
	BodyswapPayload,
	PlayChallengePayload,
	ResolveChallengeEffectPayload,
};

export class GameError extends Error {
	isGameError = true;
	constructor(msg: string) {
		super(msg);
	}
}
function err(msg: string): GameError {
	return new GameError(msg);
}

let sheepIdCounter = 1;
function nextSheepId(): string {
	return "s" + sheepIdCounter++;
}

export function createGame(
	players: { id: string; name: string; skipTutorial?: boolean }[],
	packs: readonly PackId[] = ["base"],
): GameState {
	const deck = shuffle(buildDeck(packs));
	const order = shuffle(players.map((p) => p.id));

	const game: GameState = {
		players: {},
		packs: [...packs],
		deckSize: deck.length,
		order,
		turnIndex: 0,
		turnNumber: 0,
		deck,
		discard: [],
		phase: "tutorial",
		drawnThisTurn: false,
		challengeUsedThisTurn: false,
		deckJustEmptied: false,
		finalRoundActive: false,
		finalRoundQueue: [],
		pendingChallenge: null,
		log: [],
		started: true,
		ended: false,
		results: null,
		startedAt: Date.now(),
		events: [],
		tutorial: Object.fromEntries(
			players.map((p) => [p.id, p.skipTutorial ? 1 : 0]),
		),
	};

	for (const p of players) {
		game.players[p.id] = { id: p.id, name: p.name, hand: [], field: [] };
	}
	for (const pid of order) {
		for (let i = 0; i < 5; i++) {
			const c = game.deck.pop();
			if (c) game.players[pid].hand.push(c);
		}
	}

	pushLog(game, "The flock has gathered.");
	if (!tutorialPending(game)) beginFirstTurn(game);
	return game;
}

function beginFirstTurn(game: GameState) {
	game.phase = "draw";
	pushLog(game, `${game.players[game.order[0]].name} goes first.`);
	game.turnNumber = 1;
}

const MAX_EVENTS = 5000;

export function recordEvent(
	game: GameState,
	type: GameEventType,
	fields: { actor?: string; target?: string; data?: GameEventData } = {},
) {
	if (!game.events) game.events = [];
	if (game.events.length >= MAX_EVENTS) return;
	game.events.push({
		t: game.startedAt ? Date.now() - game.startedAt : 0,
		turn: game.turnNumber ?? 0,
		type,
		...fields,
	});
}

export function recordReplacement(game: GameState, playerId: string) {
	if (game.ended || !game.players[playerId]) return;
	recordEvent(game, "player_replaced", { actor: playerId });
}

function fieldPoints(player: Player): number {
	return player.field.reduce((sum, e) => sum + entityPoints(e), 0);
}

function sheepData(entity: SheepEntity): GameEventData {
	return {
		kind: entity.kind,
		points: entityPoints(entity),
		headColor: entity.head?.color ?? null,
		buttColor: entity.butt?.color ?? null,
		extraColor: entity.extra?.color ?? null,
		rainbowParts: [entity.head, entity.butt, entity.extra].filter((c) => c?.rainbow).length,
		modifier: entity.modifierCard?.modifier ?? null,
	};
}

function pushLog(game: GameState, text: string) {
	const turn = game.turnNumber ?? 0;
	game.log.push({
		ts: Date.now(),
		text,
		turn,
		playerId: turn > 0 ? currentPlayerId(game) : undefined,
	});
	if (game.log.length > 200) game.log.shift();
}

export function currentPlayerId(game: GameState): string {
	return game.order[game.turnIndex];
}

export function tutorialPending(game: GameState): boolean {
	return !!game.tutorial && Object.values(game.tutorial).some((v) => v < 1);
}

// Progress only ever moves forward, so rewinding the video doesn't un-ready anyone.
// The first turn begins as soon as the last player is ready.
export function setTutorialProgress(
	game: GameState,
	playerId: string,
	progress: number,
) {
	if (!game.tutorial || !(playerId in game.tutorial)) return;
	const p = Math.min(1, Math.max(0, Number(progress) || 0));
	game.tutorial[playerId] = Math.max(game.tutorial[playerId], p);
	if (game.phase === "tutorial" && !tutorialPending(game)) beginFirstTurn(game);
}

function discardKind(card: Card): DiscardKind {
	if (card.category === "action") return card.action;
	if (card.category === "modifier") return card.modifier;
	if (card.category === "head" || card.category === "butt") return card.category;
	throw err("Challenge cards can’t be discarded until they’re used.");
}

function requireTurn(game: GameState, playerId: string) {
	if (game.ended) throw err("The game has ended.");
	if (game.phase === "tutorial")
		throw err("Waiting for everyone to finish the tutorial.");
	if (currentPlayerId(game) !== playerId) throw err("It's not your turn.");
}

function findCardInHand(player: Player, cardId: string): number {
	const idx = player.hand.findIndex((c) => c.id === cardId);
	if (idx === -1) throw err("Card not found in hand.");
	return idx;
}
function takeFromHand(player: Player, cardId: string): Card {
	const idx = findCardInHand(player, cardId);
	return player.hand.splice(idx, 1)[0];
}

export function drawPhase(game: GameState, playerId: string) {
	requireTurn(game, playerId);
	if (game.phase !== "draw") throw err("You already drew this turn.");
	const player = game.players[playerId];

	const handBefore = player.hand.length;
	if (game.deck.length > 0) player.hand.push(game.deck.pop()!);
	while (player.hand.length < 3 && game.deck.length > 0)
		player.hand.push(game.deck.pop()!);
	const drew = player.hand.length - handBefore;

	if (
		game.deck.length === 0 &&
		!game.finalRoundActive &&
		!game.deckJustEmptiedHandled
	) {
		game.deckJustEmptied = true;
	}

	game.phase = "play";
	game.drawnThisTurn = true;
	game.challengeUsedThisTurn = false;
	recordEvent(game, "draw", {
		actor: playerId,
		data: { cards: drew, deckLeft: game.deck.length, handSize: player.hand.length },
	});
	if (drew > 0) pushLog(game, `${player.name} drew a card.`);
	else pushLog(game, `${player.name} skipped drawing (deck is empty).`);
}

function classifyPair(head: PartCard, butt: PartCard): SheepKind | null {
	if (head.rainbow && butt.rainbow) return "full_rainbow";
	if (head.rainbow || butt.rainbow) return "half_rainbow";
	if (head.color === butt.color) return "basic";
	return null;
}

export function isProtectedFromWolf(field: SheepEntity[]): boolean {
	return field.some((e) => e.kind === "franken_heads");
}
export function isProtectedFromWheat(field: SheepEntity[]): boolean {
	return field.some((e) => e.kind === "franken_butts");
}
export function entityPoints(entity: SheepEntity): number {
	if (entity.kind === "full_rainbow") return 2;
	if (
		entity.kind === "franken_heads" &&
		entity.head?.rainbow &&
		entity.extra?.rainbow
	)
		return 2;
	if (
		entity.kind === "franken_butts" &&
		entity.butt?.rainbow &&
		entity.extra?.rainbow
	)
		return 2;
	return 1;
}

function describeSheep(entity: SheepEntity): string {
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	if (entity.kind === "basic") return `${cap(entity.head!.color)} Sheep`;
	if (entity.kind === "full_rainbow") return "Double Rainbow Sheep";
	if (entity.kind === "half_rainbow") {
		const nonRainbow = entity.head!.rainbow ? entity.butt! : entity.head!;
		return `Half-Rainbow ${cap(nonRainbow.color)} Sheep`;
	}
	if (entity.kind === "painted")
		return `Painted ${cap(entity.head!.color)}/${cap(entity.butt!.color)} Sheep`;
	if (entity.kind === "franken_heads")
		return `Double-Headed ${cap(entity.head!.color)}/${cap(entity.extra!.color)} FrankenSheep`;
	if (entity.kind === "franken_butts")
		return `Double-Butted ${cap(entity.butt!.color)}/${cap(entity.extra!.color)} FrankenSheep`;
	return "Sheep";
}

export function playSheep(
	game: GameState,
	playerId: string,
	payload: PlaySheepPayload,
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	const player = game.players[playerId];
	const { headCardId, buttCardId, extraCardId, modifierCardId } = payload;

	let modifierCard: ModifierCard | null = null;
	if (modifierCardId) {
		const idx = findCardInHand(player, modifierCardId);
		const c = player.hand[idx];
		if (c.category !== "modifier")
			throw err("That card is not a modifier card.");
		modifierCard = c;
	}

	if (modifierCard && modifierCard.modifier === "franken") {
		let type: "head" | "butt";
		if (headCardId && extraCardId && !buttCardId) type = "head";
		else if (buttCardId && extraCardId && !headCardId) type = "butt";
		else
			throw err(
				"FrankenSheep needs any 2 Head cards OR any 2 Butt cards.",
			);

		const idA = type === "head" ? headCardId! : buttCardId!;
		const cardA = player.hand[findCardInHand(player, idA)];
		const cardB = player.hand[findCardInHand(player, extraCardId!)];
		if (cardA.category !== type || cardB.category !== type)
			throw err(`FrankenSheep needs two ${type} cards.`);

		takeFromHand(player, modifierCardId!);
		takeFromHand(player, idA);
		takeFromHand(player, extraCardId!);

		const entity: SheepEntity = {
			id: nextSheepId(),
			kind: type === "head" ? "franken_heads" : "franken_butts",
			head: type === "head" ? (cardA as HeadCard) : null,
			butt: type === "butt" ? (cardA as ButtCard) : null,
			extra: cardB as PartCard,
			modifierCard,
		};
		player.field.push(entity);
		recordEvent(game, "sheep_built", { actor: playerId, data: { ...sheepData(entity), source: "hand" } });
		pushLog(game, `${player.name} built a ${describeSheep(entity)}!`);
		return;
	}

	if (modifierCard && modifierCard.modifier === "paint") {
		if (!headCardId || !buttCardId)
			throw err("A Painted Sheep needs one Head and one Butt card.");
		const head = player.hand[findCardInHand(player, headCardId)];
		const butt = player.hand[findCardInHand(player, buttCardId)];
		if (head.category !== "head" || butt.category !== "butt")
			throw err("Need one Head and one Butt card.");
		takeFromHand(player, modifierCardId!);
		takeFromHand(player, headCardId);
		takeFromHand(player, buttCardId);
		const entity: SheepEntity = {
			id: nextSheepId(),
			kind: "painted",
			head,
			butt,
			extra: null,
			modifierCard,
		};
		player.field.push(entity);
		recordEvent(game, "sheep_built", { actor: playerId, data: { ...sheepData(entity), source: "hand" } });
		pushLog(game, `${player.name} painted a ${describeSheep(entity)}!`);
		return;
	}

	if (!headCardId || !buttCardId)
		throw err("A Sheep needs one Head and one Butt card.");
	const head = player.hand[findCardInHand(player, headCardId)];
	const butt = player.hand[findCardInHand(player, buttCardId)];
	if (head.category !== "head" || butt.category !== "butt")
		throw err("Need one Head and one Butt card.");
	const kind = classifyPair(head, butt);
	if (!kind)
		throw err(
			"Those colors don\u2019t match. Use a Paint card to mix colors.",
		);
	takeFromHand(player, headCardId);
	takeFromHand(player, buttCardId);
	const basicEntity: SheepEntity = {
		id: nextSheepId(),
		kind,
		head: head as HeadCard,
		butt: butt as ButtCard,
		extra: null,
		modifierCard: null,
	};
	player.field.push(basicEntity);
	recordEvent(game, "sheep_built", { actor: playerId, data: { ...sheepData(basicEntity), source: "hand" } });
	pushLog(
		game,
		`${player.name} added a ${describeSheep(basicEntity)} to their field.`,
	);
}

function discardSheep(game: GameState, sheep: SheepEntity) {
	if (sheep.head) game.discard.push(sheep.head);
	if (sheep.butt) game.discard.push(sheep.butt);
	if (sheep.extra) game.discard.push(sheep.extra);
	if (sheep.modifierCard) game.discard.push(sheep.modifierCard);
}

export function playAction(
	game: GameState,
	playerId: string,
	{ cardId, targetPlayerId, targetSheepId }: PlayActionPayload,
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	const player = game.players[playerId];
	const target = game.players[targetPlayerId];
	if (!target || target.id === playerId)
		throw err("Choose an opponent to target.");

	const idx = findCardInHand(player, cardId);
	const card = player.hand[idx];
	if (card.category !== "action") throw err("That is not an action card.");
	if (card.action === "reflip")
		throw err(
			"Re-Flip can only be played right after a challenge coin flip result is shown.",
		);

	if (card.action === "wheat") {
		if (isProtectedFromWheat(target.field))
			throw err(
				`${target.name}'s flock has a Double-Butted Sheep - Wheat won't work!`,
			);
		const sIdx = target.field.findIndex((e) => e.id === targetSheepId);
		if (sIdx === -1) throw err("Sheep not found.");
		const [sheep] = target.field.splice(sIdx, 1);
		player.field.push(sheep);
		takeFromHand(player, cardId);
		game.discard.push(card);
		recordEvent(game, "action", {
			actor: playerId,
			target: targetPlayerId,
			data: { action: "wheat", kind: sheep.kind, points: entityPoints(sheep) },
		});
		pushLog(
			game,
			`${player.name} lured ${target.name}'s ${describeSheep(sheep)} with Wheat!`,
		);
	} else if (card.action === "wolf") {
		if (isProtectedFromWolf(target.field))
			throw err(
				`${target.name}'s flock has a Double-Headed Sheep - Wolf won't work!`,
			);
		const sIdx = target.field.findIndex((e) => e.id === targetSheepId);
		if (sIdx === -1) throw err("Sheep not found.");
		const [sheep] = target.field.splice(sIdx, 1);
		discardSheep(game, sheep);
		takeFromHand(player, cardId);
		game.discard.push(card);
		recordEvent(game, "action", {
			actor: playerId,
			target: targetPlayerId,
			data: { action: "wolf", kind: sheep.kind, points: entityPoints(sheep) },
		});
		pushLog(
			game,
			`${player.name} sent ${target.name}'s ${describeSheep(sheep)} packing with a Wolf!`,
		);
	} else if (card.action === "yoink") {
		const n = Math.min(2, target.hand.length);
		for (let i = 0; i < n; i++) {
			const ri = Math.floor(Math.random() * target.hand.length);
			player.hand.push(target.hand.splice(ri, 1)[0]);
		}
		takeFromHand(player, cardId);
		game.discard.push(card);
		recordEvent(game, "action", {
			actor: playerId,
			target: targetPlayerId,
			data: { action: "yoink", cards: n },
		});
		pushLog(
			game,
			`${player.name} yoinked ${n} card(s) from ${target.name}'s hand!`,
		);
	}
}

export function bodyswap(
	game: GameState,
	playerId: string,
	{
		handCardId,
		targetPlayerId,
		targetSheepId,
		removeCardId,
	}: BodyswapPayload,
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	const player = game.players[playerId];
	const target = game.players[targetPlayerId];
	if (!target) throw err("Target player not found.");

	const handIdx = findCardInHand(player, handCardId);
	const handCard = player.hand[handIdx];
	if (handCard.category !== "head" && handCard.category !== "butt")
		throw err("BodySwap needs a Head or Butt card from your hand.");

	const entity = target.field.find((e) => e.id === targetSheepId);
	if (!entity) throw err("Sheep not found.");

	if (entity.kind === "franken_heads" || entity.kind === "franken_butts") {
		const isHeads = entity.kind === "franken_heads";
		const neededInsertType = isHeads ? "butt" : "head";
		if (handCard.category !== neededInsertType)
			throw err(
				`This FrankenSheep needs a ${neededInsertType} card to complete it.`,
			);

		const parts = (
			isHeads ? [entity.head, entity.extra] : [entity.butt, entity.extra]
		) as PartCard[];
		const removedPart = parts.find((p) => p.id === removeCardId);
		const keptPart = parts.find((p) => p.id !== removeCardId);
		if (!removedPart || !keptPart)
			throw err("Choose which half of the FrankenSheep to remove.");

		const kind = isHeads
			? classifyPair(keptPart as HeadCard, handCard as ButtCard)
			: classifyPair(handCard as HeadCard, keptPart as ButtCard);
		if (!kind || kind === "half_rainbow")
			throw err(
				"That card must complete the Sheep into a matching or Double Rainbow Sheep.",
			);

		const oldFrankenDesc = describeSheep(entity);
		const fromKind = entity.kind;
		takeFromHand(player, handCardId);
		player.hand.push(removedPart);
		if (entity.modifierCard) player.hand.push(entity.modifierCard);

		entity.kind = kind;
		entity.head = isHeads ? (keptPart as HeadCard) : (handCard as HeadCard);
		entity.butt = isHeads ? (handCard as ButtCard) : (keptPart as ButtCard);
		entity.extra = null;
		entity.modifierCard = null;
		recordEvent(game, "bodyswap", {
			actor: playerId,
			target: targetPlayerId,
			data: { fromKind, toKind: kind, ownSheep: targetPlayerId === playerId, points: entityPoints(entity) },
		});
		pushLog(
			game,
			`${player.name} BodySwapped ${target.name}'s ${oldFrankenDesc} into a ${describeSheep(entity)}!`,
		);
		return;
	}

	if (entity.kind === "painted" || entity.kind === "half_rainbow") {
		let removedPart: PartCard | null = null;
		let removedSlot: "head" | "butt" | null = null;
		if (entity.head && entity.head.id === removeCardId) {
			removedPart = entity.head;
			removedSlot = "head";
		} else if (entity.butt && entity.butt.id === removeCardId) {
			removedPart = entity.butt;
			removedSlot = "butt";
		}
		if (!removedPart || !removedSlot)
			throw err("Choose which card on the Sheep to remove.");

		if (handCard.category !== removedSlot)
			throw err(`Need a ${removedSlot} card to replace that.`);

		const newHead = (
			removedSlot === "head" ? handCard : entity.head
		) as HeadCard;
		const newButt = (
			removedSlot === "butt" ? handCard : entity.butt
		) as ButtCard;
		const kind = classifyPair(newHead, newButt);
		if (!kind || kind === "half_rainbow")
			throw err(
				"That card must complete the Sheep into a matching or Double Rainbow Sheep.",
			);

		const oldSwapDesc = describeSheep(entity);
		const fromKind = entity.kind;
		takeFromHand(player, handCardId);
		player.hand.push(removedPart);
		if (entity.modifierCard) player.hand.push(entity.modifierCard);

		entity.kind = kind;
		entity.head = newHead;
		entity.butt = newButt;
		entity.modifierCard = null;
		recordEvent(game, "bodyswap", {
			actor: playerId,
			target: targetPlayerId,
			data: { fromKind, toKind: kind, ownSheep: targetPlayerId === playerId, points: entityPoints(entity) },
		});
		pushLog(
			game,
			`${player.name} BodySwapped ${target.name}'s ${oldSwapDesc} into a ${describeSheep(entity)}!`,
		);
		return;
	}

	throw err("Only modified or Half Rainbow Sheep can be BodySwapped.");
}

export function playChallenge(
	game: GameState,
	playerId: string,
	{ cardId, targetPlayerId, guess }: PlayChallengePayload,
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	if (game.pendingChallenge) throw err("A challenge is already in progress.");
	if (game.challengeUsedThisTurn)
		throw err("Only 1 Challenge card per turn.");
	if (guess !== "heads" && guess !== "butts")
		throw err('Guess must be "heads" or "butts".');
	const player = game.players[playerId];
	const target = game.players[targetPlayerId];
	if (!target || target.id === playerId)
		throw err("Choose an opponent to challenge.");

	const idx = findCardInHand(player, cardId);
	const card = player.hand[idx];
	if (card.category !== "challenge")
		throw err("That is not a Challenge card.");
	player.hand.splice(idx, 1);

	game.challengeUsedThisTurn = true;
	game.pendingChallenge = {
		card,
		challengerId: playerId,
		targetId: targetPlayerId,
		challengeType: card.challengeType,
		guess,
		stage: "awaiting_flip",
	};
	recordEvent(game, "challenge_played", {
		actor: playerId,
		target: targetPlayerId,
		data: {
			challenge: card.challengeType,
			guess,
			challengerPoints: fieldPoints(player),
			targetPoints: fieldPoints(target),
		},
	});
	pushLog(
		game,
		`${player.name} used ${CHALLENGE_META[card.challengeType].name} against ${target.name}, guessing ${guess}!`,
	);
}

export function playReflip(
	game: GameState,
	playerId: string,
	cardId: string,
): FlipResult {
	const pc = game.pendingChallenge as PendingChallenge;
	if (!pc || pc.stage !== "awaiting_reflip")
		throw err(
			"Re-Flip can only be played right after a coin flip result is shown.",
		);
	const player = game.players[playerId];
	const idx = findCardInHand(player, cardId);
	const card = player.hand[idx];
	if (card.category !== "action" || card.action !== "reflip")
		throw err("That is not a Re-Flip card.");
	player.hand.splice(idx, 1);
	game.discard.push(card);

	const previousWinner = pc.winnerId;
	const flip: "heads" | "butts" = Math.random() < 0.5 ? "heads" : "butts";
	const correct = flip === pc.guess!;
	const winnerId = correct ? pc.challengerId : pc.targetId;
	const loserId = correct ? pc.targetId : pc.challengerId;

	pc.flipResult = flip;
	pc.winnerId = winnerId;
	pc.loserId = loserId;
	pc.flipCount = (pc.flipCount ?? 1) + 1;
	recordEvent(game, "coin_flip", {
		actor: pc.challengerId,
		target: pc.targetId,
		data: {
			challenge: pc.challengeType,
			guess: pc.guess,
			flip,
			challengerWon: correct,
			flipNumber: pc.flipCount,
			reflip: true,
			reflipBy:
				playerId === pc.challengerId ? "challenger" : playerId === pc.targetId ? "target" : "other",
			reflipChangedOutcome: winnerId !== previousWinner,
		},
	});

	pushLog(
		game,
		`${player.name} played Re-Flip! New flip: ${flip}! ${game.players[winnerId].name} wins!`,
	);
	return {
		flip,
		correct,
		winnerId,
		loserId,
		challengeType: pc.challengeType,
	};
}

export function setChallengeGuess(
	game: GameState,
	playerId: string,
	guess: "heads" | "butts",
) {
	const pc = game.pendingChallenge;
	if (!pc || pc.stage !== "awaiting_flip")
		throw err("No challenge is awaiting a guess.");
	if (playerId !== pc.challengerId) throw err("Only the challenger guesses.");
	if (pc.guess !== null) throw err("A guess has already been made.");
	if (guess !== "heads" && guess !== "butts")
		throw err('Guess must be "heads" or "butts".');
	pc.guess = guess;
	pushLog(game, `${game.players[playerId].name} guesses ${guess}.`);
}

export interface FlipResult {
	flip: "heads" | "butts";
	correct: boolean;
	winnerId: string;
	loserId: string;
	challengeType: string;
}

export function resolveFlip(game: GameState, playerId: string): FlipResult {
	const pc = game.pendingChallenge as PendingChallenge;
	if (!pc || pc.stage !== "awaiting_flip")
		throw err("No challenge is awaiting a flip.");
	if (pc.guess === null)
		throw err("Waiting on a guess before the coin can be flipped.");
	if (playerId !== pc.targetId)
		throw err("Only the challenged player flips the coin.");

	const flip: "heads" | "butts" = Math.random() < 0.5 ? "heads" : "butts";
	const correct = flip === pc.guess;
	const winnerId = correct ? pc.challengerId : pc.targetId;
	const loserId = correct ? pc.targetId : pc.challengerId;
	const winner = game.players[winnerId];
	const loser = game.players[loserId];

	pushLog(
		game,
		`Coin flip: ${flip}! ${winner.name} wins the challenge - ${CHALLENGE_META[pc.challengeType].name} triggers against ${loser.name}!`,
	);

	pc.stage = "awaiting_reflip";
	pc.flipResult = flip;
	pc.winnerId = winnerId;
	pc.loserId = loserId;
	pc.flipCount = 1;
	recordEvent(game, "coin_flip", {
		actor: pc.challengerId,
		target: pc.targetId,
		data: {
			challenge: pc.challengeType,
			guess: pc.guess,
			flip,
			challengerWon: correct,
			flipNumber: 1,
			reflip: false,
		},
	});

	return {
		flip,
		correct,
		winnerId,
		loserId,
		challengeType: pc.challengeType,
	};
}

export function commitFlipResult(game: GameState) {
	const pc = game.pendingChallenge as PendingChallenge;
	if (!pc || pc.stage !== "awaiting_reflip") return;

	if (pc.challengeType === "yoink_hand") {
		const winner = game.players[pc.winnerId!];
		const loser = game.players[pc.loserId!];
		const cardCount = loser.hand.length;
		winner.hand.push(...loser.hand);
		loser.hand = [];
		game.discard.push(pc.card);
		game.pendingChallenge = null;
		recordEvent(game, "challenge_resolved", {
			actor: winner.id,
			target: loser.id,
			data: {
				challenge: "yoink_hand",
				challengerWon: winner.id === pc.challengerId,
				flips: pc.flipCount ?? 1,
				count: cardCount,
				points: 0,
				recoveredKind: null,
			},
		});
		pushLog(
			game,
			`${winner.name} yoinked all ${cardCount} card${cardCount !== 1 ? "s" : ""} from ${loser.name}'s hand!`,
		);
		return;
	}

	pc.stage = "awaiting_selection";
}

function takeFromDiscard(game: GameState, cardId: string): Card {
	const idx = game.discard.findIndex((c) => c.id === cardId);
	if (idx === -1) throw err("That card is not in the discard pile.");
	return game.discard.splice(idx, 1)[0];
}

function buildSheepFromDiscard(
	game: GameState,
	winner: Player,
	{
		headCardId,
		buttCardId,
		extraCardId,
		modifierCardId,
	}: ResolveChallengeEffectPayload,
) {
	if (modifierCardId) {
		const modifierCard = takeFromDiscard(
			game,
			modifierCardId,
		) as ModifierCard;
		if (modifierCard.modifier === "franken") {
			let type: "head" | "butt" | null = null;
			let idA: string | undefined;
			if (headCardId && extraCardId && !buttCardId) {
				type = "head";
				idA = headCardId;
			} else if (buttCardId && extraCardId && !headCardId) {
				type = "butt";
				idA = buttCardId;
			}
			if (!type || !idA) {
				game.discard.push(modifierCard);
				throw err("FrankenSheep needs 2 Heads or 2 Butts.");
			}
			const cardA = takeFromDiscard(game, idA) as PartCard;
			const cardB = takeFromDiscard(game, extraCardId!) as PartCard;
			winner.field.push({
				id: nextSheepId(),
				kind: type === "head" ? "franken_heads" : "franken_butts",
				head: type === "head" ? (cardA as HeadCard) : null,
				butt: type === "butt" ? (cardA as ButtCard) : null,
				extra: cardB,
				modifierCard,
			});
			return;
		}
		if (modifierCard.modifier === "paint") {
			if (!headCardId || !buttCardId) {
				game.discard.push(modifierCard);
				throw err("Painted Sheep needs a Head and a Butt.");
			}
			const head = takeFromDiscard(game, headCardId) as HeadCard;
			const butt = takeFromDiscard(game, buttCardId) as ButtCard;
			winner.field.push({
				id: nextSheepId(),
				kind: "painted",
				head,
				butt,
				extra: null,
				modifierCard,
			});
			return;
		}
	}
	if (!headCardId || !buttCardId)
		throw err("A Sheep needs a Head and a Butt card.");
	const head = takeFromDiscard(game, headCardId) as HeadCard;
	const butt = takeFromDiscard(game, buttCardId) as ButtCard;
	const kind = classifyPair(head, butt);
	if (!kind) {
		game.discard.push(head, butt);
		throw err("Those colors don\u2019t match.");
	}
	winner.field.push({
		id: nextSheepId(),
		kind,
		head,
		butt,
		extra: null,
		modifierCard: null,
	});
}

export function resolveChallengeEffect(
	game: GameState,
	playerId: string,
	selections: ResolveChallengeEffectPayload,
) {
	const pc = game.pendingChallenge;
	if (!pc || pc.stage !== "awaiting_selection")
		throw err("No challenge effect is awaiting your choice.");
	if (playerId !== pc.winnerId)
		throw err("Only the challenge winner chooses the effect.");
	const winner = game.players[pc.winnerId!];
	const loser = game.players[pc.loserId!];
	let affected = 0;
	let affectedPoints = 0;
	let recoveredKind: string | null = null;

	if (pc.challengeType === "lure2") {
		const ids = (selections.sheepIds || []).slice(0, 2);
		const lureDescs: string[] = [];
		for (const sid of ids) {
			const sIdx = loser.field.findIndex((e) => e.id === sid);
			if (sIdx === -1) continue;
			const [sheep] = loser.field.splice(sIdx, 1);
			affected++;
			affectedPoints += entityPoints(sheep);
			lureDescs.push(describeSheep(sheep));
			winner.field.push(sheep);
		}
		const lureList =
			lureDescs.length > 0
				? lureDescs.join(" and ")
				: `${ids.length} Sheep`;
		pushLog(
			game,
			`${winner.name} lured ${loser.name}'s ${lureList} to their field!`,
		);
	} else if (pc.challengeType === "remove2") {
		const ids = (selections.sheepIds || []).slice(0, 2);
		const removeDescs: string[] = [];
		for (const sid of ids) {
			const sIdx = loser.field.findIndex((e) => e.id === sid);
			if (sIdx === -1) continue;
			const [sheep] = loser.field.splice(sIdx, 1);
			affected++;
			affectedPoints += entityPoints(sheep);
			removeDescs.push(describeSheep(sheep));
			discardSheep(game, sheep);
		}
		const removeList =
			removeDescs.length > 0
				? removeDescs.join(" and ")
				: `${ids.length} Sheep`;
		pushLog(
			game,
			`${winner.name} sent ${loser.name}'s ${removeList} to the discard pile!`,
		);
	} else if (pc.challengeType === "halve2") {
		const picks = (selections.halves || []).slice(0, 2);
		const halveDescs: string[] = [];
		for (const p of picks) {
			const sIdx = loser.field.findIndex((e) => e.id === p.sheepId);
			if (sIdx === -1) continue;
			const [sheep] = loser.field.splice(sIdx, 1);
			affected++;
			affectedPoints += entityPoints(sheep);
			halveDescs.push(describeSheep(sheep));
			const parts = [sheep.head, sheep.butt, sheep.extra].filter(
				(c): c is PartCard => !!c,
			);
			const keepIdx = parts.findIndex((c) => c.id === p.keepCardId);
			const keep =
				keepIdx === -1 ? parts[0] : parts.splice(keepIdx, 1)[0];
			winner.hand.push(keep);
			loser.hand.push(...parts);
			if (sheep.modifierCard) winner.hand.push(sheep.modifierCard);
		}
		const halveList =
			halveDescs.length > 0
				? halveDescs.join(" and ")
				: `${picks.length} Sheep`;
		pushLog(
			game,
			`${winner.name} halved ${loser.name}'s ${halveList} and returned the parts to their hands!`,
		);
	} else if (pc.challengeType === "recover1") {
		const hasSelection =
			selections.headCardId ||
			selections.buttCardId ||
			selections.modifierCardId ||
			selections.extraCardId;
		if (hasSelection) {
			buildSheepFromDiscard(game, winner, selections);
			const recovered = winner.field[winner.field.length - 1];
			affected = 1;
			affectedPoints = entityPoints(recovered);
			recoveredKind = recovered.kind;
			recordEvent(game, "sheep_built", {
				actor: winner.id,
				data: { ...sheepData(recovered), source: "discard" },
			});
			pushLog(
				game,
				`${winner.name} recovered a ${describeSheep(recovered)} from the discard pile!`,
			);
		} else {
			pushLog(game, `${winner.name} skipped recovering a Sheep.`);
		}
	}

	recordEvent(game, "challenge_resolved", {
		actor: winner.id,
		target: loser.id,
		data: {
			challenge: pc.challengeType,
			challengerWon: winner.id === pc.challengerId,
			flips: pc.flipCount ?? 1,
			count: affected,
			points: affectedPoints,
			recoveredKind,
		},
	});
	game.discard.push(pc.card);
	game.pendingChallenge = null;
}

// Ends the play phase so the player can pick cards to discard down to 7.
// There's no way back to the play phase once this starts.
export function startDiscard(game: GameState, playerId: string) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	if (game.pendingChallenge)
		throw err("Resolve the current challenge first.");
	if (game.players[playerId].hand.length <= 7)
		throw err("You only discard when holding more than 7 cards.");
	game.phase = "discard";
}

// Back out of the discard step to keep playing - nothing has been discarded yet
export function cancelDiscard(game: GameState, playerId: string) {
	requireTurn(game, playerId);
	if (game.phase !== "discard") throw err("You're not discarding.");
	game.phase = "play";
}

export function endTurn(
	game: GameState,
	playerId: string,
	discardCardIds: string[] = [],
) {
	requireTurn(game, playerId);
	if (game.phase !== "play" && game.phase !== "discard")
		throw err("Draw a card first.");
	if (game.pendingChallenge)
		throw err("Resolve the current challenge first.");
	const player = game.players[playerId];

	if (player.hand.length > 7) {
		const wanted = player.hand.length - 7;
		const ids = discardCardIds;
		if (ids.length !== wanted)
			throw err(`Discard down to 7 cards (choose ${wanted}).`);
		if (new Set(ids).size !== ids.length)
			throw err("Pick different cards to discard.");
		// Validate everything before touching the hand
		for (const cid of ids) {
			const card = player.hand[findCardInHand(player, cid)];
			if (card.category === "challenge")
				throw err(
					"Challenge cards can\u2019t be discarded until they\u2019re used.",
				);
		}
		const discarded: Record<DiscardKind, number> = Object.fromEntries(
			DISCARD_KINDS.map((k) => [k, 0]),
		) as Record<DiscardKind, number>;
		for (const cid of ids) {
			const [card] = player.hand.splice(findCardInHand(player, cid), 1);
			game.discard.push(card);
			discarded[discardKind(card)]++;
			if ((card.category === "head" || card.category === "butt") && card.rainbow)
				discarded.rainbow++;
		}
		recordEvent(game, "discard", {
			actor: playerId,
			data: { count: wanted, ...discarded },
		});
		pushLog(
			game,
			`${player.name} discarded ${wanted} card${wanted !== 1 ? "s" : ""}.`,
		);
	}

	recordEvent(game, "turn_end", {
		actor: playerId,
		data: {
			handSize: player.hand.length,
			fieldSize: player.field.length,
			fieldPoints: fieldPoints(player),
			challengesInHand: player.hand.filter((c) => c.category === "challenge").length,
			deckLeft: game.deck.length,
			finalRound: game.finalRoundActive,
		},
	});
	pushLog(game, `${player.name} said "Baa!"`);

	if (game.deckJustEmptied && !game.finalRoundActive) {
		game.finalRoundActive = true;
		game.deckJustEmptiedHandled = true;
		const startIdx = (game.turnIndex + 1) % game.order.length;
		const queue: string[] = [];
		for (let i = 0; i < game.order.length; i++)
			queue.push(game.order[(startIdx + i) % game.order.length]);
		game.finalRoundQueue = queue;
		recordEvent(game, "final_round", { actor: playerId });
		pushLog(
			game,
			`The Draw Pile is empty! Final Round begins - everyone gets one more turn.`,
		);
	} else if (game.finalRoundActive) {
		game.finalRoundQueue.shift();
		if (game.finalRoundQueue.length === 0) {
			endGame(game);
			return;
		}
	}

	game.turnIndex = (game.turnIndex + 1) % game.order.length;
	game.turnNumber = (game.turnNumber ?? 0) + 1;
	game.phase = "draw";
	game.drawnThisTurn = false;
	game.challengeUsedThisTurn = false;
}

function endGame(game: GameState) {
	const scores: Record<string, number> = {};
	const challengePenalties: Record<string, number> = {};
	for (const pid of game.order) {
		const p = game.players[pid];
		let pts = p.field.reduce((sum, e) => sum + entityPoints(e), 0);
		const challengePenalty =
			p.hand.filter((c) => c.category === "challenge").length * 3;
		pts -= challengePenalty;
		scores[pid] = pts;
		challengePenalties[pid] = challengePenalty;
	}
	const best = Math.max(...Object.values(scores));
	const tied = game.order.filter((pid) => scores[pid] === best);
	let winnerId = tied[0];
	let wasTiebreak = false;
	if (tied.length > 1) {
		wasTiebreak = true;
		winnerId = tied[Math.floor(Math.random() * tied.length)];
	}
	game.ended = true;
	game.phase = "ended";
	game.results = {
		scores,
		winnerId,
		tied,
		wasTiebreak,
		challengePenalties,
	};
	recordEvent(game, "game_end", {
		actor: winnerId,
		data: { winningScore: scores[winnerId], tied: tied.length, wasTiebreak },
	});
	pushLog(
		game,
		`Game over! ${game.players[winnerId].name} wins with ${scores[winnerId]} point(s)${wasTiebreak ? " (won a tiebreak coin flip)" : ""}!`,
	);
}
