import type { Metadata } from "next";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = {
	title: "Admin - ITSLAM Online",
	robots: { index: false, follow: false },
};

export default function AdminPage() {
	return <AdminDashboard />;
}
