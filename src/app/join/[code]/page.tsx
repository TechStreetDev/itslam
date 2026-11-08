import type { Metadata } from "next";
import { JoinRedirect } from "@/components/JoinRedirect";

export const metadata: Metadata = {
	title: "ITSLAM Online - Join a game",
	description: "You have been invited to a game of Is That Sheep Looking At Me? - pick a name and join.",
	robots: {index: false, follow: false},
};

// Invite links from the lobby's empty seat. Sends the visitor to the main page, which opens on
// Join with this code filled in.
export default function JoinPage({ params }: { params: { code: string } }) {
	const code = decodeURIComponent(params.code)
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 4);
	return <JoinRedirect code={code} />;
}
