"use client";

import { useEffect, useRef, useState } from "react";

// Measures an element so a wrapper can animate its height as the content changes.
// height stays undefined (auto) until the first measurement, so nothing animates on mount.
export function useAnimatedHeight<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [height, setHeight] = useState<number>();
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, height };
}
