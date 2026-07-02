-- AddColumn: real_protocol on sensors
-- Stores the actual protocol (smb, mysql, ssh, http…) when a honeypot runs
-- in internal/deception mode and its heartbeat reports protocol='deception'.
ALTER TABLE sensors ADD COLUMN real_protocol text;
