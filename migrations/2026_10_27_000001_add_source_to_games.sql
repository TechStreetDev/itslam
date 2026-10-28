-- Where the game was played. NULL for games recorded before this was tracked.
ALTER TABLE games
	ADD COLUMN source VARCHAR(16) NULL AFTER is_public;
