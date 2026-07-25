# ITSLAM - Online Edition

An online multiplayer adaptation of **[Is That Sheep Looking At Me? The Card Game](https://www.kickstarter.com/projects/creocards/is-that-sheep-looking-at-me-the-card-game/creator)**, originally designed by **[Zedaph](https://www.youtube.com/@Zedaph)** and published by **[Creo Cards](https://www.kickstarter.com/projects/creocards/is-that-sheep-looking-at-me-the-card-game/creator)**.

> This is an unofficial fan-made digital adaptation. The original card game, its characters, and its rules are the creative work of Zedaph and Creo Cards.

## What is ITSLAM?

Is That Sheep Looking At Me? is a light, chaotic card game designed by Minecraft content creator Zedaph and brought to life by Creo Cards through Kickstarter. Players compete to build the biggest and most valuable **flock of sheep** by pairing Head cards with Butt cards - while sabotaging each other with action cards and high-stakes coin-flip Challenges.

This web app adapts those mechanics for **real-time online play**: create a lobby, share a 4-letter code, and your friends join from any browser - no download, no account.

Built with **Next.js, TypeScript & Tailwin**, with a custom Node server that attaches **Socket.IO & IORedis** for real-time lobbies.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, create a lobby, and share the 4-letter code with friends on other devices on the same network (or deploy it - see below - to play over the internet).

For a production-style run:

```bash
npm run build
npm start
```