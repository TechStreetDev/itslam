import mysql from "mysql2/promise";
import { runMigrations } from "./migrate";

export let db: mysql.Pool | null = null;

export async function connectDb(): Promise<void> {
	const url = process.env.MYSQL_URL;
	if (!url) return;

	const pool = mysql.createPool({
		uri: url,
		connectionLimit: 5,
		timezone: "Z",
		supportBigNumbers: true,
		decimalNumbers: true,
	});
	try {
		await runMigrations(url);
		db = pool;
		console.log("> MySQL connected");
	} catch (e) {
		console.error("[MySQL] connection/migration failed - game history disabled:", (e as Error).message);
		await pool.end().catch(() => {});
		return;
	}
}
