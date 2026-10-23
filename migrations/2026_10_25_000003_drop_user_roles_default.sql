-- Existing rows were all admins; new rows must say which roles they have
ALTER TABLE user_roles ALTER COLUMN roles DROP DEFAULT;
