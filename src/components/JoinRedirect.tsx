"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { stashInvite } from "@/lib/invite";

// Hands the code to the main page and goes there - replace, so Back skips this page
export function JoinRedirect({ code }: { code: string }) {
	const router = useRouter();
	useEffect(() => {
		if (code) stashInvite(code);
		router.replace("/");
	}, [code, router]);
	return (
		<div className="fixed inset-0 flex items-center justify-center">
			<div className="w-10 h-10 rounded-full border-4 border-white border-t-transparent animate-spin" />
		</div>
	);
}
