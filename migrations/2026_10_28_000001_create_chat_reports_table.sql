-- Player reports of typed chat messages. context holds the lobby's recent chat
-- (up to 100 messages, with the Discord ID behind each typed one) at the time of the report.
CREATE TABLE chat_reports (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	created_at DATETIME NOT NULL,
	status ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
	reason VARCHAR(32) NOT NULL,
	details VARCHAR(500) NULL,
	lobby_code VARCHAR(16) NOT NULL,
	message_id VARCHAR(32) NOT NULL,
	message_text VARCHAR(255) NOT NULL,
	reported_discord_id VARCHAR(32) NOT NULL,
	reported_name VARCHAR(100) NOT NULL,
	reporter_discord_id VARCHAR(32) NULL,
	reporter_name VARCHAR(100) NOT NULL,
	context JSON NOT NULL,
	resolved_by VARCHAR(32) NULL,
	resolved_at DATETIME NULL,
	resolution_note VARCHAR(500) NULL,
	INDEX idx_chat_reports_status (status, created_at),
	INDEX idx_chat_reports_reported (reported_discord_id)
);
