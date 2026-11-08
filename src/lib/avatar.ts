// A Discord user's avatar image, or Discord's default one for accounts without one
export function avatarUrl(id: string, avatar: string | null, size = 32): string {
	if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=${size}`;
	const idx = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
	return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
