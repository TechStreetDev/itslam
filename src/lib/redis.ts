import Redis from "ioredis";

export let redis: Redis | null = null;

export function connectRedis(): void {
	const url = process.env.REDIS_URL;
	if (!url) return;

	redis = new Redis(url, {
		maxRetriesPerRequest: 1,
		connectTimeout: 5000,
	});
	
	redis.on("ready", () => console.log("> Redis connected"));
	redis.on("error", (err) => console.error("[Redis]", err.message));
}
