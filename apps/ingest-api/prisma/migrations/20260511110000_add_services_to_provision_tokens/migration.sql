ALTER TABLE "sensor_provision_tokens"
  ADD COLUMN "services" TEXT NOT NULL DEFAULT 'ssh,http,ftp,mysql,port';
