"use client";

import { useRef } from "react";
import { useExitAnimation } from "@/hooks/useExitAnimation";

// Centered dialog that fades/pops in and out. Pass `open` rather than mounting it
// conditionally, so it can play its exit animation before unmounting.
export function Modal({
	open,
	onBackdropClick,
	backdropClassName = "bg-[rgba(0,0,0,0.55)]",
	className = "z-50 p-5",
	panelClassName,
	labelledBy,
	children,
}: {
	open: boolean;
	onBackdropClick?: () => void;
	backdropClassName?: string;
	// Positioning for the outer layer, e.g. z-index and padding
	className?: string;
	panelClassName: string;
	labelledBy?: string;
	children: React.ReactNode;
}) {
	const { mounted, closing, onAnimationEnd } = useExitAnimation(open);
	// Callers usually render their content from state that's already gone by the
	// time the modal closes - keep showing what was there while it animates out
	const lastChildren = useRef(children);
	if (open) lastChildren.current = children;
	if (!mounted) return null;

	return (
		<div
			className={[
				"fixed inset-0 flex items-center justify-center",
				className,
				closing ? "pointer-events-none" : "",
			].join(" ")}
		>
			<div
				className={[
					"absolute inset-0",
					backdropClassName,
					closing ? "drawer-fade-out" : "drawer-fade",
				].join(" ")}
				onClick={onBackdropClick}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={labelledBy}
				onAnimationEnd={onAnimationEnd}
				className={[
					"relative",
					panelClassName,
					closing ? "modal-out" : "modal-in",
				].join(" ")}
			>
				{open ? children : lastChildren.current}
			</div>
		</div>
	);
}
