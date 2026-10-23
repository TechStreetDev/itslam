"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LobbiesPage } from "@/lib/types";
import { PACKS } from "@/lib/deck";
import { SiteFooter } from "@/components/SiteFooter";

type Tab = "create" | "join" | "browse";

function validateName(name: string): string | null {
	if (name.length < 3) return "Name must be at least 3 characters.";
	if (name.length >= 20) return "Name must be less than 20 characters.";
	if (!/^[a-zA-Z0-9 ]+$/.test(name))
		return "Name can only contain letters, numbers, and spaces.";
	return null;
}

export function LandingScreen({
	onCreate,
	onJoin,
	onBrowse,
	lobbiesPage,
	error,
}: {
	onCreate: (name: string) => void;
	onJoin: (name: string, code: string) => void;
	onBrowse: (opts?: { search?: string; page?: number }) => void;
	lobbiesPage: LobbiesPage | null;
	error: string;
}) {
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

	function tryCreate() {
		const trimmed = name.trim();
		const err = validateName(trimmed);
		if (err) {
			setLocalError(err);
			return;
		}
		onCreate(trimmed);
	}

	function tryJoin(lobbyCode: string) {
		const trimmed = name.trim();
		const err = validateName(trimmed);
		if (err) {
			setLocalError(err);
			return;
		}
		onJoin(trimmed, lobbyCode);
	}

	useEffect(() => {
		const saved = localStorage.getItem("flock_name");
		if (saved) setName(saved);
	}, []);

	// Fetch on tab open
	useEffect(() => {
		if (tab === "browse") {
			setBrowsePage(0);
			onBrowse({ search, page: 0 });
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
				onBrowse({ search: value, page: 0 });
			}, 300);
		},
		[onBrowse],
	);

	const goToPage = useCallback(
		(p: number) => {
			setBrowsePage(p);
			onBrowse({ search, page: p });
		},
		[onBrowse, search],
	);

	const totalPages = lobbiesPage
		? Math.max(1, Math.ceil(lobbiesPage.total / lobbiesPage.pageSize))
		: 1;

	return (
		<section className="min-h-screen w-full flex flex-col items-center justify-center p-6">
			<div className="bg-[#fff0f5] rounded-[22px] shadow-[0_6px_18px_rgba(130,50,90,0.18)] p-9 max-w-[420px] w-full text-center border-[3px] border-white">
				<div className="mb-4">
					<h1 className="font-display text-4xl mt-1 text-[#7a3a58] tracking-wide font-extrabold">
						ITSLAM
					</h1>
					<p className="text-[#8a5a70] font-bold italic mt-0.5">
						is that sheep... looking at me?
					</p>
					<p className="text-[#a06080] text-[12px] font-semibold mt-2 leading-snug">
						An online adaptation of the card game by{" "}
						<a
							href="https://www.youtube.com/@Zedaph"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-[#c05090] transition"
						>
							Zedaph
						</a>
					</p>
					<p className="text-[#a06080] text-[12px] font-semibold mt-0.5 leading-snug">
						Questions, bugs or feedback?{" "}
						<a
							href="https://discord.gg/SwtaMCV4BE"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-[#c05090] transition"
						>
							Join our Discord
						</a>
					</p>
				</div>

				<div className="bg-white rounded-xl border-2 border-[#f5d0e8] px-4 py-3 mb-4 text-left text-[12px] text-[#5a3048] leading-relaxed font-medium">
					<p className="mb-2">
						Build a <span className="font-extrabold text-[#c05090]">flock of sheep</span> by
						pairing Head &amp; Butt cards. Earn bonus points for Rainbow and Painted sheep,
						and unleash chaos with <span className="font-extrabold">Wheat</span>,{" "}
						<span className="font-extrabold">Wolf</span>, and coin-flip{" "}
						<span className="font-extrabold">Challenges</span>. The shepherd with the most
						points when the deck runs out wins!
					</p>
					<p className="text-[11px] text-[#9a6080]">
						2&ndash;4 players &middot; real-time multiplayer &middot; no install needed
					</p>
				</div>

				<label
					className="block text-left font-extrabold text-[13px] text-[#8a5a70] mt-4 mb-1.5 ml-0.5 uppercase tracking-wide"
					htmlFor="name-input"
				>
					Your name
				</label>
				<input
					id="name-input"
					maxLength={19}
					value={name}
					onChange={(e) => handleNameChange(e.target.value)}
					placeholder="Shepherd Sam"
					autoComplete="off"
					className="w-full px-4 py-3 rounded-xl border-2 border-[#f5d0e8] bg-white text-base font-bold text-[#3d1a2c] outline-none focus:border-[#c05090]"
				/>

				<div className="flex gap-1.5 mt-4 mb-4 bg-[#f5d0e8] p-1 rounded-xl">
					{(["create", "join", "browse"] as Tab[]).map((t) => (
						<button
							key={t}
							onClick={() => setTab(t)}
							className={`flex-1 py-2 text-[13px] font-extrabold rounded-lg capitalize transition ${
								tab === t
									? "bg-white text-[#7a3a58] shadow-sm"
									: "text-[#8a5a70] hover:text-[#7a3a58]"
							}`}
						>
							{t}
						</button>
					))}
				</div>

				{tab === "create" && (
					<button
						onClick={tryCreate}
						className="w-full font-extrabold text-[15px] px-5 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.18)] bg-[#c05090] text-white hover:brightness-105 active:translate-y-px active:scale-[0.98] transition"
					>
						Create a lobby
					</button>
				)}

				{tab === "join" && (
					<div className="flex gap-2">
						<input
							maxLength={4}
							value={code}
							onChange={(e) =>
								setCode(e.target.value.toUpperCase())
							}
							onKeyDown={(e) =>
								e.key === "Enter" && tryJoin(code.trim())
							}
							placeholder="CODE"
							autoComplete="off"
							className="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-[#f5d0e8] bg-white text-base font-bold text-[#3d1a2c] uppercase tracking-[0.3em] text-center outline-none focus:border-[#c05090]"
						/>
						<button
							onClick={() => tryJoin(code.trim())}
							className="font-extrabold text-[15px] px-5 py-3 rounded-full shadow-[0_6px_18px_rgba(130,50,90,0.18)] bg-[#e0609a] text-[#4a1a38] hover:brightness-105 active:translate-y-px active:scale-[0.98] transition"
						>
							Join
						</button>
					</div>
				)}

				{tab === "browse" && (
					<div>
						<div className="flex gap-2 mb-3">
							<input
								value={search}
								onChange={(e) =>
									handleSearchChange(e.target.value)
								}
								placeholder="Search by host name or code…"
								autoComplete="off"
								className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-[#f5d0e8] bg-white text-sm font-bold text-[#3d1a2c] outline-none focus:border-[#c05090]"
							/>
							<button
								onClick={() =>
									onBrowse({ search, page: browsePage })
								}
								className="text-[12px] font-extrabold text-[#c05090] px-3 py-2 rounded-xl border-2 border-[#f5d0e8] bg-white hover:border-[#c05090] transition"
							>
								Refresh
							</button>
						</div>

						{lobbiesPage === null ? (
							<p className="text-[#8a5a70] font-semibold text-sm py-6">
								Loading…
							</p>
						) : lobbiesPage.entries.length === 0 ? (
							<p className="text-[#8a5a70] font-semibold text-sm py-6">
								{lobbiesPage.total === 0 && !search
									? "No public lobbies open right now."
									: "No lobbies match your search."}
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{lobbiesPage.entries.map((lobby) => (
									<li
										key={lobby.code}
										className="bg-white rounded-xl px-4 py-3 border-2 border-[#f5d0e8] flex items-center justify-between"
									>
										<div className="text-left">
											<p className="font-extrabold text-[#3d1a2c] text-sm flex items-center gap-1.5 flex-wrap">
												{lobby.hostName}&rsquo;s game
												{lobby.packs
													.filter((id) => !PACKS[id].alwaysOn)
													.map((id) => (
														<span
															key={id}
															className="text-[11px] font-extrabold text-[#9a7888] bg-[#f5d0e8] rounded-full px-2 py-0.5"
														>
															{PACKS[id].name}
														</span>
													))}
											</p>
											<p className="text-[#8a5a70] text-xs font-bold">
												{lobby.playerCount}/4 players
												&middot; {lobby.code}
											</p>
										</div>
										<button
											onClick={() => tryJoin(lobby.code)}
											className="font-extrabold text-[13px] px-4 py-2 rounded-full bg-[#c05090] text-white hover:brightness-105 active:scale-[0.98] transition"
										>
											Join
										</button>
									</li>
								))}
							</ul>
						)}

						{lobbiesPage && lobbiesPage.total > 0 && (
							<div className="flex items-center justify-between mt-3">
								<button
									onClick={() => goToPage(browsePage - 1)}
									disabled={browsePage === 0}
									className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
								>
									&larr; Prev
								</button>
								<span className="text-[11px] font-bold text-[#8a5a70]">
									{browsePage + 1} / {totalPages} &middot;{" "}
									{lobbiesPage.total} open
								</span>
								<button
									onClick={() => goToPage(browsePage + 1)}
									disabled={browsePage >= totalPages - 1}
									className="text-[12px] font-extrabold text-[#8a5a70] disabled:opacity-30 hover:text-[#c05090] transition"
								>
									Next &rarr;
								</button>
							</div>
						)}
					</div>
				)}

				<p className="text-[#c03060] font-bold min-h-[1.2em] mt-3 text-sm">
					{localError || error}
				</p>
			</div>
			<SiteFooter />
		</section>
	);
}
