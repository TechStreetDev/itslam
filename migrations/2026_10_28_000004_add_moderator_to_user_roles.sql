-- Moderator sits between playtester and viewer: playtester perks plus chat moderation
ALTER TABLE user_roles
	MODIFY COLUMN roles SET('playtester', 'moderator', 'viewer', 'admin') NOT NULL;
