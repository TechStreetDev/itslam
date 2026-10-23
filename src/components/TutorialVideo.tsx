"use client";

import { useEffect, useRef } from "react";
import { isDiscordActivity, openExternal } from "@/lib/discordActivity";

declare global {
	interface Window {
		YT?: any;
		onYouTubeIframeAPIReady?: () => void;
	}
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
	if (window.YT?.Player) return Promise.resolve(window.YT);
	if (!apiPromise) {
		apiPromise = new Promise((resolve) => {
			const prev = window.onYouTubeIframeAPIReady;
			window.onYouTubeIframeAPIReady = () => {
				prev?.();
				resolve(window.YT);
			};
			const tag = document.createElement("script");
			tag.src = "https://www.youtube.com/iframe_api";
			document.head.appendChild(tag);
		});
	}
	return apiPromise;
}

// Embedded YouTube video that reports how far through it the viewer is (0-1)
export function TutorialVideo({
	videoId,
	onProgress,
	onEnded,
}: {
	videoId: string;
	onProgress: (progress: number) => void;
	onEnded: () => void;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const callbacks = useRef({ onProgress, onEnded });
	callbacks.current = { onProgress, onEnded };

	// Discord Activities can't embed YouTube, so link out instead
	const inActivity = isDiscordActivity();

	useEffect(() => {
		if (inActivity) return;
		let player: any = null;
		let poll: ReturnType<typeof setInterval> | null = null;
		let cancelled = false;

		loadYouTubeApi().then((YT) => {
			if (cancelled || !hostRef.current) return;
			player = new YT.Player(hostRef.current, {
				videoId,
				// Privacy-enhanced mode - YouTube doesn't set cookies until the video is played
				host: "https://www.youtube-nocookie.com",
				width: "100%",
				height: "100%",
				playerVars: { rel: 0, modestbranding: 1 },
				events: {
					onStateChange: (e: any) => {
						if (e.data === YT.PlayerState.ENDED)
							callbacks.current.onEnded();
					},
				},
			});
			poll = setInterval(() => {
				const duration = player?.getDuration?.() || 0;
				const current = player?.getCurrentTime?.() || 0;
				if (duration > 0)
					callbacks.current.onProgress(current / duration);
			}, 1000);
		});

		return () => {
			cancelled = true;
			if (poll) clearInterval(poll);
			player?.destroy?.();
		};
	}, [videoId, inActivity]);

	if (inActivity)
		return (
			<button
				onClick={() =>
					openExternal(`https://www.youtube.com/watch?v=${videoId}`)
				}
				className="w-full font-extrabold text-[15px] px-5 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.18)] bg-[#c05090] text-white hover:brightness-105 active:translate-y-px active:scale-[0.98] transition"
			>
				▶ Watch the quick-start video on YouTube
			</button>
		);

	return (
		<div
			className="relative w-full rounded-[12px] overflow-hidden"
			style={{ paddingBottom: "56.25%" }}
		>
			<div className="absolute inset-0 w-full h-full">
				<div ref={hostRef} className="w-full h-full" />
			</div>
		</div>
	);
}
