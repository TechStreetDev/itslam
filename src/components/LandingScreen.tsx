"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	BarChart3,
	Globe,
	KeyRound,
	Layers,
	LogOut,
	Plus,
	RefreshCw,
	Search,
	Swords,
	Trophy,
} from "lucide-react";
import { LobbiesPage, MAX_PLAYERS, SessionInfo } from "@/lib/types";
import { PACKS } from "@/lib/deck";
import { avatarUrl } from "@/lib/avatar";
import { discordPlayerName } from "@/lib/playerName";
import { SiteFooter } from "@/components/SiteFooter";
import { LoginButton } from "@/components/LoginButton";
import { StatsModal } from "@/components/StatsModal";
import { useAnimatedHeight } from "@/hooks/useAnimatedHeight";

type Tab = "create" | "join" | "browse";

// Few enough rows that the panel stays the same height whichever tab is open
const BROWSE_PAGE_SIZE = 5;

const TABS: { id: Tab; label: string; icon: typeof Plus }[] = [
	{ id: "create", label: "Create", icon: Plus },
	{ id: "join", label: "Join", icon: KeyRound },
	{ id: "browse", label: "Browse", icon: Globe },
];

const STEPS = [
	{
		icon: Layers,
		title: "Build your flock",
		text: "Pair Head and Butt cards into sheep. Rainbow and Painted sheep score extra.",
	},
	{
		icon: Swords,
		title: "Cause chaos",
		text: "Wheat, Wolves and coin-flip Challenges let you raid your rivals' fields.",
	},
	{
		icon: Trophy,
		title: "Count your sheep",
		text: "When the deck runs out, the player with the most points wins.",
	},
];

const panelClass =
	"bg-[#fff0f5] rounded-[22px] shadow-[0_10px_30px_rgba(90,30,60,0.25)] border-[3px] border-white";
const primaryButtonClass =
	"w-full inline-flex items-center justify-center gap-2 font-extrabold text-[15px] px-5 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.22)] bg-[#c05090] text-white hover:brightness-105 active:translate-y-px active:scale-[0.98] transition";
const inputClass =
	"w-full px-4 py-3 rounded-xl border-2 border-[#f5d0e8] bg-white text-base font-bold text-[#3d1a2c] outline-none focus:border-[#c05090] transition";
const labelClass =
	"block text-left font-extrabold text-[12px] text-[#8a5a70] mb-1.5 ml-0.5 uppercase tracking-wide";

function validateName(name: string): string | null {
	if (name.length < 3) return "Name must be at least 3 characters.";
	if (name.length >= 20) return "Name must be less than 20 characters.";
	if (!/^[a-zA-Z0-9 ]+$/.test(name))
		return "Name can only contain letters, numbers, and spaces.";
	return null;
}

// A Head and a Butt card side by side make one sheep - the whole game in a picture
function HeroSheep({ className = "" }: { className?: string }) {
	const card =
		"w-[38%] max-w-[124px] rounded-[10px] shadow-[0_10px_24px_rgba(60,20,40,0.35)]";
	return (
		<div
			className={`flex justify-center select-none pointer-events-none ${className}`}
			aria-hidden="true"
		>
			<img
				src="/assets/head/rainbow.png"
				alt=""
				className={`${card} -rotate-6 translate-x-2`}
			/>
			<img
				src="/assets/butt/rainbow.png"
				alt=""
				className={`${card} rotate-6 -translate-x-2 translate-y-3`}
			/>
		</div>
	);
}

function HowToPlay() {
	return (
		<ol className="flex flex-col gap-2">
			{STEPS.map(({ icon: Icon, title, text }) => (
				<li
					key={title}
					className="flex gap-3 items-center bg-white/85 rounded-2xl px-4 py-2.5 shadow-[0_4px_14px_rgba(60,20,40,0.15)]"
				>
					<span
						className="shrink-0 w-9 h-9 rounded-full bg-[#f5d0e8] text-[#c05090] flex items-center justify-center"
						aria-hidden="true"
					>
						<Icon size={18} strokeWidth={2.5} />
					</span>
					<div>
						<p className="font-extrabold text-[14px] text-[#3d1a2c]">
							{title}
						</p>
						<p className="text-[13px] font-semibold text-[#6a4058] leading-snug">
							{text}
						</p>
					</div>
				</li>
			))}
		</ol>
	);
}

// Top-right: who you're signed in as, or a clear way to sign in
function AccountArea({
	session,
	onStats,
}: {
	session: SessionInfo | null;
	onStats: () => void;
}) {
	if (!session?.loginEnabled) return null;
	const user = session.user;
	if (!user) return <LoginButton size="sm" />;
	return (
		<div className="flex items-center gap-1 bg-white/90 rounded-full pl-1 pr-1 py-1 shadow-[0_4px_14px_rgba(60,20,40,0.2)]">
			<img
				src={avatarUrl(user.id, user.avatar, 64)}
				alt=""
				width={28}
				height={28}
				className="rounded-full"
			/>
			<span className="font-extrabold text-[13px] text-[#3d1a2c] max-w-[140px] truncate px-1.5 hidden sm:inline">
				{user.username}
			</span>
			<button
				onClick={onStats}
				className="inline-flex items-center gap-1 text-[12px] font-extrabold text-white bg-[#c05090] rounded-full px-3 py-1.5 hover:brightness-110 transition"
			>
				<BarChart3 size={13} strokeWidth={3} />
				My stats
			</button>
			<a
				href="/auth/logout"
				title="Log out"
				aria-label="Log out"
				className="w-7 h-7 rounded-full flex items-center justify-center text-[#8a5a70] hover:bg-[#ffe0f0] hover:text-[#c05090] transition"
			>
				<LogOut size={14} strokeWidth={2.5} />
			</a>
		</div>
	);
}

export function LandingScreen({
	onCreate,
	onJoin,
	onBrowse,
	lobbiesPage,
	error,
	session,
}: {
	onCreate: (name: string) => void;
	onJoin: (name: string, code: string) => void;
	onBrowse: (opts?: {
		search?: string;
		page?: number;
		pageSize?: number;
	}) => void;
	lobbiesPage: LobbiesPage | null;
	error: string;
	session: SessionInfo | null;
}) {
	// Signed-in players play under their Discord name - the server picks it, this just shows it
	const user = session?.user ?? null;
	const discordName = user ? discordPlayerName(user.username) : null;
	const [statsOpen, setStatsOpen] = useState(false);
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [localError, setLocalError] = useState("");
	const [tab, setTab] = useState<Tab>("create");
	const [search, setSearch] = useState("");
	const [browsePage, setBrowsePage] = useState(0);
	const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	function handleNameChange(val: string) {
		setLocalError("");
		setName(val.replace(/[^a-zA-Z0-9 ]/g, ""));
	}

	// The name to play under, or null (with the reason shown) if the typed one isn't allowed
	function playerName(): string | null {
		if (discordName) return discordName;
		const trimmed = name.trim();
		const err = validateName(trimmed);
		if (err) {
			setLocalError(err);
			return null;
		}
		return trimmed;
	}

	function tryCreate() {
		const n = playerName();
		if (n) onCreate(n);
	}

	function tryJoin(lobbyCode: string) {
		if (lobbyCode.length !== 4) {
			setLocalError("Lobby codes are 4 characters.");
			return;
		}
		const n = playerName();
		if (n) onJoin(n, lobbyCode);
	}

	useEffect(() => {
		const saved = localStorage.getItem("flock_name");
		if (saved) setName(saved);
	}, []);

	// Fetch on tab open
	useEffect(() => {
		setLocalError("");
		if (tab === "browse") {
			setBrowsePage(0);
			onBrowse({ search, page: 0, pageSize: BROWSE_PAGE_SIZE });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab]);

	// Debounced search
	const handleSearchChange = useCallback(
		(value: string) => {
			setSearch(value);
			setBrowsePage(0);
			if (searchDebounceRef.current)
				clearTimeout(searchDebounceRef.current);
			searchDebounceRef.current = setTimeout(() => {
				onBrowse({
					search: value,
					page: 0,
					pageSize: BROWSE_PAGE_SIZE,
				});
			}, 300);
		},
		[onBrowse],
	);

	const goToPage = useCallback(
		(p: number) => {
			setBrowsePage(p);
			onBrowse({ search, page: p, pageSize: BROWSE_PAGE_SIZE });
		},
		[onBrowse, search],
	);

	const totalPages = lobbiesPage
		? Math.max(1, Math.ceil(lobbiesPage.total / lobbiesPage.pageSize))
		: 1;
	const shownError = localError || error;
	const body = useAnimatedHeight<HTMLDivElement>();

	return (
		<section className="min-h-dvh w-full flex flex-col">
			<header className="w-full max-w-[1040px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 pt-3">
				<span className="font-display text-[22px] font-extrabold text-white tracking-wide [text-shadow:0_2px_6px_rgba(60,20,40,0.45)]">
					ITSLAM
				</span>
				<AccountArea
					session={session}
					onStats={() => setStatsOpen(true)}
				/>
			</header>

			<div className="flex-1 w-full max-w-[1040px] mx-auto grid md:grid-cols-[1fr_400px] gap-5 md:gap-12 items-center px-4 sm:px-6 py-5">
				{/* Pitch - the steps and cards move below the play panel on phones */}
				<div className="text-center md:text-left">
					<h1 className="font-display text-[40px] sm:text-5xl lg:text-[56px] leading-[0.95] font-extrabold text-white tracking-wide [text-shadow:0_3px_10px_rgba(60,20,40,0.45)]">
						Is That Sheep
						<br />
						Looking At Me?
					</h1>

					<p className="mt-3 text-[15px] sm:text-[17px] font-bold text-white/95 [text-shadow:0_1px_4px_rgba(60,20,40,0.5)]">
						The chaotic sheep card game, online with friends.
					</p>

					<div className="mt-3 flex flex-wrap gap-1.5 justify-center md:justify-start">
						{["2-4 players", "Free", "No Download"].map((t) => (
							<span
								key={t}
								className="text-[12px] font-extrabold text-[#7a3a58] bg-white/85 rounded-full px-3 py-1"
							>
								{t}
							</span>
						))}
					</div>

					<div className="hidden md:block mt-6">
						<HeroSheep className="justify-start short:hidden" />
						<div className="mt-7 short:mt-0">
							<HowToPlay />
						</div>
					</div>
				</div>

				<div
					className={`${panelClass} p-5 sm:p-6 w-full max-w-[400px] mx-auto`}
				>
					{discordName ? (
						<div className="flex items-center gap-3 bg-white rounded-2xl border-2 border-[#f5d0e8] px-3.5 py-3">
							<img
								src={avatarUrl(user!.id, user!.avatar, 64)}
								alt=""
								width={40}
								height={40}
								className="rounded-full shrink-0"
							/>
							<div className="min-w-0 text-left">
								<p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8a5a70]">
									Playing as
								</p>
								<p className="font-extrabold text-[16px] text-[#3d1a2c] truncate">
									{discordName}
								</p>
							</div>
						</div>
					) : (
						<>
							<label className={labelClass} htmlFor="name-input">
								Your name
							</label>
							<input
								id="name-input"
								maxLength={19}
								value={name}
								onChange={(e) =>
									handleNameChange(e.target.value)
								}
								onKeyDown={(e) =>
									e.key === "Enter" &&
									tab === "create" &&
									tryCreate()
								}
								placeholder="Shepherd Sam"
								autoComplete="off"
								className={inputClass}
							/>
							{session?.loginEnabled && (
								<div className="mt-3 rounded-2xl bg-[#eef0ff] border-2 border-[#d6daff] p-2.5 pl-3.5 flex items-center gap-3 text-left">
									<p className="flex-1 text-[12px] font-bold text-[#3c437a] leading-snug">
										Log in to use your Discord name, chat and track your game history & wins.
									</p>
									<LoginButton size="sm" label="Log in" />
								</div>
							)}
						</>
					)}

					<div
						role="tablist"
						className="flex gap-1 mt-4 mb-4 bg-[#f5d0e8] p-1 rounded-xl"
					>
						{TABS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								role="tab"
								aria-selected={tab === id}
								onClick={() => setTab(id)}
								className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[13px] font-extrabold rounded-lg transition ${
									tab === id
										? "bg-white text-[#7a3a58] shadow-sm"
										: "text-[#8a5a70] hover:text-[#7a3a58]"
								}`}
							>
								<Icon size={14} strokeWidth={3} />
								{label}
							</button>
						))}
					</div>

					{/* Grows and shrinks smoothly as tabs, errors and lobby lists change. The padding
					    (cancelled by the negative margin) keeps button shadows from being clipped. */}
					<div
						style={{ height: body.height }}
						className="-mx-5 -mb-6 overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
					>
						<div ref={body.ref} className="px-5 pb-6">
							<div key={tab} className="tab-fade">
								{tab === "create" && (
									<>
										<p className="text-[13px] font-semibold text-[#8a5a70] mb-3">
											Start a lobby and share its code
											with your friends.
										</p>
										<button
											onClick={tryCreate}
											className={primaryButtonClass}
										>
											<Plus size={17} strokeWidth={3} />
											Create a lobby
										</button>
									</>
								)}

								{tab === "join" && (
									<>
										<p className="text-[13px] font-semibold text-[#8a5a70] mb-3">
											Enter the 4-letter code from your
											host.
										</p>
										<div className="flex gap-2">
											<input
												maxLength={4}
												value={code}
												onChange={(e) => {
													setLocalError("");
													setCode(
														e.target.value
															.toUpperCase()
															.replace(
																/[^A-Z0-9]/g,
																"",
															),
													);
												}}
												onKeyDown={(e) =>
													e.key === "Enter" &&
													tryJoin(code.trim())
												}
												placeholder="CODE"
												autoComplete="off"
												aria-label="Lobby code"
												className={`${inputClass} flex-1 min-w-0 uppercase tracking-[0.35em] text-center text-lg`}
											/>
											<button
												onClick={() =>
													tryJoin(code.trim())
												}
												className="shrink-0 font-extrabold text-[15px] px-6 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.22)] bg-[#c05090] text-white hover:brightness-105 active:translate-y-px active:scale-[0.98] transition"
											>
												Join
											</button>
										</div>
									</>
								)}

								{tab === "browse" && (
									<div>
										<div className="flex gap-2 mb-3">
											<div className="relative flex-1 min-w-0">
												<Search
													size={15}
													strokeWidth={2.5}
													className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b890a5] pointer-events-none"
												/>
												<input
													value={search}
													onChange={(e) =>
														handleSearchChange(
															e.target.value,
														)
													}
													placeholder="Search host or code…"
													autoComplete="off"
													className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-[#f5d0e8] bg-white text-sm font-bold text-[#3d1a2c] outline-none focus:border-[#c05090] transition"
												/>
											</div>
											<button
												onClick={() =>
													onBrowse({
														search,
														page: browsePage,
														pageSize:
															BROWSE_PAGE_SIZE,
													})
												}
												title="Refresh"
												aria-label="Refresh lobbies"
												className="shrink-0 w-10 flex items-center justify-center text-[#c05090] rounded-xl border-2 border-[#f5d0e8] bg-white hover:border-[#c05090] transition"
											>
												<RefreshCw
													size={15}
													strokeWidth={2.5}
												/>
											</button>
										</div>

										{/* Fixed height for a full page of rows, so paging and searching don't resize the panel */}
										<div className="h-[244px]">
											{lobbiesPage === null ? (
												<p className="text-[#8a5a70] font-semibold text-sm py-6 text-center">
													Loading…
												</p>
											) : lobbiesPage.entries.length ===
											  0 ? (
												<div className="py-8 text-center">
													<p className="text-[#8a5a70] font-bold text-sm">
														{lobbiesPage.total ===
															0 && !search
															? "No public lobbies open right now."
															: "No lobbies match your search."}
													</p>
													{lobbiesPage.total === 0 &&
														!search && (
															<button
																onClick={() =>
																	setTab(
																		"create",
																	)
																}
																className="mt-2 text-[13px] font-extrabold text-[#c05090] underline"
															>
																Create one
																instead
															</button>
														)}
												</div>
											) : (
												<ul className="flex flex-col gap-1.5">
													{lobbiesPage.entries.map(
														(lobby) => (
															<li
																key={lobby.code}
																className="h-[44px] bg-white rounded-xl pl-3.5 pr-1.5 border-2 border-[#f5d0e8] flex items-center gap-2"
															>
																<p className="flex-1 min-w-0 text-left flex items-center gap-1.5">
																	<span className="font-extrabold text-[#3d1a2c] text-[13px] truncate">
																		{
																			lobby.hostName
																		}
																		&rsquo;s
																		game
																	</span>
																	{lobby.packs
																		.filter(
																			(
																				id,
																			) =>
																				!PACKS[
																					id
																				]
																					.alwaysOn,
																		)
																		.map(
																			(
																				id,
																			) => (
																				<span
																					key={
																						id
																					}
																					title={
																						PACKS[
																							id
																						]
																							.name
																					}
																					className="shrink-0 max-w-[90px] truncate text-[10px] font-extrabold text-[#9a7888] bg-[#f5d0e8] rounded-full px-2 py-0.5"
																				>
																					{
																						PACKS[
																							id
																						]
																							.name
																					}
																				</span>
																			),
																		)}
																</p>
																<span
																	title={`${lobby.playerCount} of ${MAX_PLAYERS} players`}
																	className="shrink-0 text-[11px] font-extrabold text-[#8a5a70] tabular-nums"
																>
																	{
																		lobby.playerCount
																	}
																	/
																	{
																		MAX_PLAYERS
																	}
																</span>
																<button
																	onClick={() =>
																		tryJoin(
																			lobby.code,
																		)
																	}
																	className="shrink-0 font-extrabold text-[12px] px-3.5 py-1.5 rounded-full bg-[#c05090] text-white hover:brightness-105 active:scale-[0.98] transition"
																>
																	Join
																</button>
															</li>
														),
													)}
												</ul>
											)}
										</div>

										{lobbiesPage &&
											lobbiesPage.total > 0 && (
												<div className="flex items-center justify-between mt-2">
													<button
														onClick={() =>
															goToPage(
																browsePage - 1,
															)
														}
														disabled={
															browsePage === 0
														}
														className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
													>
														&larr; Prev
													</button>
													<span className="text-[11px] font-bold text-[#8a5a70]">
														{lobbiesPage.total >
														lobbiesPage.pageSize
															? `Page ${browsePage + 1} of ${totalPages} · `
															: ""}
														{lobbiesPage.total} open
													</span>
													<button
														onClick={() =>
															goToPage(
																browsePage + 1,
															)
														}
														disabled={
															browsePage >=
															totalPages - 1
														}
														className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
													>
														Next &rarr;
													</button>
												</div>
											)}
									</div>
								)}

								{shownError && (
									<p
										role="alert"
										className="text-[#c03060] font-bold mt-3 text-sm text-center"
									>
										{shownError}
									</p>
								)}
							</div>
						</div>
					</div>
				</div>

			</div>

			<div className="pb-4 px-4">
				<SiteFooter account={false} />
			</div>
			{user && (
				<StatsModal
					open={statsOpen}
					onClose={() => setStatsOpen(false)}
				/>
			)}
		</section>
	);
}
