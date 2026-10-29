"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	Flag,
	Lock,
	MessageCircle,
	Minus,
	SendHorizontal,
	Volume2,
	VolumeX,
	X,
	Zap,
} from "lucide-react";
import {
	CHAT_MAX_LENGTH,
	ChatMessage,
	QUICK_RESPONSES,
	REPORT_DETAILS_MAX,
	REPORT_REASONS,
	SessionInfo,
} from "@/lib/types";
import { Modal } from "@/components/Modal";
import { signInWithPopup } from "@/lib/signIn";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { playChatPing, primeSounds } from "@/lib/sounds";

function useIsDesktop() {
	const query = "(min-width: 768px)";
	const [matches, setMatches] = useState(
		() => typeof window !== "undefined" && window.matchMedia(query).matches,
	);
	useEffect(() => {
		const mq = window.matchMedia(query);
		const onChange = () => setMatches(mq.matches);
		onChange();
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	return matches;
}

// Open/closed state for both layouts, plus how many messages came in while it was hidden.
// Lives above the screens so the game screen's header button and the widget share it.
// historyTs: newest message that was already there when we joined - those count as read
export function useChatState(
	messages: ChatMessage[],
	myId: string,
	historyTs: number,
) {
	const isDesktop = useIsDesktop();
	const [desktopOpen, setDesktopOpenState] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	useEffect(() => {
		try {
			const saved = localStorage.getItem("flock_chat_open");
			// Wide screens have room for it by default; narrower ones start collapsed
			setDesktopOpenState(
				saved
					? saved === "1"
					: window.matchMedia("(min-width: 1280px)").matches,
			);
		} catch {}
	}, []);
	function setDesktopOpen(open: boolean) {
		setDesktopOpenState(open);
		try {
			localStorage.setItem("flock_chat_open", open ? "1" : "0");
		} catch {}
	}

	const visible = isDesktop ? desktopOpen : mobileOpen;
	const [seenTs, setSeenTs] = useState(0);
	const latestTs = messages.length ? messages[messages.length - 1].ts : 0;
	useEffect(() => {
		if (visible) setSeenTs(latestTs);
	}, [visible, latestTs]);
	const readUpTo = Math.max(seenTs, historyTs);
	const unread = visible
		? 0
		: messages.filter((m) => m.ts > readUpTo && m.playerId !== myId).length;

	// Ping when someone else's message arrives - not your own, and not the history loaded on join
	const [soundOn, setSoundOnState] = useState(true);
	useEffect(() => {
		primeSounds();
		try {
			setSoundOnState(localStorage.getItem("flock_chat_sound") !== "0");
		} catch {}
	}, []);
	function setSoundOn(on: boolean) {
		setSoundOnState(on);
		try {
			localStorage.setItem("flock_chat_sound", on ? "1" : "0");
		} catch {}
	}
	const heardTs = useRef(0);
	useEffect(() => {
		const last = messages[messages.length - 1];
		if (
			last &&
			last.ts > Math.max(heardTs.current, historyTs) &&
			last.playerId !== myId &&
			soundOn
		)
			playChatPing();
		heardTs.current = Math.max(heardTs.current, latestTs);
	}, [latestTs]);

	return {
		desktopOpen,
		setDesktopOpen,
		mobileOpen,
		setMobileOpen,
		unread,
		soundOn,
		setSoundOn,
	};
}

export type ChatState = ReturnType<typeof useChatState>;

function SoundToggle({ chatState }: { chatState: ChatState }) {
	const { soundOn, setSoundOn } = chatState;
	const label = soundOn ? "Mute chat sounds" : "Unmute chat sounds";
	return (
		<button
			onClick={() => setSoundOn(!soundOn)}
			aria-label={label}
			aria-pressed={!soundOn}
			title={label}
			className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a5a70] hover:bg-[#ffe0f0] transition"
		>
			{soundOn ? (
				<Volume2 size={16} strokeWidth={2.5} />
			) : (
				<VolumeX size={16} strokeWidth={2.5} />
			)}
		</button>
	);
}

function UnreadBadge({ count }: { count: number }) {
	if (!count) return null;
	return (
		<span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#e0306a] text-white text-[11px] font-black flex items-center justify-center tabular-nums shadow">
			{count > 9 ? "9+" : count}
		</span>
	);
}

export function ChatWidget({
	messages,
	myId,
	session,
	chatState,
	onSend,
	onQuick,
	onReport,
	mobileLauncher = true,
}: {
	messages: ChatMessage[];
	myId: string;
	session: SessionInfo | null;
	chatState: ChatState;
	onSend: (text: string) => void;
	onQuick: (index: number) => void;
	// Resolves with an error message, or null once the report is saved
	onReport: (
		messageId: string,
		reason: string,
		details: string,
	) => Promise<string | null>;
	// The game screen opens chat from its own header button on mobile
	mobileLauncher?: boolean;
}) {
	const { desktopOpen, setDesktopOpen, mobileOpen, setMobileOpen, unread } =
		chatState;
	const panel = useExitAnimation(desktopOpen);
	const [reporting, setReporting] = useState<ChatMessage | null>(null);
	if (!session) return null;

	const body = (
		<ChatBody
			messages={messages}
			myId={myId}
			session={session}
			onSend={onSend}
			onQuick={onQuick}
			onReportClick={setReporting}
		/>
	);

	return (
		<>
			{/* Desktop: bottom-left corner, collapses to a pill */}
			<div className="hidden md:block fixed bottom-5 left-5 z-[40]">
				{/* Stays mounted while it shrinks away; the pill only comes back after */}
				{panel.mounted ? (
					<div
						onAnimationEnd={panel.onAnimationEnd}
						className={[
							"w-[300px] h-[340px] bg-[#fff0f5]/95 backdrop-blur-sm rounded-2xl border-2 border-white shadow-[0_6px_18px_rgba(130,50,90,0.22)] flex flex-col overflow-hidden",
							panel.closing
								? "chat-out pointer-events-none"
								: "chat-in",
						].join(" ")}
					>
						<div className="flex items-center justify-between px-3.5 py-2 border-b-2 border-[#f5d0e8]">
							<span className="font-display font-extrabold text-[#7a3a58] flex items-center gap-1.5">
								<MessageCircle size={16} strokeWidth={2.5} />
								Chat
							</span>
							<span className="flex items-center gap-0.5">
								<SoundToggle chatState={chatState} />
								<button
									onClick={() => setDesktopOpen(false)}
									aria-label="Minimise chat"
									title="Minimise chat"
									className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a5a70] hover:bg-[#ffe0f0] transition"
								>
									<Minus size={18} strokeWidth={2.5} />
								</button>
							</span>
						</div>
						{body}
					</div>
				) : (
					<button
						onClick={() => setDesktopOpen(true)}
						className="chat-pill-in relative flex items-center gap-2 h-11 pl-3.5 pr-4 rounded-full bg-white text-[#7a3a58] font-extrabold text-sm shadow-[0_6px_18px_rgba(130,50,90,0.18)] hover:brightness-[0.98] active:translate-y-px transition"
					>
						<MessageCircle size={18} strokeWidth={2.5} />
						Chat
						<UnreadBadge count={unread} />
					</button>
				)}
			</div>

			{/* Mobile: round button bottom-left (unless the screen has its own), opens a sheet */}
			{mobileLauncher && (
				<button
					onClick={() => setMobileOpen(true)}
					aria-label="Open chat"
					className="md:hidden fixed bottom-4 left-4 z-[40] w-12 h-12 rounded-full bg-white text-[#7a3a58] shadow-[0_6px_18px_rgba(130,50,90,0.22)] flex items-center justify-center active:translate-y-px transition"
				>
					<MessageCircle size={22} strokeWidth={2.5} />
					<UnreadBadge count={unread} />
				</button>
			)}
			<ChatSheet
				open={mobileOpen}
				onClose={() => setMobileOpen(false)}
				actions={<SoundToggle chatState={chatState} />}
			>
				{body}
			</ChatSheet>
			<ReportModal
				message={reporting}
				onClose={() => setReporting(null)}
				onReport={onReport}
			/>
		</>
	);
}

function ChatSheet({
	open,
	onClose,
	actions,
	children,
}: {
	open: boolean;
	onClose: () => void;
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	const { mounted, closing, onAnimationEnd } = useExitAnimation(open);
	if (!mounted) return null;
	return (
		<div
			className={[
				"md:hidden fixed inset-0 z-[45] flex flex-col justify-end",
				closing ? "pointer-events-none" : "",
			].join(" ")}
		>
			<div
				className={[
					"absolute inset-0 bg-[rgba(0,0,0,0.45)]",
					closing ? "drawer-fade-out" : "drawer-fade",
				].join(" ")}
				onClick={onClose}
			/>
			<div
				onAnimationEnd={onAnimationEnd}
				className={[
					"relative bg-[#fff0f5] rounded-t-[22px] shadow-2xl h-[70dvh] flex flex-col pb-[env(safe-area-inset-bottom)]",
					closing ? "drawer-down" : "drawer-up",
				].join(" ")}
			>
				<div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2 border-b-2 border-[#f5d0e8]">
					<div className="flex-1">
						<div className="mx-auto mb-1.5 w-10 h-1.5 rounded-full bg-[#e8b8cf]" />
						<span className="font-display font-extrabold text-[#7a3a58]">
							Chat
						</span>
					</div>
					{actions}
					<button
						onClick={onClose}
						aria-label="Close chat"
						className="w-9 h-9 rounded-full flex items-center justify-center text-[#8a5a70] hover:bg-[#ffe0f0] transition"
					>
						<X size={20} strokeWidth={2.5} />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

function ChatBody({
	messages,
	myId,
	session,
	onSend,
	onQuick,
	onReportClick,
}: {
	messages: ChatMessage[];
	myId: string;
	session: SessionInfo;
	onSend: (text: string) => void;
	onQuick: (index: number) => void;
	onReportClick: (message: ChatMessage) => void;
}) {
	const [draft, setDraft] = useState("");
	const muted = useActiveMute(session);
	const [quickOpen, setQuickOpen] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	// Follow new messages, unless the player has scrolled up to read older ones.
	// Also re-runs when the list is shown again after quick responses (hiding it resets its scroll).
	useLayoutEffect(() => {
		const el = listRef.current;
		if (el && !quickOpen && stickToBottom.current)
			el.scrollTop = el.scrollHeight;
	}, [messages.length, quickOpen]);

	function send(e: React.FormEvent) {
		e.preventDefault();
		const text = draft.trim();
		if (!text) return;
		onSend(text);
		setDraft("");
		stickToBottom.current = true;
	}

	return (
		<>
			<div
				ref={listRef}
				onScroll={(e) => {
					const el = e.currentTarget;
					stickToBottom.current =
						el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
				// Hidden rather than unmounted while quick responses are open, so nothing is lost
				className={`flex-1 overflow-y-auto px-3.5 py-2.5 flex-col gap-1.5 text-[13px] ${quickOpen ? "hidden" : "flex"}`}
			>
				{messages.length === 0 ? (
					<p className="m-auto text-center font-bold text-[#9a7888] opacity-80">
						No messages yet - say baa!
					</p>
				) : (
					messages.map((m) => (
						<p
							key={m.id}
							title={new Date(m.ts).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
							className="m-0 leading-snug text-[#4a2a3a] break-words"
						>
							<b
								className={
									m.playerId === myId
										? "text-[#c05090]"
										: "text-[#7a3a58]"
								}
							>
								{m.playerId === myId ? "You" : m.name}:
							</b>{" "}
							{m.text}
							{/* Only typed messages - quick responses are presets with nothing to report */}
							{!m.quick && m.playerId !== myId && (
								<button
									onClick={() => onReportClick(m)}
									aria-label={`Report ${m.name}'s message`}
									title="Report message"
									className="inline-flex align-[-1px] ml-1.5 text-[#c8a8b8] hover:text-[#d0303a] focus-visible:text-[#d0303a] transition"
								>
									<Flag size={11} strokeWidth={2.75} />
								</button>
							)}
						</p>
					))
				)}
			</div>
			{quickOpen && (
				<div className="flex-1 overflow-y-auto px-3 py-2.5 grid grid-cols-2 auto-rows-min gap-1.5 content-start">
					<p className="col-span-2 m-0 mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#8a5a70]">
						Quick responses
					</p>
					{QUICK_RESPONSES.map((text, i) => (
						<button
							key={i}
							onClick={() => {
								onQuick(i);
								setQuickOpen(false);
								stickToBottom.current = true;
							}}
							className="px-2.5 py-1 rounded-full bg-white border-2 border-[#f5d0e8] text-[13px] font-bold text-[#7a3a58] truncate hover:border-[#c05090] hover:bg-[#ffe0f0] active:translate-y-px transition"
						>
							{text}
						</button>
					))}
				</div>
			)}
			<div className="p-2.5 flex items-center gap-2 border-t-2 border-[#f5d0e8]">
				<button
					type="button"
					onClick={() => setQuickOpen((o) => !o)}
					aria-label="Quick responses"
					aria-expanded={quickOpen}
					title="Quick responses"
					className={`shrink-0 h-9 rounded-full border-2 flex items-center justify-center gap-1 font-extrabold text-[13px] transition active:translate-y-px w-9 ${
						quickOpen
							? "bg-[#c05090] border-[#c05090] text-white"
							: "bg-[#ffe0f0] border-[#e8a8c8] text-[#c05090] hover:border-[#c05090]"
					}`}
				>
					<Zap size={16} strokeWidth={2.5} fill="currentColor" />
				</button>
				{session.user && muted ? (
					// Stands in for the message box, greyed out like a disabled input
					<span
						title="You can still send quick responses"
						className="flex-1 min-w-0 min-h-9 py-1 px-3.5 rounded-full bg-[#ece6e9] border-2 border-[#ddd3d8] text-[#9a8f94] text-[12px] font-bold flex items-center gap-2 cursor-not-allowed select-none"
					>
						<Lock
							size={13}
							strokeWidth={2.75}
							className="shrink-0"
						/>
						{muted.until === null ? (
							<span className="truncate">Muted from chat</span>
						) : (
							// Two lines so the date never gets cut off in the narrow panel
							<span className="min-w-0 leading-tight">
								<span className="block">
									You are muted until:
								</span>
								<span className="block tabular-nums">
									{formatMuteEnd(muted.until)}
								</span>
							</span>
						)}
					</span>
				) : session.user ? (
					<form
						onSubmit={send}
						className="flex-1 min-w-0 flex items-center gap-2"
					>
						<input
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							maxLength={CHAT_MAX_LENGTH}
							placeholder="Say something…"
							aria-label="Chat message"
							className="flex-1 min-w-0 h-9 px-3.5 rounded-full bg-white border-2 border-[#f5d0e8] text-[14px] font-semibold text-[#4a2a3a] outline-none focus:border-[#c05090] transition"
						/>
						<button
							type="submit"
							disabled={!draft.trim()}
							aria-label="Send"
							className="shrink-0 w-9 h-9 rounded-full bg-[#c05090] text-white flex items-center justify-center hover:brightness-105 active:translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<SendHorizontal size={16} strokeWidth={2.5} />
						</button>
					</form>
				) : session.loginEnabled ? (
					<SignInPrompt />
				) : (
					<span className="flex-1 text-[12px] font-bold text-[#9a7888]">
						Quick responses only
					</span>
				)}
			</div>
		</>
	);
}

function SignInPrompt() {
	const [waiting, setWaiting] = useState(false);
	// The popup can't reliably tell us it was closed early - once focus comes back
	// to the game without a sign-in, offer the button again
	useEffect(() => {
		if (!waiting) return;
		let t: ReturnType<typeof setTimeout>;
		const onFocus = () => {
			t = setTimeout(() => setWaiting(false), 1500);
		};
		window.addEventListener("focus", onFocus);
		return () => {
			window.removeEventListener("focus", onFocus);
			clearTimeout(t);
		};
	}, [waiting]);

	return (
		<button
			onClick={() => {
				setWaiting(true);
				signInWithPopup();
			}}
			disabled={waiting}
			className="flex-1 min-w-0 h-9 rounded-full bg-[#5865F2] text-white font-extrabold text-[13px] hover:brightness-110 active:translate-y-px transition disabled:opacity-70 disabled:cursor-wait"
		>
			{waiting ? "Waiting for Discord…" : "Sign in to chat"}
		</button>
	);
}

// The mute in the session, until it runs out - then typing comes back without a reload
function useActiveMute(session: SessionInfo) {
	const muted = session.muted;
	const [, rerender] = useState(0);
	const until = muted?.until ?? null;
	useEffect(() => {
		if (until === null) return;
		const ms = until - Date.now();
		if (ms <= 0) return;
		// setTimeout can't wait longer than ~24.8 days
		const t = setTimeout(
			() => rerender((n) => n + 1),
			Math.min(ms + 500, 2 ** 31 - 1),
		);
		return () => clearTimeout(t);
	}, [until]);
	if (!muted || (muted.until !== null && muted.until <= Date.now()))
		return null;
	return muted;
}

function ReportModal({
	message,
	onClose,
	onReport,
}: {
	message: ChatMessage | null;
	onClose: () => void;
	onReport: (
		messageId: string,
		reason: string,
		details: string,
	) => Promise<string | null>;
}) {
	const [reason, setReason] = useState("");
	const [details, setDetails] = useState("");
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [error, setError] = useState("");
	// Fresh form for each message
	useEffect(() => {
		if (!message) return;
		setReason("");
		setDetails("");
		setState("idle");
		setError("");
	}, [message?.id]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!message || !reason) return;
		setState("sending");
		setError("");
		const err = await onReport(message.id, reason, details);
		if (err) {
			setError(err);
			setState("idle");
		} else setState("sent");
	}

	return (
		<Modal
			open={!!message}
			onBackdropClick={state === "sending" ? undefined : onClose}
			className="z-[60] p-5"
			labelledBy="report-title"
			panelClassName="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] border-[3px] border-white p-6 w-full max-w-[400px] text-[#4a2a3a]"
		>
			{message &&
				(state === "sent" ? (
					<div className="text-center">
						<h2
							id="report-title"
							className="font-display text-2xl text-[#7a3a58] font-extrabold mt-0 mb-2"
						>
							Thanks for reporting
						</h2>
						<p className="text-[14px] font-medium m-0">
							An admin will take a look at what {message.name}{" "}
							said.
						</p>
						<button
							onClick={onClose}
							className="mt-5 w-full font-extrabold text-[15px] px-5 py-3 rounded-full shadow bg-[#c05090] text-white hover:brightness-105 active:translate-y-px transition"
						>
							Done
						</button>
					</div>
				) : (
					<form onSubmit={submit}>
						<h2
							id="report-title"
							className="font-display text-2xl text-[#7a3a58] font-extrabold mt-0 mb-3"
						>
							Report message
						</h2>
						<blockquote className="m-0 mb-4 bg-white rounded-xl border-2 border-[#f5d0e8] px-3.5 py-2.5 text-[13px] break-words">
							<b className="text-[#7a3a58]">{message.name}:</b>{" "}
							{message.text}
						</blockquote>

						<p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8a5a70] mb-1.5 mt-0">
							What&apos;s wrong with it?
						</p>
						<div
							className="flex flex-wrap gap-1.5 mb-4"
							role="radiogroup"
							aria-label="Reason"
						>
							{REPORT_REASONS.map((r) => (
								<button
									key={r.id}
									type="button"
									role="radio"
									aria-checked={reason === r.id}
									onClick={() => setReason(r.id)}
									className={`px-3 py-1.5 rounded-full border-2 text-[13px] font-bold transition ${
										reason === r.id
											? "bg-[#c05090] border-[#c05090] text-white"
											: "bg-white border-[#f5d0e8] text-[#7a3a58] hover:border-[#c05090]"
									}`}
								>
									{r.label}
								</button>
							))}
						</div>

						<label
							htmlFor="report-details"
							className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8a5a70] mb-1.5"
						>
							Anything else?{" "}
							<span className="normal-case font-bold opacity-70">
								(optional)
							</span>
						</label>
						<textarea
							id="report-details"
							value={details}
							onChange={(e) => setDetails(e.target.value)}
							maxLength={REPORT_DETAILS_MAX}
							rows={3}
							className="w-full resize-none rounded-xl bg-white border-2 border-[#f5d0e8] px-3 py-2 text-[14px] font-semibold outline-none focus:border-[#c05090] transition"
						/>
						<p className="text-[11px] font-semibold text-[#9a7888] mt-1.5 mb-0 leading-snug">
							Your report includes this lobby&apos;s recent chat
							so an admin can see what happened.
						</p>

						{error && (
							<p className="text-[13px] font-bold text-[#c0303a] mt-3 mb-0">
								{error}
							</p>
						)}

						<div className="flex gap-2 mt-5">
							<button
								type="button"
								onClick={onClose}
								disabled={state === "sending"}
								className="flex-1 font-extrabold text-[14px] px-4 py-2.5 rounded-full border-2 border-[#f5d0e8] bg-white text-[#7a3a58] hover:border-[#c05090] transition disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={!reason || state === "sending"}
								className="flex-1 font-extrabold text-[14px] px-4 py-2.5 rounded-full shadow bg-[#c03060] text-white hover:brightness-105 active:translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{state === "sending"
									? "Sending…"
									: "Send report"}
							</button>
						</div>
					</form>
				))}
		</Modal>
	);
}

// DD/MM/YYYY HH:MM in the player's own timezone
function formatMuteEnd(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
