-- Players an admin has muted from typed chat (quick responses still work).
-- muted_until NULL means permanent; unmuting deletes the row.
CREATE TABLE chat_mutes (
	discord_id VARCHAR(32) NOT NULL PRIMARY KEY,
	username VARCHAR(100) NULL,
	muted_until DATETIME NULL,
	reason VARCHAR(500) NULL,
	muted_by VARCHAR(32) NOT NULL,
	created_at DATETIME NOT NULL
);
