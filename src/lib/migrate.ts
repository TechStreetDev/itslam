import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import mysql from "mysql2/promise";

// Applies migrations/*.sql in filename order. Name new files
// YYYY_MM_DD_HHMMSS_description.sql (e.g. 2026_11_02_140000_add_rematch_to_games.sql).
// Each migration that runs is recorded in the `migrations` table and is never run again;
// all migrations applied in one startup share a batch number. Don't edit a migration
// once it has been deployed - add a new one instead.
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");
const LOCK_NAME = "itslam_migrations";

export async function runMigrations(url: string): Promise<void> {
	if (!existsSync(MIGRATIONS_DIR)) throw new Error(`Migrations folder not found: ${MIGRATIONS_DIR}`);
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();

	// Dedicated connection: migration files can contain several statements
	const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
	try {
		// Stop two server instances migrating at the same time
		const [[lock]] = (await conn.query("SELECT GET_LOCK(?, 30) AS ok", [LOCK_NAME])) as any;
		if (lock.ok !== 1) throw new Error("Timed out waiting for the migration lock");

		await conn.query(`CREATE TABLE IF NOT EXISTS migrations (
			id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			migration VARCHAR(255) NOT NULL UNIQUE,
			batch INT UNSIGNED NOT NULL,
			ran_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`);
		const [rows] = await conn.query("SELECT migration FROM migrations");
		const ran = new Set((rows as { migration: string }[]).map((r) => r.migration));
		const pending = files.filter((f) => !ran.has(f.replace(/\.sql$/, "")));
		if (pending.length === 0) return;

		const [[{ batch }]] = (await conn.query("SELECT COALESCE(MAX(batch), 0) + 1 AS batch FROM migrations")) as any;
		for (const file of pending) {
			const name = file.replace(/\.sql$/, "");
			// MySQL DDL can't be rolled back, so if a file fails part-way its earlier
			// statements stay applied - keep each migration to one change.
			await conn.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
			await conn.query("INSERT INTO migrations (migration, batch) VALUES (?, ?)", [name, batch]);
			console.log(`> Migrated: ${name}`);
		}
	} finally {
		await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => {});
		await conn.end().catch(() => {});
	}
}
