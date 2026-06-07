-- Split SSH session retention by value: sessions where the attacker actually got
-- in (login_success = true) carry the real intelligence (post-auth commands,
-- malware drops) and are kept far longer than failed brute-force/scan sessions,
-- which are already distilled permanently into the daily_* rollups.
--
-- 'sessions_compromised' is a LOGICAL config key, not a real table. The retention
-- job maps it back to the real "sessions" table, filtering by login_success.
-- It only exists so the 90-day window is editable from the dashboard like any
-- other retention row.

INSERT INTO "retention_settings" (id, table_name, label, retention_days, enabled)
VALUES ('ret-sessions-compromised', 'sessions_compromised', 'SSH Sessions (comprometidas)', 90, true)
ON CONFLICT (table_name) DO NOTHING;

-- The existing 'sessions' row now governs ONLY failed sessions (login_success
-- false/null), kept at the short 7-day window.
UPDATE "retention_settings"
  SET label = 'SSH Sessions (fallidas)', retention_days = 7, updated_at = now()
  WHERE table_name = 'sessions';
