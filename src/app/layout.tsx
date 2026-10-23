import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";

// Self-hosted at build time - Discord Activities block requests to Google Fonts
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nunito" });
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-baloo" });

export const metadata: Metadata = {
	title: "ITSLAM - Is That Sheep Looking At Me? Online",
	description: "Play Is That Sheep Looking At Me? online with friends - the chaotic sheep card game by Zedaph and Creo Cards. Build a flock, flip coins, and sabotage rivals in real time. No download, no account required. Just share a 4-letter code.",
	keywords: ["ITSLAM", "Is That Sheep Looking At Me", "card game", "online multiplayer", "Zedaph", "Creo Cards", "sheep game", "browser game"],
	metadataBase: new URL("https://itslam.online"),
	alternates: {canonical: "/"},
	robots: {index: true, follow: true},
	openGraph: {
		title: "ITSLAM - Is That Sheep Looking At Me? Online",
		description: "Build a flock, flip coins, and sabotage rivals in real time. No download, no account - just share a 4-letter code and play.",
		type: "website",
		url: "https://itslam.online",
		siteName: "ITSLAM Online",
	},
	twitter: {
		card: "summary",
		title: "ITSLAM - Is That Sheep Looking At Me? Online",
		description: "Build a flock, flip coins, and sabotage rivals in real time. No download, no account - just share a 4-letter code and play.",
	},
	icons: {
		apple: "/favicon-32x32.png",
		icon: [
			{url: "/favicon-16x16.png", sizes: "16x16", type: "image/png"},
			{url: "/favicon-32x32.png", sizes: "32x32", type: "image/png"},
		],
		other: [
			{rel: "manifest", url: "/site.webmanifest"},
			{rel: "android-chrome-192x192", url: "/android-chrome-192x192.png"},
			{rel: "android-chrome-512x512", url: "/android-chrome-512x512.png"},
		],
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
	return (
		<html lang="en" className={`${nunito.variable} ${baloo.variable}`}>
			<body>{children}</body>
		</html>
	);
}
