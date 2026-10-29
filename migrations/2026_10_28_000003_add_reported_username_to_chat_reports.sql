-- The reported player's Discord username at the time, alongside their in-game name
ALTER TABLE chat_reports
	ADD COLUMN reported_username VARCHAR(100) NULL AFTER reported_name;
