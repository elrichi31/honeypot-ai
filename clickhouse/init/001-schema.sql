-- KAFKA_LAKE Fase 3a (docs/plans/KAFKA_LAKE.md): one MergeTree table per
-- source, mirroring the raw event each Kafka topic carries (see
-- apps/ingest-api/src/lib/lake-producer.ts tee() call sites). ReplacingMergeTree
-- dedups on event_id since the Kafka consumer (Fase 3b) is at-least-once.
-- `raw` keeps the full validated event as JSON — no normalization layer here,
-- per YAGNI in the plan; add typed columns later only if a query needs one
-- that isn't here yet.

CREATE DATABASE IF NOT EXISTS honeypot_lake;

CREATE TABLE IF NOT EXISTS honeypot_lake.cowrie_events
(
    event_id  String,       -- `${session}:${eventid}`, see IngestService._processLine
    session   String,
    eventid   LowCardinality(String),
    sensor_id LowCardinality(String) DEFAULT '',
    src_ip    String,
    src_port  Nullable(UInt32),
    dst_ip    Nullable(String),
    dst_port  Nullable(UInt32),
    username  Nullable(String),
    password  Nullable(String),
    input     Nullable(String),  -- shell command, cowrie's `input` field
    hassh     Nullable(String),
    version   Nullable(String),  -- SSH client version string
    timestamp DateTime64(3),
    raw       String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, src_ip, event_id);

CREATE TABLE IF NOT EXISTS honeypot_lake.web_events
(
    event_id           String,  -- WebHit.eventId
    sensor_id          LowCardinality(String) DEFAULT '',
    src_ip             String,
    method             LowCardinality(String),
    path               String,
    query              String,
    user_agent         String,
    attack_type        LowCardinality(String),
    canary_triggered   UInt8,
    session_hits       Nullable(UInt32),
    is_chain_attack    Nullable(UInt8),
    client_fingerprint Nullable(String),
    timestamp          DateTime64(3),
    raw                String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, src_ip, event_id);

CREATE TABLE IF NOT EXISTS honeypot_lake.protocol_events
(
    event_id   String,  -- protocolEventSchema.eventId (galah/port/mysql/ftp/smb)
    sensor_id  LowCardinality(String) DEFAULT '',
    protocol   LowCardinality(String),
    src_ip     String,
    src_port   Nullable(UInt32),
    dst_port   UInt32,
    event_type LowCardinality(String),
    username   Nullable(String),
    password   Nullable(String),
    timestamp  DateTime64(3),
    raw        String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, src_ip, event_id);

-- Suricata alerts carry no stable per-alert id (LakeProducer.tee is called
-- with key=undefined in SuricataService.persistAlerts — see the plan's Fase 3a
-- notes). event_id is left a plain column here; Fase 3b's Kafka->table
-- materialized view derives it deterministically
-- (hex(cityHash64(sensor_id, timestamp, src_ip, dest_ip, signature_id))) before
-- insert, so ReplacingMergeTree can still dedup an at-least-once Kafka replay.
CREATE TABLE IF NOT EXISTS honeypot_lake.suricata_alerts
(
    event_id     String,
    sensor_id    LowCardinality(String) DEFAULT '',
    src_ip       String,
    src_port     Nullable(UInt32),
    dest_ip      String,
    dest_port    Nullable(UInt32),
    proto        LowCardinality(String),
    action       LowCardinality(String),
    signature_id UInt32,
    signature    String,
    category     String,
    severity     UInt8,
    flow_id      Nullable(UInt64),
    timestamp    DateTime64(3),
    raw          String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, src_ip, event_id);
