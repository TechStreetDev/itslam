"use client";

import { useEffect, useRef, useState } from "react";
import type { RoleEntry } from "@/lib/roles";
import { ROLES, ROLE_META, Role } from "@/lib/roleDefs";
import { GamesTab } from "./GamesTab";
import { AddRoleForm, RoleBadge, RoleEditor, RoleLegend } from "./Roles";
import {
	ErrorNote,
	Loading,
	Select,
	Stat,
	StatGrid,
	UserCell,
	ghostButtonClass,
	inputClass,
	n,
	pct,
	useApi,
} from "./Shared";

type Row = Record<string, any>;

const SORTS = [
	{ value: "recent", label: "Last logged in" },
	{ value: "last_game", label: "Last played" },
	{ value: "games", label: "Most games" },
	{ value: "wins", label: "Most wins" },
	{ value: "win_rate", label: "Win rate" },
	{ value: "best_score", label: "Best score" },
	{ value: "name", label: "Name" },
] as const;

const ROLE_FILTERS = [
	{ value: "", label: "Everyone" },
	{ value: "any", label: "Any role" },
	...ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : `${ROLE_META[r].label} or higher` })),
];

const fmtDate = (s: string | null) =>
	s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-";

// Everyone who has ever logged in with Discord, plus anyone given a role, with their roles.
// Stats count finished games only, the same as the player's own "My stats".
export function PlayersTab({ canManage, myId }: { canManage: boolean; myId: string }) {
	const [selected, setSelected] = useState<string | null>(null);
	const [role, setRole] = useState("");
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("recent");
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(debounce.current), []);
	const pageSize = 25;
	const list = useApi<{ total: number; rows: Row[] }>(
		`/api/admin/players?${new URLSearchParams({ page: String(page), sort, search, role })}`,
	);

	if (selected)
		return (
			<PlayerDetail
				id={selected}
				myId={myId}
				canManage={canManage}
				onBack={() => {
					setSelected(null);
					list.reload();
				}}
			/>
		);

	const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;
	return (
		<>
			{canManage && (
				<div className="mb-3 flex flex-col gap-2">
					<AddRoleForm onAdded={list.reload} />
					<details className="px-1">
						<summary className="text-[12px] font-extrabold text-[#8a5a70] cursor-pointer">What each role can do</summary>
						<div className="mt-1">
							<RoleLegend />
						</div>
					</details>
				</div>
			)}
			<div className="flex flex-wrap items-end justify-between gap-2 mb-2">
				<p className="text-[13px] font-semibold text-[#8a5a70]">
					{list.data ? `${list.data.total.toLocaleString()} ${role ? "matching players" : "players"}` : ""}
				</p>
				<div className="flex items-end gap-2">
					<input
						value={searchInput}
						onChange={(e) => {
							const v = e.target.value;
							setSearchInput(v);
							clearTimeout(debounce.current);
							debounce.current = setTimeout(() => (setSearch(v), setPage(0)), 300);
						}}
						placeholder="Name or Discord ID…"
						className={inputClass}
					/>
					<Select label="Role" value={role} onChange={(v) => (setRole(v), setPage(0))} options={ROLE_FILTERS} />
					<Select label="Sort" value={sort} onChange={(v) => (setSort(v), setPage(0))} options={[...SORTS]} />
				</div>
			</div>
			{list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
			{!list.data ? (
				<Loading />
			) : list.data.rows.length === 0 ? (
				<p className="text-[13px] font-semibold text-[#8a5a70] py-6">
					{search || role ? "No players match." : "Nobody has logged in yet."}
				</p>
			) : (
				<div className="overflow-x-auto bg-white rounded-xl border-2 border-[#f5d0e8]">
					<table className="w-full text-[13px] text-left">
						<thead className="text-[11px] uppercase tracking-wide text-[#8a5a70]">
							<tr>
								{["Player", "Role", "Games played", "Games won", "Win rate", "Best score", "Last played", "Last logged in"].map((h) => (
									<th key={h} className="px-3 py-2 font-extrabold whitespace-nowrap">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="text-[#3d1a2c] font-semibold">
							{list.data.rows.map((p) => (
								<tr
									key={p.discord_id}
									onClick={() => setSelected(p.discord_id)}
									className="border-t border-[#f5d0e8] cursor-pointer hover:bg-[#fff6fa]"
								>
									<td className="px-3 py-2">
										<UserCell user={{ id: p.discord_id, username: p.username, avatar: p.avatar }} you={p.discord_id === myId} />
									</td>
									<td className="px-3 py-2">
										<RoleBadge roles={p.roles as Role[]} />
									</td>
									<td className="px-3 py-2 tabular-nums">{n(p.games)}</td>
									<td className="px-3 py-2 tabular-nums">{n(p.wins)}</td>
									<td className="px-3 py-2 tabular-nums">{pct(p.win_rate)}</td>
									<td className="px-3 py-2 tabular-nums">{p.best_score ?? "-"}</td>
									<td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.last_game)}</td>
									<td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.last_login_at)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{list.data && list.data.total > pageSize && (
				<div className="flex items-center justify-between mt-3">
					<button className={ghostButtonClass} disabled={page === 0} onClick={() => setPage(page - 1)}>
						&larr; Prev
					</button>
					<span className="text-[12px] font-bold text-[#8a5a70]">
						Page {page + 1} / {totalPages}
					</span>
					<button className={ghostButtonClass} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
						Next &rarr;
					</button>
				</div>
			)}
		</>
	);
}

function PlayerDetail({
	id,
	myId,
	canManage,
	onBack,
}: {
	id: string;
	myId: string;
	canManage: boolean;
	onBack: () => void;
}) {
	const state = useApi<{
		user: Row;
		stats: { games: number; wins: number; bestScore: number | null };
		role: RoleEntry | null;
	}>(
		`/api/admin/players/${id}`,
	);

	return (
		<>
			<div className="mb-3">
				<button className={ghostButtonClass} onClick={onBack}>
					&larr; All players
				</button>
			</div>
			{state.error && <ErrorNote error={state.error} onRetry={state.reload} />}
			{!state.data ? (
				!state.error && <Loading />
			) : (
				<>
					<div className="flex flex-wrap items-center justify-between gap-2 mb-3">
						<div className="text-[15px] font-extrabold text-[#3d1a2c]">
							<UserCell user={{ id, username: state.data.user.username, avatar: state.data.user.avatar }} you={id === myId} />
						</div>
						<p className="text-[12px] text-[#8a5a70] font-semibold">
							{state.data.user.first_login_at
								? `First logged in ${fmtDate(state.data.user.first_login_at)} · last ${fmtDate(state.data.user.last_login_at)}`
								: state.data.user.last_login_at
									? `Last logged in ${fmtDate(state.data.user.last_login_at)}`
									: "Hasn't logged in yet"}
						</p>
					</div>
					<div className="mb-3">
						<RoleEditor
							id={id}
							name={state.data.user.username ?? id}
							entry={state.data.role}
							myId={myId}
							canManage={canManage}
							onChanged={state.reload}
						/>
					</div>
					<StatGrid>
						<Stat label="Games played" value={state.data.stats.games} info="Finished games played while logged in." />
						<Stat label="Games won" value={state.data.stats.wins} />
						<Stat
							label="Win rate"
							value={state.data.stats.games ? pct(state.data.stats.wins / state.data.stats.games) : "-"}
							info="Games won ÷ games played."
						/>
						<Stat label="Best score" value={state.data.stats.bestScore ?? "-"} info="Highest final score in a finished game." />
					</StatGrid>
					<h3 className="font-extrabold text-[15px] text-[#7a3a58] mt-5 mb-2">Their games</h3>
					{/* Every game they were logged in for, finished or not - click one for the full breakdown */}
					<GamesTab filters={{ status: "all", player: id }} canManage={canManage} />
				</>
			)}
		</>
	);
}
