// Shared between the server (permission checks) and the admin UI (labels)

// Lowest to highest - each role includes every role before it
export const ROLES = ["playtester", "viewer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
	| "hidden_packs" // switch on card packs marked hidden in deck.ts
	| "view_stats" // open /admin and see statistics
	| "manage"; // delete games, use the explorer, manage roles

export const ROLE_META: Record<Role, { label: string; desc: string; permissions: Permission[] }> = {
	playtester: {
		label: "Playtester",
		desc: "Can use hidden card packs in their lobbies.",
		permissions: ["hidden_packs"],
	},
	viewer: {
		label: "Viewer",
		desc: "Playtester, plus viewing statistics in the admin area.",
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

export function permissionsFor(roles: readonly Role[]): Permission[] {
	return [...new Set(withLowerRoles(roles).flatMap((r) => ROLE_META[r].permissions))];
}
