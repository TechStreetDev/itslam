-- Signed-in players' Discord account and name at the time of the game, so they can see
-- their own stats and history. NULL for bots, signed-out players and older games.
ALTER TABLE game_players
	ADD COLUMN discord_id VARCHAR(32) NULL AFTER was_replaced,
	ADD COLUMN username VARCHAR(100) NULL AFTER discord_id,
	ADD INDEX idx_players_discord (discord_id, game_id);
