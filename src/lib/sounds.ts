"use client";

// Small synthesised sound effects - no audio files to load.
// Browsers only let audio start after the player has interacted with the page,
// so the context is created lazily and resumed on the first tap or key press.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
	if (typeof window === "undefined") return null;
	if (!ctx) {
		const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
		if (!Ctor) return null;
		ctx = new Ctor();
		const unlock = () => ctx?.resume().catch(() => {});
		window.addEventListener("pointerdown", unlock, { once: true });
		window.addEventListener("keydown", unlock, { once: true });
	}
	return ctx;
}

// Warm the context up early so the first message can make a sound
export function primeSounds() {
	audio();
}

// Soft two-note "pop" for an incoming chat message
export function playChatPing() {
	const ac = audio();
	if (!ac || ac.state !== "running") return;
	const now = ac.currentTime;
	[
		{ freq: 880, at: 0 },
		{ freq: 1320, at: 0.07 },
	].forEach(({ freq, at }) => {
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(freq, now + at);
		gain.gain.setValueAtTime(0, now + at);
		gain.gain.linearRampToValueAtTime(0.08, now + at + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
		osc.connect(gain).connect(ac.destination);
		osc.start(now + at);
		osc.stop(now + at + 0.18);
	});
}
