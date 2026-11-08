// Discord display names can hold anything - squeeze them into the lobby's name rules
// (3-19 letters, numbers and spaces), adding a number if someone already has it
export function discordPlayerName(username: string, taken: Iterable<string> = []): string {
	let base = username.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 19);
	if (base.length < 3) base = "Shepherd";
	const takenLower = new Set([...taken].map((n) => n.toLowerCase()));
	let name = base;
	for (let i = 2; takenLower.has(name.toLowerCase()); i++) {
		const suffix = ` ${i}`;
		name = base.slice(0, 19 - suffix.length) + suffix;
	}
	return name;
}
