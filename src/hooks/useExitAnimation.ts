"use client";

import { useEffect, useState } from "react";

// Keeps a panel mounted after it's closed until its exit animation finishes.
// Put onAnimationEnd on the element running the exit animation.
export function useExitAnimation(open: boolean) {
	const [mounted, setMounted] = useState(open);

	useEffect(() => {
		if (open) {
			setMounted(true);
		}
	}, [open]);

	const closing = !(open);
	function onAnimationEnd(e: React.AnimationEvent) {
		if (closing && e.target === e.currentTarget) {
			setMounted(false);
		}
	}

	return {mounted, closing, onAnimationEnd};
}
