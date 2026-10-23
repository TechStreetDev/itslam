CREATE TABLE logins (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	discord_id VARCHAR(32) NOT NULL,
	username VARCHAR(100) NOT NULL,
	avatar VARCHAR(64) NULL,
	is_admin BOOLEAN NOT NULL DEFAULT FALSE,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_logins_created (created_at),
	INDEX idx_logins_user (discord_id)
);
