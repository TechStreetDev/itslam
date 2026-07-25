import { buildDeck, shuffle, CHALLENGE_META } from "./deck";
import {
	Card,
	GameState,
	HeadCard,
	ButtCard,
	ModifierCard,
	PartCard,
	Player,
	SheepEntity,
	SheepKind,
	PendingChallenge,
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

export function createGame(players: { id: string; name: string }[]): GameState {
	const deck = shuffle(buildDeck());
	const order = shuffle(players.map((p) => p.id));

	const game: GameState = {
		players: {},
		order,
		turnIndex: 0,
		deck,
		discard: [],
		phase: "draw",
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

	pushLog(
		game,
		`The flock has gathered. ${game.players[order[0]].name} goes first.`,
	);
	return game;
}

function pushLog(game: GameState, text: string) {
	game.log.push({ ts: Date.now(), text });
	if (game.log.length > 200) game.log.shift();
}

export function currentPlayerId(game: GameState): string {
	return game.order[game.turnIndex];
}

function requireTurn(game: GameState, playerId: string) {
	if (game.ended) throw err("The game has ended.");
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
		takeFromHand(player, handCardId);
		player.hand.push(removedPart);
		if (entity.modifierCard) player.hand.push(entity.modifierCard);

		entity.kind = kind;
		entity.head = isHeads ? (keptPart as HeadCard) : (handCard as HeadCard);
		entity.butt = isHeads ? (handCard as ButtCard) : (keptPart as ButtCard);
		entity.extra = null;
		entity.modifierCard = null;
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
		takeFromHand(player, handCardId);
		player.hand.push(removedPart);
		if (entity.modifierCard) player.hand.push(entity.modifierCard);

		entity.kind = kind;
		entity.head = newHead;
		entity.butt = newButt;
		entity.modifierCard = null;
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

	const flip: "heads" | "butts" = Math.random() < 0.5 ? "heads" : "butts";
	const correct = flip === pc.guess!;
	const winnerId = correct ? pc.challengerId : pc.targetId;
	const loserId = correct ? pc.targetId : pc.challengerId;

	pc.flipResult = flip;
	pc.winnerId = winnerId;
	pc.loserId = loserId;
	pc.flipCount = (pc.flipCount ?? 1) + 1;

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

	if (pc.challengeType === "lure2") {
		const ids = (selections.sheepIds || []).slice(0, 2);
		const lureDescs: string[] = [];
		for (const sid of ids) {
			const sIdx = loser.field.findIndex((e) => e.id === sid);
			if (sIdx === -1) continue;
			const [sheep] = loser.field.splice(sIdx, 1);
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
			pushLog(
				game,
				`${winner.name} recovered a ${describeSheep(recovered)} from the discard pile!`,
			);
		} else {
			pushLog(game, `${winner.name} skipped recovering a Sheep.`);
		}
	}

	game.discard.push(pc.card);
	game.pendingChallenge = null;
}

export function discardCards(
	game: GameState,
	playerId: string,
	cardIds: string[],
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	if (game.pendingChallenge)
		throw err("Resolve the current challenge first.");
	if (cardIds.length === 0) throw err("Choose at least one card to discard.");
	const player = game.players[playerId];
	for (const cid of cardIds) {
		const idx = findCardInHand(player, cid);
		const card = player.hand[idx];
		if (card.category === "challenge")
			throw err("Challenge cards can’t be discarded until they’re used.");
		player.hand.splice(idx, 1);
		game.discard.push(card);
	}
	pushLog(
		game,
		`${player.name} discarded ${cardIds.length} card${cardIds.length !== 1 ? "s" : ""}.`,
	);
}

export function endTurn(
	game: GameState,
	playerId: string,
	discardCardIds: string[] = [],
) {
	requireTurn(game, playerId);
	if (game.phase !== "play") throw err("Draw a card first.");
	if (game.pendingChallenge)
		throw err("Resolve the current challenge first.");
	const player = game.players[playerId];

	if (player.hand.length > 7) {
		const wanted = player.hand.length - 7;
		const ids = discardCardIds.slice(0, wanted);
		if (ids.length < wanted)
			throw err(`Discard down to 7 cards (choose ${wanted}).`);
		for (const cid of ids) {
			const idx = findCardInHand(player, cid);
			const card = player.hand[idx];
			if (card.category === "challenge")
				throw err(
					"Challenge cards can\u2019t be discarded until they\u2019re used.",
				);
			player.hand.splice(idx, 1);
			game.discard.push(card);
		}
	}

	pushLog(game, `${player.name} said "Baa!"`);

	if (game.deckJustEmptied && !game.finalRoundActive) {
		game.finalRoundActive = true;
		game.deckJustEmptiedHandled = true;
		const startIdx = (game.turnIndex + 1) % game.order.length;
		const queue: string[] = [];
		for (let i = 0; i < game.order.length; i++)
			queue.push(game.order[(startIdx + i) % game.order.length]);
		game.finalRoundQueue = queue;
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
	game.phase = "draw";
	game.drawnThisTurn = false;
	game.challengeUsedThisTurn = false;
}

function endGame(game: GameState) {
	const scores: Record<string, number> = {};
	for (const pid of game.order) {
		const p = game.players[pid];
		let pts = p.field.reduce((sum, e) => sum + entityPoints(e), 0);
		const challengePenalty =
			p.hand.filter((c) => c.category === "challenge").length * 3;
		pts -= challengePenalty;
		scores[pid] = pts;
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
	game.results = { scores, winnerId, tied, wasTiebreak };
	pushLog(
		game,
		`Game over! ${game.players[winnerId].name} wins with ${scores[winnerId]} point(s)${wasTiebreak ? " (won a tiebreak coin flip)" : ""}!`,
	);
}
