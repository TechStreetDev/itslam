ALTER TABLE admins
	RENAME TO user_roles,
	DROP COLUMN label,
	ADD COLUMN roles SET('playtester', 'viewer', 'admin') NOT NULL DEFAULT 'admin' AFTER discord_id,
	ADD COLUMN username VARCHAR(100) NULL AFTER roles,
	ADD COLUMN avatar VARCHAR(64) NULL AFTER username,
	ADD COLUMN last_login_at DATETIME NULL AFTER avatar;
