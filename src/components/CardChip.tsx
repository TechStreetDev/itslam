"use client";

import { Card } from "@/lib/types";

function cardImage(card: Card): string {
	switch (card.category) {
		case "head":
			return `/assets/head/${card.color}.png`;
		case "butt":
			return `/assets/butt/${card.color}.png`;
		case "action":
			return `/assets/action/${card.action}.png`;
		case "modifier":
			return `/assets/modifier/${card.modifier}.png`;
		case "challenge":
			return `/assets/challenge/${card.challengeType}.png`;
	}
}

export function CardChip({
	card,
	mini,
	selected,
	discardPick,
	onClick,
}: {
	card: Card;
	mini?: boolean;
	selected?: boolean;
	discardPick?: boolean;
	onClick?: (c: Card) => void;
}) {
	return (
		<div
			onClick={() => onClick?.(card)}
			className={[
				"relative flex-shrink-0 rounded-[8px] overflow-hidden cursor-pointer select-none transition-transform duration-100 shadow-[0_2px_4px_rgba(0,0,0,0.3)]",
				mini
					? "w-[46px] h-[64px] md:w-[54px] md:h-[76px]"
					: "w-[74px] h-[104px] md:w-[90px] md:h-[126px] lg:w-[104px] lg:h-[146px]",
				selected
					? "-translate-y-[18px] shadow-[0_0_0_4px_#b040a0,0_0_20px_rgba(176,64,160,0.65),0_10px_20px_rgba(0,0,0,0.35)]"
					: "hover:-translate-y-1",
				discardPick
					? "outline outline-[3px] outline-dashed outline-[#c03060] outline-offset-2"
					: "",
			].join(" ")}
		>
			<img
				src={cardImage(card)}
				alt=""
				draggable={false}
				className="w-full h-full object-cover"
			/>
			{selected && (
				<div className="absolute inset-0 bg-[rgba(176,64,160,0.22)] pointer-events-none" />
			)}
			{selected && (
				<div className="absolute top-1 right-1 w-[18px] h-[18px] bg-[#b040a0] rounded-full flex items-center justify-center text-white text-[10px] font-black leading-none shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
					✓
				</div>
			)}
		</div>
	);
}
