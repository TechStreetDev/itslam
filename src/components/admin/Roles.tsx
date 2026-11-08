"use client";

import { useState } from "react";
import type { RoleEntry } from "@/lib/roles";
import { ROLES, ROLE_META, Role } from "@/lib/roleDefs";
import { ErrorNote, api, avatarUrl, buttonClass, inputClass } from "./Shared";

// Role pieces used by the Players tab: badges for the list, an editor for one player,
// and a form to give a role to someone by Discord ID.

// Roles are levels - each includes every role below it, so a player's roles are just
// their highest one (-1 for none)
const top = (roles: Role[]) => Math.max(-1, ...roles.map((r) => ROLES.indexOf(r)));

// Pick a role level. The chosen level is filled in and the levels it includes are tinted.
function RolePicker({
	level,
	onChange,
	allowNone,
	disabled,
	title,
}: {
	level: number;
	onChange: (level: number) => void;
	allowNone?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	const options = [
		...(allowNone ? [{ i: -1, label: "None", desc: "No role" }] : []),
		...ROLES.map((r, i) => ({ i, label: ROLE_META[r].label, desc: ROLE_META[r].desc })),
	];
	return (
		<div
			role="radiogroup"
			aria-label="Role"
			title={title}
			className={`flex gap-1 bg-[#fbeaf3] rounded-lg p-1 ${disabled ? "opacity-80" : ""}`}
		>
			{options.map((o) => {
				const chosen = o.i === level;
				const included = o.i >= 0 && o.i < level;
				return (
					<button
						key={o.i}
						type="button"
						role="radio"
						aria-checked={chosen}
						disabled={disabled}
						title={o.desc}
						onClick={() => onChange(o.i)}
						className={`px-2.5 py-1 rounded-md text-[12px] font-extrabold transition disabled:cursor-default ${
							chosen
								? "bg-[#c05090] text-white shadow-sm"
								: included
									? "bg-[#f5d0e8] text-[#7a3a58]"
									: "text-[#9a7888] enabled:hover:text-[#7a3a58] enabled:hover:bg-white"
						}`}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

// Just their highest role - lower ones are implied
export function RoleBadge({ roles }: { roles: Role[] }) {
	const i = top(roles);
	if (i < 0) return <span className="text-[#c8b0bd]">-</span>;
	return (
		<span
			title={ROLE_META[ROLES[i]].desc}
			className="text-[11px] font-extrabold rounded-full px-2.5 py-0.5 bg-[#c05090] text-white whitespace-nowrap"
		>
			{ROLE_META[ROLES[i]].label}
		</span>
	);
}

export function RoleLegend() {
	return (
		<ul className="text-[12px] text-[#8a5a70] font-semibold flex flex-col gap-0.5">
			{ROLES.map((r) => (
				<li key={r}>
					<span className="font-extrabold">{ROLE_META[r].label}</span> - {ROLE_META[r].desc}
				</li>
			))}
		</ul>
	);
}

const putRoles = (id: string, roles: Role[]) => api(`/api/admin/roles/${id}`, { method: "PUT", body: { roles } });

// Gives roles to someone by Discord ID - for people who haven't logged in yet
export function AddRoleForm({ onAdded }: { onAdded: () => void }) {
	const [discordId, setDiscordId] = useState("");
	const [level, setLevel] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	return (
		<form
			className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 flex flex-col gap-2"
			onSubmit={async (e) => {
				e.preventDefault();
				setBusy(true);
				setError(null);
				try {
					await putRoles(discordId, ROLES.slice(0, level + 1));
					setDiscordId("");
					onAdded();
				} catch (err) {
					setError((err as Error).message);
				} finally {
					setBusy(false);
				}
			}}
		>
			<div className="flex flex-wrap items-end gap-2">
				<label className="flex flex-col gap-0.5">
					<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">Give a role by Discord user ID</span>
					<input
						value={discordId}
						onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ""))}
						placeholder="123456789012345678"
						className={inputClass}
						required
					/>
				</label>
				<RolePicker level={level} onChange={setLevel} />
				<button className={buttonClass} disabled={busy || !discordId}>
					Add
				</button>
			</div>
			<p className="text-[11px] text-[#9a7888] font-semibold">
				Or open a player below to change their roles. To find someone&rsquo;s ID: Discord → Settings → Advanced →
				Developer Mode, then right-click them → Copy User ID.
			</p>
			{error && <ErrorNote error={error} />}
		</form>
	);
}

// One player's roles, as a level picker: None → Playtester → … → Admin. The chosen level is
// filled in, the levels it includes are tinted. Admins can change it; everyone else just sees it.
export function RoleEditor({
	id,
	name,
	entry,
	myId,
	canManage,
	onChanged,
}: {
	id: string;
	name: string;
	entry: RoleEntry | null;
	myId: string;
	canManage: boolean;
	onChanged: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const roles = entry?.roles ?? [];
	const level = top(roles);
	const me = id === myId;
	// Admins set by the system, and you, can't lose the admin role
	const lock = roles.includes("admin")
		? entry?.fromEnv
			? "Set by the system (ADMIN_DISCORD_IDS)"
			: me
				? "You can't remove your own admin role"
				: null
		: null;
	const editable = canManage && !lock && !busy;

	async function choose(i: number) {
		if (i === level) return;
		if (i < 0 && !confirm(`Remove all of ${name}'s roles?`)) return;
		setBusy(true);
		setError(null);
		try {
			if (i < 0) await api(`/api/admin/roles/${id}`, { method: "DELETE" });
			else await putRoles(id, ROLES.slice(0, i + 1));
			onChanged();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	const addedAt = entry?.createdAt
		? new Date(entry.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })
		: null;

	return (
		<section className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<h3 className="font-extrabold text-[14px] text-[#3d1a2c]">Role</h3>
				<RolePicker level={level} onChange={choose} allowNone disabled={!editable} title={lock ?? undefined} />
			</div>
			<p className="text-[12px] text-[#8a5a70] font-semibold mt-2 flex flex-wrap items-center gap-x-1">
				<span>{level >= 0 ? ROLE_META[ROLES[level]].desc : "A regular player."}</span>
				{lock ? (
					<span className="text-[#9a7888]">· {lock}.</span>
				) : (
					entry && (
						<span className="text-[#9a7888] inline-flex items-center gap-1">
							· Given{addedAt && ` ${addedAt}`}
							{entry.addedBy && (
								<>
									{" "}by
									<img src={avatarUrl(entry.addedBy.id, entry.addedBy.avatar)} alt="" width={16} height={16} className="rounded-full" />
									<span className="text-[#7a3a58]">
										{entry.addedBy.id === myId ? "you" : (entry.addedBy.username ?? entry.addedBy.id)}
									</span>
								</>
							)}
						</span>
					)
				)}
			</p>
			{error && (
				<div className="mt-2">
					<ErrorNote error={error} />
				</div>
			)}
		</section>
	);
}
