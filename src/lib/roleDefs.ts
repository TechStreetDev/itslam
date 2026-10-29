// Shared between the server (permission checks) and the admin UI (labels)

// Lowest to highest - each role includes every role before it
export const ROLES = ["playtester", "moderator", "viewer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
	| "hidden_packs" // switch on card packs marked hidden in deck.ts
	| "add_bots" // add bot players to lobbies they host
	| "view_stats" // see statistics in /admin
	| "manage" // delete games, use the explorer, manage roles
	| "moderate_chat"; // review chat reports and mute players

export const ROLE_META: Record<Role, { label: string; desc: string; permissions: Permission[] }> = {
	playtester: {
		label: "Playtester",
		desc: "Can use hidden card packs and add bots in their lobbies.",
		permissions: ["hidden_packs", "add_bots"],
	},
	moderator: {
		label: "Moderator",
		desc: "Playtester, plus reviewing chat reports and muting players.",
		permissions: ["moderate_chat"],
	},
	viewer: {
		label: "Viewer",
		desc: "Moderator, plus viewing statistics in the admin area.",
		permissions: ["view_stats"],
	},
	admin: {
		label: "Admin",
		desc: "Viewer, plus deleting games, the explorer and managing roles.",
		permissions: ["manage"],
	},
};

// Fills in every role below the highest one given
export function withLowerRoles(roles: readonly string[]): Role[] {
	const top = Math.max(-1, ...roles.map((r) => ROLES.indexOf(r as Role)));
	return ROLES.slice(0, top + 1);
}

// Can open /admin at all - moderators only get the Reports tab
export function canOpenAdmin(permissions: readonly Permission[]): boolean {
	return permissions.includes("view_stats") || permissions.includes("moderate_chat");
}

export function permissionsFor(roles: readonly Role[]): Permission[] {
	return [...new Set(withLowerRoles(roles).flatMap((r) => ROLE_META[r].permissions))];
}
