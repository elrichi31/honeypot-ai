-- KAFKA_LAKE Sub-fase 3c (docs/plans/KAFKA_LAKE.md): one-time backfill of
-- ClickHouse from the Postgres history that predates the Kafka tee (Fase 2,
-- live since 2026-07-17) and/or falls outside Kafka's retention window. Run
-- via scripts/backfill-clickhouse.sh, which passes {pg_password:String} as a
-- client query parameter so the password never lands in this committed file.
--
-- Safe to re-run: every target table is ReplacingMergeTree keyed on
-- event_id — duplicates from re-running (or from overlap with rows the live
-- Kafka consumer already inserted) collapse on the next background merge,
-- no need to delete anything first.
--
-- Reads via ClickHouse's postgresql() table function against
-- postgres-replica (not the primary), so this never touches the write path.
--
-- max_insert_block_size matches the 65536 used by the live Kafka consumer
-- (clickhouse/init/002-kafka-consumer.sql), same reason: keep each insert's
-- peak memory bounded (see incident #6 in the plan — don't repeat it here
-- with a much bigger one-shot batch).
SET max_insert_block_size = 65536;

-- cowrie_events: Postgres `events.raw_json` already holds the exact same raw
-- teed-to-Kafka payload, so this reuses mv_cowrie_events' parsing verbatim —
-- just swap the source from Kafka to postgresql().
INSERT INTO honeypot_lake.cowrie_events
SELECT
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
FROM
(
    SELECT toString(raw_json) AS raw
    FROM postgresql('postgres-replica:5432', 'honeypot_prod', 'events', 'honeypot', {pg_password:String})
);

-- web_events: web_hits already has typed columns for everything the target
-- table needs — no raw JSON to parse. `raw` is left empty for backfilled
-- rows: it's an audit/debug convenience field (per the plan's "no
-- normalization layer" call), not used by any query — the typed columns
-- carry everything analytics needs.
INSERT INTO honeypot_lake.web_events
SELECT
    event_id,
    coalesce(sensor_id, '')                  AS sensor_id,
    src_ip,
    method,
    path,
    query,
    user_agent,
    attack_type,
    CAST(canary_triggered AS UInt8)          AS canary_triggered,
    CAST(session_hits AS Nullable(UInt32))   AS session_hits,
    CAST(is_chain_attack AS Nullable(UInt8)) AS is_chain_attack,
    client_fingerprint,
    timestamp,
    ''                                        AS raw
FROM postgresql('postgres-replica:5432', 'honeypot_prod', 'web_hits', 'honeypot', {pg_password:String});

-- protocol_events: same story as web_events — protocol_hits has typed
-- columns for everything the table needs; `raw` stays empty.
INSERT INTO honeypot_lake.protocol_events
SELECT
    event_id,
    coalesce(sensor_id, '')            AS sensor_id,
    protocol,
    src_ip,
    CAST(src_port AS Nullable(UInt32)) AS src_port,
    CAST(dst_port AS UInt32)           AS dst_port,
    event_type,
    username,
    password,
    timestamp,
    ''                                  AS raw
FROM postgresql('postgres-replica:5432', 'honeypot_prod', 'protocol_hits', 'honeypot', {pg_password:String});

-- suricata_alerts: no stable id upstream either (same as the live MV) — the
-- event_id is derived identically to mv_suricata_alerts so backfilled and
-- live rows dedupe against each other on overlap instead of double-counting.
INSERT INTO honeypot_lake.suricata_alerts
SELECT
    hex(cityHash64(sensor_id, toString(timestamp), src_ip, dest_ip, signature_id)) AS event_id,
    sensor_id,
    src_ip,
    CAST(src_port AS Nullable(UInt32))  AS src_port,
    dest_ip,
    CAST(dest_port AS Nullable(UInt32)) AS dest_port,
    proto,
    action,
    CAST(signature_id AS UInt32)        AS signature_id,
    signature,
    category,
    CAST(severity AS UInt8)             AS severity,
    CAST(flow_id AS Nullable(UInt64))   AS flow_id,
    timestamp,
    ''                                   AS raw
FROM postgresql('postgres-replica:5432', 'honeypot_prod', 'suricata_alerts', 'honeypot', {pg_password:String});
