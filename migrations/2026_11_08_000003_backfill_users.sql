-- Fill users from what we already know: recent logins first (latest name and avatar),
-- then role holders and signed-in game seats whose logins have since been pruned
INSERT INTO users (discord_id, username, avatar, first_login_at, last_login_at)
SELECT l.discord_id, l.username, l.avatar, f.first_at, l.created_at
FROM logins l
JOIN (SELECT discord_id, MAX(id) AS last_id, MIN(created_at) AS first_at FROM logins GROUP BY discord_id) f
	ON f.last_id = l.id;

INSERT IGNORE INTO users (discord_id, username, avatar, first_login_at, last_login_at)
SELECT discord_id, username, avatar, last_login_at, last_login_at
FROM user_roles
WHERE username IS NOT NULL AND last_login_at IS NOT NULL;

INSERT IGNORE INTO users (discord_id, username, avatar, first_login_at, last_login_at)
SELECT p.discord_id, MAX(p.username), NULL, MIN(g.started_at), MAX(g.started_at)
FROM game_players p JOIN games g ON g.id = p.game_id
WHERE p.discord_id IS NOT NULL
GROUP BY p.discord_id;
