"use client";

import { useState } from "react";
import type { RoleEntry } from "@/lib/roles";
import { ROLES, ROLE_META, Role } from "@/lib/roleDefs";
import { ErrorNote, Loading, UserCell, api, buttonClass, inputClass, useApi } from "./Shared";

function RolePill({
	role,
	on,
	disabled,
	title,
	onClick,
}: {
	role: Role;
	on: boolean;
	disabled?: boolean;
	title?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={on}
			title={title ?? ROLE_META[role].desc}
			className={`text-[11px] font-extrabold rounded-full px-2.5 py-0.5 border transition disabled:cursor-not-allowed ${
				on
					? "bg-[#c05090] text-white border-[#c05090] disabled:opacity-70"
					: "bg-white text-[#9a7888] border-[#f5d0e8] hover:border-[#c05090] disabled:opacity-50"
			}`}
		>
			{ROLE_META[role].label}
		</button>
	);
}

export function RolesTab({ myId, mysql }: { myId: string; mysql: boolean }) {
	const list = useApi<RoleEntry[]>("/api/admin/roles");
	const [discordId, setDiscordId] = useState("");
	const [newRoles, setNewRoles] = useState<Role[]>(["playtester"]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function mutate(fn: () => Promise<RoleEntry[]>) {
		setBusy(true);
		setError(null);
		try {
			await fn();
			list.reload();
			return true;
		} catch (e) {
			setError((e as Error).message);
			return false;
		} finally {
			setBusy(false);
		}
	}

	const putRoles = (id: string, roles: Role[]) =>
		mutate(() => api(`/api/admin/roles/${id}`, { method: "PUT", body: { roles } }));

	// Roles are levels: clicking the highest role steps down one, clicking any
	// other role makes it their highest. Roles below the highest are always included.
	const top = (roles: Role[]) => Math.max(-1, ...roles.map((r) => ROLES.indexOf(r)));
	const clickRole = (roles: Role[], role: Role): Role[] => {
		const i = ROLES.indexOf(role);
		return ROLES.slice(0, i === top(roles) ? i : i + 1);
	};
	const clickTitle = (roles: Role[], role: Role) =>
		ROLES.indexOf(role) < top(roles) ? `Make ${ROLE_META[role].label} their highest role` : undefined;

	return (
		<>
			<ul className="text-[12px] text-[#8a5a70] font-semibold mb-3 flex flex-col gap-0.5">
				{ROLES.map((r) => (
					<li key={r}>
						<span className="font-extrabold">{ROLE_META[r].label}</span> - {ROLE_META[r].desc}
					</li>
				))}
				<li className="mt-1">
					To find someone&rsquo;s ID: Discord → Settings → Advanced → Developer Mode, then right-click them → Copy User ID.
				</li>
			</ul>

			{mysql ? (
				<form
					className="bg-white rounded-xl border-2 border-[#f5d0e8] p-3 flex flex-wrap items-end gap-2 mb-3"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await putRoles(discordId, newRoles)) setDiscordId("");
					}}
				>
					<label className="flex flex-col gap-0.5">
						<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">Discord user ID</span>
						<input value={discordId} onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ""))} placeholder="123456789012345678" className={inputClass} required />
					</label>
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a70]">Roles</span>
						<div className="flex gap-1 h-[38px] items-center">
							{ROLES.map((r) => (
								<RolePill
									key={r}
									role={r}
									on={newRoles.includes(r)}
									title={clickTitle(newRoles, r)}
									onClick={() => setNewRoles(clickRole(newRoles, r))}
								/>
							))}
						</div>
					</div>
					<button className={buttonClass} disabled={busy || !discordId || newRoles.length === 0}>
						Add
					</button>
				</form>
			) : (
				<ErrorNote error="MySQL isn't configured, so the only roles are admins set with ADMIN_DISCORD_IDS." />
			)}

			{error && <ErrorNote error={error} />}
			{list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
			{!list.data ? (
				<Loading />
			) : (
				<div className="overflow-x-auto bg-white rounded-xl border-2 border-[#f5d0e8]">
					<table className="w-full text-[13px] text-left">
						<thead className="text-[11px] uppercase tracking-wide text-[#8a5a70]">
							<tr>
								{["User", "Roles", "Last login", "Added", "Added by", ""].map((h) => (
									<th key={h} className="px-3 py-2 font-extrabold">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="text-[#3d1a2c] font-semibold">
							{list.data.map((a) => {
								const id = a.user.id;
								const me = id === myId;
								return (
									<tr key={id} className="border-t border-[#f5d0e8]">
										<td className="px-3 py-2">
											<UserCell user={a.user} you={me} />
										</td>
										<td className="px-3 py-2">
											<div className="flex gap-1">
												{ROLES.map((r) => {
													// Admins set by the system, and you, can't lose the admin role
													const lockedAdmin = (a.fromEnv || me) && a.roles.includes("admin");
													return (
														<RolePill
															key={r}
															role={r}
															on={a.roles.includes(r)}
															disabled={!mysql || busy || lockedAdmin}
															title={
																lockedAdmin
																	? a.fromEnv
																		? "Set by system"
																		: "You can't remove your own admin role"
																	: clickTitle(a.roles, r)
															}
															onClick={() => {
																const next = clickRole(a.roles, r);
																if (next.length === 0 && !confirm(`Remove ${a.user.username ?? id}'s last role?`)) return;
																putRoles(id, next);
															}}
														/>
													);
												})}
											</div>
										</td>
										<td className="px-3 py-2 whitespace-nowrap">
											{a.lastLoginAt
												? new Date(a.lastLoginAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
												: "-"}
										</td>
										<td className="px-3 py-2 whitespace-nowrap">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "-"}</td>
										<td className="px-3 py-2">{a.addedBy ? <UserCell user={a.addedBy} you={a.addedBy.id === myId} /> : "-"}</td>
										<td className="px-3 py-2 text-right">
											{a.fromEnv ? "" : !me && mysql ? (
												<button
													className="text-[12px] font-extrabold text-[#c05090] underline disabled:opacity-40"
													disabled={busy}
													onClick={() => {
														if (confirm(`Remove all roles from ${a.user.username ?? id}?`))
															mutate(() => api(`/api/admin/roles/${id}`, { method: "DELETE" }));
													}}
												>
													Remove
												</button>
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
