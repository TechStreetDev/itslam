-- Everyone who has ever logged in with Discord, so admins can find players and their games.
-- Unlike `logins` (pruned after 90 days) this keeps one row per account.
CREATE TABLE users (
	discord_id VARCHAR(32) NOT NULL PRIMARY KEY,
	username VARCHAR(100) NOT NULL,
	avatar VARCHAR(64) NULL,
	first_login_at DATETIME NOT NULL,
	last_login_at DATETIME NOT NULL,
	INDEX idx_users_last_login (last_login_at),
	INDEX idx_users_username (username)
);
