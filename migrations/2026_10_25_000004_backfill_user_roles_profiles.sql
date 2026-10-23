-- Cache each role holder's Discord name and avatar from their most recent login
UPDATE user_roles r
JOIN logins l ON l.id = (SELECT MAX(l2.id) FROM logins l2 WHERE l2.discord_id = r.discord_id)
SET r.username = l.username, r.avatar = l.avatar, r.last_login_at = l.created_at;
