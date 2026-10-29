"use client";

import { useEffect, useRef, useState } from "react";
import type { MuteEntry, ReportDetail, ReportStatus, ReportSummary } from "@/lib/chatModeration";
import { REPORT_REASONS } from "@/lib/types";
import {
	ErrorNote,
	Loading,
	Message,
	SectionTitle,
	UserCell,
	api,
	buttonClass,
	ghostButtonClass,
	inputClass,
	useApi,
} from "./Shared";

type StatusFilter = ReportStatus | "all";

interface ReportsPage {
	entries: ReportSummary[];
	total: number;
	page: number;
	pageSize: number;
	open: number;
}

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
	{ id: "open", label: "Open" },
	{ id: "resolved", label: "Resolved" },
	{ id: "dismissed", label: "Dismissed" },
	{ id: "all", label: "All" },
];

const MUTE_DURATIONS: { label: string; minutes: number | null }[] = [
	{ label: "1 hour", minutes: 60 },
	{ label: "24 hours", minutes: 24 * 60 },
	{ label: "7 days", minutes: 7 * 24 * 60 },
	{ label: "30 days", minutes: 30 * 24 * 60 },
	{ label: "Permanent", minutes: null },
];

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function StatusBadge({ status }: { status: ReportStatus }) {
	const style =
		status === "open"
			? "bg-[#c03060] text-white"
			: status === "resolved"
				? "bg-[#d8f0dc] text-[#2d6a3a]"
				: "bg-[#ece6e9] text-[#8a7f84]";
	return (
		<span className={`text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5 ${style}`}>
			{status}
		</span>
	);
}

export function ReportsTab({ myId, mysql }: { myId: string; mysql: boolean }) {
	const [status, setStatus] = useState<StatusFilter>("open");
	const [page, setPage] = useState(0);
	const [selected, setSelected] = useState<number | null>(null);
	const list = useApi<ReportsPage>(`/api/admin/reports?status=${status}&page=${page}`);
	const mutes = useApi<MuteEntry[]>("/api/admin/mutes");

	if (!mysql)
		return (
			<Message title="Chat reports need the database">
				Set <code>MYSQL_URL</code> and restart the server to save reports and mutes.
			</Message>
		);

	const reloadAll = () => {
		list.reload();
		mutes.reload();
	};
	const data = list.data;
	const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

	return (
		<>
			<div className="flex flex-wrap items-center gap-1.5 mb-3">
				{STATUS_FILTERS.map((f) => (
					<button
						key={f.id}
						onClick={() => {
							setStatus(f.id);
							setPage(0);
						}}
						className={`text-[12px] font-extrabold rounded-full px-3 py-1 border-2 transition ${
							status === f.id
								? "bg-[#c05090] border-[#c05090] text-white"
								: "bg-white border-[#f5d0e8] text-[#7a3a58] hover:border-[#c05090]"
						}`}
					>
						{f.label}
						{f.id === "open" && data ? ` (${data.open})` : ""}
					</button>
				))}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 items-start">
				<div>
					{list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
					{!data ? (
						<Loading />
					) : data.entries.length === 0 ? (
						<p className="text-[13px] text-[#8a5a70] font-semibold py-6 text-center">
							{status === "open" ? "No open reports - all quiet in the flock." : "No reports here."}
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{data.entries.map((r) => (
								<li key={r.id}>
									<button
										onClick={() => setSelected(r.id)}
										className={`w-full text-left bg-white rounded-xl border-2 px-3.5 py-2.5 transition ${
											selected === r.id ? "border-[#c05090]" : "border-[#f5d0e8] hover:border-[#e8a8c8]"
										}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="font-extrabold text-[13px] text-[#3d1a2c] truncate">
												{r.reported.name}
												{r.reported.username && (
													<span className="font-semibold text-[#9a7888]"> · @{r.reported.username}</span>
												)}
											</span>
											<StatusBadge status={r.status} />
										</div>
										<p className="text-[13px] text-[#4a2a3a] font-semibold truncate my-1">
											&ldquo;{r.messageText}&rdquo;
										</p>
										<p className="text-[11px] text-[#9a7888] font-bold m-0">
											{reasonLabel(r.reason)} · reported by {r.reporterName} · {fmtDate(r.createdAt)}
										</p>
									</button>
								</li>
							))}
						</ul>
					)}
					{data && pages > 1 && (
						<div className="flex items-center justify-center gap-2 mt-3 text-[12px] font-bold text-[#8a5a70]">
							<button className={ghostButtonClass} disabled={page === 0} onClick={() => setPage(page - 1)}>
								Previous
							</button>
							Page {page + 1} of {pages}
							<button className={ghostButtonClass} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
								Next
							</button>
						</div>
					)}
				</div>

				<div className="lg:sticky lg:top-4">
					{selected === null ? (
						<p className="text-[13px] text-[#8a5a70] font-semibold py-6 text-center bg-white/50 rounded-xl border-2 border-dashed border-[#f5d0e8]">
							Pick a report to review it.
						</p>
					) : (
						<ReportPanel key={selected} id={selected} myId={myId} onChanged={reloadAll} />
					)}
				</div>
			</div>

			<SectionTitle>Muted players</SectionTitle>
			<MutesList mutes={mutes} myId={myId} />
		</>
	);
}

function ReportPanel({ id, myId, onChanged }: { id: number; myId: string; onChanged: () => void }) {
	const detail = useApi<ReportDetail>(`/api/admin/reports/${id}`);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const transcriptRef = useRef<HTMLDivElement>(null);
	const loaded = !!detail.data;
	// Centre the reported message in the transcript once it loads - only that box scrolls, not the page
	useEffect(() => {
		const box = transcriptRef.current;
		const target = box?.querySelector<HTMLElement>("[data-reported]");
		if (box && target) box.scrollTop = target.offsetTop - box.clientHeight / 2 + target.offsetHeight / 2;
	}, [loaded]);

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await fn();
			detail.reload();
			onChanged();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	if (detail.error) return <ErrorNote error={detail.error} onRetry={detail.reload} />;
	const r = detail.data;
	if (!r) return <Loading />;
	const setStatus = (status: ReportStatus) =>
		run(() => api(`/api/admin/reports/${id}`, { method: "POST", body: { status, note } }));

	return (
		<div className="bg-white rounded-xl border-2 border-[#f5d0e8] p-4 text-[13px] text-[#3d1a2c]">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-extrabold text-[15px] m-0">{reasonLabel(r.reason)}</p>
					<p className="text-[11px] text-[#9a7888] font-bold m-0">
						Report #{r.id} · {fmtDate(r.createdAt)} · lobby {r.lobbyCode}
					</p>
				</div>
				<StatusBadge status={r.status} />
			</div>

			<div className="grid grid-cols-2 gap-3 mt-3">
				<div>
					<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70] m-0 mb-1">Reported</p>
					<UserCell user={{ ...r.reported, username: r.reported.username ?? r.reported.name }} />
					<p className="text-[11px] font-bold text-[#9a7888] m-0 mt-1">
						Plays as &ldquo;{r.reported.name}&rdquo; ·{" "}
						<span className={r.reportsAgainst > 1 ? "text-[#c03060]" : ""}>
							{r.reportsAgainst} report{r.reportsAgainst === 1 ? "" : "s"} total
						</span>
					</p>
				</div>
				<div>
					<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70] m-0 mb-1">Reported by</p>
					<p className="font-bold m-0">{r.reporterName}</p>
					<p className="text-[11px] font-bold text-[#9a7888] m-0 tabular-nums">
						{r.reporterDiscordId ?? "Not signed in"}
					</p>
				</div>
			</div>

			{r.details && (
				<blockquote className="m-0 mt-3 bg-[#fff6fa] rounded-lg border-l-4 border-[#e8a8c8] px-3 py-2 whitespace-pre-wrap break-words">
					{r.details}
				</blockquote>
			)}

			<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70] mt-4 mb-1">
				Chat at the time ({r.context.length} message{r.context.length === 1 ? "" : "s"})
			</p>
			<div
				ref={transcriptRef}
				className="relative max-h-[300px] overflow-y-auto rounded-lg border-2 border-[#f5d0e8] bg-[#fffafc] px-3 py-2 flex flex-col gap-1"
			>
				{r.context.map((m) => {
					const reported = m.id === r.messageId;
					const sameUser = !!m.discordId && m.discordId === r.reported.id;
					return (
						<p
							key={m.id}
							data-reported={reported || undefined}
							title={m.discordId ? `${m.discordName ?? ""} (${m.discordId})` : "Quick response"}
							className={`m-0 leading-snug break-words rounded px-1 ${
								reported ? "bg-[#ffd6e6] ring-2 ring-[#c03060]" : ""
							} ${m.quick ? "italic text-[#9a7888]" : ""}`}
						>
							<span className="text-[10px] text-[#9a7888] tabular-nums mr-1.5">
								{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
							</span>
							<b className={sameUser ? "text-[#c03060]" : "text-[#7a3a58]"}>{m.name}:</b> {m.text}
						</p>
					);
				})}
			</div>

			<MuteControls
				discordId={r.reported.id}
				username={r.reported.username ?? r.reported.name}
				mute={r.mute}
				myId={myId}
				onDone={() => {
					detail.reload();
					onChanged();
				}}
			/>

			<div className="mt-4 pt-3 border-t-2 border-[#f5d0e8]">
				{r.status === "open" ? (
					<>
						<input
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={500}
							placeholder="Note (optional) - what you did and why"
							className={`${inputClass} w-full`}
						/>
						<div className="flex gap-2 mt-2">
							<button className={buttonClass} disabled={busy} onClick={() => setStatus("resolved")}>
								Resolve
							</button>
							<button className={ghostButtonClass} disabled={busy} onClick={() => setStatus("dismissed")}>
								Dismiss
							</button>
						</div>
					</>
				) : (
					<div className="flex items-start justify-between gap-2">
						<p className="m-0 text-[12px] font-semibold text-[#8a5a70]">
							{r.status === "resolved" ? "Resolved" : "Dismissed"}
							{r.resolvedBy && ` by ${r.resolvedBy.username ?? r.resolvedBy.id}`}
							{r.resolvedAt && ` · ${fmtDate(r.resolvedAt)}`}
							{r.resolutionNote && (
								<span className="block text-[#3d1a2c] mt-0.5">&ldquo;{r.resolutionNote}&rdquo;</span>
							)}
						</p>
						<button className={ghostButtonClass} disabled={busy} onClick={() => setStatus("open")}>
							Reopen
						</button>
					</div>
				)}
			</div>
			{error && <ErrorNote error={error} />}
		</div>
	);
}

function MuteControls({
	discordId,
	username,
	mute,
	myId,
	onDone,
}: {
	discordId: string;
	username: string;
	mute: MuteEntry | null;
	myId: string;
	onDone: () => void;
}) {
	const [duration, setDuration] = useState(1);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setError(null);
		try {
			await fn();
			onDone();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mt-4 bg-[#fff6fa] rounded-lg border-2 border-[#f5d0e8] p-3">
			<p className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70] m-0 mb-1.5">Chat mute</p>
			{mute && (
				<div className="flex items-center justify-between gap-2 mb-2">
					<p className="m-0 font-bold text-[#a04060]">
						Muted {mute.until ? `until ${fmtDate(mute.until)}` : "permanently"}
						{mute.reason && <span className="font-semibold text-[#8a5a70]"> · {mute.reason}</span>}
					</p>
					<button
						className={ghostButtonClass}
						disabled={busy}
						onClick={() => run(() => api(`/api/admin/mutes/${discordId}`, { method: "DELETE" }))}
					>
						Unmute
					</button>
				</div>
			)}
			{discordId === myId ? (
				<p className="m-0 text-[12px] font-semibold text-[#9a7888]">That&rsquo;s you.</p>
			) : (
				<form
					className="flex flex-wrap items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const d = MUTE_DURATIONS[duration];
						if (d.minutes === null && !confirm(`Permanently mute ${username} from typed chat?`)) return;
						run(() =>
							api(`/api/admin/mutes/${discordId}`, {
								method: "PUT",
								body: { minutes: d.minutes, reason, username },
							}),
						);
					}}
				>
					<select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
						{MUTE_DURATIONS.map((d, i) => (
							<option key={d.label} value={i}>
								{d.label}
							</option>
						))}
					</select>
					<input
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						maxLength={500}
						placeholder="Reason (optional)"
						className={`${inputClass} flex-1 min-w-[140px]`}
					/>
					<button className={buttonClass} disabled={busy}>
						{mute ? "Change mute" : "Mute"}
					</button>
				</form>
			)}
			<p className="m-0 mt-1.5 text-[11px] font-semibold text-[#9a7888]">
				Muted players can still send quick responses.
			</p>
			{error && <ErrorNote error={error} />}
		</div>
	);
}

function MutesList({ mutes, myId }: { mutes: ReturnType<typeof useApi<MuteEntry[]>>; myId: string }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (mutes.error) return <ErrorNote error={mutes.error} onRetry={mutes.reload} />;
	if (!mutes.data) return <Loading />;
	if (mutes.data.length === 0)
		return <p className="text-[13px] text-[#8a5a70] font-semibold">Nobody is muted.</p>;

	return (
		<>
			{error && <ErrorNote error={error} />}
			<div className="overflow-x-auto bg-white rounded-xl border-2 border-[#f5d0e8]">
				<table className="w-full text-[13px] text-left">
					<thead className="text-[11px] uppercase tracking-wide text-[#8a5a70]">
						<tr>
							{["Player", "Until", "Reason", "Muted by", ""].map((h) => (
								<th key={h} className="px-3 py-2 font-extrabold">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="text-[#3d1a2c] font-semibold">
						{mutes.data.map((m) => (
							<tr key={m.user.id} className="border-t border-[#f5d0e8]">
								<td className="px-3 py-2">
									<UserCell user={m.user} />
								</td>
								<td className="px-3 py-2 whitespace-nowrap">{m.until ? fmtDate(m.until) : "Permanent"}</td>
								<td className="px-3 py-2">{m.reason ?? "-"}</td>
								<td className="px-3 py-2">
									<UserCell user={m.mutedBy} you={m.mutedBy.id === myId} />
								</td>
								<td className="px-3 py-2 text-right">
									<button
										className="text-[12px] font-extrabold text-[#c05090] underline disabled:opacity-40"
										disabled={busy}
										onClick={async () => {
											setBusy(true);
											setError(null);
											try {
												await api(`/api/admin/mutes/${m.user.id}`, { method: "DELETE" });
												mutes.reload();
											} catch (e) {
												setError((e as Error).message);
											} finally {
												setBusy(false);
											}
										}}
									>
										Unmute
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
