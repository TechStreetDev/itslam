"use client";

import { useEffect, useRef, useState } from "react";

export interface PresenceItem<T> {
	item: T;
	key: string;
	// Added in the last `ms` - play an enter animation (never true for items there on first render)
	entering: boolean;
	// Just removed - kept for `ms` so it can play an exit animation
	leaving: boolean;
}

// A list that keeps removed items around briefly, in their old place, so they can animate
// out - and flags new ones so they can animate in.
export function usePresence<T>(items: T[], keyOf: (item: T) => string, ms = 220): PresenceItem<T>[] {
	const keys = items.map(keyOf);
	const initial = useRef<Set<string> | null>(null);
	initial.current ??= new Set(keys);
	const prev = useRef<T[]>(items);
	const leaving = useRef(new Map<string, { item: T; index: number; until: number }>());
	const enteredAt = useRef(new Map<string, number>());
	const [, rerender] = useState(0);

	const current = new Set(keys);
	prev.current.forEach((item, index) => {
		const key = keyOf(item);
		if (!current.has(key) && !leaving.current.has(key)) {
			leaving.current.set(key, { item, index, until: Date.now() + ms });
			// Coming back later should animate in
			initial.current!.delete(key);
		}
	});
	const now = Date.now();
	for (const key of current) {
		leaving.current.delete(key);
		if (!initial.current.has(key) && !enteredAt.current.has(key)) enteredAt.current.set(key, now);
	}
	for (const key of enteredAt.current.keys()) if (!current.has(key)) enteredAt.current.delete(key);
	prev.current = items;

	// Drop items once their exit animation has finished
	useEffect(() => {
		if (leaving.current.size === 0) return;
		const t = setTimeout(() => {
			const now = Date.now();
			for (const [key, l] of leaving.current) if (l.until <= now) leaving.current.delete(key);
			rerender((n) => n + 1);
		}, ms);
		return () => clearTimeout(t);
	});

	const out: PresenceItem<T>[] = items.map((item, i) => ({
		item,
		key: keys[i],
		entering: now - (enteredAt.current.get(keys[i]) ?? -Infinity) < ms,
		leaving: false,
	}));
	const gone = [...leaving.current.entries()].sort((a, b) => a[1].index - b[1].index);
	for (const [key, l] of gone)
		out.splice(Math.min(l.index, out.length), 0, { item: l.item, key, entering: false, leaving: true });
	return out;
}
