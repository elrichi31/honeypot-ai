-- KAFKA_LAKE Fase 3b (docs/plans/KAFKA_LAKE.md): native Kafka table engine
-- per topic + a materialized view that parses the raw JSON and inserts into
-- the Fase 3a MergeTree table. Zero extra service — ClickHouse owns offsets
-- and batching. `kafka_format = 'JSONAsString'` (one raw column) instead of
-- JSONEachRow with a typed schema: the four topics carry the exact
-- validated-but-evolving app objects (LakeProducer.tee() call sites), and a
-- typed Kafka-engine schema would break on the next field anyone adds there.
-- Parsing happens once, in the MV's SELECT, with JSONExtract.
--
-- kafka_auto_offset_reset = 'earliest': these are brand-new consumer groups,
-- so this backfills whatever Fase 2 already produced since 2026-07-17 that's
-- still inside Kafka's retention window (days) — free partial history. Full
-- history from Postgres is Sub-fase 3c, not Kafka retention.
--
-- kafka_skip_broken_messages: one malformed message must not stall the
-- consumer (the engine's error handling is coarse — see plan caveat).

CREATE TABLE IF NOT EXISTS honeypot_lake.kafka_cowrie (raw String)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'honeypot.cowrie',
    kafka_group_name = 'clickhouse_lake_cowrie',
    kafka_format = 'JSONAsString',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100,
    kafka_auto_offset_reset = 'earliest';

CREATE TABLE IF NOT EXISTS honeypot_lake.kafka_web (raw String)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'honeypot.web',
    kafka_group_name = 'clickhouse_lake_web',
    kafka_format = 'JSONAsString',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100,
    kafka_auto_offset_reset = 'earliest';

CREATE TABLE IF NOT EXISTS honeypot_lake.kafka_protocol (raw String)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'honeypot.protocol',
    kafka_group_name = 'clickhouse_lake_protocol',
    kafka_format = 'JSONAsString',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100,
    kafka_auto_offset_reset = 'earliest';

CREATE TABLE IF NOT EXISTS honeypot_lake.kafka_suricata (raw String)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'honeypot.suricata',
    kafka_group_name = 'clickhouse_lake_suricata',
    kafka_format = 'JSONAsString',
    kafka_num_consumers = 1,
    kafka_skip_broken_messages = 100,
    kafka_auto_offset_reset = 'earliest';

-- cowrie: raw keys are snake_case (CowrieRawEvent). event_id mirrors
-- IngestService._processLine's `${session}:${eventid}`.
CREATE MATERIALIZED VIEW IF NOT EXISTS honeypot_lake.mv_cowrie_events
TO honeypot_lake.cowrie_events
AS SELECT
    concat(JSONExtractString(raw, 'session'), ':', JSONExtractString(raw, 'eventid')) AS event_id,
    JSONExtractString(raw, 'session')                                   AS session,
    JSONExtractString(raw, 'eventid')                                   AS eventid,
    JSONExtractString(raw, 'sensor')                                    AS sensor_id,
    JSONExtractString(raw, 'src_ip')                                    AS src_ip,
    JSONExtract(raw, 'src_port', 'Nullable(UInt32)')                    AS src_port,
    JSONExtract(raw, 'dst_ip', 'Nullable(String)')                      AS dst_ip,
    JSONExtract(raw, 'dst_port', 'Nullable(UInt32)')                    AS dst_port,
    JSONExtract(raw, 'username', 'Nullable(String)')                    AS username,
    JSONExtract(raw, 'password', 'Nullable(String)')                    AS password,
    JSONExtract(raw, 'input', 'Nullable(String)')                       AS input,
    JSONExtract(raw, 'hassh', 'Nullable(String)')                       AS hassh,
    JSONExtract(raw, 'version', 'Nullable(String)')                     AS version,
    parseDateTime64BestEffort(JSONExtractString(raw, 'timestamp'), 3)   AS timestamp,
    raw                                                                 AS raw
FROM honeypot_lake.kafka_cowrie;

-- web: raw keys are camelCase (WebHit, teed as the validated `d` object).
CREATE MATERIALIZED VIEW IF NOT EXISTS honeypot_lake.mv_web_events
TO honeypot_lake.web_events
AS SELECT
    JSONExtractString(raw, 'eventId')                                   AS event_id,
    JSONExtractString(raw, 'sensorId')                                  AS sensor_id,
    JSONExtractString(raw, 'srcIp')                                     AS src_ip,
    JSONExtractString(raw, 'method')                                    AS method,
    JSONExtractString(raw, 'path')                                      AS path,
    JSONExtractString(raw, 'query')                                     AS query,
    JSONExtractString(raw, 'userAgent')                                 AS user_agent,
    JSONExtractString(raw, 'attackType')                                AS attack_type,
    JSONExtractBool(raw, 'canaryTriggered')                             AS canary_triggered,
    JSONExtract(raw, 'sessionHits', 'Nullable(UInt32)')                 AS session_hits,
    JSONExtract(raw, 'isChainAttack', 'Nullable(UInt8)')                AS is_chain_attack,
    JSONExtract(raw, 'clientFingerprint', 'Nullable(String)')           AS client_fingerprint,
    parseDateTime64BestEffort(JSONExtractString(raw, 'timestamp'), 3)   AS timestamp,
    raw                                                                 AS raw
FROM honeypot_lake.kafka_web;

-- protocol: raw keys are camelCase (protocolEventSchema, teed as `d`).
CREATE MATERIALIZED VIEW IF NOT EXISTS honeypot_lake.mv_protocol_events
TO honeypot_lake.protocol_events
AS SELECT
    JSONExtractString(raw, 'eventId')                                   AS event_id,
    JSONExtractString(raw, 'sensorId')                                  AS sensor_id,
    JSONExtractString(raw, 'protocol')                                  AS protocol,
    JSONExtractString(raw, 'srcIp')                                     AS src_ip,
    JSONExtract(raw, 'srcPort', 'Nullable(UInt32)')                     AS src_port,
    JSONExtractUInt(raw, 'dstPort')                                     AS dst_port,
    JSONExtractString(raw, 'eventType')                                 AS event_type,
    JSONExtract(raw, 'username', 'Nullable(String)')                    AS username,
    JSONExtract(raw, 'password', 'Nullable(String)')                    AS password,
    parseDateTime64BestEffort(JSONExtractString(raw, 'timestamp'), 3)   AS timestamp,
    raw                                                                 AS raw
FROM honeypot_lake.kafka_protocol;

-- suricata: raw keys are snake_case (EveAlert) with a nested `alert` object.
-- No stable per-alert id upstream (see 001-schema.sql) — event_id is derived
-- here from the fields that make an alert unique in practice.
CREATE MATERIALIZED VIEW IF NOT EXISTS honeypot_lake.mv_suricata_alerts
TO honeypot_lake.suricata_alerts
AS SELECT
    hex(cityHash64(sensor_id, toString(timestamp), src_ip, dest_ip, toString(signature_id))) AS event_id,
    sensor_id, src_ip, src_port, dest_ip, dest_port, proto, action,
    signature_id, signature, category, severity, flow_id, timestamp, raw
FROM
(
    SELECT
        JSONExtractString(raw, 'sensor_id')                                 AS sensor_id,
        JSONExtractString(raw, 'src_ip')                                    AS src_ip,
        JSONExtract(raw, 'src_port', 'Nullable(UInt32)')                    AS src_port,
        JSONExtractString(raw, 'dest_ip')                                   AS dest_ip,
        JSONExtract(raw, 'dest_port', 'Nullable(UInt32)')                   AS dest_port,
        JSONExtractString(raw, 'proto')                                     AS proto,
        JSONExtractString(raw, 'alert', 'action')                          AS action,
        JSONExtract(raw, 'alert', 'signature_id', 'UInt32')                 AS signature_id,
        JSONExtractString(raw, 'alert', 'signature')                       AS signature,
        JSONExtractString(raw, 'alert', 'category')                        AS category,
        JSONExtract(raw, 'alert', 'severity', 'UInt8')                      AS severity,
        JSONExtract(raw, 'flow_id', 'Nullable(UInt64)')                     AS flow_id,
        parseDateTime64BestEffort(JSONExtractString(raw, 'timestamp'), 3)   AS timestamp,
        raw
    FROM honeypot_lake.kafka_suricata
);
