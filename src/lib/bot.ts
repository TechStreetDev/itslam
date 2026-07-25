import * as engine from "./engine";
import {
	GameState,
	HeadCard,
	ButtCard,
	ModifierCard,
	ChallengeCard,
	ActionCard,
} from "./types";

function tryBuildSheep(game: GameState, botId: string): boolean {
	const hand = game.players[botId].hand;

	const heads    = hand.filter((c): c is HeadCard    => c.category === "head");
	const butts    = hand.filter((c): c is ButtCard    => c.category === "butt");
	const paints   = hand.filter((c): c is ModifierCard => c.category === "modifier" && c.modifier === "paint");
	const frankens = hand.filter((c): c is ModifierCard => c.category === "modifier" && c.modifier === "franken");

	const rHead = heads.find((h) => h.rainbow);
	const rButt = butts.find((b) => b.rainbow);

	// Double rainbow - highest priority
	if (rHead && rButt) {
		engine.playSheep(game, botId, { headCardId: rHead.id, buttCardId: rButt.id });
		return true;
	}

	// Matching colour pair
	for (const head of heads) {
		if (head.rainbow) continue;
		const matchButt = butts.find((b) => !b.rainbow && b.color === head.color);
		if (matchButt) {
			engine.playSheep(game, botId, { headCardId: head.id, buttCardId: matchButt.id });
			return true;
		}
	}

	// Half-rainbow pairs
	if (rHead) {
		const anyButt = butts.find((b) => !b.rainbow);
		if (anyButt) {
			engine.playSheep(game, botId, { headCardId: rHead.id, buttCardId: anyButt.id });
			return true;
		}
	}
	if (rButt) {
		const anyHead = heads.find((h) => !h.rainbow);
		if (anyHead) {
			engine.playSheep(game, botId, { headCardId: anyHead.id, buttCardId: rButt.id });
			return true;
		}
	}

	// Paint - any head + any butt
	if (paints.length > 0 && heads.length > 0 && butts.length > 0) {
		engine.playSheep(game, botId, {
			headCardId: heads[0].id,
			buttCardId: butts[0].id,
			modifierCardId: paints[0].id,
		});
		return true;
	}

	// Franken - 2 heads or 2 butts
	if (frankens.length > 0) {
		if (heads.length >= 2) {
			engine.playSheep(game, botId, {
				headCardId: heads[0].id,
				extraCardId: heads[1].id,
				modifierCardId: frankens[0].id,
			});
			return true;
		}
		if (butts.length >= 2) {
			engine.playSheep(game, botId, {
				buttCardId: butts[0].id,
				extraCardId: butts[1].id,
				modifierCardId: frankens[0].id,
			});
			return true;
		}
	}

	return false;
}

function tryPlayAction(game: GameState, botId: string): boolean {
	const hand = game.players[botId].hand;
	const opponents = game.order
		.filter((id) => id !== botId)
		.map((id) => game.players[id]);

	const wheats = hand.filter((c): c is ActionCard => c.category === "action" && c.action === "wheat");
	const wolves = hand.filter((c): c is ActionCard => c.category === "action" && c.action === "wolf");
	const yoinks = hand.filter((c): c is ActionCard => c.category === "action" && c.action === "yoink");

	for (const card of wheats) {
		for (const opp of opponents) {
			if (engine.isProtectedFromWheat(opp.field) || opp.field.length === 0) continue;
			const target = opp.field.find((s) => s.kind === "full_rainbow") ?? opp.field[0];
			try {
				engine.playAction(game, botId, { cardId: card.id, targetPlayerId: opp.id, targetSheepId: target.id });
				return true;
			} catch {}
		}
	}

	for (const card of wolves) {
		for (const opp of opponents) {
			if (engine.isProtectedFromWolf(opp.field) || opp.field.length === 0) continue;
			const target = opp.field.find((s) => s.kind === "full_rainbow") ?? opp.field[0];
			try {
				engine.playAction(game, botId, { cardId: card.id, targetPlayerId: opp.id, targetSheepId: target.id });
				return true;
			} catch {}
		}
	}

	for (const card of yoinks) {
		const richest = opponents.reduce<(typeof opponents)[0] | null>(
			(best, opp) => (!best || opp.hand.length > best.hand.length ? opp : best),
			null,
		);
		if (richest && richest.hand.length > 0) {
			try {
				engine.playAction(game, botId, { cardId: card.id, targetPlayerId: richest.id });
				return true;
			} catch {}
		}
	}

	return false;
}

function tryPlayChallenge(game: GameState, botId: string): boolean {
	if (game.challengeUsedThisTurn) return false;
	const challenges = game.players[botId].hand.filter(
		(c): c is ChallengeCard => c.category === "challenge",
	);
	if (challenges.length === 0) return false;
	const targets = game.order
		.filter((id) => id !== botId)
		.map((id) => game.players[id])
		.filter((p) => p.field.length > 0);
	if (targets.length === 0) return false;
	const target = targets[Math.floor(Math.random() * targets.length)];
	const guess: "heads" | "butts" = Math.random() < 0.5 ? "heads" : "butts";
	try {
		engine.playChallenge(game, botId, { cardId: challenges[0].id, targetPlayerId: target.id, guess });
		return true;
	} catch {
		return false;
	}
}

export function doBotDrawPhase(game: GameState, botId: string): boolean {
	if (game.phase !== "draw" || engine.currentPlayerId(game) !== botId) return false;
	engine.drawPhase(game, botId);
	return true;
}

export function doBotPlayAction(game: GameState, botId: string): boolean {
	if (game.phase !== "play" || engine.currentPlayerId(game) !== botId || game.pendingChallenge)
		return false;
	return tryBuildSheep(game, botId) || tryPlayAction(game, botId) || tryPlayChallenge(game, botId);
}

export function doBotEndTurn(game: GameState, botId: string): boolean {
	if (game.phase !== "play" || engine.currentPlayerId(game) !== botId || game.pendingChallenge)
		return false;
	const player = game.players[botId];
	const discardIds =
		player.hand.length > 7
			? player.hand
					.filter((c) => c.category !== "challenge")
					.slice(0, player.hand.length - 7)
					.map((c) => c.id)
			: [];
	engine.endTurn(game, botId, discardIds);
	return true;
}

export function doBotFlip(game: GameState, botId: string): boolean {
	const pc = game.pendingChallenge;
	if (!pc || pc.stage !== "awaiting_flip" || pc.targetId !== botId || pc.guess === null)
		return false;
	engine.resolveFlip(game, botId);
	return true;
}

export function doBotReGuess(game: GameState, botId: string): boolean {
	const pc = game.pendingChallenge;
	if (!pc || pc.stage !== "awaiting_flip" || pc.challengerId !== botId || pc.guess !== null)
		return false;
	engine.setChallengeGuess(game, botId, Math.random() < 0.5 ? "heads" : "butts");
	return true;
}

export function resolveBotChallengeEffect(game: GameState, botId: string): boolean {
	const pc = game.pendingChallenge;
	if (!pc || pc.stage !== "awaiting_selection" || pc.winnerId !== botId) return false;
	const loser = game.players[pc.loserId!];

	if (pc.challengeType === "lure2" || pc.challengeType === "remove2") {
		engine.resolveChallengeEffect(game, botId, {
			sheepIds: loser.field.slice(0, 2).map((s) => s.id),
		});
	} else if (pc.challengeType === "halve2") {
		engine.resolveChallengeEffect(game, botId, {
			halves: loser.field.slice(0, 2).map((sheep) => ({
				sheepId: sheep.id,
				keepCardId: (sheep.head ?? sheep.butt)!.id,
			})),
		});
	} else {
		engine.resolveChallengeEffect(game, botId, {});
	}
	return true;
}
