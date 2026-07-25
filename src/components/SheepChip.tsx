"use client";

import { PartCard, SheepEntity } from "@/lib/types";

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
export function isSwappable(entity: SheepEntity): boolean {
	return (
		entity.kind === "franken_heads" ||
		entity.kind === "franken_butts" ||
		entity.kind === "painted" ||
		entity.kind === "half_rainbow"
	);
}

function isCompletePair(head: PartCard, butt: PartCard): boolean {
	return (
		(head.rainbow && butt.rainbow) ||
		(!head.rainbow && !butt.rainbow && head.color === butt.color)
	);
}

// Returns true if swapping handCard into entity would produce a basic or full-rainbow (completed) sheep.
export function canBodyswapComplete(
	entity: SheepEntity,
	handCard: PartCard,
): boolean {
	if (entity.kind === "franken_heads") {
		if (handCard.category !== "butt") return false;
		return [entity.head!, entity.extra!].some((h) =>
			isCompletePair(h, handCard),
		);
	}
	if (entity.kind === "franken_butts") {
		if (handCard.category !== "head") return false;
		return [entity.butt!, entity.extra!].some((b) =>
			isCompletePair(handCard, b),
		);
	}
	// painted or half_rainbow
	if (handCard.category === "head" && entity.butt)
		return isCompletePair(handCard, entity.butt);
	if (handCard.category === "butt" && entity.head)
		return isCompletePair(entity.head, handCard);
	return false;
}

// Returns the id of the card to remove so the swap produces a completed sheep.
export function computeBodyswapRemoveId(
	entity: SheepEntity,
	handCard: PartCard,
): string {
	if (entity.kind === "franken_heads") {
		const heads = [entity.head!, entity.extra!];
		const keepIdx = heads.findIndex((h) => isCompletePair(h, handCard));
		return heads[keepIdx === 0 ? 1 : 0].id;
	}
	if (entity.kind === "franken_butts") {
		const butts = [entity.butt!, entity.extra!];
		const keepIdx = butts.findIndex((b) => isCompletePair(handCard, b));
		return butts[keepIdx === 0 ? 1 : 0].id;
	}
	// painted or half_rainbow: replace the slot matching the hand card's category
	return handCard.category === "head" ? entity.head!.id : entity.butt!.id;
}

export function SheepChip({
	entity,
	clickable,
	swappable,
	selected,
	onClick,
}: {
	entity: SheepEntity;
	clickable?: boolean;
	swappable?: boolean;
	selected?: boolean;
	onClick?: (e: SheepEntity) => void;
}) {
	let leftCard: PartCard,
		rightCard: PartCard,
		badge: string | null = null;
	if (entity.kind === "franken_heads") {
		leftCard = entity.head as PartCard;
		rightCard = entity.extra as PartCard;
		badge = "FRANKEN";
	} else if (entity.kind === "franken_butts") {
		leftCard = entity.butt as PartCard;
		rightCard = entity.extra as PartCard;
		badge = "FRANKEN";
	} else {
		leftCard = entity.head as PartCard;
		rightCard = entity.butt as PartCard;
		badge =
			entity.kind === "painted"
				? "PAINTED"
				: entity.kind === "full_rainbow"
					? "RAINBOW"
					: entity.kind === "half_rainbow"
						? "HALF RAINBOW"
						: null;
	}

	const leftSrc = `/assets/${leftCard.category}/${leftCard.rainbow ? "rainbow" : leftCard.color}.png`;
	const rightSrc = `/assets/${rightCard.category}/${rightCard.rainbow ? "rainbow" : rightCard.color}.png`;
	const modifierSrc = entity.modifierCard
		? `/assets/modifier/${entity.modifierCard.modifier}.png`
		: null;

	const cardCls =
		"w-[75px] h-[105px] rounded-[8px] object-contain bg-white shadow";

	return (
		<div
			className={[
				"relative mt-3.5 flex-shrink-0",
				"drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)]",
				clickable ? "cursor-pointer" : "",
				selected
					? "outline outline-[3px] outline-[#b040a0] outline-offset-4 rounded-[8px]"
					: "",
			].join(" ")}
			onClick={(e) => {
				e.stopPropagation();
				onClick?.(entity);
			}}
		>
			{swappable && (
				<span className="absolute -top-2.5 -right-1.5 w-5 h-5 rounded-full bg-[#b040a0] text-white text-[11px] font-extrabold flex items-center justify-center shadow z-10">
					&#8635;
				</span>
			)}
			{badge && (
				<div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[#a05578] text-white text-[9px] font-extrabold px-[7px] py-px rounded-full whitespace-nowrap shadow z-10">
					{badge}
				</div>
			)}
			<div className="flex gap-1">
				<img
					src={leftSrc}
					alt=""
					draggable={false}
					className={`${cardCls}${entity.kind === "franken_butts" ? " rotate-180" : ""}`}
				/>
				<img
					src={rightSrc}
					alt=""
					draggable={false}
					className={`${cardCls}${entity.kind === "franken_heads" ? " rotate-180" : ""}`}
				/>
				{modifierSrc && (
					<img
						src={modifierSrc}
						alt=""
						draggable={false}
						className={cardCls}
					/>
				)}
			</div>
			<div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-white text-[#3d1a2c] text-[10px] font-extrabold px-1.5 rounded-full border-2 border-[#3d1a2c] z-10 whitespace-nowrap">
				{entityPoints(entity)} pt{entityPoints(entity) > 1 ? "s" : ""}
			</div>
		</div>
	);
}
